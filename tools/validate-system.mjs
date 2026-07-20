#!/usr/bin/env node
// Dependency-free structure and context-budget validation.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ignored = new Set(['.git', 'node_modules', 'dist', 'build']);
const canonical = new Set(['core', 'workflow', 'design', 'architecture', 'quality', 'contexts', 'profiles']), scopes = new Set(['always', 'any-code-change', 'routed', 'context', 'profile', 'template']);
const ruleKeys = ['load_when', 'related', 'scope'];
const rootBudgets = new Map([['AGENTS.md', 550], ['README.md', 450], ['ADOPT.md', 350]]), defaultFiles = ['AGENTS.md', 'core/priorities.md', 'core/evidence-first.md', 'core/communication.md', 'profiles/standard.md'];
const errors = [], markdown = [], sized = [];
const relative = (file) => path.relative(root, file) || '.', words = (text) => text.trim() ? text.trim().split(/\s+/).length : 0;
const lines = (text) => text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0), problem = (message) => errors.push(message);
async function walk(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => !ignored.has(entry.name));
  if (!entries.length) problem(`${relative(directory)}: empty directory`);
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) {
      if (/\.(?:md|mjs|sh)$/.test(entry.name)) sized.push(file);
      if (entry.name.endsWith('.md')) markdown.push(file);
    }
  }
}
function frontmatter(text, file) {
  const rows = text.split(/\r?\n/), end = rows.indexOf('---', 1), fields = new Map();
  if (rows[0] !== '---' || end < 0) { problem(`${relative(file)}: missing or unclosed frontmatter`); return fields; }
  for (const row of rows.slice(1, end)) {
    const match = row.match(/^([a-z_]+):\s*(.+)$/);
    if (match) fields.set(match[1], match[2].trim()); else problem(`${relative(file)}: invalid frontmatter line: ${row}`);
  }
  return fields;
}
const slug = (heading) => heading.trim().toLowerCase().replace(/[`*_~]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
async function hasHeading(file, fragment) {
  const text = await readFile(file, 'utf8'), seen = new Map(), headings = new Set();
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slug(match[1]), count = seen.get(base) ?? 0;
    seen.set(base, count + 1); headings.add(count ? `${base}-${count}` : base);
  }
  return headings.has(fragment.toLowerCase());
}
async function link(source, raw) {
  const target = raw.trim().split(/\s+["']/)[0];
  if (target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) return;
  let pathname, fragment;
  try { [pathname, fragment = ''] = target.split('#', 2).map(decodeURIComponent); }
  catch { problem(`${relative(source)}: invalid encoded link ${raw}`); return; }
  if (!pathname) return;
  const destination = path.resolve(path.dirname(source), pathname);
  let metadata; try { metadata = await stat(destination); }
  catch { problem(`${relative(source)}: broken link ${raw}`); return; }
  if (fragment && metadata.isFile() && destination.endsWith('.md') && !await hasHeading(destination, fragment)) problem(`${relative(source)}: broken heading anchor ${raw}`);
}
async function validateMarkdown(file) {
  const text = await readFile(file, 'utf8'), name = relative(file), top = name.split(path.sep)[0];
  if (!text.trim()) { problem(`${name}: empty Markdown file`); return; }
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) await link(file, match[1]);
  if (path.basename(file) === 'CLAUDE.md') for (const match of text.matchAll(/^@([^\s]+)\s*$/gm)) await link(file, match[1]);
  const skill = name.startsWith(`.agents${path.sep}skills${path.sep}`);
  const limit = rootBudgets.get(name) ?? (skill ? 140 : top === 'profiles' ? 180 : canonical.has(top) ? 350 : undefined);
  if (limit && words(text) > limit) problem(`${name}: ${words(text)} words exceeds ${limit}`);
  if (canonical.has(top)) {
    const fields = frontmatter(text, file), keys = [...fields.keys()].sort();
    if (keys.join(',') !== ruleKeys.join(',')) problem(`${name}: frontmatter keys must be ${ruleKeys.join(', ')}`);
    const scope = fields.get('scope')?.match(/^\[([a-z-]+)\]$/)?.[1];
    if (!scopes.has(scope)) problem(`${name}: invalid scope ${fields.get('scope') ?? '<missing>'}`);
    const related = fields.get('related') ?? '';
    if (!fields.get('load_when') || !/^\[.*\]$/.test(related)) problem(`${name}: invalid load_when or related`);
    else for (const target of related.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean)) await link(file, target);
  }
  if (skill) {
    const fields = frontmatter(text, file), directory = path.basename(path.dirname(file));
    if (fields.get('name') !== directory || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directory)) problem(`${name}: invalid skill name`);
    if ((fields.get('description') ?? '').length < 40) problem(`${name}: skill description is too vague`);
  }
}
try {
  await walk(root);
  for (const file of sized) {
    const count = lines(await readFile(file, 'utf8'));
    if (count > 100) problem(`${relative(file)}: ${count} lines exceeds 100`);
  }
  for (const file of markdown) await validateMarkdown(file);
  const baseline = await Promise.all(defaultFiles.map((file) => readFile(path.join(root, file), 'utf8')));
  const baselineWords = baseline.reduce((sum, text) => sum + words(text), 0);
  const baselineCharacters = baseline.reduce((sum, text) => sum + text.length, 0);
  if (baselineWords > 1350) problem(`default route: ${baselineWords} words exceeds 1350`);
  if (errors.length) {
    console.error(`FAIL: ${errors.length} structural or budget issue(s)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  const skills = markdown.filter((file) => relative(file).startsWith(`.agents${path.sep}skills${path.sep}`)).length;
  const rules = markdown.filter((file) => canonical.has(relative(file).split(path.sep)[0])).length;
  console.log(`PASS: ${markdown.length} Markdown files, ${rules} canonical files, ${skills} skills; default route ${baselineWords} words (~${Math.ceil(baselineCharacters / 4)} tokens by characters/4)`);
} catch (error) {
  console.error(`ERROR: validation could not complete: ${error.message}`);
  process.exit(2);
}
