const assert = require('assert');
const AutomigrateLib = require('../../lib/index/index');

// Fixture A: memberships — PK, composite UK, two regular indexes, three FKs.
// MySQL auto-creates a KEY entry for each FK with the same name; those are removed by the dialect.
const MEMBERSHIPS_SQL = [
  'CREATE TABLE `memberships` (',
  '  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
  '  `category_id` bigint(20) unsigned NOT NULL,',
  '  `project_id` bigint(20) unsigned NOT NULL,',
  '  `user_id` bigint(20) unsigned NOT NULL,',
  '  `started_at` datetime DEFAULT NULL,',
  '  `ended_at` datetime DEFAULT NULL,',
  '  PRIMARY KEY (`id`),',
  '  UNIQUE KEY `uk_memberships` (`project_id`,`user_id`),',
  '  KEY `idx_memberships_started_at` (`started_at`),',
  '  KEY `idx_memberships_ended_at` (`ended_at`),',
  '  KEY `fk_memberships_category` (`category_id`),',
  '  KEY `fk_memberships_project` (`project_id`),',
  '  KEY `fk_memberships_user` (`user_id`),',
  '  CONSTRAINT `fk_memberships_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),',
  '  CONSTRAINT `fk_memberships_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),',
  '  CONSTRAINT `fk_memberships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
].join('\n');

// Fixture B: file_uploads — PK, composite KEY, single-column KEY, three FKs (no UK).
const FILE_UPLOADS_SQL = [
  'CREATE TABLE `file_uploads` (',
  '  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
  '  `category_id` bigint(20) unsigned NOT NULL,',
  '  `project_id` bigint(20) unsigned NOT NULL,',
  '  `group_uuid` varchar(36) NOT NULL,',
  '  `status` varchar(32) NOT NULL DEFAULT \'WAIT\',',
  '  `creator_id` bigint(20) unsigned NOT NULL,',
  '  PRIMARY KEY (`id`),',
  '  KEY `idx_file_uploads_status` (`project_id`,`status`),',
  '  KEY `idx_file_uploads_group_uuid` (`group_uuid`),',
  '  KEY `fk_file_uploads_category` (`category_id`),',
  '  KEY `fk_file_uploads_project` (`project_id`),',
  '  KEY `fk_file_uploads_creator` (`creator_id`),',
  '  CONSTRAINT `fk_file_uploads_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),',
  '  CONSTRAINT `fk_file_uploads_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),',
  '  CONSTRAINT `fk_file_uploads_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
].join('\n');

function makeKnex(createTableSql) {
  return {
    client: { config: { client: 'mysql' } },
    raw: async () => [[{ 'Create Table': createTableSql }]],
  };
}

function makeNonMysqlKnex() {
  return {
    client: { config: { client: 'pg' } },
  };
}

describe('AutomigrateLib (indexes)', () => {
  describe('non-mysql driver', () => {
    it('throws an error for unsupported drivers', async () => {
      await assert.rejects(
        async () => AutomigrateLib(makeNonMysqlKnex(), 'any_table'),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'Not supported driver. (pg)');
          return true;
        },
      );
    });
  });

  describe('mysql2 driver', () => {
    it('supports the mysql2 driver (same parsing as mysql)', async () => {
      const knex = {
        client: { config: { client: 'mysql2' } },
        raw: async () => [[{ 'Create Table': MEMBERSHIPS_SQL }]],
      };
      const indexes = await AutomigrateLib(knex, 'memberships');
      assert.deepStrictEqual(indexes.pk, [['id']]);
      assert.deepStrictEqual(indexes.uk, { uk_memberships: ['project_id', 'user_id'] });
      assert.strictEqual(typeof indexes.isIndexExists, 'function');
    });
  });

  describe('isIndexExists', () => {
    let indexes;

    beforeAll(async () => {
      indexes = await AutomigrateLib(makeKnex(MEMBERSHIPS_SQL), 'memberships');
    });

    it('returns true when found by exact index name', () => {
      assert.strictEqual(indexes.isIndexExists([], 'idx_memberships_started_at'), true);
    });

    it('returns true when found by key array (single column)', () => {
      assert.strictEqual(indexes.isIndexExists(['started_at'], undefined), true);
    });

    it('returns true when key is passed as a string (auto-wrapped to array)', () => {
      assert.strictEqual(indexes.isIndexExists('started_at', undefined), true);
    });

    it('returns true when found by single-column key array with non-matching name', () => {
      assert.strictEqual(indexes.isIndexExists(['ended_at'], 'nonexistent'), true);
    });

    it('returns false when neither name nor columns match', () => {
      assert.strictEqual(indexes.isIndexExists(['nonexistent'], 'no_such_index'), false);
    });

    it('returns false when name is undefined and no columns match', () => {
      assert.strictEqual(indexes.isIndexExists(['ghost_col'], undefined), false);
    });

    it('returns true by name even if key array does not match', () => {
      // Name match short-circuits before array comparison.
      assert.strictEqual(indexes.isIndexExists(['wrong_col'], 'idx_memberships_started_at'), true);
    });

    it('returns true when found by composite key array (file_uploads fixture)', async () => {
      const idx = await AutomigrateLib(makeKnex(FILE_UPLOADS_SQL), 'file_uploads');
      assert.strictEqual(idx.isIndexExists(['project_id', 'status'], 'nonexistent'), true);
    });

    it('returns false when composite key order differs', async () => {
      const idx = await AutomigrateLib(makeKnex(FILE_UPLOADS_SQL), 'file_uploads');
      assert.strictEqual(idx.isIndexExists(['status', 'project_id'], undefined), false);
    });

    it('returns false when input array is longer than the stored index (length mismatch, fixed)', () => {
      // isArrayEqual now checks a.length === b.length first, so ['started_at'] (len 1)
      // vs ['started_at','extra_col'] (len 2) correctly returns false.
      assert.ok(!indexes.isIndexExists(['started_at', 'extra_col'], undefined));
    });
  });

  describe('isPrimaryKeyExists', () => {
    let indexes;

    beforeAll(async () => {
      indexes = await AutomigrateLib(makeKnex(MEMBERSHIPS_SQL), 'memberships');
    });

    it('returns true for the existing PK column array', () => {
      assert.ok(indexes.isPrimaryKeyExists(['id']));
    });

    it('returns true when PK column is passed as a string', () => {
      assert.ok(indexes.isPrimaryKeyExists('id'));
    });

    it('returns false for a non-existent column', () => {
      assert.strictEqual(indexes.isPrimaryKeyExists(['nonexistent']), false);
    });

    it('returns false for an empty array (length mismatch: 0 !== stored PK length)', () => {
      assert.ok(!indexes.isPrimaryKeyExists([]));
    });

    it('returns true for a composite PK when all columns match', async () => {
      const sql = [
        'CREATE TABLE `order_items` (',
        '  `order_id` bigint NOT NULL,',
        '  `item_id` bigint NOT NULL,',
        '  PRIMARY KEY (`order_id`,`item_id`)',
        ') ENGINE=InnoDB',
      ].join('\n');
      const idx = await AutomigrateLib(makeKnex(sql), 'order_items');
      assert.ok(idx.isPrimaryKeyExists(['order_id', 'item_id']));
    });

    it('returns false for a composite PK when only a subset of columns is given', async () => {
      const sql = [
        'CREATE TABLE `order_items` (',
        '  `order_id` bigint NOT NULL,',
        '  `item_id` bigint NOT NULL,',
        '  PRIMARY KEY (`order_id`,`item_id`)',
        ') ENGINE=InnoDB',
      ].join('\n');
      const idx = await AutomigrateLib(makeKnex(sql), 'order_items');
      // isArrayEqual(['order_id','item_id'], ['order_id']): a[1] ('item_id') !== b[1] (undefined) → false.
      assert.strictEqual(idx.isPrimaryKeyExists(['order_id']), false);
    });

    it('returns false when input array is longer than the stored PK (length mismatch, fixed)', () => {
      // isArrayEqual(['id'], ['id','extra']): 1 === 2 → false. Extra element rejected.
      assert.ok(!indexes.isPrimaryKeyExists(['id', 'extra']));
    });
  });

  describe('isUniqueExists', () => {
    let indexes;

    beforeAll(async () => {
      indexes = await AutomigrateLib(makeKnex(MEMBERSHIPS_SQL), 'memberships');
    });

    it('returns true for the existing composite unique key', () => {
      assert.ok(indexes.isUniqueExists(['project_id', 'user_id']));
    });

    it('returns false for a subset of the unique key columns', () => {
      assert.strictEqual(indexes.isUniqueExists(['project_id']), false);
    });

    it('returns false for a nonexistent column combination', () => {
      assert.strictEqual(indexes.isUniqueExists(['nonexistent']), false);
    });

    it('returns false when key array is empty', () => {
      assert.ok(!indexes.isUniqueExists([]));
    });

    it('returns false when column order differs', () => {
      // isArrayEqual compares element-by-element in order.
      assert.strictEqual(indexes.isUniqueExists(['user_id', 'project_id']), false);
    });

    it('returns true when unique key column is passed as a string', async () => {
      const sql = [
        'CREATE TABLE `t` (',
        '  `id` bigint NOT NULL,',
        '  `email` varchar(128) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `uk_email` (`email`)',
        ') ENGINE=InnoDB',
      ].join('\n');
      const idx = await AutomigrateLib(makeKnex(sql), 't');
      assert.ok(idx.isUniqueExists('email'));
    });

    it('returns false when input array is longer than the stored UK (length mismatch, fixed)', () => {
      // isArrayEqual(['project_id','user_id'], ['project_id','user_id','extra_col']): 2 === 3 → false.
      assert.ok(!indexes.isUniqueExists(['project_id', 'user_id', 'extra_col']));
    });
  });

  describe('isForeignKeyExists', () => {
    let indexes;

    beforeAll(async () => {
      indexes = await AutomigrateLib(makeKnex(MEMBERSHIPS_SQL), 'memberships');
    });

    it('returns true for an existing FK (project_id → projects.id)', () => {
      assert.ok(indexes.isForeignKeyExists('project_id', 'projects.id'));
    });

    it('returns true for an existing FK (user_id → users.id)', () => {
      assert.ok(indexes.isForeignKeyExists('user_id', 'users.id'));
    });

    it('returns true for an existing FK (category_id → categories.id)', () => {
      assert.ok(indexes.isForeignKeyExists('category_id', 'categories.id'));
    });

    it('returns false when the ref table is wrong', () => {
      assert.strictEqual(indexes.isForeignKeyExists('project_id', 'wrong_table.id'), false);
    });

    it('returns false when the ref column is wrong', () => {
      assert.strictEqual(indexes.isForeignKeyExists('project_id', 'projects.wrong_col'), false);
    });

    it('returns false when the source column is wrong', () => {
      assert.strictEqual(indexes.isForeignKeyExists('wrong_col', 'projects.id'), false);
    });

    it('returns false for a completely nonexistent FK', () => {
      assert.strictEqual(indexes.isForeignKeyExists('ghost', 'ghost.id'), false);
    });
  });

  describe('early-exit branch coverage', () => {
    it('isUniqueExists: exits forEach early after first match when multiple UKs exist', async () => {
      // With 2 unique keys, matching the first one sets exist=true.
      // The second forEach iteration then hits the early-exit `if (exist) return;` branch.
      const sql = [
        'CREATE TABLE `t` (',
        '  `id` bigint NOT NULL,',
        '  `email` varchar(128) DEFAULT NULL,',
        '  `username` varchar(64) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `uk_email` (`email`),',
        '  UNIQUE KEY `uk_username` (`username`)',
        ') ENGINE=InnoDB',
      ].join('\n');
      const idx = await AutomigrateLib(makeKnex(sql), 't');
      assert.ok(idx.isUniqueExists(['email']));
      assert.ok(idx.isUniqueExists(['username']));
      assert.ok(!idx.isUniqueExists(['nonexistent']));
    });

    it('isPrimaryKeyExists: exits forEach early after first match when pk has multiple entries', async () => {
      // MySQL never produces two PRIMARY KEY lines, but the defensive early-exit
      // branch can only be reached when pk.length > 1.
      // This malformed SQL fixture explicitly tests that early-exit branch.
      const sql = [
        'CREATE TABLE `t` (',
        '  `id` bigint NOT NULL,',
        '  `alt_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  PRIMARY KEY (`alt_id`)',
        ') ENGINE=InnoDB',
      ].join('\n');
      const idx = await AutomigrateLib(makeKnex(sql), 't');
      assert.ok(idx.isPrimaryKeyExists(['id']));
      assert.ok(idx.isPrimaryKeyExists(['alt_id']));
      assert.ok(!idx.isPrimaryKeyExists(['nonexistent']));
    });
  });

  describe('full index structure from mysql dialect', () => {
    it('returns the correct parsed structure for memberships', async () => {
      const indexes = await AutomigrateLib(makeKnex(MEMBERSHIPS_SQL), 'memberships');

      assert.deepStrictEqual(indexes.pk, [['id']]);
      assert.deepStrictEqual(indexes.uk, { uk_memberships: ['project_id', 'user_id'] });
      assert.deepStrictEqual(indexes.key, {
        idx_memberships_started_at: ['started_at'],
        idx_memberships_ended_at: ['ended_at'],
      });
      assert.ok('fk_memberships_category' in indexes.fk);
      assert.ok('fk_memberships_project' in indexes.fk);
      assert.ok('fk_memberships_user' in indexes.fk);
    });

    it('returns the correct parsed structure for file_uploads (composite KEY, no UK)', async () => {
      const indexes = await AutomigrateLib(makeKnex(FILE_UPLOADS_SQL), 'file_uploads');

      assert.deepStrictEqual(indexes.pk, [['id']]);
      assert.deepStrictEqual(indexes.uk, {});
      assert.deepStrictEqual(indexes.key, {
        idx_file_uploads_status: ['project_id', 'status'],
        idx_file_uploads_group_uuid: ['group_uuid'],
      });
      assert.strictEqual(Object.keys(indexes.fk).length, 3);
      assert.ok('fk_file_uploads_category' in indexes.fk);
      assert.ok('fk_file_uploads_project' in indexes.fk);
      assert.ok('fk_file_uploads_creator' in indexes.fk);

      assert.ok(indexes.isIndexExists(['project_id', 'status'], 'idx_file_uploads_status'));
      assert.ok(indexes.isIndexExists(['group_uuid'], undefined));
      assert.ok(indexes.isForeignKeyExists('project_id', 'projects.id'));
      assert.ok(indexes.isForeignKeyExists('creator_id', 'users.id'));
    });
  });
});
