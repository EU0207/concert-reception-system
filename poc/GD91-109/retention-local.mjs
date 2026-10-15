import fs from 'node:fs';import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {request,user,owner,trial,ok,metrics} from '../GD91-99/support.mjs';import {cleanup} from '../GD91-89/support.mjs';
import {setup} from '../GD91-108/setup.mjs';import {build} from '../GD91-104/geometry.mjs';import {preparePublication} from '../GD91-104/slide.mjs';import {collect} from '../GD91-104/collection.mjs';
import {createPendingShare,prepareShared} from '../GD91-94/pending.mjs';import {createReferences} from '../GD91-92/references.mjs';
import {editModels,intent,prepareEdit} from '../GD91-104/edit.mjs';
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['retention-local.mjs','../GD91-107/database.rules.json']),before=hashes();let clean,failure;const reports=[];
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('../GD91-107/database.rules.json',import.meta.url)))}));
 const f=await setup(2,1),m=f.manager,send=async(p,method,body)=>{const r=await user(p,m.device,method,body);assert.equal(r.status,200,'normal-request-failed:'+method+':'+p);return r.body;},read=p=>send(p,'GET'),head=await read('head');let fixed;
 const pending=createPendingShare({user:(s,p,method='GET',body)=>user(p,s.device,method,body),saveFixed:async p=>{fixed=structuredClone(p);}}),refs=createReferences({user,inspect:async()=>{throw Error('unused');}});
 const edit=intent('extend',f.models[0].section.sectionId,{dimension:'columns',count:1,reason:''}),candidate=editModels(f.models,edit);
 await refs.acquire(m,head);await build(send,'candidate',candidate);const p=prepareShared(m,'candidate',0,head,1);await pending.reserve(m,p);assert.deepEqual(fixed,p);
 async function blocked(generation){const meta=await read('generations/'+generation+'/meta');assert.equal((await user('generations/'+generation+'/meta',m.device,'PUT',{...meta,phase:'deleting',revision:meta.revision+1})).status,401);assert.deepEqual(await read('generations/'+generation+'/meta'),meta);}
 await blocked('layout');await blocked('candidate');reports.push({id:'R01',sourceAndCandidatePinnedBeforeSend:true,unresolvedDataNotCollected:true});
 // 確定成功後の応答を利用せず、同じ固定案から照会だけで再開する。
 ok(await user('',m.device,'PATCH',p.body));const resumed=JSON.parse(JSON.stringify(fixed));assert.equal((await pending.inspect(m,resumed)).state,'committed');reports.push({id:'R02',sameOperationIdRestored:true,committedResultRequeried:true,writeResendCount:0,localStore:'RAM serialization',physicalSocketDrop:false});
 await build(send,'replacement',candidate);const replacement=prepareShared(m,'replacement',1,head,1);await pending.reserve(m,replacement);ok(await user('',m.device,'PATCH',replacement.body));const shared=await read('sharedHead');
 const requests=metrics.userRequests;assert.equal((await pending.inspect(m,resumed)).state,'committed');assert.deepEqual(await read('sharedHead'),shared);assert(metrics.userRequests>requests);await pending.release(m,resumed);reports.push({id:'R03',oldResultRemainsQueryable:true,laterSharedHeadNotRewound:true});
 const generic=await preparePublication(read,send,m,'candidate');assert.equal((await user('',m.device,'PATCH',generic.publish(2))).status,401);await send('','PATCH',generic.cancel());
 const checked=await prepareEdit(read,send,m,'candidate',edit);const publication=checked.publish();assert.equal((await user('',m.device,'PATCH',publication)).status,200,'publication-failed');const operationId=publication.head.operationId;
 assert.equal((await read('head')).operationId,operationId);assert.equal((await read('operations/'+operationId)).generation,'candidate');await send('','PATCH',checked.complete());await blocked('layout');reports.push({id:'R04',publicationResultRetained:true,oldActiveDeviceReferenceProtectsBase:true,typedEditProofRequired:true});
 // 別の共有予約が旧基準を保持している間は、通常参照を解いても回収しない。
 await refs.release(m);await blocked('layout');await pending.release(m,replacement);await blocked('layout');
 const rebased=prepareShared(m,'replacement',2,await read('head'),1);await pending.reserve(m,rebased);ok(await user('',m.device,'PATCH',rebased.body));await pending.release(m,rebased);
 await collect(read,send,'layout');assert.equal((await read('generations/layout/meta')).phase,'deleted');reports.push({id:'R05',allReferencesRequiredBeforeCollection:true,sharedBaseAlsoProtectsGeneration:true,unreferencedOldGenerationCollected:true});
 await blocked('candidate');await blocked('replacement');reports.push({id:'R06',publishedAndSharedGenerationsProtected:true});
 await build(send,'cancelled',f.models);const cancelled=await preparePublication(read,send,m,'cancelled');await send('','PATCH',cancelled.cancel());await collect(read,send,'cancelled');assert.equal((await read('generations/cancelled/meta')).phase,'deleted');reports.push({id:'R07',explicitlyCancelledCandidateCollected:true});
}catch(e){failure={code:e.code??e.name,message:e.message};console.error(JSON.stringify(failure));process.exitCode=1;}finally{clean=await cleanup();}
assert.deepEqual(before,hashes());fs.writeFileSync(new URL('artifacts/retention-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,cleanup:clean,...(failure?{failure}:{}),localStore:'RAM serialization',realIndexedDbVerifiedHere:false,normalClosingVerified:false,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false},null,2)+'\n');console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup:clean}));
