import { randomUUID } from 'node:crypto';
import { AerError, STATE, acquire, release, assertLock, snapshot, replace, guard, prune, lockSnapshot, targetRoot, hash, recoverTemporary,controlTemporaries,temporaryPath } from './fs-safe.mjs';
import { readPackage, selection, estimates, expectedFiles, kernelBody } from './payload.mjs';
import { loadState, jsonBytes } from './state.mjs';
import { buildPlan, prepare, detectV5 } from './plan.mjs';
import { compose } from './block.mjs';

export async function mutate(kind,options={},hooks={}) {
  const pkg=await readPackage(options.packageRoot),root=await targetRoot(options.target??process.cwd(),pkg.root);
  let lease, recorded=false, report, op;
  const committedChanges=[];
  try {
    if(options.dryRun) { if(await lockSnapshot(root)) throw new AerError('active or stale run lock; dry-run does not recover it'); }
    else lease=await acquire(root,hooks);
    const loaded=await loadState(root,pkg),state=loaded.state;
    const orphans=(await controlTemporaries(root)).filter(p=>p!==temporaryPath(STATE,state?.operation?.id??''));
    if(orphans.length)throw new AerError(`unowned journal temporaries require backup/inspection before manual removal: ${orphans.join(', ')}`);
    await detectV5(root,[options.instructionsFile,state?.selection?.instructionsFile,state?.operation?.original?.block.path].filter(Boolean));
    if(kind==='uninstall'&&!state) return output(kind,'not-installed',pkg,null,[],[],options.dryRun);
    let prepared;
    const resuming=state?.status==='pending';
    if(resuming) {
      recorded=true;op=state.operation;
      if(op.kind!==kind || (kind==='install' && JSON.stringify(selection(options,op.desired.selection,pkg))!==JSON.stringify(op.desired.selection))) throw new AerError('pending operation requires the same recorded request; inspect aer.lock.json',4,'interrupted');
      if(op.desired && op.desired.package.sourceIdentity!==pkg.sourceIdentity) throw new AerError('resume using the package that created this pending operation',4,'interrupted');
      if(!options.dryRun) {
        for(const a of op.operations) {await assertLock(root,lease);await recoverTemporary(root,a.path,op.id,a.afterBytes);}
        await recoverTemporary(root,STATE,op.id,op.desired?hash(jsonBytes(op.desired)):null);
      }
      prepared=await prepare(root,pkg,op,true,options.keepModified??op.keepModified);
      op.retained=prepared.retained;op.operations=op.operations.filter(a=>!op.retained.includes(a.path));
    } else {
      ({op,prepared}=await buildPlan(root,pkg,state,options,kind));
      op={id:randomUUID(),...op};
      for(const a of op.operations) {
        const change=prepared.changes.find(c=>c.path===a.path),s=change?.snapshot??await snapshot(root,a.path);
        a.beforeBytes=s?hash(s.bytes):null;
        const bytes=change?change.bytes:s?.bytes??null;a.afterBytes=bytes?hash(bytes):null;
      }
    }
    report=output(kind,options.dryRun?'preview':kind==='install'?'current':'uninstalled',pkg,op.desired??op.original,prepared.changes,prepared.retained,options.dryRun);
    report.installedPackage=op.original?.package??null;
    report.packageMatch=op.original?op.original.package.sourceIdentity===pkg.sourceIdentity:null;
    report.pendingOperation=resuming?{id:op.id,kind:op.kind}:null;
    if(options.dryRun) return report;
    await assertLock(root,lease); await guard(root,STATE,loaded.snapshot);
    if(!resuming && kind==='install' && !prepared.changes.length && state && JSON.stringify(state)===JSON.stringify(op.desired)) return report;
    let stateSnap=loaded.snapshot;
    if(!resuming) {
      await replace(root,STATE,jsonBytes({schemaVersion:1,status:'pending',operation:op}),stateSnap,{boundary:hooks.atomicBoundary});recorded=true;
      stateSnap=await snapshot(root,STATE);
      await hooks.boundary?.('pending',op);
    } else {
      for(const change of prepared.changes) {
        const a=op.operations.find(a=>a.path===change.path);
        a.beforeBytes=change.snapshot?hash(change.snapshot.bytes):null;a.afterBytes=change.bytes?hash(change.bytes):null;
      }
      const projected=jsonBytes({schemaVersion:1,status:'pending',operation:op});
      if(!projected.equals(stateSnap.bytes)) {
        await replace(root,STATE,projected,stateSnap,{boundary:hooks.atomicBoundary});stateSnap=await snapshot(root,STATE);await hooks.boundary?.('pending-projection',op);
      }
    }
    for(const change of prepared.changes) {
      await hooks.beforeMutation?.(change,op);
      await assertLock(root,lease); await guard(root,STATE,stateSnap);
      await replace(root,change.path,change.bytes,change.snapshot,{operationId:op.id,boundary:hooks.atomicBoundary});
      committedChanges.push({path:change.path,type:change.type,action:change.action});
      await hooks.boundary?.(`mutation:${change.path}`,op);
    }
    await assertLock(root,lease); await guard(root,STATE,stateSnap);
    const final=await prepare(root,pkg,op,true,options.keepModified??op.keepModified);
    if(final.changes.length)throw new AerError('payload changed before stable commit; pending operation retained',4,'interrupted');
    await prune(root,op.operations.filter(c=>c.after===null&&c.type==='file').map(c=>c.path));
    await hooks.boundary?.('pruned',op);
    await assertLock(root,lease); await guard(root,STATE,stateSnap);
    await replace(root,STATE,op.desired?jsonBytes(op.desired):null,stateSnap,{operationId:op.id,boundary:hooks.atomicBoundary});
    await hooks.boundary?.('committed',op);
    report.committedChanges=committedChanges;report.installedPackage=op.desired?.package??null;report.packageMatch=op.desired?true:null;report.pendingOperation=null;return report;
  } catch(e) {
    if(recorded && e.exitCode!==2) { e.exitCode=4;e.status='interrupted'; }
    const error=e instanceof AerError?e:new AerError(e.message,4,recorded?'interrupted':'error');
    Object.assign(error,{runningPackage:{version:pkg.pkg.version,sourceIdentity:pkg.sourceIdentity},installedPackage:op?.original?.package??null,plannedChanges:report?.plannedChanges??[],committedChanges,retained:report?.retained??[],pendingOperation:recorded&&op?{id:op.id,kind:op.kind,desiredSelection:op.desired?.selection??null}:null});
    throw error;
  } finally {
    if(lease)try {await release(root,lease);}catch(error) {
      Object.assign(error,{runningPackage:{version:pkg.pkg.version,sourceIdentity:pkg.sourceIdentity},installedPackage:op?.original?.package??null,plannedChanges:report?.plannedChanges??[],committedChanges,retained:report?.retained??[],pendingOperation:recorded&&op?{id:op.id,kind:op.kind}:null});throw error;
    }
  }
}
function output(command,status,pkg,state,changes,retained,dryRun) {
  const selected=state?.selection;
  return {schemaVersion:1,command,status,exitCode:0,runningPackage:{version:pkg.pkg.version,sourceIdentity:pkg.sourceIdentity},installedPackage:state?.package??null,packageMatch:state?state.package.sourceIdentity===pkg.sourceIdentity:null,plannedChanges:changes.map(({path,type,action})=>({path,type,action})),committedChanges:[],retained,conflicts:[],notes:[...(dryRun?['Read-only preview; the plan may become stale before installation.']:[]),'Filesystem integrity does not certify client discovery, invocation or model behavior.'],contextEstimates:selected?estimates(pkg,selected,expectedFiles(pkg,selected),compose(kernelBody(pkg,selected))):null,pendingOperation:null};
}
export const install = (options,hooks)=>mutate('install',options,hooks);
export const uninstall = (options,hooks)=>mutate('uninstall',options,hooks);
