#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { build } from './build-distributions.mjs';
import { validatePublicContent } from './validate-public-content.mjs';

const execFile = promisify(execFileCallback);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BUFFER = 20 * 1024 * 1024;
const PACKAGE_ROOT_FILES = [
  'ADOPT.md',
  'INSTALL.md',
  'LICENSE',
  'README.md',
  'package.json',
  'tools/README.md',
  'tools/aer.mjs',
  'tools/build-distributions.mjs',
  'tools/install-distribution.mjs',
];
const FORBIDDEN_PACKAGE_PATHS = [
  {
    label: 'repository-only source, compatibility, policy, research, or evaluation input',
    pattern: /(^|\/)(?:source|compatibility|policy|research|evals?|evaluation|evaluations|fixtures?)(?:\/|$)/i,
  },
  {
    label: 'repository-maintenance file',
    pattern: /(^|\/)(?:\.git|\.github|\.idea|\.vscode|coverage|docs|node_modules|test|tests)(?:\/|$)|(^|\/)(?:CODEOWNERS|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i,
  },
  {
    label: 'secret or credential file',
    pattern: /(^|\/)(?:\.env(?:\.[^/]*)?|[^/]*(?:credential|password|private[-_.]?key|recovery[-_.]?code|secret|token)[^/]*|\.npmrc)$|\.(?:jks|key|keystore|p12|pfx|pem)$/i,
  },
  {
    label: 'machine-specific or temporary file',
    pattern: /(^|\/)(?:\.DS_Store|desktop\.ini|Thumbs\.db|[^/]+\.(?:bak|dll|dylib|exe|log|node|orig|so|swp|tmp)|[^/]+~)$/i,
  },
];
const SECRET_CONTENT_PATTERNS = [
  { label: 'private key material', pattern: /-----BEGIN [^-\r\n]*PRIVATE KEY-----/ },
  { label: 'npm authentication material', pattern: /(?:^|\r?\n)\s*(?:\/\/[^\r\n]+:)?_authToken\s*=/i },
];

const portable = (value) => value.split(path.sep).join('/');

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function walkFiles(root, current = root, files = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`unexpected symbolic link in package inventory: ${portable(path.relative(root, file))}`);
    }
    if (entry.isDirectory()) await walkFiles(root, file, files);
    else if (entry.isFile()) files.push(file);
    else throw new Error(`unexpected non-file package entry: ${portable(path.relative(root, file))}`);
  }
  return files;
}

async function fileInventory(root, current = root, inventory = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name);
    const relative = portable(path.relative(root, file));
    const info = await lstat(file);
    const mode = info.mode & 0o777;
    if (entry.isSymbolicLink()) {
      inventory.push([relative, 'symlink', mode, await readlink(file)]);
    } else if (entry.isDirectory()) {
      inventory.push([relative, 'directory', mode]);
      await fileInventory(root, file, inventory);
    } else if (entry.isFile()) {
      const content = await readFile(file);
      inventory.push([
        relative,
        'file',
        mode,
        content.byteLength,
        createHash('sha256').update(content).digest('hex'),
      ]);
    } else {
      throw new Error(`unexpected filesystem entry in isolation snapshot: ${relative}`);
    }
  }
  return inventory.sort(([left], [right]) => left.localeCompare(right));
}

function assertSameInventory(actual, expected, label) {
  const actualNames = new Set(actual);
  const expectedNames = new Set(expected);
  const missing = expected.filter((file) => !actualNames.has(file));
  const unexpected = actual.filter((file) => !expectedNames.has(file));
  assert.deepEqual(
    { missing, unexpected },
    { missing: [], unexpected: [] },
    `${label} differs from the exact public package allowlist`,
  );
}

function sanitizedEnvironment({ cache, home, prefix }) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    const credentialLike = /(?:^|_)(?:API_?KEY|AUTH|CREDENTIALS?|JWT|PASSW(?:OR)?D|PRIVATE_?KEY|SECRET|TOKEN)(?:_|$)/i;
    if (/^npm_config_/i.test(key) || credentialLike.test(key) || /^(?:GIT|SSH)_ASKPASS$/i.test(key)) {
      delete environment[key];
    }
  }
  Object.assign(environment, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: home,
    XDG_CACHE_HOME: path.join(cache, 'xdg'),
    APPDATA: home,
    LOCALAPPDATA: home,
    GIT_CONFIG_GLOBAL: path.join(cache, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_CACHE: cache,
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_GLOBALCONFIG: path.join(cache, 'global-npmrc'),
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_LOGS_DIR: path.join(cache, 'logs'),
    NPM_CONFIG_OFFLINE: 'true',
    NPM_CONFIG_PREFIX: prefix,
    NPM_CONFIG_PROVENANCE: 'false',
    NPM_CONFIG_REGISTRY: 'https://registry.invalid/',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NPM_CONFIG_USERCONFIG: path.join(cache, 'user-npmrc'),
    NO_PROXY: '*',
    no_proxy: '*',
    TEMP: path.join(cache, 'temp'),
    TMP: path.join(cache, 'temp'),
    TMPDIR: path.join(cache, 'temp'),
  });
  if (process.platform === 'win32') {
    const root = path.parse(home).root;
    environment.HOMEDRIVE = root.replace(/[\\/]$/, '');
    environment.HOMEPATH = home.slice(root.length - 1);
  }
  return environment;
}

async function npmCliPath() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(`could not locate npm's CLI relative to Node ${process.version}`);
}

async function run(command, args, options, label) {
  try {
    return await execFile(command, args, {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      ...options,
    });
  } catch (error) {
    const output = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${label} failed with exit code ${error.code}${output ? `\n${output}` : ''}`, { cause: error });
  }
}

async function runNpm(npmCli, args, options, label) {
  return run(process.execPath, [npmCli, ...args], options, label);
}

async function locateInstalledPackage(prefix) {
  const candidates = process.platform === 'win32'
    ? [path.join(prefix, 'node_modules', '@aaarslan', 'aer')]
    : [
        path.join(prefix, 'lib', 'node_modules', '@aaarslan', 'aer'),
        path.join(prefix, 'node_modules', '@aaarslan', 'aer'),
      ];
  for (const candidate of candidates) {
    if (await exists(path.join(candidate, 'package.json'))) return await realpath(candidate);
  }
  throw new Error(`could not locate the installed @aaarslan/aer package under the isolated prefix`);
}

async function locateExecutable(prefix) {
  const executable = process.platform === 'win32'
    ? path.join(prefix, 'aer.cmd')
    : path.join(prefix, 'bin', 'aer');
  const info = await lstat(executable);
  assert.ok(info.isFile() || info.isSymbolicLink(), `installed aer executable has an unexpected file type`);
  return executable;
}

function environmentWithInstalledBin(environment, prefix) {
  const result = { ...environment };
  const pathKey = Object.keys(result).find((key) => key.toUpperCase() === 'PATH');
  const originalPath = pathKey ? result[pathKey] : '';
  if (pathKey) delete result[pathKey];
  result.PATH = `${process.platform === 'win32' ? prefix : path.join(prefix, 'bin')}${path.delimiter}${originalPath}`;
  return result;
}

async function runAer(executable, args, { cwd, environment, prefix }, label) {
  if (process.platform === 'win32') {
    const commandProcessor = process.env.ComSpec ?? 'cmd.exe';
    return run(
      commandProcessor,
      ['/d', '/s', '/c', 'aer.cmd', ...args],
      { cwd, env: environmentWithInstalledBin(environment, prefix) },
      label,
    );
  }
  return run(executable, args, { cwd, env: environment }, label);
}

async function assertDirectoryEmpty(directory, label) {
  assert.deepEqual(await readdir(directory), [], `${label} must remain empty`);
}

async function inspectPackManifest(report, expectedFiles, packageJson) {
  assert.equal(report.name, packageJson.name, 'packed package name differs from package.json');
  assert.equal(report.version, packageJson.version, 'packed package version differs from package.json');
  assert.ok(report.filename && path.basename(report.filename) === report.filename, 'npm returned an unsafe tarball filename');
  assert.match(report.integrity ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/, 'npm did not report sha512 integrity');
  assert.match(report.shasum ?? '', /^[a-f0-9]{40}$/, 'npm did not report a SHA-1 tarball checksum');
  assert.ok(Array.isArray(report.files) && report.files.length > 0, 'npm returned an empty tarball manifest');

  const actualFiles = [];
  const caseFolded = new Set();
  for (const entry of report.files) {
    const file = entry.path;
    assert.equal(typeof file, 'string', 'npm returned a non-string manifest path');
    assert.equal(file.includes('\\'), false, `tarball manifest path uses a backslash: ${file}`);
    assert.equal(path.posix.isAbsolute(file), false, `tarball manifest path is absolute: ${file}`);
    assert.equal(path.posix.normalize(file), file, `tarball manifest path is not normalized: ${file}`);
    assert.equal(file.startsWith('../') || file.includes('/../'), false, `tarball manifest path escapes the package: ${file}`);
    const folded = file.toLowerCase();
    assert.equal(caseFolded.has(folded), false, `tarball manifest has a duplicate or case-colliding path: ${file}`);
    caseFolded.add(folded);
    for (const forbidden of FORBIDDEN_PACKAGE_PATHS) {
      assert.equal(forbidden.pattern.test(file), false, `${file} is a ${forbidden.label}`);
    }
    assert.ok(Number.isInteger(entry.size) && entry.size >= 0, `npm did not report a valid size for ${file}`);
    actualFiles.push(file);
  }
  actualFiles.sort();
  assertSameInventory(actualFiles, expectedFiles, 'tarball manifest');
  for (const required of [
    'LICENSE',
    'README.md',
    'INSTALL.md',
    'ADOPT.md',
    'tools/aer.mjs',
    'dist/claude/CLAUDE.md',
    'dist/claude/.claude/rules/core-contract.md',
    'dist/codex/AGENTS.md',
    'dist/codex/.agents/skills/aer-verify/SKILL.md',
  ]) {
    assert.ok(actualFiles.includes(required), `tarball omits required public content: ${required}`);
  }
  assert.equal(
    report.files.reduce((total, entry) => total + entry.size, 0),
    report.unpackedSize,
    'npm tarball unpacked size differs from its file manifest',
  );
  const cli = report.files.find((entry) => entry.path === 'tools/aer.mjs');
  assert.ok(cli, 'tarball omits the aer executable');
}

async function inspectInstalledContents(installedPackage, expectedFiles, expectedDistributionInventory) {
  const installedFiles = (await walkFiles(installedPackage))
    .map((file) => portable(path.relative(installedPackage, file)))
    .sort();
  assertSameInventory(installedFiles, expectedFiles, 'installed package');
  assert.deepEqual(
    await fileInventory(path.join(installedPackage, 'dist')),
    expectedDistributionInventory,
    'installed Claude/Codex distributions differ from a fresh source build',
  );
  const personalPaths = await validatePublicContent(installedPackage);
  assert.deepEqual(personalPaths, [], 'packed files contain machine-specific home-directory paths');
  for (const file of await walkFiles(installedPackage)) {
    const content = await readFile(file, 'utf8');
    for (const secret of SECRET_CONTENT_PATTERNS) {
      assert.equal(secret.pattern.test(content), false, `${portable(path.relative(installedPackage, file))} contains ${secret.label}`);
    }
  }
}

async function main() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'aer-packed-install-'));
  const cache = path.join(workspace, 'cache');
  const home = path.join(workspace, 'home');
  const prefix = path.join(workspace, 'prefix');
  const target = path.join(workspace, 'target');
  const packDirectory = path.join(cache, 'pack');
  const expectedDistribution = path.join(cache, 'expected-dist');
  const environment = sanitizedEnvironment({ cache, home, prefix });

  try {
    await Promise.all([
      mkdir(path.join(cache, 'temp'), { recursive: true }),
      mkdir(home, { recursive: true }),
      mkdir(prefix, { recursive: true }),
      mkdir(target, { recursive: true }),
      mkdir(packDirectory, { recursive: true }),
    ]);

    const packageJson = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
    assert.equal(packageJson.name, '@aaarslan/aer', 'packed smoke test is restricted to @aaarslan/aer');
    assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, 'package version must be an exact semantic version');
    assert.deepEqual(packageJson.bin, { aer: 'tools/aer.mjs' }, 'package must expose only the aer executable');
    assert.equal(packageJson.engines?.node, '>=24', 'package must require Node >=24');
    for (const dependencyField of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) {
      assert.ok(
        packageJson[dependencyField] === undefined || Object.keys(packageJson[dependencyField]).length === 0,
        `runtime must remain dependency-free (${dependencyField})`,
      );
    }
    for (const lifecycle of ['preinstall', 'install', 'postinstall']) {
      assert.equal(packageJson.scripts?.[lifecycle], undefined, `${lifecycle} scripts are forbidden`);
    }

    await build(expectedDistribution);
    const expectedDistributionInventory = await fileInventory(expectedDistribution);
    assert.deepEqual(
      await fileInventory(path.join(repo, 'dist')),
      expectedDistributionInventory,
      'checked-in distributions differ from a fresh source build',
    );
    const distributionFiles = (await walkFiles(expectedDistribution))
      .map((file) => `dist/${portable(path.relative(expectedDistribution, file))}`);
    const expectedFiles = [...PACKAGE_ROOT_FILES, ...distributionFiles].sort();

    const npmCli = await npmCliPath();
    const packed = await runNpm(
      npmCli,
      ['pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', packDirectory],
      { cwd: repo, env: environment },
      'npm pack',
    );
    const reports = JSON.parse(packed.stdout);
    assert.ok(Array.isArray(reports) && reports.length === 1, 'npm pack must produce exactly one tarball');
    const [report] = reports;
    await inspectPackManifest(report, expectedFiles, packageJson);

    const tarball = path.resolve(packDirectory, report.filename);
    assert.equal(path.dirname(tarball), path.resolve(packDirectory), 'npm tarball escaped its isolated destination');
    const tarballBytes = await readFile(tarball);
    assert.equal(tarballBytes.byteLength, report.size, 'npm tarball byte size differs from its pack report');
    assert.equal(createHash('sha1').update(tarballBytes).digest('hex'), report.shasum, 'npm tarball SHA-1 differs from its pack report');
    assert.equal(
      `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`,
      report.integrity,
      'npm tarball integrity differs from its pack report',
    );

    await runNpm(
      npmCli,
      [
        'install', '--global', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
        '--no-package-lock', '--no-save', '--omit=dev', '--prefix', prefix, tarball,
      ],
      { cwd: target, env: environment },
      'isolated npm global install',
    );

    const executable = await locateExecutable(prefix);
    const installedPackage = await locateInstalledPackage(prefix);
    await inspectInstalledContents(installedPackage, expectedFiles, expectedDistributionInventory);
    const installedManifest = JSON.parse(await readFile(path.join(installedPackage, 'package.json'), 'utf8'));
    assert.equal(installedManifest.name, packageJson.name, 'installed package has the wrong name');
    assert.equal(installedManifest.version, packageJson.version, 'installed package has the wrong version');
    assert.deepEqual(installedManifest.bin, { aer: 'tools/aer.mjs' }, 'installed package has the wrong bin mapping');

    await assertDirectoryEmpty(target, 'isolated target before Git initialization');
    await run('git', ['init', '--quiet', '--initial-branch=main', '.'], { cwd: target, env: environment }, 'temporary git init');
    assert.ok(await exists(path.join(target, '.git')), 'temporary Git repository was not created');

    const prefixAfterInstall = await fileInventory(prefix);
    const targetBeforeCli = await fileInventory(target);
    const commandOptions = { cwd: target, environment, prefix };

    const version = await runAer(executable, ['--version'], commandOptions, 'aer --version');
    assert.equal(version.stdout, `${packageJson.version}\n`, 'aer --version must print exactly the installed package version');
    assert.equal(version.stderr, '', 'aer --version must not write to stderr');

    const help = await runAer(executable, ['--help'], commandOptions, 'aer --help');
    assert.match(help.stdout, /^Usage:\r?\n  aer --help\r?\n  aer --version/m, 'aer --help omitted the CLI usage');
    assert.equal(help.stderr, '', 'aer --help must not write to stderr');

    const claudeDryRun = await runAer(
      executable,
      ['init', '--host', 'claude', '--dry-run'],
      commandOptions,
      'Claude init dry-run',
    );
    assert.match(claudeDryRun.stdout, /WOULD INSTALL claude/);
    const codexDryRun = await runAer(
      executable,
      ['init', '--host', 'codex', '--dry-run'],
      commandOptions,
      'Codex init dry-run',
    );
    assert.match(codexDryRun.stdout, /WOULD INSTALL codex/);
    assert.deepEqual(await fileInventory(target), targetBeforeCli, 'help, version, or init dry-runs modified the target');

    const initialized = await runAer(
      executable,
      ['init', '--host', 'both'],
      commandOptions,
      'both-host init',
    );
    assert.match(initialized.stdout, /INSTALLED claude\+codex/);
    const state = JSON.parse(await readFile(path.join(target, '.agent-engineering-rules-state.json'), 'utf8'));
    assert.deepEqual(Object.keys(state.hosts).sort(), ['claude', 'codex'], 'both-host init did not record both hosts');
    assert.ok(await exists(path.join(target, 'CLAUDE.md')), 'both-host init omitted CLAUDE.md');
    assert.ok(await exists(path.join(target, 'AGENTS.md')), 'both-host init omitted AGENTS.md');

    const targetAfterInit = await fileInventory(target);
    const doctor = await runAer(executable, ['doctor'], commandOptions, 'aer doctor');
    assert.match(doctor.stdout, /^AER doctor: current\r?\n$/);
    const update = await runAer(executable, ['update', '--dry-run'], commandOptions, 'aer update --dry-run');
    assert.match(update.stdout, /WOULD (?:INSTALL|UPDATE) claude\+codex/);
    const uninstall = await runAer(executable, ['uninstall', '--dry-run'], commandOptions, 'aer uninstall --dry-run');
    assert.match(uninstall.stdout, /WOULD UNINSTALL claude\+codex/);
    assert.deepEqual(await fileInventory(target), targetAfterInit, 'doctor, update dry-run, or uninstall dry-run modified the target');

    assert.deepEqual(await fileInventory(prefix), prefixAfterInstall, 'the installed CLI modified its isolated global prefix');
    await assertDirectoryEmpty(home, 'isolated home and user-configuration boundary');
    assert.deepEqual((await readdir(workspace)).sort(), ['cache', 'home', 'prefix', 'target'], 'unexpected path was written in the isolation boundary');

    console.log(`PASS packed install smoke: ${packageJson.name}@${packageJson.version}`);
    console.log(`PASS tarball: ${report.files.length} files, ${report.size} bytes, ${report.integrity}`);
    console.log('PASS CLI: version, help, Claude/Codex dry-runs, both-host init, doctor, update dry-run, uninstall dry-run');
    console.log('PASS isolation: temporary prefix, cache, home boundary, Git repository, and project target');
  } finally {
    await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(`PACKED INSTALL SMOKE FAILED: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
