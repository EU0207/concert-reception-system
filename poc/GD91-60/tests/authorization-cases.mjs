import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,anonymous,human,write,timed,commit,get,seed,data,ok,denied,conflict} from './access-support.mjs';
import {manifest,preparationPlan} from './recovery.mjs';

const claims=h=>JSON.parse(Buffer.from(h.token.split('.')[1],'base64url'));
const ts=n=>({$timestamp:new Date(n).toISOString()});
async function staff(f,role='receptionist',person){
 const g={...f,device:await anonymous(),human:person??await human(['owner','deputy'].includes(role)?'google.com':'password')};
 const scope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show};
 if(!person)await seed(g,'roles/'+g.human.uid,{...scope,active:true,role,revision:1,receptionBaselineRevision:0,startsAt:ts(Date.now()-60000),endsAt:ts(Date.now()+7200000)});
 await seed(g,'devices/'+g.device.uid,{...scope,deviceUid:g.device.uid,humanUid:g.human.uid,active:true,preparedRoleRevision:1,preparedDataRevision:1});
 ok(await renew(g));return g;
}
async function renew(f,overrides={},person=f.human){
 const r=await get(f,'sessions/'+f.device.uid,'owner'),d=data(await get(f,'devices/'+f.device.uid,'owner'));
 const session={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show,deviceUid:f.device.uid,humanUid:person.uid,active:true,emailVerified:true,authProvider:person.provider,roleRevision:d.preparedRoleRevision,revision:r.status===404?1:data(r).revision+1,humanAuthTime:ts(claims(person).auth_time*1000),expiresAt:ts(Date.now()+3600000),...overrides};
 return commit(f,[timed(f,'sessions/'+f.device.uid,session,'issuedAt',r.status!==404)],person.token);
}
const probe=(f,level)=>commit(f,[write(f,'authorizationProbes/'+randomUUID(),{level},false)]);
async function rolePlan(f,uid,role){
 const b=data(await get(f,'roles/'+uid,'owner')),id=randomUUID(),a={...b,role,revision:b.revision+1,receptionBaselineRevision:role==='temporary'?b.revision:0,operationId:id};
 return{id,paths:['roles/'+uid,'authorizationEvents/'+id],writes:[timed(f,'roles/'+uid,a,'changedAt',true),timed(f,'authorizationEvents/'+id,{kind:'roleChange',subjectUid:uid,operationId:id,deviceUid:f.device.uid,humanUid:f.human.uid,beforeRevision:b.revision,afterRevision:a.revision},'occurredAt',false)]};
}
async function change(f,uid,role){const p=await rolePlan(f,uid,role);ok(await commit(f,p.writes));return p;}
async function prepare(f){const p=await preparationPlan(f);ok(await commit(f,p.writes,f.human.token));return p;}
function oldAuth(h,seconds){const parts=h.token.split('.');assert.equal(parts[2],'');const c=claims(h);c.auth_time=seconds;parts[1]=Buffer.from(JSON.stringify(c)).toString('base64url');return{...h,token:parts.join('.')};}
async function untouched(f,paths,run){const before=await Promise.all(paths.map(p=>get(f,p,'owner')));await run();assert.deepEqual(await Promise.all(paths.map(p=>get(f,p,'owner'))),before);}

export async function authorizationCases(record){
 await record('A01','human issues the session; identity, provider, time and lifetime forgeries are denied',async()=>{
  const f=await fixture(),other=await fixture();
  for(const patch of [{humanUid:other.human.uid},{deviceUid:other.device.uid},{roleRevision:99},{authProvider:'password'},{emailVerified:false},{humanAuthTime:ts(Date.now()+60000)},{expiresAt:ts(Date.now()+13*3600000)},{extra:true}])denied(await renew(f,patch));
  const s=data(await get(f,'sessions/'+f.device.uid,'owner'));assert.equal(s.humanUid,f.human.uid);assert.equal(s.authProvider,'google.com');assert.equal(Date.parse(s.humanAuthTime.$timestamp),Date.parse(f.human.authTime.$timestamp));assert(s.issuedAt.$timestamp);
  denied(await commit(f,[timed(f,'sessions/'+f.device.uid,{...s,revision:s.revision+1},'issuedAt',true)]));
  denied(await renew(f,{},other.human));ok(await renew(f));return{forgedHumanRequestsDenied:9,anonymousIssuerDenied:true,normalHumanRenewal:true};
 });
 await record('A02','normal promotion and per-device preparation preserve baseline reads without granting temporary authority',async()=>{
  const owner=await fixture('owner','operating'),a=await staff(owner),b=await staff(owner,'receptionist',a.human);
  await change(owner,a.human.uid,'temporary');
  for(const g of [a,b]){ok(await get(g,'receptionViews/FAKE-seat'));ok(await probe(g,0));denied(await probe(g,3));}
  await manifest(a);await prepare(a);denied(await probe(a,3));ok(await renew(a));ok(await probe(a,3));denied(await probe(a,1));denied(await probe(a,2));
  ok(await probe(b,0));denied(await probe(b,3));assert.equal(data(await get(b,'devices/'+b.device.uid,'owner')).preparedRoleRevision,1);
  return{normalRoleChange:true,normalManifestAcknowledgement:true,normalSessionRenewal:true,deviceBNotPrepared:true,temporaryCannotManage:true,manifestIssuanceRootSeeded:true};
 });
 await record('A03','normal demotion revokes two prepared temporary devices and general operation requires new preparation',async()=>{
  const owner=await fixture('owner','operating'),a=await staff(owner),b=await staff(owner,'receptionist',a.human);
  await change(owner,a.human.uid,'temporary');await manifest(a);
  for(const g of [a,b]){await prepare(g);ok(await renew(g));ok(await probe(g,3));}
  await change(owner,a.human.uid,'receptionist');
  for(const g of [a,b]){denied(await probe(g,3));denied(await probe(g,0));denied(await renew(g));}
  await prepare(a);denied(await probe(a,0));ok(await renew(a));ok(await probe(a,0));denied(await probe(a,3));denied(await probe(b,0));
  return{oldTemporaryRequestsDenied:true,normalDemotion:true,generalResumeRequiresPreparationAndSession:true,otherDeviceStillDenied:true};
 });
 await record('A04','normal session renewal cannot extend the fifteen-minute human authentication window',async()=>{
  const f=await fixture(),g=await staff(f),old=oldAuth(f.human,Math.floor(Date.now()/1000)-1800);
  ok(await renew(f,{},old));ok(await probe(f,1));denied(await probe(f,2));
  const p=await rolePlan(f,g.human.uid,'temporary');await untouched(f,p.paths,async()=>denied(await commit(f,p.writes)));
  const before=data(await get(f,'sessions/'+f.device.uid,'owner'));ok(await renew(f,{},old));assert.deepEqual(data(await get(f,'sessions/'+f.device.uid,'owner')).humanAuthTime,before.humanAuthTime);
  denied(await renew(f,{humanAuthTime:ts(Date.now())},old));ok(await renew(f));ok(await probe(f,2));ok(await commit(f,p.writes));
  return{emulatorAuthClaimFixture:true,ordinaryManagerAccessRetained:true,renewalCannotExtendReauthentication:true,normalFreshHumanRoleChange:true};
 });
 await record('A05','fifteen-minute requests accept inside and reject outside or future authentication times',async()=>{
  const f=await fixture();let checked=0;
  for(const [age,allow] of [[880,true],[920,false]]){ok(await renew(f,{},oldAuth(f.human,Math.floor(Date.now()/1000)-age)));(allow?ok:denied)(await probe(f,2));checked++;}
  denied(await renew(f,{},oldAuth(f.human,Math.floor(Date.now()/1000)+60)));
  const now=Date.UTC(2026,9,11),ages=[-1,0,1,899999,900000,900001,1800000];
  for(const age of ages){const allow=age>=0&&age<=900000;assert.equal(now-age<=now&&now<=now-age+900000,allow);(allow?ok:denied)(await commit(f,[write(f,'clockProbes/'+randomUUID(),{humanAuthTime:ts(now-age),clock:ts(now)},false)]));}
  return{emulatorNearBoundaryRequests:checked,exactLiveRequestBoundaryTested:false,deterministicRulesClockCases:ages.length,futureHumanTimeDenied:true};
 });
 await record('A06','role and audit are atomic and concurrent promotion has one winner',async()=>{
  const f=await fixture(),g=await staff(f),p=await rolePlan(f,g.human.uid,'temporary');
  for(const w of p.writes)await untouched(f,p.paths,async()=>denied(await commit(f,[w])));
  const bad=structuredClone(p.writes);bad[0].update.fields.receptionBaselineRevision={integerValue:'0'};await untouched(f,p.paths,async()=>denied(await commit(f,bad)));
  const q=await rolePlan(f,g.human.uid,'temporary'),responses=await Promise.all([commit(f,p.writes),commit(f,q.writes)]);assert.equal(responses.filter(r=>r.status===200).length,1);conflict(responses.find(r=>r.status!==200));
  conflict(await commit(f,p.writes));return{partialSubsetsDenied:2,forgedBaselineDenied:true,concurrentWinners:1,replayDenied:true};
 });
 await record('A07','revocation immediately blocks all privilege levels and public reads',async()=>{
  const f=await fixture();let count=0;
  for(const [path,patch] of [['roles/'+f.human.uid,{active:false}],['roles/'+f.human.uid,{endsAt:ts(Date.now()-1000)}],['roles/'+f.human.uid,{startsAt:ts(Date.now()+60000)}],['roles/'+f.human.uid,{revision:2}],['devices/'+f.device.uid,{active:false}],['sessions/'+f.device.uid,{active:false}],['sessions/'+f.device.uid,{expiresAt:ts(Date.now()-1000)}]]){
   const old=data(await get(f,path,'owner'));await seed(f,path,{...old,...patch});for(const level of [0,1,2]){denied(await probe(f,level));count++;}denied(await get(f,'receptionViews/FAKE-seat'));await seed(f,path,old);
  }return{privilegeDenials:count,publicReadRevocationCases:7,offlineImmediateRevocationTested:false};
 });
 await record('A08','normal credentials cannot cross performances or create a session for another device owner',async()=>{
  const f=await fixture(),g=await fixture();denied(await get(f,'receptionViews/FAKE-seat',g.device.token));denied(await get(g,'receptionViews/FAKE-seat',f.device.token));
  denied(await renew(f,{},g.human));denied(await get(f,'versions/current',f.human.token));
  return{crossPerformanceDenied:2,crossOwnerSessionDenied:true,humanTokenCannotActAsDevice:true};
 });
}
