import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, arguments_ = [], { cwd = repo, timeoutMs = 5_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

async function temporary(t, prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(directory, relative, contents) {
  const file = path.join(directory, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents, 'utf8');
  return file;
}

async function git(directory, arguments_) {
  const result = await run('git', arguments_, { cwd: directory });
  assert.equal(result.code, 0, `git ${arguments_.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  return result;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function runDeclaredFixtureBuild(directory, timeoutMs) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const match = manifest.scripts?.build?.match(/^node ([A-Za-z0-9._/-]+)$/);
  assert.ok(match, 'fixture build must declare one directly executable Node entrypoint');
  return run(process.execPath, [match[1]], { cwd: directory, timeoutMs });
}

test('untracked authored output is enumerated and checked directly instead of credited to git diff', async (t) => {
  const directory = await temporary(t, 'aer-untracked-evidence-');
  await fixture(directory, 'tracked.js', 'export const tracked = true;\n');
  await git(directory, ['init', '--quiet']);
  await git(directory, ['config', 'user.name', 'AER Fixture']);
  await git(directory, ['config', 'user.email', 'aer-fixture@example.invalid']);
  await git(directory, ['config', 'commit.gpgSign', 'false']);
  await git(directory, ['add', 'tracked.js']);
  await git(directory, ['commit', '--quiet', '-m', 'fixture baseline']);
  await fixture(directory, 'app.mjs', 'export const broken = ;\n');

  const difference = await run('git', ['diff', '--exit-code'], { cwd: directory });
  const whitespace = await run('git', ['diff', '--check'], { cwd: directory });
  assert.equal(difference.code, 0, 'tracked diff is intentionally vacuous for the untracked fixture');
  assert.equal(whitespace.code, 0, 'git diff --check is intentionally vacuous for the untracked fixture');

  const inventory = await run('git', ['status', '--short', '--untracked-files=all'], { cwd: directory });
  assert.equal(inventory.code, 0);
  assert.match(inventory.stdout, /^\?\? app\.mjs$/m);
  const direct = await run(process.execPath, ['app.mjs'], { cwd: directory });
  assert.notEqual(direct.code, 0);
  assert.match(direct.stderr, /SyntaxError/);
});

test('later success can mask a chained failure while component result capture cannot', async (t) => {
  const directory = await temporary(t, 'aer-masked-chain-');
  await fixture(directory, 'fail.mjs', 'process.stderr.write("seeded failure\\n"); process.exit(7);\n');
  await fixture(directory, 'pass.mjs', 'process.stdout.write("later success\\n");\n');

  const chained = process.platform === 'win32'
    ? await run(process.env.ComSpec, ['/d', '/s', '/c', 'node fail.mjs & node pass.mjs'], { cwd: directory })
    : await run('/bin/sh', ['-c', 'node fail.mjs; node pass.mjs'], { cwd: directory });
  assert.equal(chained.code, 0);
  assert.match(chained.stderr, /seeded failure/);
  assert.match(chained.stdout, /later success/);

  const components = await Promise.all([
    run(process.execPath, ['fail.mjs'], { cwd: directory }),
    run(process.execPath, ['pass.mjs'], { cwd: directory }),
  ]);
  assert.deepEqual(components.map((result) => result.code), [7, 0]);
  assert.equal(components.every((result) => result.code === 0), false);
});

test('a declared build must terminate within its bound and create its declared output', async (t) => {
  const directory = await temporary(t, 'aer-valid-build-');
  const output = path.join(directory, 'dist', 'app.js');
  await fixture(directory, 'package.json', JSON.stringify({
    scripts: { build: 'node build.mjs' },
    aerFixture: { buildOutput: 'dist/app.js' },
  }, null, 2));
  await fixture(directory, 'build.mjs', [
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "await mkdir('dist', { recursive: true });",
    "await writeFile('dist/app.js', 'export const built = true;\\n');",
  ].join('\n'));

  const result = await runDeclaredFixtureBuild(directory, 2_000);
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 0);
  assert.equal(await exists(output), true);
  assert.match(await readFile(output, 'utf8'), /built = true/);
});

test('a nonterminating development server declared as build is a bounded failure', async (t) => {
  const directory = await temporary(t, 'aer-dev-as-build-');
  const output = path.join(directory, 'dist', 'app.js');
  await fixture(directory, 'package.json', JSON.stringify({
    scripts: { build: 'node dev.mjs' },
    aerFixture: { buildOutput: 'dist/app.js' },
  }, null, 2));
  await fixture(directory, 'dev.mjs', [
    "process.stdout.write('development server ready\\n');",
    'setInterval(() => {}, 1_000);',
  ].join('\n'));

  const result = await runDeclaredFixtureBuild(directory, 300);
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /development server ready/);
  assert.equal(await exists(output), false);
});

function dependencyReproducibilityProblems(manifest, { hasLockfile, exactPinPolicy }) {
  const direct = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  if (!Object.keys(direct).length || hasLockfile) return [];
  if (!exactPinPolicy) return ['dependencies require a retained lockfile or repository exact-pin policy'];
  const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  return Object.entries(direct)
    .filter(([, specifier]) => !exact.test(specifier))
    .map(([name, specifier]) => `${name} uses non-exact specifier ${specifier}`);
}

test('floating dependency specifiers without a lock do not qualify as reproducible', () => {
  const floating = { dependencies: { vite: 'latest', react: '^19.0.0' } };
  assert.deepEqual(
    dependencyReproducibilityProblems(floating, { hasLockfile: false, exactPinPolicy: false }),
    ['dependencies require a retained lockfile or repository exact-pin policy'],
  );
  assert.deepEqual(
    dependencyReproducibilityProblems(floating, { hasLockfile: false, exactPinPolicy: true }),
    ['vite uses non-exact specifier latest', 'react uses non-exact specifier ^19.0.0'],
  );
  assert.deepEqual(
    dependencyReproducibilityProblems(floating, { hasLockfile: true, exactPinPolicy: false }),
    [],
  );
  assert.deepEqual(
    dependencyReproducibilityProblems({ dependencies: { vite: '8.2.2' } }, { hasLockfile: false, exactPinPolicy: true }),
    [],
  );
});
