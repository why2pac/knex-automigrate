/* eslint-disable newline-per-chained-call, global-require, no-undef */

exports.auto = (migrator, knex) => [
  migrator('KEYVALS_ID2', (view) => {
    // If view.columns() is missing,
    // the columns will default to those defined in the 'select()' statement.
    view.as(knex('KEYVALS_ID').select('VAL', 'CREATED_AT', 'EXPIRY_AT'));
  }),
];
