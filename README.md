knex-automigrate
================

[![NPM Version](https://img.shields.io/npm/v/knex-automigrate.svg)](https://npmjs.org/package/knex-automigrate)
[![NPM Downloads](https://img.shields.io/npm/dm/knex-automigrate.svg)](https://npmjs.org/package/knex-automigrate)
[![Dependency Status](https://david-dm.org/why2pac/knex-automigrate.svg)](https://david-dm.org/why2pac/knex-automigrate)

Table schema based database migration tool, built on top of the knex.js

- Migration schema file name must be started with `table_`.
- Currently supported dialects to index migration : `mysql`

## Installation

```bash
$ npm install knex-automigrate -g
```

## Usage

```bash
Usage: knex-automigrate [options] [command]


Commands:

  migrate:auto           Run all migration table schemas.

Options:

  -h, --help         output usage information
  -V, --version      output the version number
  --debug            Run with debugging.
  --knexfile [path]  Specify the knexfile path.
  --cwd [path]       Specify the working directory.
  --env [name]       environment, default: process.env.NODE_ENV || development
```

### Before (traditional database migration with knex.js)

```bash
$ knex migrate:make create_users_table
```

```node
// 201701010000_create_users_table.js
exports.up = function(knex, Promise) {
  return Promise.all([
    knex.schema.createTableIfNotExists('users', function(table) {
      table.increments('user_id').unsigned().comment('PK');
      table.string('email', 128).notNullable().comment('E-Mail');
      table.string('nickname', 128).notNullable().comment('Name');
    })
  ]);
});
```

```bash
$ knex migrate:latest
```

```bash
$ knex migrate:make alter_users_table
```

```node
// 201701010000_alter_users_table.js
exports.up = function(knex, Promise) {
  return Promise.all([
    knex.schema.alterTable('users', function(table) {
      table.dropColumn('nickname');
      table.string('email', 64).notNullable().comment('E-Mail').alter();
      table.string('name', 64).notNullable().comment('Name');
    })
  ]);
});
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

```node
// table_users.js
exports.auto = function(migrator, knex) {
  return [
    migrator('users', function(table) {
      table.increments('user_id').unsigned().comment('PK');
      table.string('email', 128).notNullable().comment('E-Mail');
      table.string('nickname', 128).notNullable().comment('Name');
    });
  ];
});
```

```bash
$ knex-automigrate migrate:auto
```

```node
// table_users.js
exports.auto = function(migrator, knex) {
  return [
    migrator('users', function(table) {
      table.increments('user_id').unsigned().comment('PK');
      table.string('email', 64).notNullable().comment('E-Mail');
      table.string('name', 64).notNullable().comment('Name');
    });
  ];
});
```

```bash
$ knex-automigrate migrate:auto
```

Migration files are,

```
App
　├─ migrations
　│　　└─ table_users.js
　└─ knexfile.js
```

## Dependencies

* [Knex.js](http://knexjs.org)

## License

[MIT License](http://www.opensource.org/licenses/mit-license.php)