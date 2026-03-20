import fs from 'fs';
import knex, { Knex } from 'knex';
import * as helper from './index/helper';
import { loadIndexes, IndexResult } from './index/index';

const APPENDED_KEY = '__appended__';

type SchemaEntry = [any, string, any[]];

interface FulltextIndexEntry {
  columns: string | string[];
  name: string;
  options: { indexType?: string; parser?: string };
}

interface ProcessContext {
  schemaColumns: Record<string, boolean>;
  schemaIndexes: {
    pk: string[][];
    uk: string[][];
    key: string[][];
    fk: [string, string[]][];
  };
  existColumns: Record<string, Knex.ColumnInfo>;
  existIndexes: IndexResult;
  fulltextIndexesWithParser: FulltextIndexEntry[];
  columnName: string | undefined;
  prevColumnName: string | undefined;
}

export interface AutomigrateOptions {
  config: Knex.Config & { safe?: boolean };
  cwd?: string;
  path?: string;
  verbose?: boolean;
  tables?: (migrator: TableMigrator, knex: Knex) => MigrationEntry[];
  views?: (migrator: ViewMigrator, knex: Knex) => MigrationEntry[];
}

export type TableMigrator = (
  tableName: string,
  fn: (table: Knex.CreateTableBuilder) => void,
  initRows?: (config: Knex.Config) => Record<string, unknown>[],
) => MigrationEntry;

export type ViewMigrator = (
  viewName: string,
  fn: (view: Knex.ViewBuilder) => void,
) => MigrationEntry;

export interface MigrationEntry {
  call(): Promise<string>;
}

function createSchemaRecorder(): any {
  const appended: SchemaEntry[] = [];
  return new Proxy({}, {
    get(_target: any, method: string | symbol): any {
      if (method === APPENDED_KEY) {
        return appended;
      }

      if (typeof method !== 'string' || method === 'constructor') {
        return undefined;
      }

      return function recordedCall(a: any, b: any, c: any): any {
        const child = createSchemaRecorder();
        appended.push([child, method, [a, b, c]]);
        return child;
      };
    },
  });
}

async function applyFulltextIndexesWithParser(
  db: Knex,
  tableName: string,
  indexes: FulltextIndexEntry[],
): Promise<void> {
  await Promise.all(indexes.map(async (index) => {
    const cols = Array.isArray(index.columns) ? index.columns : [index.columns];
    const bindings: string[] = [tableName, index.name, ...cols];
    const placeholders = cols.map(() => '??').join(', ');

    let sql = `ALTER TABLE ?? ADD FULLTEXT INDEX ?? (${placeholders})`;

    if (index.options.parser) {
      sql += ' WITH PARSER ??';
      bindings.push(index.options.parser);
    }

    await db.raw(sql, bindings);
  }));
}

function resolveMethodAction(
  method: string,
  args: any[],
  depth: number,
  context: ProcessContext,
): 'skip' | 'no-apply' | 'apply' {
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
    schemaIndexes.fk.push([columnName!, typeof args[0] === 'string' ? [args[0]] : args[0]]);

    if (existIndexes.isForeignKeyExists(columnName!, args[0])) {
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

function processSchemaEntry(
  builder: any,
  entry: SchemaEntry,
  depth: number,
  context: ProcessContext,
): any {
  if (!entry || !entry[0]) return null;

  const [childProxy, method, args] = entry;

  if (depth === 0) {
    context.columnName = args[0];
    context.schemaColumns[args[0]] = true;
  }

  const action = resolveMethodAction(method, args, depth, context);

  if (action === 'skip') return builder;

  let result = builder;

  if (action === 'apply') {
    result = result[method](...args);
  }

  (childProxy[APPENDED_KEY] as SchemaEntry[]).forEach((childEntry) => {
    result = processSchemaEntry(result, childEntry, depth + 1, context);
  });

  if (depth === 0) {
    if (method !== 'foreign' && method !== 'index' && method !== 'unique') {
      if (context.existColumns[context.columnName!]) {
        result.alter();
      } else if (context.prevColumnName) {
        result = result.after(context.prevColumnName);
      } else {
        result = result.first();
      }
    }

    context.prevColumnName = context.columnName;
  }

  return result;
}

async function Automigrate(opts: AutomigrateOptions): Promise<void> {
  const db = knex(opts.config);

  try {
    // TODO: Migration PK (Y,N)
    // TODO: Migration Indexes (Y,N)
    // TODO: Migration Unique Attr. (Y,N)
    // TODO: Migration Reference Attr. (Y,N)

    const migrateTable = async (
      tableName: string,
      fn: (table: any) => void,
      initRows?: (config: any) => any[],
    ): Promise<string> => {
      const exists = await db.schema.hasTable(tableName);

      if (!exists) {
        const fulltextIndexesWithParser: FulltextIndexEntry[] = [];

        await db.schema.createTable(tableName, (table) => {
          const customTable = Object.create(table);

          customTable.index = function indexWithParser(
            this: any,
            columns: string | string[],
            name: string,
            indexOptions?: { indexType?: string; parser?: string },
          ) {
            if (indexOptions && indexOptions.indexType === 'FULLTEXT' && indexOptions.parser) {
              fulltextIndexesWithParser.push({ columns, name, options: indexOptions });
              return this;
            }

            return table.index.call(this, columns, name, indexOptions);
          };

          fn(customTable);
        });

        await applyFulltextIndexesWithParser(db, tableName, fulltextIndexesWithParser);
      } else {
        const existColumns = await db.from(tableName).columnInfo();
        const existIndexes = await loadIndexes(db, tableName);
        const schemaColumns: Record<string, boolean> = {};
        const schemaIndexes = {
          pk: [] as string[][],
          uk: [] as string[][],
          key: [] as string[][],
          fk: [] as [string, string[]][],
        };
        const fulltextIndexesWithParser: FulltextIndexEntry[] = [];

        await db.schema.alterTable(tableName, (table) => {
          const recorder = createSchemaRecorder();
          fn(recorder);

          const context: ProcessContext = {
            schemaColumns,
            schemaIndexes,
            existColumns,
            existIndexes,
            fulltextIndexesWithParser,
            columnName: undefined,
            prevColumnName: undefined,
          };

          (recorder[APPENDED_KEY] as SchemaEntry[]).forEach((entry: SchemaEntry) => {
            processSchemaEntry(table, entry, 0, context);
          });

          // Drop unused columns.
          const dropColumns: string[] = [];

          Object.keys(existColumns).forEach((col) => {
            if (!schemaColumns[col]) {
              Object.keys(existIndexes.fk).forEach((key) => {
                if (helper.isArrayEqual([col], existIndexes.fk[key].key)) {
                  table.dropForeign([], key);
                }
              });

              dropColumns.push(col);
            }
          });

          if (dropColumns.length > 0) {
            if ((opts.config as any).safe) {
              if (opts.verbose !== false) {
                console.warn(`* [Skip Drop Column${dropColumns.length > 1 ? 's' : ''}] \`${tableName}\``);
                console.warn(`  ${'-'.repeat(20)}`);
                console.warn(`  ALTER TABLE \`${tableName}\` \n    ${dropColumns.map((c) => `DROP COLUMN \`${c}\``).join(',\n    ')};`);
                console.warn(`  ${'-'.repeat(20)}`);
              }
            } else {
              table.dropColumns(...dropColumns);
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
              table.dropIndex([], key);
            }
          });

          Object.keys(existIndexes.uk).forEach((key) => {
            const found = schemaIndexes.uk.some((sKey) => helper.isArrayEqual(existIndexes.uk[key], sKey));

            if (!found) {
              table.dropUnique([], key);
            }
          });
        });

        await applyFulltextIndexesWithParser(db, tableName, fulltextIndexesWithParser);
      }

      if (typeof initRows === 'function') {
        const result = await db.count('* AS cnt').from(tableName);
        const existRows = (result[0] as any).cnt as number;

        if (!existRows) {
          const rows = initRows(opts.config);

          if (rows && rows.length) {
            await db.batchInsert(tableName, rows);
          }
        }
      }

      return tableName;
    };

    const migrateView = async (viewName: string, fn: (view: any) => void): Promise<string> => {
      const connection = opts.config.connection as { database: string };
      const exists = (await db('INFORMATION_SCHEMA.TABLES').select('TABLE_SCHEMA', 'TABLE_TYPE').where({
        TABLE_SCHEMA: connection.database,
        TABLE_NAME: viewName,
      }))[0] as { TABLE_TYPE: string } | undefined;

      if (exists && exists.TABLE_TYPE === 'BASE TABLE') {
        throw new Error(`* ${viewName} must be a view, but a table already exists with this name.`);
      }

      if (!exists) {
        await db.schema.createView(viewName, (view) => {
          fn(view);
        });
      } else {
        const recorder = createSchemaRecorder();
        fn(recorder);

        const { schemaColumns } = (recorder[APPENDED_KEY] as SchemaEntry[]).reduce(
          (acc: { schemaColumns: string[] | null; schemaAs: any }, cur: SchemaEntry) => {
            if (cur[1] === 'columns') {
              if (acc.schemaColumns) throw new Error('Only one "columns" can be used.');

              acc.schemaColumns = cur[2][0];
            }

            if (cur[1] === 'as') {
              if (acc.schemaAs) throw new Error('Only one "as" can be used.');

              acc.schemaAs = cur[2][0];
            }

            return acc;
          },
          { schemaColumns: null, schemaAs: null },
        );

        const existColumns = await db.from(viewName).columnInfo();
        const dropColumns = Object.keys(existColumns)
          .filter((existColumn) => schemaColumns && !schemaColumns.includes(existColumn));

        if (dropColumns.length > 0) {
          if (opts.verbose !== false) {
            console.warn(`* [Drop Column${dropColumns.length > 1 ? 's' : ''}] \`${viewName}\``);
            console.warn(`  ${'-'.repeat(20)}`);
            console.warn(`  ALTER VIEW \`${viewName}\` \n    ${dropColumns.map((c) => `DROP COLUMN \`${c}\``).join(',\n    ')};`);
            console.warn(`  ${'-'.repeat(20)}`);
          }
        }

        await db.schema.createViewOrReplace(viewName, (view) => {
          fn(view);
        });
      }

      return viewName;
    };

    const migrations: { tables: [string, MigrationEntry][]; views: [string, MigrationEntry][] } = {
      tables: [],
      views: [],
    };

    const migrationPath = opts.cwd || process.cwd();

    const tableMigrator: TableMigrator = (a, b, c) => ({
      call: async () => migrateTable(a, b as any, c as any),
    });

    const viewMigrator: ViewMigrator = (a, b) => ({
      call: async () => migrateView(a, b as any),
    });

    fs.readdirSync(migrationPath).forEach((name) => {
      if (name.slice(0, 6) !== 'table_' && name.slice(0, 5) !== 'view_') return;

      const isTable = name.slice(0, 6) === 'table_';

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require(`${migrationPath}/${name}`);
      migration.auto(isTable ? tableMigrator : viewMigrator, db).forEach((entry: MigrationEntry) => {
        if (isTable) {
          migrations.tables.push([name, entry]);
        } else {
          migrations.views.push([name, entry]);
        }
      });
    });

    if (opts.tables) {
      migrations.tables.push(
        ...opts.tables(tableMigrator, db).map((table): [string, MigrationEntry] => ['table_on_demand', table]),
      );
    }

    if (opts.views) {
      migrations.views.push(
        ...opts.views(viewMigrator, db).map((view): [string, MigrationEntry] => ['view_on_demand', view]),
      );
    }

    const convert = (type: string) => type.charAt(0).toUpperCase() + type.slice(1, -1);

    for (const type of Object.keys(migrations) as Array<keyof typeof migrations>) {
      if (migrations[type].length > 0) {
        for (let i = 0; i < migrations[type].length; i += 1) {
          try {
            const res = await migrations[type][i][1].call();

            if (opts.verbose !== false) {
              console.info(`* ${convert(type)} \`${res}\` has been migrated.`);
            }
          } catch (err) {
            if (opts.verbose !== false) {
              console.error(`* ${convert(type)} \`${migrations[type][i][0]}\` migration failed.`);
            }

            throw err;
          }
        }
      } else {
        console.info(`* No ${convert(type)} schema exist.`);
      }
    }
  } finally {
    await db.destroy();
  }
}

export default Automigrate;
