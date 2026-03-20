import { Knex } from 'knex';
import * as helper from './helper';

export interface ForeignKeyEntry {
  key: string[];
  ref: {
    table: string;
    key: string[];
  };
}

export interface IndexData {
  pk: string[][];
  uk: Record<string, string[]>;
  key: Record<string, string[]>;
  fk: Record<string, ForeignKeyEntry>;
}

export class IndexResult implements IndexData {
  pk: string[][];
  uk: Record<string, string[]>;
  key: Record<string, string[]>;
  fk: Record<string, ForeignKeyEntry>;

  constructor(data: IndexData) {
    this.pk = data.pk;
    this.uk = data.uk;
    this.key = data.key;
    this.fk = data.fk;
  }

  isIndexExists(keys: string | string[], name?: string): boolean {
    if (name && this.key[name]) return true;
    const normalizedKeys = typeof keys === 'string' ? [keys] : keys;

    return Object.values(this.key).some((indexKeys) => helper.isArrayEqual(indexKeys, normalizedKeys));
  }

  isPrimaryKeyExists(keys: string | string[]): boolean {
    const normalizedKeys = typeof keys === 'string' ? [keys] : keys;

    return this.pk.some((pkKeys) => helper.isArrayEqual(pkKeys, normalizedKeys));
  }

  isUniqueExists(keys: string | string[]): boolean {
    const normalizedKeys = typeof keys === 'string' ? [keys] : keys;

    return Object.values(this.uk).some((ukKeys) => helper.isArrayEqual(ukKeys, normalizedKeys));
  }

  isForeignKeyExists(columnName: string, ref: string): boolean {
    const parts = ref.split('.');
    const refTable = parts[0];
    const refKey = [parts[1]];

    return Object.values(this.fk).some((fkEntry) => helper.isArrayEqual(fkEntry.key, [columnName])
        && helper.isArrayEqual(fkEntry.ref.key, refKey)
        && refTable === fkEntry.ref.table);
  }
}

export async function loadIndexes(knex: Knex, tableName: string): Promise<IndexResult> {
  const driver = knex.client.config.client as string;

  let data: IndexData;

  if (driver === 'mysql2' || driver === 'mysql') {
    const parseMySqlSchema = (await import('./dialects/mysql')).default;
    data = await parseMySqlSchema(knex, tableName);
  } else {
    throw new Error(`Not supported driver. (${driver})`);
  }

  return new IndexResult(data);
}
