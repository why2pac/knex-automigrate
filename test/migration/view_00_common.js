/* eslint-disable newline-per-chained-call, global-require, no-undef */

exports.auto = (migrator, knex) => [
  migrator('VIEW_KEYVALS_ID', (view) => {
    view.columns(['VAL']);
    view.as(knex('KEYVALS_ID').select('VAL'));
  }),
];
