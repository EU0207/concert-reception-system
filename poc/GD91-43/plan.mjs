import {isDeepStrictEqual} from 'node:util';
import {validate} from '../GD91-07/planner.mjs';

// 隔離検証の論理計画。最新状態の取得、認可とサーバー保存は別の責務。
export class PlanError extends Error {constructor(code){super(code);this.code=code;}}
const need=(ok,code)=>{if(!ok)throw new PlanError(code);};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,k)=>object(v)&&isDeepStrictEqual(Object.keys(v).sort(),[...k].sort());
const versionKeys=['commit','layout','source','assignment','attendee','ticket','control','reception'];
const versions=v=>keys(v,versionKeys)&&Object.values(v).every(n=>Number.isSafeInteger(n)&&n>=0)&&v.commit>0&&v.reception>0;
const typeIds=entry=>[[entry.generation,'generation'],[entry.model.section.sectionId,'section'],
 ...entry.model.section.lineSettings.map(x=>[x.lineId,'line']),...entry.model.section.cells.map(x=>[x.cellId,'cell']),...entry.model.seats.map(x=>[x.seatId,'seat'])];
function canonical(model){
 const a=structuredClone(model);
 a.section.cells.sort((x,y)=>x.cellId.localeCompare(y.cellId));
 a.section.lineSettings.sort((x,y)=>x.lineId.localeCompare(y.lineId));
 a.seats.sort((x,y)=>x.seatId.localeCompare(y.seatId));return a;
}
function model(entry,context){
 need(keys(entry,['generation','model'])&&uuid(entry.generation),'INVALID_SECTION');
 need(keys(entry.model,['section','seats','assignments','ticketRefs','initialNumbered']),'INCOMPLETE_MODEL');
 need(Array.isArray(entry.model.assignments)&&Array.isArray(entry.model.ticketRefs)
   &&entry.model.assignments.length===0&&entry.model.ticketRefs.length===0,'DUPLICATED_BUSINESS_STATE');
 try{validate(entry.model,context);}catch{throw new PlanError('INVALID_LAYOUT');}
 need(entry.model.initialNumbered===true,'UNPREPARED_SECTION');
 for(const seat of entry.model.seats)need(['general','reserved','special'].includes(seat.category)&&typeof seat.usable==='boolean','INVALID_SEAT_ATTRIBUTES');
}
function inspect(snapshot,context){
 need(keys(snapshot,['schemaVersion','environmentId','performanceId','versions','sections','assignments','ticketRefs','receptionRefs','retiredIds','state','onDay'])
   &&snapshot.schemaVersion===1&&versions(snapshot.versions),'INCOMPLETE_SNAPSHOT');
 need(typeof snapshot.environmentId==='string'&&snapshot.environmentId.trim()&&typeof snapshot.performanceId==='string'&&snapshot.performanceId.trim(),'INVALID_SCOPE');
 need(Array.isArray(snapshot.sections)&&object(snapshot.assignments)&&Array.isArray(snapshot.ticketRefs)
   &&Array.isArray(snapshot.receptionRefs)&&Array.isArray(snapshot.retiredIds),'INCOMPLETE_SNAPSHOT');
 need(snapshot.retiredIds.every(uuid)&&new Set(snapshot.retiredIds).size===snapshot.retiredIds.length,'INVALID_RETIRED_IDS');
 const ids=new Map(),seats=new Set();
 for(const entry of snapshot.sections){model(entry,context);for(const[id,type]of typeIds(entry)){
   need(uuid(id)&&!ids.has(id)&&!snapshot.retiredIds.includes(id),'DUPLICATED_ID');ids.set(id,{type,sectionId:entry.model.section.sectionId});}
   for(const seat of entry.model.seats)seats.add(seat.seatId);
 }
 need(isDeepStrictEqual(Object.keys(snapshot.assignments).sort(),[...seats].sort()),'INCOMPLETE_ASSIGNMENTS');
 const people=Object.values(snapshot.assignments).filter(x=>x!=='');
 need(people.every(uuid)&&new Set(people).size===people.length&&people.length<=500,'INVALID_ASSIGNMENTS');
 const protectedIds=new Set(Object.entries(snapshot.assignments).filter(([,v])=>v!=='').map(([id])=>id));
 for(const t of snapshot.ticketRefs){need(object(t)&&uuid(t.ticketId)&&uuid(t.seatId)&&typeof t.active==='boolean','INCOMPLETE_TICKET_REFERENCE');
   if(t.active){need(seats.has(t.seatId),'BROKEN_ACTIVE_TICKET');protectedIds.add(t.seatId);}}
 need(snapshot.state==='preparing'&&snapshot.onDay===false,'UNSUPPORTED_STATE');
 return{ids,seats,protectedIds};
}
export function planPublication(snapshot,command,proposed,context){
 const{ids,protectedIds}=inspect(snapshot,context);
 need(keys(command,['operationId','kind','environmentId','performanceId','sectionId','expectedGeneration','expectedVersions'])
   &&uuid(command.operationId)&&uuid(command.sectionId)&&versions(command.expectedVersions),'INVALID_COMMAND');
 need(['addSection','replaceSection'].includes(command.kind),'UNSUPPORTED_OPERATION');
 need(command.environmentId===snapshot.environmentId&&command.performanceId===snapshot.performanceId,'WRONG_SCOPE');
 need(isDeepStrictEqual(command.expectedVersions,snapshot.versions),'STALE_BASE');
 const before=snapshot.sections.find(s=>s.model.section.sectionId===command.sectionId);
 need(command.kind==='addSection'?!before&&command.expectedGeneration==='':!!before&&before.generation===command.expectedGeneration,'STALE_SECTION');
 model(proposed,context);need(proposed.model.section.sectionId===command.sectionId,'WRONG_SECTION');
 const oldIds=new Map(before?typeIds(before):[]),nextIds=new Map(typeIds(proposed));
 need(nextIds.size===typeIds(proposed).length,'DUPLICATED_ID');
 for(const[id,type]of nextIds){const old=ids.get(id);
   need(!snapshot.retiredIds.includes(id)&&(!old||old.sectionId===command.sectionId&&old.type===type&&type!=='generation'),'REUSED_OR_FOREIGN_ID');
 }
 if(before){
   const nextSeats=new Map(proposed.model.seats.map(s=>[s.seatId,s])),cells=new Map(proposed.model.section.cells.map(c=>[c.cellId,c]));
   for(const seat of before.model.seats)if(protectedIds.has(seat.seatId)){
     need(isDeepStrictEqual(nextSeats.get(seat.seatId),seat),'PROTECTED_SEAT');
     const cell=before.model.section.cells.find(c=>c.seatId===seat.seatId);
     need(isDeepStrictEqual(cells.get(cell.cellId),cell),'PROTECTED_POSITION');
   }
   need(!isDeepStrictEqual(canonical(before.model),canonical(proposed.model)),'NO_CHANGE');
 }
 const after=structuredClone(snapshot),at=after.sections.findIndex(s=>s.model.section.sectionId===command.sectionId);
 if(at<0)after.sections.push(structuredClone(proposed));else after.sections[at]=structuredClone(proposed);
 const removed=[...oldIds.keys()].filter(id=>!nextIds.has(id));
 const added=[...nextIds.keys()].filter(id=>!oldIds.has(id));
 const removedSeats=removed.filter(id=>oldIds.get(id)==='seat'),addedSeats=added.filter(id=>nextIds.get(id)==='seat');
 for(const id of removedSeats){need(after.assignments[id]===''&&!protectedIds.has(id),'PROTECTED_SEAT');delete after.assignments[id];}
 for(const id of addedSeats){need(!Object.hasOwn(after.assignments,id),'REUSED_OR_FOREIGN_ID');after.assignments[id]='';}
 after.retiredIds.push(...removed);
 const assignmentChanged=snapshot.sections.length===0||removedSeats.length>0||addedSeats.length>0;
 for(const k of ['commit','layout','source','reception'])after.versions[k]++;
 if(assignmentChanged)after.versions.assignment++;
 need(versions(after.versions),'VERSION_OVERFLOW');inspect(after,context);
 return{operationId:command.operationId,kind:command.kind,route:'stageThenPublish',sectionId:command.sectionId,
   expectedGeneration:command.expectedGeneration,nextGeneration:proposed.generation,expectedVersions:structuredClone(snapshot.versions),
   addedSeatIds:addedSeats,removedSeatIds:removedSeats,retiredIds:removed,assignmentChanged,after};
}
