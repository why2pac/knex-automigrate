/* eslint-disable @typescript-eslint/no-var-requires */
const Liftoff = require('liftoff');
const argv = require('minimist')(process.argv.slice(2));
const { program: commander } = require('commander');
const chalk = require('chalk');
const tildify = require('tildify');
const cliPkg = require('../package.json');

interface LiftoffEnv {
  configPath?: string;
  cwd: string;
}

const cli = new Liftoff({ name: 'knex-automigrate' });

const invoke = (envParams: LiftoffEnv): void => {
  let pending: Promise<void> | null = null;

  commander
    .version(`Knex Automigrate CLI version: ${cliPkg.version}`)
    .option('--debug', 'Run with debugging.')
    .option('--safe', 'Run as safe mode, which is do not delete existing columns.')
    .option('--knexfile [path]', 'Specify the knexfile path.')
    .option('--cwd [path]', 'Specify the working directory.')
    .option('--env [name]', 'environment, default: process.env.NODE_ENV || development');

  const exit = (text: string | Error): void => {
    if (text instanceof Error) {
      console.error(chalk.red(text.stack));
    } else {
      console.error(chalk.red(text));
    }
    process.exit(1);
  };

  const success = (text: string): void => {
    console.log(text);
    process.exit(0);
  };

  const initKnex = (env: LiftoffEnv): Record<string, any> => {
    if (!env.configPath) {
      exit('No knexfile found in this directory. Specify a path with --knexfile');
    }

    if (process.cwd() !== env.cwd) {
      process.chdir(env.cwd);
      console.log('Working directory changed to', chalk.magenta(tildify(env.cwd)));
    }

    let environment: string | undefined = commander.env || process.env.NODE_ENV;
    const defaultEnv = 'development';
    let config = require(env.configPath!);

    if (!environment && typeof config[defaultEnv] === 'object') {
      environment = defaultEnv;
    }

    if (environment) {
      console.log('Using environment:', chalk.magenta(environment));
      config = config[environment] || config;
    }

    if (!config) {
      console.log(chalk.red('Warning: unable to read knexfile config'));
      process.exit(1);
    }

    if (argv.debug !== undefined) { config.debug = argv.debug; }
    if (argv.safe !== undefined) { config.safe = !!argv.safe; }

    return config;
  };

  commander
    .command('migrate:auto')
    .description('        Run all migration table schemas.')
    .action(() => {
      const config = initKnex(envParams);

      const Automigrate = require('..');
      pending = Automigrate({
        config,
        cwd: process.cwd(),
      }).then(() => {
        success('* Migration successfully done.');
      }).catch(exit);
    });

  commander.parse(process.argv);

  Promise.resolve(pending).then(() => {
    commander.help();
  });
};

cli.on('require', (name: string) => {
  console.log('Requiring external module', chalk.magenta(name));
});

cli.on('requireFail', (name: string) => {
  console.log(chalk.red('Failed to load external module'), chalk.magenta(name));
});

cli.prepare({
  cwd: argv.cwd,
  configPath: argv.knexfile,
  require: argv.require,
  completion: argv.completion,
}, invoke);
