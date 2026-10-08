import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend } from '../../GD91-07/planner.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { initialHead, project as projectView } from '../../GD91-10/projection.mjs';
import { planSlide } from '../../GD91-19/plan.mjs';

const project='demo-concert-seat-gd91-20';
assert.equal(process.env.GCLOUD_PROJECT,project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9191');
const base=`http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth='http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const context={maxCells:10000},deltas={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]},reports=[];
const sources=['../firestore.rules','../firebase.json','emulator.mjs','../../GD91-19/plan.mjs','../../GD91-07/planner.mjs','../../GD91-08/slide.mjs','../../GD91-10/projection.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),clone=structuredClone;
const encode=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:typeof v==='string'?{stringValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:Object.hasOwn(v,'$timestamp')?{timestampValue:v.$timestamp}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
const decode=v=>Object.hasOwn(v,'nullValue')?null:Object.hasOwn(v,'booleanValue')?v.booleanValue:Object.hasOwn(v,'integerValue')?Number(v.integerValue):Object.hasOwn(v,'stringValue')?v.stringValue:Object.hasOwn(v,'timestampValue')?{$timestamp:v.timestampValue}:Object.hasOwn(v,'arrayValue')?(v.arrayValue.values??[]).map(decode):Object.fromEntries(Object.entries(v.mapValue.fields??{}).map(([k,x])=>[k,decode(x)]));
const data=r=>decode({mapValue:{fields:r.body.fields}});
async function request(url,token,method='GET',body){
 const r=await fetch(url,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,body:await r.json()};
}
const ok=r=>assert.equal(r.status,200,JSON.stringify(r.body));
const denied=r=>assert.equal(r.status,403,JSON.stringify(r.body));
const conflict=r=>{if(r.status===409)assert.equal(r.body.error.status,'ALREADY_EXISTS');else denied(r);};
async function actor(){const r=await request(`${auth}/accounts:signUp?key=demo-api-key`,null,'POST',{returnSecureToken:true});ok(r);assert.equal(JSON.parse(Buffer.from(r.body.idToken.split('.')[1],'base64url')).aud,project);return {uid:r.body.localId,token:r.body.idToken};}
const relative=(f,suffix)=>`slideShows/${f.show}/`+(suffix.startsWith('head/')||suffix.startsWith('events/')||suffix.startsWith('source/')?`generations/${f.generation}/`:'')+suffix;
const name=(f,suffix)=>`projects/${project}/databases/(default)/documents/${relative(f,suffix)}`;
const update=(f,suffix,value,exists=true)=>({update:{name:name(f,suffix),fields:encode(value).mapValue.fields},currentDocument:{exists}});
const get=(f,suffix,token='owner')=>request(`${base}/${relative(f,suffix)}`,token);
async function commit(f,writes,token=f.owner.token){const body={writes};const r=await request(`${base}:commit`,token,'POST',body);if(token!=='owner'){f.counts.requests++;f.counts.writes+=writes.length;f.counts.maxRequestBytes=Math.max(f.counts.maxRequestBytes,Buffer.byteLength(JSON.stringify(body)));}return r;}
async function seed(f,suffix,value){ok(await commit(f,[update(f,suffix,value,false)],'owner'));}
async function put(f,suffix,value){ok(await commit(f,[update(f,suffix,value)],'owner'));}
async function fixture({axis='horizontal',order='forward',direction='right',role='owner',large=false,empty=false,block=false}={}){
 const f={show:`FAKE-${randomUUID()}`,generation:randomUUID(),owner:await actor(),other:await actor(),reader:await actor(),direction,counts:{requests:0,writes:0,maxRequestBytes:0}};
 const size=large?30:4;
 let m=createSection({name:'架空区画',rows:size,columns:size,axis,seatOrder:order,stagePosition:axis==='horizontal'?'left':'top',lines:Array.from({length:size},(_,i)=>({name:`L${i}`}))},context);
 const choices=Object.fromEntries(m.section.cells.map(c=>[`${c.row},${c.column}`,empty||(!large&&(direction==='up'?c.row===0:direction==='down'?c.row===size-1:direction==='left'?c.column===0:c.column===size-1))?'unset':'seat']));
 if(block)choices[Object.keys(choices).find(k=>choices[k]==='unset')]='space';
 m=numberInitial(m,choices,context);if(large)m=extend(m,{dimension:'columns',count:1},context).after;
 m.assignments=m.seats.slice(0,large?500:3).map((s,i)=>({seatId:s.seatId,attendeeId:`FAKE-person-${i}`,fixed:true}));
 m.ticketRefs=m.assignments.map((a,i)=>({attendeeId:a.attendeeId,ticketId:`FAKE-ticket-${i}`,credentialId:`FAKE-credential-${i}`}));
 m.receptionRefs=m.assignments.map((a,i)=>({attendeeId:a.attendeeId,receptionId:`FAKE-reception-${i}`}));
 if(m.seats.length)m.seats[0].emergencyChange={kind:'add',reason:'架空の補助席用途'};
 f.model=m;f.head={...initialHead(m),status:'countReady',revision:1,sourceRevision:1,operationId:randomUUID()};
 f.versions={schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,sectionId:m.section.sectionId,generation:f.generation,operationId:f.head.operationId,values:{commit:1,layout:1,source:1,assignment:1,attendee:1,ticket:1,control:1}};
 const refs=Object.fromEntries(['assignments','ticketRefs','receptionRefs'].map(k=>[k,m[k]]));
 const source={section:m.section,seats:m.seats};
 const records={'head/current':f.head,'versions/current':f.versions,'source/current':source,'seatReferences/current':refs,'control/current':{revision:1,firstReceptionStartedAt:null},'roles/FAKE-manager':{active:true,role,revision:1},'roles/FAKE-reader':{active:true,role:'receptionist',revision:1}};
 for(const[a,humanUid]of[[f.owner,'FAKE-manager'],[f.other,'FAKE-manager'],[f.reader,'FAKE-reader']]){
  records[`devices/${a.uid}`]={deviceUid:a.uid,humanUid,active:true,preparedRoleRevision:1};
  records[`sessions/${a.uid}`]={humanUid,active:true,emailVerified:true,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};
 }
 for(const[k,v]of Object.entries(records))await seed(f,k,v);
 return f;
}
function operation(f,direction=f.direction,who=f.owner){
 const values=clone(f.versions.values),snapshot={schemaVersion:1,environmentId:f.versions.environmentId,performanceId:f.show,generation:f.generation,versions:values,source:f.model,head:f.head};
 const command={operationId:randomUUID(),kind:'slide',environmentId:snapshot.environmentId,performanceId:f.show,expectedGeneration:f.generation,expectedVersions:clone(values),direction,amount:1};
 const after=slide(projectView(f.model,f.head,context),command,context).after,plan=planSlide(snapshot,command,after,context);
 assert.equal(plan.route,'offsetUpdate');
 const[dr,dc]=deltas[direction],id=plan.operationId;
 return {id,after:{...clone(f.head),revision:f.head.revision+1,operationId:id,rowOffset:plan.rowOffset,columnOffset:plan.columnOffset},versions:{...clone(f.versions),operationId:id,values:{...values,commit:values.commit+1,layout:values.layout+1}},history:{kind:'slide',deviceUid:who.uid,environmentId:plan.environmentId,performanceId:f.show,generation:f.generation,sectionId:f.head.sectionId,expectedVersions:values,baseRevision:f.head.revision,revision:f.head.revision+1,dr,dc}};
}
const writes=(f,o)=>[update(f,'head/current',o.after),update(f,'versions/current',o.versions),update(f,`events/${o.id}`,o.history,false)];
async function capture(f){return Promise.all(['head/current','versions/current','source/current','seatReferences/current'].map(async k=>{const r=await get(f,k);ok(r);return data(r);}));}
async function reject(f,ws,token=f.owner.token,check=denied){const before=await capture(f),event=ws.find(w=>w.update?.name.includes('/events/'))?.update.name;const readEvent=()=>event?request(`${base}/${event.split('/documents/')[1]}`,'owner'):null;const prior=await readEvent();check(await commit(f,ws,token));assert.deepEqual(await capture(f),before);if(event)assert.deepEqual(await readEvent(),prior);}
function advance(f,o){f.head=o.after;f.versions=o.versions;}
async function record(description,fn){const result=await fn();reports.push({id:`S${String(reports.length+1).padStart(2,'0')}`,description,status:'passed',...(result??{})});console.log(`passed ${reports.at(-1).id}`);}

for(const axis of ['horizontal','vertical'])for(const order of ['forward','reverse'])for(const direction of Object.keys(deltas))await record('軸・順序・方向と3件の一体保存',async()=>{
 const f=await fixture({axis,order,direction}),before=await capture(f),o=operation(f);ok(await commit(f,writes(f,o)));advance(f,o);
 const after=await capture(f);assert.deepEqual(after[0],o.after);assert.deepEqual(after[1],o.versions);assert.deepEqual(after.slice(2),before.slice(2));
 assert.deepEqual(projectView(f.model,f.head,context),slide(f.model,{direction,amount:1},context).after);
 const event=await get(f,`events/${o.id}`,f.owner.token);ok(event);assert.deepEqual(data(event),o.history);assert(!Object.hasOwn(data(event),'reason'));assert.equal(f.counts.writes,3);return {axis,order,direction,writes:3};
});
for(const key of ['commit','layout','source','assignment','attendee','ticket','control'])await record('最新の版変更を古い期待版で上書きしない：'+key,async()=>{
 const f=await fixture(),o=operation(f),v=clone(f.versions);v.values[key]++;await put(f,'versions/current',v);await reject(f,writes(f,o));
});
for(let mask=1;mask<7;mask++)await record('3件中の部分送信を拒否：'+mask,async()=>{const f=await fixture(),o=operation(f);await reject(f,writes(f,o).filter((_,i)=>mask&(1<<i)));});
const mutations=[
 ['移動量改変',o=>o.after.columnOffset=2],['構成版改変',o=>o.after.sourceRevision++],['外周集計改変',o=>o.after.columnCounts={'0':0}],
 ['区画名の同時変更',o=>o.after.sectionName='別名'],['舞台の同時変更',o=>o.after.stagePosition='top'],['席数の同時変更',o=>o.after.nonEmptyCount++],
 ['理由の混入',o=>o.history.reason='不要'],['履歴方向と配置の不一致',o=>o.history.dc=-1],['斜め移動',o=>o.history.dr=1],['移動量2',o=>o.history.dc=2],
 ['履歴の版改変',o=>o.history.revision++],['履歴の期待版改変',o=>o.history.expectedVersions.ticket++],['履歴の期待版欠落',o=>delete o.history.expectedVersions.control],
 ['履歴の操作者偽装',o=>o.history.deviceUid='FAKE-other'],['別環境',o=>o.history.environmentId='FAKE-other'],['別公演',o=>o.history.performanceId='FAKE-other'],
 ['別世代',o=>o.history.generation=randomUUID()],['別区画',o=>o.history.sectionId=randomUUID()],['未対応操作',o=>o.history.kind='replaceGeneration'],
 ['共通版の世代差替え',o=>o.versions.generation=randomUUID()],['共通版の形式変更',o=>o.versions.schemaVersion=2],['共通版の余分な項目',o=>o.versions.extra=true],
 ['共通版の更新量改変',o=>o.versions.values.commit++],['論理配置版の更新漏れ',o=>o.versions.values.layout--],['元構成版の更新',o=>o.versions.values.source++],
 ['割当版の同時更新',o=>o.versions.values.assignment++],['来場者版の同時更新',o=>o.versions.values.attendee++],['券版の同時更新',o=>o.versions.values.ticket++],
 ['管理版の同時更新',o=>o.versions.values.control++],['操作IDの不一致',o=>o.versions.operationId=randomUUID()]
];
for(const[label,mutate]of mutations)await record('直接要求を拒否：'+label,async()=>{const f=await fixture(),o=operation(f);mutate(o);await reject(f,writes(f,o));});
const authority=[
 ['端末停止',f=>[`devices/${f.owner.uid}`,d=>d.active=false]],['端末UID偽装',f=>[`devices/${f.owner.uid}`,d=>d.deviceUid=f.other.uid]],
 ['本人結合の不一致',f=>[`sessions/${f.owner.uid}`,d=>d.humanUid='FAKE-other']],['セッション停止',f=>[`sessions/${f.owner.uid}`,d=>d.active=false]],
 ['メール未確認',f=>[`sessions/${f.owner.uid}`,d=>d.emailVerified=false]],['期限切れ',f=>[`sessions/${f.owner.uid}`,d=>d.expiresAt={$timestamp:'2000-01-01T00:00:00Z'}]],
 ['役割停止',()=>['roles/FAKE-manager',d=>d.active=false]],['役割版失効',()=>['roles/FAKE-manager',d=>d.revision++]],
 ['一般受付へ変更',()=>['roles/FAKE-manager',d=>d.role='receptionist']],['臨時管理者へ変更',()=>['roles/FAKE-manager',d=>d.role='temporary']],
 ['管理版変更',()=>['control/current',d=>d.revision++]]
];
for(const[label,select]of authority)await record('入力後の権限・管理状態変更を拒否：'+label,async()=>{const f=await fixture(),o=operation(f),[suffix,mutate]=select(f),v=data(await get(f,suffix));mutate(v);await put(f,suffix,v);await reject(f,writes(f,o));const r=await get(f,'head/current',f.reader.token);ok(r);});
await record('代理は許可し一般受付と未認証は拒否',async()=>{const f=await fixture({role:'deputy'}),o=operation(f);await reject(f,writes(f,o),f.reader.token);await reject(f,writes(f,o),null);ok(await commit(f,writes(f,o)));});
await record('別公演の端末資格は流用できない',async()=>{const f=await fixture(),other=await fixture(),o=operation(f);await reject(f,writes(f,o),other.owner.token);});
await record('固定した元構成・割当・QRと既存理由を同時改変できない',async()=>{
 const f=await fixture(),o=operation(f),source=data(await get(f,'source/current')),refs=data(await get(f,'seatReferences/current'));
 for(const [suffix,value]of[
  ['source/current',{...clone(source),seats:[]}],['source/current',{...clone(source),section:{...clone(source.section),name:'別名'}}],
  ['source/current',{...clone(source),seats:source.seats.map((s,i)=>i? s:{...s,emergencyChange:{kind:'add',reason:'別用途'}})}],
  ['seatReferences/current',{...clone(refs),assignments:[]}],['seatReferences/current',{...clone(refs),ticketRefs:[]}],['seatReferences/current',{...clone(refs),receptionRefs:[]}]
 ])await reject(f,[...writes(f,o),update(f,suffix,value)]);
 return {tamperingVariants:6};
});
await record('非未の外周と全未の直接移動を拒否',async()=>{for(const empty of [false,true]){const f=await fixture({empty,block:!empty});const valid=await fixture();const o=operation(valid);o.after={...clone(f.head),revision:2,operationId:o.id,columnOffset:1};o.versions={...clone(f.versions),operationId:o.id,values:{...f.versions.values,commit:2,layout:2}};Object.assign(o.history,{deviceUid:f.owner.uid,performanceId:f.show,generation:f.generation,sectionId:f.head.sectionId});await reject(f,writes(f,o));}});
await record('同じ基準の同時確定は一方だけ成功',async()=>{
 const f=await fixture(),a=operation(f),b=operation(f,f.direction,f.other),results=await Promise.all([commit(f,writes(f,a)),commit(f,writes(f,b),f.other.token)]);
 assert.equal(results.filter(r=>r.status===200).length,1);denied(results.find(r=>r.status!==200));const winner=results[0].status===200?a:b,loser=winner===a?b:a;
 assert.deepEqual(data(await get(f,'head/current')),winner.after);assert.deepEqual(data(await get(f,'versions/current')),winner.versions);assert.equal((await get(f,`events/${loser.id}`)).status,404);return {winners:1};
});
await record('応答を利用せず再開して同じIDの履歴を照会し再確定を拒否',async()=>{
 const f=await fixture(),o=operation(f);await commit(f,writes(f,o));const r=await get(f,`events/${o.id}`,f.owner.token);ok(r);assert.deepEqual(data(r),o.history);
 await reject(f,writes(f,o),f.owner.token,conflict);const altered=clone(o);altered.history.dc=-1;await reject(f,writes(f,altered),f.owner.token,conflict);
 advance(f,o);const back=operation(f,'left');ok(await commit(f,writes(f,back)));advance(f,back);assert.equal(f.head.columnOffset,0);assert.equal(f.versions.values.commit,3);assert.deepEqual(data(await get(f,`events/${o.id}`,f.owner.token)),o.history);
});
await record('履歴・共通版・元構成の単独削除と更新を拒否',async()=>{const f=await fixture(),o=operation(f);ok(await commit(f,writes(f,o)));for(const suffix of [`events/${o.id}`,'versions/current','source/current','seatReferences/current']){await reject(f,[{delete:name(f,suffix)}]);const r=await get(f,suffix);ok(r);await reject(f,[update(f,suffix,{...data(r),extra:true})]);}});
await record('930セルと500人の架空参照でも3書込みを維持',async()=>{
 const f=await fixture({large:true}),before=await capture(f),o=operation(f);ok(await commit(f,writes(f,o)));advance(f,o);const after=await capture(f);assert.deepEqual(after.slice(2),before.slice(2));assert.equal(after[2].section.cells.length,930);assert.equal(after[3].assignments.length,500);assert.equal(f.counts.requests,1);assert.equal(f.counts.writes,3);return {cells:930,seats:900,assignedReferences:500,commit:clone(f.counts),seedAndVerificationIOExcluded:true};
});
const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project,runtime:process.version,executedAt:new Date().toISOString(),hashLineEndings:'LF',sourceHashes,endSourceHashes,scope:'One-section slide with server-owned shared version checks, existing simplified device/session/role authorization and reciprocal three-document atomic commit. Source, counters, references, versions and authority evidence are admin-seeded. No initial-build integration, version publication lifecycle for other operations, formal identity flow, QR validity check, complete auth policy, multi-section, SDK, IndexedDB or devices.',reports},null,2)+'\n');
console.log(JSON.stringify({scenarios:reports.length,passed:reports.length}));
