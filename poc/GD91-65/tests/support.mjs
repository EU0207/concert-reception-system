import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import * as life from '../../GD91-64/tests/support.mjs';
import {anonymous,human as makeHuman,timed as accessTimed,commit as accessCommit,projection} from '../../GD91-60/tests/access-support.mjs';
import {createSection,numberInitial} from '../../GD91-07/planner.mjs';
import {issueCatalog,doc,parts} from '../../GD91-60/tests/support.mjs';
import {complete,put,stored as sourceStored,binding} from '../../GD91-60/tests/global-support.mjs';
import {finish as finishCandidate} from '../../GD91-60/tests/candidate-support.mjs';
export {secondManager,register,registration,registrationWrites,paidPlan,assignment,apply,ticketPlan,rebuild,returnPlan,noTicketPlan,noTicketWrites,version,stored,snapshot,reject,seed,path,write,commit,ok,request,base} from '../../GD91-64/tests/support.mjs';
const {seed,path,write,commit,ok,stored,version,request,base}=life;
export const scope=f=>({schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show});
export function eventWrite(f,o){const w=write(path(f,'operations/'+o.id),o.event,false);w.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];return w;}
export async function fixture({controlRevision=1}={}){
 const person=await makeHuman('google.com'),manager=await anonymous(),f={show:'FAKE-'+randomUUID(),person,manager,human:person.uid,seats:[]},s={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show};
 await seed(path(f,'roles/'+person.uid),{...s,role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:'2000-01-01T00:00:00Z'},endsAt:{$timestamp:'2100-01-01T00:00:00Z'}});
 await seed(path(f,'devices/'+manager.uid),{...s,deviceUid:manager.uid,humanUid:person.uid,active:true,preparedRoleRevision:1,preparedDataRevision:1});
 f.control={...scope(f),state:'preparing',revision:controlRevision,dataRevision:1,firstReceptionStartedAt:null,operationId:'',dayStartsAt:{$timestamp:'2099-01-01T00:00:00Z'}};
 await seed(path(f,'control/current'),f.control);await seed(path(f,'publicStatus/current'),projection(f.control));
 const session={...s,deviceUid:manager.uid,humanUid:person.uid,active:true,emailVerified:true,authProvider:person.provider,roleRevision:1,revision:1,humanAuthTime:person.authTime,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};
 ok(await accessCommit({show:f.show,device:manager},[accessTimed({show:f.show},'sessions/'+manager.uid,session,'issuedAt',false)],person.token));return f;
}
export async function initPlan(f){
 const id=randomUUID(),c=await stored(f,'control/current'),values={commit:1,layout:0,source:0,assignment:0,attendee:1,ticket:1,control:c.revision,reception:1};
 const o={id,versions:{...scope(f),operationId:id,values,sections:{},seatIds:[],usedIds:[],usedGenerations:[]},people:{...scope(f),revision:1,operationId:id,attendeeIds:[]},tickets:{...scope(f),revision:1,operationId:id,seatIds:[],protectedAttendeeIds:[]},event:{...scope(f),operationId:id,kind:'bootstrapBusiness',deviceUid:f.manager.uid,humanUid:f.person.uid,controlRevision:c.revision,expectedVersions:null,resultVersions:values}};return initWrites(f,o);
}
export function initWrites(f,o){o.writes=[write(path(f,'versions/current'),o.versions,false),write(path(f,'eligible/current'),o.people,false),write(path(f,'ticketProtection/current'),o.tickets,false),eventWrite(f,o)];return o;}
export async function initialize(f){const o=await initPlan(f);ok(await commit(o.writes,f.manager.token));return o;}
export async function prepareFirst(f){
 const raw=createSection({name:'架空初回区画',rows:1,columns:4,axis:'horizontal',seatOrder:'forward',lines:[{name:'A'}]},{maxCells:10000}),model=numberInitial(raw,Object.fromEntries(raw.section.cells.map(c=>[c.row+','+c.column,'seat'])),{maxCells:10000});
 f.section=model.section.sectionId;f.old={environmentId:'FAKE-environment',performanceId:f.show,generation:'',model};f.next={...f.old,generation:randomUUID()};f.seats=model.seats.map(s=>s.seatId);const s=model.section,v=await version(f);
 f.head={environmentId:'FAKE-environment',performanceId:f.show,sectionId:f.section,generation:f.next.generation,baseGeneration:'',status:'building',controlRevision:v.values.control,rows:s.rows,columns:s.columns,axis:s.axis,seatOrder:s.seatOrder,lines:s.lineSettings,comparisonPlan:'seatId',protectionRevision:v.values.ticket,expectedVersions:v.values};
 // 構成入力headと制御は前提。片・証明・候補は本人端末の通常要求で作る。
 await seed(doc(f,'head/current'),f.head);await seed('sourceProofShows/'+f.show+'/control/current',{revision:v.values.control,activeGeneration:f.next.generation,publishedGeneration:'',phase:'preparing'});
 await issueCatalog(f);await complete(f);
 ok(await put(f,'comparisonResult/current',{...binding(f),operationId:f.next.generation,proofPlan:'GD91-57',changedSeatIds:[],protectionRevision:v.values.ticket,seats:f.seats.length},false));
 f.candidate=await finishCandidate(f);return f;
}
export async function firstPlan(f){
 const b=await version(f),m=f.candidate,id=randomUUID(),values={...b.values,commit:b.values.commit+1,layout:1,source:1,assignment:1,reception:b.values.reception+1};
 const o={id,versions:{...structuredClone(b),operationId:id,values,sections:{[f.section]:m.generation},seatIds:m.seatIds,usedIds:m.entityIds,usedGenerations:[m.generation]},assignment:{...scope(f),revision:1,operationId:id,publicationOperationId:id,assignments:Object.fromEntries(m.seatIds.map(id=>[id,'']))},event:{...scope(f),operationId:id,kind:'publishSection',deviceUid:f.manager.uid,humanUid:f.person.uid,controlRevision:b.values.control,expectedVersions:b.values,resultVersions:values,sectionId:f.section,generation:m.generation,baseGeneration:'',removed:{},added:Object.fromEntries(m.seatIds.map(id=>[id,''])),changed:{}}};return firstWrites(f,o);
}
export function firstWrites(f,o){o.writes=[write(path(f,'versions/current'),o.versions,true),write(path(f,'assignmentState/current'),o.assignment,false),eventWrite(f,o)];return o;}
export async function publish(f){const o=await firstPlan(f);ok(await commit(o.writes,f.manager.token));return o;}
export async function absent(f,p){assert.equal((await request(base+'/'+path(f,p),f.manager.token)).status,404);}
export async function subsets(f,o,extra=[]){const before=await life.snapshot(f,['ticketProtection/current','operations/'+o.id,...extra]);for(let mask=1;mask<2**o.writes.length-1;mask++){const r=await commit(o.writes.filter((_,i)=>mask&(1<<i)),f.manager.token);assert([403,409].includes(r.status),JSON.stringify({mask,r}));assert.deepEqual(await life.snapshot(f,['ticketProtection/current','operations/'+o.id,...extra]),before);}return 2**o.writes.length-2;}
