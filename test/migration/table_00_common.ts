import { Knex } from 'knex';
import { TableMigrator, MigrationEntry } from '../../src/automigrate';

export const auto = (migrator: TableMigrator, knex: Knex): MigrationEntry[] => [
  migrator('KEYVALS_ID', (table) => {
    table.string('ID', 128).notNullable().primary().comment('Key');
    table.text('VAL', 'longtext').notNullable().comment('Val');
    table.bigInteger('BIGINT').nullable().unsigned().comment('Bigint');
    table.decimal('DECIMAL', 45, 20).nullable().unsigned().comment('Decimal');
    table.datetime('EXPIRY_AT').nullable().comment('Expiry at, Timestamp.');
    table.datetime('CREATED_AT').notNullable().defaultTo(knex.fn.now()).comment('Created at, Timestamp.');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table.index(['VAL'], 'FT_IDX_KEYVALS_ID_VAL', { indexType: 'FULLTEXT', parser: 'ngram' } as any);
  }),
];
