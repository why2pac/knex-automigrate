import assert from 'assert';
import { loadIndexes, IndexResult } from '../../src/index/index';

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

const FILE_UPLOADS_SQL = [
  'CREATE TABLE `file_uploads` (',
  '  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
  '  `category_id` bigint(20) unsigned NOT NULL,',
  '  `project_id` bigint(20) unsigned NOT NULL,',
  '  `group_uuid` varchar(36) NOT NULL,',
  "  `status` varchar(32) NOT NULL DEFAULT 'WAIT',",
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

function makeKnex(createTableSql: string): any {
  return {
    client: { config: { client: 'mysql' } },
    raw: async () => [[{ 'Create Table': createTableSql }]],
  };
}

function makeNonMysqlKnex(): any {
  return {
    client: { config: { client: 'pg' } },
  };
}

describe('AutomigrateLib indexes (ts)', () => {
  describe('non-mysql driver', () => {
    it('throws an error for unsupported drivers', async () => {
      await assert.rejects(
        async () => loadIndexes(makeNonMysqlKnex(), 'any_table'),
        (err: any) => {
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
      } as any;
      const indexes = await loadIndexes(knex, 'memberships');
      assert.deepStrictEqual(indexes.pk, [['id']]);
      assert.deepStrictEqual(indexes.uk, { uk_memberships: ['project_id', 'user_id'] });
      assert.ok(indexes instanceof IndexResult);
    });
  });

  describe('isIndexExists', () => {
    let indexes: IndexResult;

    beforeAll(async () => {
      indexes = await loadIndexes(makeKnex(MEMBERSHIPS_SQL), 'memberships');
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

    it('returns false when neither name nor columns match', () => {
      assert.strictEqual(indexes.isIndexExists(['nonexistent'], 'no_such_index'), false);
    });

    it('returns true by name even if key array does not match', () => {
      assert.strictEqual(indexes.isIndexExists(['wrong_col'], 'idx_memberships_started_at'), true);
    });

    it('returns false when input array is longer than the stored index', () => {
      assert.ok(!indexes.isIndexExists(['started_at', 'extra_col'], undefined));
    });
  });

  describe('isPrimaryKeyExists', () => {
    let indexes: IndexResult;

    beforeAll(async () => {
      indexes = await loadIndexes(makeKnex(MEMBERSHIPS_SQL), 'memberships');
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

    it('returns false for an empty array', () => {
      assert.ok(!indexes.isPrimaryKeyExists([]));
    });
  });

  describe('isUniqueExists', () => {
    let indexes: IndexResult;

    beforeAll(async () => {
      indexes = await loadIndexes(makeKnex(MEMBERSHIPS_SQL), 'memberships');
    });

    it('returns true for the existing composite unique key', () => {
      assert.ok(indexes.isUniqueExists(['project_id', 'user_id']));
    });

    it('returns false for a subset of the unique key columns', () => {
      assert.strictEqual(indexes.isUniqueExists(['project_id']), false);
    });

    it('returns false when column order differs', () => {
      assert.strictEqual(indexes.isUniqueExists(['user_id', 'project_id']), false);
    });
  });

  describe('isForeignKeyExists', () => {
    let indexes: IndexResult;

    beforeAll(async () => {
      indexes = await loadIndexes(makeKnex(MEMBERSHIPS_SQL), 'memberships');
    });

    it('returns true for an existing FK (project_id -> projects.id)', () => {
      assert.ok(indexes.isForeignKeyExists('project_id', 'projects.id'));
    });

    it('returns false when the ref table is wrong', () => {
      assert.strictEqual(indexes.isForeignKeyExists('project_id', 'wrong_table.id'), false);
    });

    it('returns false when the source column is wrong', () => {
      assert.strictEqual(indexes.isForeignKeyExists('wrong_col', 'projects.id'), false);
    });
  });

  describe('full index structure', () => {
    it('returns the correct parsed structure for file_uploads', async () => {
      const indexes = await loadIndexes(makeKnex(FILE_UPLOADS_SQL), 'file_uploads');

      assert.deepStrictEqual(indexes.pk, [['id']]);
      assert.deepStrictEqual(indexes.uk, {});
      assert.deepStrictEqual(indexes.key, {
        idx_file_uploads_status: ['project_id', 'status'],
        idx_file_uploads_group_uuid: ['group_uuid'],
      });
      assert.strictEqual(Object.keys(indexes.fk).length, 3);
    });
  });
});
