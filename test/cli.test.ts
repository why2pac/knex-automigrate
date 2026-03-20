import path from 'path';
import { spawnSync } from 'child_process';
import knex, { Knex } from 'knex';

const pkg = require('../package.json');
const config = require('./migration/knex.config');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');
const MIGRATION_CWD = path.join(__dirname, 'migration');
const KNEXFILE = path.join(MIGRATION_CWD, 'knex.config.js');
const ENV_KNEXFILE = path.join(MIGRATION_CWD, 'knex.env.config.js');

const run = (args: string[], opts: Record<string, any> = {}) => spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', CLI, ...args], {
  encoding: 'utf8',
  timeout: 30000,
  ...opts,
});

describe('CLI — no database required (ts)', () => {
  it('prints the package version and exits 0', () => {
    const result = run(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(pkg.version);
  });

  it('prints help text when --help is passed', () => {
    const result = run(['--help']);
    expect(result.stdout).toContain('migrate:auto');
    expect(result.stdout).toContain('--knexfile');
  });

  it('prints help text when no command is given', () => {
    const result = run([]);
    const output = result.stdout + result.stderr;
    expect(output).toContain('migrate:auto');
    expect(output).toContain('--knexfile');
  });

  it('exits 1 with an error message when no knexfile is found', () => {
    const result = run(['migrate:auto', '--cwd', '/tmp']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No knexfile found');
  });
});

describe('CLI — migrate:auto (ts)', () => {
  const sharedKnex: Knex = knex(config);

  const fileViews = ['STUDENT_INFORMATION', 'KEYVALS_ID2'];
  const fileTables = [
    'STUDENTS_CLASSES_DETAIL', 'STUDENTS_CLASSES', 'STUDENTS_DETAIL',
    'CLASSES_DETAIL', 'CLASSES', 'STUDENTS', 'PHONES', 'KEYVALS_ID',
  ];

  const dropAll = async () => {
    await Promise.all(fileViews.map((v) => sharedKnex.schema.dropViewIfExists(v)));
    await fileTables.reduce(
      (chain, t) => chain.then(() => sharedKnex.schema.dropTableIfExists(t)),
      Promise.resolve() as Promise<void>,
    );
  };

  beforeAll(dropAll);

  afterAll(async () => {
    await dropAll();
    await sharedKnex.destroy();
  });

  it('creates all tables and views on first run and exits 0', () => {
    const result = run(['migrate:auto', '--knexfile', KNEXFILE, '--cwd', MIGRATION_CWD]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Migration successfully done');
  });

  it('is idempotent — exits 0 on a second run', () => {
    const result = run(['migrate:auto', '--knexfile', KNEXFILE, '--cwd', MIGRATION_CWD]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Migration successfully done');
  });

  it('runs successfully with --safe flag', () => {
    const result = run(['migrate:auto', '--safe', '--knexfile', KNEXFILE, '--cwd', MIGRATION_CWD]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Migration successfully done');
  });

  it('runs successfully with --env flag selecting an environment', () => {
    const result = run(['migrate:auto', '--env', 'production', '--knexfile', ENV_KNEXFILE, '--cwd', MIGRATION_CWD]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Using environment:');
    expect(result.stdout).toContain('production');
    expect(result.stdout).toContain('Migration successfully done');
  });
});
