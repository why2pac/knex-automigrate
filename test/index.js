const knex = require('knex');
const automigrate = require('../lib/automigrate');
const config = require('./migration/knex.config');

const tableName = `TEST_${new Date().getTime()}`;

const getKnex = () => knex(config);

const getTableInfo = async (name) => {
  const kx = getKnex().from(name);
  const columnInfo = await kx.columnInfo();

  return { columnInfo };
};

describe('knex-automigrate', () => {
  it('create new table', async () => {
    await automigrate({
      config,
      cwd: __dirname,
      tables: (migrator, kx) => [
        migrator(tableName, (table) => {
          table.string('ID', 128).notNullable().primary().comment('Key');
          table.text('VAL', 'longtext').notNullable().comment('Val');
          table.bigInteger('BIGINT').nullable().unsigned().comment('Bigint');
          table.decimal('DECIMAL', 45, 20).nullable().unsigned().comment('Decimal');
          table.datetime('EXPIRY_AT').nullable().comment('Expiry at, Timestamp.');
          table.datetime('CREATED_AT').notNullable().defaultTo(kx.fn.now()).comment('Created at, Timestamp.');
        }),
      ],
    });

    const columns = await getTableInfo(tableName);
    console.log(columns);
  });

  it('drop table', async () => {
    await getKnex().schema.dropTable(tableName);
  });
});
