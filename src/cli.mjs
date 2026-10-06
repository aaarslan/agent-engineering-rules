#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { install, uninstall } from './install.mjs';
import { check } from './check.mjs';
import { AerError } from './fs-safe.mjs';

export const HELP = `Usage:
  aer install [--target DIR] [--destination portable:PATH|codex:PATH|claude-code:PATH]...
    [--instructions-file PATH] [--profile prototype|standard|high-assurance]
    [--skills all|none|NAME,NAME,...] [--dry-run] [--json]
  aer check [--target DIR] [--json]
  aer uninstall [--target DIR] [--keep-modified] [--dry-run] [--json]
  aer --help
  aer --version

Defaults: portable:.agents/skills, AGENTS.md, standard, all released skills.
Omitted selections on later install retain the recorded selections.
Preview/check are read-only. Uninstall --keep-modified preserves and detaches
modified paths. Interrupted operations resume with the same request/package.
Exit: 0 success/current, 1 check drift/absence/activity, 2 usage/runtime error,
3 preflight refusal (no consumer payload/state changes), 4 invalid state or I/O
failure (may retain a pending operation). No model or skill is executed.`;
export function parse(argv) {
  if (argv.length === 1 && ['--help', '-h', '--version'].includes(argv[0]))
    return { special: argv[0] };
  const [command, ...args] = argv;
  if (!['install', 'check', 'uninstall'].includes(command))
    throw new AerError('expected install, check or uninstall', 2, 'error');
  const options = {},
    seen = new Set();
  const allowed =
    command === 'install'
      ? [
          'target',
          'destination',
          'instructions-file',
          'profile',
          'skills',
          'dry-run',
          'json',
        ]
      : command === 'uninstall'
        ? ['target', 'keep-modified', 'dry-run', 'json']
        : ['target', 'json'];
  for (let i = 0; i < args.length; i++) {
    const name = args[i].slice(2);
    if (
      !args[i].startsWith('--') ||
      !allowed.includes(name) ||
      (seen.has(name) && name !== 'destination')
    )
      throw new AerError(
        `unknown, duplicate or inapplicable option: ${args[i]}`,
        2,
        'error',
      );
    seen.add(name);
    if (['json', 'dry-run', 'keep-modified'].includes(name)) {
      options[
        { json: 'json', 'dry-run': 'dryRun', 'keep-modified': 'keepModified' }[
          name
        ]
      ] = true;
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith('--'))
      throw new AerError(`--${name} requires a value`, 2, 'error');
    if (name === 'destination') {
      const m = value.match(/^(portable|codex|claude-code):(.+)$/);
      if (!m)
        throw new AerError(
          'destination requires an explicit representation:PATH',
          2,
          'error',
        );
      (options.destinations ??= []).push({ representation: m[1], path: m[2] });
    } else
      options[{ 'instructions-file': 'instructionsFile' }[name] ?? name] =
        value;
  }
  return { command, options };
}
export async function run(argv, io = console) {
  const json = argv.includes('--json');
  let command = argv[0],
    runningPackage = null;
  try {
    const parsed = parse(argv);
    if (parsed.special) {
      io.log(
        parsed.special === '--version'
          ? JSON.parse(
              await readFile(
                new URL('../package.json', import.meta.url),
                'utf8',
              ),
            ).version
          : HELP,
      );
      return 0;
    }
    const pkg = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );
    const manifest = JSON.parse(
      await readFile(
        new URL('../payload-manifest.json', import.meta.url),
        'utf8',
      ),
    );
    runningPackage = {
      version: pkg.version,
      sourceIdentity: manifest.sourceIdentity,
    };
    const min = pkg.engines.node.match(/^>=(\d+)\.(\d+)\.(\d+)$/);
    if (min) {
      const actual = process.versions.node.split('.').map(Number),
        required = min.slice(1).map(Number);
      const index = actual.findIndex((n, i) => n !== required[i]);
      if (index !== -1 && actual[index] < required[index])
        throw new AerError(`requires Node ${pkg.engines.node}`, 2, 'error');
    }
    command = parsed.command;
    const result = await { install, check, uninstall }[command](parsed.options);
    if (json) io.log(JSON.stringify(result));
    else
      io.log(
        `${command}: ${result.status}\n${result.plannedChanges.map((c) => `${c.action} ${c.path}`).join('\n')}${result.conflicts.length ? '\n' + result.conflicts.join('\n') : ''}${result.retained.length ? '\nretained: ' + result.retained.join(', ') : ''}\n${result.notes.join('\n')}`,
      );
    return result.exitCode;
  } catch (e) {
    const exitCode = e.exitCode ?? 4;
    const result = {
      schemaVersion: 1,
      command,
      status: e.status ?? 'error',
      exitCode,
      runningPackage: e.runningPackage ?? runningPackage,
      installedPackage: e.installedPackage ?? null,
      packageMatch: null,
      plannedChanges: e.plannedChanges ?? [],
      committedChanges: e.committedChanges ?? [],
      retained: e.retained ?? [],
      conflicts: e.conflicts ?? [e.message],
      notes: [],
      contextEstimates: null,
      pendingOperation:
        e.pendingOperation ??
        (e.status === 'interrupted'
          ? {
              recovery:
                'Inspect aer.lock.json and resume the recorded request with its creating package.',
            }
          : null),
    };
    if (json) io.log(JSON.stringify(result));
    else io.error(`${command}: ${result.status}: ${e.message}`);
    return exitCode;
  }
}
if (
  process.argv[1] &&
  (await realpath(process.argv[1])) ===
    (await realpath(fileURLToPath(import.meta.url)))
)
  process.exitCode = await run(process.argv.slice(2));
