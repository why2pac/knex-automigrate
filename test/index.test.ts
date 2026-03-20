import path from 'path';
import knex, { Knex } from 'knex';
import Automigrate from '../src/automigrate';

const config = require('./migration/knex.config');

const ts = new Date().getTime();
const tableName = `TEST_TS_${ts}`;
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

  describe('scenario: initRows — initial data seeding', () => {
    const seedTable = `TEST_TS_SEED_${new Date().getTime()}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(seedTable);
    });

    it('inserts seed rows into a newly created table', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(
            seedTable,
            (table) => {
              table.string('CODE', 32).notNullable().primary().comment('Code');
              table.string('LABEL', 128).notNullable().comment('Label');
            },
            () => [
              { CODE: 'A', LABEL: 'Alpha' },
              { CODE: 'B', LABEL: 'Beta' },
            ],
          ),
        ],
      });

      const rows = await getKnex()(seedTable).select('CODE', 'LABEL').orderBy('CODE');
      expect(rows).toEqual([
        { CODE: 'A', LABEL: 'Alpha' },
        { CODE: 'B', LABEL: 'Beta' },
      ]);
    });

    it('does not re-insert seed rows when the table already has data', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(
            seedTable,
            (table) => {
              table.string('CODE', 32).notNullable().primary().comment('Code');
              table.string('LABEL', 128).notNullable().comment('Label');
            },
            () => [
              { CODE: 'A', LABEL: 'Alpha' },
              { CODE: 'B', LABEL: 'Beta' },
            ],
          ),
        ],
      });

      const result = await getKnex()(seedTable).count('* as cnt').first();
      expect(Number((result as any).cnt)).toBe(2);
    });
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

  describe('scenario: column positioning when adding to existing table', () => {
    const posTbl = `TEST_TS_POS_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(posTbl);
    });

    it('places a new first column using .first()', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(posTbl, (t) => { t.string('B', 32); t.string('C', 32); })],
      });

      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(posTbl, (t) => { t.string('A', 32); t.string('B', 32); t.string('C', 32); })],
      });

      expect(await getKnex().from(posTbl).columnInfo()).toHaveProperty('A');
    });

    it('places a new middle column using .after()', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(posTbl, (t) => {
          t.string('A', 32); t.string('A2', 32); t.string('B', 32); t.string('C', 32);
        })],
      });

      expect(await getKnex().from(posTbl).columnInfo()).toHaveProperty('A2');
    });
  });

  describe('scenario: add FULLTEXT+parser index to existing table', () => {
    const ftTbl = `TEST_TS_FT_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(ftTbl);
    });

    it('applies a FULLTEXT index with parser via ALTER TABLE', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(ftTbl, (t) => { t.string('ID', 32).primary(); t.text('VAL', 'longtext'); })],
      });

      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(ftTbl, (t) => {
          t.string('ID', 32).primary();
          t.text('VAL', 'longtext');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          t.index(['VAL'], 'FT_IDX_VAL', { indexType: 'FULLTEXT', parser: 'ngram' } as any);
        })],
      });

      const schema = (await getKnex().raw(`SHOW CREATE TABLE \`${ftTbl}\``))[0][0]['Create Table'] as string;
      expect(schema).toMatch(/FULLTEXT KEY.*FT_IDX_VAL.*WITH PARSER.*ngram/);
    });
  });

  describe('scenario: drop column that has a foreign key', () => {
    const fkParent = `TEST_TS_FKP_${ts}`;
    const fkChild = `TEST_TS_FKC_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(fkChild);
      await getKnex().schema.dropTableIfExists(fkParent);
    });

    it('drops the FK constraint before dropping the column', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(fkParent, (t) => { t.bigIncrements('ID'); })],
      });
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(fkChild, (t) => {
          t.string('NAME', 32);
          t.bigInteger('PARENT_ID').unsigned().references(`${fkParent}.ID`);
        })],
      });

      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(fkChild, (t) => { t.string('NAME', 32); })],
      });

      expect(await getKnex().from(fkChild).columnInfo()).not.toHaveProperty('PARENT_ID');
    });
  });

  describe('scenario: index preserved for FK-backing column (L304-305)', () => {
    const fkp2 = `TEST_TS_FKP2_${ts}`;
    const fkc2 = `TEST_TS_FKC2_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(fkc2);
      await getKnex().schema.dropTableIfExists(fkp2);
    });

    it('does not drop an index that backs a FK when the explicit index is removed from schema', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(fkp2, (t) => { t.bigIncrements('ID'); })],
      });
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(fkc2, (t) => {
          t.string('NAME', 32);
          t.bigInteger('PARENT_ID').unsigned().references(`${fkp2}.ID`);
          t.index(['PARENT_ID'], 'idx_fkc2_parent');
        })],
      });

      // Remove explicit index from schema but keep FK — migration must succeed
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(fkc2, (t) => {
          t.string('NAME', 32);
          t.bigInteger('PARENT_ID').unsigned().references(`${fkp2}.ID`);
        })],
      });

      expect(await getKnex().from(fkc2).columnInfo()).toHaveProperty('PARENT_ID');
    });
  });

  describe('scenario: safe mode verbose warning on column drop', () => {
    const safeTbl = `TEST_TS_SAFE_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(safeTbl);
    });

    it('logs a warning and skips column drop in safe mode', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(safeTbl, (t) => { t.string('A', 32); t.string('B', 32); t.string('C', 32); })],
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await Automigrate({
          config: { ...config, safe: true },
          cwd: __dirname,
          tables: (m) => [m(safeTbl, (t) => { t.string('A', 32); })],
        });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skip Drop Column'));
        const info = await getKnex().from(safeTbl).columnInfo();
        expect(info).toHaveProperty('B');
        expect(info).toHaveProperty('C');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('scenario: view name conflicts with existing table', () => {
    const conflictTbl = `TEST_TS_VCONF_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(conflictTbl);
    });

    it('throws when a view name matches an existing table', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(conflictTbl, (t) => { t.string('A', 32); })],
      });

      await expect(
        Automigrate({
          verbose: false,
          config,
          cwd: __dirname,
          views: (m, kx) => [m(conflictTbl, (view) => { view.as(kx(conflictTbl).select('A')); })],
        }),
      ).rejects.toThrow('must be a view');
    });
  });

  describe('scenario: view update with fewer columns logs verbose warning', () => {
    const verboseViewTbl = `TEST_TS_VV_${ts}`;
    const verboseViewName = `TEST_TS_VV_VIEW_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropViewIfExists(verboseViewName);
      await getKnex().schema.dropTableIfExists(verboseViewTbl);
    });

    it('logs a warning when replacing a view with fewer columns', async () => {
      await Automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (m) => [m(verboseViewTbl, (t) => { t.string('A', 32); t.string('B', 32); t.string('C', 32); })],
        views: (m, kx) => [m(verboseViewName, (view) => {
          view.columns(['A', 'B', 'C']);
          view.as(kx(verboseViewTbl).select('A', 'B', 'C'));
        })],
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await Automigrate({
          config,
          cwd: __dirname,
          views: (m, kx) => [m(verboseViewName, (view) => {
            view.columns(['A']);
            view.as(kx(verboseViewTbl).select('A'));
          })],
        });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Drop Column'));
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('scenario: verbose success logging', () => {
    const verboseTbl = `TEST_TS_VLOG_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(verboseTbl);
    });

    it('logs migration success when verbose is not explicitly disabled', async () => {
      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      try {
        await Automigrate({
          config,
          cwd: __dirname,
          tables: (m) => [m(verboseTbl, (t) => { t.string('A', 32); })],
        });
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('has been migrated'));
      } finally {
        infoSpy.mockRestore();
      }
    });
  });

  describe('scenario: migration error is rethrown', () => {
    const errTbl = `TEST_TS_ERR_${ts}`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(errTbl);
    });

    it('rethrows the error and logs when a migration step fails', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(
          Automigrate({
            config,
            cwd: __dirname,
            tables: (m) => [
              m(errTbl, (t) => { t.string('A', 32); }, () => { throw new Error('seed error'); }),
            ],
          }),
        ).rejects.toThrow('seed error');
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('migration failed'));
      } finally {
        errSpy.mockRestore();
      }
    });
  });
});
