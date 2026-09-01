import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MANIFEST, build } from './build-distributions.mjs';
import { RETIRED_MANAGED_PATHS } from './install-distribution.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(root, 'tools', 'file-size-guard.mjs');
const contrast = path.join(root, 'tools', 'contrast-check.mjs');
const slop = path.join(root, 'tools', 'slop-scan.mjs');

function mergeEnvironment(base, overrides, caseInsensitive = process.platform === 'win32') {
  if (!caseInsensitive) return { ...base, ...overrides };
  const environment = {};
  const canonicalKeys = new Map();
  for (const [key, value] of Object.entries(base)) {
    const folded = key.toLowerCase();
    const existing = canonicalKeys.get(folded);
    if (existing === undefined) {
      canonicalKeys.set(folded, key);
      environment[key] = value;
    } else if (folded === 'path') {
      const segments = `${environment[existing]}${path.delimiter}${value}`
        .split(path.delimiter)
        .filter(Boolean);
      environment[existing] = [...new Set(segments)].join(path.delimiter);
    } else {
      environment[existing] = value;
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    const folded = key.toLowerCase();
    const existing = canonicalKeys.get(folded);
    if (existing !== undefined) delete environment[existing];
    canonicalKeys.set(folded, key);
    environment[key] = value;
  }
  return environment;
}

function run(command, arguments_, { cwd = root, env = {}, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: mergeEnvironment(process.env, env),
      windowsHide: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    if (input !== undefined) {
      child.stdin.on('error', reject);
      child.stdin.end(input);
    }
  });
}

function runNode(script, arguments_ = [], options = {}) {
  return run(process.execPath, [script, ...arguments_], options);
}

async function makeTemporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'aer-tool-contract-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(directory, relative, text) {
  const target = path.join(directory, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, 'utf8');
  return target;
}

function sourceLines(count, prefix = 'value') {
  return Array.from({ length: count }, (_, index) => `const ${prefix}${index} = ${index};`).join('\n');
}

async function git(directory, arguments_) {
  const result = await run('git', arguments_, { cwd: directory });
  assert.equal(result.code, 0, `git ${arguments_.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  return result;
}

async function initializeGit(directory) {
  await git(directory, ['init', '--quiet']);
  await git(directory, ['config', 'user.name', 'AER Tool Test']);
  await git(directory, ['config', 'user.email', 'aer-tool-test@example.invalid']);
  await git(directory, ['config', 'commit.gpgSign', 'false']);
}

async function commitAll(directory) {
  await git(directory, ['add', '.']);
  await git(directory, ['commit', '--quiet', '-m', 'fixture baseline']);
}

function combined(result) {
  return `${result.stdout}${result.stderr}`;
}

test('test subprocess environments preserve Windows path and override semantics', () => {
  const environment = mergeEnvironment(
    { Path: 'first-path', PATH: 'second-path', Temp: 'old-temp' },
    { TEMP: 'new-temp' },
    true,
  );
  const pathKeys = Object.keys(environment).filter((key) => key.toLowerCase() === 'path');
  const tempKeys = Object.keys(environment).filter((key) => key.toLowerCase() === 'temp');
  assert.equal(pathKeys.length, 1);
  assert.deepEqual(environment[pathKeys[0]].split(path.delimiter), ['first-path', 'second-path']);
  assert.deepEqual(tempKeys, ['TEMP']);
  assert.equal(environment.TEMP, 'new-temp');
});

test('tool help, host inventory, and retired paths use the Node-only contract', async (t) => {
  for (const script of [guard, contrast, slop]) {
    const result = await runNode(script, ['--help']);
    assert.equal(result.code, 0, `${path.basename(script)} help failed: ${combined(result)}`);
    assert.ok(result.stdout.trim().length > 80, `${path.basename(script)} help was empty`);
  }
  assert.match((await runNode(guard, ['--help'])).stdout, /^NOT-APPLICABLE mode=help/m);
  assert.match((await runNode(slop, ['--help'])).stdout, /^NOT-APPLICABLE mode=help/m);
  assert.match((await runNode(contrast, ['--help'])).stdout, /^HELP /m);

  const expected = ['tools/contrast-check.mjs', 'tools/slop-scan.mjs', 'tools/file-size-guard.mjs'];
  assert.deepEqual(MANIFEST.tools, expected);
  assert.deepEqual(RETIRED_MANAGED_PATHS, {
    claude: ['agent-rules/tools/file-size-guard.py', 'agent-rules/tools/slop-scan.sh'],
    codex: ['agent-rules/tools/file-size-guard.py', 'agent-rules/tools/slop-scan.sh'],
  });

  const output = await makeTemporary(t);
  await build(output);
  for (const host of ['claude', 'codex']) {
    const directory = path.join(output, host, 'agent-rules', 'tools');
    const names = (await readdir(directory)).sort();
    assert.deepEqual(names, ['contrast-check.mjs', 'file-size-guard.mjs', 'slop-scan.mjs']);
    assert.equal(names.some((name) => name.endsWith('.py') || name.endsWith('.sh')), false);
  }
});

test('file-size CLI handles valid, ignored, dense, malformed, and override inputs explicitly', async (t) => {
  const directory = await makeTemporary(t);
  await fixture(directory, 'small.js', 'export const small = true;\n');
  await fixture(directory, 'legacy.js', sourceLines(510, 'legacy'));
  await initializeGit(directory);
  await commitAll(directory);

  let result = await runNode(guard, ['--check', 'small.js'], { cwd: directory });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^APPLICABLE-PASS file="small\.js"/m);
  assert.match(result.stdout, /^APPLICABLE-PASS summary checked=1/m);

  result = await runNode(guard, ['--check', 'legacy.js'], { cwd: directory });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /APPLICABLE-PASS/);
  assert.match(result.stdout, /pre-existing large file/);
  assert.match(result.stdout, /head-lines=510/);

  await fixture(directory, 'legacy.js', sourceLines(612, 'legacy'));
  result = await runNode(guard, ['--check', 'legacy.js'], { cwd: directory });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^ADVISORY file="legacy\.js"/m);
  assert.match(result.stdout, /was 510 lines at Git HEAD and grew to 612 lines/);

  await fixture(directory, 'new-large.js', sourceLines(501, 'fresh'));
  result = await runNode(guard, ['--check', 'new-large.js'], { cwd: directory });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^ADVISORY /m);
  assert.match(result.stdout, /crossing the 500-line advisory threshold/);

  result = await runNode(guard, ['--check', 'new-large.js'], {
    cwd: directory,
    env: { FILE_SIZE_GUARD_THRESHOLD: '700' },
  });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^APPLICABLE-PASS /m);

  await fixture(directory, 'dense.js', `export const payload = "${'x'.repeat(5000)}";`);
  result = await runNode(guard, ['--check', 'dense.js'], { cwd: directory });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^ADVISORY /m);
  assert.match(result.stdout, /dense short-file signal/);
  assert.match(result.stdout, /bytes-per-line=/);

  await fixture(directory, 'output.js', `// Generated by fixture\n${sourceLines(600, 'generated')}`);
  result = await runNode(guard, ['--check', 'output.js'], { cwd: directory });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /^NOT-APPLICABLE /m);
  assert.match(result.stdout, /generated marker/);
  assert.doesNotMatch(result.stdout, /APPLICABLE-PASS summary/);

  await fixture(directory, 'client.generated.js', sourceLines(600, 'filename'));
  result = await runNode(guard, ['--check', 'client.generated.js'], { cwd: directory });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /generated or bundled filename/);

  await fixture(directory, 'generated/client.js', sourceLines(600, 'directory'));
  result = await runNode(guard, ['--check', 'generated/client.js'], { cwd: directory });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /generated\/vendor\/build directory generated/);

  const authoredBelowBuild = path.join(directory, 'build', 'authored-repository');
  await fixture(authoredBelowBuild, 'small.js', 'export const authored = true;\n');
  result = await runNode(guard, ['--check', 'small.js'], { cwd: authoredBelowBuild });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /APPLICABLE-PASS/);

  await fixture(directory, 'notes.md', '# declarative\n');
  result = await runNode(guard, ['--check', 'notes.md'], { cwd: directory });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /NOT-APPLICABLE/);
  assert.match(result.stdout, /unsupported declarative or non-source extension/);

  await fixture(directory, '-leading.js', 'export const allowed = true;\n');
  result = await runNode(guard, ['--check', '--', '-leading.js'], { cwd: directory });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /APPLICABLE-PASS/);

  result = await runNode(guard, ['--check', 'missing.js'], { cwd: directory });
  assert.equal(result.code, 2);
  assert.match(combined(result), /ERROR/);
  result = await runNode(guard, ['--unknown'], { cwd: directory });
  assert.equal(result.code, 2);
  assert.match(combined(result), /ERROR/);
  result = await runNode(guard, ['--check', 'small.js'], {
    cwd: directory,
    env: { FILE_SIZE_GUARD_THRESHOLD: 'invalid' },
  });
  assert.equal(result.code, 2);
  assert.match(combined(result), /ERROR/);
});

test('file-size PostToolUse hook supports Claude and Codex and re-notifies after growth', async (t) => {
  const directory = await makeTemporary(t);
  const stateDirectory = path.join(directory, 'state');
  await fixture(directory, 'tracked.js', 'export const tracked = true;\n');
  await initializeGit(directory);
  await commitAll(directory);
  await fixture(directory, 'new-large.js', sourceLines(501, 'hook'));

  const environment = { FILE_SIZE_GUARD_STATE_DIR: stateDirectory };
  const codexPayload = {
    session_id: 'codex-session',
    transcript_path: path.join(directory, 'codex-transcript.jsonl'),
    cwd: directory,
    permission_mode: 'default',
    hook_event_name: 'PostToolUse',
    tool_name: 'apply_patch',
    tool_input: { command: '*** Begin Patch\n*** Add File: new-large.js\n*** End Patch' },
    tool_response: { output: 'Done!' },
    tool_use_id: 'call_codex_1',
    turn_id: 'turn_codex_1',
    model: 'gpt-5.6',
  };

  let result = await runNode(guard, [], { cwd: directory, env: environment, input: JSON.stringify(codexPayload) });
  assert.equal(result.code, 0);
  let payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /ADVISORY/);
  assert.match(payload.hookSpecificOutput.additionalContext, /notification=emitted/);

  result = await runNode(guard, [], { cwd: directory, env: environment, input: JSON.stringify(codexPayload) });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput, undefined);
  assert.match(payload.systemMessage, /ADVISORY/);
  assert.match(payload.systemMessage, /notification=suppressed-until-20%-growth/);

  await fixture(directory, 'new-large.js', sourceLines(602, 'hook'));
  result = await runNode(guard, [], { cwd: directory, env: environment, input: JSON.stringify(codexPayload) });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /ADVISORY/);
  assert.match(payload.hookSpecificOutput.additionalContext, /notification=emitted/);

  const claudePayload = {
    session_id: 'claude-session',
    transcript_path: path.join(directory, 'claude-transcript.jsonl'),
    cwd: directory,
    permission_mode: 'default',
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'tracked.js' },
    tool_response: { filePath: 'tracked.js' },
    tool_use_id: 'toolu_claude_1',
  };
  result = await runNode(guard, [], { cwd: directory, env: environment, input: JSON.stringify(claudePayload) });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput, undefined);
  assert.match(payload.systemMessage, /APPLICABLE-PASS/);

  result = await runNode(guard, [], { cwd: directory, env: environment, input: '{' });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.systemMessage, /ERROR/);
  assert.match(payload.systemMessage, /malformed PostToolUse JSON/);

  result = await runNode(guard, [], { cwd: directory, env: environment });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.systemMessage, /ERROR/);
  assert.match(payload.systemMessage, /malformed PostToolUse JSON/);

  result = await runNode(guard, [], {
    cwd: directory,
    env: environment,
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** End Patch' } }),
  });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.systemMessage, /ERROR/);
  assert.match(payload.systemMessage, /requires non-empty session_id/);

  for (const field of ['transcript_path', 'permission_mode', 'tool_response', 'tool_use_id', 'turn_id', 'model']) {
    const malformed = { ...codexPayload };
    delete malformed[field];
    result = await runNode(guard, [], { cwd: directory, env: environment, input: JSON.stringify(malformed) });
    assert.equal(result.code, 0);
    payload = JSON.parse(result.stdout);
    assert.match(payload.systemMessage, /ERROR/);
    assert.match(payload.systemMessage, new RegExp(field));
  }
  for (const malformed of [
    { ...codexPayload, transcript_path: 7 },
    { ...codexPayload, permission_mode: 'invented-mode' },
  ]) {
    result = await runNode(guard, [], { cwd: directory, env: environment, input: JSON.stringify(malformed) });
    assert.equal(result.code, 0);
    payload = JSON.parse(result.stdout);
    assert.match(payload.systemMessage, /ERROR/);
  }
  for (const toolResponse of ['Done!', { output: 'Done!' }, null]) {
    result = await runNode(guard, [], {
      cwd: directory,
      env: environment,
      input: JSON.stringify({
        ...codexPayload,
        tool_response: toolResponse,
        tool_input: { command: '*** Begin Patch\n*** Update File: tracked.js\n*** End Patch' },
      }),
    });
    assert.equal(result.code, 0);
    payload = JSON.parse(result.stdout);
    assert.match(payload.systemMessage, /APPLICABLE-PASS/);
    assert.doesNotMatch(payload.systemMessage, /ERROR/);
  }
  result = await runNode(guard, [], {
    cwd: directory,
    env: environment,
    input: JSON.stringify({
      ...codexPayload,
      transcript_path: null,
      tool_input: { command: '*** Begin Patch\n*** Update File: tracked.js\n*** End Patch' },
    }),
  });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.systemMessage, /APPLICABLE-PASS/);

  result = await runNode(guard, [], {
    cwd: directory,
    env: environment,
    input: JSON.stringify({ ...codexPayload, tool_name: 'Shell', tool_input: { command: 'echo ok' } }),
  });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput, undefined);
  assert.match(payload.systemMessage, /NOT-APPLICABLE/);
  assert.doesNotMatch(payload.systemMessage, /APPLICABLE-PASS/);

  const outsideGit = await makeTemporary(t);
  await fixture(outsideGit, 'fresh-large.js', sourceLines(501, 'outside'));
  const outsideEnvironment = { FILE_SIZE_GUARD_STATE_DIR: path.join(outsideGit, 'state') };
  const outsidePayload = {
    ...codexPayload,
    session_id: 'outside-git-session',
    cwd: outsideGit,
    transcript_path: path.join(outsideGit, 'transcript.jsonl'),
    tool_input: { command: '*** Begin Patch\n*** Add File: fresh-large.js\n*** End Patch' },
  };
  result = await runNode(guard, [], {
    cwd: outsideGit,
    env: outsideEnvironment,
    input: JSON.stringify(outsidePayload),
  });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /ADVISORY/);
  assert.match(payload.hookSpecificOutput.additionalContext, /grew from 0 to 501 lines/);

  await fixture(outsideGit, 'fresh-large.js', sourceLines(602, 'outside'));
  result = await runNode(guard, [], {
    cwd: outsideGit,
    env: outsideEnvironment,
    input: JSON.stringify({
      ...outsidePayload,
      tool_input: { command: '*** Begin Patch\n*** Update File: fresh-large.js\n*** End Patch' },
    }),
  });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /ADVISORY/);
  assert.match(payload.hookSpecificOutput.additionalContext, /was 501 lines at Git HEAD and grew to 602 lines/);
  assert.match(payload.hookSpecificOutput.additionalContext, /notification=emitted/);

  await fixture(outsideGit, 'fresh-small.js', sourceLines(100, 'outside-small'));
  const smallPayload = {
    ...outsidePayload,
    tool_input: { command: '*** Begin Patch\n*** Add File: fresh-small.js\n*** End Patch' },
  };
  result = await runNode(guard, [], { cwd: outsideGit, env: outsideEnvironment, input: JSON.stringify(smallPayload) });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.systemMessage, /APPLICABLE-PASS/);
  await fixture(outsideGit, 'fresh-small.js', sourceLines(501, 'outside-small'));
  result = await runNode(guard, [], {
    cwd: outsideGit,
    env: outsideEnvironment,
    input: JSON.stringify({
      ...smallPayload,
      tool_input: { command: '*** Begin Patch\n*** Update File: fresh-small.js\n*** End Patch' },
    }),
  });
  assert.equal(result.code, 0);
  payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /ADVISORY/);
  assert.match(payload.hookSpecificOutput.additionalContext, /grew from 100 to 501 lines/);
});

test('contrast supports every documented color form and exact AA thresholds', async () => {
  for (const foreground of ['#000', '#000000', 'rgb(0, 0, 0)', 'rgb(0 0 0)', 'rgb(0% 0% 0%)', 'oklch(0 0 0)']) {
    const result = await runNode(contrast, [foreground, '#fff', '16', '400']);
    assert.equal(result.code, 0, `${foreground}: ${combined(result)}`);
    assert.match(result.stdout, /^PASS pair="single"/m);
    assert.match(result.stdout, new RegExp(`foreground=${JSON.stringify(foreground).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(result.stdout, /ratio=21\.00:1 threshold=4\.5:1/);
  }

  let result = await runNode(contrast, ['#777', '#fff', '16', '400']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^ACCESSIBILITY-FAIL /m);
  assert.match(result.stdout, /Rerun failed named pairs after editing/);

  result = await runNode(contrast, ['#777', '#fff', '24', '400']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /threshold=3:1 text-size=large/);
  result = await runNode(contrast, ['#777', '#fff', '18.66', 'bold']);
  assert.equal(result.code, 0);
  result = await runNode(contrast, ['#777', '#fff', '18.65', '700']);
  assert.equal(result.code, 1);
});

test('contrast batch mode names each pair and rejects malformed or unsupported inputs', async (t) => {
  const batch = JSON.stringify([
    { name: 'body', foreground: '#000', background: '#fff', fontSize: 16, fontWeight: 400 },
    { name: 'faint label', foreground: '#777', background: '#fff', fontSize: 14, fontWeight: 400 },
  ]);
  let result = await runNode(contrast, ['--batch', '-'], { input: batch });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^PASS pair="body"/m);
  assert.match(result.stdout, /^ACCESSIBILITY-FAIL pair="faint label"/m);
  assert.match(result.stdout, /summary checked=2 passed=1 failed=1/);

  result = await runNode(contrast, ['--batch', '-'], {
    input: JSON.stringify([{ name: 'body', foreground: '#000', background: '#fff' }]),
  });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /summary checked=1 passed=1 failed=0/);

  const directory = await makeTemporary(t);
  await fixture(directory, 'pairs.json', JSON.stringify([
    { name: 'file pair', foreground: '#000', background: '#fff', fontSize: 16, fontWeight: 400 },
  ]));
  result = await runNode(contrast, ['--batch', 'pairs.json'], { cwd: directory });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^PASS pair="file pair"/m);

  for (const arguments_ of [
    [],
    ['styles.css', '#fff'],
    ['rgba(0,0,0,0.5)', '#fff'],
    ['rgb(0,,0,0)', '#fff'],
    ['rgb(0, 0 0)', '#fff'],
    ['rgb(0 0 0 / 50%)', '#fff'],
    ['linear-gradient(#000, #fff)', '#fff'],
    ['#0008', '#fff'],
    ['--unknown'],
  ]) {
    result = await runNode(contrast, arguments_);
    assert.equal(result.code, 2, `${arguments_.join(' ')}: ${combined(result)}`);
    assert.match(combined(result), /INPUT-ERROR/);
  }
  result = await runNode(contrast, ['--batch', '-'], { input: '{' });
  assert.equal(result.code, 2);
  assert.match(combined(result), /INPUT-ERROR/);
  result = await runNode(contrast, ['--batch', '-'], { input: '[]' });
  assert.equal(result.code, 2);
  assert.match(combined(result), /non-empty JSON array/);
  result = await runNode(contrast, ['--batch', '-'], {
    input: JSON.stringify([{ foreground: '#000', background: '#fff' }]),
  });
  assert.equal(result.code, 2);
  assert.match(combined(result), /requires a non-empty name/);
});

test('slop scan handles root-level static projects with categorized file-line evidence', async (t) => {
  const clean = await makeTemporary(t);
  await fixture(clean, 'index.html', '<!doctype html>\n<div id="status"></div>\n<script src="app.js"></script>\n');
  await fixture(clean, 'app.js', [
    "document.querySelector('#status').textContent = externalText;",
    '// TODO #123: tracked follow-up',
  ].join('\n'));
  let result = await runNode(slop, ['--root', '.'], { cwd: clean });
  assert.equal(result.code, 0, combined(result));
  assert.match(result.stdout, /^APPLICABLE-PASS summary files=2/m);
  assert.doesNotMatch(result.stdout, /NOT-APPLICABLE summary/);
  for (const category of ['unsafe-html-sink', 'custom-escaper', 'timer', 'storage', 'todo-without-inline-reference']) {
    assert.doesNotMatch(result.stdout, new RegExp(`category=${category}`));
  }

  const risky = await makeTemporary(t);
  await fixture(risky, 'index.html', '<!doctype html>\n<script src="app.js"></script>\n');
  await fixture(risky, 'app.js', [
    "target.innerHTML = externalText;",
    'function escapeHtml(value) { return value; }',
    'setTimeout(render, 250);',
    "localStorage.setItem('draft', value);",
    '// TODO: finish recovery',
  ].join('\n'));
  result = await runNode(slop, ['--root', '.'], { cwd: risky });
  assert.equal(result.code, 1, combined(result));
  assert.match(result.stdout, /DETERMINISTIC-FINDING category=unsafe-html-sink evidence="app\.js:1"/);
  assert.match(result.stdout, /HEURISTIC-WARNING category=custom-escaper evidence="app\.js:2"/);
  assert.match(result.stdout, /MANUAL-REVIEW category=timer evidence="app\.js:3"/);
  assert.match(result.stdout, /MANUAL-REVIEW category=storage evidence="app\.js:4"/);
  assert.match(result.stdout, /MANUAL-REVIEW category=todo-without-inline-reference evidence="app\.js:5"/);
  assert.match(result.stdout, /ADVISORY summary .*deterministic-findings=1 heuristic-warnings=1 manual-review=3/);
});

test('slop scan detects possibly dead TypeScript exports in src projects', async (t) => {
  const directory = await makeTemporary(t);
  await fixture(directory, 'src/main.ts', "import { used } from './feature.js';\nconsole.log(used);\n");
  await fixture(directory, 'src/feature.ts', 'export const used = 1;\nexport const orphan = 2;\n');
  const result = await runNode(slop, ['--root', '.'], { cwd: directory });
  assert.equal(result.code, 1, combined(result));
  assert.match(result.stdout, /HEURISTIC-WARNING category=possibly-dead-export evidence="src\/feature\.ts:2"/);
  assert.doesNotMatch(result.stdout, /possibly-dead-export evidence="src\/feature\.ts:1"/);
});

test('slop selectors exclude generated artifacts and distinguish errors from not-applicable', async (t) => {
  const directory = await makeTemporary(t);
  await fixture(directory, 'index.html', '<!doctype html>\n<script src="app.js"></script>\n');
  await fixture(directory, 'app.js', "document.querySelector('p').textContent = 'safe';\n");
  await fixture(directory, 'dist/bad.js', 'target.innerHTML = value;\n');
  await fixture(directory, 'vendor/bad.js', 'target.innerHTML = value;\n');
  await fixture(directory, 'fixture.test.js', 'target.innerHTML = value;\n');
  await fixture(directory, 'marker-only.js', '// Generated by fixture\ntarget.innerHTML = value;\n');
  await fixture(directory, 'client.generated.js', 'target.innerHTML = value;\n');
  await fixture(directory, 'generated/client.js', 'target.innerHTML = value;\n');
  await fixture(directory, 'notes.txt', 'not browser source\n');

  let result = await runNode(slop, ['--root', '.'], { cwd: directory });
  assert.equal(result.code, 0, combined(result));
  assert.match(result.stdout, /APPLICABLE-PASS/);
  assert.doesNotMatch(result.stdout, /unsafe-html-sink/);

  result = await runNode(slop, ['--file', 'dist/bad.js'], { cwd: directory });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /NOT-APPLICABLE/);
  assert.doesNotMatch(result.stdout, /APPLICABLE-PASS/);
  result = await runNode(slop, ['--file', 'notes.txt'], { cwd: directory });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /unsupported extension/);
  result = await runNode(slop, ['--file', 'index.html'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /NOT-APPLICABLE category=project-wide-reference-checks/);
  assert.match(result.stdout, /ADVISORY summary/);
  assert.doesNotMatch(result.stdout, /APPLICABLE-PASS/);
  result = await runNode(slop, ['--glob', '*.html'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /NOT-APPLICABLE category=project-wide-reference-checks/);
  assert.match(result.stdout, /ADVISORY summary/);
  assert.doesNotMatch(result.stdout, /APPLICABLE-PASS/);
  result = await runNode(slop, ['--glob', 'missing/**/*.js'], { cwd: directory });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /NOT-APPLICABLE/);
  await mkdir(path.join(directory, 'empty'));
  result = await runNode(slop, ['--root', 'empty', '--file', 'index.html'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /NOT-APPLICABLE input="empty" reason="root contained no supported/);
  assert.match(result.stdout, /NOT-APPLICABLE category=project-wide-reference-checks/);
  assert.match(result.stdout, /ADVISORY summary/);
  assert.doesNotMatch(result.stdout, /APPLICABLE-PASS/);
  result = await runNode(slop, ['--root', '.', '--root', 'empty'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /NOT-APPLICABLE input="empty" reason="root contained no supported/);
  assert.match(result.stdout, /project set was incomplete/);
  assert.doesNotMatch(result.stdout, /--file and --glob do not establish/);
  assert.match(result.stdout, /reason="not-applicable project-wide checks require disposition/);
  assert.doesNotMatch(result.stdout, /reason="findings and not-applicable/);
  assert.doesNotMatch(result.stdout, /APPLICABLE-PASS/);
  result = await runNode(slop, ['--root', '.', '--glob', 'missing/**/*.js'], { cwd: directory });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /NOT-APPLICABLE input="missing\/\*\*\/\*\.js"/);
  assert.match(result.stdout, /ADVISORY summary/);
  assert.doesNotMatch(result.stdout, /APPLICABLE-PASS/);
  result = await runNode(slop, ['--root', 'missing'], { cwd: directory });
  assert.equal(result.code, 2);
  assert.match(combined(result), /ERROR/);
  result = await runNode(slop, ['--glob', 'src/*.{js,ts}'], { cwd: directory });
  assert.equal(result.code, 2);
  assert.match(combined(result), /ERROR/);
  result = await runNode(slop, ['--unknown'], { cwd: directory });
  assert.equal(result.code, 2);
  assert.match(combined(result), /ERROR/);

  const authoredBelowBuild = path.join(directory, 'build', 'authored-repository');
  await fixture(authoredBelowBuild, 'index.html', '<!doctype html>\n<script src="app.js"></script>\n');
  await fixture(authoredBelowBuild, 'app.js', "document.querySelector('p').textContent = 'safe';\n");
  result = await runNode(slop, ['--root', '.'], { cwd: authoredBelowBuild });
  assert.equal(result.code, 0, combined(result));
  assert.match(result.stdout, /APPLICABLE-PASS/);
});
