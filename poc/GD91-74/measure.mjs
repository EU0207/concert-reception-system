import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {install,digest} from './meter.mjs';
const meter=install();
// GD91-73の確定索引接続をそのまま使用し、Rulesを変更しない。
await import('../GD91-73/tests/transport-partials.mjs');
const t=await import('../GD91-73/tests/support.mjs');
const {data}=await import('../GD91-60/tests/transport.mjs');
const {assemble}=await import('../GD91-73/projection.mjs');
const sources=['meter.mjs','measure.mjs','../GD91-73/node_modules/.cache/firestore.rules','../GD91-73/projection.mjs','../GD91-73/tests/transport-partials.mjs','../GD91-73/tests/support.mjs','../GD91-69/tests/structure.mjs','../GD91-71/tests/initial-layout.mjs'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,digest(new URL(p,import.meta.url))]));
const sourceHashes=hashes(),reports=[];
try{
 for(const n of [10,500]){
  const start=Date.now(),prefix=String(n)+'/',phase=s=>meter.phase(prefix+s);
  phase('fixture');const f=await t.rawFixture();
  phase('initialize');await t.initialize(f);
  for(let i=0;i<2;i++){
   const options={rows:5,columns:n/10};
   phase('construction-'+i);
   if(i===0){await t.prepareFirst(f,options);phase('publish-'+i);await t.publish(f);}
   else await t.publishAdditional(f,options);
  }
  const groups=Array.from({length:Math.ceil(n/10)},()=>randomUUID());
  phase('register');for(let i=0;i<n;i++)await t.register(f,{groupId:n===500?groups[Math.floor(i/10)]:null});
  phase('allocation-plan');const o=await t.bulk(f,'autoAllocation');
  phase('allocation-proof');await t.prove(f,o);
  phase('allocation-confirm');await t.confirm(f,o);
  phase('reader-fixture');const reader=await t.reader(f);
  phase('public-download');let reads=0;
  const view=await assemble(async(kind,suffix,{optional=false}={})=>{
   reads++;const path=kind==='publication'?t.path(f,suffix):'sourceProofShows/'+f.show+'/sections/'+suffix;
   const r=await t.request(t.base+'/'+path,reader.device.token);
   if(optional&&(r.status===404||suffix.startsWith('sectionViews/')&&r.status===403))return null;
   t.ok(r);return data(r);
  });
  assert.equal(view.counts.seats,n);assert.equal(view.counts.assigned,n);assert.equal(view.sections.length,2);
  assert.equal(reads,2+2*2+2*5*Math.ceil(n/10/2)*2+3*n);
  phase('share');const draft=await t.draftPlan(f,{fixture:'FAKE',seatIds:f.models.flatMap(m=>m.seats.map(s=>s.seatId))});t.ok(await t.commit(draft.writes,f.manager.token));
  phase('recovery');const r=await t.request(t.base+'/'+t.path(f,'sharedDrafts/'+draft.id),f.manager.token);t.ok(r);assert.equal(data(r).operationId,draft.id);
  reports.push({people:n,seats:n,sections:2,publicDownloadGetRequests:reads,status:'passed',elapsedMs:Date.now()-start});console.log(JSON.stringify(reports.at(-1)));
 }
 const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);
 fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
 fs.writeFileSync(new URL('artifacts/measurement.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,...meter.result(),billingMeasured:false,rulesDependentReadsMeasured:false,sdkAndBrowserRerun:false,fullProductionWorkflow:false},null,2)+'\n');
}catch(e){fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/failed-'+Date.now()+'.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:hashes(),reports,...meter.result(),error:String(e)},null,2)+'\n');throw e;}
