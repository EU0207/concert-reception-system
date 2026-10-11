import * as previous from '../../GD91-67/tests/support.mjs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {rosterProjection} from '../../GD91-67/projection.mjs';
import {allocate,splitGroup,unlockGroup,reallocateGroup,undoReallocation} from '../../GD91-66/allocation.mjs';
export * from '../../GD91-67/tests/support.mjs';
const {scope,stored,path,write,commit,ok,eventWrite}=previous;
export async function initPlan(f){const o=await previous.initPlan(f);o.people.groups={};return previous.initWrites(f,o);}
export async function initialize(f){const o=await initPlan(f);ok(await commit(o.writes,f.manager.token));return o;}
export async function registration(f,options={}){
 const o=await previous.registration(f,options),g=o.profile.groupId;
 if(g!==null)o.index.groups={...o.index.groups,[g]:(o.index.groups[g]??[]).concat([o.attendeeId])};
 return o;
}
export async function register(f,options){const o=await registration(f,options);ok(await commit(previous.registrationWrites(f,o),f.manager.token));return o;}
export async function firstPlan(f){const o=await previous.firstPlan(f);o.assignment.groups={};o.assignment.bulkOperationId='';return previous.firstWrites(f,o);}
export async function publish(f){const o=await firstPlan(f);ok(await commit(o.writes,f.manager.token));return o;}
export async function fixture(options={}){const f=await previous.rawFixture(options);await initialize(f);if(!options.noLayout){await previous.prepareFirst(f,options);await publish(f);}return f;}
export async function calculationSnapshot(f){
 const v=await previous.version(f),s=await stored(f,'assignmentState/current'),people=rosterProjection(v,await stored(f,'eligible/current'),await stored(f,'ticketProtection/current'));
 const m=f.next.model,section=m.section,lines=section.lineSettings;
 return {...scope(f),completeRoster:true,versions:v.values,people,groupStates:s.groups,assignments:s.assignments,
  sections:[{sectionId:f.section,displayOrder:0,axis:section.axis,seatOrder:section.seatOrder}],
  seats:m.seats.map(s=>{const c=section.cells.find(c=>c.seatId===s.seatId),l=lines[section.axis==='horizontal'?c.row:c.column];return {...s,row:c.row,column:c.column,lineId:l.lineId,lineOrder:l.index,category:s.category==='special'?'reserved':s.category};})};
}
export async function bulk(f,kind,options={}){
 const before=await stored(f,'assignmentState/current'),v=await previous.version(f),input=await calculationSnapshot(f),id=randomUUID();
 const command={environmentId:input.environmentId,performanceId:f.show,expectedVersions:v.values,operationId:id,mode:'roster',...options};
 let previousEvent;
 if(kind==='reallocateGroup'||kind==='undoReallocation'){
  const e=await stored(f,'operations/'+v.operationId),h=e.payload;
  const keys=Object.keys(h.after.assignments).filter(k=>h.before.assignments[k]!==h.after.assignments[k]);
  previousEvent={schemaVersion:1,environmentId:input.environmentId,performanceId:f.show,operationId:e.operationId,kind:e.kind,groupId:h.groupId,reason:h.reason,resultVersions:e.resultVersions,
   before:{assignments:Object.fromEntries(keys.map(k=>[k,h.before.assignments[k]])),groupStates:{[h.groupId]:e.kind==='reallocateGroup'?h.undoGroups[h.groupId]:h.before.groups[h.groupId]}},after:{assignments:Object.fromEntries(keys.map(k=>[k,h.after.assignments[k]])),groupStates:{[h.groupId]:h.after.groups[h.groupId]}}};
 }
 const calc=({autoAllocation:allocate,splitGroup,unlockGroup,reallocateGroup,undoReallocation})[kind](input,command,previousEvent),after={...before,revision:before.revision+1,operationId:id,bulkOperationId:id,assignments:calc.after.assignments,groups:calc.after.groupStates};
 const changed=Object.keys(after.assignments).filter(s=>after.assignments[s]!==before.assignments[s]),beforeChanges=Object.fromEntries(changed.map(s=>[s,before.assignments[s]])),afterChanges=Object.fromEntries(changed.map(s=>[s,after.assignments[s]]));
 const people=input.people,groups=new Map();
 if(!['unlockGroup','undoReallocation'].includes(kind))for(const p of people){const seat=Object.keys(after.assignments).find(s=>after.assignments[s]===p.attendeeId);if(!seat||kind==='autoAllocation'&&!Object.hasOwn(afterChanges,seat)||kind!=='autoAllocation'&&p.groupId!==options.groupId)continue;const key=p.groupId??p.attendeeId;if(!groups.has(key))groups.set(key,{groupId:p.groupId,members:[],seats:[],sections:[]});const unit=groups.get(key);unit.members.push(p.attendeeId);unit.seats.push(seat);unit.sections.push(input.seats.find(s=>s.seatId===seat).sectionId);}
 let undoGroups={};if(kind==='reallocateGroup')undoGroups=(await stored(f,'operations/'+v.operationId)).payload.before.groups;
 const h={...scope(f),operationId:id,kind,deviceUid:f.manager.uid,humanUid:f.person.uid,expectedVersions:v.values,baseOperationId:v.operationId,before,after,beforeChanges,afterChanges,groupId:options.groupId??null,reason:options.reason??'',units:[...groups.values()],order:options.randomOrder??[],undoGroups};
 const versions={...v,operationId:id,values:calc.after.versions};
 const o={id,header:h,after,versions,event:{...scope(f),operationId:id,kind,deviceUid:f.manager.uid,humanUid:f.person.uid,controlRevision:v.values.control,expectedVersions:v.values,resultVersions:versions.values,targetId:'',payload:{before,after,groupId:h.groupId,reason:h.reason,order:h.order,undoGroups}}};
 return finalWrites(f,o);
}
export function finalWrites(f,o){o.writes=[write(path(f,'versions/current'),o.versions,true),write(path(f,'assignmentState/current'),o.after,true),eventWrite(f,o)];return o;}
export function initialProgress(){return {unit:0,member:0,seenSeats:[],seenPeople:[],sectionId:'',lineId:'',row:0,column:0};}
export async function header(f,o){ok(await commit([write(path(f,'bulkPlans/'+o.id),o.header,false)],f.manager.token));}
export async function prove(f,o){
 await header(f,o);let q=initialProgress();ok(await commit([write(path(f,'bulkPlans/'+o.id+'/progress/current'),q,false)],f.manager.token));
 while(q.unit<o.header.units.length){const u=o.header.units[q.unit],seat=u.seats[q.member],cell=f.next.model.section.cells.find(c=>c.seatId===seat),last=q.member+1===u.members.length;
  const line=f.next.model.section.lineSettings[f.next.model.section.axis==='horizontal'?cell.row:cell.column];
  q={unit:q.unit+(last?1:0),member:last?0:q.member+1,seenSeats:q.seenSeats.concat([seat]),seenPeople:q.seenPeople.concat([u.members[q.member]]),sectionId:last?'':u.sections[q.member],lineId:last?'':line.lineId,row:last?0:cell.row,column:last?0:cell.column};
  const r=await commit([write(path(f,'bulkPlans/'+o.id+'/progress/current'),q,true)],f.manager.token);
  if(r.status!==200)throw new Error(JSON.stringify({progress:q,unit:u,response:r}));
 }return q;
}
export async function confirm(f,o){ok(await commit(o.writes,f.manager.token));assert.deepEqual(await stored(f,'assignmentState/current'),o.after);return o;}
