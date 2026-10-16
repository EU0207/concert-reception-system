import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {collect} from '../GD91-104/collection.mjs';
const reports=[];
for(const sections of [16,4096]){
 let meta={phase:'ready',revision:1,expectedParts:256,expectedSections:sections},requests=0;
 const read=async p=>{
  requests++;
  if(p==='generations/candidate/meta')return structuredClone(meta);
  if(p.includes('/sectionOrder/'))return 'section-'+p.split('/').at(-1);
  if(p.includes('/parts/'))return {slots:Object.fromEntries(Array.from({length:16},(_,i)=>['s'+i,{id:'fake-'+i,kind:'unset'}]))};
  throw Error('unexpected-read');
 };
 const send=async(p,method,body)=>{
  requests++;
  if(p==='generations/candidate/meta')meta=structuredClone(body);
  for(const path of p?[p]:Object.keys(body))assert(path.startsWith('generations/candidate/')||path==='sectionViews/candidate','operation-results-must-not-be-collected');
 };
 await collect(read,send,'candidate');
 assert.equal(requests,6+2*256+4*sections);assert.equal(meta.phase,'deleted');
 reports.push({sections,parts:256,requests,operationResultsNotTargeted:true,normalPermissionOrRulesVerified:false});
}
const paths=['collection-budget.mjs','../GD91-104/collection.mjs','../GD91-102/collection.mjs'];
const sourceHashes=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
fs.writeFileSync(new URL('artifacts/collection-budget-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:sourceHashes,reports,method:'Real collector called with RAM read/send counters; not server acceptance or billable traffic.',externalFirebaseConnected:false,productionImplementation:false,tested3000:false},null,2)+'\n');
console.log(JSON.stringify({modelRequests:reports.map(x=>x.requests),externalFirebaseConnected:false}));
