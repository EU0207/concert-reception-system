import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createSection,numberInitial} from '../../GD91-07/planner.mjs';
import {actor,human,issue,commit,update,get,data,ok,denied,seed} from './transport.mjs';

const context={maxCells:10000};
const scoped=f=>({schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show});
export function section(n=2,name='架空区画') {
 const raw=createSection({name,rows:1,columns:Math.max(1,n),axis:'horizontal',seatOrder:'forward',lines:[{name:'A'}]},context);
 return {generation:randomUUID(),model:numberInitial(raw,Object.fromEntries(raw.section.cells.map(c=>[`${c.row},${c.column}`,n?'seat':'unset'])),context)};
}
export function manifest(f,entry,base=null) {
 const m=entry.model,s=m.section,old=base?.model;
 const changed=old?old.seats.filter(seat=>{const next=m.seats.find(s=>s.seatId===seat.seatId);return !isDeepStrictEqual(next,seat)||!isDeepStrictEqual(m.section.cells.find(c=>c.seatId===seat.seatId),old.section.cells.find(c=>c.seatId===seat.seatId));}).map(s=>s.seatId):[];
 return {...scoped(f),sectionId:s.sectionId,generation:entry.generation,baseGeneration:base?.generation??'',ready:true,
  seatIds:m.seats.map(s=>s.seatId),entityIds:[s.sectionId,...s.lineSettings.map(l=>l.lineId),...s.cells.map(c=>c.cellId),...m.seats.map(s=>s.seatId)],changedSeatIds:changed};
}
export async function fixture({people=2,role='owner'}={}) {
 const f={show:'FAKE-'+randomUUID(),owner:await actor(),reader:await actor(),human:await human(['owner','deputy'].includes(role)?'google.com':'password'),readerHuman:await human('password'),sessionCosts:{requests:0,writes:0},entries:[],people:Array.from({length:people},()=>randomUUID())};
 const authScope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show},period={startsAt:{$timestamp:'2000-01-01T00:00:00Z'},endsAt:{$timestamp:'2100-01-01T00:00:00Z'}};
 f.versions={...scoped(f),operationId:randomUUID(),values:{commit:1,layout:0,source:0,assignment:0,attendee:1,ticket:1,control:1,reception:1},sections:{},seatIds:[],usedIds:[],usedGenerations:[]};
 f.assignment={...scoped(f),revision:0,operationId:f.versions.operationId,publicationOperationId:f.versions.operationId,assignments:{}};
 const initial=[['versions/current',f.versions],['assignmentState/current',f.assignment],['control/current',{...scoped(f),state:'preparing',revision:1,dayStartsAt:{$timestamp:'2099-01-01T00:00:00Z'}}],['eligible/current',{...scoped(f),revision:1,attendeeIds:f.people}],['ticketProtection/current',{...scoped(f),revision:1,seatIds:[]}],
  ['roles/'+f.human.uid,{...authScope,...period,active:true,role,revision:1,receptionBaselineRevision:0}],['roles/'+f.readerHuman.uid,{...authScope,...period,active:true,role:'receptionist',revision:1,receptionBaselineRevision:0}]];
 for(const[a,h]of [[f.owner,f.human],[f.reader,f.readerHuman]])initial.push(['devices/'+a.uid,{...authScope,deviceUid:a.uid,humanUid:h.uid,active:true,preparedRoleRevision:1}]);
 ok(await commit(f,initial.map(([p,v])=>update(f,p,v)),'owner'));await issue(f);await issue(f,f.reader,f.readerHuman);return f;
}
export async function proposal(f,entry,base=null) {
 const m=manifest(f,entry,base);await seed(f,'candidates/'+entry.generation,m);
 const before=f.versions,after=structuredClone(before),assignment=structuredClone(f.assignment),id=randomUUID();
 const removed=(base?.model.seats??[]).map(s=>s.seatId).filter(id=>!m.seatIds.includes(id)),added=m.seatIds.filter(id=>!(base?.model.seats??[]).some(s=>s.seatId===id));
 after.sections[m.sectionId]=m.generation;after.seatIds=[...new Set(before.seatIds.filter(id=>!(base?.model.seats??[]).some(s=>s.seatId===id)).concat(m.seatIds))];
 after.usedIds=[...new Set(before.usedIds.concat(m.entityIds))];after.usedGenerations.push(m.generation);after.operationId=id;
 for(const k of ['commit','layout','source','reception'])after.values[k]++;
 const keyChange=f.entries.length===0||removed.length>0||added.length>0;
 assignment.publicationOperationId=id;
 if(keyChange){after.values.assignment++;assignment.revision++;assignment.operationId=id;for(const key of removed)delete assignment.assignments[key];for(const key of added)assignment.assignments[key]='';}
 const event={...scoped(f),operationId:id,kind:'publishSection',deviceUid:f.owner.uid,humanUid:f.human.uid,controlRevision:before.values.control,expectedVersions:structuredClone(before.values),resultVersions:structuredClone(after.values),sectionId:m.sectionId,generation:m.generation,baseGeneration:m.baseGeneration,
  removed:Object.fromEntries(removed.map(id=>[id,''])),added:Object.fromEntries(added.map(id=>[id,''])),changed:Object.fromEntries([...new Set(removed.concat(m.changedSeatIds))].map(id=>[id,'']))};
 return{id,after,assignment,event,entry,keyChange};
}
export function probe(f,mapping) {
 const id=randomUUID(),after=structuredClone(f.versions),assignment=structuredClone(f.assignment);after.operationId=id;for(const k of ['commit','assignment','reception'])after.values[k]++;
 assignment.operationId=id;assignment.revision++;assignment.assignments=structuredClone(mapping);
 const event={...scoped(f),operationId:id,kind:'assignmentProbe',deviceUid:f.owner.uid,humanUid:f.human.uid,controlRevision:f.versions.values.control,expectedVersions:structuredClone(f.versions.values),resultVersions:structuredClone(after.values),sectionId:'',generation:'',baseGeneration:'',removed:{},added:{},changed:{}};
 return{id,after,assignment,event,keyChange:true};
}
export function writes(f,p) {
 const event=update(f,'operations/'+p.id,p.event,false);event.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];
 return [update(f,'versions/current',p.after,true),event,...(p.entry||p.keyChange?[update(f,'assignmentState/current',p.assignment,true)]:[])];
}
export async function accept(f,p) {f.versions=data(await get(f,'versions/current'));f.assignment=data(await get(f,'assignmentState/current'));if(p.entry){const at=f.entries.findIndex(e=>e.model.section.sectionId===p.entry.model.section.sectionId);if(at<0)f.entries.push(p.entry);else f.entries[at]=p.entry;}}
export async function save(f,p) {const w=writes(f,p);ok(await commit(f,w));await accept(f,p);return w.length;}
export async function snapshot(f,p) {return Object.fromEntries(await Promise.all(['versions/current','assignmentState/current','operations/'+p.id].map(async path=>{const r=await get(f,path);return[path,r.status===200?data(r):r.status];})));}
export async function reject(f,p,w=writes(f,p),token=f.owner.token) {const before=await snapshot(f,p),result=await commit(f,w,token);assert([403,409].includes(result.status),JSON.stringify(result));assert.deepEqual(await snapshot(f,p),before);return result;}
export async function ready(n=2,options={}) {const f=await fixture(options);await save(f,await proposal(f,section(n)));return f;}
export function replacement(f) {const entry=structuredClone(f.entries[0]);entry.generation=randomUUID();const seat=entry.model.seats.at(-1);if(seat)seat.usable=false;else entry.model.section.stagePosition='top';return entry;}
export {commit,update,get,data,ok,denied,seed};
