import { Knex } from 'knex';
import { ViewMigrator, MigrationEntry } from '../../src/automigrate';

export const auto = (migrator: ViewMigrator, knex: Knex): MigrationEntry[] => [
  migrator('KEYVALS_ID2', (view) => {
    // If view.columns() is missing,
    // the columns will default to those defined in the 'select()' statement.
    view.as(knex('KEYVALS_ID').select('VAL', 'CREATED_AT', 'EXPIRY_AT'));
  }),
];
