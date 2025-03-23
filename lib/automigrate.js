/* eslint-disable no-param-reassign */

const fs = require('fs');
const helper = require('./index/helper');

module.exports = function Automigrate(opts) {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    opts = opts || {};

    const knex = require('knex')(opts.config); // eslint-disable-line global-require

    // TODO: Migration PK (Y,N)
    // TODO: Migration Indexes (Y,N)
    // TODO: Migration Unique Attr. (Y,N)
    // TODO: Migration Reference Attr. (Y,N)

    const tabler = function tabler() {
      const appended = [];
      return new Proxy({}, {
        get(target, method) {
          if (method === '__appended__') {
            return appended;
          }

          if (typeof (method) !== 'string' || ['constructor'].indexOf(method) !== -1) {
            return undefined;
          }

          return function tablerProxy(a, b, c) {
            const proxy = tabler();
            appended.push([proxy, method, [a, b, c]]);
            return proxy;
          };
        },
      });
    };

    const migrateTable = async function migrator(tableName, fn, initRows) {
      const exists = await knex.schema.hasTable(tableName);

      if (!exists) {
        await knex.schema.createTable(tableName, (table) => {
          fn(table);
        });
      } else {
        const existColumns = await knex.from(tableName).columnInfo();
        const existIndexes = await (require('./index')(knex, tableName)); // eslint-disable-line global-require
        const schemaColumns = {};
        const schemaIndexes = {
          pk: [], uk: [], key: [], fk: [],
        };

        await knex.schema.alterTable(tableName, (table) => {
          let prevColumnName;
          let columnName;
          const proxy = tabler();
          fn(proxy);

          const column = function column(t, e, depth) {
            if (!e || !e[0]) return null;

            const method = e[1];
            const args = e[2];

            if (depth === 0) {
              columnName = e[2][0];
              schemaColumns[columnName] = true;
            }

            // If exists primary key already.
            if ((method === 'increments' || method === 'bigIncrements') && existIndexes.pk.length > 0) {
              return t;
            }

            if (method === 'index') {
              schemaIndexes.key.push(typeof (args[0]) === 'string' ? [args[0]] : args[0]);

              // If exists index already.
              if (existIndexes.isIndexExists(args[0], args[1])) {
                return t;
              }
            }

            let isAppliable = true;

            if (method === 'references') {
              schemaIndexes.fk.push([columnName, typeof (args[0]) === 'string' ? [args[0]] : args[0]]);

              // If exists foreign key already.
              if (existIndexes.isForeignKeyExists(columnName, args[0])) {
                isAppliable = false;
              }
            }

            if (method === 'unique') {
              const keys = args[0] || columnName;
              schemaIndexes.uk.push(typeof (keys) === 'string' ? [keys] : keys);

              // If exists unique index already.
              if (existIndexes.isUniqueExists(args[0] || columnName)) {
                isAppliable = false;

                if (depth === 0) {
                  return t;
                }
              }
            }

            if (method === 'primary') {
              const keys = args[0] || columnName;
              schemaIndexes.pk.push(typeof (keys) === 'string' ? [keys] : keys);

              // If exists primary key already.
              if (existIndexes.isPrimaryKeyExists(args[0] || columnName)) {
                isAppliable = false;

                if (depth === 0) {
                  return t;
                }
              }
            }

            if (isAppliable) {
              const methodFn = t[method];
              t = methodFn.apply(t, args);
            }

            e[0].__appended__.forEach((ee) => { // eslint-disable-line no-underscore-dangle
              t = column(t, ee, depth + 1);
            });

            if (depth === 0) {
              if (['foreign'].indexOf(method) !== -1) {
                /* eslint-disable no-empty */
              } else if (['index', 'unique'].indexOf(method) === -1) {
                if (existColumns[columnName]) {
                  t.alter();
                } else if (prevColumnName) {
                  t = t.after(prevColumnName);
                } else {
                  t = t.first();
                }
              }

              prevColumnName = columnName;
            }

            return t;
          };

          proxy.__appended__.forEach((e) => { // eslint-disable-line no-underscore-dangle
            column(table, e, 0);
          });

          // Drop unused columns.
          const dropColumns = [];

          Object.keys(existColumns).forEach((e) => {
            if (!schemaColumns[e]) {
              Object.keys(existIndexes.fk).forEach((key) => {
                if (helper.isArrayEqual([e], existIndexes.fk[key].key)) {
                  table.dropForeign(undefined, key);
                }
              });

              dropColumns.push(e);
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
            let found = false;

            schemaIndexes.key.forEach((sKey) => {
              if (helper.isArrayEqual(existIndexes.key[key], sKey)) found = true;
            });

            schemaIndexes.fk.forEach((sKey) => {
              sKey = typeof (sKey[0]) === 'string' ? [sKey[0]] : sKey[0];
              if (helper.isArrayEqual(existIndexes.key[key], sKey)) found = true;
            });

            if (!found) {
              table.dropIndex(undefined, key);
            }
          });

          Object.keys(existIndexes.uk).forEach((key) => {
            let found = false;

            schemaIndexes.uk.forEach((sKey) => {
              if (helper.isArrayEqual(existIndexes.uk[key], sKey)) found = true;
            });

            if (!found) {
              table.dropUnique(undefined, key);
            }
          });
        });
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

    const migrateView = async function migrator(viewName, fn) {
      const exists = (await knex('INFORMATION_SCHEMA.TABLES').select('TABLE_SCHEMA', 'TABLE_TYPE').where({
        TABLE_SCHEMA: opts.config.connection.database,
        TABLE_NAME: viewName,
      }))[0];

      if (exists && exists.TABLE_TYPE === 'BASE TABLE') {
        throw new Error(`* ${viewName} must be a view, but a table already exists with this name.`);
      }

      const proxy = tabler();

      fn(proxy);

      // eslint-disable-next-line no-underscore-dangle
      const schemaColumns = proxy.__appended__.reduce((acc, cur) => {
        if (cur[1] === 'columns') {
          acc.push(...cur[2][0]);
        }

        if (cur[1] === 'as') {
          // eslint-disable-next-line no-underscore-dangle
          acc.push(...cur[2][0]._statements[0].value);
        }

        return acc;
      }, []);

      if (!exists) {
        await knex.schema.createView(viewName, (view) => {
          fn(view);
        });
      } else {
        const existColumnInfo = await knex.from(viewName).columnInfo();
        const existColumns = Object.keys(existColumnInfo);

        const dropColumns = existColumns
          .filter((existColumn) => schemaColumns.length && !schemaColumns.includes(existColumn));
        const newColumns = schemaColumns.filter((schemaColumn) => existColumns.length && !existColumns.includes(schemaColumn));

        if (dropColumns.length > 0) {
          if (opts.verbose !== false) {
            /* eslint-disable no-console */
            console.warn(`* [Drop Column${dropColumns.length > 1 ? 's' : ''}] \`${viewName}\``);
            console.warn(`  ${'-'.repeat(20)}`);
            console.warn(`  ALTER VIEW \`${viewName}\` \n    ${dropColumns.map((c) => `DROP COLUMN \`${c}\``).join(',\n    ')};`);
            console.warn(`  ${'-'.repeat(20)}`);
          }
        }

        if (newColumns.length || dropColumns.length) {
          await knex.schema.createViewOrReplace(viewName, (view) => {
            fn(view);
          });
        }
      }

      return viewName;
    };

    const promises = {
      tables: [],
      views: [],
    };

    opts.path = opts.cwd || process.cwd();

    const dummyMigrator = (fn) => (a, b, c) => fn(a, b, c);

    const tableMigrator = (a, b, c) => ({
      call: async () => {
        const res = await migrateTable(a, b, c);
        return res;
      },
    });

    const viewMigrator = (a, b) => ({
      call: async () => {
        const res = await migrateView(a, b);
        return res;
      },
    });

    fs.readdirSync(opts.path).forEach((name) => {
      if (name.slice(0, 6) !== 'table_' && name.slice(0, 5) !== 'view_') return;

      const isTable = name.slice(0, 6) === 'table_';

      // eslint-disable-next-line global-require, import/no-dynamic-require
      require(`${opts.path}/${name}`).auto(dummyMigrator(isTable ? tableMigrator : viewMigrator), knex).forEach((e) => {
        if (isTable) {
          promises.tables.push([name, e]);
        } else {
          promises.views.push([name, e]);
        }
      });
    });

    if (opts.tables) {
      promises.tables.push(...opts.tables(dummyMigrator(tableMigrator), knex).map((table) => ['table_on_demand', table]));
    }

    if (opts.views) {
      promises.views.push(...opts.views(dummyMigrator(viewMigrator), knex).map((view) => ['view_on_demand', view]));
    }

    const convert = (type) => type.charAt(0).toUpperCase() + type.slice(1, -1);

    const execute = async function execute(i, type) {
      try {
        const res = await promises[type][i][1].call();

        if (opts.verbose !== false) {
          console.info(`* ${convert(type)} \`${res}\` has been migrated.`); // eslint-disable-line no-console
        }

        if (i < promises[type].length - 1) {
          await execute(i + 1, type);
        }
      } catch (err) {
        if (opts.verbose !== false) {
          console.error(`* ${convert(type)} \`${promises[type][i][0]}\` migration failed.`); // eslint-disable-line no-console
        }

        reject(err);
      }
    };

    // eslint-disable-next-line no-restricted-syntax
    for (const type of Object.keys(promises)) {
      if (promises[type].length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await execute(0, type);
      } else {
        console.info(`* No ${convert(type)} schema exist.`); // eslint-disable-line no-console
      }
    }

    resolve();
  });
};
