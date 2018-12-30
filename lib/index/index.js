/* eslint-disable no-param-reassign */

const helper = require('./helper');

module.exports = async function AutomigrateLib(knex, tableName) {
  const driver = knex.client.config.client;
  let indexes = {
    pk: [],
    uk: {},
    key: {},
    fk: {},
  };

  if (driver === 'mysql') {
    indexes = await (require('./dialects/mysql')(knex, tableName)); // eslint-disable-line global-require
  }

  indexes.isIndexExists = function isIndexExists(keys, name) {
    if (indexes.key[name]) return true;
    keys = typeof (keys) === 'string' ? [keys] : keys;

    let exist = false;
    Object.keys(indexes.key).forEach((key) => {
      if (exist) return;
      if (helper.isArrayEqual(indexes.key[key], keys)) exist = true;
    });

    return exist;
  };

  indexes.isPrimaryKeyExists = function isPrimaryKeyExists(keys) {
    let exist = false;
    keys = typeof (keys) === 'string' ? [keys] : keys;

    Object.keys(indexes.pk).forEach((key) => {
      if (exist) return;
      if (helper.isArrayEqual(indexes.pk[key], keys)) exist = true;
    });

    return exist;
  };

  indexes.isUniqueExists = function isUniqueExists(keys) {
    let exist = false;
    keys = typeof (keys) === 'string' ? [keys] : keys;

    Object.keys(indexes.uk).forEach((key) => {
      if (exist) return;
      if (helper.isArrayEqual(indexes.uk[key], keys)) exist = true;
    });

    return exist;
  };

  indexes.isForeignKeyExists = function isForeignKeyExists(columnName, ref) {
    ref = ref.split('.');

    const refTable = ref[0];
    const refKey = [ref[1]];
    let exist = false;

    Object.keys(indexes.fk).forEach((key) => {
      if (exist) return;
      if (
        helper.isArrayEqual(indexes.fk[key].key, [columnName])
        && helper.isArrayEqual(indexes.fk[key].ref.key, refKey)
        && refTable === indexes.fk[key].ref.table) exist = true;
    });

    return exist;
  };

  return indexes;
};
