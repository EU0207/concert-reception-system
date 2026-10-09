import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {base,request,fixture,anonymous,write,timed,commit,get,list,seed,data,ok,denied,conflict,projection,probe} from './support.mjs';

const seatId='FAKE-seat';
const factPath='seatFacts/'+seatId,viewPath='receptionViews/'+seatId;
export async function setup(role='temporary',state='operating'){
 const f=await fixture(role,state);
 f.fact={schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,...f.seat,internalTag:'FAKE-management-only',revision:1,operationId:'',actorUid:'',controlRevision:1,dataRevision:1};
 await seed(f,factPath,f.fact);
 await seed(f,viewPath,{...f.seat,sourceRevision:1,dataRevision:1,operationId:''});
 return f;
}
// 案は臨時管理者も取得できる公開文書だけから作る。管理用正本は読まない。
export async function namePlan(f,value='架空変更'){
 const vr=await get(f,viewPath),cr=await get(f,'publicStatus/current');ok(vr);ok(cr);
 const v=data(vr),c=data(cr),id=randomUUID(),nextRevision=v.sourceRevision+1,nextData=c.dataRevision+1;
 const fact={seatDisplayName:value,revision:nextRevision,operationId:id,actorUid:f.human.uid,controlRevision:c.revision+1,dataRevision:nextData};
 const control={revision:c.revision+1,dataRevision:nextData,dataSeatId:seatId,operationId:id};
 const view={...v,seatDisplayName:value,sourceRevision:nextRevision,dataRevision:nextData,operationId:id};
 const event={operationId:id,kind:'seatDisplayNameChange',seatId,actorUid:f.human.uid,deviceUid:f.device.uid,beforeRevision:v.sourceRevision,afterRevision:nextRevision,controlRevision:control.revision,dataRevision:nextData};
 const patch=(path,x)=>({...write(f,path,x,true),updateMask:{fieldPaths:Object.keys(x)}});
 const eventPath=`dayEvents/${f.human.uid}/entries/${id}`;
 return{id,eventPath,writes:[patch(factPath,fact),write(f,viewPath,view,true),timed(f,eventPath,event,'occurredAt',false),patch('control/current',control),write(f,'publicStatus/current',projection({...c,...control}),true)]};
}
async function snapshot(f,p){return Promise.all([factPath,viewPath,p.eventPath,'control/current','publicStatus/current'].map(path=>get(f,path,'owner')));}
async function rejected(f,p,w=p.writes,token=f.device.token,check=denied){const before=await snapshot(f,p);check(await commit(f,w,token));assert.deepEqual(await snapshot(f,p),before);}
function change(w,index,key,value){const out=structuredClone(w);out[index].update.fields[key]=typeof value==='number'?{integerValue:String(value)}:{stringValue:value};return out;}
const ownList=(f,uid=f.human.uid,limit=100)=>request(`${base}/splitSeatShows/${f.show}/dayEvents/${uid}:runQuery`,f.device.token,'POST',{structuredQuery:{from:[{collectionId:'entries'}],...(limit===null?{}:{limit})}});

export async function publicationCases(record){
 await record('D01','source, public view, own event and data version publish atomically',async()=>{
  for(const role of ['owner','deputy','temporary']){
   const f=await setup(role),p=await namePlan(f);if(role==='temporary'){denied(await get(f,factPath));denied(await list(f,'seatFacts'));}
   ok(await commit(f,p.writes));const fact=data(await get(f,factPath,'owner')),view=data(await get(f,viewPath));
   assert.equal(fact.seatDisplayName,view.seatDisplayName);assert.equal(fact.revision,view.sourceRevision);assert.equal(fact.internalTag,'FAKE-management-only');
   assert(!Object.hasOwn(view,'internalTag')&&!Object.hasOwn(view,'actorUid'));assert.equal(Object.keys(view).length,9);
   assert.equal(fact.dataRevision,2);assert.equal(data(await get(f,'publicStatus/current')).dataRevision,2);
   const event=data(await get(f,p.eventPath));assert.equal(event.actorUid,f.human.uid);assert.equal(event.deviceUid,f.device.uid);assert(event.occurredAt.$timestamp);
   assert(!Object.hasOwn(event,'seatDisplayName'));assert.equal(fact.seatNumber,'A-1');assert.equal(fact.emergencyReason,f.seat.emergencyReason);
  }
  const owner=await setup('owner','preparing');ok(await commit(owner,(await namePlan(owner)).writes));
  const general=await setup('receptionist');await rejected(general,await namePlan(general));
  const temporary=await setup('temporary','preparing');await rejected(temporary,await namePlan(temporary));
  return{rolesPublished:3,preparingOwnerAllowed:true,preparingTemporaryDenied:true,generalDenied:true,writesPerCommit:5,proposalUsesNormalPublicReadsOnly:true};
 });
 await record('D02','all partial subsets and forged projection or event proposals are rejected',async()=>{
  const f=await setup(),p=await namePlan(f);
  for(let mask=1;mask<31;mask++)await rejected(f,p,p.writes.filter((_,i)=>mask&(1<<i)));
  let forged=0;
  for(const[index,key,value]of [[0,'revision',99],[0,'controlRevision',99],[0,'dataRevision',99],[0,'actorUid','FAKE-other'],[1,'seatDisplayName','架空偽装'],[1,'seatNumber','Z-99'],[1,'internalTag','FAKE-private'],[2,'actorUid','FAKE-other'],[2,'deviceUid','FAKE-other'],[2,'beforeRevision',99],[2,'kind','authAudit'],[2,'seatDisplayName','架空非公開'],[3,'dataRevision',99],[3,'revision',99],[4,'dataRevision',99]]){
   await rejected(f,p,change(p.writes,index,key,value));forged++;
  }
  const internal=structuredClone(p.writes);internal[0].update.fields.internalTag={stringValue:'FAKE-forged'};internal[0].updateMask.fieldPaths.push('internalTag');await rejected(f,p,internal);forged++;
  const path=structuredClone(p.writes);path[2].update.name=path[2].update.name.replace(f.human.uid,'FAKE-other');await rejected(f,p,path);forged++;
  const source=structuredClone(p.writes);source[0].update.fields.seatNumber={stringValue:'Z-99'};source[0].updateMask.fieldPaths.push('seatNumber');await rejected(f,p,source);forged++;
  ok(await commit(f,p.writes));denied(await commit(f,[write(f,p.eventPath,{operationId:p.id},true)]));denied(await commit(f,[{delete:p.writes[2].update.name,currentDocument:{exists:true}}]));
  return{partialSubsetsDenied:30,forgedRequestsDenied:forged,eventUpdateAndDeleteDenied:2,unchangedAfterRejectedWrites:true};
 });
 await record('D03','concurrent publication has one winner and response uncertainty uses own event lookup',async()=>{
  const f=await setup(),a=await namePlan(f,'架空甲'),b=await namePlan(f,'架空乙');
  const results=await Promise.all([commit(f,a.writes),commit(f,b.writes)]);assert.equal(results.filter(x=>x.status===200).length,1);conflict(results.find(x=>x.status!==200));
  const winner=results[0].status===200?a:b;ok(await get(f,winner.eventPath));await rejected(f,winner,winner.writes,f.device.token,conflict);
  const events=await ownList(f);ok(events);assert.equal(events.body.filter(x=>x.document).length,1);assert.equal(data(await get(f,factPath,'owner')).revision,2);
  return{concurrentWinners:1,eventCount:1,replayRejected:true,ownEventLookupAfterCommit:true,SDKResponseLossSimulated:false};
 });
 await record('D04','temporary staff can get and list only their own curated day events',async()=>{
  const f=await setup(),p=await namePlan(f);ok(await commit(f,p.writes));ok(await get(f,p.eventPath));ok(await ownList(f));
  for(const limit of [null,101])denied(await ownList(f,f.human.uid,limit));ok(await ownList(f,f.human.uid,1));
  const otherUid='FAKE-other-person',otherPath=`dayEvents/${otherUid}/entries/${randomUUID()}`;
  await seed(f,otherPath,{kind:'seatDisplayNameChange',actorUid:otherUid});denied(await get(f,otherPath));denied(await ownList(f,otherUid));
  denied(await get(f,'managementHistory/FAKE-history'));denied(await get(f,'sharedDrafts/FAKE-draft'));
  denied(await request(`${base}:runQuery`,f.device.token,'POST',{structuredQuery:{from:[{collectionId:'entries',allDescendants:true}],limit:100}}));
  const foreign=await setup();denied(await get(f,p.eventPath,foreign.device.token));denied(await get(f,p.eventPath,f.human.token));
  const second=await anonymous(),device=data(await get(f,'devices/'+f.device.uid,'owner'));
  await seed(f,'devices/'+second.uid,{...device,deviceUid:second.uid});const session={...f.session,deviceUid:second.uid};
  ok(await commit(f,[timed(f,'sessions/'+second.uid,session,'issuedAt',false)],f.human.token));ok(await get(f,p.eventPath,second.token));
  for(const role of ['owner','deputy']){const m=await setup(role);const path=`dayEvents/${otherUid}/entries/${randomUUID()}`;await seed(m,path,{kind:'seatDisplayNameChange',actorUid:otherUid});ok(await get(m,path));ok(await ownList(m,otherUid));}
  const general=await setup('receptionist');const gp=`dayEvents/${general.human.uid}/entries/${randomUUID()}`;await seed(general,gp,{actorUid:general.human.uid});denied(await get(general,gp));denied(await ownList(general));
  return{ownGetAndListAllowed:true,otherPersonAndCrossPerformanceDenied:true,collectionGroupDenied:true,unboundedAndOversizedDenied:2,samePersonSecondDeviceAllowed:true,managersOtherHistoryAllowed:true,generalHistoryDenied:true};
 });
 await record('D05','end, close and current revocation apply to day history and publication',async()=>{
  for(const state of ['preparing','ended','closed']){const f=await setup('temporary'),p=await namePlan(f);ok(await commit(f,p.writes));await seed(f,'control/current',{...data(await get(f,'control/current','owner')),state});(state==='ended'?ok:denied)(await get(f,p.eventPath));(state==='ended'?ok:denied)(await ownList(f));}
  for(const state of ['ended','closed'])for(const role of ['owner','temporary']){const f=await setup(role),p=await namePlan(f);await seed(f,'control/current',{...f.control,state});await rejected(f,p);}
  let revoked=0;const f=await setup(),p=await namePlan(f);ok(await commit(f,p.writes));
  // 次の提案の準備データ版だけを検査用経路で揃え、失効条件を独立に試す。
  const d=data(await get(f,'devices/'+f.device.uid,'owner'));await seed(f,'devices/'+f.device.uid,{...d,preparedDataRevision:2});const next=await namePlan(f,'架空再変更');
  for(const[path,delta]of [['devices/'+f.device.uid,{active:false}],['sessions/'+f.device.uid,{active:false}],['sessions/'+f.device.uid,{expiresAt:{$timestamp:'2000-01-01T00:00:00Z'}}],['roles/'+f.human.uid,{active:false}],['roles/'+f.human.uid,{endsAt:{$timestamp:'2000-01-01T00:00:00Z'}}],['roles/'+f.human.uid,{revision:2}],['roles/'+f.human.uid,{role:'receptionist',revision:2}]]){
   const before=data(await get(f,path,'owner'));await seed(f,path,{...before,...delta});denied(await get(f,p.eventPath));denied(await ownList(f));await rejected(f,next);await seed(f,path,before);revoked++;
  }
  // 昇格前の一般準備だけでは臨時履歴・更新を許可しない。
  const r=data(await get(f,'roles/'+f.human.uid,'owner'));await seed(f,'roles/'+f.human.uid,{...r,revision:2,receptionBaselineRevision:1});denied(await get(f,p.eventPath));await rejected(f,next);
  return{endedOwnHistoryReadable:true,preparingAndClosedTemporaryHistoryDenied:true,postPerformanceDirectPublicationDenied:4,revocationConditions:revoked,promotionBaselineDenied:true,actualStopOperationTested:false};
 });
 await record('D06','publication invalidates prepared data and rejects an old manifest acknowledgement',async()=>{
  const f=await setup(),p=await namePlan(f),snapshotId=randomUUID(),digest='a'.repeat(64);
  await seed(f,'preparationManifest/current',{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,dataRevision:1,snapshotId,digest,recordCount:1});
  ok(await probe(f,'temporary'));ok(await commit(f,p.writes));denied(await probe(f,'temporary'));denied(await probe(f,'reception'));
  const fresh=await get(f,viewPath);ok(fresh);assert.equal(data(fresh).dataRevision,2);ok(await get(f,'publicStatus/current'));ok(await get(f,p.eventPath));
  await rejected(f,await namePlan(f,'架空次回'));
  const device=data(await get(f,'devices/'+f.device.uid,'owner')),op=randomUUID();
  const update={...device,preparedRoleRevision:1,preparedDataRevision:1,preparedSnapshotId:snapshotId,preparedDigest:digest,preparationOperationId:op};
  const receipt={operationId:op,deviceUid:f.device.uid,humanUid:f.human.uid,roleRevision:1,dataRevision:1,snapshotId,digest,recordCount:1};
  denied(await commit(f,[timed(f,'devices/'+f.device.uid,update,'preparedAt',true),timed(f,'preparationReceipts/'+op,receipt,'occurredAt',false)],f.human.token));
  assert.equal(data(await get(f,'devices/'+f.device.uid,'owner')).preparedDataRevision,1);assert.equal(data(await get(f,'preparationManifest/current','owner')).dataRevision,1);
  return{dataRevisionAdvanced:true,stalePreparedOperationsDenied:3,freshDownloadAndOwnEventAllowed:true,oldManifestAcknowledgementDenied:true,manifestIssuanceTested:false,localPersistenceProven:false};
 });
}
