const helper = require('./helper')

module.exports = function (knex, tableName) {
  var driver = knex.client.config.client
  var indexes = {
    pk: [],
    uk: {},
    key: {},
    fk: {}
  }

  if (driver === 'mysql') {
    indexes = require('./dialects/mysql')(knex, tableName)
  }

  indexes.isIndexExists = function (keys, name) {
    if (indexes.key[name]) return true
    keys = typeof (keys) === 'string' ? [keys] : keys

    var exist = false
    Object.keys(indexes.key).forEach(function (key) {
      if (exist) return
      if (helper.isArrayEqual(indexes.key[key], keys)) exist = true
    })

    return exist
  }

  indexes.isPrimaryKeyExists = function (keys) {
    var exist = false
    keys = typeof (keys) === 'string' ? [keys] : keys

    Object.keys(indexes.pk).forEach(function (key) {
      if (exist) return
      if (helper.isArrayEqual(indexes.pk[key], keys)) exist = true
    })

    return exist
  }

  indexes.isUniqueExists = function (keys) {
    var exist = false
    keys = typeof (keys) === 'string' ? [keys] : keys

    Object.keys(indexes.uk).forEach(function (key) {
      if (exist) return
      if (helper.isArrayEqual(indexes.uk[key], keys)) exist = true
    })

    return exist
  }

  indexes.isForeignKeyExists = function (columnName, ref) {
    ref = ref.split('.')

    var refTable = ref[0]
    var refKey = [ref[1]]
    var exist = false

    Object.keys(indexes.fk).forEach(function (key) {
      if (exist) return
      if (
        helper.isArrayEqual(indexes.fk[key].key, [columnName]) &&
        helper.isArrayEqual(indexes.fk[key].ref.key, refKey) &&
        refTable === indexes.fk[key].ref.table) exist = true
    })

    return exist
  }

  return indexes
}
