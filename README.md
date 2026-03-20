knex-automigrate
================

[![NPM Version](https://img.shields.io/npm/v/knex-automigrate.svg)](https://npmjs.org/package/knex-automigrate)
[![NPM Downloads](https://img.shields.io/npm/dm/knex-automigrate.svg)](https://npmjs.org/package/knex-automigrate)

Table schema based database migration tool, built on top of [knex.js](http://knexjs.org).

Define your table schema once and let knex-automigrate handle CREATE, ALTER, and DROP operations automatically — no numbered migration files needed.

- Written in **TypeScript** with full type declarations included
- Migration schema file name must start with `table_` or `view_`
- Currently supported dialects for index migration: `mysql`, `mysql2`

## Installation

```bash
$ npm install knex-automigrate
```

For CLI usage (global install):

```bash
$ npm install knex-automigrate -g
```

## Usage

### Before (traditional database migration with knex.js)

```bash
$ knex migrate:make create_users_table
```

```javascript
// 201701010000_create_users_table.js
exports.up = function(knex, Promise) {
  return Promise.all([
    knex.schema.createTableIfNotExists('users', function(table) {
      table.increments('user_id').unsigned().comment('PK');
      table.string('email', 128).notNullable().comment('E-Mail');
      table.string('nickname', 128).notNullable().comment('Name');
    })
  ]);
};
```

```bash
$ knex migrate:latest
```

```bash
$ knex migrate:make alter_users_table
```

```javascript
// 201701010000_alter_users_table.js
exports.up = function(knex, Promise) {
  return Promise.all([
    knex.schema.alterTable('users', function(table) {
      table.dropColumn('nickname');
      table.string('email', 64).notNullable().comment('E-Mail').alter();
      table.string('name', 64).notNullable().comment('Name');
    })
  ]);
};
```

```bash
$ knex migrate:latest
```

Migration files are,

```
App
　├─ migrations
　│　　├─ 201701010000_create_users_table.js
　│　　└─ 201701010000_alter_users_table.js
　└─ knexfile.js
```

### After (database migration with knex-automigrate)

Migration files are named with `table_` or `view_` prefix. The prefix determines whether the file defines table schemas or view schemas.

```javascript
// table_users.js
exports.auto = function(migrator, knex) {
  return [
    migrator('users', function(table) {
      table.increments('user_id').unsigned().comment('PK');
      table.string('email', 64).notNullable().comment('E-Mail');
      table.string('name', 64).notNullable().comment('Name');
    }),
  ];
};
```

```javascript
// view_users.js
exports.auto = function(migrator, knex) {
  return [
    migrator('user_information', (view) => {
      // If view.columns() is missing,
      // the columns will default to those defined in the 'select()' statement.
      view.as(knex('users').select('user_id', 'email', 'name'));
    }),
  ];
};
```

```bash
$ knex-automigrate migrate:auto
```

Migration files are,

```
App
　├─ migrations
　│　　├─ table_users.js
　│　　└─ view_users.js
　└─ knexfile.js
```

Simply edit the schema file and run `migrate:auto` again — columns are added, altered, or dropped automatically to match the definition.

### CLI

```
Usage: knex-automigrate [options] [command]

Commands:
  migrate:auto           Run all migration table schemas.

Options:
  -V, --version      output the version number
  --debug            Run with debugging.
  --safe             Run as safe mode, which does not delete existing columns.
  --knexfile [path]  Specify the knexfile path.
  --cwd [path]       Specify the working directory.
  --env [name]       environment, default: process.env.NODE_ENV || development
  -h, --help         output usage information
```

## Programmatic Usage

```javascript
const Automigrate = require('knex-automigrate');

await Automigrate({
  config: {
    client: 'mysql2',
    connection: {
      host: '127.0.0.1',
      port: 3306,
      database: 'my_database',
      user: 'root',
      password: null,
    },
    safe: false, // set true to prevent dropping existing columns
  },
  cwd: __dirname,           // directory to scan for table_*.js / view_*.js files
  verbose: true,            // set false to suppress console output
  tables: (migrator, knex) => [
    migrator('users', (table) => {
      table.increments('user_id').unsigned().comment('PK');
      table.string('email', 128).notNullable().comment('E-Mail');
      table.string('name', 64).notNullable().comment('Name');
      table.datetime('created_at').notNullable().defaultTo(knex.fn.now()).comment('Created at');

      table.primary(['user_id']);
      table.unique(['email'], 'uk_users_email');
      table.index(['created_at'], 'idx_users_created_at');
    }),
  ],
  views: (migrator, knex) => [
    migrator('user_summary', (view) => {
      view.as(knex('users').select('user_id', 'email', 'name'));
    }),
  ],
});
```

### TypeScript

```typescript
import Automigrate from 'knex-automigrate';

await Automigrate({
  config: {
    client: 'mysql2',
    connection: { host: '127.0.0.1', database: 'my_database', user: 'root', password: null },
  },
  tables: (migrator, knex) => [
    migrator('users', (table) => {
      table.increments('user_id').unsigned().comment('PK');
      table.string('email', 128).notNullable().comment('E-Mail');
    }),
  ],
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `config` | `Knex.Config & { safe?: boolean }` | Knex configuration. Set `safe: true` to prevent dropping columns. |
| `cwd` | `string` | Directory to scan for `table_*.js` / `view_*.js` migration files. |
| `verbose` | `boolean` | Enable/disable console output. Default: `true`. |
| `tables` | `(migrator, knex) => MigrationEntry[]` | Inline table definitions (in addition to file-based). |
| `views` | `(migrator, knex) => MigrationEntry[]` | Inline view definitions (in addition to file-based). |

### Supported index types

```javascript
// Primary key
table.primary(['id']);

// Unique key
table.unique(['email'], 'uk_users_email');

// Regular index
table.index(['status'], 'idx_users_status');

// Fulltext index
table.index(['title'], 'ft_articles_title', { indexType: 'FULLTEXT' });

// Fulltext index with ngram parser
table.index(['body'], 'ft_articles_body', { indexType: 'FULLTEXT', parser: 'ngram' });
```

## How it works

1. Reads the current table schema from the database (`SHOW CREATE TABLE`)
2. Compares it with the defined schema
3. Automatically generates and runs the appropriate DDL:
   - **New table** → `CREATE TABLE`
   - **New column** → `ALTER TABLE ADD COLUMN`
   - **Changed column** → `ALTER TABLE MODIFY COLUMN`
   - **Removed column** → `ALTER TABLE DROP COLUMN` (unless `safe: true`)
   - **New index** → `CREATE INDEX` / `ALTER TABLE ADD INDEX`
   - **View** → `CREATE OR REPLACE VIEW`

## Dependencies

* [knex.js](http://knexjs.org) (peer dependency, `^3.1.0`)

## License

[MIT License](http://www.opensource.org/licenses/mit-license.php)
