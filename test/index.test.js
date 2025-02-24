const knex = require('knex');
const automigrate = require('../lib/automigrate');
const config = require('./migration/knex.config');

const tableName = `TEST_${new Date().getTime()}`;

const getKnex = () => knex(config);

const getTableInfo = async (name) => {
  const kx = getKnex();
  const table = getKnex().from(name);
  const columnInfo = await table.columnInfo();
  const schema = (await kx.raw(`SHOW CREATE TABLE \`${tableName}\``))[0][0]['Create Table'].split('`')
    .join('')
    .split('\n')
    .map((e) => e.trim());

  return { columnInfo, schema };
};

describe('knex-automigrate', () => {
  it('create new table', async () => {
    await automigrate({
      verbose: false,
      config,
      cwd: __dirname,
      tables: (migrator, kx) => [
        migrator(tableName, (table) => {
          table.string('ID', 128).notNullable().comment('Key 1');
          table.string('ID_2', 128).notNullable().comment('Key 2');
          table.string('ID_3', 128).notNullable().comment('Key 3');
          table.text('VAL', 'longtext').notNullable().comment('Val');
          table.bigInteger('BIGINT').nullable().unsigned().comment('Bigint');
          table.decimal('DECIMAL', 45, 20).nullable().unsigned().comment('Decimal');
          table.datetime('EXPIRY_AT').nullable().comment('Expiry at, Timestamp.');
          table.datetime('CREATED_AT').notNullable().defaultTo(kx.fn.now()).comment('Created at, Timestamp.');

          table.primary(['ID', 'ID_2'], 'Primary_Key_Name');
          table.unique(['ID_2', 'ID_3'], 'Unique_Key_Name');
          table.index(['ID_3', 'ID_2', 'ID'], 'ID_Index_Name');
          table.index(['ID'], 'ID_Fulltext_Index_Name', { indexType: 'FULLTEXT' });
        }),
      ],
    });

    const info = await getTableInfo(tableName);

    expect(info.columnInfo).toMatchObject({
      ID: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      ID_2: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      ID_3: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      VAL: {
        defaultValue: null, type: 'longtext', maxLength: 4294967295, nullable: false,
      },
      BIGINT: {
        defaultValue: null, type: 'bigint', maxLength: null, nullable: true,
      },
      DECIMAL: {
        defaultValue: null, type: 'decimal', maxLength: null, nullable: true,
      },
      EXPIRY_AT: {
        defaultValue: null, type: 'datetime', maxLength: null, nullable: true,
      },
      CREATED_AT: {
        defaultValue: 'CURRENT_TIMESTAMP', type: 'datetime', maxLength: null, nullable: false,
      },
    });

    expect(info.schema.find((stmt) => stmt.includes('CREATED_AT')).indexOf('Created at')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('PRIMARY KEY')).indexOf('ID,ID_2')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('Unique_Key_Name')).indexOf('ID_2,ID_3')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('ID_Index_Name')).indexOf('ID_3,ID_2,ID')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('ID_Fulltext_Index_Name')).indexOf('ID')).toBeGreaterThanOrEqual(0);
  });

  it('Add columns with an existing fulltext index', async () => {
    await automigrate({
      verbose: false,
      config,
      cwd: __dirname,
      tables: (migrator, kx) => [
        migrator(tableName, (table) => {
          table.string('ID', 128).notNullable().comment('Key 1');
          table.string('ID_2', 128).notNullable().comment('Key 2');
          table.string('ID_3', 128).notNullable().comment('Key 3');
          table.string('ID_4', 128).notNullable().comment('Key 4');
          table.text('VAL', 'longtext').notNullable().comment('Val');
          table.bigInteger('BIGINT').nullable().unsigned().comment('Bigint');
          table.decimal('DECIMAL', 45, 20).nullable().unsigned().comment('Decimal');
          table.datetime('EXPIRY_AT').nullable().comment('Expiry at, Timestamp.');
          table.datetime('CREATED_AT').notNullable().defaultTo(kx.fn.now()).comment('Created at, Timestamp.');

          table.primary(['ID', 'ID_2'], 'Primary_Key_Name');
          table.unique(['ID_2', 'ID_3'], 'Unique_Key_Name');
          table.index(['ID_3', 'ID_2', 'ID'], 'ID_Index_Name');
          table.index(['ID'], 'ID_Fulltext_Index_Name', { indexType: 'FULLTEXT' });
        }),
      ],
    });

    const info = await getTableInfo(tableName);

    expect(info.columnInfo).toMatchObject({
      ID: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      ID_2: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      ID_3: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      ID_4: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      VAL: {
        defaultValue: null, type: 'longtext', maxLength: 4294967295, nullable: false,
      },
      BIGINT: {
        defaultValue: null, type: 'bigint', maxLength: null, nullable: true,
      },
      DECIMAL: {
        defaultValue: null, type: 'decimal', maxLength: null, nullable: true,
      },
      EXPIRY_AT: {
        defaultValue: null, type: 'datetime', maxLength: null, nullable: true,
      },
      CREATED_AT: {
        defaultValue: 'CURRENT_TIMESTAMP', type: 'datetime', maxLength: null, nullable: false,
      },
    });

    expect(info.schema.find((stmt) => stmt.includes('CREATED_AT')).indexOf('Created at')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('PRIMARY KEY')).indexOf('ID,ID_2')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('Unique_Key_Name')).indexOf('ID_2,ID_3')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('ID_Index_Name')).indexOf('ID_3,ID_2,ID')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('ID_Fulltext_Index_Name')).indexOf('ID')).toBeGreaterThanOrEqual(0);
  });

  it('modify exist colums', async () => {
    await automigrate({
      verbose: false,
      config,
      cwd: __dirname,
      tables: (migrator, kx) => [
        migrator(tableName, (table) => {
          table.string('ID', 256).notNullable().comment('Key');
          table.string('ID_2', 128).notNullable().comment('Key 2');
          table.string('ID_3', 128).notNullable().comment('Key 3');
          table.text('VAL', 'longtext').nullable().comment('Val');
          table.integer('BIGINT').nullable().unsigned().comment('Bigint');
          table.decimal('DECIMAL', 45, 20).notNullable().unsigned().comment('Decimal');
          table.datetime('EXPIRY_AT').nullable().comment('Expiry at, Timestamp.');
          table.datetime('CREATED_AT').notNullable().defaultTo(kx.fn.now()).comment('Creation Timestamp');
        }),
      ],
    });

    const info = await getTableInfo(tableName);

    expect(info.columnInfo).toMatchObject({
      ID: {
        defaultValue: null, type: 'varchar', maxLength: 256, nullable: false,
      },
      ID_2: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      ID_3: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      VAL: {
        defaultValue: null, type: 'longtext', maxLength: 4294967295, nullable: true,
      },
      BIGINT: {
        defaultValue: null, type: 'int', maxLength: null, nullable: true,
      },
      DECIMAL: {
        defaultValue: null, type: 'decimal', maxLength: null, nullable: false,
      },
      EXPIRY_AT: {
        defaultValue: null, type: 'datetime', maxLength: null, nullable: true,
      },
      CREATED_AT: {
        defaultValue: 'CURRENT_TIMESTAMP', type: 'datetime', maxLength: null, nullable: false,
      },
    });

    expect(info.schema.find((stmt) => stmt.includes('CREATED_AT')).indexOf('Creation Timestamp')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('PRIMARY KEY')).indexOf('ID,ID_2')).toBeGreaterThanOrEqual(0);
    expect(info.schema.find((stmt) => stmt.includes('Unique_Key_Name'))).toBe(undefined);
    expect(info.schema.find((stmt) => stmt.includes('ID_Index_Name'))).toBe(undefined);
    expect(info.schema.find((stmt) => stmt.includes('ID_Fulltext_Index_Name'))).toBe(undefined);
  });

  it('drop exist colums', async () => {
    await automigrate({
      verbose: false,
      config,
      cwd: __dirname,
      tables: (migrator, kx) => [
        migrator(tableName, (table) => {
          table.string('ID', 256).notNullable().comment('Key');
          table.string('ID_2', 128).notNullable().comment('Key 2');
          table.string('ID_3', 128).notNullable().comment('Key 3');
          table.text('VAL', 'longtext').nullable().comment('Val');
          table.datetime('CREATED_AT').notNullable().defaultTo(kx.fn.now()).comment('Creation Timestamp');
        }),
      ],
    });

    const info = await getTableInfo(tableName);

    expect(info.columnInfo).toEqual(expect.not.objectContaining({
      ID: {
        defaultValue: null, type: 'varchar', maxLength: 256, nullable: false,
      },
      ID_2: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      ID_3: {
        defaultValue: null, type: 'varchar', maxLength: 128, nullable: false,
      },
      BIGINT: {
        defaultValue: null, type: 'int', maxLength: null, nullable: true,
      },
      DECIMAL: {
        defaultValue: null, type: 'decimal', maxLength: null, nullable: false,
      },
      EXPIRY_AT: {
        defaultValue: null, type: 'datetime', maxLength: null, nullable: true,
      },
    }));
  });

  it('add new colums', async () => {
    await automigrate({
      verbose: false,
      config,
      cwd: __dirname,
      tables: (migrator, kx) => [
        migrator(tableName, (table) => {
          table.string('ID', 256).notNullable().comment('Key');
          table.text('VAL', 'longtext').nullable().comment('Val');
          table.bigInteger('BIGINT2').nullable().unsigned().comment('Bigint');
          table.decimal('DECIMAL2', 45, 20).notNullable().unsigned().comment('Decimal');
          table.datetime('EXPIRY_AT2').nullable().comment('Expiry at, Timestamp.');
          table.datetime('CREATED_AT').notNullable().defaultTo(kx.fn.now()).comment('Creation Timestamp');
        }),
      ],
    });

    const info = await getTableInfo(tableName);

    expect(info.columnInfo).toMatchObject({
      ID: {
        defaultValue: null, type: 'varchar', maxLength: 256, nullable: false,
      },
      VAL: {
        defaultValue: null, type: 'longtext', maxLength: 4294967295, nullable: true,
      },
      BIGINT2: {
        defaultValue: null, type: 'bigint', maxLength: null, nullable: true,
      },
      DECIMAL2: {
        defaultValue: null, type: 'decimal', maxLength: null, nullable: false,
      },
      EXPIRY_AT2: {
        defaultValue: null, type: 'datetime', maxLength: null, nullable: true,
      },
      CREATED_AT: {
        defaultValue: 'CURRENT_TIMESTAMP', type: 'datetime', maxLength: null, nullable: false,
      },
    });
  });

  it('drop table', async () => {
    await getKnex().schema.dropTable(tableName);
  });
});
