// Read-only CI evidence for cross-runtime Windows filesystem identity.
import {lstat,open} from 'node:fs/promises';
const select=s=>Object.fromEntries(['dev','ino','nlink','size','mtimeMs','birthtimeMs'].map(k=>[k,String(s[k])]));
for(const bigint of [false,true]) {
 const file='kernel/block.md',before=await lstat(file,{bigint}),h=await open(file,'r');
 try {
  const handle=await h.stat({bigint}),bytes=await h.readFile(),after=await lstat(file,{bigint});
  console.log(JSON.stringify({node:process.version,uv:process.versions.uv,platform:process.platform,bigint,before:select(before),handle:select(handle),after:select(after),bytes:bytes.length}));
 }finally{await h.close();}
}
