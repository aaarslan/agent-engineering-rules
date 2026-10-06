import { randomUUID } from 'node:crypto';
import {
  AerError,
  STATE,
  acquire,
  release,
  assertLock,
  snapshot,
  replace,
  guard,
  prune,
  lockSnapshot,
  targetRoot,
  hash,
  recoverTemporary,
  controlTemporaries,
  temporaryPath,
} from './fs-safe.mjs';
import {
  readPackage,
  selection,
  estimates,
  expectedFiles,
  kernelBody,
} from './payload.mjs';
import { loadState, jsonBytes } from './state.mjs';
import { buildPlan, prepare, detectV5 } from './plan.mjs';
import { compose } from './block.mjs';

export async function mutate(kind, options = {}, hooks = {}) {
  const packageData = await readPackage(options.packageRoot),
    root = await targetRoot(options.target ?? process.cwd(), packageData.root);
  let lease,
    recorded = false,
    report,
    operation;
  const committedChanges = [];
  try {
    if (options.dryRun) {
      if (await lockSnapshot(root))
        throw new AerError(
          'active or stale run lock; dry-run does not recover it',
        );
    } else lease = await acquire(root, hooks);
    const loaded = await loadState(root, packageData),
      state = loaded.state;
    const orphanedTemporaries = (await controlTemporaries(root)).filter(
      (p) => p !== temporaryPath(STATE, state?.operation?.id ?? ''),
    );
    if (orphanedTemporaries.length)
      throw new AerError(
        `unowned journal temporaries require backup/inspection before manual removal: ${orphanedTemporaries.join(', ')}`,
      );
    await detectV5(
      root,
      [
        options.instructionsFile,
        state?.selection?.instructionsFile,
        state?.operation?.original?.block.path,
      ].filter(Boolean),
    );
    if (kind === 'uninstall' && !state)
      return output(
        kind,
        'not-installed',
        packageData,
        null,
        [],
        [],
        options.dryRun,
      );
    let prepared;
    const resuming = state?.status === 'pending';
    if (resuming) {
      recorded = true;
      operation = state.operation;
      if (
        operation.kind !== kind ||
        (kind === 'install' &&
          JSON.stringify(
            selection(options, operation.desired.selection, packageData),
          ) !== JSON.stringify(operation.desired.selection))
      )
        throw new AerError(
          'pending operation requires the same recorded request; inspect aer.lock.json',
          4,
          'interrupted',
        );
      if (
        operation.desired &&
        operation.desired.package.sourceIdentity !== packageData.sourceIdentity
      )
        throw new AerError(
          'resume using the package that created this pending operation',
          4,
          'interrupted',
        );
      if (!options.dryRun) {
        for (const action of operation.operations) {
          await assertLock(root, lease);
          await recoverTemporary(
            root,
            action.path,
            operation.id,
            action.afterBytes,
          );
        }
        await recoverTemporary(
          root,
          STATE,
          operation.id,
          operation.desired ? hash(jsonBytes(operation.desired)) : null,
        );
      }
      prepared = await prepare(
        root,
        packageData,
        operation,
        true,
        options.keepModified ?? operation.keepModified,
      );
      operation.retained = prepared.retained;
      operation.operations = operation.operations.filter(
        (action) => !operation.retained.includes(action.path),
      );
    } else {
      ({ op: operation, prepared } = await buildPlan(
        root,
        packageData,
        state,
        options,
        kind,
      ));
      operation = { id: randomUUID(), ...operation };
      for (const action of operation.operations) {
        const change = prepared.changes.find((c) => c.path === action.path),
          fileSnapshot =
            change?.snapshot ?? (await snapshot(root, action.path));
        action.beforeBytes = fileSnapshot ? hash(fileSnapshot.bytes) : null;
        const bytes = change ? change.bytes : (fileSnapshot?.bytes ?? null);
        action.afterBytes = bytes ? hash(bytes) : null;
      }
    }
    report = output(
      kind,
      options.dryRun
        ? 'preview'
        : kind === 'install'
          ? 'current'
          : 'uninstalled',
      packageData,
      operation.desired ?? operation.original,
      prepared.changes,
      prepared.retained,
      options.dryRun,
    );
    report.installedPackage = operation.original?.package ?? null;
    report.packageMatch = operation.original
      ? operation.original.package.sourceIdentity === packageData.sourceIdentity
      : null;
    report.pendingOperation = resuming
      ? { id: operation.id, kind: operation.kind }
      : null;
    if (options.dryRun) return report;
    await assertLock(root, lease);
    await guard(root, STATE, loaded.snapshot);
    if (
      !resuming &&
      kind === 'install' &&
      !prepared.changes.length &&
      state &&
      JSON.stringify(state) === JSON.stringify(operation.desired)
    )
      return report;
    let stateSnapshot = loaded.snapshot;
    if (!resuming) {
      await replace(
        root,
        STATE,
        jsonBytes({
          schemaVersion: 1,
          status: 'pending',
          operation: operation,
        }),
        stateSnapshot,
        { boundary: hooks.atomicBoundary },
      );
      recorded = true;
      stateSnapshot = await snapshot(root, STATE);
      await hooks.boundary?.('pending', operation);
    } else {
      for (const change of prepared.changes) {
        const action = operation.operations.find(
          (action) => action.path === change.path,
        );
        action.beforeBytes = change.snapshot
          ? hash(change.snapshot.bytes)
          : null;
        action.afterBytes = change.bytes ? hash(change.bytes) : null;
      }
      const projected = jsonBytes({
        schemaVersion: 1,
        status: 'pending',
        operation: operation,
      });
      if (!projected.equals(stateSnapshot.bytes)) {
        await replace(root, STATE, projected, stateSnapshot, {
          boundary: hooks.atomicBoundary,
        });
        stateSnapshot = await snapshot(root, STATE);
        await hooks.boundary?.('pending-projection', operation);
      }
    }
    for (const change of prepared.changes) {
      await hooks.beforeMutation?.(change, operation);
      await assertLock(root, lease);
      await guard(root, STATE, stateSnapshot);
      await replace(root, change.path, change.bytes, change.snapshot, {
        operationId: operation.id,
        boundary: hooks.atomicBoundary,
      });
      committedChanges.push({
        path: change.path,
        type: change.type,
        action: change.action,
      });
      await hooks.boundary?.(`mutation:${change.path}`, operation);
    }
    await assertLock(root, lease);
    await guard(root, STATE, stateSnapshot);
    const final = await prepare(
      root,
      packageData,
      operation,
      true,
      options.keepModified ?? operation.keepModified,
    );
    if (final.changes.length)
      throw new AerError(
        'payload changed before stable commit; pending operation retained',
        4,
        'interrupted',
      );
    await prune(
      root,
      operation.operations
        .filter((c) => c.after === null && c.type === 'file')
        .map((c) => c.path),
    );
    await hooks.boundary?.('pruned', operation);
    await assertLock(root, lease);
    await guard(root, STATE, stateSnapshot);
    await replace(
      root,
      STATE,
      operation.desired ? jsonBytes(operation.desired) : null,
      stateSnapshot,
      { operationId: operation.id, boundary: hooks.atomicBoundary },
    );
    await hooks.boundary?.('committed', operation);
    report.committedChanges = committedChanges;
    report.installedPackage = operation.desired?.package ?? null;
    report.packageMatch = operation.desired ? true : null;
    report.pendingOperation = null;
    return report;
  } catch (e) {
    if (recorded && e.exitCode !== 2) {
      e.exitCode = 4;
      e.status = 'interrupted';
    }
    const error =
      e instanceof AerError
        ? e
        : new AerError(e.message, 4, recorded ? 'interrupted' : 'error');
    Object.assign(error, {
      runningPackage: {
        version: packageData.pkg.version,
        sourceIdentity: packageData.sourceIdentity,
      },
      installedPackage: operation?.original?.package ?? null,
      plannedChanges: report?.plannedChanges ?? [],
      committedChanges,
      retained: report?.retained ?? [],
      pendingOperation:
        recorded && operation
          ? {
              id: operation.id,
              kind: operation.kind,
              desiredSelection: operation.desired?.selection ?? null,
            }
          : null,
    });
    throw error;
  } finally {
    if (lease)
      try {
        await release(root, lease);
      } catch (error) {
        Object.assign(error, {
          runningPackage: {
            version: packageData.pkg.version,
            sourceIdentity: packageData.sourceIdentity,
          },
          installedPackage: operation?.original?.package ?? null,
          plannedChanges: report?.plannedChanges ?? [],
          committedChanges,
          retained: report?.retained ?? [],
          pendingOperation:
            recorded && operation
              ? { id: operation.id, kind: operation.kind }
              : null,
        });
        throw error;
      }
  }
}
function output(command, status, pkg, state, changes, retained, dryRun) {
  const selected = state?.selection;
  return {
    schemaVersion: 1,
    command,
    status,
    exitCode: 0,
    runningPackage: {
      version: pkg.pkg.version,
      sourceIdentity: pkg.sourceIdentity,
    },
    installedPackage: state?.package ?? null,
    packageMatch: state
      ? state.package.sourceIdentity === pkg.sourceIdentity
      : null,
    plannedChanges: changes.map(({ path, type, action }) => ({
      path,
      type,
      action,
    })),
    committedChanges: [],
    retained,
    conflicts: [],
    notes: [
      ...(dryRun
        ? ['Read-only preview; the plan may become stale before installation.']
        : []),
      'Filesystem integrity does not certify client discovery, invocation or model behavior.',
    ],
    contextEstimates: selected
      ? estimates(
          pkg,
          selected,
          expectedFiles(pkg, selected),
          compose(kernelBody(pkg, selected)),
        )
      : null,
    pendingOperation: null,
  };
}
export const install = (options, hooks) => mutate('install', options, hooks);
export const uninstall = (options, hooks) =>
  mutate('uninstall', options, hooks);
