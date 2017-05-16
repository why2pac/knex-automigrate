const async = require('asyncawait/async');
const await = require('asyncawait/await');
const helper = require('../helper');

module.exports = function(knex, tableName) {
  const startsWithKeyPK = 'PRIMARY KEY';
  const startsWithKeyUK = 'UNIQUE KEY';
  const startsWithKeyKey = 'KEY';
  const startsWithKeyFk = 'CONSTRAINT';
  const startsWithKeys = [startsWithKeyPK, startsWithKeyUK, startsWithKeyKey, startsWithKeyFk];

  var schema = await(knex.raw("SHOW CREATE TABLE `" + tableName + "`"));
  schema = schema[0][0]['Create Table'].split('\n')
  .map(function(e) { return e.trim() })
  .filter(function(e) { return startsWithKeys.some(function(k) { return e.indexOf(k) === 0; }) });

  var primaryKeys = [];
  var uniqueKeys = {};
  var indexKeys = {};
  var foreignKeys = {};

  schema.forEach(function(e) {
    if (e.indexOf(startsWithKeyPK) === 0) {
      var keys = helper.multipleColumns(helper.innerBrackets(e));

      if (keys) {
        primaryKeys.push(keys);
      }
    }
    else if (e.indexOf(startsWithKeyUK) === 0) {
      var name = helper.firstQuoteValue(e);
      var keys = helper.multipleColumns(helper.innerBrackets(e));

      if (name && keys) {
        uniqueKeys[name] = keys;
      }
    }
    else if (e.indexOf(startsWithKeyKey) === 0) {
      var name = helper.firstQuoteValue(e);
      var keys = helper.multipleColumns(helper.innerBrackets(e));

      if (name && keys) {
        indexKeys[name] = keys;
      }
    }
    else if (e.indexOf(startsWithKeyFk) === 0) {
      var ref = e.split('REFERENCES');
      var name = helper.firstQuoteValue(ref[0]);
      var srcKeys = helper.multipleColumns(helper.innerBrackets(ref[0]));
      var destTable = helper.firstQuoteValue(ref[1]);
      var destKeys = helper.multipleColumns(helper.innerBrackets(ref[1]));

      if (name && srcKeys && destTable && destKeys) {
        foreignKeys[name] = {
          key: srcKeys,
          ref: {
            table: destTable,
            key: destKeys
          }
        }
      }
    }
  });

  Object.keys(foreignKeys).forEach(function(key) {
    delete indexKeys[key];
  });

  return {
    pk: primaryKeys,
    uk: uniqueKeys,
    key: indexKeys,
    fk: foreignKeys
  }
}
