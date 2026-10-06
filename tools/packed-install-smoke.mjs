import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile, cp, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ROOT } from '../src/payload.mjs';
import { walk,hash } from '../src/fs-safe.mjs';
const temporary=await realpath(await mkdtemp(path.join(tmpdir(),'aer-v6-packed-')));
const env={...process.env};delete env.NODE_TEST_CONTEXT;
const npm=process.env.npm_execpath;
if(!npm)throw Error('Run through npm run test:packed so the exact npm CLI is available.');
function command(script,args,cwd=temporary) {
 const r=spawnSync(process.execPath,[script,...args],{cwd,env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:16*1024*1024});
 if(r.error)throw r.error;return r;
}
function npmRun(args,cwd=ROOT){const r=command(npm,args,cwd);assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);}
async function directory(name){const {mkdir}=await import('node:fs/promises');const p=path.join(temporary,name);await mkdir(p,{recursive:true});return p;}
async function tree(root){return Object.fromEntries(await Promise.all((await walk(root)).map(async p=>[p,hash(await readFile(path.join(root,p)))])));}
try {
 const pack=npmRun(['pack','--ignore-scripts','--json','--pack-destination',temporary])[0];
 const names=pack.files.map(f=>f.path).sort();
 const expected=[...(await walk(ROOT)).filter(p=>['kernel/','skills/','integrations/','src/','schemas/'].some(prefix=>p.startsWith(prefix))),...['package.json','LICENSE','README.md','INSTALL.md','ADOPT.md','SECURITY.md','docs/capability-matrix.md','payload-manifest.json']].sort();
 assert.deepEqual(names,expected,'complete packed inventory must match explicit allowlist');
 assert.ok(!names.some(n=>/^(test|source|research|evals|tools|dist|\.github)\//.test(n)));
 const bytes=await readFile(path.join(temporary,pack.filename)),digest=createHash('sha512').update(bytes).digest('base64');assert.equal(pack.integrity,`sha512-${digest}`);
 const prefix=await directory('prefix'),cache=await directory('cache');
 npmRun(['install','--global','--prefix',prefix,'--cache',cache,'--offline','--ignore-scripts','--no-audit','--no-fund','--json',path.join(temporary,pack.filename)],temporary);
 const installed=path.join(prefix,process.platform==='win32'?'node_modules':'lib/node_modules','@aaarslan/aer'),cli=path.join(installed,'src/cli.mjs');
 for(const name of names.filter(p=>p.endsWith('.md'))) {
  const text=await readFile(path.join(installed,name),'utf8');
  for(const m of text.matchAll(/\]\(([^)]+)\)/g)) {
   if(/^(https?:|#)/.test(m[1]))continue;
   const resource=path.posix.normalize(path.posix.join(path.posix.dirname(name),m[1].split('#')[0]));
   assert.ok(names.includes(resource),`${name}: packed link escapes or is absent: ${m[1]}`);
  }
 }
 assert.equal(command(cli,['--version']).stdout.trim(),'6.0.1');await access(path.join(prefix,process.platform==='win32'?'aer.cmd':'bin/aer'));
 const pkg=JSON.parse(await readFile(path.join(installed,'package.json'),'utf8'));assert.equal(pkg.bin.aer,'src/cli.mjs');assert.equal(pkg.dependencies,undefined);assert.equal(pkg.scripts.postinstall,undefined);
 const consumer=await directory('consumer project');await writeFile(path.join(consumer,'AGENTS.md'),'\uFEFFconsumer\r\nno final');const original=await tree(consumer);
 function cliRun(args,code=0,target=consumer){const r=command(cli,[...args,'--target',target,'--json']);assert.equal(r.status,code,r.stdout+r.stderr);return JSON.parse(r.stdout);}
 const selected=['--destination','codex:.agents/skills','--destination','claude-code:.claude/skills'];
 cliRun(['install',...selected,'--dry-run']);assert.deepEqual(await tree(consumer),original);
 cliRun(['install',...selected]);assert.equal(cliRun(['check']).status,'current');const stable=await tree(consumer);assert.equal(cliRun(['install']).plannedChanges.length,0);assert.deepEqual(await tree(consumer),stable);
 cliRun(['install','--profile','high-assurance','--skills','aer-implementing-features,aer-reviewing-changes','--instructions-file','docs/contract.md','--destination','portable:custom skills']);assert.equal(cliRun(['check']).status,'current');assert.equal(await readFile(path.join(consumer,'AGENTS.md'),'utf8'),'\uFEFFconsumer\r\nno final');
 const modified=path.join(consumer,'custom skills/aer-implementing-features/SKILL.md'),owned=await readFile(modified);await writeFile(modified,'consumer edit');cliRun(['check'],1);const drift=await tree(consumer);cliRun(['install'],3);cliRun(['uninstall'],3);assert.deepEqual(await tree(consumer),drift);await writeFile(modified,owned);
 const {install}=await import(pathToFileURL(path.join(installed,'src/install.mjs')));
 await assert.rejects(install({target:consumer,profile:'prototype'},{boundary:n=>{if(n.startsWith('mutation:'))throw Error('packed interruption');}}));assert.equal(cliRun(['check'],1).status,'interrupted');cliRun(['install']);assert.equal(cliRun(['check']).status,'current');
 const beforeUninstall=await tree(consumer);cliRun(['uninstall','--dry-run']);assert.deepEqual(await tree(consumer),beforeUninstall);cliRun(['uninstall']);assert.deepEqual(await tree(consumer),original);assert.equal(cliRun(['check'],1).status,'not-installed');
 const collision=await directory('collision');await cp(path.join(installed,'skills/aer-implementing-features'),path.join(collision,'.agents/skills/aer-implementing-features'),{recursive:true});const b=await tree(collision);cliRun(['install','--skills','aer-implementing-features'],3,collision);assert.deepEqual(await tree(collision),b);
 // The exact audited v5 fixture is packed locally, never downloaded or adopted.
 const v5=await directory('v5 package');await cp(path.join(ROOT,'test/fixtures/v5'),v5,{recursive:true});const oldPack=npmRun(['pack','--ignore-scripts','--json','--pack-destination',temporary],v5)[0];
 const v5Prefix=await directory('v5 prefix');npmRun(['install','--global','--prefix',v5Prefix,'--cache',cache,'--offline','--ignore-scripts','--no-audit','--no-fund','--json',path.join(temporary,oldPack.filename)],temporary);
 const oldCli=path.join(v5Prefix,process.platform==='win32'?'node_modules':'lib/node_modules','@aaarslan/aer/tools/aer.mjs');
 const legacy=await directory('v5 consumer');await writeFile(path.join(legacy,'AGENTS.md'),'consumer v5');
 let r=command(oldCli,['init','--host','codex','--target',legacy]);assert.equal(r.status,0,r.stdout+r.stderr);cliRun(['install','--skills','none'],3,legacy);
 r=command(oldCli,['doctor','--target',legacy,'--json']);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).status,'current');
 r=command(oldCli,['uninstall','--target',legacy,'--dry-run']);assert.equal(r.status,0,r.stdout+r.stderr);
 const edited=path.join(legacy,'.agents/skills/feature/SKILL.md'),oldOwned=await readFile(edited);await writeFile(edited,'modified v5');r=command(oldCli,['uninstall','--target',legacy]);assert.notEqual(r.status,0);
 await writeFile(path.join(temporary,'v5-modified-backup.md'),'modified v5');await writeFile(edited,oldOwned);
 r=command(oldCli,['uninstall','--target',legacy]);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(await readFile(path.join(legacy,'AGENTS.md'),'utf8'),'consumer v5');
 cliRun(['install','--skills','none'],0,legacy);cliRun(['uninstall'],0,legacy);
 const record={package:'@aaarslan/aer@6.0.1',node:process.versions.node,npm:process.env.npm_config_user_agent??'unknown',platform:process.platform,arch:process.arch,files:pack.files.length,unpackedBytes:pack.unpackedSize,integrity:pack.integrity,sha256:hash(bytes),v5Integrity:oldPack.integrity,checks:['complete inventory','isolated npm prefix','preview/install/check/idempotence','selection/instruction/destination moves','collision/drift refusal','packed interruption/resume','uninstall preservation','pinned packed v5 exit']};
 console.log(JSON.stringify(record,null,2));
 if(process.env.AER_EVIDENCE_FILE)await writeFile(process.env.AER_EVIDENCE_FILE,JSON.stringify(record,null,2)+'\n');
} finally {await rm(temporary,{recursive:true,force:true});}
