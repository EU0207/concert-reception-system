import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {ready,proposal,save,accept,stored,path} from '../../GD91-60/tests/publication-support.mjs';
import {write,commit,seed} from '../../GD91-60/tests/support.mjs';
import {ok,request,base,data,actor,human} from '../../GD91-60/tests/transport.mjs';
export {write,commit,seed,ok,stored,path,request,base,data,proposal,save,accept};
const scope=f=>({schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show});
export async function fixture({unpublished=false,unusable=false}={}){
 const f=await ready({options:{rows:1,columns:4,mixed:false},change:unusable?m=>{m.seats[3].usable=false;}:undefined});
 await seed(path(f,'eligible/current'),{...scope(f),revision:1,operationId:f.old.generation,attendeeIds:[]});
 f.seats=f.next.model.seats.map(s=>s.seatId);
 if(!unpublished){const p=proposal(f);ok(await save(f,p));await accept(f,p);}
 return f;
}
export async function version(f){return stored(f,'versions/current');}
export async function secondManager(f){
 const manager=await actor(),person=await human(),other={...f,manager,person},scope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show};
 await seed(path(f,'roles/'+person.uid),{...scope,role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:new Date(Date.now()-60000).toISOString()},endsAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}});
 await seed(path(f,'devices/'+manager.uid),{...scope,deviceUid:manager.uid,humanUid:person.uid,active:true,preparedRoleRevision:1});
 const claims=JSON.parse(Buffer.from(person.token.split('.')[1],'base64url'));
 const session={...scope,deviceUid:manager.uid,humanUid:person.uid,active:true,emailVerified:true,authProvider:person.provider,roleRevision:1,revision:1,humanAuthTime:{$timestamp:new Date(claims.auth_time*1000).toISOString()},expiresAt:{$timestamp:new Date(Date.now()+1800000).toISOString()}};
 const w=write(path(f,'sessions/'+manager.uid),session,false);w.updateTransforms=[{fieldPath:'issuedAt',setToServerValue:'REQUEST_TIME'}];ok(await commit([w],person.token));return other;
}
function next(b,id,domain,reception=true){return{...structuredClone(b),operationId:id,values:{...b.values,commit:b.values.commit+1,[domain]:b.values[domain]+1,reception:b.values.reception+(reception?1:0)}};}
async function event(f,id,kind,b,n,targetId,payload){const c=await stored(f,'control/current','owner');return{...scope(f),operationId:id,kind,deviceUid:f.manager.uid,humanUid:f.person.uid,controlRevision:c.revision,expectedVersions:b.values,resultVersions:n.values,targetId,payload};}
function eventWrite(f,o){const w=write(path(f,'operations/'+o.id),o.event,false);w.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];return w;}
export async function registration(f,{label='架空A',paid=false}={}){
 const id=randomUUID(),attendeeId=randomUUID(),b=await version(f),n=next(b,id,'attendee'),people=await stored(f,'eligible/current');
 const profile={...scope(f),attendeeId,buyerId:randomUUID(),attendancePlan:'planned',paid,revision:1,operationId:id};
 const name={...scope(f),attendeeId,seatDisplayName:label,revision:1,operationId:id};
 const index={...people,revision:n.values.attendee,operationId:id,attendeeIds:people.attendeeIds.concat([attendeeId])};
 return{id,attendeeId,profile,label:name,index,versions:n,event:await event(f,id,'attendeeCreate',b,n,attendeeId,{before:null,after:profile,label:name})};
}
export function registrationWrites(f,o){return[write(path(f,'versions/current'),o.versions,true),write(path(f,'attendees/'+o.attendeeId),o.profile,false),write(path(f,'eligible/current'),o.index,true),write(path(f,'attendeeLabels/'+o.attendeeId),o.label,false),eventWrite(f,o)];}
export async function register(f,options){const o=await registration(f,options);ok(await commit(registrationWrites(f,o),f.manager.token));return o;}
export async function paidPlan(f,id,value){
 const operationId=randomUUID(),b=await version(f),n=next(b,operationId,'attendee',false),old=await stored(f,'attendees/'+id),people=await stored(f,'eligible/current');
 const profile={...old,paid:value,revision:old.revision+1,operationId},index={...people,revision:n.values.attendee,operationId};
 const o={id:operationId,attendeeId:id,profile,index,versions:n,event:await event(f,operationId,'attendeePaid',b,n,id,{before:old,after:profile})};
 return{...o,writes:[write(path(f,'versions/current'),n,true),write(path(f,'attendees/'+id),profile,true),write(path(f,'eligible/current'),index,true),eventWrite(f,o)]};
}
export async function assignment(f,kind,{seat1=f.seats[0],seat2='',attendeeId='',reason='',section1=f.section,section2=f.section}={}){
 assert(['assign','unassign','move','swap'].includes(kind));
 const id=randomUUID(),b=await version(f),n=next(b,id,'assignment'),before=await stored(f,'assignmentState/current'),after=structuredClone(before),before1=before.assignments[seat1],before2=seat2?before.assignments[seat2]:'';
 if(kind==='assign')after.assignments[seat1]=attendeeId;
 if(kind==='unassign')after.assignments[seat1]='';
 if(kind==='move'){after.assignments[seat1]='';after.assignments[seat2]=before1;}
 if(kind==='swap'){after.assignments[seat1]=before2;after.assignments[seat2]=before1;}
 after.revision=n.values.assignment;after.operationId=id;
 const payload={seat1,seat2,section1,section2:seat2?section2:'',before1,before2,after1:after.assignments[seat1],after2:seat2?after.assignments[seat2]:'',reason};
 const o={id,before,after,versions:n,event:await event(f,id,kind,b,n,'',payload)};
 return{...o,writes:[write(path(f,'versions/current'),n,true),write(path(f,'assignmentState/current'),after,true),eventWrite(f,o)]};
}
export async function apply(f,o){ok(await commit(o.writes,f.manager.token));return o;}
export async function snapshot(f,extra=[]){return Object.fromEntries(await Promise.all(['versions/current','assignmentState/current','eligible/current','control/current','publicStatus/current',...extra].map(async p=>{const r=await request(base+'/'+path(f,p),'owner');return[p,r.status===200?data(r):r.status];})));}
export async function reject(f,writes,extra=[],token=f.manager.token){const before=await snapshot(f,extra),r=await commit(writes,token);assert([403,409].includes(r.status),JSON.stringify(r));assert.deepEqual(await snapshot(f,extra),before);return r;}
