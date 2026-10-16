import fs from 'node:fs';import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {request,user,owner,trial,ok} from '../GD91-99/support.mjs';import {cleanup} from '../GD91-89/support.mjs';
import {setup} from '../GD91-108/setup.mjs';import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {build as oldBuild} from '../GD91-110/layout.mjs';import {preparePublication} from '../GD91-104/slide.mjs';
import {collect} from '../GD91-104/collection.mjs';import {initialMeta} from '../GD91-102/layout-model.mjs';
import {createPendingShare,prepareShared} from '../GD91-94/pending.mjs';
import {generated} from './generate.mjs';import {build,snapshot} from './layout.mjs';
const files=['local.mjs','generate.mjs','layout.mjs','policy.mjs','../GD91-113/database.rules.json','../GD91-110/layout.mjs','../GD91-104/slide.mjs','../GD91-104/collection.mjs'];
const hashes=()=>sourceHashes(new URL('./',import.meta.url),files),before=hashes(),reports=[];let clean,failure,stage='setup';
const oldRules=JSON.parse(fs.readFileSync(new URL('../GD91-113/database.rules.json',import.meta.url)));
const apply=rules=>request('.settings/rules',{token:'owner',method:'PUT',body:rules}).then(ok);
function models(count,lines=1,axis='horizontal'){
 return Array.from({length:count},(_,i)=>{
  const rows=axis==='horizontal'?lines:1,columns=axis==='vertical'?lines:1;
  const model=createSection({name:'架空区画'+i,rows,columns,axis,seatOrder:'forward',stagePosition:'top',lines:Array.from({length:lines},(_,j)=>({name:'列'+j,prefix:'L'+j+'-',startNumber:1}))},{maxCells:4096});
  return numberInitial(model,Object.fromEntries(model.section.cells.map(c=>[c.row+','+c.column,'seat'])),{maxCells:4096});
 });
}
try{
 await apply(generated());const f=await setup(4,1),m=f.manager;
 const send=async(p,method,body)=>{const r=await user(p,m.device,method,body);ok(r);return r.body;},read=p=>send(p,'GET');
 async function publish(generation){const h=await read('head'),checked=await preparePublication(read,send,m,generation);const body=checked.publish(h.revision+1);await send('','PATCH',body);await send('','PATCH',checked.complete());return body;}
 for(const [id,ms] of [['B01',models(16)],['B02',models(1,256)],['B03',models(1,256,'vertical')]]){
  stage=id;await build(send,id,ms);await publish(id);const view=await snapshot(read,async()=>({rows:{}}));
  assert.equal(view.models.length,ms.length);assert.equal(Object.keys(view.cells).length,ms.reduce((n,x)=>n+x.section.cells.length,0));
  reports.push({id,normalSavePublishAndRead:true,sections:ms.length,numberingLines:ms[0].section.lineSettings.length});
 }
 stage='B04';const head=await read('head');
 const meta={...initialMeta(2,17),auditVersion:1,geometryCursor:0,lastGeometrySection:''};
 assert.equal((await user('generations/over-sections/meta',m.device,'PUT',meta)).status,401);
 assert.equal(await read('generations/over-sections/meta'),null);assert.deepEqual(await read('head'),head);
 reports.push({id:stage,direct17SectionDeclarationRejected:true,headPreserved:true});
 for(const [id,axis] of [['B05','horizontal'],['B06','vertical']]){
  stage=id;await assert.rejects(()=>oldBuild(send,id,models(1,257,axis)),e=>e.code==='ERR_ASSERTION'&&e.actual===401);
  assert.deepEqual(await read('head'),head);await collect(read,send,id);assert.equal((await read('generations/'+id+'/meta')).phase,'deleted');
  reports.push({id,direct257LineCreationRejected:true,failedCandidateCollected:true,headPreserved:true});
 }
 for(const [id,ms] of [['B07',models(17)],['B08',models(1,257)]]){
  stage=id;await apply(oldRules);await oldBuild(send,id,ms);const unreferenced=await owner(trial),h=await read('head');
  const checked=await preparePublication(read,send,m,id),body=checked.publish(h.revision+1),prepared=await owner(trial);
  await send('','PATCH',body);assert.equal((await read('head')).generation,id);
  await owner(trial,'PUT',prepared);await apply(generated());
  assert.equal((await user('',m.device,'PATCH',body)).status,401);assert.deepEqual(await read('head'),h);
  await assert.rejects(()=>collect(read,send,id),e=>e.code==='ERR_ASSERTION'&&e.actual===401);
  // 参照なしの旧候補を別の試験前提として復元し、回収だけを確認する。
  await owner(trial,'PUT',unreferenced);await collect(read,send,id);assert.equal((await read('generations/'+id+'/meta')).phase,'deleted');
  reports.push({id,oldRulesAcceptedSamePublication:true,newRulesRejectedSamePublication:true,unresolvedPinRetained:true,unreferencedLegacyCandidateCollected:true,ownerFixtureResetNotBusinessRelease:true});
 }
 for(const [id,ms] of [['B09',models(17)],['B10',models(1,257)]]){
  stage=id;await apply(oldRules);await oldBuild(send,id,ms);const unreferenced=await owner(trial),h=await read('head');
  const pending=createPendingShare({user:(s,p,method='GET',body)=>user(p,s.device,method,body),saveFixed:async()=>{}});
  const oldShared=await read('sharedHead'),p=prepareShared(m,id,oldShared?.revision??0,h,1);await pending.reserve(m,p);const prepared=await owner(trial);
  await send('','PATCH',p.body);assert.equal((await read('sharedHead')).generation,id);
  await owner(trial,'PUT',prepared);await apply(generated());
  assert.equal((await user('',m.device,'PATCH',p.body)).status,401);assert.deepEqual(await read('sharedHead'),oldShared);
  await assert.rejects(()=>collect(read,send,id),e=>e.code==='ERR_ASSERTION'&&e.actual===401);
  await owner(trial,'PUT',unreferenced);await collect(read,send,id);assert.equal((await read('generations/'+id+'/meta')).phase,'deleted');
  reports.push({id,oldRulesAcceptedSameSharedSave:true,newRulesRejectedSameSharedSave:true,unresolvedPinRetained:true,unreferencedLegacyCandidateCollected:true,ownerFixtureResetNotBusinessRelease:true});
 }
}catch(e){failure={stage,code:e.code??e.name,message:e.message};process.exitCode=1;console.error(JSON.stringify(failure));}
finally{clean=await cleanup();}
assert.deepEqual(before,hashes());
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/local-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,cleanup:clean,...(failure?{failure}:{}),policyApproval:'TECH-DD91-108-A, developer, 2026-10-17',externalFirebaseConnected:false,fullBusinessFreeTierVerified:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup:clean}));
