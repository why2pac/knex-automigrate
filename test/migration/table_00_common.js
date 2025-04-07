/* eslint-disable newline-per-chained-call, global-require, no-undef */

exports.auto = (migrator, knex) => [
  migrator('KEYVALS_ID', (table) => {
    table.string('ID', 128).notNullable().primary().comment('Key');
    table.text('VAL', 'longtext').notNullable().comment('Val');
    table.bigInteger('BIGINT').nullable().unsigned().comment('Bigint');
    table.decimal('DECIMAL', 45, 20).nullable().unsigned().comment('Decimal');
    table.datetime('EXPIRY_AT').nullable().comment('Expiry at, Timestamp.');
    table.datetime('CREATED_AT').notNullable().defaultTo(knex.fn.now()).comment('Created at, Timestamp.');

    table.index(['VAL'], 'FT_IDX_KEYVALS_ID_VAL', { indexType: 'FULLTEXT', parser: 'ngram' });
  }),
];
