import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {request,user,owner,trial,ok} from '../GD91-99/support.mjs';
import {cleanup} from '../GD91-89/support.mjs';
import {setup} from '../GD91-108/setup.mjs';
import {build} from '../GD91-110/layout.mjs';
import {collect} from '../GD91-104/collection.mjs';
import {createPendingShare,prepareShared} from '../GD91-94/pending.mjs';

const files=['collection-local.mjs','../GD91-113/database.rules.json','../GD91-108/setup.mjs','../GD91-110/layout.mjs','../GD91-104/collection.mjs','../GD91-102/collection.mjs','../GD91-94/pending.mjs'];
const hashes=()=>sourceHashes(new URL('./',import.meta.url),files),before=hashes(),reports=[];let clean,failure,stage='setup',lastRequest=null;
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('../GD91-113/database.rules.json',import.meta.url)))}));
 const f=await setup(4,1),m=f.manager;
 const send=async(p,method,body)=>{lastRequest={path:p,method,patchPaths:p===''?Object.keys(body??{}):[]};const r=await user(p,m.device,method,body);ok(r);return r.body;},read=p=>send(p,'GET');
 const active=await read('head'),operation=await read('operations/'+active.operationId);
 stage='G01';let sent=0;
 await assert.rejects(()=>build(async(...args)=>{
  if(sent===3)throw new Error('injected-build-interruption');
  const r=await send(...args);sent++;return r;
 },'incomplete',f.models),/injected-build-interruption/);
 assert.equal((await read('generations/incomplete/meta')).phase,'building');
 await collect(read,send,'incomplete');
 assert.equal((await read('generations/incomplete/meta')).phase,'deleted');
 reports.push({id:'G01',partiallyBuiltUnpublishedGenerationCollected:true,normalPermission:true});

 stage='G02';await build(send,'interrupted',f.models);let cut=false;
 await assert.rejects(()=>collect(read,async(...args)=>{
  const r=await send(...args);
  if(args[1]==='DELETE'&&!cut){cut=true;throw new Error('injected-collection-response-loss');}
  return r;
 },'interrupted'),/injected-collection-response-loss/);
 assert.equal((await read('generations/interrupted/meta')).phase,'deleting');
 await collect(read,send,'interrupted');
 const collected=await owner(trial+'/generations/interrupted');
 assert.equal(collected.meta.phase,'deleted');
 for(const field of ['parts','ids','labels','indexes','sectionOrder','sections','geometry','refs'])assert(!collected[field]);
 reports.push({id:'G02',deletingGenerationResumed:true,allGeometryAndIndexesRemoved:true,injectedResponseLoss:true});

 stage='G03';const pending=createPendingShare({user:(s,p,method='GET',body)=>user(p,s.device,method,body),saveFixed:async()=>{}});
 await build(send,'delete-first',f.models);
 const p=prepareShared(m,'delete-first',0,active,1),meta=await read('generations/delete-first/meta');
 await send('generations/delete-first/meta','PUT',{...meta,phase:'deleting',revision:meta.revision+1});
 await assert.rejects(()=>pending.reserve(m,p),e=>e.code==='ERR_ASSERTION'&&e.actual===401);
 assert.equal(await owner(trial+'/generations/delete-first/refs'),null);
 assert.equal(await read('references/'+p.referenceId),null);
 await collect(read,send,'delete-first');
 reports.push({id:'G03',deletionWinsLateReservationRejected:true,noPartialPins:true});

 stage='G04';await build(send,'pin-first',f.models);
 const pinned=prepareShared(m,'pin-first',0,active,1);await pending.reserve(m,pinned);
 const pinnedMeta=await read('generations/pin-first/meta');
 assert.equal((await user('generations/pin-first/meta',m.device,'PUT',{...pinnedMeta,phase:'deleting',revision:pinnedMeta.revision+1})).status,401);
 assert.equal(await owner(trial+'/generations/pin-first/refs/'+pinned.referenceId),true);
 assert.deepEqual(await read('head'),active);assert.deepEqual(await read('operations/'+active.operationId),operation);
 reports.push({id:'G04',reservationWinsDeletionRejected:true,unresolvedPinRetained:true,publishedHeadAndOperationResultsUnchanged:true});
}catch(e){failure={stage,lastRequest,code:e.code??e.name,message:e.message};process.exitCode=1;console.error(JSON.stringify(failure));}
finally{clean=await cleanup();}
assert.deepEqual(before,hashes());
fs.writeFileSync(new URL('artifacts/collection-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,cleanup:clean,...(failure?{failure}:{}),executedRulesSource:'../GD91-113/database.rules.json',externalFirebaseConnected:false,fullBusinessFreeTierVerified:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({scope:'collection',groups:reports.length,failure:failure??null,cleanup:clean}));
