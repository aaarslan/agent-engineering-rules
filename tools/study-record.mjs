#!/usr/bin/env node
// Repository-only record validation. No task execution, provider dispatch, grading, or aggregation.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function object(value, keys, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  requireValue(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), `${label}: unexpected or missing fields; expected ${keys.join(', ')}`);
}
function text(value, label) { requireValue(typeof value === 'string' && value.trim().length > 0 && !value.includes('REPLACE_'), `${label}: supply a nonempty reviewed value`); }
function integer(value, label, minimum = 0) { requireValue(Number.isSafeInteger(value) && value >= minimum, `${label}: expected integer >= ${minimum}`); }
function number(value, label) { requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${label}: expected non-negative finite number`); }
function timestamp(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value, `${label}: expected canonical UTC timestamp`);
}
function sha(value, label) { requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${label}: expected SHA-256`); }
function list(value, label) { requireValue(Array.isArray(value) && value.length > 0, `${label}: expected nonempty list`); }
function unique(items, label) { requireValue(new Set(items).size === items.length, `${label}: duplicate identities`); }

export function localPath(value) {
  text(value, 'artifact path');
  requireValue(value === value.normalize('NFC') && !/[\\:%?#<>"|*]/.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value), 'artifact path: use a normalized portable relative path');
  requireValue(value.split('/').every((part) => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)), 'artifact path: absolute, empty, traversal, or reserved segment');
  return value;
}

async function regularFile(root, relative) {
  const parts = localPath(relative).split('/');
  let current = path.resolve(root);
  requireValue(!(await lstat(current)).isSymbolicLink(), 'artifact root: symbolic link refused');
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const stat = await lstat(current);
    requireValue(!stat.isSymbolicLink(), `symbolic link refused: ${relative}`);
    requireValue(index === parts.length - 1 ? stat.isFile() : stat.isDirectory(), `not a regular artifact path: ${relative}`);
  }
  return current;
}

async function fileHash(root, relative) {
  const filename = await regularFile(root, relative);
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(filename)) digest.update(bytes);
  return digest.digest('hex');
}

async function artifact(value, root, label) {
  object(value, ['path', 'sha256'], label);
  localPath(value.path); sha(value.sha256, label);
  requireValue(await fileHash(root, value.path) === value.sha256, `${label}: artifact digest mismatch`);
}

export async function validateProtocol(protocol, root) {
  object(protocol, ['schemaVersion', 'studyId', 'question', 'review', 'authorization', 'configuration', 'analysis', 'tasks', 'treatments', 'pairs'], 'protocol');
  requireValue(protocol.schemaVersion === 'aer-study/1', 'unsupported protocol schema');
  text(protocol.studyId, 'studyId'); text(protocol.question, 'question');
  object(protocol.review, ['reviewer', 'reviewedAt', 'reference'], 'review');
  text(protocol.review.reviewer, 'reviewer'); timestamp(protocol.review.reviewedAt, 'reviewedAt'); text(protocol.review.reference, 'review reference');
  object(protocol.authorization, ['reference', 'provider', 'model', 'currency', 'spendCeiling'], 'authorization');
  for (const field of ['reference', 'provider', 'model', 'currency']) text(protocol.authorization[field], `authorization.${field}`);
  number(protocol.authorization.spendCeiling, 'spendCeiling');
  object(protocol.configuration, ['provider', 'model', 'modelRevision', 'effort', 'hostVersion', 'toolVersions', 'repositoryRevision', 'maxTokens', 'timeoutSeconds', 'maxAttempts', 'budgetEnforcement', 'overshootPolicy'], 'configuration');
  for (const field of ['provider', 'model', 'modelRevision', 'effort', 'hostVersion', 'toolVersions', 'repositoryRevision', 'budgetEnforcement', 'overshootPolicy']) text(protocol.configuration[field], `configuration.${field}`);
  for (const field of ['maxTokens', 'timeoutSeconds', 'maxAttempts']) integer(protocol.configuration[field], field, 1);
  requireValue(protocol.configuration.provider === protocol.authorization.provider && protocol.configuration.model === protocol.authorization.model, 'configuration differs from authorized provider/model');
  object(protocol.analysis, ['method', 'uncertainty', 'stoppingRules', 'exclusions', 'randomization', 'fairnessAudit', 'isolation', 'humanRework'], 'analysis');
  for (const [field, value] of Object.entries(protocol.analysis)) text(value, `analysis.${field}`);
  list(protocol.tasks, 'tasks'); list(protocol.treatments, 'treatments'); list(protocol.pairs, 'pairs');
  for (const task of protocol.tasks) {
    object(task, ['id', 'version', 'prompt', 'contract', 'rubric', 'editableFiles'], 'task');
    text(task.id, 'task.id'); text(task.version, 'task.version'); list(task.editableFiles, 'editableFiles');
    task.editableFiles.forEach(localPath); unique(task.editableFiles, 'editableFiles');
    for (const field of ['prompt', 'contract', 'rubric']) await artifact(task[field], root, `task.${field}`);
  }
  for (const treatment of protocol.treatments) {
    object(treatment, ['id', 'role', 'revision', 'instructions'], 'treatment');
    text(treatment.id, 'treatment.id'); text(treatment.revision, 'treatment.revision');
    requireValue(['baseline', 'treatment'].includes(treatment.role), 'invalid treatment role');
    await artifact(treatment.instructions, root, 'expanded instructions');
  }
  unique(protocol.tasks.map((item) => item.id), 'tasks'); unique(protocol.treatments.map((item) => item.id), 'treatments'); unique(protocol.pairs.map((item) => item.id), 'pairs');
  requireValue(protocol.treatments.length === 2 && protocol.treatments.filter((item) => item.role === 'baseline').length === 1, 'v1 format supports exactly one baseline and one treatment; other designs need a new format');
  for (const pair of protocol.pairs) {
    object(pair, ['id', 'taskId', 'order'], 'pair'); text(pair.id, 'pair.id');
    requireValue(protocol.tasks.some((task) => task.id === pair.taskId), 'unknown pair task');
    requireValue(Array.isArray(pair.order) && pair.order.length === 2 && new Set(pair.order).size === 2 && pair.order.every((id) => protocol.treatments.some((item) => item.id === id)), 'pair order must contain both frozen treatments');
  }
  requireValue(protocol.tasks.every((task) => protocol.pairs.some((pair) => pair.taskId === task.id)), 'every task needs a planned pair');
  return protocol;
}

export async function freezeProtocol(protocolFile, lockFile, frozenAt = new Date().toISOString()) {
  const bytes = await readFile(protocolFile);
  const protocol = await validateProtocol(JSON.parse(bytes), path.dirname(path.resolve(protocolFile)));
  timestamp(frozenAt, 'frozenAt');
  requireValue(frozenAt >= protocol.review.reviewedAt, 'freeze predates review');
  const lock = { schemaVersion: 'aer-study-lock/1', studyId: protocol.studyId, frozenAt, protocolSha256: hash(bytes) };
  await writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`, { flag: 'wx' });
  return lock;
}

export async function validateStudy(protocolFile, lockFile, reportFile = null) {
  const root = path.dirname(path.resolve(protocolFile));
  const bytes = await readFile(protocolFile);
  const protocol = await validateProtocol(JSON.parse(bytes), root);
  const lock = JSON.parse(await readFile(lockFile, 'utf8'));
  object(lock, ['schemaVersion', 'studyId', 'frozenAt', 'protocolSha256'], 'lock');
  timestamp(lock.frozenAt, 'frozenAt'); sha(lock.protocolSha256, 'protocolSha256');
  requireValue(lock.schemaVersion === 'aer-study-lock/1' && lock.studyId === protocol.studyId && lock.protocolSha256 === hash(bytes) && lock.frozenAt >= protocol.review.reviewedAt, 'protocol lock mismatch');
  if (!reportFile) return { valid: true, scope: 'frozen protocol and selected artifact integrity only', studyId: protocol.studyId };
  const report = JSON.parse(await readFile(reportFile, 'utf8'));
  object(report, ['schemaVersion', 'studyId', 'protocolSha256', 'status', 'attempts'], 'report');
  requireValue(report.schemaVersion === 'aer-study-records/1' && report.studyId === protocol.studyId && report.protocolSha256 === lock.protocolSha256, 'report protocol identity mismatch');
  requireValue(['partial', 'complete'].includes(report.status), 'invalid report status');
  requireValue(Array.isArray(report.attempts), 'attempts must be an array');
  unique(report.attempts.map((run) => run.id), 'run IDs');
  const cells = new Map();
  const incompleteEvidence = [], budgetExceptions = [], configurationExceptions = [];
  const expectedConfiguration = hash(JSON.stringify(protocol.configuration));
  for (const run of report.attempts) {
    object(run, ['id', 'pairId', 'treatmentId', 'attempt', 'configurationSha256', 'configurationNote', 'status', 'startedAt', 'endedAt', 'terminationReason', 'usage', 'scoring', 'artifacts'], 'run');
    text(run.id, 'run.id'); text(run.terminationReason, 'terminationReason');
    const pair = protocol.pairs.find((item) => item.id === run.pairId);
    requireValue(pair?.order.includes(run.treatmentId), 'unknown pair/treatment');
    integer(run.attempt, 'attempt', 1);
    requireValue(run.attempt <= protocol.configuration.maxAttempts, 'attempt exceeds predeclared retry ceiling');
    requireValue(['completed', 'failed', 'timeout', 'infra-error', 'skipped'].includes(run.status), 'invalid execution status');
    if (run.configurationSha256 !== null) sha(run.configurationSha256, 'observed configuration digest');
    if (run.configurationSha256 !== expectedConfiguration) { text(run.configurationNote, 'configuration mismatch/unavailable reason'); configurationExceptions.push(run.id); }
    else requireValue(run.configurationNote === null, 'matching configuration must have null exception note');
    if (run.status === 'skipped') requireValue(run.startedAt === null && run.endedAt === null, 'skipped attempt must not claim execution times');
    else {
      timestamp(run.startedAt, 'startedAt'); timestamp(run.endedAt, 'endedAt');
      requireValue(run.startedAt >= lock.frozenAt && run.endedAt >= run.startedAt, 'invalid execution time or run predates freeze');
      if ((Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 1000 > protocol.configuration.timeoutSeconds) budgetExceptions.push(run.id);
    }
    object(run.usage, ['inputTokens', 'outputTokens', 'cost', 'currency', 'unavailableReason'], 'usage');
    for (const field of ['inputTokens', 'outputTokens']) if (run.usage[field] !== null) integer(run.usage[field], field);
    if (run.usage.cost !== null) number(run.usage.cost, 'cost');
    requireValue(run.usage.currency === protocol.authorization.currency, 'currency differs from frozen protocol');
    if ([run.usage.inputTokens, run.usage.outputTokens, run.usage.cost].includes(null)) text(run.usage.unavailableReason, 'unavailable usage reason');
    else requireValue(run.usage.unavailableReason === null, 'measured usage must have null unavailableReason');
    if (run.status === 'skipped') requireValue([run.usage.inputTokens, run.usage.outputTokens, run.usage.cost].every((value) => value === null || value === 0), 'skipped cells cannot claim consumed usage');
    if (run.usage.inputTokens !== null && run.usage.outputTokens !== null && run.usage.inputTokens + run.usage.outputTokens > protocol.configuration.maxTokens) budgetExceptions.push(run.id);
    object(run.scoring, ['status', 'reviewer', 'strictScore', 'engineeringQuality', 'humanReworkMinutes', 'disagreement'], 'scoring');
    requireValue(['scored', 'unavailable', 'inconclusive'].includes(run.scoring.status), 'invalid scoring status');
    text(run.scoring.reviewer, 'scoring reviewer'); text(run.scoring.engineeringQuality, 'engineeringQuality');
    if (run.scoring.humanReworkMinutes !== null) number(run.scoring.humanReworkMinutes, 'humanReworkMinutes');
    if (run.scoring.disagreement !== null) text(run.scoring.disagreement, 'disagreement');
    if (run.scoring.status === 'scored') {
      object(run.scoring.strictScore, ['earned', 'possible'], 'strictScore');
      number(run.scoring.strictScore.earned, 'earned'); number(run.scoring.strictScore.possible, 'possible');
      requireValue(run.scoring.strictScore.possible > 0 && run.scoring.strictScore.earned <= run.scoring.strictScore.possible, 'invalid score range');
    } else requireValue(run.scoring.strictScore === null, 'unavailable/inconclusive score must be null');
    requireValue(run.status !== 'skipped' || run.scoring.status !== 'scored', 'skipped execution cannot claim a score');
    list(run.artifacts, 'run artifacts'); unique(run.artifacts.map((item) => item.kind), 'artifact kinds');
    for (const item of run.artifacts) {
      object(item, ['kind', 'status', 'path', 'sha256', 'reason'], 'run artifact');
      requireValue(['transcript', 'diff', 'checks', 'output', 'usage', 'scoring'].includes(item.kind), 'unknown artifact kind');
      requireValue(['available', 'missing', 'corrupt'].includes(item.status), 'invalid artifact status');
      if (item.status === 'available') { await artifact({ path: item.path, sha256: item.sha256 }, root, item.kind); requireValue(item.reason === null, 'available artifact reason must be null'); }
      else { requireValue(item.path === null && item.sha256 === null, 'unavailable artifacts must not claim verified paths/hashes'); text(item.reason, 'artifact reason'); incompleteEvidence.push(run.id); }
    }
    requireValue(['transcript', 'diff', 'checks', 'output', 'usage', 'scoring'].every((kind) => run.artifacts.some((item) => item.kind === kind)), 'record every artifact kind, including explicit unavailable dispositions');
    const key = JSON.stringify([run.pairId, run.treatmentId]);
    const previous = cells.get(key) ?? [];
    requireValue(!previous.some((item) => item.attempt === run.attempt), 'duplicate cell attempt'); previous.push(run); cells.set(key, previous);
  }
  const missingCells = [];
  for (const pair of protocol.pairs) for (const treatmentId of pair.order) {
    const runs = (cells.get(JSON.stringify([pair.id, treatmentId])) ?? []).sort((a, b) => a.attempt - b.attempt);
    if (!runs.length) missingCells.push({ pairId: pair.id, treatmentId });
    requireValue(runs.every((run, index) => run.attempt === index + 1), 'attempt sequence has a gap; retain failed attempts');
  }
  requireValue(report.status !== 'complete' || missingCells.length === 0, 'complete report omits planned cells');
  for (const pair of protocol.pairs) {
    const starts = pair.order.map((id) => (cells.get(JSON.stringify([pair.id, id])) ?? []).find((run) => run.attempt === 1)?.startedAt);
    requireValue(!starts.every(Boolean) || starts[0] <= starts[1], 'observed pair order differs from frozen order');
  }
  const measuredCost = report.attempts.reduce((sum, run) => sum + (run.usage.cost ?? 0), 0);
  return { valid: true, scope: 'record consistency and available artifact integrity only; not execution, authorization, grading, or efficacy certification', studyId: protocol.studyId, reportStatus: report.status, attempts: report.attempts.length, missingCells, configurationExceptions, incompleteEvidence: [...new Set(incompleteEvidence)], budgetExceptions: [...new Set(budgetExceptions)], knownCostExceedsCeiling: measuredCost > protocol.authorization.spendCeiling, costIsIncomplete: report.attempts.some((run) => run.usage.cost === null) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, protocol, lock, report, ...extra] = process.argv.slice(2);
  try {
    requireValue(['freeze', 'validate'].includes(command) && protocol && lock && !extra.length && !(command === 'freeze' && report), 'Usage: node tools/study-record.mjs freeze PROTOCOL LOCK | validate PROTOCOL LOCK [REPORT]');
    console.log(JSON.stringify(command === 'freeze' ? await freezeProtocol(protocol, lock) : await validateStudy(protocol, lock, report), null, 2));
  } catch (error) { console.error(`INVALID: ${error.message}`); process.exitCode = 2; }
}
