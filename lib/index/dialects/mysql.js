const helper = require('../helper');

module.exports = async function MySqlDialect(knex, tableName) {
  const startsWithKeyPK = 'PRIMARY KEY';
  const startsWithKeyUK = 'UNIQUE KEY';
  const startsWithKeyKey = 'KEY';
  const startsWithKeyFk = 'CONSTRAINT';
  const startsWithKeys = [startsWithKeyPK, startsWithKeyUK, startsWithKeyKey, startsWithKeyFk];

  let schema = await knex.raw(`SHOW CREATE TABLE \`${tableName}\``);
  schema = schema[0][0]['Create Table'].split('\n')
    .map((e) => e.trim())
    .filter((e) => startsWithKeys.some((k) => e.indexOf(k) === 0));

  const primaryKeys = [];
  const uniqueKeys = {};
  const indexKeys = {};
  const foreignKeys = {};

  schema.forEach((e) => {
    if (e.indexOf(startsWithKeyPK) === 0) {
      const keys = helper.multipleColumns(helper.innerBrackets(e));

      if (keys) {
        primaryKeys.push(keys);
      }
    } else if (e.indexOf(startsWithKeyUK) === 0) {
      const name = helper.firstQuoteValue(e);
      const keys = helper.multipleColumns(helper.innerBrackets(e));

      if (name && keys) {
        uniqueKeys[name] = keys;
      }
    } else if (e.indexOf(startsWithKeyKey) === 0) {
      const name = helper.firstQuoteValue(e);
      const keys = helper.multipleColumns(helper.innerBrackets(e));

      if (name && keys) {
        indexKeys[name] = keys;
      }
    } else if (e.indexOf(startsWithKeyFk) === 0) {
      const ref = e.split('REFERENCES');
      const name = helper.firstQuoteValue(ref[0]);
      const srcKeys = helper.multipleColumns(helper.innerBrackets(ref[0]));
      const destTable = helper.firstQuoteValue(ref[1]);
      const destKeys = helper.multipleColumns(helper.innerBrackets(ref[1]));

      if (name && srcKeys && destTable && destKeys) {
        foreignKeys[name] = {
          key: srcKeys,
          ref: {
            table: destTable,
            key: destKeys,
          },
        };
      }
    }
  });

  Object.keys(foreignKeys).forEach((key) => {
    delete indexKeys[key];
  });

  return {
    pk: primaryKeys,
    uk: uniqueKeys,
    key: indexKeys,
    fk: foreignKeys,
  };
};
