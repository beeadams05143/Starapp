import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
const out='dist';
const testing=process.env.BRANCH==='staging/uvm-intern-sandbox';
await rm(out,{recursive:true,force:true});
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const path of files){
  if(path.startsWith('.git')||path.startsWith('sql/')||path.endsWith('.test.mjs')||path==='scripts/build-publish.mjs'||path.startsWith('dist/'))continue;
  if(!testing&&(path==='scripts/test-role-switch.js'||path==='role-preview.html'||path==='role-preview.js'))continue;
  await mkdir(dirname(`${out}/${path}`),{recursive:true});
  await copyFile(path,`${out}/${path}`);
}
if(!testing){
  const path=`${out}/role-dashboard.js`;
  await writeFile(path,(await readFile(path,'utf8')).replace(/\s*\/\* TEST_ROLE_SWITCH_START \*\/[\s\S]*?\/\* TEST_ROLE_SWITCH_END \*\//,''));
  const model=`${out}/role-home-model.mjs`;
  await writeFile(model,(await readFile(model,'utf8')).replace(/,card\('View other roles'[^\n]*?'role-preview\.html'\)/,''));
}
console.log(`Prepared ${testing?'UVM testing':'production'} publish directory.`);
