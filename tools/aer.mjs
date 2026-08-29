#!/usr/bin/env node

import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CODEX_MAX_BYTES,
  DEFAULT_PROFILE,
  SUPPORTED_CONTEXTS,
  SUPPORTED_PROFILES,
  doctorDistribution,
  installDistribution,
  uninstallDistribution,
} from './install-distribution.mjs';

const HOSTS = new Set(['claude', 'codex']);
const PROFILES = new Set(SUPPORTED_PROFILES);
const CONTEXTS = new Set(SUPPORTED_CONTEXTS);

const usage = () => `Usage:
  aer init --host <claude|codex|both> [options]
  aer update [--host <claude|codex|both>] [options]
  aer doctor [--json] [options]
  aer uninstall [--host <claude|codex|both>] [options]

Common options:
  --target <repo>                           Default: current directory
  --distribution-root <path>                Development/testing override

Init/update options:
  --profile <prototype|standard|high-assurance>
  --contexts <all|none|comma-list>          web-ui,typescript-react,backend-api
  --codex-max-bytes <integer>               Default: ${DEFAULT_CODEX_MAX_BYTES}
  --dry-run                                 Preflight without writing

Doctor options:
  --json                                    Emit the machine-readable result
  --codex-max-bytes <integer>               Default: ${DEFAULT_CODEX_MAX_BYTES}

Uninstall options:
  --dry-run                                 Preflight without writing
  --keep-modified                           Preserve and disown modified managed content
  --help                                    Show this help`;

function argumentError(message) {
  const error = new Error(message);
  error.code = 'ARGUMENT';
  return error;
}

function parseArguments(argv) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') return { help: true };
  if (!['init', 'update', 'doctor', 'uninstall'].includes(command)) throw argumentError(`unknown command: ${command}`);
  const takesValue = new Set(['--host', '--target', '--profile', '--contexts', '--distribution-root', '--codex-max-bytes']);
  const flags = new Set(['--dry-run', '--json', '--keep-modified', '--help']);
  const options = { command };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (flags.has(argument)) {
      if (options[argument]) throw argumentError(`${argument} may be specified only once`);
      options[argument] = true;
      continue;
    }
    if (!takesValue.has(argument)) throw argumentError(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw argumentError(`${argument} requires a value`);
    if (options[argument] !== undefined) throw argumentError(`${argument} may be specified only once`);
    options[argument] = value;
    index += 1;
  }
  return options;
}

function selectedHosts(value) {
  if (value === undefined) return undefined;
  if (value === 'both') return ['claude', 'codex'];
  if (HOSTS.has(value)) return [value];
  throw argumentError('--host must be exactly claude, codex, or both');
}

function selectedContexts(value, defaultValue) {
  if (value === undefined) return defaultValue;
  if (value === 'all') return [...CONTEXTS];
  if (value === 'none' || value === '') return [];
  const selected = value.split(',').map((item) => item.trim()).filter(Boolean);
  for (const context of selected) {
    if (!CONTEXTS.has(context)) throw argumentError(`unknown context: ${context}`);
  }
  return selected;
}

function commonOptions(args) {
  const codexMaxBytes = args['--codex-max-bytes'] === undefined
    ? DEFAULT_CODEX_MAX_BYTES
    : Number(args['--codex-max-bytes']);
  if (!Number.isInteger(codexMaxBytes) || codexMaxBytes <= 0) throw argumentError('--codex-max-bytes must be a positive integer');
  return {
    targetRoot: args['--target'] ?? '.',
    distributionRoot: args['--distribution-root'],
    codexMaxBytes,
  };
}

export async function runCli(argv = process.argv.slice(2), io = console) {
  let args;
  try {
    args = parseArguments(argv);
    if (args.help || args['--help']) {
      io.log(usage());
      return 0;
    }
    const common = commonOptions(args);
    if (args.command === 'init') {
      if (!args['--host']) throw argumentError('--host is required for init');
      if (args['--json'] || args['--keep-modified']) throw argumentError('init does not accept --json or --keep-modified');
      const profile = args['--profile'] ?? DEFAULT_PROFILE;
      if (!PROFILES.has(profile)) throw argumentError(`unknown profile: ${profile}`);
      await installDistribution({
        ...common,
        hosts: selectedHosts(args['--host']),
        profile,
        contexts: selectedContexts(args['--contexts'], []),
        dryRun: Boolean(args['--dry-run']),
        mode: 'init',
      });
      return 0;
    }
    if (args.command === 'update') {
      if (args['--json'] || args['--keep-modified']) throw argumentError('update does not accept --json or --keep-modified');
      if (args['--profile'] !== undefined && !PROFILES.has(args['--profile'])) throw argumentError(`unknown profile: ${args['--profile']}`);
      await installDistribution({
        ...common,
        hosts: selectedHosts(args['--host']),
        profile: args['--profile'],
        contexts: selectedContexts(args['--contexts'], undefined),
        dryRun: Boolean(args['--dry-run']),
        mode: 'update',
      });
      return 0;
    }
    if (args.command === 'doctor') {
      if (args['--host'] || args['--profile'] || args['--contexts'] || args['--dry-run'] || args['--keep-modified']) {
        throw argumentError('doctor accepts only --target, --distribution-root, --codex-max-bytes, and --json');
      }
      const result = await doctorDistribution(common);
      if (args['--json']) io.log(JSON.stringify(result, null, 2));
      else {
        io.log(`AER doctor: ${result.status}`);
        for (const issue of result.issues) io.log(`${issue.code}: ${issue.message}`);
      }
      return result.status === 'current' ? 0 : result.status === 'drift' ? 1 : 2;
    }
    if (args['--profile'] || args['--contexts'] || args['--json'] || args['--codex-max-bytes']) {
      throw argumentError('uninstall does not accept --profile, --contexts, --codex-max-bytes, or --json');
    }
    await uninstallDistribution({
      targetRoot: common.targetRoot,
      distributionRoot: common.distributionRoot,
      hosts: selectedHosts(args['--host']),
      dryRun: Boolean(args['--dry-run']),
      keepModified: Boolean(args['--keep-modified']),
    });
    return 0;
  } catch (error) {
    io.error(`AER FAILED: ${error.message}`);
    if (error.code === 'ARGUMENT') {
      io.error(usage());
      return 2;
    }
    return 1;
  }
}

let invokedDirectly = false;
if (process.argv[1]) {
  try {
    invokedDirectly = realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    invokedDirectly = path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}
if (invokedDirectly) process.exitCode = await runCli();
