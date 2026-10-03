import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultFiles = [
  path.resolve(here, '..', '..', 'source', 'config', 'thresholds.json'),
  path.resolve(here, '..', 'config', 'thresholds.json'),
  path.resolve(here, '..', '..', 'dist', 'codex', 'agent-rules', 'tools', 'config', 'thresholds.json'),
  path.resolve(here, '..', '..', 'dist', 'claude', 'agent-rules', 'tools', 'config', 'thresholds.json'),
];

async function readDocument(file) {
  const document = JSON.parse(await readFile(file, 'utf8'));
  if (document?.schema_version !== 1) throw new Error(`${file}: thresholds schema_version must equal 1`);
  return document;
}

export async function loadThresholds(file = null) {
  if (file !== null) return readDocument(file);
  for (const candidate of defaultFiles) {
    try { return await readDocument(candidate); }
    catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  throw new Error(`thresholds configuration not found; searched: ${defaultFiles.join(', ')}`);
}

export function requiredThreshold(document, key) {
  const value = document?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`thresholds.json is missing non-negative numeric ${key}`);
  }
  return value;
}
