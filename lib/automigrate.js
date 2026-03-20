/* eslint-disable no-param-reassign */

const fs = require('fs');
const helper = require('./index/helper');

const APPENDED_KEY = '__appended__';

function createSchemaRecorder() {
  const appended = [];
  return new Proxy({}, {
    get(target, method) {
      if (method === APPENDED_KEY) {
        return appended;
      }

      if (typeof method !== 'string' || method === 'constructor') {
        return undefined;
      }

      return function recordedCall(a, b, c) {
        const child = createSchemaRecorder();
        appended.push([child, method, [a, b, c]]);
        return child;
      };
    },
  });
}

async function applyFulltextIndexesWithParser(knex, tableName, indexes) {
  await Promise.all(indexes.map(async (index) => {
    const bindings = [tableName, index.name, ...index.columns];
    const columns = index.columns.map(() => '??').join(', ');

    let sql = `ALTER TABLE ?? ADD FULLTEXT INDEX ?? (${columns})`;

    if (index.options.parser) {
      sql += ' WITH PARSER ??';
      bindings.push(index.options.parser);
    }

    await knex.raw(sql, bindings);
  }));
}

function resolveMethodAction(method, args, depth, context) {
  const {
    existIndexes, schemaIndexes, fulltextIndexesWithParser, columnName,
  } = context;

  if ((method === 'increments' || method === 'bigIncrements') && existIndexes.pk.length > 0) {
    return 'skip';
  }

  if (method === 'index') {
    schemaIndexes.key.push(typeof args[0] === 'string' ? [args[0]] : args[0]);

    if (existIndexes.isIndexExists(args[0], args[1])) {
      return 'skip';
    }

    if (args.length > 2 && args[2] && args[2].indexType === 'FULLTEXT' && args[2].parser) {
      fulltextIndexesWithParser.push({ columns: args[0], name: args[1], options: args[2] });
      return 'skip';
    }
  }

  if (method === 'references') {
    schemaIndexes.fk.push([columnName, typeof args[0] === 'string' ? [args[0]] : args[0]]);

    if (existIndexes.isForeignKeyExists(columnName, args[0])) {
      return 'no-apply';
    }
  }

  if (method === 'unique') {
    const keys = args[0] || columnName;
    schemaIndexes.uk.push(typeof keys === 'string' ? [keys] : keys);

    if (existIndexes.isUniqueExists(args[0] || columnName)) {
      return depth === 0 ? 'skip' : 'no-apply';
    }
  }

  if (method === 'primary') {
    const keys = args[0] || columnName;
    schemaIndexes.pk.push(typeof keys === 'string' ? [keys] : keys);

    if (existIndexes.isPrimaryKeyExists(args[0] || columnName)) {
      return depth === 0 ? 'skip' : 'no-apply';
    }
  }

  return 'apply';
}

function processSchemaEntry(builder, entry, depth, context) {
  if (!entry || !entry[0]) return null;

  const [childProxy, method, args] = entry;

  if (depth === 0) {
    context.columnName = args[0];
    context.schemaColumns[args[0]] = true;
  }

  const action = resolveMethodAction(method, args, depth, context);

  if (action === 'skip') return builder;

  if (action === 'apply') {
    builder = builder[method](...args);
  }

  childProxy[APPENDED_KEY].forEach((childEntry) => {
    builder = processSchemaEntry(builder, childEntry, depth + 1, context);
  });

  if (depth === 0) {
    if (method !== 'foreign' && method !== 'index' && method !== 'unique') {
      if (context.existColumns[context.columnName]) {
        builder.alter();
      } else if (context.prevColumnName) {
        builder = builder.after(context.prevColumnName);
      } else {
        builder = builder.first();
      }
    }

    context.prevColumnName = context.columnName;
  }

  return builder;
}

module.exports = async function Automigrate(opts) {
  opts = opts || {};

  const knex = require('knex')(opts.config); // eslint-disable-line global-require

  try {
    // TODO: Migration PK (Y,N)
    // TODO: Migration Indexes (Y,N)
    // TODO: Migration Unique Attr. (Y,N)
    // TODO: Migration Reference Attr. (Y,N)

    const migrateTable = async function migrateTable(tableName, fn, initRows) {
      const exists = await knex.schema.hasTable(tableName);

      if (!exists) {
        const fulltextIndexesWithParser = [];

        await knex.schema.createTable(tableName, (table) => {
          const customTable = Object.create(table);

          customTable.index = function indexWithParser(columns, name, options) {
            if (options && options.indexType === 'FULLTEXT' && options.parser) {
              fulltextIndexesWithParser.push({ columns, name, options });
              return this;
            }

            return table.index.call(this, columns, name, options);
          };

          fn(customTable);
        });

        await applyFulltextIndexesWithParser(knex, tableName, fulltextIndexesWithParser);
      } else {
        const existColumns = await knex.from(tableName).columnInfo();
        const existIndexes = await (require('./index')(knex, tableName)); // eslint-disable-line global-require
        const schemaColumns = {};
        const schemaIndexes = {
          pk: [], uk: [], key: [], fk: [],
        };
        const fulltextIndexesWithParser = [];

        await knex.schema.alterTable(tableName, (table) => {
          const recorder = createSchemaRecorder();
          fn(recorder);

          const context = {
            schemaColumns,
            schemaIndexes,
            existColumns,
            existIndexes,
            fulltextIndexesWithParser,
            columnName: undefined,
            prevColumnName: undefined,
          };

          recorder[APPENDED_KEY].forEach((entry) => {
            processSchemaEntry(table, entry, 0, context);
          });

          // Drop unused columns.
          const dropColumns = [];

          Object.keys(existColumns).forEach((col) => {
            if (!schemaColumns[col]) {
              Object.keys(existIndexes.fk).forEach((key) => {
                if (helper.isArrayEqual([col], existIndexes.fk[key].key)) {
                  table.dropForeign(undefined, key);
                }
              });

              dropColumns.push(col);
            }
          });

          if (dropColumns.length > 0) {
            if (opts.config.safe) {
              if (opts.verbose !== false) {
                /* eslint-disable no-console */
                console.warn(`* [Skip Drop Column${dropColumns.length > 1 ? 's' : ''}] \`${tableName}\``);
                console.warn(`  ${'-'.repeat(20)}`);
                console.warn(`  ALTER TABLE \`${tableName}\` \n    ${dropColumns.map((c) => `DROP COLUMN \`${c}\``).join(',\n    ')};`);
                console.warn(`  ${'-'.repeat(20)}`);
              }
            } else {
              table.dropColumns(dropColumns);
            }
          }

          // Drop unused indexes.
          Object.keys(existIndexes.key).forEach((key) => {
            const existKey = existIndexes.key[key];
            let found = schemaIndexes.key.some((sKey) => helper.isArrayEqual(existKey, sKey));

            if (!found) {
              found = schemaIndexes.fk.some((sKey) => {
                const normalized = typeof sKey[0] === 'string' ? [sKey[0]] : sKey[0];
                return helper.isArrayEqual(existKey, normalized);
              });
            }

            if (!found) {
              table.dropIndex(undefined, key);
            }
          });

          Object.keys(existIndexes.uk).forEach((key) => {
            const found = schemaIndexes.uk.some((sKey) => helper.isArrayEqual(existIndexes.uk[key], sKey));

            if (!found) {
              table.dropUnique(undefined, key);
            }
          });
        });

        await applyFulltextIndexesWithParser(knex, tableName, fulltextIndexesWithParser);
      }

      if (typeof initRows === 'function') {
        const existRows = (await knex.count('* AS cnt').from(tableName))[0].cnt;

        if (!existRows) {
          const rows = initRows(opts.config);

          if (rows && rows.length) {
            await knex.batchInsert(tableName, rows);
          }
        }
      }

      return tableName;
    };

    const migrateView = async function migrateView(viewName, fn) {
      const exists = (await knex('INFORMATION_SCHEMA.TABLES').select('TABLE_SCHEMA', 'TABLE_TYPE').where({
        TABLE_SCHEMA: opts.config.connection.database,
        TABLE_NAME: viewName,
      }))[0];

      if (exists && exists.TABLE_TYPE === 'BASE TABLE') {
        throw new Error(`* ${viewName} must be a view, but a table already exists with this name.`);
      }

      if (!exists) {
        await knex.schema.createView(viewName, (view) => {
          fn(view);
        });
      } else {
        const recorder = createSchemaRecorder();
        fn(recorder);

        const { schemaColumns } = recorder[APPENDED_KEY].reduce((acc, cur) => {
          if (cur[1] === 'columns') {
            if (acc.schemaColumns) throw new Error('Only one "columns" can be used.');

            acc.schemaColumns = cur[2][0];
          }

          if (cur[1] === 'as') {
            if (acc.schemaAs) throw new Error('Only one "as" can be used.');

            acc.schemaAs = cur[2][0];
          }

          return acc;
        }, {
          schemaColumns: null,
          schemaAs: null,
        });

        const existColumns = await knex.from(viewName).columnInfo();
        const dropColumns = Object.keys(existColumns)
          .filter((existColumn) => schemaColumns && !schemaColumns.includes(existColumn));

        if (dropColumns.length > 0) {
          if (opts.verbose !== false) {
            /* eslint-disable no-console */
            console.warn(`* [Drop Column${dropColumns.length > 1 ? 's' : ''}] \`${viewName}\``);
            console.warn(`  ${'-'.repeat(20)}`);
            console.warn(`  ALTER VIEW \`${viewName}\` \n    ${dropColumns.map((c) => `DROP COLUMN \`${c}\``).join(',\n    ')};`);
            console.warn(`  ${'-'.repeat(20)}`);
          }
        }

        await knex.schema.createViewOrReplace(viewName, (view) => {
          fn(view);
        });
      }

      return viewName;
    };

    const migrations = {
      tables: [],
      views: [],
    };

    opts.path = opts.cwd || process.cwd();

    const tableMigrator = (a, b, c) => ({
      call: async () => migrateTable(a, b, c),
    });

    const viewMigrator = (a, b) => ({
      call: async () => migrateView(a, b),
    });

    fs.readdirSync(opts.path).forEach((name) => {
      if (name.slice(0, 6) !== 'table_' && name.slice(0, 5) !== 'view_') return;

      const isTable = name.slice(0, 6) === 'table_';

      // eslint-disable-next-line global-require, import/no-dynamic-require
      require(`${opts.path}/${name}`).auto(isTable ? tableMigrator : viewMigrator, knex).forEach((entry) => {
        if (isTable) {
          migrations.tables.push([name, entry]);
        } else {
          migrations.views.push([name, entry]);
        }
      });
    });

    if (opts.tables) {
      migrations.tables.push(...opts.tables(tableMigrator, knex).map((table) => ['table_on_demand', table]));
    }

    if (opts.views) {
      migrations.views.push(...opts.views(viewMigrator, knex).map((view) => ['view_on_demand', view]));
    }

    const convert = (type) => type.charAt(0).toUpperCase() + type.slice(1, -1);

    // eslint-disable-next-line no-restricted-syntax
    for (const type of Object.keys(migrations)) {
      if (migrations[type].length > 0) {
        for (let i = 0; i < migrations[type].length; i += 1) {
          try {
            const res = await migrations[type][i][1].call(); // eslint-disable-line no-await-in-loop

            if (opts.verbose !== false) {
              console.info(`* ${convert(type)} \`${res}\` has been migrated.`); // eslint-disable-line no-console
            }
          } catch (err) {
            if (opts.verbose !== false) {
              console.error(`* ${convert(type)} \`${migrations[type][i][0]}\` migration failed.`); // eslint-disable-line no-console
            }

            throw err;
          }
        }
      } else {
        console.info(`* No ${convert(type)} schema exist.`); // eslint-disable-line no-console
      }
    }
  } finally {
    await knex.destroy();
  }
};
