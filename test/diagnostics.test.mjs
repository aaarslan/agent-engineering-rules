import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from '../src/payload.mjs';
import { walk,hash } from '../src/fs-safe.mjs';
const scripts={contrast:path.join(ROOT,'skills/aer-building-web-ui/scripts/contrast-check.mjs'),slop:path.join(ROOT,'skills/aer-verifying-work/scripts/slop-scan.mjs'),size:path.join(ROOT,'skills/aer-verifying-work/scripts/file-size-guard.mjs')};
test('standalone diagnostic help, invalid selectors, exact contrast and no-argument size reject are read-only',async t=>{
 const target=await realpath(await mkdtemp(path.join(tmpdir(),'aer-diagnostic-')));t.after(()=>rm(target,{recursive:true,force:true}));
 const run=(script,args)=>spawnSync(process.execPath,[script,...args],{cwd:target,encoding:'utf8',input:'{}',windowsHide:true,timeout:10000});
 for(const script of Object.values(scripts)) {const h=run(script,['--help']);assert.equal(h.status,0,h.stderr);assert.match(h.stdout,/Unchanged retries add no evidence/);assert.equal(run(script,['--unknown']).status,2);}
 assert.equal(run(scripts.size,[]).status,2);assert.deepEqual(await walk(target),[]);
 await writeFile(path.join(target,'app.js'),'const x=1;\n');let r=run(scripts.size,['--check','app.js']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/APPLICABLE-PASS/);
 r=run(scripts.contrast,['#000','#fff']);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/21(?:\.0+)?/);
 r=run(scripts.slop,['--file','missing.js']);assert.equal(r.status,2);assert.deepEqual(await walk(target),['app.js']);assert.equal(hash(await readFile(path.join(target,'app.js'))),hash('const x=1;\n'));
});
test('slop excludes known custom payloads, preserves authored dot-directory scope and allows explicit files',async t=>{
 const target=await realpath(await mkdtemp(path.join(tmpdir(),'aer-slop-scope-')));t.after(()=>rm(target,{recursive:true,force:true}));
 await mkdir(path.join(target,'team-skills'),{recursive:true});await mkdir(path.join(target,'.authored'),{recursive:true});
 await writeFile(path.join(target,'team-skills/payload.js'),'document.body.innerHTML = input;');
 await writeFile(path.join(target,'.authored/app.js'),'document.body.innerHTML = input;');
 await writeFile(path.join(target,'aer.lock.json'),JSON.stringify({schemaVersion:1,status:'stable',selection:{destinations:[{path:'team-skills'}]}}));
 const run=args=>spawnSync(process.execPath,[scripts.slop,...args],{cwd:target,encoding:'utf8',windowsHide:true});
 let r=run(['--root','.']);assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/\.authored\/app.js/);assert.doesNotMatch(r.stdout,/team-skills\/payload.js/);
 r=run(['--file','team-skills/payload.js']);assert.equal(r.status,1);assert.match(r.stdout,/team-skills\/payload.js/);
});

test('focused scanner exits reflect selected patterns, not omitted project graph checks', async t => {
 const target=await realpath(await mkdtemp(path.join(tmpdir(),'aer-focused-scan-')));
 t.after(()=>rm(target,{recursive:true,force:true}));
 const run=args=>spawnSync(process.execPath,[scripts.slop,...args],{cwd:target,encoding:'utf8'});
 await writeFile(path.join(target,'clean.js'),'const x = 1;\n');
 for(const args of [['--file','clean.js'],['--glob','*.js']]) {
  const r=run(args);assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/NOT-APPLICABLE category=project-wide-reference-checks/);
  assert.match(r.stdout,/APPLICABLE-PASS summary.*scope=partial-selector/);
 }
 // All are lexical leads, including a comment and intentionally sanitized HTML.
 for(const source of ['// innerHTML is mentioned here','element.innerHTML = "<b>static</b>";','element.innerHTML = sanitizeHtml(input);']) {
  await writeFile(path.join(target,'sink.js'),source);
  const r=run(['--file','sink.js']);assert.equal(r.status,1,r.stdout+r.stderr);
  assert.match(r.stdout,/PATTERN-MATCH category=html-sink-reference/);
  assert.doesNotMatch(r.stdout,/DETERMINISTIC-FINDING|unsafe-html-sink/);
 }
 await writeFile(path.join(target,'notes.txt'),'ordinary text');
 assert.equal(run(['--file','notes.txt']).status,3);
 assert.equal(run(['--file','absent.js']).status,2);
});

test('contrast rejects out-of-gamut OKLCH and reports only selected text contrast', () => {
 const run=args=>spawnSync(process.execPath,[scripts.contrast,...args],{encoding:'utf8'});
 for(const color of ['oklch(65% 0.4 30)','oklch(50% 0.4 260)']) {
  const r=run([color,'#fff']);assert.equal(r.status,2,r.stdout+r.stderr);
  assert.match(r.stderr,/out-of-sRGB-gamut/);assert.doesNotMatch(r.stdout,/PASS|ratio=/);
 }
 for(const color of ['oklch(0% 0 0)','oklch(100% 0 0)','oklch(48% 0.03 260)']) {
  const r=run([color,'#fff']);assert.ok([0,1].includes(r.status),r.stdout+r.stderr);
  assert.match(r.stdout,/ratio=/);
 }
 const r=run(['#777','#fff']);assert.equal(r.status,1);assert.match(r.stdout,/TEXT-CONTRAST-FAIL/);
 assert.doesNotMatch(r.stdout,/ACCESSIBILITY-FAIL/);
});

test('size overrides reject unsafe integers, infinity and malformed values', async t => {
 const target=await realpath(await mkdtemp(path.join(tmpdir(),'aer-size-input-')));
 t.after(()=>rm(target,{recursive:true,force:true}));await writeFile(path.join(target,'app.js'),'one\ntwo\n');
 const run=value=>spawnSync(process.execPath,[scripts.size,'--check','app.js'],{cwd:target,encoding:'utf8',env:{...process.env,FILE_SIZE_GUARD_THRESHOLD:value}});
 for(const value of ['9'.repeat(400),'9007199254740992','Infinity','NaN','0','-1','1.5','1e3',' 2']) {
  const r=run(value);assert.equal(r.status,2,r.stdout+r.stderr);assert.match(r.stderr,/positive safe integer/);
 }
 for(const value of ['1','9007199254740991']) assert.equal(run(value).status,0);
});

test('size distinguishes known, absent and unavailable Git baselines, including failed blob reads', async t => {
 const target=await realpath(await mkdtemp(path.join(tmpdir(),'aer-size-head-')));
 t.after(()=>rm(target,{recursive:true,force:true}));
 const git=args=>{const r=spawnSync('git',args,{cwd:target,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 // Copy the standalone tool so a tiny buffer can reproduce a real git-show failure.
 const { cp }=await import('node:fs/promises');
 const local=path.join(target,'diagnostic');await cp(path.dirname(scripts.size),local,{recursive:true});
 const configPath=path.join(local,'config/thresholds.json');const config=JSON.parse(await readFile(configPath,'utf8'));
 config.FILE_SIZE_GIT_MAX_BUFFER_BYTES=128;await writeFile(configPath,JSON.stringify(config));
 const run=file=>spawnSync(process.execPath,[path.join(local,'file-size-guard.mjs'),'--check',file],{cwd:target,encoding:'utf8',env:{...process.env,FILE_SIZE_GUARD_THRESHOLD:'2'}});
 await writeFile(path.join(target,'app.js'),'one\ntwo\nthree\n');
 let r=run('app.js');assert.equal(r.status,0);assert.match(r.stdout,/head-lines=unknown baseline=unavailable/);
 assert.doesNotMatch(r.stdout,/grew from 0/);
 git(['init','-q']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','initial']);
 r=run('app.js');assert.match(r.stdout,/head-lines=0 baseline=absent/);assert.match(r.stdout,/grew from 0 to 3/);
 git(['add','app.js']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','source']);
 r=run('app.js');assert.match(r.stdout,/head-lines=3 baseline=known/);
 await writeFile(path.join(target,'app.js'),'a\n'.repeat(100));git(['add','app.js']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','large baseline']);
 r=run('app.js');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/head-lines=unknown baseline=unavailable/);
 assert.match(r.stdout,/no Git baseline is available/);assert.doesNotMatch(r.stdout,/grew from 0/);
 // Literal pathspecs preserve filenames containing glob metacharacters.
 await writeFile(path.join(target,'a[1].js'),'one\n');git(['add','--','a[1].js']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','literal name']);
 r=run('a[1].js');assert.match(r.stdout,/head-lines=1 baseline=known/);
});
