#!/usr/bin/env node
// Installs or updates a generated host distribution without overwriting
// host-owned instructions. The checked-in state file is the ownership ledger
// used to make later updates convergent and to remove retired generated files.

import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MANIFEST, contextManifestErrors, contextRuleSourcePathErrors } from './build-distributions.mjs';

export const STATE_FILE = '.agent-engineering-rules-state.json';
export const STATE_SCHEMA_VERSION = 3;
export const INSTALL_LOCK_FILE = '.agent-engineering-rules-install.lock';
export const INSTALL_LOCK_RECOVERY_FILE = `${INSTALL_LOCK_FILE}.recovery`;
export const INSTALL_LOCK_INITIALIZATION_STALE_MS = 60_000;
export const ROOT_START = '<!-- agent-engineering-rules:start -->';
export const ROOT_END = '<!-- agent-engineering-rules:end -->';
export const DEFAULT_CODEX_MAX_BYTES = 32768;
export const CODEX_SKILL_CATALOG_FALLBACK_CHARACTERS = 8000;
export const CODEX_SKILL_CATALOG_PRODUCT_TARGET_CHARACTERS = 2000;
export const DEFAULT_PROFILE = MANIFEST.defaultProfile;
export const RETIRED_MANAGED_PATHS = Object.freeze({
  claude: Object.freeze([
    'agent-rules/tools/file-size-guard.py',
    'agent-rules/tools/slop-scan.sh',
  ]),
  codex: Object.freeze([
    'agent-rules/tools/file-size-guard.py',
    'agent-rules/tools/slop-scan.sh',
  ]),
});

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DISTRIBUTION_ROOT = path.join(repo, 'dist');
const HOST_ORDER = ['claude', 'codex'];
const HOSTS = {
  claude: { directory: 'claude', root: 'CLAUDE.md' },
  codex: { directory: 'codex', root: 'AGENTS.md' },
};
const isKnownHost = (host) => typeof host === 'string' && Object.hasOwn(HOSTS, host);
const manifestContextErrors = [...contextManifestErrors(MANIFEST), ...contextRuleSourcePathErrors(MANIFEST)];
if (manifestContextErrors.length) throw new Error(`invalid context manifest entries:\n${manifestContextErrors.map((error) => `  - ${error}`).join('\n')}`);
export const SUPPORTED_PROFILES = Object.freeze(MANIFEST.profiles.map((source) => path.posix.basename(source, '.md')));
const PROFILES = new Set(SUPPORTED_PROFILES);
const CONTEXT_DEFINITIONS = MANIFEST.contexts.map((context) => ({
  name: context.name,
  rule: `.claude/rules/${context.rule}`,
  codexReference: `agent-rules/reference/${path.posix.basename(context.source)}`,
  requires: context.requires,
}));
const CONTEXTS = CONTEXT_DEFINITIONS.map((context) => context.name);
export const SUPPORTED_CONTEXTS = Object.freeze([...CONTEXTS]);
const CONTEXT_SET = new Set(CONTEXTS);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const INSTALL_LOCK_SCHEMA_VERSION = 1;
const INSTALL_LOCK_MAX_BYTES = 4096;
const LOCAL_HOSTNAME = hostname();
const ACTIVE_INSTALL_TARGETS = new Set();
const manualLeaseRecovery = (name) => `Inspect ${name} and remove it only after confirming that no installer is running for this target.`;

class InstallError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InstallError';
    this.code = code;
  }
}

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
// Git may rewrite CRLF/LF at checkout. Ownership is therefore exact after the
// one portable text normalization Git itself performs; mutation snapshots
// remain byte-exact so concurrent edits cannot hide behind normalization.
const ownershipSha256 = (content) => {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const hash = createHash('sha256');
  let start = 0;
  for (let index = 0; index + 1 < bytes.length; index += 1) {
    if (bytes[index] !== 0x0d || bytes[index + 1] !== 0x0a) continue;
    hash.update(bytes.subarray(start, index));
    hash.update('\n');
    start = index + 2;
    index += 1;
  }
  hash.update(bytes.subarray(start));
  return hash.digest('hex');
};
const portable = (file) => file.split(path.sep).join('/');
const demoteHeadings = (text) => text.replace(/^(#{1,5})\s/gm, '$1# ');

export function estimateCodexSkillCatalogCharacters(files, targetRoot) {
  const entries = [];
  for (const [relative, content] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const match = relative.match(/^\.agents\/skills\/([^/]+)\/SKILL\.md$/);
    if (!match) continue;
    const body = decodeUtf8(content, relative);
    const rows = body.split(/\r?\n/);
    const end = rows[0] === '---' ? rows.indexOf('---', 1) : -1;
    if (end < 0) throw new InstallError('DISTRIBUTION', `${relative} is missing skill frontmatter`);
    const fields = {};
    for (const row of rows.slice(1, end)) {
      const field = row.match(/^([a-z_-]+):\s*(.*)$/);
      if (field) fields[field[1]] = field[2].trim();
    }
    if (fields.name !== match[1] || !fields.description) {
      throw new InstallError('DISTRIBUTION', `${relative} must declare its directory name and a non-empty description`);
    }
    const installedPath = portable(path.resolve(targetRoot, ...relative.split('/')));
    entries.push(`${fields.name}\t${fields.description}\t${installedPath}`);
  }
  return entries.join('\n').length;
}

function assertSafeRelative(file, label = STATE_FILE) {
  if (!file || /[\x00-\x1f\x7f]/.test(file) || file.includes('\\') || path.posix.isAbsolute(file) || path.posix.normalize(file) !== file) {
    throw new InstallError('INVALID_STATE', `unsafe owned path in ${label}: ${file}`);
  }
  const parts = file.split('/');
  const windowsDevice = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\..*)?$/i;
  if (parts.some((part) => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part) || /[. ]$/.test(part) || windowsDevice.test(part))) {
    throw new InstallError('INVALID_STATE', `unsafe owned path in ${label}: ${file}`);
  }
}

function inside(root, relative) {
  assertSafeRelative(relative);
  const resolved = path.resolve(root, ...relative.split('/'));
  const difference = path.relative(root, resolved);
  if (difference === '..' || difference.startsWith(`..${path.sep}`) || path.isAbsolute(difference)) {
    throw new InstallError('INVALID_STATE', `owned path escapes the target root: ${relative}`);
  }
  return resolved;
}

export function validateRetiredManagedPaths(value = RETIRED_MANAGED_PATHS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InstallError('RETIRED_PATHS', 'retired managed paths must be an object keyed by supported host');
  }
  for (const host of Object.keys(value)) {
    if (!isKnownHost(host)) throw new InstallError('RETIRED_PATHS', `retired managed paths contain an unknown host: ${host}`);
  }
  const result = {};
  for (const host of HOST_ORDER) {
    const paths = value[host] ?? [];
    if (!Array.isArray(paths) || paths.some((file) => typeof file !== 'string') || new Set(paths).size !== paths.length) {
      throw new InstallError('RETIRED_PATHS', `retired managed paths for ${host} must be a unique string array`);
    }
    const allowedPrefixes = host === 'claude'
      ? ['agent-rules/', '.claude/rules/', '.claude/skills/', '.claude/agents/']
      : ['agent-rules/', '.agents/skills/'];
    for (const file of paths) {
      assertSafeRelative(file, 'retired managed paths');
      if (!allowedPrefixes.some((prefix) => file.startsWith(prefix)) || file === HOSTS[host].root) {
        throw new InstallError('RETIRED_PATHS', `retired managed path is outside the ${host} payload: ${file}`);
      }
    }
    result[host] = [...paths].sort();
  }
  return result;
}

async function optionalFile(file) {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw new InstallError('SYMLINK', `refusing to manage a symlinked file: ${file}`);
    if (!info.isFile()) throw new InstallError('COLLISION', `expected a file but found another filesystem entry: ${file}`);
    return await readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function decodeUtf8(content, file) {
  try {
    // Preserve a UTF-8 BOM as U+FEFF so decoding and re-encoding cannot alter
    // host-owned bytes outside the managed block.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content);
  } catch {
    throw new InstallError('ENCODING', `${file} must be valid UTF-8 before it can receive a managed block`);
  }
}

export async function atomicWrite(file, content, operations = {}) {
  const write = operations.writeFile ?? writeFile;
  const move = operations.rename ?? rename;
  const remove = operations.unlink ?? unlink;
  let mode;
  try {
    mode = (await lstat(file)).mode & 0o777;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.aer-${process.pid}-${randomUUID()}.tmp`);
  try {
    await write(temporary, content, { flag: 'wx', ...(mode === undefined ? {} : { mode }) });
    await move(temporary, file);
  } catch (error) {
    try { await remove(temporary); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError; }
    throw error;
  }
}

const LOCK_OWNER_KEYS = ['createdAtMs', 'hostname', 'nonce', 'pid', 'schemaVersion'];
const LOCK_NONCE_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function sameFileIdentity(left, right) {
  if (!left || !right || left.dev !== right.dev || left.ino !== right.ino) return false;
  if (left.ino === 0 && right.ino === 0) return left.birthtimeMs === right.birthtimeMs;
  return true;
}

function unsafeLease(message, leaseName = INSTALL_LOCK_FILE) {
  return new InstallError('INSTALL_LOCK_UNSAFE', `${message} ${manualLeaseRecovery(leaseName)}`);
}

function validLeaseOwner(owner, now = Date.now()) {
  return owner && typeof owner === 'object' && !Array.isArray(owner)
    && Object.keys(owner).sort().join(',') === LOCK_OWNER_KEYS.join(',')
    && owner.schemaVersion === INSTALL_LOCK_SCHEMA_VERSION
    && typeof owner.hostname === 'string' && owner.hostname.length > 0 && owner.hostname.length <= 255
    && !/[\x00-\x1f\x7f]/.test(owner.hostname)
    && Number.isInteger(owner.pid) && owner.pid > 0 && owner.pid <= 0xffffffff
    && typeof owner.nonce === 'string' && LOCK_NONCE_PATTERN.test(owner.nonce)
    && Number.isInteger(owner.createdAtMs) && owner.createdAtMs > 0 && owner.createdAtMs <= now + INSTALL_LOCK_INITIALIZATION_STALE_MS;
}

function recognizedPartialLease(text) {
  if (text.length === 0) return true;
  const prefix = `{"schemaVersion":${INSTALL_LOCK_SCHEMA_VERSION},`;
  const trimmed = text.trimEnd();
  return !trimmed.endsWith('}') && (prefix.startsWith(trimmed) || trimmed.startsWith(prefix));
}

async function readBounded(handle, maxBytes) {
  const content = Buffer.allocUnsafe(maxBytes + 1);
  let offset = 0;
  while (offset < content.byteLength) {
    const { bytesRead } = await handle.read(content, offset, content.byteLength - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return content.subarray(0, offset);
}

async function inspectInstallLease(lockPath, leaseName = INSTALL_LOCK_FILE, operations = {}) {
  let before;
  try { before = await lstat(lockPath); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (before.isSymbolicLink()) throw unsafeLease(`${leaseName} is a symbolic link; refusing to follow it.`, leaseName);
  if (!before.isFile()) throw unsafeLease(`${leaseName} is not a regular file.`, leaseName);
  if (before.nlink !== 1) throw unsafeLease(`${leaseName} has link count ${before.nlink}; refusing to mutate a hard-linked lease.`, leaseName);
  if (before.size > INSTALL_LOCK_MAX_BYTES) throw unsafeLease(`${leaseName} exceeds ${INSTALL_LOCK_MAX_BYTES} bytes.`, leaseName);

  let handle;
  let opened;
  let content;
  try {
    handle = await open(lockPath, 'r');
    opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !sameFileIdentity(before, opened)) return { changed: true };
    if (opened.size > INSTALL_LOCK_MAX_BYTES) throw unsafeLease(`${leaseName} exceeds ${INSTALL_LOCK_MAX_BYTES} bytes.`, leaseName);
    await operations.beforeLeaseRead?.({ lockPath, leaseName });
    content = await readBounded(handle, INSTALL_LOCK_MAX_BYTES);
    if (content.byteLength > INSTALL_LOCK_MAX_BYTES) {
      throw unsafeLease(`${leaseName} exceeds ${INSTALL_LOCK_MAX_BYTES} bytes.`, leaseName);
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { changed: true };
    throw error;
  } finally {
    await handle?.close();
  }

  let after;
  try { after = await lstat(lockPath); }
  catch (error) { if (error.code === 'ENOENT') return { changed: true }; throw error; }
  if (after.isSymbolicLink()) throw unsafeLease(`${leaseName} changed into a symbolic link during inspection.`, leaseName);
  if (!after.isFile() || after.nlink !== 1) throw unsafeLease(`${leaseName} changed into an unsafe filesystem entry during inspection.`, leaseName);
  if (!sameFileIdentity(opened, after) || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || content.byteLength !== after.size) {
    return { changed: true };
  }

  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(content); }
  catch { throw unsafeLease(`${leaseName} is not valid UTF-8.`, leaseName); }
  let owner;
  try { owner = JSON.parse(text); }
  catch {
    if (recognizedPartialLease(text)) return { kind: 'partial', stat: after, fingerprint: sha256(content) };
    throw unsafeLease(`${leaseName} is malformed and is not a recognized partial initialization.`, leaseName);
  }
  if (!validLeaseOwner(owner)) throw unsafeLease(`${leaseName} does not use the supported closed owner schema.`, leaseName);
  return { kind: 'owner', owner, stat: after, fingerprint: sha256(content) };
}

function processStatus(pid) {
  try { process.kill(pid, 0); return 'alive'; }
  catch (error) { return error.code === 'ESRCH' ? 'dead' : 'unknown'; }
}

function recoverableLease(snapshot, now = Date.now()) {
  if (snapshot.kind === 'partial') {
    return now - snapshot.stat.mtimeMs >= INSTALL_LOCK_INITIALIZATION_STALE_MS
      ? { recoverable: true, reason: 'aged partial initialization' }
      : { recoverable: false, reason: 'recent partial initialization' };
  }
  if (snapshot.owner.hostname.toLowerCase() !== LOCAL_HOSTNAME.toLowerCase()) {
    return { recoverable: false, reason: `owner is on host ${snapshot.owner.hostname}` };
  }
  const status = processStatus(snapshot.owner.pid);
  return status === 'dead'
    ? { recoverable: true, reason: `dead same-host process ${snapshot.owner.pid}` }
    : { recoverable: false, reason: `${status} same-host process ${snapshot.owner.pid}` };
}

function sameLeaseSnapshot(left, right) {
  return left && right && !left.changed && !right.changed
    && left.kind === right.kind
    && left.fingerprint === right.fingerprint
    && sameFileIdentity(left.stat, right.stat)
    && left.stat.nlink === 1 && right.stat.nlink === 1;
}

async function removeLeaseSnapshot(lockPath, expected, leaseName = INSTALL_LOCK_FILE, operations = {}) {
  const current = await inspectInstallLease(lockPath, leaseName);
  if (!sameLeaseSnapshot(expected, current)) return false;
  const final = await inspectInstallLease(lockPath, leaseName);
  if (!sameLeaseSnapshot(current, final)) return false;
  await operations.afterLeaseRemovalInspection?.({ lockPath, leaseName });
  try { await unlink(lockPath); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function leaseInitializationSnapshot(handle, created) {
  if (!handle || !created) return null;
  const before = await handle.stat();
  if (!before.isFile() || before.nlink !== 1 || !sameFileIdentity(created, before) || before.size > INSTALL_LOCK_MAX_BYTES) return null;
  const content = await readBounded(handle, INSTALL_LOCK_MAX_BYTES);
  const after = await handle.stat();
  if (content.length > INSTALL_LOCK_MAX_BYTES || !sameFileIdentity(before, after)
    || before.size !== after.size || before.mtimeMs !== after.mtimeMs || content.length !== after.size) return null;
  return { stat: after, fingerprint: sha256(content) };
}

async function unlinkInitializedLeaseIfSame(lockPath, expected, leaseName) {
  if (!expected) return false;
  const current = await inspectInstallLease(lockPath, leaseName);
  if (!current || current.changed || current.fingerprint !== expected.fingerprint
    || !sameFileIdentity(expected.stat, current.stat)
    || expected.stat.size !== current.stat.size || expected.stat.mtimeMs !== current.stat.mtimeMs) return false;
  return removeLeaseSnapshot(lockPath, current, leaseName);
}

async function cleanupLeaseInitialization(lockPath, expected, leaseName = INSTALL_LOCK_FILE, operations = {}, recoveryGuardHeld = false) {
  await operations.beforeLeaseInitializationCleanup?.({ lockPath, leaseName });
  if (leaseName === INSTALL_LOCK_RECOVERY_FILE || recoveryGuardHeld) {
    // A recovery guard is never removed by another compliant installer; main
    // publication also enters here only while its caller still owns that guard.
    return unlinkInitializedLeaseIfSame(lockPath, expected, leaseName);
  }
  let recoveryGuard;
  try {
    recoveryGuard = await acquireRecoveryGuard(path.dirname(lockPath));
    // Contenders check this guard before creating or recovering the main lease.
    // Recheck identity only after exclusive recovery ownership is established,
    // so a successor that replaced the partial initializer cannot be unlinked.
    return await unlinkInitializedLeaseIfSame(lockPath, expected, leaseName);
  } finally {
    if (recoveryGuard) await releaseLeaseFile(recoveryGuard);
  }
}

async function createLeaseFile(lockPath, leaseName = INSTALL_LOCK_FILE, operations = {}, { recoveryGuardHeld = false } = {}) {
  const owner = {
    schemaVersion: INSTALL_LOCK_SCHEMA_VERSION,
    hostname: LOCAL_HOSTNAME,
    pid: process.pid,
    nonce: randomUUID(),
    createdAtMs: Date.now(),
  };
  let handle;
  let created;
  try {
    handle = await open(lockPath, 'wx+', 0o600);
    created = await handle.stat();
    if (!created.isFile() || created.nlink !== 1) throw unsafeLease(`could not create a private regular ${leaseName}.`, leaseName);
    await operations.beforeLeaseOwnerWrite?.({ lockPath, leaseName });
    await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    let initialization;
    try { initialization = await leaseInitializationSnapshot(handle, created); }
    catch (snapshotError) { error.snapshotError = snapshotError; }
    try { await handle?.close(); }
    catch (closeError) { error.closeError = closeError; }
    if (initialization) {
      try { await cleanupLeaseInitialization(lockPath, initialization, leaseName, operations, recoveryGuardHeld); }
      catch (cleanupError) { error.cleanupError = cleanupError; }
    }
    throw error;
  }
  const snapshot = await inspectInstallLease(lockPath, leaseName);
  if (snapshot?.kind !== 'owner' || snapshot.owner.nonce !== owner.nonce) {
    throw unsafeLease(`${leaseName} changed while its owner record was initialized.`, leaseName);
  }
  return { lockPath, leaseName, owner };
}

async function releaseLeaseFile(lease) {
  const snapshot = await inspectInstallLease(lease.lockPath, lease.leaseName);
  if (snapshot?.kind !== 'owner' || snapshot.owner.nonce !== lease.owner.nonce) {
    throw unsafeLease(`${lease.leaseName} no longer contains this installer's nonce; refusing to release it.`, lease.leaseName);
  }
  if (!await removeLeaseSnapshot(lease.lockPath, snapshot, lease.leaseName)) {
    throw unsafeLease(`${lease.leaseName} changed during release; refusing to remove it.`, lease.leaseName);
  }
}

async function assertNoRecoveryGuard(targetRoot, action = 'installation') {
  const recoveryPath = path.join(targetRoot, INSTALL_LOCK_RECOVERY_FILE);
  const snapshot = await inspectInstallLease(recoveryPath, INSTALL_LOCK_RECOVERY_FILE);
  if (snapshot === null) return;
  if (snapshot.changed) {
    throw new InstallError(
      'INSTALL_LOCKED',
      `${INSTALL_LOCK_RECOVERY_FILE} changed during inspection; ${action} did not start. ${manualLeaseRecovery(INSTALL_LOCK_RECOVERY_FILE)}`,
    );
  }
  const reason = snapshot.kind === 'owner'
    ? recoverableLease(snapshot).reason
    : `${Date.now() - snapshot.stat.mtimeMs >= INSTALL_LOCK_INITIALIZATION_STALE_MS ? 'aged' : 'recent'} partial initialization`;
  throw new InstallError(
    'INSTALL_LOCKED',
    `${INSTALL_LOCK_RECOVERY_FILE} is present (${reason}); automatic recovery never removes this recovery guard, so ${action} did not start. ${manualLeaseRecovery(INSTALL_LOCK_RECOVERY_FILE)}`,
  );
}

async function acquireRecoveryGuard(targetRoot) {
  const recoveryPath = path.join(targetRoot, INSTALL_LOCK_RECOVERY_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await createLeaseFile(recoveryPath, INSTALL_LOCK_RECOVERY_FILE); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await assertNoRecoveryGuard(targetRoot, 'stale-lease recovery');
    }
  }
  throw new InstallError(
    'INSTALL_LOCKED',
    `${INSTALL_LOCK_RECOVERY_FILE} changed during recovery-guard acquisition; installation did not start. ${manualLeaseRecovery(INSTALL_LOCK_RECOVERY_FILE)}`,
  );
}

async function acquireInstallLease(targetRoot, operations = {}) {
  const lockPath = path.join(targetRoot, INSTALL_LOCK_FILE);
  if (ACTIVE_INSTALL_TARGETS.has(targetRoot)) {
    throw new InstallError('INSTALL_LOCKED', `an installer lease is already active for this target in process ${process.pid}; reentrant installation is not allowed.`);
  }
  ACTIVE_INSTALL_TARGETS.add(targetRoot);
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await assertNoRecoveryGuard(targetRoot);
      const snapshot = await inspectInstallLease(lockPath, INSTALL_LOCK_FILE, operations);
      if (snapshot?.changed) continue;
      if (snapshot !== null) {
        const status = recoverableLease(snapshot);
        if (!status.recoverable) throw new InstallError('INSTALL_LOCKED', `${INSTALL_LOCK_FILE} is held by ${status.reason}; installation did not start. ${manualLeaseRecovery(INSTALL_LOCK_FILE)}`);
        await operations.beforeLeaseRecovery?.({ lockPath, reason: status.reason });
      }

      let recoveryGuard;
      try {
        recoveryGuard = await acquireRecoveryGuard(targetRoot);
        const current = await inspectInstallLease(lockPath);
        if (current !== null) {
          if (current.changed) continue;
          const currentStatus = recoverableLease(current);
          if (!currentStatus.recoverable) {
            throw new InstallError(
              'INSTALL_LOCKED',
              `${INSTALL_LOCK_FILE} is held by ${currentStatus.reason}; installation did not start. ${manualLeaseRecovery(INSTALL_LOCK_FILE)}`,
            );
          }
          if (!await removeLeaseSnapshot(lockPath, current, INSTALL_LOCK_FILE, operations)) continue;
        }
        const lease = await createLeaseFile(lockPath, INSTALL_LOCK_FILE, operations, { recoveryGuardHeld: true });
        await releaseLeaseFile(recoveryGuard);
        recoveryGuard = null;
        return { ...lease, targetRoot };
      } finally {
        if (recoveryGuard) await releaseLeaseFile(recoveryGuard);
      }
    }
    throw new InstallError('INSTALL_LOCKED', `${INSTALL_LOCK_FILE} changed repeatedly during acquisition; installation did not start. ${manualLeaseRecovery(INSTALL_LOCK_FILE)}`);
  } catch (error) {
    ACTIVE_INSTALL_TARGETS.delete(targetRoot);
    throw error;
  }
}

async function assertDryRunLeaseAvailable(targetRoot) {
  if (ACTIVE_INSTALL_TARGETS.has(targetRoot)) {
    throw new InstallError('INSTALL_LOCKED', `an installer lease is already active for this target in process ${process.pid}; dry-run made no changes.`);
  }
  await assertNoRecoveryGuard(targetRoot, 'dry-run');
  const lockPath = path.join(targetRoot, INSTALL_LOCK_FILE);
  const snapshot = await inspectInstallLease(lockPath);
  if (snapshot === null) return;
  if (snapshot.changed) throw new InstallError('INSTALL_LOCKED', `${INSTALL_LOCK_FILE} changed during dry-run inspection; dry-run made no changes.`);
  const status = recoverableLease(snapshot);
  throw new InstallError('INSTALL_LOCKED', `${INSTALL_LOCK_FILE} is held by ${status.reason}; dry-run never acquires or recovers leases and made no changes. ${manualLeaseRecovery(INSTALL_LOCK_FILE)}`);
}

async function releaseInstallLease(lease) {
  try {
    await releaseLeaseFile(lease);
  } finally {
    ACTIVE_INSTALL_TARGETS.delete(lease.targetRoot);
  }
}

async function assertNoSymlinkParents(root, file) {
  const difference = path.relative(root, path.dirname(file));
  if (!difference) return;
  let current = root;
  for (const part of difference.split(path.sep)) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new InstallError('SYMLINK', `refusing to write through a symlinked directory: ${current}`);
      if (!info.isDirectory()) throw new InstallError('COLLISION', `expected a directory but found another filesystem entry: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function walk(root, directory = root, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new InstallError('SYMLINK', `distribution contains a symlink: ${file}`);
    if (entry.isDirectory()) await walk(root, file, files);
    else if (entry.isFile()) files.push(portable(path.relative(root, file)));
    else throw new InstallError('DISTRIBUTION', `distribution contains an unsupported filesystem entry: ${file}`);
  }
  return files;
}

function emptyState() {
  return { schemaVersion: STATE_SCHEMA_VERSION, hosts: {} };
}

function hasClosedKeys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function validateHostSelection(host, hostState, label, pending = false) {
  const hostKeys = ['profile', 'contexts', 'root', 'files'];
  if (!hostState || typeof hostState !== 'object' || Array.isArray(hostState)
    || !hasClosedKeys(hostState, hostKeys)
    || !PROFILES.has(hostState.profile) || !Array.isArray(hostState.contexts)
    || new Set(hostState.contexts).size !== hostState.contexts.length
    || hostState.contexts.some((name) => !CONTEXT_SET.has(name))) {
    throw new InstallError('INVALID_STATE', `${STATE_FILE} contains invalid profile/context configuration for ${label}`);
  }
  const root = hostState.root;
  if (!root || typeof root !== 'object' || Array.isArray(root) || root.path !== HOSTS[host].root) {
    throw new InstallError('INVALID_STATE', `${STATE_FILE} contains invalid managed-root ownership for ${label}`);
  }
  if (pending) {
    if (!hasClosedKeys(root, ['path', 'hashes', 'createdFile', 'prependedSeparator'])) {
      throw new InstallError('INVALID_STATE', `${STATE_FILE} contains unknown pending managed-root fields for ${label}`);
    }
    if (!Array.isArray(root.hashes) || root.hashes.length === 0 || root.hashes.some((hash) => !HASH_PATTERN.test(hash))
      || new Set(root.hashes).size !== root.hashes.length || root.sha256 !== undefined
      || typeof root.createdFile !== 'boolean' || typeof root.prependedSeparator !== 'boolean'
      || (root.createdFile && root.prependedSeparator)) {
      throw new InstallError('INVALID_STATE', `${STATE_FILE} contains invalid pending managed-root hashes for ${label}`);
    }
  } else {
    if (!hasClosedKeys(root, ['path', 'sha256', 'createdFile', 'prependedSeparator'])
      || !HASH_PATTERN.test(root.sha256 ?? '') || root.hashes !== undefined
      || typeof root.createdFile !== 'boolean' || typeof root.prependedSeparator !== 'boolean'
      || (root.createdFile && root.prependedSeparator)) {
      throw new InstallError('INVALID_STATE', `${STATE_FILE} contains invalid managed-root hash for ${label}`);
    }
  }
}

function validateState(state) {
  if (!hasClosedKeys(state, ['schemaVersion', 'hosts'], ['pending'])
    || state.schemaVersion !== STATE_SCHEMA_VERSION || !state.hosts || typeof state.hosts !== 'object' || Array.isArray(state.hosts)) {
    throw new InstallError('INVALID_STATE', `${STATE_FILE} does not use the supported schema version ${STATE_SCHEMA_VERSION}`);
  }
  for (const [host, hostState] of Object.entries(state.hosts)) {
    if (!isKnownHost(host) || !hostState || typeof hostState !== 'object' || Array.isArray(hostState)) {
      throw new InstallError('INVALID_STATE', `${STATE_FILE} contains an invalid host entry: ${host}`);
    }
    validateHostSelection(host, hostState, host);
    if (!hostState.files || typeof hostState.files !== 'object' || Array.isArray(hostState.files)) {
      throw new InstallError('INVALID_STATE', `${STATE_FILE} contains an invalid file inventory for ${host}`);
    }
    for (const [file, hash] of Object.entries(hostState.files)) {
      assertSafeRelative(file);
      const allowedPrefix = host === 'claude' ? '.claude/' : '.agents/';
      if (!file.startsWith('agent-rules/') && !file.startsWith(allowedPrefix)) {
        throw new InstallError('INVALID_STATE', `${STATE_FILE} contains a path outside the ${host} distribution: ${file}`);
      }
      if (!HASH_PATTERN.test(hash)) throw new InstallError('INVALID_STATE', `${STATE_FILE} contains an invalid hash for ${file}`);
    }
  }
  if (state.pending !== undefined) {
    if (!state.pending || typeof state.pending !== 'object' || Array.isArray(state.pending)) {
      throw new InstallError('INVALID_STATE', `${STATE_FILE} contains an invalid pending-install inventory`);
    }
    for (const [host, pending] of Object.entries(state.pending)) {
      if (!isKnownHost(host)) throw new InstallError('INVALID_STATE', `${STATE_FILE} contains an invalid pending host entry: ${host}`);
      validateHostSelection(host, pending, `pending ${host}`, true);
      if (!pending.files || typeof pending.files !== 'object' || Array.isArray(pending.files)) {
        throw new InstallError('INVALID_STATE', `${STATE_FILE} contains an invalid pending file inventory for ${host}`);
      }
      for (const [file, hashes] of Object.entries(pending.files)) {
        assertSafeRelative(file);
        if (!Array.isArray(hashes) || hashes.length === 0 || hashes.some((hash) => !HASH_PATTERN.test(hash))
          || new Set(hashes).size !== hashes.length) {
          throw new InstallError('INVALID_STATE', `${STATE_FILE} contains invalid pending hashes for ${file}`);
        }
      }
    }
  }
  return state;
}

async function loadState(targetRoot) {
  const content = await optionalFile(path.join(targetRoot, STATE_FILE));
  if (content === null) return { state: emptyState(), content };
  try {
    return { state: validateState(JSON.parse(content.toString('utf8'))), content };
  } catch (error) {
    if (error instanceof InstallError) throw error;
    throw new InstallError('INVALID_STATE', `${STATE_FILE} is not valid JSON: ${error.message}`);
  }
}

async function recognizedManagedPaths(distributionRoot, retiredManagedPaths = RETIRED_MANAGED_PATHS) {
  const result = new Map(HOST_ORDER.map((host) => [host, new Set()]));
  const retired = validateRetiredManagedPaths(retiredManagedPaths);
  for (const host of HOST_ORDER) {
    for (const file of retired[host]) result.get(host).add(file);
  }
  for (const host of HOST_ORDER) {
    const hostRoot = path.join(distributionRoot, HOSTS[host].directory);
    let info;
    try { info = await stat(hostRoot); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!info.isDirectory()) continue;
    for (const file of await walk(hostRoot)) {
      if (file !== HOSTS[host].root) result.get(host).add(file);
    }
  }
  return result;
}

function validateRecognizedStatePaths(state, recognized) {
  for (const host of HOST_ORDER) {
    const allowed = recognized.get(host);
    const inventories = [state.hosts[host]?.files, state.pending?.[host]?.files];
    for (const inventory of inventories) {
      for (const file of Object.keys(inventory ?? {})) {
        if (!allowed.has(file)) {
          throw new InstallError('INVALID_STATE', `${STATE_FILE} claims an unrecognized ${host} managed path: ${file}`);
        }
      }
    }
  }
}

function orderedContexts(values) {
  const selected = new Set(values);
  for (const value of selected) {
    if (!CONTEXT_SET.has(value)) throw new InstallError('ARGUMENT', `unknown context "${value}"; choose from: ${CONTEXTS.join(', ')}`);
  }
  const pending = [...selected];
  while (pending.length) {
    const current = pending.shift();
    const definition = CONTEXT_DEFINITIONS.find((context) => context.name === current);
    for (const required of definition.requires) {
      if (selected.has(required)) continue;
      selected.add(required);
      pending.push(required);
    }
  }
  return CONTEXTS.filter((value) => selected.has(value));
}

function contextForFile(host, file) {
  if (host !== 'claude') return null;
  return CONTEXT_DEFINITIONS.find((context) => file === context.rule)?.name ?? null;
}

function isCustomizable(host, file) {
  return host === 'claude' && (file === '.claude/rules/profile.md' || CONTEXT_DEFINITIONS.some((context) => context.rule === file));
}

async function selectedProfileText(hostRoot, profile) {
  const file = path.join(hostRoot, 'agent-rules', 'profiles', `${profile}.md`);
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new InstallError('DISTRIBUTION', `distribution is missing profile ${profile}: ${error.message}`);
  }
}

function replaceTrailingProfile(text, standard, selected, demote = false) {
  const from = (demote ? demoteHeadings(standard) : standard).trimEnd();
  const to = (demote ? demoteHeadings(selected) : selected).trimEnd();
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(from)) {
    throw new InstallError('DISTRIBUTION', 'generated root/profile layout no longer has the expected trailing standard profile');
  }
  return `${trimmed.slice(0, trimmed.length - from.length)}${to}\n`;
}

async function prepareHost(distributionRoot, host, profile, contexts) {
  const hostRoot = path.join(distributionRoot, HOSTS[host].directory);
  let info;
  try { info = await stat(hostRoot); } catch { throw new InstallError('DISTRIBUTION', `missing distribution directory: ${hostRoot}`); }
  if (!info.isDirectory()) throw new InstallError('DISTRIBUTION', `distribution path is not a directory: ${hostRoot}`);

  const rootPath = HOSTS[host].root;
  const rawRoot = await readFile(path.join(hostRoot, rootPath), 'utf8');
  const standard = await selectedProfileText(hostRoot, 'standard');
  const chosen = await selectedProfileText(hostRoot, profile);
  const files = new Map();

  for (const relative of (await walk(hostRoot)).sort()) {
    if (relative === rootPath) continue;
    const allowedPrefix = host === 'claude' ? '.claude/' : '.agents/';
    if (!relative.startsWith('agent-rules/') && !relative.startsWith(allowedPrefix)) {
      throw new InstallError('DISTRIBUTION', `unexpected path outside the ${host} payload: ${relative}`);
    }
    const context = contextForFile(host, relative);
    if (context && !contexts.includes(context)) continue;
    let content = await readFile(inside(hostRoot, relative));
    if (host === 'claude' && relative === '.claude/rules/profile.md' && profile !== 'standard') {
      let text = replaceTrailingProfile(content.toString('utf8'), standard, chosen);
      text = text.replace('Active profile: standard.', `Active profile: ${profile}.`);
      content = Buffer.from(text);
    }
    files.set(relative, content);
  }

  let rootBody = rawRoot;
  if (host === 'codex') {
    if (profile !== 'standard') rootBody = replaceTrailingProfile(rootBody, standard, chosen, true);
    const rows = rootBody.split('\n').filter((row) => {
      for (const context of CONTEXT_DEFINITIONS) {
        if (!contexts.includes(context.name) && row.includes(context.codexReference)) return false;
      }
      return true;
    });
    rootBody = rows.join('\n').trimEnd() + '\n';
  }

  return { host, files, rootBody, profile, contexts };
}

function markerMatches(text, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(`^${escaped}(?=\\r?$)`, 'gm'))];
}

const lineEnding = (text) => text.includes('\r\n') ? '\r\n' : '\n';
const withLineEnding = (text, eol) => text.replace(/\r\n|\r|\n/g, eol);

function managedBlock(text, relative) {
  const starts = markerMatches(text, ROOT_START);
  const ends = markerMatches(text, ROOT_END);
  if (starts.length !== 1 || ends.length !== 1 || starts[0].index >= ends[0].index) {
    throw new InstallError('ROOT_MARKERS', `${relative} must contain exactly one ordered ${ROOT_START}/${ROOT_END} pair`);
  }
  const end = ends[0].index + ends[0][0].length;
  const content = text.slice(starts[0].index, end);
  return { start: starts[0].index, end, content, sha256: ownershipSha256(Buffer.from(content, 'utf8')) };
}

function managedBoundary(text, block, ownership, relative) {
  if (!ownership.prependedSeparator) return 0;
  const prefix = text.slice(0, block.start);
  if (prefix.endsWith('\r\n')) return 2;
  if (prefix.endsWith('\n')) return 1;
  throw new InstallError('ROOT_SEPARATOR_MODIFIED', `${relative} no longer contains its ledger-owned separator before the managed block`);
}

function generatedManagedBlock(generated, eol = '\n') {
  const body = withLineEnding(generated.trimEnd(), eol);
  return `${ROOT_START}${eol}${body}${eol}${ROOT_END}`;
}

function managedRoot(existing, generated) {
  const eol = lineEnding(existing ?? generated);
  const block = generatedManagedBlock(generated, eol);
  if (existing === null) return `${block}${eol}`;

  const starts = markerMatches(existing, ROOT_START);
  const ends = markerMatches(existing, ROOT_END);
  if (starts.length || ends.length) {
    const current = managedBlock(existing, 'root instruction file');
    return `${existing.slice(0, current.start)}${block}${existing.slice(current.end)}`;
  }
  return existing.endsWith(eol) || existing.endsWith('\r')
    ? `${existing}${block}${eol}`
    : `${existing}${eol}${block}${eol}`;
}

function removeManagedRoot(existing, relative, ownership) {
  const block = managedBlock(existing, relative);
  const start = block.start - managedBoundary(existing, block, ownership, relative);
  let end = block.end;
  if (existing.startsWith('\r\n', end)) end += 2;
  else if (existing.startsWith('\n', end) || existing.startsWith('\r', end)) end += 1;
  return `${existing.slice(0, start)}${existing.slice(end)}`;
}

function ownersByPath(state) {
  const result = new Map();
  for (const host of HOST_ORDER) {
    for (const [file, hash] of Object.entries(state.hosts[host]?.files ?? {})) {
      if (!result.has(file)) result.set(file, []);
      result.get(file).push({ host, hash });
    }
    for (const [file, hashes] of Object.entries(state.pending?.[host]?.files ?? {})) {
      if (!result.has(file)) result.set(file, []);
      for (const hash of hashes) result.get(file).push({ host, hash, pending: true });
    }
  }
  return result;
}

function hostOwnedHashes(state, host) {
  const result = new Map();
  for (const [file, hash] of Object.entries(state.hosts[host]?.files ?? {})) result.set(file, new Set([hash]));
  for (const [file, hashes] of Object.entries(state.pending?.[host]?.files ?? {})) {
    if (!result.has(file)) result.set(file, new Set());
    for (const hash of hashes) result.get(file).add(hash);
  }
  return result;
}

function pendingHostState(previous, current, plan, rootHash, rootOwnership) {
  const files = {};
  for (const [file, hashes] of Object.entries(previous?.files ?? {})) files[file] = [...hashes];
  for (const [file, content] of plan.files) {
    const hash = ownershipSha256(content);
    if (!files[file]) files[file] = [];
    if (!files[file].includes(hash)) files[file].push(hash);
  }
  const hashes = [
    ...(previous?.root?.hashes ?? []),
    ...(current?.root?.sha256 ? [current.root.sha256] : []),
    rootHash,
  ];
  return {
    profile: plan.profile,
    contexts: [...plan.contexts],
    root: {
      path: HOSTS[plan.host].root,
      hashes: [...new Set(hashes)].sort(),
      createdFile: rootOwnership.createdFile,
      prependedSeparator: rootOwnership.prependedSeparator,
    },
    files,
  };
}

function stableState(state) {
  const hosts = {};
  for (const host of HOST_ORDER) {
    const value = state.hosts[host];
    if (!value) continue;
    hosts[host] = {
      profile: value.profile,
      contexts: orderedContexts(value.contexts),
      root: {
        path: value.root.path,
        sha256: value.root.sha256,
        createdFile: value.root.createdFile,
        prependedSeparator: value.root.prependedSeparator,
      },
      files: Object.fromEntries(Object.entries(value.files).sort(([a], [b]) => a.localeCompare(b))),
    };
  }
  const pending = {};
  for (const host of HOST_ORDER) {
    const value = state.pending?.[host];
    if (!value) continue;
    pending[host] = {
      profile: value.profile,
      contexts: orderedContexts(value.contexts),
      root: {
        path: value.root.path,
        hashes: [...new Set(value.root.hashes)].sort(),
        createdFile: value.root.createdFile,
        prependedSeparator: value.root.prependedSeparator,
      },
      files: Object.fromEntries(Object.entries(value.files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, hashes]) => [file, [...new Set(hashes)].sort()])),
    };
  }
  return { schemaVersion: STATE_SCHEMA_VERSION, hosts, ...(Object.keys(pending).length ? { pending } : {}) };
}

async function assertSnapshot(target, expected, relative) {
  const current = await optionalFile(target);
  if ((current === null) !== (expected === null) || (current !== null && !current.equals(expected))) {
    throw new InstallError('CONCURRENT_CHANGE', `${relative} changed after install preflight; the pending ownership journal was retained for a safe retry`);
  }
}

function failConflicts(conflicts, action = 'install') {
  if (!conflicts.length) return;
  throw new InstallError('PREFLIGHT', `${action} preflight failed; no files were changed:\n${conflicts.map((item) => `  - ${item}`).join('\n')}`);
}

async function resolveConsumerTarget(requested) {
  if (!requested) throw new InstallError('ARGUMENT', 'targetRoot is required');
  const requestedTargetRoot = path.resolve(requested);
  let targetRoot;
  let targetInfo;
  try {
    targetRoot = await realpath(requestedTargetRoot);
    targetInfo = await stat(targetRoot);
  } catch {
    throw new InstallError('TARGET', `target repository does not exist: ${requestedTargetRoot}`);
  }
  if (!targetInfo.isDirectory()) throw new InstallError('TARGET', `target repository is not a directory: ${targetRoot}`);
  const sourceRepoRoot = await realpath(repo);
  const fromSourceRepo = path.relative(sourceRepoRoot, targetRoot);
  if (!fromSourceRepo || (!fromSourceRepo.startsWith(`..${path.sep}`) && fromSourceRepo !== '..' && !path.isAbsolute(fromSourceRepo))) {
    throw new InstallError('TARGET', 'refusing to manage the consumer distribution in the source repository or one of its descendants');
  }
  return targetRoot;
}

/**
 * Install or update one or both generated distributions.
 *
 * Options used by tests in addition to the CLI surface:
 * - hosts: ['claude'], ['codex'], or both
 * - log: false to suppress the completion summary
 * - retiredManagedPaths: injected closed path authority for future retirement tests
 * - operations.atomicWrite: injected atomic writer for interruption tests
 * - operations.beforeLeaseRead / beforeLeaseRecovery: injected lock-race barriers
 * - operations.beforeLeaseOwnerWrite / beforeLeaseInitializationCleanup / afterLeaseRemovalInspection: injected lease-race barriers
 */
export async function installDistribution({
  targetRoot,
  distributionRoot = DEFAULT_DISTRIBUTION_ROOT,
  hosts,
  profile,
  contexts,
  codexMaxBytes = DEFAULT_CODEX_MAX_BYTES,
  retiredManagedPaths = RETIRED_MANAGED_PATHS,
  operations = {},
  dryRun = false,
  log = true,
  mode = 'upsert',
}) {
  if (!targetRoot) throw new InstallError('ARGUMENT', 'targetRoot is required');
  if (!['upsert', 'init', 'update'].includes(mode)) throw new InstallError('ARGUMENT', 'mode must be init, update, or upsert');
  if (profile !== undefined && !PROFILES.has(profile)) {
    throw new InstallError('ARGUMENT', `unknown profile "${profile}"; choose prototype, standard, or high-assurance`);
  }
  if (!Number.isInteger(codexMaxBytes) || codexMaxBytes <= 0) {
    throw new InstallError('ARGUMENT', 'codexMaxBytes must be a positive integer');
  }

  distributionRoot = path.resolve(distributionRoot);
  targetRoot = await resolveConsumerTarget(targetRoot);

  let lease;
  if (dryRun) await assertDryRunLeaseAvailable(targetRoot);
  else lease = await acquireInstallLease(targetRoot, operations);
  try {
  const loaded = await loadState(targetRoot);
  const state = loaded.state;
  validateRecognizedStatePaths(state, await recognizedManagedPaths(distributionRoot, retiredManagedPaths));
  const configuredHosts = HOST_ORDER.filter((host) => state.hosts[host] || state.pending?.[host]);
  if (mode === 'init' && loaded.content !== null) {
    const detail = configuredHosts.length ? ` configures ${configuredHosts.join('+')}` : ' already exists';
    throw new InstallError('ALREADY_INITIALIZED', `${STATE_FILE}${detail}; use update or remove the empty ledger deliberately`);
  }
  if (mode === 'update' && !configuredHosts.length) {
    throw new InstallError('NOT_INITIALIZED', `${STATE_FILE} has no configured hosts; use init`);
  }
  const selected = [...new Set(hosts ?? (mode === 'update' ? configuredHosts : []))];
  if (!selected.length || selected.some((host) => !isKnownHost(host))) {
    throw new InstallError('ARGUMENT', 'hosts must contain claude, codex, or both');
  }
  const nextState = JSON.parse(JSON.stringify(state));
  if (!nextState.pending) nextState.pending = {};
  const prepared = new Map();
  for (const host of selected) {
    const old = state.pending?.[host] ?? state.hosts[host];
    const chosenProfile = profile ?? old?.profile ?? DEFAULT_PROFILE;
    const chosenContexts = orderedContexts(contexts ?? old?.contexts ?? []);
    prepared.set(host, await prepareHost(distributionRoot, host, chosenProfile, chosenContexts));
  }

  const codexSkillCatalogCharacters = prepared.has('codex')
    ? estimateCodexSkillCatalogCharacters(prepared.get('codex').files, targetRoot)
    : null;

  const desiredPaths = new Map();
  for (const [host, plan] of prepared) {
    for (const [file, content] of plan.files) {
      const existing = desiredPaths.get(file);
      if (existing && !existing.content.equals(content)) {
        throw new InstallError('DISTRIBUTION', `${file} differs between selected host distributions`);
      }
      if (!existing) desiredPaths.set(file, { content, hosts: [] });
      desiredPaths.get(file).hosts.push(host);
    }
  }

  const oldOwners = ownersByPath(state);
  const conflicts = [];
  const warnings = [];
  const writes = new Map();
  const deletes = new Map();
  if (codexSkillCatalogCharacters !== null && codexSkillCatalogCharacters > CODEX_SKILL_CATALOG_FALLBACK_CHARACTERS) {
    conflicts.push(`.agents/skills: this distribution contributes an estimated ${codexSkillCatalogCharacters} catalog characters at the target path, above Codex's documented ${CODEX_SKILL_CATALOG_FALLBACK_CHARACTERS}-character fallback when model context is unknown`);
  }

  for (const [file, desired] of desiredPaths) {
    const target = inside(targetRoot, file);
    await assertNoSymlinkParents(targetRoot, target);
    const current = await optionalFile(target);
    const desiredHash = ownershipSha256(desired.content);
    const owners = oldOwners.get(file) ?? [];
    if (current === null) {
      writes.set(file, { content: desired.content, expected: current });
      continue;
    }
    const currentHash = ownershipSha256(current);
    if (currentHash === desiredHash) {
      if (!owners.length) conflicts.push(`${file}: identical unowned collision; move it before initializing`);
      continue;
    }
    if (owners.some((owner) => owner.hash === currentHash)) {
      writes.set(file, { content: desired.content, expected: current });
      continue;
    }
    const changesCustomizedProfile = file === '.claude/rules/profile.md'
      && profile !== undefined
      && profile !== (state.pending?.claude ?? state.hosts.claude)?.profile;
    if (changesCustomizedProfile) {
      conflicts.push(`${file}: customized active profile conflicts with requested profile ${profile}; move or restore it first`);
      continue;
    }
    if (desired.hosts.every((host) => isCustomizable(host, file))) {
      warnings.push(`preserved customized ${file}`);
      continue;
    }
    const ownership = owners.length ? 'modified distribution-owned file' : 'host-owned collision';
    conflicts.push(`${file}: ${ownership}; move or restore it before installing`);
  }

  const selectedSet = new Set(selected);
  const willOwn = (file, excludingHost) => HOST_ORDER.some((host) => {
    if (host === excludingHost) return false;
    if (selectedSet.has(host)) return prepared.get(host).files.has(file);
    return hostOwnedHashes(state, host).has(file);
  });

  for (const host of selected) {
    const desired = prepared.get(host).files;
    for (const [file, oldHashes] of hostOwnedHashes(state, host)) {
      if (desired.has(file) || willOwn(file, host) || deletes.has(file)) continue;
      const target = inside(targetRoot, file);
      await assertNoSymlinkParents(targetRoot, target);
      const current = await optionalFile(target);
      if (current === null) continue;
      if (!oldHashes.has(ownershipSha256(current))) {
        conflicts.push(`${file}: retired owned file was customized; move or remove it before updating`);
      } else {
        deletes.set(file, current);
      }
    }
  }

  const rootWrites = new Map();
  const rootHashes = new Map();
  const rootOwnership = new Map();
  for (const [host, plan] of prepared) {
    const relative = HOSTS[host].root;
    const target = inside(targetRoot, relative);
    await assertNoSymlinkParents(targetRoot, target);
    const current = await optionalFile(target);
    let next;
    try {
      const currentText = current === null ? null : decodeUtf8(current, relative);
      const stableRoot = state.hosts[host]?.root;
      const pendingRoot = state.pending?.[host]?.root;
      const ownedRootHashes = new Set([
        ...(stableRoot?.sha256 ? [stableRoot.sha256] : []),
        ...(pendingRoot?.hashes ?? []),
      ]);
      if (currentText === null && stableRoot) {
        throw new InstallError('ROOT_MISSING', 'managed root file recorded by the project ledger is missing; restore it before updating');
      }
      if (currentText !== null) {
        const starts = markerMatches(currentText, ROOT_START);
        const ends = markerMatches(currentText, ROOT_END);
        if (starts.length || ends.length) {
          const currentBlock = managedBlock(currentText, relative);
          if (!ownedRootHashes.size) {
            throw new InstallError('ROOT_COLLISION', 'pre-existing managed markers are not owned by this project ledger');
          }
          if (!ownedRootHashes.has(currentBlock.sha256)) {
            throw new InstallError('ROOT_MODIFIED', 'managed root block differs from every ledger-owned hash; restore it before updating');
          }
          managedBoundary(currentText, currentBlock, pendingRoot ?? stableRoot, relative);
        } else {
          const normalizedCurrent = withLineEnding(currentText.trimEnd(), '\n');
          const generatedVariants = new Set([
            withLineEnding(plan.rootBody.trimEnd(), '\n'),
            withLineEnding((await readFile(path.join(distributionRoot, HOSTS[host].directory, relative), 'utf8')).trimEnd(), '\n'),
          ]);
          if (!ownedRootHashes.size && generatedVariants.has(normalizedCurrent)) {
            throw new InstallError('ROOT_COLLISION', 'exact unmarked generated root payload is unowned; remove it before initializing');
          }
          if (stableRoot) throw new InstallError('ROOT_MISSING', 'managed root block recorded by the project ledger is missing');
        }
      }
      const hasCurrentManagedBlock = currentText !== null
        && markerMatches(currentText, ROOT_START).length > 0
        && markerMatches(currentText, ROOT_END).length > 0;
      const priorOwnership = hasCurrentManagedBlock ? (pendingRoot ?? stableRoot) : stableRoot;
      const eol = lineEnding(currentText ?? plan.rootBody);
      rootOwnership.set(host, priorOwnership ? {
        createdFile: priorOwnership.createdFile,
        prependedSeparator: priorOwnership.prependedSeparator,
      } : {
        createdFile: currentText === null,
        prependedSeparator: currentText !== null && !currentText.endsWith(eol) && !currentText.endsWith('\r'),
      });
      next = managedRoot(currentText, plan.rootBody);
      rootHashes.set(host, managedBlock(next, relative).sha256);
    } catch (error) {
      if (error instanceof InstallError) conflicts.push(`${relative}: ${error.message}`);
      else throw error;
      continue;
    }
    if (host === 'codex') {
      const bytes = Buffer.byteLength(next, 'utf8');
      if (bytes > codexMaxBytes) {
        conflicts.push(`${relative}: composed root is ${bytes} bytes, above the configured ${codexMaxBytes}-byte Codex limit`);
      }
    }
    if (current === null || !current.equals(Buffer.from(next))) rootWrites.set(relative, { content: Buffer.from(next), expected: current });
  }

  failConflicts(conflicts);
  const hasMutations = writes.size > 0 || rootWrites.size > 0 || deletes.size > 0;
  const checkpointState = JSON.parse(JSON.stringify(state));
  if (!checkpointState.pending) checkpointState.pending = {};
  if (hasMutations) {
    for (const [host, plan] of prepared) {
      checkpointState.pending[host] = pendingHostState(
        state.pending?.[host],
        state.hosts[host],
        plan,
        rootHashes.get(host),
        rootOwnership.get(host),
      );
    }
  }

  for (const [host, plan] of prepared) {
    nextState.hosts[host] = {
      profile: plan.profile,
      contexts: [...plan.contexts],
      root: {
        path: HOSTS[host].root,
        sha256: rootHashes.get(host),
        createdFile: rootOwnership.get(host).createdFile,
        prependedSeparator: rootOwnership.get(host).prependedSeparator,
      },
      files: Object.fromEntries([...plan.files].map(([file, content]) => [file, ownershipSha256(content)])),
    };
    delete nextState.pending[host];
  }
  // A shared file updated or confirmed by one selected host remains owned at
  // the installed hash by an unselected host as well. This also repairs state
  // after an interrupted shared-file write that completed before final commit.
  for (const [file, desired] of desiredPaths) {
    const desiredHash = ownershipSha256(desired.content);
    for (const host of HOST_ORDER) {
      if (selectedSet.has(host)) continue;
      if (nextState.hosts[host]?.files?.[file]) nextState.hosts[host].files[file] = desiredHash;
      const pendingHashes = nextState.pending?.[host]?.files?.[file];
      if (pendingHashes && !pendingHashes.includes(desiredHash)) pendingHashes.push(desiredHash);
    }
  }

  const stateContent = Buffer.from(`${JSON.stringify(stableState(nextState), null, 2)}\n`);
  const oldStateContent = loaded.content;
  const checkpointContent = hasMutations
    ? Buffer.from(`${JSON.stringify(stableState(checkpointState), null, 2)}\n`)
    : null;
  const stateChanged = oldStateContent === null || !oldStateContent.equals(stateContent);
  const checkpointChanged = checkpointContent !== null
    && (oldStateContent === null || !oldStateContent.equals(checkpointContent));
  const finalStateWriteNeeded = stateChanged
    && (!checkpointChanged || !stateContent.equals(checkpointContent));
  const writeAtomically = operations.atomicWrite ?? atomicWrite;
  const statePath = path.join(targetRoot, STATE_FILE);

  if (!dryRun) {
    // The checkpoint retains old ownership plus every planned generated hash.
    // A retry from either the same or a later distribution can therefore
    // classify partially written additions and updates without guessing.
    let expectedStateContent = oldStateContent;
    if (checkpointChanged) {
      await assertSnapshot(statePath, expectedStateContent, STATE_FILE);
      await writeAtomically(statePath, checkpointContent);
      expectedStateContent = checkpointContent;
    }
    for (const [file, writePlan] of [...writes].sort(([a], [b]) => a.localeCompare(b))) {
      const target = inside(targetRoot, file);
      await mkdir(path.dirname(target), { recursive: true });
      await assertNoSymlinkParents(targetRoot, target);
      await assertSnapshot(target, writePlan.expected, file);
      await writeAtomically(target, writePlan.content);
    }
    for (const [file, writePlan] of rootWrites) {
      const target = inside(targetRoot, file);
      await assertNoSymlinkParents(targetRoot, target);
      await assertSnapshot(target, writePlan.expected, file);
      await writeAtomically(target, writePlan.content);
    }
    for (const [file, expected] of [...deletes].sort(([a], [b]) => a.localeCompare(b))) {
      const target = inside(targetRoot, file);
      await assertNoSymlinkParents(targetRoot, target);
      await assertSnapshot(target, expected, file);
      await unlink(target);
    }
    if (finalStateWriteNeeded) {
      await assertSnapshot(statePath, expectedStateContent, STATE_FILE);
      await writeAtomically(statePath, stateContent);
    }
  }

  const summary = {
    targetRoot,
    hosts: selected,
    dryRun,
    written: writes.size + rootWrites.size + (checkpointChanged ? 1 : 0) + (finalStateWriteNeeded ? 1 : 0),
    removed: deletes.size,
    preserved: warnings,
    profiles: Object.fromEntries([...prepared].map(([host, value]) => [host, value.profile])),
    contexts: Object.fromEntries([...prepared].map(([host, value]) => [host, value.contexts])),
    codexSkillCatalogCharacters,
  };
  if (log) {
    const verb = dryRun ? 'WOULD INSTALL' : 'INSTALLED';
    console.log(`${verb} ${selected.join('+')} in ${targetRoot} (${summary.written} writes, ${summary.removed} removals)`);
    for (const warning of warnings) console.log(`PRESERVED ${warning.replace(/^preserved /, '')}`);
  }
    return summary;
  } finally {
    if (lease) await releaseInstallLease(lease);
  }
}

function stateHostNames(state) {
  return HOST_ORDER.filter((host) => state.hosts[host] || state.pending?.[host]);
}

function stateRootHashes(state, host) {
  return new Set([
    ...(state.hosts[host]?.root?.sha256 ? [state.hosts[host].root.sha256] : []),
    ...(state.pending?.[host]?.root?.hashes ?? []),
  ]);
}

function stateFileHashes(state, host, file) {
  return new Set([
    ...(state.hosts[host]?.files?.[file] ? [state.hosts[host].files[file]] : []),
    ...(state.pending?.[host]?.files?.[file] ?? []),
  ]);
}

function sameStringMap(left, right) {
  const entries = (value) => Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

/** Read-only health check for an installed project distribution. */
export async function doctorDistribution({
  targetRoot,
  distributionRoot = DEFAULT_DISTRIBUTION_ROOT,
  retiredManagedPaths = RETIRED_MANAGED_PATHS,
  codexMaxBytes = DEFAULT_CODEX_MAX_BYTES,
} = {}) {
  const result = { status: 'invalid', targetRoot: targetRoot ? path.resolve(targetRoot) : null, hosts: [], issues: [] };
  const issue = (code, message, file) => result.issues.push({ code, message, ...(file ? { file } : {}) });
  try {
    if (!Number.isInteger(codexMaxBytes) || codexMaxBytes <= 0) throw new InstallError('ARGUMENT', 'codexMaxBytes must be a positive integer');
    targetRoot = await resolveConsumerTarget(targetRoot);
    distributionRoot = path.resolve(distributionRoot);
    result.targetRoot = targetRoot;
    await assertDryRunLeaseAvailable(targetRoot);
    const loaded = await loadState(targetRoot);
    const state = loaded.state;
    const hosts = stateHostNames(state);
    result.hosts = hosts;
    if (loaded.content === null || !hosts.length) {
      issue('NOT_INITIALIZED', `${STATE_FILE} does not configure a project installation`);
      return result;
    }
    validateRecognizedStatePaths(state, await recognizedManagedPaths(distributionRoot, retiredManagedPaths));
    if (state.pending && Object.keys(state.pending).length) {
      issue('PENDING_TRANSACTION', 'an interrupted update journal is present; rerun update');
    }

    for (const host of hosts) {
      const selection = state.pending?.[host] ?? state.hosts[host];
      const desired = await prepareHost(distributionRoot, host, selection.profile, selection.contexts);
      const stableFiles = state.hosts[host]?.files ?? {};
      const desiredFiles = Object.fromEntries([...desired.files].map(([file, content]) => [file, ownershipSha256(content)]));
      if (!sameStringMap(stableFiles, desiredFiles) || state.pending?.[host]) {
        issue('UPDATE_AVAILABLE', `${host} installed inventory differs from this distribution`);
      }

      const ownedFiles = new Set([
        ...Object.keys(state.hosts[host]?.files ?? {}),
        ...Object.keys(state.pending?.[host]?.files ?? {}),
      ]);
      for (const file of [...ownedFiles].sort()) {
        const target = inside(targetRoot, file);
        await assertNoSymlinkParents(targetRoot, target);
        const current = await optionalFile(target);
        if (current === null) issue('MISSING_FILE', `${file} is missing`, file);
        else if (!stateFileHashes(state, host, file).has(ownershipSha256(current))) {
          issue('MODIFIED_FILE', `${file} differs from every ledger-owned hash`, file);
        }
      }

      const relative = HOSTS[host].root;
      const rootTarget = inside(targetRoot, relative);
      await assertNoSymlinkParents(targetRoot, rootTarget);
      const currentRoot = await optionalFile(rootTarget);
      if (currentRoot === null) {
        issue('MISSING_ROOT', `${relative} is missing`, relative);
      } else {
        const text = decodeUtf8(currentRoot, relative);
        try {
          const block = managedBlock(text, relative);
          if (!stateRootHashes(state, host).has(block.sha256)) {
            issue('MODIFIED_ROOT', `${relative} managed block differs from every ledger-owned hash`, relative);
          }
          try { managedBoundary(text, block, state.pending?.[host]?.root ?? state.hosts[host].root, relative); }
          catch (error) {
            if (error instanceof InstallError && error.code === 'ROOT_SEPARATOR_MODIFIED') {
              issue('MODIFIED_ROOT', error.message, relative);
            } else throw error;
          }
          const desiredRoot = managedRoot(text, desired.rootBody);
          const desiredHash = managedBlock(desiredRoot, relative).sha256;
          if (state.hosts[host]?.root?.sha256 !== desiredHash || state.pending?.[host]) {
            issue('UPDATE_AVAILABLE', `${relative} managed block differs from this distribution`, relative);
          }
        } catch (error) {
          if (error instanceof InstallError) issue('INVALID_ROOT_MARKERS', error.message, relative);
          else throw error;
        }
        if (host === 'codex' && currentRoot.byteLength > codexMaxBytes) {
          issue('CODEX_ROOT_BUDGET', `${relative} is ${currentRoot.byteLength} bytes, above the configured ${codexMaxBytes}-byte limit`, relative);
        }
      }
      if (host === 'codex') {
        const catalog = estimateCodexSkillCatalogCharacters(desired.files, targetRoot);
        if (catalog > CODEX_SKILL_CATALOG_FALLBACK_CHARACTERS) {
          issue('CODEX_CATALOG_BUDGET', `Codex skill catalog contribution is ${catalog} characters, above ${CODEX_SKILL_CATALOG_FALLBACK_CHARACTERS}`);
        }
      }
    }
    result.status = result.issues.length ? 'drift' : 'current';
    return result;
  } catch (error) {
    issue(error.code ?? 'DOCTOR_FAILED', error.message);
    result.status = 'invalid';
    return result;
  }
}

/** Remove selected project-local hosts without deleting modified or host-owned content. */
export async function uninstallDistribution({
  targetRoot,
  distributionRoot = DEFAULT_DISTRIBUTION_ROOT,
  hosts,
  retiredManagedPaths = RETIRED_MANAGED_PATHS,
  operations = {},
  dryRun = false,
  keepModified = false,
  log = true,
} = {}) {
  targetRoot = await resolveConsumerTarget(targetRoot);
  distributionRoot = path.resolve(distributionRoot);
  let lease;
  if (dryRun) await assertDryRunLeaseAvailable(targetRoot);
  else lease = await acquireInstallLease(targetRoot, operations);
  try {
    const loaded = await loadState(targetRoot);
    const state = loaded.state;
    validateRecognizedStatePaths(state, await recognizedManagedPaths(distributionRoot, retiredManagedPaths));
    const configured = stateHostNames(state);
    if (loaded.content === null || !configured.length) {
      throw new InstallError('NOT_INITIALIZED', `${STATE_FILE} does not configure a project installation`);
    }
    if (state.pending && Object.keys(state.pending).length) {
      throw new InstallError('PENDING_TRANSACTION', 'an interrupted update journal is present; rerun aer update before uninstalling');
    }
    const selected = [...new Set(hosts ?? configured)];
    if (!selected.length || selected.some((host) => !isKnownHost(host) || !configured.includes(host))) {
      throw new InstallError('ARGUMENT', `hosts must be configured values from: ${configured.join(', ')}`);
    }
    const selectedSet = new Set(selected);
    const conflicts = [];
    const preserved = [];
    const deletes = new Map();
    const rootWrites = new Map();
    const rootDeletes = new Map();

    for (const [file, owners] of ownersByPath(state)) {
      const selectedOwners = owners.filter((owner) => selectedSet.has(owner.host));
      if (!selectedOwners.length || owners.some((owner) => !selectedSet.has(owner.host))) continue;
      const target = inside(targetRoot, file);
      await assertNoSymlinkParents(targetRoot, target);
      const current = await optionalFile(target);
      if (current === null) continue;
      const allowed = new Set(selectedOwners.map((owner) => owner.hash));
      if (!allowed.has(ownershipSha256(current))) {
        if (keepModified) preserved.push(`${file}: preserved modified owned file`);
        else conflicts.push(`${file}: modified distribution-owned file; restore it or rerun with --keep-modified`);
      } else {
        deletes.set(file, current);
      }
    }

    for (const host of selected) {
      const relative = HOSTS[host].root;
      const target = inside(targetRoot, relative);
      await assertNoSymlinkParents(targetRoot, target);
      const current = await optionalFile(target);
      if (current === null) continue;
      const currentText = decodeUtf8(current, relative);
      const starts = markerMatches(currentText, ROOT_START);
      const ends = markerMatches(currentText, ROOT_END);
      if (!starts.length && !ends.length) continue; // Convergent retry after a completed root-block removal.
      let block;
      try {
        block = managedBlock(currentText, relative);
        managedBoundary(currentText, block, state.hosts[host].root, relative);
      }
      catch (error) {
        if (keepModified && error instanceof InstallError) {
          const reason = error.code === 'ROOT_SEPARATOR_MODIFIED'
            ? 'modified managed root boundary'
            : 'malformed managed markers';
          preserved.push(`${relative}: preserved ${reason}`);
          continue;
        }
        throw error;
      }
      if (!stateRootHashes(state, host).has(block.sha256)) {
        if (keepModified) {
          preserved.push(`${relative}: preserved modified managed block`);
          continue;
        }
        conflicts.push(`${relative}: modified managed block; restore it or rerun with --keep-modified`);
        continue;
      }
      const rootOwnership = state.hosts[host].root;
      const next = removeManagedRoot(currentText, relative, rootOwnership);
      if (rootOwnership.createdFile && next.length === 0) rootDeletes.set(relative, current);
      else rootWrites.set(relative, { content: Buffer.from(next), expected: current });
    }

    failConflicts(conflicts, 'uninstall');
    const nextState = JSON.parse(JSON.stringify(state));
    for (const host of selected) {
      delete nextState.hosts[host];
      if (nextState.pending) delete nextState.pending[host];
    }
    if (nextState.pending && !Object.keys(nextState.pending).length) delete nextState.pending;
    const statePath = path.join(targetRoot, STATE_FILE);
    const hasRemainingState = stateHostNames(nextState).length > 0;
    const nextStateContent = hasRemainingState ? Buffer.from(`${JSON.stringify(stableState(nextState), null, 2)}\n`) : null;
    const writeAtomically = operations.atomicWrite ?? atomicWrite;

    if (!dryRun) {
      for (const [file, expected] of [...deletes].sort(([a], [b]) => a.localeCompare(b))) {
        const target = inside(targetRoot, file);
        await assertNoSymlinkParents(targetRoot, target);
        await assertSnapshot(target, expected, file);
        await unlink(target);
      }
      for (const [relative, writePlan] of rootWrites) {
        const target = inside(targetRoot, relative);
        await assertNoSymlinkParents(targetRoot, target);
        await assertSnapshot(target, writePlan.expected, relative);
        await writeAtomically(target, writePlan.content);
      }
      for (const [relative, expected] of rootDeletes) {
        const target = inside(targetRoot, relative);
        await assertNoSymlinkParents(targetRoot, target);
        await assertSnapshot(target, expected, relative);
        await unlink(target);
      }
      await assertSnapshot(statePath, loaded.content, STATE_FILE);
      if (nextStateContent === null) await unlink(statePath);
      else await writeAtomically(statePath, nextStateContent);
    }

    const summary = {
      targetRoot,
      hosts: selected,
      dryRun,
      removed: deletes.size + rootDeletes.size + (nextStateContent === null ? 1 : 0),
      written: rootWrites.size + (nextStateContent === null ? 0 : 1),
      preserved,
    };
    if (log) {
      const verb = dryRun ? 'WOULD UNINSTALL' : 'UNINSTALLED';
      console.log(`${verb} ${selected.join('+')} in ${targetRoot} (${summary.removed} removals, ${summary.written} writes)`);
      for (const warning of preserved) console.log(`PRESERVED ${warning}`);
    }
    return summary;
  } finally {
    if (lease) await releaseInstallLease(lease);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  console.error('Use the project CLI: aer init, aer update, aer doctor, or aer uninstall.');
  process.exitCode = 2;
}
