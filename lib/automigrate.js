const fs = require('fs')
const helper = require('./index/helper')

module.exports = function (opts) {
  return new Promise(function (resolve, reject) {
    opts = opts || {}

    const knex = require('knex')(opts.config)

    // TODO: Migration PK (Y,N)
    // TODO: Migration Indexes (Y,N)
    // TODO: Migration Unique Attr. (Y,N)
    // TODO: Migration Reference Attr. (Y,N)

    var tabler = function () {
      var appended = []
      return new Proxy({}, {
        get: function (target, method) {
          if (method === '__appended__') {
            return appended
          }

          if (typeof (method) !== 'string' || ['constructor'].indexOf(method) !== -1) {
            return undefined
          }

          return function (a, b, c) {
            var proxy = tabler()
            appended.push([proxy, method, [a, b, c]])
            return proxy
          }
        }
      })
    }

    var migrator = async function (tableName, fn, initRows) {
      var exists = await knex.schema.hasTable(tableName)

      if (!exists) {
        await knex.schema.createTable(tableName, function (table) {
          fn(table)
        })
      } else {
        var existColumns = await knex.from(tableName).columnInfo()
        var existIndexes = await (require('./index')(knex, tableName))
        var schemaColumns = {}
        var schemaIndexes = {pk: [], uk: [], key: [], fk: []}

        await knex.schema.alterTable(tableName, function (table) {
          var prevColumnName
          var columnName
          var proxy = tabler()
          fn(proxy)

          var column = function (t, e, depth) {
            if (!e || !e[0]) return

            var method = e[1]
            var args = e[2]

            if (depth === 0) {
              columnName = e[2][0]
              schemaColumns[columnName] = true
            }

            // If exists primary key already.
            if ((method === 'increments' || method === 'bigIncrements') && existIndexes.pk.length > 0) {
              return t
            }

            if (method === 'index') {
              schemaIndexes.key.push(typeof (args[0]) === 'string' ? [args[0]] : args[0])

              // If exists index already.
              if (existIndexes.isIndexExists(args[0], args[1])) {
                return t
              }
            }

            var isAppliable = true

            if (method === 'references') {
              schemaIndexes.fk.push([columnName, typeof (args[0]) === 'string' ? [args[0]] : args[0]])

              // If exists foreign key already.
              if (existIndexes.isForeignKeyExists(columnName, args[0])) {
                isAppliable = false
              }
            }

            if (method === 'unique') {
              var keys = args[0] || columnName
              schemaIndexes.uk.push(typeof (keys) === 'string' ? [keys] : keys)

              // If exists unique index already.
              if (existIndexes.isUniqueExists(args[0] || columnName)) {
                isAppliable = false

                if (depth === 0) {
                  return t
                }
              }
            }

            if (method === 'primary') {
              let keys = args[0] || columnName
              schemaIndexes.pk.push(typeof (keys) === 'string' ? [keys] : keys)

              // If exists primary key already.
              if (existIndexes.isPrimaryKeyExists(args[0] || columnName)) {
                isAppliable = false

                if (depth === 0) {
                  return t
                }
              }
            }

            if (isAppliable) {
              let fn = t[method]
              t = fn.apply(t, args)
            }

            e[0].__appended__.forEach(function (e) {
              t = column(t, e, depth + 1)
            })

            if (depth === 0) {
              if (['index', 'unique'].indexOf(method) === -1) {
                if (existColumns[columnName]) {
                  t.alter()
                } else {
                  if (prevColumnName) {
                    t = t.after(prevColumnName)
                  } else {
                    t = t.first()
                  }
                }
              }

              prevColumnName = columnName
            }

            return t
          }

          proxy.__appended__.forEach(function (e) {
            column(table, e, 0)
          })

          // Drop unused columns.
          var dropColumns = []

          Object.keys(existColumns).forEach(function (e) {
            if (!schemaColumns[e]) {
              Object.keys(existIndexes.fk).forEach(function (key) {
                if (helper.isArrayEqual([e], existIndexes.fk[key].key)) {
                  table.dropForeign(undefined, key)
                }
              })

              dropColumns.push(e)
            }
          })

          if (dropColumns.length > 0) {
            table.dropColumns(dropColumns)
          }

          // Drop unused indexes.
          Object.keys(existIndexes.key).forEach(function (key) {
            var found = false

            schemaIndexes.key.forEach(function (sKey) {
              if (helper.isArrayEqual(existIndexes.key[key], sKey)) found = true
            })

            schemaIndexes.fk.forEach(function (sKey) {
              sKey = typeof (sKey[0]) === 'string' ? [sKey[0]] : sKey[0]
              if (helper.isArrayEqual(existIndexes.key[key], sKey)) found = true
            })

            if (!found) {
              table.dropIndex(undefined, key)
            }
          })

          Object.keys(existIndexes.uk).forEach(function (key) {
            var found = false

            schemaIndexes.uk.forEach(function (sKey) {
              if (helper.isArrayEqual(existIndexes.uk[key], sKey)) found = true
            })

            if (!found) {
              table.dropUnique(undefined, key)
            }
          })
        })
      }

      if (typeof initRows === 'function') {
        const existRows = (await knex.count('* AS cnt').from(tableName))[0].cnt

        if (!existRows) {
          const rows = initRows(opts.config)

          if (rows && rows.length) {
            await knex.batchInsert(tableName, rows);
          }
        }
      }

      return tableName
    }

    var promises = []
    opts.path = opts.cwd || process.cwd()

    const dummyMigrator = (a, b, c) => {
      return {
        call: async () => {
          const res = await migrator(a, b, c)
          return res
        }
      }
    }

    fs.readdirSync(opts.path).forEach(function (name) {
      if (name.slice(0, 6) !== 'table_') return
      require(opts.path + '/' + name).auto(dummyMigrator, knex).forEach(function (e) {
        promises.push([name, e])
      })
    })

    var execute = function (i) {
      promises[i][1].call().then(function (res) {
        console.info('* Table `' + res + '` has been migrated.')

        if (i < promises.length - 1) {
          execute(i + 1)
        } else {
          resolve()
        }
      }).catch(function (err) {
        console.error('* Table `' + promises[i][0] + '` migration failed.')
        reject(err)
      })
    }

    if (promises.length > 0) {
      execute(0)
    } else {
      console.info('* No schema exist.')
    }
  })
}
