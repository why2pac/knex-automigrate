const helper = require('./helper');

class IndexResult {
  constructor(data) {
    this.pk = data.pk;
    this.uk = data.uk;
    this.key = data.key;
    this.fk = data.fk;
  }

  isIndexExists(keys, name) {
    if (this.key[name]) return true;
    const normalizedKeys = typeof keys === 'string' ? [keys] : keys;

    return Object.values(this.key).some((indexKeys) => helper.isArrayEqual(indexKeys, normalizedKeys));
  }

  isPrimaryKeyExists(keys) {
    const normalizedKeys = typeof keys === 'string' ? [keys] : keys;

    return this.pk.some((pkKeys) => helper.isArrayEqual(pkKeys, normalizedKeys));
  }

  isUniqueExists(keys) {
    const normalizedKeys = typeof keys === 'string' ? [keys] : keys;

    return Object.values(this.uk).some((ukKeys) => helper.isArrayEqual(ukKeys, normalizedKeys));
  }

  isForeignKeyExists(columnName, ref) {
    const parts = ref.split('.');
    const refTable = parts[0];
    const refKey = [parts[1]];

    return Object.values(this.fk).some((fkEntry) => helper.isArrayEqual(fkEntry.key, [columnName])
        && helper.isArrayEqual(fkEntry.ref.key, refKey)
        && refTable === fkEntry.ref.table);
  }
}

module.exports = async function AutomigrateLib(knex, tableName) {
  const driver = knex.client.config.client;

  let data;

  if (driver === 'mysql2' || driver === 'mysql') {
    data = await (require('./dialects/mysql')(knex, tableName)); // eslint-disable-line global-require
  } else {
    throw new Error(`Not supported driver. (${driver})`);
  }

  return new IndexResult(data);
};

module.exports.IndexResult = IndexResult;
