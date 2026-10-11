import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,anonymous,write,timed,commit,get,list,seed,data,ok,denied,conflict,probe,projection} from './access-support.mjs';

export {manifest,preparationPlan};

async function manifest(f,revision=2){
 const value={schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,dataRevision:revision,snapshotId:randomUUID(),digest:'a'.repeat(64),recordCount:2};
 const c={...data(await get(f,'control/current','owner')),dataRevision:revision};await seed(f,'control/current',c);await seed(f,'publicStatus/current',projection(c));await seed(f,'preparationManifest/current',value);return value;
}
async function preparationPlan(f){
 const d=data(await get(f,'devices/'+f.device.uid,'owner')),r=data(await get(f,'roles/'+f.human.uid,'owner')),m=data(await get(f,'preparationManifest/current','owner')),id=randomUUID();
 const a={...d,preparedRoleRevision:r.revision,preparedDataRevision:m.dataRevision,preparedSnapshotId:m.snapshotId,preparedDigest:m.digest,preparationOperationId:id};
 const e={operationId:id,deviceUid:f.device.uid,humanUid:f.human.uid,roleRevision:r.revision,dataRevision:m.dataRevision,snapshotId:m.snapshotId,digest:m.digest,recordCount:m.recordCount};
 return{id,writes:[timed(f,'devices/'+f.device.uid,a,'preparedAt',true),timed(f,'preparationReceipts/'+id,e,'occurredAt',false)]};
}
async function stop(f,revision=1){const d=data(await get(f,'devices/'+f.device.uid,'owner')),s={...d,active:false,stopRevision:revision,stoppedAt:{$timestamp:new Date().toISOString()}};await seed(f,'devices/'+f.device.uid,s);await seed(f,'deviceStatus/'+f.device.uid,{active:false,stopRevision:revision,stoppedAt:s.stoppedAt});f.stopContext=s;return s;}
function quarantinePlan(f,{id=randomUUID(),sequence=1,stopRevision=1,sourceControlRevision=1,...overrides}={}){
 const e={schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,operationId:id,deviceUid:f.device.uid,humanUid:f.human.uid,sequence,sourceControlRevision,sourceDataRevision:1,sourceRoleRevision:1,stopRevision,stoppedAt:stopRevision>0?f.stopContext?.stoppedAt??null:null,observedAt:{$timestamp:'2026-01-01T00:00:00Z'},lastSyncedAt:{$timestamp:'2026-01-01T00:00:00Z'},event:{kind:'receptionObserved',targetId:randomUUID()},...overrides};
 return{id,event:e,paths:['quarantineEvents/'+id,'quarantineSequences/'+f.device.uid+'_'+sequence,'quarantineReceipts/'+id],writes:[timed(f,'quarantineEvents/'+id,e,'receivedAt',false),write(f,'quarantineSequences/'+f.device.uid+'_'+sequence,{operationId:id,deviceUid:f.device.uid,sequence},false),timed(f,'quarantineReceipts/'+id,{operationId:id,deviceUid:f.device.uid,status:'receivedForReview'},'receivedAt',false)]};
}
async function unchanged(f,paths,action){const before=await Promise.all(paths.map(p=>get(f,p,'owner')));await action();assert.deepEqual(await Promise.all(paths.map(p=>get(f,p,'owner'))),before);}
async function rejectPreparation(f,p,writes=p.writes,token=f.human.token){return unchanged(f,['devices/'+f.device.uid,'preparationReceipts/'+p.id],async()=>denied(await commit(f,writes,token)));}
async function rejectQuarantine(f,p,writes=p.writes,token=f.device.token,check=denied){return unchanged(f,p.paths,async()=>check(await commit(f,writes,token)));}
const replaceField=(writes,index,key,value)=>{const w=structuredClone(writes);w[index].update.fields[key]=typeof value==='number'?{integerValue:String(value)}:typeof value==='boolean'?{booleanValue:value}:{stringValue:value};return w;};

export async function recoveryCases(record){
 await record('C01','human acknowledges current role and manifest atomically and stale data can resume',async()=>{
  const f=await fixture('receptionist','operating'),m=await manifest(f);denied(await probe(f,'reception'));ok(await get(f,'preparationManifest/current'));const p=await preparationPlan(f);
  for(const w of p.writes)await rejectPreparation(f,p,[w]);ok(await commit(f,p.writes,f.human.token));ok(await probe(f,'reception'));
  const d=data(await get(f,'devices/'+f.device.uid,'owner'));assert.equal(d.preparedSnapshotId,m.snapshotId);assert.equal(d.preparedDigest,m.digest);
  ok(await get(f,'preparationReceipts/'+p.id,f.human.token));denied(await get(f,'preparationReceipts/'+p.id));denied(await list(f,'preparationReceipts'));
  await unchanged(f,['devices/'+f.device.uid,'preparationReceipts/'+p.id],async()=>conflict(await commit(f,p.writes,f.human.token)));
  await stop(f);denied(await get(f,'preparationReceipts/'+p.id,f.human.token));denied(await get(f,'preparationReceipts/'+p.id));
  return{normalHumanPreparationWrites:2,partialSubsetsDenied:2,staleDataResumed:true,replayDenied:true,stoppedPreparationResultDenied:true,actualLocalPersistenceTested:false};
 });
 await record('C02','preparation rejects wrong identity, versions, digest, count and privilege changes',async()=>{
  const f=await fixture('temporary','operating'),other=await fixture('temporary','operating');await manifest(f);const p=await preparationPlan(f);let count=0;
  for(const[i,key,v]of [[0,'preparedRoleRevision',99],[0,'preparedDataRevision',99],[0,'preparedDigest','b'.repeat(64)],[0,'active',false],[1,'humanUid',other.human.uid],[1,'deviceUid',other.device.uid],[1,'digest','b'.repeat(64)],[1,'recordCount',99],[1,'snapshotId',randomUUID()],[1,'extra','FAKE']]){await rejectPreparation(f,p,replaceField(p.writes,i,key,v));count++;}
  for(const token of [f.device.token,other.human.token,other.device.token]){await rejectPreparation(f,p,p.writes,token);count++;}
  return{forgedPreparationRequestsDenied:count,privilegeNotChanged:true};
 });
 await record('C03','manifest changes, stop and role expiry invalidate a prepared proposal',async()=>{
  const f=await fixture('receptionist','operating');await manifest(f);let p=await preparationPlan(f);await manifest(f,3);await rejectPreparation(f,p);let n=1;
  const d=data(await get(f,'devices/'+f.device.uid,'owner')),r=data(await get(f,'roles/'+f.human.uid,'owner'));
  for(const[path,changes]of [['devices/'+f.device.uid,{active:false}],['roles/'+f.human.uid,{active:false}],['roles/'+f.human.uid,{endsAt:{$timestamp:'2000-01-01T00:00:00Z'}}]]){
   p=await preparationPlan(f);const b=data(await get(f,path,'owner'));await seed(f,path,{...b,...changes});await rejectPreparation(f,p);await seed(f,path,b);n++;
  }
  await seed(f,'devices/'+f.device.uid,d);await seed(f,'roles/'+f.human.uid,r);const a=await preparationPlan(f),b=await preparationPlan(f),results=await Promise.all([commit(f,a.writes,f.human.token),commit(f,b.writes,f.human.token)]);
  assert.equal(results.filter(x=>x.status===200).length,1);conflict(results.find(x=>x.status!==200));return{staleOrLostAuthorityRequestsDenied:n,concurrentWinners:1};
 });
 await record('C04','role preparation and session renewal remain distinct, and preparation is per device',async()=>{
  const f=await fixture('receptionist','operating'),b=await anonymous(),original=data(await get(f,'devices/'+f.device.uid,'owner'));
  await seed(f,'devices/'+b.uid,{...original,deviceUid:b.uid});const r=data(await get(f,'roles/'+f.human.uid,'owner'));await seed(f,'roles/'+f.human.uid,{...r,role:'temporary',revision:2,receptionBaselineRevision:1});await manifest(f);
  const p=await preparationPlan(f);ok(await commit(f,p.writes,f.human.token));denied(await probe(f,'temporary'));
  const s=data(await get(f,'sessions/'+f.device.uid,'owner'));delete s.issuedAt;ok(await commit(f,[timed(f,'sessions/'+f.device.uid,{...s,revision:s.revision+1,roleRevision:2},'issuedAt',true)],f.human.token));ok(await probe(f,'temporary'));
  assert.equal(data(await get(f,'devices/'+b.uid,'owner')).preparedRoleRevision,1);assert.equal(data(await get(f,'devices/'+b.uid,'owner')).preparedDataRevision,1);
  const closed={...data(await get(f,'control/current','owner')),state:'closed'};await seed(f,'control/current',closed);await manifest(f,3);await rejectPreparation(f,await preparationPlan(f));
  return{roleChangeRootSeeded:true,normalRoleAndDataPreparation:true,sessionRenewalRequiredForPromotion:true,otherDeviceNotPrepared:true,closedPreparationDenied:true};
 });
 await record('C05','stopped device submits three immutable quarantine documents with every partial subset denied',async()=>{
  const f=await fixture('receptionist','operating');await stop(f);const p=quarantinePlan(f),before=await get(f,'receptionViews/FAKE-seat','owner');
  for(let mask=1;mask<7;mask++)await rejectQuarantine(f,p,p.writes.filter((_,i)=>mask&(1<<i)));
  ok(await commit(f,p.writes));const e=data(await get(f,p.paths[0],'owner'));assert.deepEqual(e.event,p.event.event);assert(e.receivedAt.$timestamp);assert.equal(e.stopRevision,1);assert.deepEqual(e.stoppedAt,f.stopContext.stoppedAt);
  const receipt=data(await get(f,p.paths[2]));assert.equal(receipt.status,'receivedForReview');assert.deepEqual(Object.keys(receipt).sort(),['deviceUid','operationId','receivedAt','status']);
  assert.equal(data(await get(f,'devices/'+f.device.uid,'owner')).active,false);assert.deepEqual(await get(f,'receptionViews/FAKE-seat','owner'),before);
  denied(await get(f,p.paths[0]));denied(await list(f,'quarantineEvents'));denied(await probe(f,'reception'));denied(await get(f,'receptionViews/FAKE-seat'));denied(await list(f,'receptionViews'));
  return{partialSubsetsDenied:6,quarantineWrites:3,stopPreserved:true,normalReceptionUnchanged:true,ownReceiptOnly:true};
 });
 await record('C06','lost response uses same result receipt, replay and duplicate sequence cannot create another record',async()=>{
  const f=await fixture('temporary','operating');await stop(f);const p=quarantinePlan(f);ok(await commit(f,p.writes));const result=await get(f,p.paths[2]);ok(result);
  await rejectQuarantine(f,p,p.writes,f.device.token,conflict);assert.deepEqual(await get(f,p.paths[2]),result);
  const duplicate=quarantinePlan(f,{sequence:1});await rejectQuarantine(f,duplicate,duplicate.writes,f.device.token,conflict);
  const other=await anonymous();denied(await get(f,p.paths[2],other.token));denied(await get(f,p.paths[2],f.human.token));denied(await list(f,'quarantineReceipts'));
  return{resultLookupAfterAssumedLostResponse:true,replayAndDuplicateSequenceDenied:2,otherIdentityAndListDenied:3,physicalQueueTested:false};
 });
 await record('C07','quarantine rejects forged binding, stop epoch, source envelope and content mutations',async()=>{
  const f=await fixture('receptionist','operating'),other=await fixture('owner','operating');await stop(f);const p=quarantinePlan(f);let n=0;
  for(const[i,key,v]of [[0,'humanUid',other.human.uid],[0,'deviceUid',other.device.uid],[0,'performanceId',other.show],[0,'environmentId','FAKE-other'],[0,'schemaVersion',99],[0,'stopRevision',2],[0,'sequence',0],[0,'sourceControlRevision',0],[0,'sourceControlRevision',99],[0,'sourceDataRevision',99],[0,'sourceRoleRevision',99],[0,'extra','FAKE'],[1,'operationId',randomUUID()],[2,'status','applied']]){await rejectQuarantine(f,p,replaceField(p.writes,i,key,v));n++;}
  for(const token of [other.device.token,f.human.token]){await rejectQuarantine(f,p,p.writes,token);n++;}
  const w=structuredClone(p.writes);w[0].update.fields.event.mapValue.fields.rawQr={stringValue:'FAKE-sensitive'};await rejectQuarantine(f,p,w);n++;
  const badStop=structuredClone(p.writes);badStop[0].update.fields.stoppedAt={timestampValue:'2000-01-01T00:00:00Z'};await rejectQuarantine(f,p,badStop);n++;
  ok(await commit(f,p.writes));for(const path of p.paths){denied(await commit(f,[write(f,path,{extra:'FAKE'},true)]));denied(await commit(f,[{delete:write(f,path,{}).update.name}]));}
  return{forgedRequestsDenied:n,updatesAndDeletesDenied:6,rawQRFieldDenied:true};
 });
 await record('C08','expired or revoked normal authority can only preserve records and another device stays active',async()=>{
  const f=await fixture('temporary','operating'),d=data(await get(f,'devices/'+f.device.uid,'owner')),s=data(await get(f,'sessions/'+f.device.uid,'owner')),r=data(await get(f,'roles/'+f.human.uid,'owner'));
  const b=await anonymous();await seed(f,'devices/'+b.uid,{...d,deviceUid:b.uid});const copy={...s,deviceUid:b.uid};delete copy.issuedAt;ok(await commit(f,[timed(f,'sessions/'+b.uid,copy,'issuedAt',false)],f.human.token));
  const p=quarantinePlan(f,{stopRevision:0});await rejectQuarantine(f,p);let cases=0;
  for(const[path,changes]of [['sessions/'+f.device.uid,{active:false}],['sessions/'+f.device.uid,{expiresAt:{$timestamp:'2000-01-01T00:00:00Z'}}],['roles/'+f.human.uid,{active:false}],['roles/'+f.human.uid,{endsAt:{$timestamp:'2000-01-01T00:00:00Z'}}],['roles/'+f.human.uid,{revision:2,receptionBaselineRevision:0}]]){
   const before=data(await get(f,path,'owner'));await seed(f,path,{...before,...changes});denied(await probe(f,'reception'));const q=quarantinePlan(f,{stopRevision:0,sequence:++cases});ok(await commit(f,q.writes));ok(await get(f,q.paths[2]));await seed(f,path,before);
  }
  await stop(f);ok(await commit(f,quarantinePlan(f,{sequence:++cases}).writes));ok(await probe({...f,device:b},'reception'));assert.equal(data(await get(f,'devices/'+b.uid,'owner')).active,true);
  const promoted=await fixture('receptionist','operating'),pr=data(await get(promoted,'roles/'+promoted.human.uid,'owner'));
  await seed(promoted,'roles/'+promoted.human.uid,{...pr,role:'temporary',revision:2,receptionBaselineRevision:1});ok(await probe(promoted,'reception'));
  await rejectQuarantine(promoted,quarantinePlan(promoted,{stopRevision:0}));
  return{expiredOrRevokedRecoveryCases:cases-1,activeDeviceUnchanged:true,ordinaryActiveQuarantineDenied:true,promotionBaselineCannotBypassNormalRoute:true};
 });
 await record('C09','changed state routes to review but closed state preserves data without automatic submission',async()=>{
  const f=await fixture('receptionist','operating'),before=await get(f,'receptionViews/FAKE-seat','owner');
  await seed(f,'control/current',{...f.control,revision:2});const stale=quarantinePlan(f,{stopRevision:0});ok(await commit(f,stale.writes));
  await seed(f,'control/current',{...f.control,state:'ended',revision:3});ok(await commit(f,quarantinePlan(f,{stopRevision:0,sequence:2,sourceControlRevision:3}).writes));denied(await probe(f,'reception'));
  await seed(f,'control/current',{...f.control,state:'closed',revision:4});await stop(f);const closed=quarantinePlan(f,{sequence:3,sourceControlRevision:4});await rejectQuarantine(f,closed);
  assert.deepEqual(await get(f,'receptionViews/FAKE-seat','owner'),before);ok(await get(f,stale.paths[2]));return{staleStateAndEndedQuarantineAccepted:2,closedAutomaticSubmissionDenied:true,normalFactsPreserved:true,managerClosedRecoveryApprovalTested:false};
 });
}
