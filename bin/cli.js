#!/usr/bin/env node

const Liftoff = require('liftoff');
const argv = require('minimist')(process.argv.slice(2));
const commander = require('commander');
const chalk = require('chalk');
const tildify = require('tildify');
const cliPkg = require('../package');

const cli = new Liftoff({ name: 'knex-automigrate' });
const invoke = function invoke(envParams) {
  let pending = null;

  commander
    .version(`Knex Automigrate CLI version: ${cliPkg.version}`)
    .option('--debug', 'Run with debugging.')
    .option('--knexfile [path]', 'Specify the knexfile path.')
    .option('--cwd [path]', 'Specify the working directory.')
    .option('--env [name]', 'environment, default: process.env.NODE_ENV || development');

  const exit = function exit(text) {
    if (text instanceof Error) {
      chalk.red(console.error(text.stack)); // eslint-disable-line no-console
    } else {
      chalk.red(console.error(text)); // eslint-disable-line no-console
    }
    process.exit(1);
  };

  const success = function success(text) {
    console.log(text); // eslint-disable-line no-console
    process.exit(0);
  };

  const initKnex = function initKnex(env) {
    if (!env.configPath) {
      exit('No knexfile found in this directory. Specify a path with --knexfile');
    }

    if (process.cwd() !== env.cwd) {
      process.chdir(env.cwd);
      console.log('Working directory changed to', chalk.magenta(tildify(env.cwd))); // eslint-disable-line no-console
    }

    let environment = commander.env || process.env.NODE_ENV;
    const defaultEnv = 'development';
    let config = require(env.configPath); // eslint-disable-line global-require, import/no-dynamic-require

    if (!environment && typeof config[defaultEnv] === 'object') {
      environment = defaultEnv;
    }

    if (environment) {
      console.log('Using environment:', chalk.magenta(environment)); // eslint-disable-line no-console
      config = config[environment] || config;
    }

    if (!config) {
      console.log(chalk.red('Warning: unable to read knexfile config')); // eslint-disable-line no-console
      process.exit(1);
    }

    if (argv.debug !== undefined) { config.debug = argv.debug; }

    return config;
  };

  commander
    .command('migrate:auto')
    .description('        Run all migration table schemas.')
    .action(() => {
      const config = initKnex(envParams);

      // eslint-disable-next-line global-require
      pending = require('../lib/automigrate')({
        config,
        path: process.cwd(),
      }).then(() => {
        success('* Migration successfully done.');
      }).catch(exit);
    });

  commander.parse(process.argv);

  Promise.resolve(pending).then(() => {
    commander.help();
  });
};

cli.on('require', (name) => {
  console.log('Requiring external module', chalk.magenta(name)); // eslint-disable-line no-console
});

cli.on('requireFail', (name) => {
  console.log(chalk.red('Failed to load external module'), chalk.magenta(name)); // eslint-disable-line no-console
});

cli.launch({
  cwd: argv.cwd,
  configPath: argv.knexfile,
  require: argv.require,
  completion: argv.completion,
}, invoke);
