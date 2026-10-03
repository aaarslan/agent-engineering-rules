#!/usr/bin/env node
// Prevent machine-specific home-directory paths from leaking into this public
// repository. Placeholder forms such as C:/Users/<name> remain allowed.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules']);
const TEXT_EXTENSIONS = new Set(['.json', '.md', '.mjs', '.js', '.py', '.sh', '.txt', '.yaml', '.yml']);

export function findPersonalPaths(text) {
  const findings = [];
  const patterns = [
    /\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/](?!<)[^\\/:\r\n]+/gi,
    /\/(?:Users|home)\/(?!<)[^/\s]+/g,
    /\/root\/(?!<)[^/\s]+/g,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) findings.push(match[0]);
  return [...new Set(findings)].sort();
}

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(target, files);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(target);
  }
  return files;
}

export async function validatePublicContent(root = repo) {
  const errors = [];
  for (const file of await walk(root)) {
    const text = await readFile(file, 'utf8');
    const findings = findPersonalPaths(text);
    if (findings.length) errors.push(`${path.relative(root, file).replaceAll('\\', '/')}: ${findings.join(', ')}`);
  }
  return errors;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  validatePublicContent().then((errors) => {
    if (errors.length) {
      console.error(`FAIL (${errors.length})`);
      for (const error of errors) console.error(`  - ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log('PASS (no personal home-directory paths found)');
  }).catch((error) => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
}
