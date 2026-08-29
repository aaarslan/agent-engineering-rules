#!/usr/bin/env node
// Prepares paired, blinded host-baseline versus standard live-evaluation plans.
// Provider dispatch is impossible unless every execution gate below succeeds.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE_AB_OPT_IN = 'I_UNDERSTAND_PROVIDER_CALLS';
const CONTRACT = 'live-ab-1';
const ZERO_HASH = '0'.repeat(64);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_ADAPTER_OUTPUT_BYTES = 1_048_576;
const MAX_FIXTURE_FILE_BYTES = 16 * 1_048_576;
const MAX_FIXTURE_BYTES = 100 * 1_048_576;
const MAX_FIXTURE_ENTRIES = 10_000;
const MAX_ARCHIVED_INPUT_BYTES = 512 * 1_048_576;
const MAX_ARCHIVED_INPUT_ENTRIES = 50_000;
const BASE_ENVIRONMENT = new Set([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL',
]);
const PROVIDER_CREDENTIALS = {
  anthropic: new Set(['ANTHROPIC_API_KEY']),
  openai: new Set(['CODEX_API_KEY', 'OPENAI_API_KEY']),
};
const CREDENTIAL_NAME = /(?:api[_-]?key|token|secret|password|credential|authorization)/i;

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const unique = (values) => values.length === new Set(values).size;
const sameSet = (left, right) => left.length === right.size && left.every((value) => right.has(value));
const closedKeys = (value, allowed, label, errors) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${label} contains unsupported property ${key}`);
};
const safeText = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const safePrompt = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 20_000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const positiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

function portableDirectory(value) {
  if (value === '.') return true;
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) return false;
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  return path.posix.normalize(value) === value && !value.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function credentialKeyErrors(value, label = 'configuration', errors = []) {
  if (!value || typeof value !== 'object') return errors;
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_NAME.test(key)) errors.push(`${label} must not contain credential-like property ${key}`);
    credentialKeyErrors(child, `${label}.${key}`, errors);
  }
  return errors;
}

export function liveAbConfigurationErrors(config) {
  const errors = [];
  closedKeys(config, ['schema_version', 'plan_id', 'seed', 'repository_revision', 'tasks', 'targets', 'repetitions'], 'live A/B configuration', errors);
  if (config?.schema_version !== 1) errors.push('live A/B configuration schema_version must equal 1');
  if (!ID.test(config?.plan_id ?? '')) errors.push('plan_id must be a lowercase alphanumeric-hyphen identifier');
  if (!safeText(config?.seed, 128)) errors.push('seed must be a non-empty bounded string without controls');
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(config?.repository_revision ?? '')) errors.push('repository_revision must be a full hexadecimal Git object ID');
  if (!Number.isInteger(config?.repetitions) || config.repetitions < 1 || config.repetitions > 100) errors.push('repetitions must be an integer from 1 through 100');

  if (!Array.isArray(config?.tasks) || !config.tasks.length) errors.push('tasks must be a non-empty array');
  else {
    for (const [index, task] of config.tasks.entries()) {
      closedKeys(task, ['id', 'prompt', 'working_directory', 'fixture_sha256'], `tasks[${index}]`, errors);
      if (!ID.test(task?.id ?? '')) errors.push(`tasks[${index}].id must be a lowercase alphanumeric-hyphen identifier`);
      if (!safePrompt(task?.prompt)) errors.push(`tasks[${index}].prompt must be non-empty, bounded, and contain no unsupported controls`);
      if (!portableDirectory(task?.working_directory)) errors.push(`tasks[${index}].working_directory must be a portable contained relative directory`);
      if (!HASH.test(task?.fixture_sha256 ?? '')) errors.push(`tasks[${index}].fixture_sha256 must be a lowercase SHA-256 hash`);
    }
    if (!unique(config.tasks.map((task) => task.id))) errors.push('task IDs must be unique');
  }

  if (!Array.isArray(config?.targets) || !config.targets.length) errors.push('targets must be a non-empty array');
  else {
    for (const [index, target] of config.targets.entries()) {
      closedKeys(target, ['id', 'host', 'host_version', 'provider', 'model', 'effort', 'standard_artifact_directory', 'standard_artifact_sha256'], `targets[${index}]`, errors);
      if (!ID.test(target?.id ?? '')) errors.push(`targets[${index}].id must be a lowercase alphanumeric-hyphen identifier`);
      if (!['claude', 'codex'].includes(target?.host)) errors.push(`targets[${index}].host must be claude or codex`);
      if (!safeText(target?.host_version, 128)) errors.push(`targets[${index}].host_version must be a bounded non-empty version string`);
      const expectedProvider = target?.host === 'claude' ? 'anthropic' : target?.host === 'codex' ? 'openai' : null;
      if (target?.provider !== expectedProvider) errors.push(`targets[${index}] provider must match its host`);
      if (!safeText(target?.model, 128)) errors.push(`targets[${index}].model must be a bounded non-empty string`);
      if (!safeText(target?.effort, 64)) errors.push(`targets[${index}].effort must be a bounded non-empty string`);
      if (!portableDirectory(target?.standard_artifact_directory)) errors.push(`targets[${index}].standard_artifact_directory must be a portable contained relative directory`);
      if (!HASH.test(target?.standard_artifact_sha256 ?? '')) errors.push(`targets[${index}].standard_artifact_sha256 must be a lowercase SHA-256 hash`);
    }
    if (!unique(config.targets.map((target) => target.id))) errors.push('target IDs must be unique');
  }
  errors.push(...credentialKeyErrors(config));
  const calls = (config?.tasks?.length ?? 0) * (config?.targets?.length ?? 0) * (config?.repetitions ?? 0) * 2;
  if (calls > 1_000) errors.push('live A/B plan may contain at most 1000 provider calls');
  return errors;
}

function assertValid(errors) {
  if (errors.length) throw new Error(errors.join('\n'));
}

function opaqueLabel(seed, pairId, treatment) {
  return `arm-${digest(`${seed}\0${pairId}\0${treatment}`).slice(0, 12)}`;
}

function pairIdentifier(taskId, targetId, repetition) {
  return `pair-${digest(jsonBytes([taskId, targetId, repetition]))}`;
}

export function createLiveAbPlan(config) {
  assertValid(liveAbConfigurationErrors(config));
  const pairs = [];
  for (const target of config.targets) {
    for (const task of config.tasks) {
      for (let repetition = 1; repetition <= config.repetitions; repetition += 1) {
        const pairId = pairIdentifier(task.id, target.id, repetition);
        const treatments = ['host-baseline', 'standard'];
        if (Number.parseInt(digest(`${config.seed}\0${pairId}`).slice(0, 2), 16) % 2) treatments.reverse();
        const runs = treatments.map((treatmentId, index) => ({
          run_id: `${pairId}-run-${index + 1}`,
          blind_label: opaqueLabel(config.seed, pairId, treatmentId),
          treatment_id: treatmentId,
        }));
        pairs.push({ pair_id: pairId, task_id: task.id, target_id: target.id, repetition, dispatch_order: runs });
      }
    }
  }
  if (!unique(pairs.map((pair) => pair.pair_id)) || !unique(pairs.flatMap((pair) => pair.dispatch_order.map((run) => run.run_id)))) {
    throw new Error('deterministic live A/B identifiers collided');
  }
  const plan = {
    schema_version: 1,
    contract_version: CONTRACT,
    plan_id: config.plan_id,
    seed: config.seed,
    repository_revision: config.repository_revision,
    treatment_contract: { control: 'host-baseline', treatment: 'standard', active_profile: 'standard' },
    tasks: structuredClone(config.tasks),
    targets: structuredClone(config.targets),
    repetitions: config.repetitions,
    provider_call_count: pairs.length * 2,
    pairs,
  };
  const gradingPlan = {
    schema_version: 1,
    contract_version: CONTRACT,
    plan_id: config.plan_id,
    blinded: true,
    pairs: pairs.map((pair) => ({
      pair_id: pair.pair_id,
      task_id: pair.task_id,
      target_id: pair.target_id,
      repetition: pair.repetition,
      runs: pair.dispatch_order.map(({ run_id, blind_label }) => ({ run_id, blind_label })),
    })),
  };
  return { plan, gradingPlan };
}

function configurationFromPlan(plan) {
  return {
    schema_version: plan.schema_version,
    plan_id: plan.plan_id,
    seed: plan.seed,
    repository_revision: plan.repository_revision,
    tasks: plan.tasks,
    targets: plan.targets,
    repetitions: plan.repetitions,
  };
}

function validatePlan(plan) {
  const regenerated = createLiveAbPlan(configurationFromPlan(plan)).plan;
  if (!Buffer.from(JSON.stringify(regenerated)).equals(Buffer.from(JSON.stringify(plan)))) {
    throw new Error('plan is not the deterministic paired and randomized live A/B plan for its declared inputs');
  }
}

async function regularFileBytes(file, label, maximum = MAX_ADAPTER_OUTPUT_BYTES) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`${label} must be one regular non-linked file`);
  if (info.size > maximum) throw new Error(`${label} exceeds ${maximum} bytes`);
  return readFile(file);
}

export async function prepareLiveAbArchive(config, archiveDirectory) {
  const { plan, gradingPlan } = createLiveAbPlan(config);
  await mkdir(archiveDirectory);
  const planContent = jsonBytes(plan);
  const gradingPlanContent = jsonBytes(gradingPlan);
  if (planContent.length > MAX_ADAPTER_OUTPUT_BYTES || gradingPlanContent.length > MAX_ADAPTER_OUTPUT_BYTES) {
    throw new Error(`prepared live A/B plan files may not exceed ${MAX_ADAPTER_OUTPUT_BYTES} bytes each`);
  }
  const planSha256 = digest(planContent);
  await writeFile(path.join(archiveDirectory, 'plan.json'), planContent, { flag: 'wx' });
  await writeFile(path.join(archiveDirectory, 'grading-plan.json'), gradingPlanContent, { flag: 'wx' });
  await writeFile(path.join(archiveDirectory, 'plan.sha256'), `${planSha256}  plan.json\n`, { flag: 'wx' });
  return { plan, gradingPlan, planSha256, adapterDispatches: 0, providerCalls: 0 };
}

function strictFutureInstant(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value && parsed > now;
}

export function liveAbAuthorizationErrors(authorization, plan, planSha256, adapterSha256, now = new Date()) {
  const errors = [];
  const keys = [
    'schema_version', 'authorized', 'plan_sha256', 'adapter_sha256', 'reference', 'expires_at',
    'allowed_providers', 'allowed_models', 'max_calls', 'spend_cap_usd', 'per_call_spend_cap_usd',
    'timeout_ms_per_call',
  ];
  closedKeys(authorization, keys, 'live A/B authorization', errors);
  for (const key of keys) if (!Object.hasOwn(authorization ?? {}, key)) errors.push(`live A/B authorization omits ${key}`);
  if (authorization?.schema_version !== 1 || authorization?.authorized !== true) errors.push('live A/B authorization must be schema version 1 and affirmatively authorized');
  if (authorization?.plan_sha256 !== planSha256) errors.push('authorization plan_sha256 does not match the exact plan bytes');
  if (authorization?.adapter_sha256 !== adapterSha256) errors.push('authorization adapter_sha256 does not match the exact adapter bytes');
  if (!safeText(authorization?.reference, 256) || authorization.reference.trim().length < 4) errors.push('authorization reference must be a durable non-empty reference');
  if (!strictFutureInstant(authorization?.expires_at, now)) errors.push('authorization expires_at must be a strict future UTC instant');
  for (const field of ['allowed_providers', 'allowed_models']) {
    const values = authorization?.[field];
    if (!Array.isArray(values) || !values.length || !unique(values) || values.some((value) => !safeText(value, 128))) errors.push(`${field} must be a non-empty unique bounded string array`);
  }
  const providers = new Set((plan?.targets ?? []).map((target) => target.provider));
  const models = new Set((plan?.targets ?? []).map((target) => target.model));
  if (Array.isArray(authorization?.allowed_providers) && !sameSet(authorization.allowed_providers, providers)) errors.push('allowed_providers must exactly equal the providers in the plan');
  if (Array.isArray(authorization?.allowed_models) && !sameSet(authorization.allowed_models, models)) errors.push('allowed_models must exactly equal the models in the plan');
  if (!Number.isInteger(authorization?.max_calls) || authorization.max_calls < plan?.provider_call_count || authorization.max_calls > 1_000) errors.push('max_calls must cover the exact plan and may not exceed 1000');
  if (!positiveNumber(authorization?.spend_cap_usd) || authorization.spend_cap_usd > 10_000) errors.push('spend_cap_usd must be positive and no greater than 10000');
  if (!positiveNumber(authorization?.per_call_spend_cap_usd) || authorization.per_call_spend_cap_usd > authorization.spend_cap_usd || authorization.per_call_spend_cap_usd > 1_000) errors.push('per_call_spend_cap_usd must be positive, no greater than the total cap, and no greater than 1000');
  if (!Number.isInteger(authorization?.timeout_ms_per_call) || authorization.timeout_ms_per_call < 100 || authorization.timeout_ms_per_call > 60_000) errors.push('timeout_ms_per_call must be an integer from 100 through 60000');
  return errors;
}

function adapterEnvironment(provider, source, isolatedHome, isolatedTemporaryDirectory) {
  const allowedCredentials = PROVIDER_CREDENTIALS[provider] ?? new Set();
  return {
    ...Object.fromEntries(Object.entries(source).filter(([name]) => BASE_ENVIRONMENT.has(name) || allowedCredentials.has(name))),
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    APPDATA: path.join(isolatedHome, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(isolatedHome, 'AppData', 'Local'),
    TEMP: isolatedTemporaryDirectory,
    TMP: isolatedTemporaryDirectory,
    TMPDIR: isolatedTemporaryDirectory,
  };
}

function credentialValues(environment) {
  return Object.entries(environment)
    .filter(([name, value]) => CREDENTIAL_NAME.test(name) && typeof value === 'string' && value.length > 0)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

async function invokeAdapter(adapterPath, request, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--', adapterPath], {
      cwd: options.workingDirectory,
      env: options.environment,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), overflow = false, timedOut = false, forceTimer;
    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > MAX_ADAPTER_OUTPUT_BYTES) { overflow = true; child.kill(); }
      return next.subarray(0, MAX_ADAPTER_OUTPUT_BYTES);
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('error', reject);
    child.stdin.on('error', reject);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      forceTimer = setTimeout(() => { child.kill('SIGKILL'); }, 1_000);
    }, options.timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      const stdoutText = stdout.toString('utf8'), stderrText = stderr.toString('utf8');
      if (options.credentialValues.some((secret) => stdoutText.includes(secret) || stderrText.includes(secret))) {
        reject(new Error('adapter emitted credential material; its output was not archived'));
      } else if (overflow) reject(new Error(`adapter output exceeded ${MAX_ADAPTER_OUTPUT_BYTES} bytes`));
      else if (timedOut) reject(new Error(`adapter exceeded its ${options.timeoutMs} millisecond timeout`));
      else if (signal) reject(new Error(`adapter was terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`adapter exited ${code}: ${stderrText.trim() || 'no diagnostic'}`));
      else {
        try { resolve(JSON.parse(stdoutText)); }
        catch { reject(new Error('adapter stdout must be exactly one JSON value')); }
      }
    });
    child.stdin.end(jsonBytes(request));
  });
}

function fixtureEntryOrder(left, right) {
  return Buffer.from(left.name).compare(Buffer.from(right.name));
}

async function inspectFixtureTree(root, copyRoot = null, forbiddenValues = []) {
  const state = { entries: 0, bytes: 0 };
  const hash = createHash('sha256').update('aer-live-ab-fixture-v1\0');
  const visit = async (directory, relativeDirectory) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(fixtureEntryOrder);
    for (const entry of entries) {
      state.entries += 1;
      if (state.entries > MAX_FIXTURE_ENTRIES) throw new Error(`fixture exceeds ${MAX_FIXTURE_ENTRIES} entries`);
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const source = path.join(directory, entry.name);
      const info = await lstat(source);
      if (info.isSymbolicLink()) throw new Error(`fixture contains a symbolic link: ${relative}`);
      if (info.isDirectory()) {
        hash.update(`directory\0${relative}\0`);
        if (copyRoot) await mkdir(path.join(copyRoot, ...relative.split('/')));
        await visit(source, relative);
      } else if (info.isFile() && info.nlink === 1) {
        if (info.size > MAX_FIXTURE_FILE_BYTES) throw new Error(`fixture file exceeds ${MAX_FIXTURE_FILE_BYTES} bytes: ${relative}`);
        state.bytes += info.size;
        if (state.bytes > MAX_FIXTURE_BYTES) throw new Error(`fixture exceeds ${MAX_FIXTURE_BYTES} total bytes`);
        const bytes = await readFile(source);
        if (bytes.length !== info.size) throw new Error(`fixture changed while being read: ${relative}`);
        if (forbiddenValues.some((value) => bytes.includes(Buffer.from(value)))) throw new Error(`input tree contains credential material and was not archived: ${relative}`);
        hash.update(`file\0${relative}\0${bytes.length}\0`).update(bytes).update('\0');
        if (copyRoot) await writeFile(path.join(copyRoot, ...relative.split('/')), bytes, { flag: 'wx', mode: 0o600 });
      } else throw new Error(`fixture contains an unsupported or multiply-linked entry: ${relative}`);
    }
  };
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('fixture root must be a real directory');
  await visit(root, '');
  return { sha256: hash.digest('hex'), entries: state.entries, bytes: state.bytes };
}

async function snapshotInputTree(source, destination, expectedSha256, forbiddenValues, label) {
  await mkdir(destination);
  const copied = await inspectFixtureTree(source, destination, forbiddenValues);
  const verified = await inspectFixtureTree(destination);
  if (copied.sha256 !== verified.sha256 || verified.sha256 !== expectedSha256) throw new Error(`${label} snapshot does not match its declared SHA-256`);
  return verified;
}

export async function hashLiveAbFixture(root) {
  return (await inspectFixtureTree(await realpath(root))).sha256;
}

async function materializeIsolatedRun(sourceDirectory, standardArtifactSource = null) {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'aer-live-ab-run-'));
  try {
    const workspace = path.join(sandbox, 'workspace');
    const home = path.join(sandbox, 'home');
    const temporaryDirectory = path.join(sandbox, 'tmp');
    await mkdir(workspace);
    await mkdir(home);
    await mkdir(path.join(home, 'AppData', 'Roaming'), { recursive: true });
    await mkdir(path.join(home, 'AppData', 'Local'), { recursive: true });
    await mkdir(temporaryDirectory);
    const copied = await inspectFixtureTree(sourceDirectory, workspace);
    const verified = await inspectFixtureTree(workspace);
    if (copied.sha256 !== verified.sha256) throw new Error('isolated fixture copy did not preserve the exact source tree');
    let standardArtifact = null;
    if (standardArtifactSource) {
      const destination = path.join(sandbox, 'standard-artifact');
      await mkdir(destination);
      const artifactCopied = await inspectFixtureTree(standardArtifactSource, destination);
      standardArtifact = await inspectFixtureTree(destination);
      if (artifactCopied.sha256 !== standardArtifact.sha256) throw new Error('isolated standard artifact copy did not preserve the archived tree');
    }
    return { sandbox, workspace, home, temporaryDirectory, fixture: verified, standardArtifact };
  } catch (error) {
    await rm(sandbox, { recursive: true, force: true });
    throw error;
  }
}

function graderResultErrors(result) {
  const errors = [];
  closedKeys(result, ['output', 'artifacts'], 'adapter response result', errors);
  if (typeof result?.output !== 'string' || !result.output.trim() || result.output.length > 500_000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(result.output)) errors.push('adapter response result.output must be non-empty, bounded text without unsupported controls');
  if (!Array.isArray(result?.artifacts) || result.artifacts.length > 100) errors.push('adapter response result.artifacts must be an array of at most 100 hash records');
  else for (const [index, artifact] of result.artifacts.entries()) {
    closedKeys(artifact, ['name', 'sha256'], `adapter response result.artifacts[${index}]`, errors);
    if (!safeText(artifact?.name, 256)) errors.push(`adapter response result.artifacts[${index}].name must be bounded text`);
    if (!HASH.test(artifact?.sha256 ?? '')) errors.push(`adapter response result.artifacts[${index}].sha256 must be a lowercase SHA-256 hash`);
  }
  return errors;
}

function adapterResponseErrors(response, request) {
  const errors = [];
  closedKeys(response, ['schema_version', 'run_id', 'status', 'observed_host_version', 'input_fixture_sha256', 'applied_treatment_sha256', 'provider_calls', 'cost_usd', 'result'], 'adapter response', errors);
  for (const key of ['schema_version', 'run_id', 'status', 'observed_host_version', 'input_fixture_sha256', 'applied_treatment_sha256', 'provider_calls', 'cost_usd', 'result']) {
    if (!Object.hasOwn(response ?? {}, key)) errors.push(`adapter response omits ${key}`);
  }
  if (response?.schema_version !== 1 || response?.run_id !== request.run_id) errors.push('adapter response identity does not match its request');
  if (!['passed', 'failed', 'inconclusive'].includes(response?.status)) errors.push('adapter response status is invalid');
  if (response?.observed_host_version !== request.host_version) errors.push('adapter did not report the exact declared host version');
  if (response?.input_fixture_sha256 !== request.fixture_sha256) errors.push('adapter did not report the exact paired input fixture');
  const expectedTreatment = request.treatment_id === 'standard' ? request.standard_artifact_sha256 : ZERO_HASH;
  if (response?.applied_treatment_sha256 !== expectedTreatment) errors.push('adapter did not report the exact requested treatment artifact');
  if (!Number.isInteger(response?.provider_calls) || response.provider_calls < 0 || response.provider_calls > 1) errors.push('adapter response provider_calls must be 0 or 1');
  if (typeof response?.cost_usd !== 'number' || !Number.isFinite(response.cost_usd) || response.cost_usd < 0) errors.push('adapter response cost_usd must be a non-negative finite number');
  if (response?.provider_calls === 0 && response?.cost_usd !== 0) errors.push('a provider-free adapter response must report zero provider cost');
  try { JSON.stringify(response?.result); } catch { errors.push('adapter response result must be JSON-serializable'); }
  errors.push(...graderResultErrors(response?.result));
  errors.push(...credentialKeyErrors(response?.result, 'adapter response result'));
  return errors;
}

async function containedWorkingDirectory(root, relative) {
  const rootReal = await realpath(root);
  const candidateReal = await realpath(path.resolve(rootReal, relative));
  const relation = path.relative(rootReal, candidateReal);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error(`working directory escapes the evaluation workspace: ${relative}`);
  const info = await lstat(candidateReal);
  if (!info.isDirectory()) throw new Error(`working directory is not a directory: ${relative}`);
  return candidateReal;
}

export async function executeLiveAbPlan({
  planPath,
  authorizationPath,
  adapterPath,
  workspaceRoot,
  artifactsRoot,
  execute = false,
  environment = process.env,
  now = new Date(),
  clock = () => new Date(),
}) {
  const planContent = await regularFileBytes(planPath, 'live A/B plan');
  const plan = JSON.parse(planContent.toString('utf8'));
  validatePlan(plan);
  const planSha256 = digest(planContent);
  if (!execute) return { planSha256, plannedCalls: plan.provider_call_count, adapterDispatches: 0, providerCalls: 0, executed: false };
  if (environment.AER_LIVE_EVAL_EXECUTE !== LIVE_AB_OPT_IN) throw new Error(`execution requires AER_LIVE_EVAL_EXECUTE=${LIVE_AB_OPT_IN}`);
  if (!authorizationPath || !adapterPath || !workspaceRoot || !artifactsRoot) throw new Error('--execute requires authorization, adapter, workspace, and artifacts paths');

  const adapterContent = await regularFileBytes(adapterPath, 'live A/B adapter');
  const adapterSha256 = digest(adapterContent);
  const authorizationContent = await regularFileBytes(authorizationPath, 'live A/B authorization');
  const authorization = JSON.parse(authorizationContent.toString('utf8'));
  assertValid(liveAbAuthorizationErrors(authorization, plan, planSha256, adapterSha256, now));

  const archiveDirectory = path.dirname(planPath);
  const runsDirectory = path.join(archiveDirectory, 'runs');
  const evidenceDirectory = path.join(archiveDirectory, 'run-evidence');
  const requestsDirectory = path.join(archiveDirectory, 'run-requests');
  const inputsDirectory = path.join(archiveDirectory, 'inputs');
  const fixtureInputsDirectory = path.join(inputsDirectory, 'fixtures');
  const artifactInputsDirectory = path.join(inputsDirectory, 'standard-artifacts');
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
  const targets = new Map(plan.targets.map((target) => [target.id, target]));
  const forbiddenInputValues = credentialValues(environment);
  const taskSources = new Map(), artifactSources = new Map();
  let archivedInputBytes = 0, archivedInputEntries = 0;
  for (const task of plan.tasks) {
    const source = await containedWorkingDirectory(workspaceRoot, task.working_directory);
    const fixture = await inspectFixtureTree(source, null, forbiddenInputValues);
    if (fixture.sha256 !== task.fixture_sha256) throw new Error(`fixture hash does not match the plan for task ${task.id}`);
    taskSources.set(task.id, source);
    archivedInputBytes += fixture.bytes;
    archivedInputEntries += fixture.entries;
  }
  for (const target of plan.targets) {
    const source = await containedWorkingDirectory(artifactsRoot, target.standard_artifact_directory);
    const artifact = await inspectFixtureTree(source, null, forbiddenInputValues);
    if (artifact.sha256 !== target.standard_artifact_sha256) throw new Error(`standard artifact hash does not match the plan for target ${target.id}`);
    artifactSources.set(target.id, source);
    archivedInputBytes += artifact.bytes;
    archivedInputEntries += artifact.entries;
  }
  if (archivedInputBytes > MAX_ARCHIVED_INPUT_BYTES || archivedInputEntries > MAX_ARCHIVED_INPUT_ENTRIES) throw new Error('combined archived inputs exceed the live A/B byte or entry cap');
  await mkdir(inputsDirectory);
  await mkdir(fixtureInputsDirectory);
  await mkdir(artifactInputsDirectory);
  const taskSnapshots = new Map(), artifactSnapshots = new Map(), inputRecords = [];
  for (const task of plan.tasks) {
    const destination = path.join(fixtureInputsDirectory, task.id);
    const snapshot = await snapshotInputTree(taskSources.get(task.id), destination, task.fixture_sha256, forbiddenInputValues, `fixture ${task.id}`);
    taskSnapshots.set(task.id, destination);
    inputRecords.push({ kind: 'fixture', id: task.id, archive_path: `inputs/fixtures/${task.id}`, ...snapshot });
  }
  for (const target of plan.targets) {
    const destination = path.join(artifactInputsDirectory, target.id);
    const snapshot = await snapshotInputTree(artifactSources.get(target.id), destination, target.standard_artifact_sha256, forbiddenInputValues, `standard artifact ${target.id}`);
    artifactSnapshots.set(target.id, destination);
    inputRecords.push({ kind: 'standard-artifact', id: target.id, archive_path: `inputs/standard-artifacts/${target.id}`, ...snapshot });
  }
  await writeFile(path.join(archiveDirectory, 'input-snapshots.json'), jsonBytes({
    schema_version: 1,
    repository_revision: plan.repository_revision,
    total_bytes: archivedInputBytes,
    total_entries: archivedInputEntries,
    inputs: inputRecords,
  }), { flag: 'wx' });
  await mkdir(runsDirectory);
  await mkdir(evidenceDirectory);
  await mkdir(requestsDirectory);
  await writeFile(path.join(archiveDirectory, 'authorization-evidence.json'), jsonBytes({
    schema_version: 1,
    plan_sha256: planSha256,
    adapter_sha256: adapterSha256,
    authorization_sha256: digest(authorizationContent),
    reference: authorization.reference,
    expires_at: authorization.expires_at,
    allowed_providers: authorization.allowed_providers,
    allowed_models: authorization.allowed_models,
    max_calls: authorization.max_calls,
    spend_cap_usd: authorization.spend_cap_usd,
    per_call_spend_cap_usd: authorization.per_call_spend_cap_usd,
  }), { flag: 'wx' });

  const adapterStagingDirectory = await mkdtemp(path.join(tmpdir(), 'aer-live-ab-adapter-'));
  const stagedAdapterPath = path.join(adapterStagingDirectory, 'authorized-adapter.mjs');
  let adapterDispatches = 0, providerCalls = 0, costUsd = 0;
  const results = [];
  try {
    await writeFile(stagedAdapterPath, adapterContent, { flag: 'wx', mode: 0o600 });
    for (const pair of plan.pairs) {
      const task = tasks.get(pair.task_id), target = targets.get(pair.target_id);
      for (const run of pair.dispatch_order) {
        const remainingSpend = authorization.spend_cap_usd - costUsd;
        if (!(remainingSpend > 0)) throw new Error('authorized spend cap is exhausted before the plan is complete');
        const request = {
          schema_version: 1,
          contract_version: CONTRACT,
          plan_id: plan.plan_id,
          pair_id: pair.pair_id,
          run_id: run.run_id,
          blind_label: run.blind_label,
          treatment_id: run.treatment_id,
          repository_revision: plan.repository_revision,
          task_id: task.id,
          prompt: task.prompt,
          working_directory: '.',
          declared_working_directory: task.working_directory,
          fixture_sha256: task.fixture_sha256,
          host: target.host,
          host_version: target.host_version,
          provider: target.provider,
          model: target.model,
          effort: target.effort,
          ...(run.treatment_id === 'standard' ? { active_profile: 'standard' } : {}),
          ...(run.treatment_id === 'standard' ? { standard_artifact_directory: '../standard-artifact' } : {}),
          standard_artifact_sha256: target.standard_artifact_sha256,
          call_spend_cap_usd: Math.min(authorization.per_call_spend_cap_usd, remainingSpend),
        };
        if (adapterDispatches >= authorization.max_calls) throw new Error('authorized call cap is exhausted before the plan is complete');
        if (!strictFutureInstant(authorization.expires_at, clock())) throw new Error('live A/B authorization expired before the next adapter dispatch');
        const currentAdapter = await regularFileBytes(stagedAdapterPath, 'staged live A/B adapter');
        if (digest(currentAdapter) !== adapterSha256) throw new Error('staged live A/B adapter changed after authorization preflight');
        const isolated = await materializeIsolatedRun(
          taskSnapshots.get(task.id),
          run.treatment_id === 'standard' ? artifactSnapshots.get(target.id) : null,
        );
        try {
          if (isolated.fixture.sha256 !== task.fixture_sha256) throw new Error(`isolated fixture hash does not match the plan for ${run.run_id}`);
          if (run.treatment_id === 'standard' && isolated.standardArtifact?.sha256 !== target.standard_artifact_sha256) throw new Error(`isolated standard artifact hash does not match the plan for ${run.run_id}`);
          await writeFile(path.join(requestsDirectory, `${run.run_id}.json`), jsonBytes(request), { flag: 'wx' });
          adapterDispatches += 1;
          const runEnvironment = adapterEnvironment(target.provider, environment, isolated.home, isolated.temporaryDirectory);
          const response = await invokeAdapter(stagedAdapterPath, request, {
            workingDirectory: isolated.workspace,
            environment: runEnvironment,
            credentialValues: credentialValues(runEnvironment),
            timeoutMs: authorization.timeout_ms_per_call,
          });
          assertValid(adapterResponseErrors(response, request));
          if (providerCalls + response.provider_calls > authorization.max_calls) throw new Error('adapter reported provider calls beyond the authorized call cap');
          if (response.cost_usd > request.call_spend_cap_usd + Number.EPSILON) throw new Error(`${run.run_id} exceeded its authorized per-call spend cap`);
          providerCalls += response.provider_calls;
          costUsd += response.cost_usd;
          if (costUsd > authorization.spend_cap_usd + Number.EPSILON) throw new Error('live A/B execution exceeded its total authorized spend cap');
          const blindedResult = {
            schema_version: 1,
            pair_id: pair.pair_id,
            run_id: run.run_id,
            blind_label: run.blind_label,
            status: response.status,
            result: response.result,
          };
          const runEvidence = {
            schema_version: 1,
            pair_id: pair.pair_id,
            run_id: run.run_id,
            observed_host_version: response.observed_host_version,
            input_fixture_sha256: response.input_fixture_sha256,
            applied_treatment_sha256: response.applied_treatment_sha256,
            provider_calls: response.provider_calls,
            cost_usd: response.cost_usd,
          };
          await writeFile(path.join(runsDirectory, `${run.run_id}.json`), jsonBytes(blindedResult), { flag: 'wx' });
          await writeFile(path.join(evidenceDirectory, `${run.run_id}.json`), jsonBytes(runEvidence), { flag: 'wx' });
          results.push(blindedResult);
        } finally {
          await rm(isolated.sandbox, { recursive: true, force: true });
        }
      }
    }
  } finally {
    await rm(adapterStagingDirectory, { recursive: true, force: true });
  }
  const summary = {
    schema_version: 1,
    plan_id: plan.plan_id,
    plan_sha256: planSha256,
    authorization_reference: authorization.reference,
    adapter_dispatches: adapterDispatches,
    provider_calls: providerCalls,
    cost_usd: costUsd,
    completed_at: clock().toISOString(),
    results: results.map(({ run_id, status }) => ({ run_id, status })),
  };
  await writeFile(path.join(archiveDirectory, 'execution-summary.json'), jsonBytes(summary), { flag: 'wx' });
  return { ...summary, executed: true };
}

function parseArguments(argv) {
  const options = {};
  const values = new Set(['--prepare', '--archive', '--plan', '--authorization', '--adapter', '--workspace', '--artifacts', '--hash-fixture']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') {
      if (options.execute) throw new Error('--execute may be specified only once');
      options.execute = true;
      continue;
    }
    if (!values.has(argument)) throw new Error(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    if (options[argument] !== undefined) throw new Error(`${argument} may be specified only once`);
    options[argument] = value;
    index += 1;
  }
  return options;
}

const usage = `Usage:
  node tools/live-ab-eval.mjs --hash-fixture <directory>
  node tools/live-ab-eval.mjs --prepare <config.json> --archive <new-directory>
  node tools/live-ab-eval.mjs --plan <archive/plan.json>
  node tools/live-ab-eval.mjs --plan <archive/plan.json> --authorization <authorization.json> --adapter <adapter.mjs> --workspace <fixtures> --artifacts <artifacts> --execute`;

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args['--hash-fixture']) {
      if (Object.keys(args).length !== 1) throw new Error(usage);
      console.log(await hashLiveAbFixture(args['--hash-fixture']));
    } else if (args['--prepare']) {
      if (!args['--archive'] || args['--plan'] || args.execute) throw new Error(usage);
      const config = JSON.parse((await regularFileBytes(args['--prepare'], 'live A/B configuration')).toString('utf8'));
      const result = await prepareLiveAbArchive(config, args['--archive']);
      console.log(`PREPARED ${result.planSha256} (${result.plan.provider_call_count} planned calls; provider calls 0)`);
    } else if (args['--plan']) {
      if (args['--prepare'] || args['--archive']) throw new Error(usage);
      if (!args.execute && (args['--authorization'] || args['--adapter'] || args['--workspace'] || args['--artifacts'])) throw new Error('authorization, adapter, workspace, and artifacts are accepted only with --execute');
      const result = await executeLiveAbPlan({
        planPath: args['--plan'],
        authorizationPath: args['--authorization'],
        adapterPath: args['--adapter'],
        workspaceRoot: args['--workspace'],
        artifactsRoot: args['--artifacts'],
        execute: Boolean(args.execute),
      });
      console.log(result.executed
        ? `EXECUTED ${result.adapter_dispatches} adapter dispatches/${result.provider_calls} provider calls within $${result.cost_usd}`
        : `PREFLIGHT ${result.planSha256} (${result.plannedCalls} planned calls; provider calls 0)`);
    } else throw new Error(usage);
  } catch (error) {
    console.error(`LIVE A/B FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
