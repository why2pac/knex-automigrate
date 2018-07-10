#!/usr/bin/env node

const Liftoff = require('liftoff')
const argv = require('minimist')(process.argv.slice(2))
const commander = require('commander')
const chalk = require('chalk')
const tildify = require('tildify')
const cliPkg = require('../package')

const cli = new Liftoff({name: 'knex-automigrate'})
const invoke = function (env) {
  var pending = null

  commander
    .version('Knex Automigrate CLI version: ' + cliPkg.version)
    .option('--debug', 'Run with debugging.')
    .option('--knexfile [path]', 'Specify the knexfile path.')
    .option('--cwd [path]', 'Specify the working directory.')
    .option('--env [name]', 'environment, default: process.env.NODE_ENV || development')

  var exit = function (text) {
    if (text instanceof Error) {
      chalk.red(console.error(text.stack))
    } else {
      chalk.red(console.error(text))
    }
    process.exit(1)
  }

  var success = function (text) {
    console.log(text)
    process.exit(0)
  }

  var initKnex = function (env) {
    if (!env.configPath) {
      exit('No knexfile found in this directory. Specify a path with --knexfile')
    }

    if (process.cwd() !== env.cwd) {
      process.chdir(env.cwd)
      console.log('Working directory changed to', chalk.magenta(tildify(env.cwd)))
    }

    var environment = commander.env || process.env.NODE_ENV
    var defaultEnv = 'development'
    var config = require(env.configPath)

    if (!environment && typeof config[defaultEnv] === 'object') {
      environment = defaultEnv
    }

    if (environment) {
      console.log('Using environment:', chalk.magenta(environment))
      config = config[environment] || config
    }

    if (!config) {
      console.log(chalk.red('Warning: unable to read knexfile config'))
      process.exit(1)
    }

    if (argv.debug !== undefined) { config.debug = argv.debug }

    return config
  }

  commander
    .command('migrate:auto')
    .description('        Run all migration table schemas.')
    .action(function () {
      var config = initKnex(env)

      pending = require('../lib/automigrate')({
        config: config,
        path: process.cwd()
      }).then(function () {
        success('* Migration successfully done.')
      }).catch(exit)
    })

  commander.parse(process.argv)

  Promise.resolve(pending).then(function () {
    commander.help()
  })
}

cli.on('require', function (name) {
  console.log('Requiring external module', chalk.magenta(name))
})

cli.on('requireFail', function (name) {
  console.log(chalk.red('Failed to load external module'), chalk.magenta(name))
})

cli.launch({
  cwd: argv.cwd,
  configPath: argv.knexfile,
  require: argv.require,
  completion: argv.completion
}, invoke)
