import path from 'path';
import knex, { Knex } from 'knex';
import Automigrate from '../src/automigrate';

const config = require('./migration/knex.config');

const tableName = `TEST_TS_${new Date().getTime()}`;
const viewName = `${tableName}_VIEW`;

const sharedKnex: Knex = knex(config);
const getKnex = () => sharedKnex;

const getTableInfo = async (name: string) => {
  const kx = getKnex();
  const columnInfo = await kx.from(name).columnInfo();
  const schema = ((await kx.raw(`SHOW CREATE TABLE \`${name}\``))[0][0]['Create Table'] as string)
    .split('`')
    .join('')
    .split('\n')
    .map((e: string) => e.trim());

  return { columnInfo, schema };
};

const getViewInfo = async (name: string) => {
  const kx = getKnex();
  const columnInfo = await kx.from(name).columnInfo();
  const schema = ((await kx.raw(`SHOW CREATE VIEW \`${name}\``))[0][0]['Create View'] as string)
    .split('`')
    .join('')
    .split('\n')
    .map((e: string) => e.trim());

  return { columnInfo, schema };
};

describe('knex-automigrate (ts)', () => {
  afterAll(async () => {
    await sharedKnex.destroy();
  });

  it('create new table', async () => {
    await Automigrate({
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
          table.index(['VAL'], 'VAL_Fulltext_Index_name', { indexType: 'FULLTEXT', parser: 'ngram' } as any);
        }),
      ],
      views: (migrator, kx) => [
        migrator(viewName, (view) => {
          view.columns(['ID', 'ID_2', 'ID_3', 'VAL', 'BIGINT', 'DECIMAL', 'EXPIRY_AT', 'CREATED_AT']);
          view.as(
            kx(tableName)
              .select('ID', 'ID_2', 'ID_3', 'VAL', 'BIGINT', 'DECIMAL', 'EXPIRY_AT', 'CREATED_AT'),
          );
        }),
      ],
    });

    const tableInfo = await getTableInfo(tableName);

    expect(tableInfo.columnInfo).toMatchObject({
      ID: { defaultValue: null, type: 'varchar', maxLength: 128, nullable: false },
      ID_2: { defaultValue: null, type: 'varchar', maxLength: 128, nullable: false },
      VAL: { defaultValue: null, type: 'longtext', nullable: false },
      CREATED_AT: { defaultValue: 'CURRENT_TIMESTAMP', type: 'datetime', nullable: false },
    });

    expect(tableInfo.schema.find((stmt: string) => stmt.includes('PRIMARY KEY'))!.indexOf('ID,ID_2')).toBeGreaterThanOrEqual(0);
    expect(tableInfo.schema.find((stmt: string) => stmt.includes('VAL_Fulltext_Index_name'))).toMatch(/FULLTEXT KEY VAL_Fulltext_Index_name.*WITH PARSER ngram/);

    const viewInfo = await getViewInfo(viewName);
    expect(viewInfo.columnInfo).toMatchObject({
      ID: { defaultValue: null, type: 'varchar', maxLength: 128, nullable: false },
    });
  });

  it('modify existing columns', async () => {
    await Automigrate({
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
      ID: { defaultValue: null, type: 'varchar', maxLength: 256, nullable: false },
      VAL: { defaultValue: null, type: 'longtext', nullable: true },
      BIGINT: { defaultValue: null, type: 'int', maxLength: null, nullable: true },
    });
  });

  it('drop existing columns', async () => {
    await Automigrate({
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
    expect(info.columnInfo).not.toHaveProperty('BIGINT');
    expect(info.columnInfo).not.toHaveProperty('DECIMAL');
    expect(info.columnInfo).toHaveProperty('ID');
    expect(info.columnInfo).toHaveProperty('VAL');
  });

  it('update existing view definition', async () => {
    await Automigrate({
      verbose: false,
      config,
      cwd: __dirname,
      views: (migrator, kx) => [
        migrator(viewName, (view) => {
          view.as(
            kx(tableName).select('ID', 'VAL', 'CREATED_AT'),
          );
        }),
      ],
    });

    const viewInfo = await getViewInfo(viewName);
    expect(viewInfo.columnInfo).toMatchObject({
      ID: { defaultValue: null, type: 'varchar', maxLength: 256, nullable: false },
      VAL: { defaultValue: null, type: 'longtext', nullable: true },
    });
  });

  it('drop table', async () => {
    await getKnex().schema.dropTable(tableName);
    await getKnex().schema.dropView(viewName);
  });

  describe('scenario: file-based migration', () => {
    const fileViews = ['STUDENT_INFORMATION', 'KEYVALS_ID2'];
    const fileTables = [
      'STUDENTS_CLASSES_DETAIL', 'STUDENTS_CLASSES', 'STUDENTS_DETAIL',
      'CLASSES_DETAIL', 'CLASSES', 'STUDENTS', 'PHONES', 'KEYVALS_ID',
    ];

    const dropAll = async () => {
      await Promise.all(fileViews.map((v) => getKnex().schema.dropViewIfExists(v)));
      await fileTables.reduce(
        (chain, t) => chain.then(() => getKnex().schema.dropTableIfExists(t)),
        Promise.resolve() as Promise<void>,
      );
    };

    beforeAll(dropAll);
    afterAll(dropAll);

    it('creates all tables and views defined in migration files', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: path.join(__dirname, 'migration'),
      });

      const kvInfo = await getKnex().from('KEYVALS_ID').columnInfo();
      expect(kvInfo).toMatchObject({
        ID: { type: 'varchar', maxLength: 128, nullable: false },
        VAL: { type: 'longtext', nullable: false },
      });

      const kvSchema = (await getKnex().raw('SHOW CREATE TABLE `KEYVALS_ID`'))[0][0]['Create Table'] as string;
      expect(kvSchema).toMatch(/FULLTEXT KEY.*FT_IDX_KEYVALS_ID_VAL.*WITH PARSER.*ngram/);
    });

    it('is idempotent — running twice produces the same structure', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: path.join(__dirname, 'migration'),
      });

      const kvInfo = await getKnex().from('KEYVALS_ID').columnInfo();
      expect(Object.keys(kvInfo).sort()).toEqual(
        ['ID', 'VAL', 'BIGINT', 'DECIMAL', 'EXPIRY_AT', 'CREATED_AT'].sort(),
      );
    });
  });
});
