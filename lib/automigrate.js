/* eslint-disable no-param-reassign */

const fs = require('fs');
const helper = require('./index/helper');

module.exports = function Automigrate(opts) {
  return new Promise(((resolve, reject) => {
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

    const migrator = async function migrator(tableName, fn, initRows) {
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
            table.dropColumns(dropColumns);
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

    const promises = [];
    opts.path = opts.cwd || process.cwd();

    const dummyMigrator = (a, b, c) => ({
      call: async () => {
        const res = await migrator(a, b, c);
        return res;
      },
    });

    fs.readdirSync(opts.path).forEach((name) => {
      if (name.slice(0, 6) !== 'table_') return;

      // eslint-disable-next-line global-require, import/no-dynamic-require
      require(`${opts.path}/${name}`).auto(dummyMigrator, knex).forEach((e) => {
        promises.push([name, e]);
      });
    });

    const execute = function execute(i) {
      promises[i][1].call().then((res) => {
        console.info(`* Table \`${res}\` has been migrated.`); // eslint-disable-line no-console

        if (i < promises.length - 1) {
          execute(i + 1);
        } else {
          resolve();
        }
      }).catch((err) => {
        console.error(`* Table \`${promises[i][0]}\` migration failed.`); // eslint-disable-line no-console
        reject(err);
      });
    };

    if (promises.length > 0) {
      execute(0);
    } else {
      console.info('* No schema exist.'); // eslint-disable-line no-console
    }
  }));
};
