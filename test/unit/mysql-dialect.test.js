const assert = require('assert');
const MySqlDialect = require('../../dist/index/dialects/mysql').default;

function makeKnex(createTableSql) {
  return {
    client: { config: { client: 'mysql' } },
    raw: async () => [[{ 'Create Table': createTableSql }]],
  };
}

describe('MySqlDialect', () => {
  describe('PRIMARY KEY parsing', () => {
    it('parses a single-column PRIMARY KEY', async () => {
      const sql = [
        'CREATE TABLE `users` (',
        '  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
        '  PRIMARY KEY (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'users');
      assert.deepStrictEqual(result.pk, [['id']]);
    });

    it('parses a composite PRIMARY KEY', async () => {
      const sql = [
        'CREATE TABLE `order_items` (',
        '  `order_id` bigint NOT NULL,',
        '  `item_id` bigint NOT NULL,',
        '  PRIMARY KEY (`order_id`,`item_id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'order_items');
      assert.deepStrictEqual(result.pk, [['order_id', 'item_id']]);
    });

    it('returns empty pk array when no PRIMARY KEY is defined', async () => {
      const sql = [
        'CREATE TABLE `settings` (',
        '  `key` varchar(64) NOT NULL',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'settings');
      assert.deepStrictEqual(result.pk, []);
    });
  });

  describe('UNIQUE KEY parsing', () => {
    it('parses a single-column UNIQUE KEY', async () => {
      const sql = [
        'CREATE TABLE `users` (',
        '  `id` bigint NOT NULL,',
        '  `email` varchar(128) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `uk_email` (`email`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'users');
      assert.deepStrictEqual(result.uk, { uk_email: ['email'] });
    });

    it('parses a composite UNIQUE KEY', async () => {
      const sql = [
        'CREATE TABLE `memberships` (',
        '  `id` bigint NOT NULL,',
        '  `project_id` bigint NOT NULL,',
        '  `user_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `uk_memberships` (`project_id`,`user_id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'memberships');
      assert.deepStrictEqual(result.uk, { uk_memberships: ['project_id', 'user_id'] });
    });

    it('parses a three-column UNIQUE KEY', async () => {
      const sql = [
        'CREATE TABLE `user_role_assignments` (',
        '  `id` bigint NOT NULL,',
        '  `project_id` bigint NOT NULL,',
        '  `user_id` bigint NOT NULL,',
        '  `role_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `uk_user_role_assignments` (`project_id`,`user_id`,`role_id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'user_role_assignments');
      assert.deepStrictEqual(result.uk, { uk_user_role_assignments: ['project_id', 'user_id', 'role_id'] });
    });

    it('parses two separate single-column UNIQUE KEYs on the same table', async () => {
      // Mirrors table.string("access_key").unique() + table.string("secret_key").unique()
      // which knex expands to two separate UNIQUE KEY definitions.
      const sql = [
        'CREATE TABLE `api_keys` (',
        '  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
        '  `access_key` varchar(20) DEFAULT NULL,',
        '  `secret_key` varchar(128) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `api_keys_access_key_unique` (`access_key`),',
        '  UNIQUE KEY `api_keys_secret_key_unique` (`secret_key`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'api_keys');
      assert.deepStrictEqual(result.uk, {
        api_keys_access_key_unique: ['access_key'],
        api_keys_secret_key_unique: ['secret_key'],
      });
      assert.deepStrictEqual(result.key, {});
    });

    it('UNIQUE KEY lines are NOT classified as KEY (no double-counting)', async () => {
      // 'UNIQUE KEY' does not start with 'KEY' at index 0, so it is only captured as uk.
      const sql = [
        'CREATE TABLE `t` (',
        '  `id` bigint NOT NULL,',
        '  `a` varchar(32) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `uk_a` (`a`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.uk, { uk_a: ['a'] });
      assert.deepStrictEqual(result.key, {});
    });
  });

  describe('KEY (regular index) parsing', () => {
    it('parses a single-column KEY', async () => {
      const sql = [
        'CREATE TABLE `orders` (',
        '  `id` bigint NOT NULL,',
        '  `status` varchar(32) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `idx_status` (`status`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'orders');
      assert.deepStrictEqual(result.key, { idx_status: ['status'] });
    });

    it('parses a composite KEY', async () => {
      const sql = [
        'CREATE TABLE `activity_logs` (',
        '  `id` bigint NOT NULL,',
        '  `project_id` bigint NOT NULL,',
        '  `action` varchar(64) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `idx_activity_logs_01` (`project_id`,`action`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'activity_logs');
      assert.deepStrictEqual(result.key, { idx_activity_logs_01: ['project_id', 'action'] });
    });

    it('parses multiple KEYs', async () => {
      const sql = [
        'CREATE TABLE `file_uploads` (',
        '  `id` bigint NOT NULL,',
        '  `project_id` bigint NOT NULL,',
        '  `status` varchar(32) DEFAULT NULL,',
        '  `group_uuid` varchar(36) NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `idx_file_uploads_status` (`project_id`,`status`),',
        '  KEY `idx_file_uploads_group_uuid` (`group_uuid`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'file_uploads');
      assert.deepStrictEqual(result.key, {
        idx_file_uploads_status: ['project_id', 'status'],
        idx_file_uploads_group_uuid: ['group_uuid'],
      });
    });
  });

  describe('CONSTRAINT FOREIGN KEY parsing', () => {
    it('parses a single FOREIGN KEY', async () => {
      const sql = [
        'CREATE TABLE `projects` (',
        '  `id` bigint NOT NULL,',
        '  `category_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `projects_category_id_foreign` (`category_id`),',
        '  CONSTRAINT `projects_category_id_foreign` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'projects');
      assert.deepStrictEqual(result.fk, {
        projects_category_id_foreign: {
          key: ['category_id'],
          ref: { table: 'categories', key: ['id'] },
        },
      });
    });

    it('parses multiple FOREIGN KEYs', async () => {
      const sql = [
        'CREATE TABLE `memberships` (',
        '  `id` bigint NOT NULL,',
        '  `project_id` bigint NOT NULL,',
        '  `user_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `fk_memberships_project` (`project_id`),',
        '  KEY `fk_memberships_user` (`user_id`),',
        '  CONSTRAINT `fk_memberships_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),',
        '  CONSTRAINT `fk_memberships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'memberships');
      assert.deepStrictEqual(result.fk, {
        fk_memberships_project: {
          key: ['project_id'],
          ref: { table: 'projects', key: ['id'] },
        },
        fk_memberships_user: {
          key: ['user_id'],
          ref: { table: 'users', key: ['id'] },
        },
      });
    });

    it('correctly parses FOREIGN KEY with ON DELETE CASCADE / ON UPDATE CASCADE suffix', async () => {
      // Real MySQL output often includes referential actions after REFERENCES ... (`col`).
      // split('REFERENCES') puts ON DELETE/UPDATE in ref[1], but innerBrackets and
      // firstQuoteValue still extract the correct values because they use indexOf/lastIndexOf.
      const sql = [
        'CREATE TABLE `comments` (',
        '  `id` bigint NOT NULL,',
        '  `post_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `fk_comments_post` (`post_id`),',
        '  CONSTRAINT `fk_comments_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'comments');
      assert.deepStrictEqual(result.fk, {
        fk_comments_post: {
          key: ['post_id'],
          ref: { table: 'posts', key: ['id'] },
        },
      });
      assert.deepStrictEqual(Object.keys(result.key), []);
    });
  });

  describe('FK deduplication from indexKeys', () => {
    it('removes the FK constraint name from key when it shares the same name as a KEY entry', async () => {
      // MySQL auto-creates a KEY with the same name as a FOREIGN KEY constraint.
      // The dialect removes it from indexKeys to avoid double-reporting.
      const sql = [
        'CREATE TABLE `projects` (',
        '  `id` bigint NOT NULL,',
        '  `category_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `projects_category_id_foreign` (`category_id`),',
        '  CONSTRAINT `projects_category_id_foreign` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'projects');
      assert.ok(!('projects_category_id_foreign' in result.key));
    });

    it('removes all FK names from indexKeys when multiple FKs are present', async () => {
      const sql = [
        'CREATE TABLE `memberships` (',
        '  `id` bigint NOT NULL,',
        '  `project_id` bigint NOT NULL,',
        '  `user_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `fk_memberships_project` (`project_id`),',
        '  KEY `fk_memberships_user` (`user_id`),',
        '  CONSTRAINT `fk_memberships_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),',
        '  CONSTRAINT `fk_memberships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'memberships');
      assert.deepStrictEqual(Object.keys(result.key), []);
      assert.strictEqual(Object.keys(result.fk).length, 2);
    });

    it('retains non-FK keys when some keys share names with FKs', async () => {
      const sql = [
        'CREATE TABLE `items` (',
        '  `id` bigint NOT NULL,',
        '  `project_id` bigint NOT NULL,',
        '  `status` varchar(32) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `fk_items_project` (`project_id`),',
        '  KEY `idx_items_status` (`status`),',
        '  CONSTRAINT `fk_items_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'items');
      assert.ok(!('fk_items_project' in result.key));
      assert.ok('idx_items_status' in result.key);
    });
  });

  describe('FULLTEXT KEY parsing', () => {
    it('parses a FULLTEXT KEY into key (same structure as a regular KEY)', async () => {
      const sql = [
        'CREATE TABLE `articles` (',
        '  `id` bigint NOT NULL,',
        '  `title` varchar(255) DEFAULT NULL,',
        '  `body` text,',
        '  PRIMARY KEY (`id`),',
        '  FULLTEXT KEY `ft_articles_title_body` (`title`,`body`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'articles');
      assert.deepStrictEqual(result.key, { ft_articles_title_body: ['title', 'body'] });
      assert.deepStrictEqual(result.uk, {});
      assert.deepStrictEqual(result.fk, {});
    });

    it('FULLTEXT KEY coexists with regular KEY on the same table', async () => {
      const sql = [
        'CREATE TABLE `articles` (',
        '  `id` bigint NOT NULL,',
        '  `author_id` bigint NOT NULL,',
        '  `title` varchar(255) DEFAULT NULL,',
        '  `body` text,',
        '  PRIMARY KEY (`id`),',
        '  KEY `idx_articles_author` (`author_id`),',
        '  FULLTEXT KEY `ft_articles_body` (`body`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'articles');
      assert.deepStrictEqual(result.key, {
        idx_articles_author: ['author_id'],
        ft_articles_body: ['body'],
      });
    });
  });

  describe('tables with no indexes', () => {
    it('returns all empty structures for a table with no key definitions', async () => {
      const sql = [
        'CREATE TABLE `settings` (',
        '  `key` varchar(64) NOT NULL,',
        '  `value` text',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 'settings');
      assert.deepStrictEqual(result.pk, []);
      assert.deepStrictEqual(result.uk, {});
      assert.deepStrictEqual(result.key, {});
      assert.deepStrictEqual(result.fk, {});
    });
  });

  describe('line format variations', () => {
    it('correctly parses PRIMARY KEY line that ends with a trailing comma', async () => {
      // MySQL outputs a trailing comma on every non-last line inside CREATE TABLE.
      // innerBrackets uses lastIndexOf(')'), so the trailing comma after the closing ')' is ignored.
      const sql = [
        'CREATE TABLE `t` (',
        '  `id` bigint NOT NULL,',
        '  `name` varchar(64) DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `idx_name` (`name`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.pk, [['id']]);
      assert.deepStrictEqual(result.key, { idx_name: ['name'] });
    });

    it('correctly parses PRIMARY KEY that is the last line (no trailing comma)', async () => {
      const sql = [
        'CREATE TABLE `t` (',
        '  `id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.pk, [['id']]);
    });
  });

  describe('null guard — malformed or edge-case SQL', () => {
    it('does not push to pk when PRIMARY KEY has an empty column list', async () => {
      // innerBrackets('PRIMARY KEY ()') = '' → multipleColumns('') = null → guard (if keys) is false.
      const sql = [
        'CREATE TABLE `t` (',
        '  PRIMARY KEY ()',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.pk, []);
    });

    it('does not store UNIQUE KEY when no backtick-quoted name is present', async () => {
      // firstQuoteValue returns null when there is no backtick → name = null → guard is false.
      const sql = [
        'CREATE TABLE `t` (',
        '  UNIQUE KEY unquoted_name (col)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.uk, {});
    });

    it('does not store KEY when column list is empty', async () => {
      // multipleColumns('') = null → guard (if name && keys) is false.
      const sql = [
        'CREATE TABLE `t` (',
        '  KEY `idx_empty` ()',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.key, {});
    });

    it('does not store FOREIGN KEY when reference column list is missing', async () => {
      // REFERENCES `table` with no () → innerBrackets returns null → destKeys = null → guard is false.
      const sql = [
        'CREATE TABLE `t` (',
        '  CONSTRAINT `fk_t_ref` FOREIGN KEY (`ref_id`) REFERENCES `other_table`',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.fk, {});
    });

    it('does not store FULLTEXT KEY when no backtick-quoted name is present', async () => {
      // firstQuoteValue returns null when there is no backtick → guard (if name && keys) is false.
      const sql = [
        'CREATE TABLE `t` (',
        '  FULLTEXT KEY unquoted_ft (col)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await MySqlDialect(makeKnex(sql), 't');
      assert.deepStrictEqual(result.key, {});
    });
  });

  describe('comprehensive schema fixture', () => {
    it('handles a table with PK + UK + KEY + FK all present', async () => {
      const sql = [
        'CREATE TABLE `memberships` (',
        '  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
        '  `category_id` bigint(20) unsigned NOT NULL,',
        '  `project_id` bigint(20) unsigned NOT NULL,',
        '  `user_id` bigint(20) unsigned NOT NULL,',
        '  `name` varchar(128) NOT NULL,',
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

      const result = await MySqlDialect(makeKnex(sql), 'memberships');

      assert.deepStrictEqual(result.pk, [['id']]);
      assert.deepStrictEqual(result.uk, { uk_memberships: ['project_id', 'user_id'] });
      assert.deepStrictEqual(result.key, {
        idx_memberships_started_at: ['started_at'],
        idx_memberships_ended_at: ['ended_at'],
      });
      assert.strictEqual(Object.keys(result.fk).length, 3);
      assert.ok('fk_memberships_category' in result.fk);
      assert.ok('fk_memberships_project' in result.fk);
      assert.ok('fk_memberships_user' in result.fk);
    });
  });
});
