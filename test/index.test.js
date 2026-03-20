const path = require('path');
const knex = require('knex');
const automigrate = require('..');
const config = require('./migration/knex.config');

const tableName = `TEST_${new Date().getTime()}`;
const viewName = `${tableName}_VIEW`;

const sharedKnex = knex(config);
const getKnex = () => sharedKnex;

const getTableInfo = async (name) => {
  const kx = getKnex();
  const columnInfo = await kx.from(name).columnInfo();
  const schema = (await kx.raw(`SHOW CREATE TABLE \`${name}\``))[0][0]['Create Table']
    .split('`')
    .join('')
    .split('\n')
    .map((e) => e.trim());

  return { columnInfo, schema };
};

const getViewInfo = async (name) => {
  const kx = getKnex();
  const columnInfo = await kx.from(name).columnInfo();
  const schema = (await kx.raw(`SHOW CREATE VIEW \`${name}\``))[0][0]['Create View']
    .split('`')
    .join('')
    .split('\n')
    .map((e) => e.trim());

  return { columnInfo, schema };
};

describe('knex-automigrate', () => {
  afterAll(async () => {
    await sharedKnex.destroy();
  });

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
          table.index(['VAL'], 'VAL_Fulltext_Index_name', { indexType: 'FULLTEXT', parser: 'ngram' });
        }),
      ],
      views: (migrator, kx) => [
        migrator(viewName, (view) => {
          view.columns(['ID', 'ID_2', 'ID_3', 'VAL', 'BIGINT', 'DECIMAL', 'EXPIRY_AT', 'CREATED_AT']);
          view.as(
            kx(tableName)
              .select('ID', 'ID_2', 'ID_3', 'VAL', 'BIGINT', 'DECIMAL', 'EXPIRY_AT', 'CREATED_AT')
            ,
          );
        }),
      ],
    });

    const tableInfo = await getTableInfo(tableName);

    expect(tableInfo.columnInfo).toMatchObject({
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

    expect(tableInfo.schema.find((stmt) => stmt.includes('CREATED_AT')).indexOf('Created at')).toBeGreaterThanOrEqual(0);
    expect(tableInfo.schema.find((stmt) => stmt.includes('PRIMARY KEY')).indexOf('ID,ID_2')).toBeGreaterThanOrEqual(0);
    expect(tableInfo.schema.find((stmt) => stmt.includes('Unique_Key_Name')).indexOf('ID_2,ID_3')).toBeGreaterThanOrEqual(0);
    expect(tableInfo.schema.find((stmt) => stmt.includes('ID_Index_Name')).indexOf('ID_3,ID_2,ID')).toBeGreaterThanOrEqual(0);
    expect(tableInfo.schema.find((stmt) => stmt.includes('ID_Fulltext_Index_Name')).indexOf('ID')).toBeGreaterThanOrEqual(0);
    expect(tableInfo.schema.find((stmt) => stmt.includes('VAL_Fulltext_Index_name'))).toMatch(/FULLTEXT KEY VAL_Fulltext_Index_name.*WITH PARSER ngram/);

    const viewInfo = await getViewInfo(viewName);

    expect(viewInfo.columnInfo).toMatchObject({
      ID: {
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

    expect(viewInfo.schema.some((stmt) => stmt.includes('CREATED_AT'))).toEqual(true);
  });

  it('add columns with an existing fulltext index', async () => {
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
          table.index(['VAL'], 'VAL_Fulltext_Index_name', { indexType: 'FULLTEXT', parser: 'ngram' });
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
    expect(info.schema.find((stmt) => stmt.includes('VAL_Fulltext_Index_name'))).toMatch(/FULLTEXT KEY VAL_Fulltext_Index_name.*WITH PARSER ngram/);
  });

  it('modify existing columns', async () => {
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
    expect(info.schema.find((stmt) => stmt.includes('VAL_Fulltext_Index_name'))).toBe(undefined);
  });

  it('drop existing columns', async () => {
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

    // Columns omitted from schema should be dropped.
    expect(info.columnInfo).not.toHaveProperty('BIGINT');
    expect(info.columnInfo).not.toHaveProperty('DECIMAL');
    expect(info.columnInfo).not.toHaveProperty('EXPIRY_AT');

    // Columns still in schema should be retained.
    expect(info.columnInfo).toHaveProperty('ID');
    expect(info.columnInfo).toHaveProperty('VAL');
    expect(info.columnInfo).toHaveProperty('CREATED_AT');
  });

  it('add new columns', async () => {
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

  it('update existing view definition', async () => {
    // The view already exists (created in the first test).
    // Running again triggers the createViewOrReplace path. The new definition
    // selects only the columns that remain in the table after prior migration steps.
    await automigrate({
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
      ID: {
        defaultValue: null, type: 'varchar', maxLength: 256, nullable: false,
      },
      VAL: {
        defaultValue: null, type: 'longtext', maxLength: 4294967295, nullable: true,
      },
      CREATED_AT: {
        defaultValue: 'CURRENT_TIMESTAMP', type: 'datetime', maxLength: null, nullable: false,
      },
    });
  });

  it('drop table', async () => {
    await getKnex().schema.dropTable(tableName);
    await getKnex().schema.dropView(viewName);
  });

  // -------------------------------------------------------------------------
  // Scenario tests — each uses isolated table names and cleans up in afterAll
  // -------------------------------------------------------------------------

  describe('scenario: initRows callback', () => {
    const seedTable = `${tableName}_SEED`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(seedTable);
    });

    it('inserts seed rows on first migration', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(seedTable, (table) => {
            table.bigIncrements('id');
            table.string('name', 64).notNullable();
          }, () => [{ name: 'alice' }, { name: 'bob' }]),
        ],
      });

      const rows = await getKnex().from(seedTable).select();
      expect(rows.length).toBe(2);
    });

    it('does not re-insert seed rows when rows already exist', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(seedTable, (table) => {
            table.bigIncrements('id');
            table.string('name', 64).notNullable();
          }, () => [{ name: 'alice' }, { name: 'bob' }]),
        ],
      });

      const rows = await getKnex().from(seedTable).select();
      expect(rows.length).toBe(2);
    });
  });

  describe('scenario: first new column positioned with .first()', () => {
    const firstTable = `${tableName}_FIRST`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(firstTable);
    });

    it('creates base table', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(firstTable, (table) => {
            table.bigIncrements('id');
            table.string('name', 64);
          }),
        ],
      });

      const info = await getKnex().from(firstTable).columnInfo();
      expect(info).toHaveProperty('id');
    });

    it('positions a new leading column with .first() when no prevColumnName exists', async () => {
      // 'code' is a new column and is the first in the schema list, so .first() is called.
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(firstTable, (table) => {
            table.string('code', 32).notNullable().defaultTo('');
            table.bigIncrements('id');
            table.string('name', 64);
          }),
        ],
      });

      const info = await getKnex().from(firstTable).columnInfo();
      expect(info).toHaveProperty('code');
    });
  });

  describe('scenario: bigIncrements skipped when PK already exists', () => {
    const pkTable = `${tableName}_PK`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(pkTable);
    });

    it('creates table with bigIncrements PK', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(pkTable, (table) => {
            table.bigIncrements('id');
            table.string('name', 64);
          }),
        ],
      });

      const info = await getKnex().from(pkTable).columnInfo();
      expect(info).toHaveProperty('id');
    });

    it('skips bigIncrements when PK already exists and adds extra column', async () => {
      // On the second migration the table already has a PK (id).
      // bigIncrements is skipped; extra column is still added.
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(pkTable, (table) => {
            table.bigIncrements('id');
            table.string('name', 64);
            table.string('extra', 32);
          }),
        ],
      });

      const info = await getKnex().from(pkTable).columnInfo();
      expect(info).toHaveProperty('extra');
    });
  });

  describe('scenario: new FULLTEXT index with parser on existing table', () => {
    const ftTable = `${tableName}_FT`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(ftTable);
    });

    it('creates base table without fulltext index', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(ftTable, (table) => {
            table.bigIncrements('id');
            table.text('body', 'longtext');
          }),
        ],
      });
    });

    it('adds a new FULLTEXT index with parser to an existing table', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(ftTable, (table) => {
            table.bigIncrements('id');
            table.text('body', 'longtext');
            table.index(['body'], 'ft_body_ngram', { indexType: 'FULLTEXT', parser: 'ngram' });
          }),
        ],
      });

      const schema = (await getKnex().raw(`SHOW CREATE TABLE \`${ftTable}\``))[0][0]['Create Table'];
      // MySQL may wrap the parser clause in a version comment: /*!50100 WITH PARSER `ngram` */
      expect(schema).toMatch(/FULLTEXT KEY.*ft_body_ngram.*WITH PARSER.*ngram/);
    });

    it('skips FULLTEXT index creation when it already exists', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(ftTable, (table) => {
            table.bigIncrements('id');
            table.text('body', 'longtext');
            table.index(['body'], 'ft_body_ngram', { indexType: 'FULLTEXT', parser: 'ngram' });
          }),
        ],
      });
    });
  });

  describe('scenario: foreign key migration', () => {
    const parentTable = `${tableName}_FKPARENT`;
    const childTable = `${tableName}_FKCHILD`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(childTable);
      await getKnex().schema.dropTableIfExists(parentTable);
    });

    it('creates parent and child tables with FK constraint and regular index', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(parentTable, (table) => {
            table.bigIncrements('id').unsigned();
            table.string('name', 64);
          }),
          migrator(childTable, (table) => {
            table.bigIncrements('id').unsigned();
            table.bigInteger('parent_id').unsigned()
              .references(`${parentTable}.id`);
            table.string('status', 32);
            table.index(['status'], 'idx_child_status');
          }),
        ],
      });

      const info = await getKnex().from(childTable).columnInfo();
      expect(info).toHaveProperty('parent_id');
    });

    it('skips FK creation when FK already exists; regular index retained', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(parentTable, (table) => {
            table.bigIncrements('id').unsigned();
            table.string('name', 64);
          }),
          migrator(childTable, (table) => {
            table.bigIncrements('id').unsigned();
            table.bigInteger('parent_id').unsigned()
              .references(`${parentTable}.id`);
            table.string('status', 32);
            table.index(['status'], 'idx_child_status');
          }),
        ],
      });
    });

    it('drops FK constraint before removing the FK column', async () => {
      // status and its index are kept in the schema to avoid a conflict where MySQL
      // implicitly removes idx_child_status on column drop and the code also tries
      // to explicitly dropIndex the same index in the same ALTER TABLE.
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(parentTable, (table) => {
            table.bigIncrements('id').unsigned();
            table.string('name', 64);
          }),
          migrator(childTable, (table) => {
            table.bigIncrements('id').unsigned();
            // parent_id intentionally omitted → FK constraint dropped then column dropped
            table.string('status', 32);
            table.index(['status'], 'idx_child_status');
          }),
        ],
      });

      const info = await getKnex().from(childTable).columnInfo();
      expect(info).not.toHaveProperty('parent_id');
      expect(info).toHaveProperty('status');
    });
  });

  describe('scenario: safe mode — skip column drops', () => {
    const safeTable = `${tableName}_SAFE`;

    afterAll(async () => {
      await getKnex().schema.dropTableIfExists(safeTable);
    });

    it('creates table with extra columns', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: __dirname,
        tables: (migrator) => [
          migrator(safeTable, (table) => {
            table.bigIncrements('id');
            table.string('keep_col', 64);
            table.string('drop_col', 64);
          }),
        ],
      });
    });

    it('skips column drop and emits warning when safe mode is enabled', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await automigrate({
        verbose: true,
        config: { ...config, safe: true },
        cwd: __dirname,
        tables: (migrator) => [
          migrator(safeTable, (table) => {
            table.bigIncrements('id');
            table.string('keep_col', 64);
            // drop_col intentionally omitted — would be dropped without safe mode
          }),
        ],
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Skip Drop Column]'),
      );

      // Column is preserved because safe mode is enabled.
      const info = await getKnex().from(safeTable).columnInfo();
      expect(info).toHaveProperty('drop_col');

      warnSpy.mockRestore();
    });
  });

  describe('scenario: view migration rejects when view name collides with a table', () => {
    it('rejects automigrate when the view target name belongs to an existing table', async () => {
      const conflictTable = `${tableName}_CONFLICT`;

      await getKnex().schema.createTable(conflictTable, (t) => {
        t.bigIncrements('id');
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await expect(
          automigrate({
            config,
            cwd: __dirname,
            views: (migrator, kx) => [
              migrator(conflictTable, (view) => {
                view.as(kx(conflictTable).select('id'));
              }),
            ],
          }),
        ).rejects.toThrow(`* ${conflictTable} must be a view, but a table already exists with this name.`);

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('migration failed'),
        );
      } finally {
        errorSpy.mockRestore();
        await getKnex().schema.dropTableIfExists(conflictTable);
      }
    });
  });

  // -------------------------------------------------------------------------
  // File-based migration — loads table_*.js and view_*.js files from cwd
  // -------------------------------------------------------------------------

  describe('file-based migration', () => {
    // All tables/views produced by test/migration/table_*.js and view_*.js files.
    // Tables are listed in FK-safe drop order (STUDENTS before PHONES).
    const fileViews = ['STUDENT_INFORMATION', 'KEYVALS_ID2'];
    const fileTables = [
      'STUDENTS_CLASSES_DETAIL',
      'STUDENTS_CLASSES',
      'STUDENTS_DETAIL',
      'CLASSES_DETAIL',
      'CLASSES',
      'STUDENTS',
      'PHONES',
      'KEYVALS_ID',
    ];

    // Views are dropped in parallel (no FK deps).
    // Tables are dropped sequentially to respect FK order (STUDENTS before PHONES).
    const dropAll = async () => {
      await Promise.all(fileViews.map((v) => getKnex().schema.dropViewIfExists(v)));
      await fileTables.reduce(
        (chain, t) => chain.then(() => getKnex().schema.dropTableIfExists(t)),
        Promise.resolve(),
      );
    };

    beforeAll(dropAll);
    afterAll(dropAll);

    it('creates all tables and views defined in migration files and verifies structure', async () => {
      await automigrate({
        verbose: false,
        config,
        cwd: path.join(__dirname, 'migration'),
      });

      // --- KEYVALS_ID ---
      const kvInfo = await getKnex().from('KEYVALS_ID').columnInfo();
      expect(kvInfo).toMatchObject({
        ID: { type: 'varchar', maxLength: 128, nullable: false },
        VAL: { type: 'longtext', nullable: false },
        BIGINT: { type: 'bigint', nullable: true },
        DECIMAL: { type: 'decimal', nullable: true },
        EXPIRY_AT: { type: 'datetime', nullable: true },
        CREATED_AT: { type: 'datetime', nullable: false },
      });

      const kvSchema = (await getKnex().raw('SHOW CREATE TABLE `KEYVALS_ID`'))[0][0]['Create Table'];
      expect(kvSchema).toMatch(/FULLTEXT KEY.*FT_IDX_KEYVALS_ID_VAL.*WITH PARSER.*ngram/);

      // --- PHONES ---
      const phonesInfo = await getKnex().from('PHONES').columnInfo();
      expect(phonesInfo).toMatchObject({
        PHONE_ID: { type: 'bigint', nullable: false },
        PHONE: { type: 'varchar', maxLength: 128, nullable: false },
      });

      // --- STUDENTS ---
      const studentsInfo = await getKnex().from('STUDENTS').columnInfo();
      expect(studentsInfo).toMatchObject({
        STUDENT_ID: { type: 'bigint', nullable: false },
        NAME: { type: 'varchar', nullable: false },
        HOME_PHONE_ID: { type: 'bigint', nullable: true },
        MOBILE_PHONE_ID: { type: 'bigint', nullable: true },
      });

      const studentsSchema = (await getKnex().raw('SHOW CREATE TABLE `STUDENTS`'))[0][0]['Create Table'];
      expect(studentsSchema).toMatch(/FOREIGN KEY.*HOME_PHONE_ID.*REFERENCES.*PHONES/);
      expect(studentsSchema).toMatch(/FOREIGN KEY.*MOBILE_PHONE_ID.*REFERENCES.*PHONES/);

      // --- STUDENTS_CLASSES ---
      const scSchema = (await getKnex().raw('SHOW CREATE TABLE `STUDENTS_CLASSES`'))[0][0]['Create Table'];
      expect(scSchema).toMatch(/UNIQUE KEY.*UK_STUDENTS_CLASSES.*STUDENT_ID.*CLASS_ID/);

      // --- KEYVALS_ID2 view ---
      const kv2Info = await getKnex().from('KEYVALS_ID2').columnInfo();
      expect(kv2Info).toHaveProperty('VAL');
      expect(kv2Info).toHaveProperty('CREATED_AT');
      expect(kv2Info).toHaveProperty('EXPIRY_AT');
      expect(Object.keys(kv2Info).length).toBe(3);

      // --- STUDENT_INFORMATION view ---
      const siInfo = await getKnex().from('STUDENT_INFORMATION').columnInfo();
      expect(siInfo).toHaveProperty('student_id');
      expect(siInfo).toHaveProperty('name');
      expect(siInfo).toHaveProperty('home_phone_number');
      expect(siInfo).toHaveProperty('mobile_phone_number');
      expect(siInfo).toHaveProperty('email');
    });

    it('is idempotent — running the migration twice produces the same structure', async () => {
      // Run again on already-existing tables/views.
      await automigrate({
        verbose: false,
        config,
        cwd: path.join(__dirname, 'migration'),
      });

      const kvInfo = await getKnex().from('KEYVALS_ID').columnInfo();
      expect(Object.keys(kvInfo).sort()).toEqual(
        ['ID', 'VAL', 'BIGINT', 'DECIMAL', 'EXPIRY_AT', 'CREATED_AT'].sort(),
      );

      const siInfo = await getKnex().from('STUDENT_INFORMATION').columnInfo();
      expect(Object.keys(siInfo).sort()).toEqual(
        ['student_id', 'name', 'home_phone_number', 'mobile_phone_number', 'email'].sort(),
      );
    });
  });
});
