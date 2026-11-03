'use strict';
// Static source verification; does not claim to replace browser/MySQL E2E testing.
const fs=require('fs'); const path=require('path');
const root=path.join(__dirname,'..','..');
const files=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(p.endsWith('.js')&&!p.includes('node_modules'))files.push(p);}}
walk(path.join(root,'frontend','js'));walk(path.join(__dirname,'..','src'));walk(path.join(__dirname,'..','scripts'));
let bad=0;
for(const file of files){const r=require('child_process').spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){bad++;console.error(`FAIL ${path.relative(root,file)}\n${r.stderr}`);}}
if(bad){console.error(`${bad} JavaScript file(s) failed syntax checks.`);process.exit(1);}console.log(`PASS: ${files.length} JavaScript files passed syntax checks.`);
