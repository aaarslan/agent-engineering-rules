#!/usr/bin/env node
// Optional diagnostic dispatcher. Selection is always explicit: this program
// runs exactly one existing diagnostic and preserves its arguments and status.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKS = Object.freeze({
  contrast: 'contrast-check.mjs',
  slop: 'slop-scan.mjs',
  size: 'file-size-guard.mjs',
});

export function usage() {
  return `Usage:
  aer verify <contrast|slop|size> [diagnostic arguments...]
  aer verify --help

Runs exactly one optional diagnostic. Arguments after the check name are passed
through unchanged.

Checks:
  contrast   Check explicitly supplied foreground/background color pairs
  slop       Scan explicitly selected roots, files, or globs
  size       Inspect explicitly supplied files for size and density signals

Installed form:
  node agent-rules/tools/aer-verify.mjs <contrast|slop|size> [...]`;
}

export function parseArguments(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true };
  if (!argv.length) {
    const error = new Error('a diagnostic check is required: contrast, slop, or size');
    error.code = 'USAGE';
    throw error;
  }
  const [check, ...forwarded] = argv;
  if (!Object.hasOwn(CHECKS, check)) {
    const error = new Error(`unknown diagnostic check: ${check}`);
    error.code = 'USAGE';
    throw error;
  }
  if (check === 'size' && !forwarded.length) {
    const error = new Error('size requires diagnostic arguments; use --check FILE...');
    error.code = 'USAGE';
    throw error;
  }
  return { check, forwarded };
}

export function runVerifier(argv = process.argv.slice(2), {
  io = console,
  spawn = spawnSync,
  executable = process.execPath,
  directory = HERE,
} = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    io.error(`AER VERIFY FAILED: ${error.message}`);
    io.error(usage());
    return 2;
  }
  if (parsed.help) {
    io.log(usage());
    return 0;
  }

  const script = path.join(directory, CHECKS[parsed.check]);
  const result = spawn(executable, [script, ...parsed.forwarded], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    io.error(`AER VERIFY FAILED: ${result.error.message}`);
    return 2;
  }
  return Number.isInteger(result.status) ? result.status : 2;
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exitCode = runVerifier();
