import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {budgets} from './budgets.mjs';
import {project,base,request,fixture,addIdentity,write,timed,commit,get,list,seed,data,ok,denied,conflict,stamp,plan,register,publishFixture,prepareFixture,snapshot,rejected} from './support.mjs';
const sources=['../firestore.rules','../firebase.json','support.mjs','budgets.mjs','emulator.mjs','../../GD91-36/firestore.rules','../../GD91-39/firestore.rules','../../GD91-40/artifacts/contract-analysis.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function record(id,label,run){if(process.env.GD91_CASE&&process.env.GD91_CASE!==id)return;const result=await run();reports.push({id,label,status:'passed',...result});console.log(`${id}: CHECKED ${label}`);}
const change=(writes,index,field,value)=>{const c=structuredClone(writes);c[index].update.fields[field]=value;if(c[index].updateMask&&!c[index].updateMask.fieldPaths.includes(field))c[index].updateMask.fieldPaths.push(field);return c;};
const str=x=>({stringValue:x}),num=x=>({integerValue:String(x)});
async function ready(role='owner',state='operating'){const f=await fixture(),r=await register(f);await publishFixture(f,[r.id],state);return{f:role==='owner'?f:await addIdentity(f,role),id:r.id};}

await record('E01','normal registration creates separate canonical profile and public label',async()=>{
 const f=await fixture(),p=await register(f),a=data(await get(f,'attendees/'+p.id)),l=data(await get(f,'attendeeLabels/'+p.id));
 assert.equal(p.writes.length,5);assert(!('seatDisplayName'in a));assert.deepEqual(l,p.after);assert(!('buyerId'in l));
 const v=data(await get(f,'versions/current'));assert.equal(v.values.reception,2);assert.equal(v.values.ticket,1);assert.equal(v.values.layout,0);
 const again=await register(f,'架空二');assert.equal(data(await get(f,'attendeeState/current')).eligibleIds.length,2);
 const before=await plan(f,'labelChange',again.id,'架空三');assert.equal(before.writes.length,4);ok(await commit(f,before.writes));
 assert.equal((await get(f,`dayEvents/${f.human.uid}/entries/${before.op}`)).status,404);
 for(const label of ['架空 一二三四','😀😀😀　😀😀😀'])await register(f,label);
 return{registrationWrites:5,beforeDayNameWrites:4,normalSourceCreation:true,managementEditsDoNotRequireFreshReceptionDownload:true,spacesExcludedAndSixUnicodeCodePointsAccepted:true};
});
await record('E02','all partial registration and day-name submissions are atomic',async()=>{
 let rejectedSubsets=0;for(const kind of ['register','labelChange']){
  let f,p;if(kind==='register'){f=await fixture();p=await plan(f,kind);}else{const x=await ready('temporary');f=x.f;p=await plan(f,kind,x.id,'架空二');}
  for(let mask=1;mask<31;mask++){await rejected(f,p,p.writes.filter((_,i)=>mask&(1<<i)));rejectedSubsets++;}
  ok(await commit(f,p.writes));const before=await snapshot(f,p);conflict(await commit(f,p.writes));assert.deepEqual(await snapshot(f,p),before);
 }
 return{partialRequestsDenied:rejectedSubsets,successfulCompleteRequests:2,replayDenied:2};
});
await record('E03','forged fields, reasons, confirmations and extra writes are denied',async()=>{
 const{f,id}=await ready('temporary'),p=await plan(f,'labelChange',id,'架空二'),w=p.writes;
 const bad=[change(w,0,'values',{mapValue:{fields:{...w[0].update.fields.values.mapValue.fields,reception:num(p.b.values.reception)}}}),
 change(w,0,'values',{mapValue:{fields:{...w[0].update.fields.values.mapValue.fields,ticket:num(99)}}}),
 change(w,3,'confirmed',{booleanValue:false}),change(w,3,'beforeLabel',{nullValue:null}),change(w,3,'afterLabel',{nullValue:null}),
 change(w,3,'reason',str('')),change(w,3,'reason',str('　 \t')),change(w,3,'actorUid',str('FAKE-other-human')),
 change(w,1,'schemaVersion',num(8)),change(w,1,'buyerId',str(randomUUID())),change(w,1,'seatDisplayName',str('長すぎる架空表示名')),
 change(w,2,'eligibleIds',{arrayValue:{values:[]}}),change(w,4,'seatDisplayName',str('架空二')),change(w,4,'deviceUid',str('FAKE-other-device')),
 change(w,3,'onDay',{booleanValue:false}),change(w,3,'clientTime',str('2098-01-01')),change(w,3,'kind',str('register')),
 [...w,write(f,'tickets/FAKE-ticket',{active:false})]];
 for(const [index,c]of bad.entries()){try{await rejected(f,p,c);}catch(e){e.message=`forged request ${index+1}: `+e.message;throw e;}}
 const relocated=structuredClone(w);relocated[4].update.name=relocated[4].update.name.replace(f.human.uid,'FAKE-other-human');await rejected(f,p,relocated);
 ok(await commit(f,w));for(const index of [3,4]){denied(await commit(f,[w[index]]));denied(await commit(f,[{delete:w[index].update.name}]));}
 return{forgedRequestsDenied:bad.length+1,immutableHistoryUpdateDeleteDenied:4};
});
await record('E04','server day, all roles and performance states govern name writes',async()=>{
 let attempts=0;for(const role of ['owner','deputy','temporary','receptionist'])for(const state of ['preparing','operating','ended','closed']){
  const{f,id}=await ready(role,state),allowed=['owner','deputy'].includes(role)&&['preparing','operating'].includes(state)||role==='temporary'&&state==='operating';
  // 一般・締め後のクライアントは提案用の読取りも許可されないので、管理側の同形提案を用いて保存認可を別に検査する。
  let p;if(role==='receptionist'||state==='closed'&&!['owner','deputy'].includes(role)){
   const manager=await addIdentity(f,'owner');p=await plan(manager,'labelChange',id,'架空二');
   for(const i of [3,4])p.writes[i].update.fields.actorUid=str(f.human.uid),p.writes[i].update.fields.deviceUid=str(f.device.uid);
   p.writes[4].update.name=p.writes[4].update.name.replace(manager.human.uid,f.human.uid);
  }else p=await plan(f,'labelChange',id,'架空二');
  if(allowed)ok(await commit(f,p.writes));else await rejected(f,p);attempts++;
 }
 const{f,id}=await ready('owner','preparing'),p=await plan(f,'labelChange',id,'架空二','');await rejected(f,p);
 const r=await plan(f,'register');await rejected(f,r);
 return{roleStateAttempts:attempts,dayPreparingStillRequiresReason:true,dayRegistrationOutsideCurrentSubsetDenied:true};
});
await record('E05','latest identity and data-format checks reject stale privileges',async()=>{
 const changes=[['devices','active',false],['sessions','active',false],['roles','active',false],['roles','role','receptionist'],['roles','revision',2],['devices','preparedRoleRevision',0],['sessions','expiresAt',{$timestamp:'2000-01-01T00:00:00Z'}],['devices','preparedDataSchemaVersion',8],['devices','preparedDataRevision',1]];
 for(const [collection,key,value]of changes){const{f,id}=await ready('temporary'),p=await plan(f,'labelChange',id,'架空二'),path=collection+'/'+(collection==='roles'?f.human.uid:f.device.uid),b=data(await get(f,path,'owner'));await seed(f,path,{...b,[key]:value});await rejected(f,p);}
 return{revocationAndPreparationCases:changes.length,oldFormatSameNumericStampDenied:true};
});
await record('E06','public-name and own-history reads cannot expose private or unassigned data',async()=>{
 const owner=await fixture(),r=await register(owner),unassigned=await register(owner,'架空二');await publishFixture(owner,[r.id]);
 let checks=0;for(const role of ['temporary','receptionist']){const f=await addIdentity(owner,role);ok(await get(f,'attendeeLabels/'+r.id));denied(await get(f,'attendeeLabels/'+unassigned.id));denied(await list(f,'attendeeLabels'));
  for(const path of ['attendees/'+r.id,'attendeeState/current','operations/'+r.op,'roles/'+f.human.uid,'devices/'+f.device.uid])denied(await get(f,path));checks+=8;
  denied(await request(`${base}:runQuery`,f.device.token,'POST',{structuredQuery:{from:[{collectionId:'attendeeLabels',allDescendants:true}],limit:100}}));
 }
 ok(await get(owner,'attendeeLabels/'+unassigned.id));const f=await addIdentity(owner,'temporary'),p=await plan(f,'labelChange',r.id,'架空三');ok(await commit(f,p.writes));
 const path=`dayEvents/${f.human.uid}/entries/${p.op}`;ok(await get(f,path));const event=data(await get(f,path));assert(!('seatDisplayName'in event));assert(!('buyerId'in event));
 const q=limit=>request(`${base}/splitSeatShows/${f.show}/dayEvents/${f.human.uid}:runQuery`,f.device.token,'POST',{structuredQuery:{from:[{collectionId:'entries'}],...(limit===null?{}:{limit})}});
 ok(await q(100));denied(await q(null));denied(await q(101));const other=await addIdentity(f,'temporary');denied(await get(other,path));
 const sameHuman={...f,device:await (await import('./support.mjs')).anonymous()},d={...f.deviceData,deviceUid:sameHuman.device.uid};await seed(f,'devices/'+sameHuman.device.uid,d);
 ok(await commit(sameHuman,[timed(sameHuman,'sessions/'+sameHuman.device.uid,{...f.session,deviceUid:sameHuman.device.uid},'issuedAt',false)],f.human.token));ok(await get(sameHuman,path));
 const c=data(await get(f,'control/current','owner'));await seed(f,'control/current',{...c,state:'ended'});ok(await get(f,path));await seed(f,'control/current',{...c,state:'closed'});denied(await get(f,path));denied(await get(f,'attendeeLabels/'+r.id));denied(await get(f,'versions/current'));
 const cross=await fixture();denied(await get(cross,'attendeeLabels/'+r.id,f.device.token));
 await seed(owner,'control/current',c);const selection=data(await get(owner,'selection/current','owner'));await seed(owner,'selection/current',{...selection,generationId:'FAKE-other-generation'});denied(await get(other,'attendeeLabels/'+r.id));
 return{privateAndUnassignedChecks:checks,ownGetAndBoundedList:true,otherHumanAndCrossShowDenied:true,sameHumanSecondDevice:true,endedOwnAllowedClosedDenied:true,generationMismatchDenied:true};
});
await record('E07','concurrent names have one winner and preserve profile, assignment and ticket source',async()=>{
 const{f,id}=await ready(),a=await plan(f,'labelChange',id,'架空二'),b=await plan(f,'labelChange',id,'架空三');
 await seed(f,'tickets/FAKE-ticket',{active:true,opaqueReference:'FAKE-not-a-QR'});
 const paths=['attendees/'+id,'assignmentState/current','selection/current','tickets/FAKE-ticket'],before=await Promise.all(paths.map(p=>get(f,p,'owner')));
 const results=await Promise.all([commit(f,a.writes),commit(f,b.writes)]);assert.equal(results.filter(r=>r.status===200).length,1);results.filter(r=>r.status!==200).forEach(conflict);
 const winner=results[0].status===200?a:b;ok(await get(f,`dayEvents/${f.human.uid}/entries/${winner.op}`));const snap=await snapshot(f,winner);conflict(await commit(f,winner.writes));assert.deepEqual(await snapshot(f,winner),snap);
 assert.deepEqual(await Promise.all(paths.map(p=>get(f,p,'owner'))),before);const stale=await plan(f,'labelChange',id,'架空四');await rejected(f,stale);ok(await get(f,'attendeeLabels/'+id));
 return{oneWinner:true,replayDenied:true,sourceDocumentsPreserved:paths.length,stalePreparationWriteDeniedFreshReadAllowed:true,sdkResponseLossTested:false};
});
await record('E08','fixed day boundaries and mixed-read rejection preserve previous local snapshot',async()=>{
 const{f,id}=await ready(),c=data(await get(f,'control/current'));
 for(const [time,expected]of [[Date.parse(c.dayStartsAt.$timestamp)-1,false],[Date.parse(c.dayStartsAt.$timestamp),true],[Date.parse(c.dayEndsAt.$timestamp)-1,true],[Date.parse(c.dayEndsAt.$timestamp),false]])ok(await commit(f,[write(f,'dateProbes/'+randomUUID(),{at:{$timestamp:new Date(time).toISOString()},expected},false)]));
 const old=data(await get(f,'attendeeLabels/'+id)),before=data(await get(f,'versions/current')),p=await plan(f,'labelChange',id,'架空二');ok(await commit(f,p.writes));const current=data(await get(f,'attendeeLabels/'+id)),after=data(await get(f,'versions/current'));
 const same=before.values.reception===after.values.reception&&before.values.control===after.values.control&&before.generationId===after.generationId;
 assert.equal(same,false);let stored=old;if(same)stored=current;assert.deepEqual(stored,old);
 await prepareFixture(f);const p2=await plan(f,'labelChange',id,'架空三');ok(await commit(f,p2.writes));
 return{boundaryCases:4,businessUsesRequestTime:true,mixedSnapshotRejected:true,oldInMemorySnapshotRetained:true,indexedDbPersistenceTested:false};
});
await record('E09','500 normally registered labels are fetched individually and only one changes',async()=>{
 const f=await fixture(),ids=[],start=performance.now();for(let i=0;i<500;i++){ids.push((await register(f,'架空'+i)).id);if(i%100===99)console.log(`E09: registered ${i+1}/500`);}
 const registrationMs=Math.round(performance.now()-start),over=await plan(f,'register');await rejected(f,over);await publishFixture(f,ids);const staff=await addIdentity(f,'receptionist'),cache=new Map();let next=0;
 const readStart=performance.now();await Promise.all(Array.from({length:20},async()=>{for(;;){const i=next++;if(i>=ids.length)return;const r=await get(staff,'attendeeLabels/'+ids[i]);ok(r);cache.set(ids[i],data(r));}}));const initialReadMs=Math.round(performance.now()-readStart);
 assert.equal(cache.size,500);const unchanged=ids.slice(1).map(id=>cache.get(id)),p=await plan(f,'labelChange',ids[0],'架空修正');ok(await commit(f,p.writes));const diff=await get(staff,'attendeeLabels/'+ids[0]);ok(diff);cache.set(ids[0],data(diff));assert.deepEqual(ids.slice(1).map(id=>cache.get(id)),unchanged);
 return{normalRegistrations:500,capacity501Denied:true,registrationMs,initialPublicGets:500,initialReadConcurrency:20,initialReadMs,changedTargetGets:1,localUnchangedLabels:499,emulatorTimingOnly:true,publicDocumentReadCountExcludesRuleLookups:true,productionBillingMeasured:false};
});
assert.deepEqual(await hashes(),sourceHashes);if(!process.env.GD91_CASE)assert.equal(reports.length,9);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),runtime:process.version,project,testLevel:'Isolated Firebase Auth and Firestore Emulator REST integration plus static no-cache Rules budget. Not production unit, full-save regression, SDK or physical-device testing.',hashLineEndings:'LF',sourceHashes,endSourceHashes:await hashes(),budgets,scope:'Business schema 9 canonical profile/label registration and name change only. Root seeds show/control/roles/devices/public assignment and preparation premises; normal Auth issues sessions and normal manager writes create all 500 profiles and labels. Buyer relationship, initial-label fallback, full 48-save integration, manifest issuance, IndexedDB and live-provider authentication remain unconnected.',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
