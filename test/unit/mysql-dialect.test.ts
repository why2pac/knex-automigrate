import assert from 'assert';
import parseMySqlSchema from '../../src/index/dialects/mysql';

function makeKnex(createTableSql: string): any {
  return {
    client: { config: { client: 'mysql' } },
    raw: async () => [[{ 'Create Table': createTableSql }]],
  };
}

describe('MySqlDialect (ts)', () => {
  describe('PRIMARY KEY parsing', () => {
    it('parses a single-column PRIMARY KEY', async () => {
      const sql = [
        'CREATE TABLE `users` (',
        '  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
        '  PRIMARY KEY (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await parseMySqlSchema(makeKnex(sql), 'users');
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

      const result = await parseMySqlSchema(makeKnex(sql), 'order_items');
      assert.deepStrictEqual(result.pk, [['order_id', 'item_id']]);
    });

    it('returns empty pk array when no PRIMARY KEY is defined', async () => {
      const sql = [
        'CREATE TABLE `settings` (',
        '  `key` varchar(64) NOT NULL',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await parseMySqlSchema(makeKnex(sql), 'settings');
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

      const result = await parseMySqlSchema(makeKnex(sql), 'users');
      assert.deepStrictEqual(result.uk, { uk_email: ['email'] });
    });

    it('parses two separate single-column UNIQUE KEYs on the same table', async () => {
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

      const result = await parseMySqlSchema(makeKnex(sql), 'api_keys');
      assert.deepStrictEqual(result.uk, {
        api_keys_access_key_unique: ['access_key'],
        api_keys_secret_key_unique: ['secret_key'],
      });
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

      const result = await parseMySqlSchema(makeKnex(sql), 'orders');
      assert.deepStrictEqual(result.key, { idx_status: ['status'] });
    });
  });

  describe('CONSTRAINT FOREIGN KEY parsing', () => {
    it('parses a single FOREIGN KEY and removes it from indexKeys', async () => {
      const sql = [
        'CREATE TABLE `projects` (',
        '  `id` bigint NOT NULL,',
        '  `category_id` bigint NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  KEY `projects_category_id_foreign` (`category_id`),',
        '  CONSTRAINT `projects_category_id_foreign` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)',
        ') ENGINE=InnoDB',
      ].join('\n');

      const result = await parseMySqlSchema(makeKnex(sql), 'projects');
      assert.deepStrictEqual(result.fk, {
        projects_category_id_foreign: {
          key: ['category_id'],
          ref: { table: 'categories', key: ['id'] },
        },
      });
      assert.ok(!('projects_category_id_foreign' in result.key));
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

      const result = await parseMySqlSchema(makeKnex(sql), 'articles');
      assert.deepStrictEqual(result.key, { ft_articles_title_body: ['title', 'body'] });
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

      const result = await parseMySqlSchema(makeKnex(sql), 'settings');
      assert.deepStrictEqual(result.pk, []);
      assert.deepStrictEqual(result.uk, {});
      assert.deepStrictEqual(result.key, {});
      assert.deepStrictEqual(result.fk, {});
    });
  });
});
