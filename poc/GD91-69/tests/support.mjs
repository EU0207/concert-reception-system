import * as base from '../../GD91-68/tests/support.mjs';
import * as oldRegistration from '../../GD91-65/tests/support.mjs';
import {prepareFirst} from './structure.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {proposal,save,accept} from '../../GD91-60/tests/publication-support.mjs';
import {data} from '../../GD91-60/tests/transport.mjs';
export * from '../../GD91-68/tests/support.mjs';export {prepareFirst};
import {bulk as baseBulk} from '../node_modules/.cache/bulk-support.mjs';
export {calculationSnapshot} from './data.mjs';
const {scope,stored,write,path,commit,ok,eventWrite,version,request,base:uri}=base;
export async function fixture(options={}){const f=await base.rawFixture(options);await base.initialize(f);if(!options.noLayout){await prepareFirst(f,options);await base.publish(f);}return f;}
export async function registration(f,{groupId=null,...options}={}){
 const o=await oldRegistration.registration(f,options);o.profile.groupId=groupId;o.profile.rosterOrder=Object.keys(o.index.roster).length;
 o.index.roster={...o.index.roster,[o.attendeeId]:{groupId,rosterOrder:o.profile.rosterOrder}};
 if(groupId!==null)o.index.groups={...o.index.groups,[groupId]:(o.index.groups[groupId]??[]).concat([o.attendeeId])};return o;
}
export async function register(f,options){const o=await registration(f,options);ok(await commit(base.registrationWrites(f,o),f.manager.token));return o;}
export async function publishAdditional(f,options){await prepareFirst(f,{...options,append:true});f.oldIds=[];f.assignment=await stored(f,'assignmentState/current');f.publicationVersion=await version(f);const o=proposal(f);ok(await save(f,o));await accept(f,o);return o;}
export const bulk=baseBulk;
export async function prove(f,o){
 await base.header(f,o);let q=base.initialProgress();ok(await commit([write(path(f,'bulkPlans/'+o.id+'/progress/current'),base.initialProgress(),false)],f.manager.token));
 let proofWrites=0;
 while(q.unit<o.header.units.length){const u=o.header.units[q.unit],seat=u.seats[q.member],model=f.models.find(m=>m.section.sectionId===u.sections[q.member]),cell=model.section.cells.find(c=>c.seatId===seat),last=q.member+1===u.members.length;
  const line=model.section.lineSettings[model.section.axis==='horizontal'?cell.row:cell.column];
  q={unit:q.unit+(last?1:0),member:last?0:q.member+1,seenSeats:q.seenSeats.concat([seat]),seenPeople:q.seenPeople.concat([u.members[q.member]]),sectionId:last?'':u.sections[q.member],lineId:last?'':line.lineId,row:last?0:cell.row,column:last?0:cell.column};
  const r=await commit([write(path(f,'bulkPlans/'+o.id+'/progress/current'),q,true)],f.manager.token);if(r.status!==200)throw new Error(JSON.stringify({progress:q,response:r}));proofWrites++;
 }return {...q,proofWrites};
}
export function defaultView(f,sectionId,m){return {...scope(f),sectionId,generation:m.generation,rows:m.geometry.rows,columns:m.geometry.columns,rowOffset:0,columnOffset:0,revision:0,operationId:m.generation};}
export async function slide(f,dr,dc,sectionId=f.section){
 const v=await version(f),m=await stored(f,'candidates/'+v.sections[sectionId]),r=await request(uri+'/'+path(f,'sectionViews/'+sectionId),f.manager.token);
 assert([200,404].includes(r.status));const before=r.status===404?defaultView(f,sectionId,m):data(r),id=randomUUID(),after={...before,rowOffset:before.rowOffset+dr,columnOffset:before.columnOffset+dc,revision:before.revision+1,operationId:id};
 const versions={...v,operationId:id,values:{...v.values,commit:v.values.commit+1,layout:v.values.layout+1,reception:v.values.reception+1}};
 const o={id,before,after,versions,event:{...scope(f),operationId:id,kind:'slideSection',deviceUid:f.manager.uid,humanUid:f.person.uid,controlRevision:v.values.control,expectedVersions:v.values,resultVersions:versions.values,targetId:sectionId,payload:{sectionId,before,after,dr,dc}}};
 o.writes=[write(path(f,'versions/current'),versions,true),write(path(f,'sectionViews/'+sectionId),after,r.status===200),eventWrite(f,o)];return o;
}
export function project(model,view){const m=structuredClone(model),s=m.section;for(const c of s.cells){c.row=(c.row+view.rowOffset+s.rows)%s.rows;c.column=(c.column+view.columnOffset+s.columns)%s.columns;}const delta=s.axis==='horizontal'?view.rowOffset:view.columnOffset;for(const l of s.lineSettings)l.index=(l.index+delta+s.lineSettings.length)%s.lineSettings.length;s.lineSettings.sort((a,b)=>a.index-b.index);return m;}
