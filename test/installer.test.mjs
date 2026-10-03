import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, symlink, link, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync,spawn } from 'node:child_process';
import { install, uninstall } from '../src/install.mjs';
import { check } from '../src/check.mjs';
import { STATE, RUN_LOCK, walk, hash, replace, snapshot, temporaryPath } from '../src/fs-safe.mjs';
import { readPackage } from '../src/payload.mjs';

const small={skills:['aer-implementing-features','aer-reviewing-changes']};
const childFixture=path.resolve('test/helpers/installer-child.mjs');
async function dir(t) {const d=await realpath(await mkdtemp(path.join(tmpdir(),'aer-v6-test-')));t.after(()=>rm(d,{recursive:true,force:true}));return d;}
async function file(root,p,bytes) {await mkdir(path.dirname(path.join(root,p)),{recursive:true});await writeFile(path.join(root,p),bytes);}
async function tree(root) {return Object.fromEntries(await Promise.all((await walk(root)).map(async p=>[p,hash(await readFile(path.join(root,p)))])));}
const refused=p=>assert.rejects(p,e=>e.exitCode===3);

test('vertical slice: both integrations, standalone resources, collision, read-only preview and idempotence',async t=>{
 const target=await dir(t);await file(target,'AGENTS.md','consumer\uFEFF');const before=await tree(target);
 const opts={target,...small,destinations:[{representation:'codex',path:'.agents/skills'},{representation:'claude-code',path:'.claude/skills'}]};
 const preview=await install({...opts,dryRun:true});assert.equal(preview.status,'preview');assert.deepEqual(await tree(target),before);
 assert.ok(preview.plannedChanges.some(c=>c.path==='.claude/agents/aer-code-reviewer.md'));
 await install(opts);assert.equal((await check({target})).status,'current');const installed=await tree(target);
 assert.match(await readFile(path.join(target,'.agents/skills/aer-reviewing-changes/agents/openai.yaml'),'utf8'),/allow_implicit_invocation: false/);
 const review=await readFile(path.join(target,'.claude/skills/aer-reviewing-changes/SKILL.md'),'utf8');assert.match(review,/disable-model-invocation: true/);assert.match(review,/context: "fork"/);
 assert.match(await readFile(path.join(target,'.claude/agents/aer-code-reviewer.md'),'utf8'),/tools: Read, Grep, Glob/);
 assert.equal((await install({target})).plannedChanges.length,0);assert.deepEqual(await tree(target),installed);
 await uninstall({target});assert.deepEqual(await tree(target),before);
 const collision='.agents/skills/aer-implementing-features/SKILL.md';const pkg=await readPackage();await file(target,collision,pkg.sources.get('skills/aer-implementing-features/SKILL.md'));
 const b=await tree(target);await refused(install({target,skills:['aer-implementing-features']}));assert.deepEqual(await tree(target),b);
});
test('consumer BOM, LF/CRLF and final newline survive updates, moves and uninstall',async t=>{
 for(const text of ['', '\uFEFF','notes','notes\n','\uFEFFnotes\r\n','\uFEFFnotes\r\nno final']) {
  const target=await dir(t);await file(target,'AGENTS.md',text);await install({target,skills:'none'});
  assert.match(await readFile(path.join(target,'AGENTS.md'),'utf8'),/UI-01/);
  await install({target,profile:'high-assurance'});await install({target,instructionsFile:'docs/instructions.md'});
  assert.equal(await readFile(path.join(target,'AGENTS.md'),'utf8'),text);
  await uninstall({target});assert.equal(await readFile(path.join(target,'AGENTS.md'),'utf8'),text);
 }
});
test('all/subset/none transitions and destination representation/path retirement preserve shared consumer bytes',async t=>{
 const target=await dir(t);await install({target});await file(target,'.agents/skills/consumer.md','keep');
 await install({target,...small,profile:'prototype',destinations:[{representation:'claude-code',path:'custom skills'}]});
 assert.equal((await check({target})).status,'current');assert.equal(await readFile(path.join(target,'.agents/skills/consumer.md'),'utf8'),'keep');
 await install({target,destinations:[{representation:'codex',path:'custom skills'}]});
 await assert.rejects(readFile(path.join(target,'.claude/agents/aer-code-reviewer.md')),{code:'ENOENT'});
 await install({target,skills:'none'});assert.equal((await check({target})).status,'current');await uninstall({target});
 assert.deepEqual(await tree(target),{'.agents/skills/consumer.md':hash('keep')});
});
test('owned drift and malformed blocks refuse without changes; keep-modified detaches exact material',async t=>{
 const target=await dir(t);await install({target,...small});
 const p='.agents/skills/aer-implementing-features/SKILL.md';await file(target,p,'edited');await file(target,'.agents/skills/aer-reviewing-changes/extra.mjs','consumer');
 let before=await tree(target);assert.equal((await check({target})).status,'drift');await refused(install({target}));await refused(uninstall({target}));assert.deepEqual(await tree(target),before);
 const report=await uninstall({target,keepModified:true});assert.ok(report.retained.includes(p));assert.ok(report.retained.some(x=>x.endsWith('extra.mjs')));assert.equal(await readFile(path.join(target,p),'utf8'),'edited');
 await assert.rejects(readFile(path.join(target,STATE)),{code:'ENOENT'});
 const other=await dir(t);await file(other,'AGENTS.md','<!-- aer:v6:start -->\nmissing end');before=await tree(other);await refused(install({target:other,skills:'none'}));assert.deepEqual(await tree(other),before);
 await file(other,'AGENTS.md',Buffer.from([0xff]));await refused(install({target:other,skills:'none'}));
});
test('complete inventory: omissions, extra entries, edited hashes and arbitrary deletion claims are rejected',async t=>{
 for(const edit of [s=>delete s.files[Object.keys(s.files)[0]],s=>s.files['consumer.txt']=s.files[Object.keys(s.files)[0]],s=>s.files[Object.keys(s.files)[0]].sha256='0'.repeat(64),s=>s.block.sha256='0'.repeat(64),s=>s.extra=true]) {
  const target=await dir(t);await install({target,...small});await file(target,'consumer.txt','precious');const state=JSON.parse(await readFile(path.join(target,STATE),'utf8'));edit(state);await file(target,STATE,JSON.stringify(state));
  const before=await tree(target);assert.equal((await check({target})).status,'invalid');await assert.rejects(uninstall({target,keepModified:true}),e=>e.exitCode===4);assert.deepEqual(await tree(target),before);
 }
});
test('portable unsafe paths, aliases, reserved paths, links and source-checkout destinations refuse',async t=>{
 const target=await dir(t);
 for(const p of ['../escape','/absolute','a/../b','a\\b','CON','NUL.txt','a:stream','dir.','dir ','aer.lock.json','.aer.run.lock','AGENTS.md']) await refused(install({target,destinations:[{representation:'portable',path:p}]}));
 for(const destinations of [[{representation:'codex',path:'Skills'},{representation:'portable',path:'skills'}],[{representation:'codex',path:'skills'},{representation:'portable',path:'skills/nested'}]]) await refused(install({target,destinations}));
 await file(target,'outside','same');await link(path.join(target,'outside'),path.join(target,'AGENTS.md'));await refused(install({target,skills:'none'}));await rm(path.join(target,'AGENTS.md'));
 const outside=await dir(t);await symlink(outside,path.join(target,'linked'),process.platform==='win32'?'junction':'dir');await refused(install({target,destinations:[{representation:'portable',path:'linked/skills'}]}));
 await refused(install({target:path.resolve('.'),skills:'none'}));
});
test('lock exclusion, replacement ownership, dry-run lock handling and check activity',async t=>{
 const target=await dir(t);let blocked;
 await assert.rejects(install({target,...small},{boundary:async name=>{if(name==='pending') {assert.equal((await check({target})).status,'active-install');await refused(install({target,...small}));await refused(install({target,...small,dryRun:true}));await file(target,RUN_LOCK,'replacement owner');blocked=true;}}}),e=>e.exitCode===4);
 assert.ok(blocked);assert.equal(await readFile(path.join(target,RUN_LOCK),'utf8'),'replacement owner');await rm(path.join(target,RUN_LOCK));await install({target,...small});
 const result=await check({target},{beforeFinalSnapshot:async()=>{await file(target,STATE,'changed');}});assert.equal(result.status,'unstable-snapshot');
});
test('check detects activity and changed snapshots from absent and pending states',async t=>{
 for(const pending of [false,true])for(const active of [false,true]) {
  const target=await dir(t);
  if(pending)await assert.rejects(install({target,skills:'none'},{boundary:n=>{if(n==='pending')throw Error('pause operation');}}));
  const result=await check({target},{beforeFinalSnapshot:async()=>{
   if(active)await file(target,RUN_LOCK,'new active mutator');
   else await install({target,skills:'none'});
  }});
  assert.equal(result.status,active?'active-install':'unstable-snapshot');assert.equal(result.exitCode,1);
 }
});
test('interruption after every boundary is recoverable for install, profile/path/representation moves and uninstall',async t=>{
 const discover=await dir(t);const names=[];await install({target:discover,...small},{boundary:n=>names.push(n)});await uninstall({target:discover});
 for(const stop of names) {
  const target=await dir(t);await file(target,'AGENTS.md','consumer');let thrown=false;
  await assert.rejects(install({target,...small},{boundary:n=>{if(n===stop){thrown=true;throw Error('injected');}}}));assert.ok(thrown);
  await install({target,...small});assert.equal((await check({target})).status,'current');await uninstall({target});assert.equal(await readFile(path.join(target,'AGENTS.md'),'utf8'),'consumer');
 }
 const move={...small,profile:'high-assurance',instructionsFile:'docs/guide.md',destinations:[{representation:'claude-code',path:'native skills'}]};
 const probe=await dir(t);await install({target:probe,...small});const boundaries=[];await install({target:probe,...move},{boundary:n=>boundaries.push(n)});
 for(const stop of boundaries) {
  const target=await dir(t);await file(target,'AGENTS.md','initial');await install({target,...small});
  await assert.rejects(install({target,...move},{boundary:n=>{if(n===stop)throw Error('move crash');}}));
  await install({target,...move});assert.equal((await check({target})).status,'current');assert.equal(await readFile(path.join(target,'AGENTS.md'),'utf8'),'initial');await uninstall({target});
 }
 const removal=[];await uninstall({target:probe},{boundary:n=>removal.push(n)});
 for(const stop of removal) {
  const target=await dir(t);await file(target,'AGENTS.md','initial');await install({target,...move});
  await assert.rejects(uninstall({target},{boundary:n=>{if(n===stop)throw Error('uninstall crash');}}));await uninstall({target});assert.deepEqual(await tree(target),{'AGENTS.md':hash('initial')});
 }
});
test('exact mutation snapshots protect a concurrent edit after earlier writes; state remains pending',async t=>{
 const target=await dir(t);let wrote=false;
 await assert.rejects(install({target,...small},{boundary:n=>{if(n.startsWith('mutation:'))wrote=true;},beforeMutation:async c=>{if(wrote)await file(target,c.path,'concurrent');}}),e=>e.exitCode===4);
 assert.equal(JSON.parse(await readFile(path.join(target,STATE),'utf8')).status,'pending');assert.equal((await check({target})).status,'interrupted');await assert.rejects(install({target,skills:'none'}),e=>e.exitCode===4);
});
test('stale and partial locks require explicit manual recovery; CRLF ownership preserves bytes',async t=>{
 const target=await dir(t);await file(target,RUN_LOCK,'');const before=await tree(target);await refused(install({target,skills:'none'}));await refused(install({target,skills:'none',dryRun:true}));assert.deepEqual(await tree(target),before);assert.equal((await check({target})).status,'active-install');
 await rm(path.join(target,RUN_LOCK));await install({target,skills:['aer-implementing-features']});
 const p='.agents/skills/aer-implementing-features/SKILL.md';await file(target,p,(await readFile(path.join(target,p),'utf8')).replace(/\n/g,'\r\n'));assert.equal((await check({target})).status,'current');const normalized=await tree(target);assert.equal((await install({target})).plannedChanges.length,0);assert.deepEqual(await tree(target),normalized);
});
test('consumer edits outside blocks survive interrupted move recovery and keep-modified uninstall recovery',async t=>{
 const target=await dir(t);await file(target,'AGENTS.md','before');await install({target,skills:'none'});
 await assert.rejects(install({target,instructionsFile:'moved.md'},{boundary:n=>{if(n==='pending')throw Error('stop before move');}}));
 const instructions=await readFile(path.join(target,'AGENTS.md'),'utf8');await file(target,'AGENTS.md','later edit\n'+instructions);
 await install({target});assert.equal(await readFile(path.join(target,'AGENTS.md'),'utf8'),'later edit\nbefore');
 await file(target,'moved.md','modified block removed by consumer');
 await assert.rejects(uninstall({target,keepModified:true},{boundary:n=>{if(n==='pending')throw Error('stop retention');}}));
 const report=await uninstall({target,keepModified:true});assert.ok(report.retained.includes('moved.md'));assert.equal(await readFile(path.join(target,'moved.md'),'utf8'),'modified block removed by consumer');
});
test('actual process kill after payload/state temporary sync leaves a recoverable pending operation',async t=>{
 for(const where of ['payload','commit']) {
  const target=await dir(t);
  const killed=spawnSync(process.execPath,[childFixture,where,target],{encoding:'utf8',windowsHide:true,timeout:20000});assert.notEqual(killed.status,0,killed.stdout+killed.stderr);
  assert.equal(JSON.parse(await readFile(path.join(target,STATE),'utf8')).status,'pending');assert.equal((await check({target})).status,'active-install');
  // Child termination is observed before this explicit manual stale-lock removal.
  await rm(path.join(target,RUN_LOCK));await install({target});assert.equal((await check({target})).status,'current');await uninstall({target});assert.deepEqual(await tree(target),{});
 }
});
test('atomic replacement never removes an unowned or externally replaced temporary file',async t=>{
 const target=await dir(t),id='00000000-0000-4000-8000-000000000000',temp=temporaryPath('file.md',id);await file(target,temp,'consumer temporary');
 await assert.rejects(replace(target,'file.md',Buffer.from('payload'),null,{operationId:id}));assert.equal(await readFile(path.join(target,temp),'utf8'),'consumer temporary');await rm(path.join(target,temp));
 await assert.rejects(replace(target,'file.md',Buffer.from('payload'),null,{operationId:id,boundary:async name=>{if(name==='temporary-synced'){await rm(path.join(target,temp));await file(target,temp,'external replacement');throw Error('changed');}}}));
 assert.equal(await readFile(path.join(target,temp),'utf8'),'external replacement');
});
test('two real mutator processes exclude one another and journal initialization interruption remains unowned',{timeout:30000},async t=>{
 const target=await dir(t);
 const child=spawn(process.execPath,[childFixture,'pending',target],{stdio:['pipe','pipe','pipe'],windowsHide:true});t.after(()=>{if(child.exitCode===null)child.kill();});
 const closed=new Promise(resolve=>child.once('close',resolve));let stderr='';child.stderr.on('data',d=>stderr+=d);
 await new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);child.stdout.off('data',ready);child.off('error',failed);child.off('exit',exited);error?reject(error):resolve();};
  const ready=d=>finish(d.toString().includes('READY')?null:Error('unexpected handshake'));
  const failed=error=>finish(error),exited=code=>finish(Error(`mutator exited before readiness (${code}): ${stderr}`));
  const timer=setTimeout(()=>finish(Error(`mutator readiness timed out: ${stderr}`)),20000);
  child.stdout.once('data',ready);child.once('error',failed);child.once('exit',exited);
 });
 const second=spawnSync(process.execPath,[path.resolve('src/cli.mjs'),'install','--target',target,'--json'],{encoding:'utf8',windowsHide:true});assert.equal(second.status,3,second.stdout+second.stderr);child.stdin.end('continue');assert.equal(await closed,0);assert.equal((await check({target})).status,'current');
 const interrupted=await dir(t);
 const r=spawnSync(process.execPath,[childFixture,'initialize',interrupted],{encoding:'utf8',windowsHide:true,timeout:20000});assert.notEqual(r.status,0);await rm(path.join(interrupted,RUN_LOCK));assert.equal((await check({target:interrupted})).status,'interrupted');await refused(install({target:interrupted,skills:'none'}));
 const remnants=(await walk(interrupted)).filter(p=>p.startsWith('aer.lock.json.aer-'));assert.equal(remnants.length,1);await rm(path.join(interrupted,remnants[0]));await install({target:interrupted,skills:'none'});assert.equal((await check({target:interrupted})).status,'current');
});
