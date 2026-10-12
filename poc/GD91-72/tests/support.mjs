import {randomUUID,webcrypto} from 'node:crypto';import assert from 'node:assert/strict';
import * as base from '../../GD91-71/tests/support.mjs';
import {data} from '../../GD91-60/tests/transport.mjs';
import {anonymous,human,commit as accessCommit,timed,write as accessWrite} from '../../GD91-60/tests/access-support.mjs';
export * from '../../GD91-71/tests/support.mjs';
const {version,stored,request,base:uri,path,write,commit,ok,seed,scope,currentView,project}=base;
export async function reader(f,role='receptionist'){
 const device=await anonymous(),person=await human('password'),context={show:f.show,device,human:person};
 const common={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show};
 await seed(path(f,'roles/'+person.uid),{...common,role,active:true,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:'2000-01-01T00:00:00Z'},endsAt:{$timestamp:'2100-01-01T00:00:00Z'}});
 await seed(path(f,'devices/'+device.uid),{...common,deviceUid:device.uid,humanUid:person.uid,active:true,preparedRoleRevision:1,preparedDataRevision:1});
 const session={...common,deviceUid:device.uid,humanUid:person.uid,active:true,emailVerified:true,authProvider:person.provider,roleRevision:1,revision:1,humanAuthTime:person.authTime,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};
 ok(await accessCommit(context,[timed(context,'sessions/'+device.uid,session,'issuedAt',false)],person.token));return{device,person};
}
export const distributionPath=(f,g,s)=>path(f,'receptionBuilds/'+g+'/'+s);
export const readPublic=(f,g,id,token)=>request(uri+'/'+distributionPath(f,g,'rows/'+id),token);
export async function begin(f){
 const v=await version(f),g=randomUUID(),h={generation:g,expectedVersions:v.values,seatIds:v.seatIds,sections:Object.keys(v.sections)};
 ok(await commit([write(path(f,'receptionBuilds/'+g),h,false)],f.manager.token));return{v,g,h,rows:[]};
}
export async function rows(f,o){
 const s=await stored(f,'assignmentState/current'),models=[];
 for(const raw of f.models)models.push(project(raw,await currentView(f,raw.section.sectionId)));
 for(const id of o.v.seatIds){
  const m=models.find(m=>m.seats.some(s=>s.seatId===id)),seat=m.seats.find(s=>s.seatId===id),cell=m.section.cells.find(c=>c.seatId===id),marker=seat.emergencyChange??{kind:'',reason:''};
  const geometry={seatId:id,sectionId:m.section.sectionId,row:cell.row,column:cell.column,seatNumber:(seat.numberingMode==='manual'?seat.manualNumber:seat.prefix+seat.number).trim(),category:seat.category,usable:seat.usable,emergencyKind:marker.kind,emergencyReason:marker.reason,revision:o.v.values.reception};
  ok(await commit([write(distributionPath(f,o.g,'geometry/'+id),geometry,false)],f.manager.token));
  const person=s.assignments[id],name=person?(await stored(f,'attendeeLabels/'+person)).seatDisplayName:'';
  let status='notReceived';if(person){const r=await request(uri+'/'+path(f,'receptionRecords/'+person),'owner');assert([200,404].includes(r.status));if(r.status===200)status=data(r).status;}
  const row={...geometry,seatDisplayName:name,receptionStatus:status};ok(await commit([write(distributionPath(f,o.g,'rows/'+id),row,false)],f.manager.token));o.rows.push(row);
 }return o;
}
export async function progress(f,o,{through=o.v.seatIds.length}={}){
 let q={cursor:0,lastSeatId:''};ok(await commit([write(distributionPath(f,o.g,'progress/current'),q,false)],f.manager.token));
 for(const id of o.v.seatIds.slice(0,through)){q={cursor:q.cursor+1,lastSeatId:id};ok(await commit([write(distributionPath(f,o.g,'progress/current'),q,true)],f.manager.token));}return q;
}
export async function finish(f,o){
 const a={generation:o.g,revision:o.v.values.reception,seatCount:o.v.seatIds.length,sections:Object.keys(o.v.sections)},r=await request(uri+'/'+path(f,'receptionHead/current'),f.manager.token);
 assert([200,404].includes(r.status));return commit([write(path(f,'receptionHead/current'),a,r.status===200)],f.manager.token);
}
export async function distribute(f){const o=await begin(f);await rows(f,o);await progress(f,o);ok(await finish(f,o));return o;}
const aad=d=>new TextEncoder().encode(JSON.stringify([d.performanceId,d.operationId,d.humanUid,d.formatVersion,d.baseVersions]));
export async function draftPlan(f,contents,baseVersions){
 const v=await version(f),id=randomUUID(),key=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const draft={...scope(f),operationId:id,deviceUid:f.manager.uid,humanUid:f.person.uid,expectedVersions:v.values,baseVersions:baseVersions??v.values,formatVersion:1};
 const iv=webcrypto.getRandomValues(new Uint8Array(12)),ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(draft)},key,new TextEncoder().encode(JSON.stringify(contents)));
 draft.payload={iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(ciphertext).toString('base64'),keyId:'FAKE-ephemeral'};
 const w=write(path(f,'sharedDrafts/'+id),draft,false);w.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];return{id,draft,key,writes:[w],version:v};
}
export async function decryptDraft(o,draft=o.draft){const p=draft.payload,b=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(p.iv,'base64'),additionalData:aad(draft)},o.key,Buffer.from(p.ciphertext,'base64'));return JSON.parse(new TextDecoder().decode(b));}
