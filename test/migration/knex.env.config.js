module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      database: 'knex_automigrate',
      host: '127.0.0.1',
      port: 3306,
      charset: 'utf8',
      user: 'root',
      password: null,
    },
  },
  production: {
    client: 'mysql2',
    connection: {
      database: 'knex_automigrate',
      host: '127.0.0.1',
      port: 3306,
      charset: 'utf8',
      user: 'root',
      password: null,
    },
  },
};
