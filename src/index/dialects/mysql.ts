import { Knex } from 'knex';
import * as helper from '../helper';
import { IndexData } from '../index';

export default async function parseMySqlSchema(knex: Knex, tableName: string): Promise<IndexData> {
  const startsWithKeyPK = 'PRIMARY KEY';
  const startsWithKeyUK = 'UNIQUE KEY';
  const startsWithKeyKey = 'KEY';
  const startsWithKeyFk = 'CONSTRAINT';
  const startsWithKeyFulltextKey = 'FULLTEXT KEY';
  const startsWithKeys = [startsWithKeyPK, startsWithKeyUK, startsWithKeyKey, startsWithKeyFk, startsWithKeyFulltextKey];

  const raw = await knex.raw(`SHOW CREATE TABLE \`${tableName}\``);
  const schema = (raw[0][0]['Create Table'] as string).split('\n')
    .map((e: string) => e.trim())
    .filter((e: string) => startsWithKeys.some((k) => e.indexOf(k) === 0));

  const primaryKeys: string[][] = [];
  const uniqueKeys: Record<string, string[]> = {};
  const indexKeys: Record<string, string[]> = {};
  const foreignKeys: Record<string, { key: string[]; ref: { table: string; key: string[] } }> = {};

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
    } else if (e.indexOf(startsWithKeyFulltextKey) === 0) {
      const name = helper.firstQuoteValue(e);
      const keys = helper.multipleColumns(helper.innerBrackets(e));

      if (name && keys) {
        indexKeys[name] = keys;
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
}
