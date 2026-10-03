import {readFile,stat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../src/payload.mjs';
export async function validateLinks() {
 const errors=[];const files=['README.md','INSTALL.md','ADOPT.md','CONTRIBUTING.md','AGENTS.md','CLAUDE.md','SECURITY.md','CHANGELOG.md'];
 async function walk(dir){for(const e of await readdir(path.join(ROOT,dir),{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())await walk(p);else if(p.endsWith('.md'))files.push(p);}}await walk('docs');
 for(const file of files) {
  const text=await readFile(path.join(ROOT,file),'utf8');
  for(const m of text.matchAll(/\]\(([^)]+)\)/g)) {
   const target=m[1];if(/^(https?:|#)/.test(target))continue;
   const p=path.resolve(ROOT,path.dirname(file),target.split('#')[0]);
   try {await stat(p);}catch {errors.push(`${file}: unresolved link ${target}`);}
  }
 }
 return errors;
}
if(process.argv[1]?.endsWith('validate-links.mjs')){const errors=await validateLinks();console.log(JSON.stringify({linkErrors:errors}));if(errors.length)process.exitCode=1;}
