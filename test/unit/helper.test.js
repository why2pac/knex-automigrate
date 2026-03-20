const assert = require('assert');
const helper = require('../../lib/index/helper');

describe('helper', () => {
  describe('innerBrackets', () => {
    it('returns content inside parentheses for PRIMARY KEY', () => {
      assert.strictEqual(helper.innerBrackets('PRIMARY KEY (`id`)'), '`id`');
    });

    it('returns content between first ( and last ) for multi-column index', () => {
      assert.strictEqual(helper.innerBrackets('KEY `idx` (`a`,`b`)'), '`a`,`b`');
    });

    it('returns null when no opening bracket exists', () => {
      assert.strictEqual(helper.innerBrackets('NO BRACKETS'), null);
    });

    it('returns null when no closing bracket exists', () => {
      assert.strictEqual(helper.innerBrackets('UNCLOSED ('), null);
    });

    it('uses lastIndexOf for closing bracket — outer brackets are stripped', () => {
      assert.strictEqual(helper.innerBrackets('OUTER (INNER (`id`))'), 'INNER (`id`)');
    });

    it('returns empty string for empty brackets', () => {
      assert.strictEqual(helper.innerBrackets('KEY ()'), '');
    });

    it('returns null when closing bracket appears before opening bracket', () => {
      assert.strictEqual(helper.innerBrackets(') foo ('), null);
    });

    it('handles UNIQUE KEY line as produced by SHOW CREATE TABLE', () => {
      assert.strictEqual(
        helper.innerBrackets('UNIQUE KEY `uk_memberships` (`project_id`,`user_id`)'),
        '`project_id`,`user_id`',
      );
    });

    it('handles CONSTRAINT FOREIGN KEY source columns', () => {
      assert.strictEqual(
        helper.innerBrackets('CONSTRAINT `fk_name` FOREIGN KEY (`ref_id`)'),
        '`ref_id`',
      );
    });
  });

  describe('multipleColumns', () => {
    it('returns null for null input', () => {
      assert.strictEqual(helper.multipleColumns(null), null);
    });

    it('returns null for undefined input', () => {
      assert.strictEqual(helper.multipleColumns(undefined), null);
    });

    it('returns null for empty string (falsy)', () => {
      assert.strictEqual(helper.multipleColumns(''), null);
    });

    it('parses single backtick-quoted column', () => {
      assert.deepStrictEqual(helper.multipleColumns('`id`'), ['id']);
    });

    it('parses two backtick-quoted columns', () => {
      assert.deepStrictEqual(helper.multipleColumns('`project_id`,`user_id`'), ['project_id', 'user_id']);
    });

    it('parses three backtick-quoted columns', () => {
      assert.deepStrictEqual(helper.multipleColumns('`a`,`b`,`c`'), ['a', 'b', 'c']);
    });

    it('trims whitespace from plain (unquoted) column names', () => {
      assert.deepStrictEqual(helper.multipleColumns(' col1 , col2 '), ['col1', 'col2']);
    });

    it('documents that a space before a backtick prevents stripping (actual MySQL has no spaces)', () => {
      // multipleColumns checks slice(0,1) === '`' before stripping.
      // If a leading space is present (e.g. ", `b`"), the backtick is NOT stripped.
      // Real MySQL SHOW CREATE TABLE output never has spaces here, so this is not an issue in practice.
      const result = helper.multipleColumns('`a`, `b`');
      assert.deepStrictEqual(result[0], 'a'); // first token: backtick stripped
      assert.deepStrictEqual(result[1], '`b`'); // second token: space precedes backtick, not stripped
    });

    it('handles column names with underscores and mixed case', () => {
      assert.deepStrictEqual(helper.multipleColumns('`ref_Id`,`createdAt`'), ['ref_Id', 'createdAt']);
    });
  });

  describe('firstQuoteValue', () => {
    it('returns null when no backtick present', () => {
      assert.strictEqual(helper.firstQuoteValue('NO BACKTICK'), null);
    });

    it('extracts index name from UNIQUE KEY line', () => {
      assert.strictEqual(
        helper.firstQuoteValue('UNIQUE KEY `uk_memberships` (`project_id`,`user_id`)'),
        'uk_memberships',
      );
    });

    it('extracts index name from KEY line', () => {
      assert.strictEqual(
        helper.firstQuoteValue('KEY `idx_status` (`status`)'),
        'idx_status',
      );
    });

    it('extracts FK constraint name from CONSTRAINT line', () => {
      assert.strictEqual(
        helper.firstQuoteValue('CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)'),
        'fk_orders_user_id',
      );
    });

    it('extracts table name from REFERENCES clause (no preceding text)', () => {
      assert.strictEqual(helper.firstQuoteValue(' REFERENCES `users` (`id`)'), 'users');
    });

    it('returns empty string for empty backtick pair', () => {
      assert.strictEqual(helper.firstQuoteValue('KEY `` ()'), '');
    });

    it('returns the full value when no closing backtick is present', () => {
      assert.strictEqual(helper.firstQuoteValue('KEY `idx_name'), 'idx_name');
    });
  });

  describe('isArrayEqual', () => {
    it('returns truthy for two single-element equal arrays', () => {
      assert.ok(helper.isArrayEqual(['id'], ['id']));
    });

    it('returns truthy for two multi-element equal arrays', () => {
      assert.ok(helper.isArrayEqual(['project_id', 'user_id'], ['project_id', 'user_id']));
    });

    it('returns falsy when single elements differ', () => {
      assert.ok(!helper.isArrayEqual(['A'], ['B']));
    });

    it('returns falsy when first elements match but second differs', () => {
      assert.ok(!helper.isArrayEqual(['A', 'C'], ['A', 'B']));
    });

    it('returns true for two empty arrays (length equality check: 0 === 0)', () => {
      // a.length === b.length → 0 === 0 → true, and [].every() vacuously returns true.
      assert.ok(helper.isArrayEqual([], []));
    });

    it('returns falsy when array lengths differ (longer second array)', () => {
      // every() only iterates over 'a', so ['A'] vs ['A','B'] would be truthy — document it.
      // ['A','B'] vs ['A'] is falsy because a[1] ('B') !== b[1] (undefined).
      assert.ok(!helper.isArrayEqual(['A', 'B'], ['A']));
    });

    it('returns false when arrays have same prefix but different length (fixed)', () => {
      // a.length === b.length → 1 === 2 → false. Extra elements in b are rejected.
      const result = helper.isArrayEqual(['A'], ['A', 'B']);
      assert.ok(!result);
    });

    it('returns falsy for single-element arrays where the element differs in casing', () => {
      assert.ok(!helper.isArrayEqual(['id'], ['ID']));
    });

    it('returns truthy for three-element arrays that are fully equal', () => {
      assert.ok(helper.isArrayEqual(['project_id', 'user_id', 'role_id'], ['project_id', 'user_id', 'role_id']));
    });
  });
});
