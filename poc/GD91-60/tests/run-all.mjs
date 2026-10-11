import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {budgets,comparison} from './budgets.mjs';

assert(!process.env.GD91_CASE,'Full proof requires no case filter');
const names=(await readdir(new URL('.',import.meta.url))).filter(n=>n.endsWith('.mjs')).sort();
const sources=['../firestore.rules','../firebase.json',...names,'../../GD91-39/firestore.rules','../../GD91-42/firestore.rules','../../GD91-59/firestore.rules','../../GD91-58/artifacts/business-handoff.json','../../GD91-49/codec.mjs','../../GD91-48/comparison.mjs','../../GD91-07/planner.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes();
for(const script of ['access-emulator.mjs','completion-emulator.mjs','joined-emulator.mjs']){
 const r=spawnSync(process.execPath,[new URL(script,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{stdio:'inherit'});
 if(r.status!==0)await writeFile(new URL('../artifacts/failed-run-'+Date.now()+'.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),script,exitCode:r.status,sourceHashes,endSourceHashes:await hashes()},null,2)+'\n');
 assert.equal(r.status,0,script);
}
const reports=[];
for(const file of ['emulator-summary.json','completion-summary.json','joined-summary.json']){
 const result=JSON.parse(await readFile(new URL('../artifacts/'+file,import.meta.url),'utf8'));assert(result.reports.every(r=>r.status==='passed'));reports.push(...result.reports);
}
assert.equal(reports.length,47);assert.equal(new Set(reports.map(r=>r.id)).size,47);
const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/integration-summary.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),runtime:{node:process.version},hashLineEndings:'LF',sourceHashes,endSourceHashes,budgets,comparison,scope:'GD91-35 A/B authorization and state-policy item joined to V1 source and publication. 26 A/B requests scenarios, 14 completion regression cases, 7 integration cases. No business C, manifest issuance, local persistence, real providers or real devices.',reports},null,2)+'\n');
console.log(JSON.stringify({scenarios:reports.length,passed:reports.length,sourceHashes:Object.keys(sourceHashes).length}));
