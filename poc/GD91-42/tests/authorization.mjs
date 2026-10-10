import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,actor,human,sessionWrite,commit,update,get,data,ok,denied,seed} from './support.mjs';
import {ready,customerPlan,customerWrites,saveCustomer} from './business.mjs';

const ts=milliseconds=>({$timestamp:new Date(milliseconds).toISOString()});
const claims=h=>JSON.parse(Buffer.from(h.token.split('.')[1],'base64url'));
// Auth Emulatorの署名なしトークンだけで時刻を固定する試験用入力。本番認証の代用ではない。
function emulatorAuthTime(h,seconds) {
 const parts=h.token.split('.');assert.equal(parts[2],'');const c=claims(h);
 c.auth_time=seconds;parts[1]=Buffer.from(JSON.stringify(c)).toString('base64url');return{...h,token:parts.join('.')};
}
const probe=(f,a,level)=>commit(f,[update(f,'authorizationProbes/'+randomUUID(),{level},undefined,false)],a.token);
async function renew(f,a,h,overrides={}) {
 const before=await get(f,'sessions/'+a.uid),revision=before.status===404?1:data(before).revision+1;
 const d=data(await get(f,'devices/'+a.uid));
 const r=await commit(f,[sessionWrite(f,a,h,revision,{roleRevision:d.preparedRoleRevision,...overrides})],h.token);return r;
}
async function changePlan(f,subject,role) {
 const b=data(await get(f,'roles/'+subject)),id=randomUUID();
 const a={...b,role,revision:b.revision+1,receptionBaselineRevision:role==='temporary'?b.revision:0,operationId:id};
 const w=update(f,'roles/'+subject,a,undefined,true);w.updateTransforms=[{fieldPath:'changedAt',setToServerValue:'REQUEST_TIME'}];
 const e=update(f,'authorizationEvents/'+id,{kind:'roleChange',subjectUid:subject,operationId:id,deviceUid:f.owner.uid,humanUid:f.human.uid,beforeRevision:b.revision,afterRevision:a.revision},undefined,false);
 e.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];return{id,writes:[w,e]};
}
async function change(f,subject,role){const p=await changePlan(f,subject,role);ok(await commit(f,p.writes));return p;}
async function preparationPlan(f,a,h) {
 const d=data(await get(f,'devices/'+a.uid)),r=data(await get(f,'roles/'+h.uid)),id=randomUUID();
 const w=update(f,'devices/'+a.uid,{...d,preparedRoleRevision:r.revision,preparationOperationId:id},undefined,true);
 w.updateTransforms=[{fieldPath:'preparedAt',setToServerValue:'REQUEST_TIME'}];
 const e=update(f,'preparationReceipts/'+id,{operationId:id,deviceUid:a.uid,humanUid:h.uid,roleRevision:r.revision},undefined,false);
 e.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];return{id,writes:[w,e]};
}
async function preparation(f,a,h){const p=await preparationPlan(f,a,h);ok(await commit(f,p.writes,h.token));return p;}
async function readerB(f) {
 const a=await actor(),d=data(await get(f,'devices/'+f.reader.uid));
 await seed(f,'devices/'+a.uid,{...d,deviceUid:a.uid});ok(await renew(f,a,f.readerHuman));return a;
}
async function unchanged(f,paths,run){const before=await Promise.all(paths.map(p=>get(f,p)));await run();assert.deepEqual(await Promise.all(paths.map(p=>get(f,p))),before);}

export async function authorizationCases(record) {
 await record('A01','human Auth issues a bound session and rejects payload identity time and provider forgeries',async()=>{
  const f=await fixture({skipSessions:true});ok(await renew(f,f.owner,f.human));
  let count=0;for(const changes of [
   {schemaVersion:1},{humanUid:f.readerHuman.uid},{deviceUid:f.other.uid},{authProvider:'password'},
   {humanAuthTime:ts(Date.now()+60000)},{humanAuthTime:ts(Date.now()-3600000)},{roleRevision:2},{extra:true}
  ]){denied(await renew(f,f.owner,f.human,changes));count++;}
  denied(await renew(f,f.reader,f.human));count++;
  denied(await commit(f,[sessionWrite(f,f.other,f.human)],f.other.token));count++;
  const u=await human('password',false),d=data(await get(f,'devices/'+f.reader.uid)),r=data(await get(f,'roles/'+f.readerHuman.uid));
  await seed(f,'devices/'+f.reader.uid,{...d,humanUid:u.uid});await seed(f,'roles/'+u.uid,r);
  denied(await renew(f,f.reader,u));count++;
  return{normalHumanIssuer:true,forgeriesDenied:count,anonymousCannotIssue:true,realProviderLoginTested:false};
 });
 await record('A02','promotion preserves general preparation on A and B and only prepared A gains temporary probe access',async()=>{
  const f=await ready(),b=await readerB(f);await change(f,f.readerHuman.uid,'temporary');
  for(const a of [f.reader,b]){ok(await probe(f,a,0));denied(await probe(f,a,3));assert.equal((await get(f,'selection/current',a.token)).status,200);}
  const p=await preparation(f,f.reader,f.readerHuman);denied(await probe(f,f.reader,3));ok(await renew(f,f.reader,f.readerHuman));
  ok(await probe(f,f.reader,3));ok(await probe(f,f.reader,0));denied(await probe(f,b,3));ok(await probe(f,b,0));
  denied(await probe(f,f.reader,1));denied(await probe(f,f.reader,2));
  denied(await commit(f,customerWrites(f,customerPlan(f,{})),f.reader.token));
  assert.equal(data(await get(f,'devices/'+b.uid)).preparedRoleRevision,1);assert.equal(data(await get(f,'roles/'+f.readerHuman.uid)).receptionBaselineRevision,1);
  return{roleChangeWrites:2,preparationWrites:2,sessionWrites:1,deviceARevision:2,deviceBRevision:1,generalReadsContinue:true,temporaryBusinessWriteTested:false,preparationReceipt:p.id.length>0};
 });
 await record('A03','demotion denies old privileges immediately and requires current general preparation and session',async()=>{
  const f=await fixture(),b=await readerB(f);await change(f,f.readerHuman.uid,'temporary');
  for(const a of [f.reader,b]){await preparation(f,a,f.readerHuman);ok(await renew(f,a,f.readerHuman));ok(await probe(f,a,3));}
  await change(f,f.readerHuman.uid,'receptionist');
  for(const a of [f.reader,b]){denied(await probe(f,a,3));denied(await probe(f,a,0));}
  denied(await renew(f,f.reader,f.readerHuman));await preparation(f,f.reader,f.readerHuman);
  denied(await probe(f,f.reader,0));ok(await renew(f,f.reader,f.readerHuman));ok(await probe(f,f.reader,0));denied(await probe(f,f.reader,3));denied(await probe(f,b,0));
  assert.equal(data(await get(f,'roles/'+f.readerHuman.uid)).receptionBaselineRevision,0);
  return{bothOldTemporaryDenied:true,generalRequiresOnlineRecheck:true,otherDeviceNotAutomaticallyPrepared:true};
 });
 await record('A04','session renewal preserves Auth time while ordinary editing and high impact authorization remain separate',async()=>{
  const f=await ready(),old=emulatorAuthTime(f.human,Math.floor(Date.now()/1000)-1800);
  ok(await renew(f,f.owner,old));const before=data(await get(f,'sessions/'+f.owner.uid));
  ok(await probe(f,f.owner,1));await saveCustomer(f);denied(await probe(f,f.owner,2));
  denied(await commit(f,(await changePlan(f,f.readerHuman.uid,'temporary')).writes));
  ok(await renew(f,f.owner,old));const after=data(await get(f,'sessions/'+f.owner.uid));assert.deepEqual(after.humanAuthTime,before.humanAuthTime);assert(after.revision>before.revision);
  denied(await probe(f,f.owner,2));denied(await renew(f,f.owner,old,{humanAuthTime:ts(Date.now())}));
  ok(await renew(f,f.owner,f.human));ok(await probe(f,f.owner,2));await change(f,f.readerHuman.uid,'temporary');
  return{emulatorClaimFixture:true,normalRenewalCannotExtendReauthentication:true,ordinaryManagerAccessRetained:true,realReauthenticationUITested:false};
 });
 await record('A05','fifteen minute boundary is inclusive and future or expired evidence is rejected',async()=>{
  const now=Date.UTC(2026,9,9),recent=(auth,time)=>auth<=time&&time<=auth+900000;
  const cases=[[-1,false],[0,true],[1,true],[899999,true],[900000,true],[900001,false],[1800000,false]];
  for(const[age,want]of cases)assert.equal(recent(now-age,now),want);
  const f=await fixture();let count=0;
  for(const[age,want]of cases){const result=await commit(f,[update(f,'clockProbes/'+randomUUID(),{humanAuthTime:ts(now-age),clock:ts(now)},undefined,false)]);if(want)ok(result);else denied(result);}
  for(const age of [880,920]){const h=emulatorAuthTime(f.human,Math.floor(Date.now()/1000)-age);ok(await renew(f,f.owner,h));const r=await probe(f,f.owner,2);if(age===880)ok(r);else denied(r);count++;}
  denied(await renew(f,f.owner,emulatorAuthTime(f.human,Math.floor(Date.now()/1000)+60)));
  return{deterministicBoundaryCases:cases.length,fixedClockRulesBoundaryCases:cases.length,exactBoundaryRulesClockTested:false,emulatorNearBoundaryRequests:count,futureAuthClaimDenied:true};
 });
 await record('A06','current role device and session state reject stale evidence on each request',async()=>{
  const f=await fixture();let count=0;
  for(const[path,changes]of [
   ['roles/'+f.human.uid,{active:false}],['roles/'+f.human.uid,{endsAt:ts(Date.now()-1000)}],
   ['roles/'+f.human.uid,{startsAt:ts(Date.now()+60000)}],['roles/'+f.human.uid,{revision:2}],
   ['devices/'+f.owner.uid,{active:false}],['devices/'+f.owner.uid,{humanUid:f.readerHuman.uid}],
   ['sessions/'+f.owner.uid,{active:false}],['sessions/'+f.owner.uid,{expiresAt:ts(Date.now()-1000)}],
   ['sessions/'+f.owner.uid,{performanceId:randomUUID()}]
  ]){const original=data(await get(f,path));await seed(f,path,{...original,...changes});for(const level of [0,1,2]){denied(await probe(f,f.owner,level));count++;}await seed(f,path,original);}
  const path='sessions/'+f.owner.uid,before=data(await get(f,path));await seed(f,path,{...before,humanAuthTime:ts(Date.now()+60000)});denied(await probe(f,f.owner,2));count++;
  return{onlineDenials:count,offlineImmediateRevocationTested:false};
 });
 await record('A07','role and audit are atomic and reject stale revision forged baseline and replay',async()=>{
  const f=await fixture(),path='roles/'+f.readerHuman.uid,p=await changePlan(f,f.readerHuman.uid,'temporary');
  for(const w of p.writes)await unchanged(f,[path,'authorizationEvents/'+p.id],async()=>denied(await commit(f,[w])));
  for(const patch of [{receptionBaselineRevision:0},{revision:3},{role:'owner'},{active:false}]){
   const x=structuredClone(p.writes);for(const[k,v]of Object.entries(patch))x[0].update.fields[k]=typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:{stringValue:v};
   await unchanged(f,[path,'authorizationEvents/'+p.id],async()=>denied(await commit(f,x)));
  }
  const fakeActor=structuredClone(p.writes);fakeActor[1].update.fields.humanUid={stringValue:f.readerHuman.uid};
  await unchanged(f,[path,'authorizationEvents/'+p.id],async()=>denied(await commit(f,fakeActor)));
  const stale=await changePlan(f,f.readerHuman.uid,'temporary');ok(await commit(f,p.writes));
  denied(await commit(f,stale.writes));assert.equal((await get(f,'authorizationEvents/'+stale.id)).status,404);
  assert([403,409].includes((await commit(f,p.writes)).status));
  denied(await commit(f,(await changePlan(f,f.readerHuman.uid,'receptionist')).writes,f.reader.token));
  const event=data(await get(f,'authorizationEvents/'+p.id));assert.equal(event.humanUid,f.human.uid);assert.equal(event.deviceUid,f.owner.uid);
  return{partialSubsetsDenied:2,forgeriesDenied:5,staleAndReplayDenied:true,generalCannotChangeRole:true,actorHumanAndDeviceRecorded:true};
 });
 await record('A08','preparation acknowledges only own active device and cannot partially advance or elevate another device',async()=>{
  const f=await fixture();await change(f,f.readerHuman.uid,'temporary');const p=await preparationPlan(f,f.reader,f.readerHuman),path='devices/'+f.reader.uid;
  for(const w of p.writes)await unchanged(f,[path,'preparationReceipts/'+p.id],async()=>denied(await commit(f,[w],f.readerHuman.token)));
  denied(await commit(f,p.writes,f.reader.token));denied(await commit(f,p.writes,f.human.token));
  const x=structuredClone(p.writes);x[0].update.fields.preparedRoleRevision={integerValue:'3'};denied(await commit(f,x,f.readerHuman.token));
  ok(await commit(f,p.writes,f.readerHuman.token));assert([403,409].includes((await commit(f,p.writes,f.readerHuman.token)).status));
  const other=await actor(),device=data(await get(f,path));await seed(f,'devices/'+other.uid,{...device,deviceUid:other.uid,preparedRoleRevision:1,active:false});
  denied(await commit(f,(await preparationPlan(f,other,f.readerHuman)).writes,f.readerHuman.token));
  return{partialSubsetsDenied:2,wrongIssuerDenied:2,futureRoleAndStoppedDeviceDenied:true,replayDenied:true,actualDownloadCompletenessTested:false};
 });
 await record('A09','deputy changes staff roles through normal authorization and another performance cannot reuse the evidence',async()=>{
  const f=await fixture({role:'deputy'}),other=await fixture();
  await change(f,f.readerHuman.uid,'temporary');ok(await probe(f,f.reader,0));denied(await probe(f,f.reader,3));
  denied(await commit(other,[update(other,'authorizationProbes/'+randomUUID(),{level:0},undefined,false)],f.reader.token));
  denied(await commit(other,(await changePlan(other,other.readerHuman.uid,'temporary')).writes,f.owner.token));
  const wrong=sessionWrite(other,other.reader,f.readerHuman,2,{performanceId:f.show});denied(await commit(other,[wrong],f.readerHuman.token));
  return{deputyNormalChange:true,crossPerformanceDenials:3,ownerDeputyLifecycleTested:false};
 });
}
