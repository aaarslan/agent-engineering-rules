import { readFile } from 'node:fs/promises';
export function requiredThreshold(document, key) {
  const value = document?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw Error(`thresholds.json missing non-negative numeric ${key}`);
  return value;
}
export const THRESHOLDS = JSON.parse(
  await readFile(new URL('../kernel/thresholds.json', import.meta.url), 'utf8'),
);
