// Run the complete original safety/content/diagnostic suite on its byte-preserved
// v5 fixture in a disposable copy. None of these modules enters the v6 package.
import { mkdtemp, cp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../src/payload.mjs';
const temporary=await realpath(await mkdtemp(path.join(tmpdir(),'aer-v5-regressions-')));
try {
 await cp(path.join(ROOT,'test/fixtures/v5'),temporary,{recursive:true});
 const files=['build-distributions','validate-source','validate-public-content','aer','install-distribution','install-walkthrough','tool-contracts','guidance-regressions','hardening-regressions','validate-corpus','study-record'].map(n=>`tools/${n}.test.mjs`);
 const result=spawnSync(process.execPath,['--test',...files],{cwd:temporary,env:{...process.env,TMPDIR:await realpath(tmpdir())},stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;process.exitCode=result.status??1;
} finally {await rm(temporary,{recursive:true,force:true});}
