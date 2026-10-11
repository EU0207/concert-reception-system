import {randomUUID,randomBytes,randomInt} from 'node:crypto';
import assert from 'node:assert/strict';
import * as core from '../../GD91-62/tests/support.mjs';
const alphabet='23456789ABCDEFGHJKMNPQRSTVWXYZ';
const generateCredential=()=>randomBytes(16).toString('base64url');
const generateCode=()=>Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');
export {fixture,secondManager,register,registration,registrationWrites,paidPlan,version,snapshot,reject,stored,seed,path,write,commit,ok,request,base,proposal,save} from '../../GD91-62/tests/support.mjs';
const {stored,path,write,commit,ok,request,base}=core;
const scope=f=>({schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show});
export const audit=t=>t===null?null:Object.fromEntries(['revision','issued','sent','issuedAt','sentAt','currentCycle','cycleClosed','everIssued','credentialVersion'].map(k=>[k,t[k]]));
export async function assignment(f,kind,options){
 const o=await core.assignment(f,kind,options),old=await stored(f,'ticketProtection/current'),protectedSeats=new Set(old.seatIds),x=o.event.payload;
 if(kind==='move' && protectedSeats.delete(x.seat1))protectedSeats.add(x.seat2);
 if(kind==='swap'){const a=protectedSeats.has(x.seat1),b=protectedSeats.has(x.seat2);protectedSeats.delete(x.seat1);protectedSeats.delete(x.seat2);if(a)protectedSeats.add(x.seat2);if(b)protectedSeats.add(x.seat1);}
 delete o.after.cancelledAttendeeId;
 const changed=old.seatIds.length!==protectedSeats.size||old.seatIds.some(id=>!protectedSeats.has(id));
 if(changed){o.versions.values.ticket++;o.event.resultVersions=structuredClone(o.versions.values);o.protection={...old,revision:old.revision+1,operationId:o.id,kind,seatIds:[...protectedSeats]};}
 o.writes=[write(path(f,'versions/current'),o.versions,true),write(path(f,'assignmentState/current'),o.after,true),eventWrite(f,o),...(changed?[write(path(f,'ticketProtection/current'),o.protection,true)]:[])];return o;
}
export async function apply(f,o){ok(await commit(o.writes,f.manager.token));return o;}
async function event(f,id,kind,b,n,targetId,payload){const c=await stored(f,'control/current','owner');return{...scope(f),operationId:id,kind,deviceUid:f.manager.uid,humanUid:f.person.uid,controlRevision:c.revision,expectedVersions:b.values,resultVersions:n.values,targetId,payload};}
function eventWrite(f,o){const w=write(path(f,'operations/'+o.id),o.event,false);w.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'},...(o.transforms??[]).map(k=>({fieldPath:'payload.after.'+k,setToServerValue:'REQUEST_TIME'}))];return w;}
export async function ticketPlan(f,id,kind='qrCreate',options={}){
 const r=await request(base+'/'+path(f,'tickets/'+id),f.manager.token),before=r.status===404?null:core.data(r),b=await core.version(f),operationId=randomUUID(),s=await stored(f,'assignmentState/current');
 const seatId=Object.keys(s.assignments).find(k=>s.assignments[k]===id);assert(seatId,'This isolated route requires an assigned seat');
 const fresh=before===null||before.cycleClosed;
 const after={...scope(f),attendeeId:id,revision:(before?.revision??0)+1,operationId,lastKind:kind,currentCycle:(before?.currentCycle??0)+(fresh?1:0),cycleClosed:false,
  everIssued:fresh?false:before.everIssued,issued:fresh?false:before.issued,sent:fresh?false:before.sent,issuedAt:fresh?null:before.issuedAt,sentAt:fresh?null:before.sentAt,
  activeCredentialId:fresh?'':before.activeCredentialId,activeCode:fresh?'':before.activeCode,credentialVersion:fresh?0:before.credentialVersion,previousCredentialId:fresh?'':before.previousCredentialId,previousCode:fresh?'':before.previousCode,operationSeatId:seatId};
 const transforms=[];
 if(kind==='qrCreate'||kind==='qrReissue')Object.assign(after,{activeCredentialId:generateCredential(),activeCode:generateCode(),credentialVersion:kind==='qrCreate'?1:before.credentialVersion+1,previousCredentialId:kind==='qrCreate'?'':before.activeCredentialId,previousCode:kind==='qrCreate'?'':before.activeCode});
 if(kind==='ticketCheck'){const field=options.field??'issued';after[field]=options.value??true;after[field+'At']=null;transforms.push(field+'At');after.everIssued=after.everIssued||after.issued;}
 if(kind==='cancelAttendance')Object.assign(after,{cycleClosed:true,issued:false,sent:false,issuedAt:null,sentAt:null,activeCredentialId:'',activeCode:'',previousCredentialId:before.activeCredentialId,previousCode:before.activeCode});
 const versions={...structuredClone(b),operationId,values:{...b.values,commit:b.values.commit+1,ticket:b.values.ticket+1,reception:b.values.reception+(kind==='ticketCheck'?0:1),attendee:b.values.attendee+(kind==='cancelAttendance'?1:0),assignment:b.values.assignment+(kind==='cancelAttendance'?1:0)}};
 const payload={seatId,before:audit(before),after:audit(after),reason:options.reason??'',confirmedPrimary:options.confirmedPrimary??kind==='cancelAttendance',confirmedTicketWarning:options.confirmedTicketWarning??kind==='cancelAttendance',stopConfirmed:options.stopConfirmed??['cancelAttendance','qrReissue'].includes(kind)};
 Object.assign(after,{expectedVersions:structuredClone(b.values),resultVersions:structuredClone(versions.values),eventPayload:structuredClone(payload)});
 const oldProtection=await stored(f,'ticketProtection/current'),protectedSeats=new Set(oldProtection.seatIds);if(!after.cycleClosed&&(after.issued||after.everIssued||after.activeCredentialId))protectedSeats.add(seatId);else protectedSeats.delete(seatId);
 const protection={...scope(f),revision:oldProtection.revision+1,operationId,seatIds:[...protectedSeats],targetId:id,kind};
 const o={id:operationId,attendeeId:id,before,after,versions,protection,transforms,event:await event(f,operationId,kind,b,versions,id,payload),extra:[]};
 if(kind==='qrCreate'||kind==='qrReissue')o.extra.push(write(path(f,'credentials/'+after.activeCredentialId),{...scope(f),ticketId:id,currentCycle:after.currentCycle,credentialVersion:after.credentialVersion,status:'active',createdOperationId:operationId,revokedOperationId:''},false),write(path(f,'confirmationCodes/'+after.activeCode),{...scope(f),ticketId:id,credentialId:after.activeCredentialId,active:true,createdOperationId:operationId,revokedOperationId:''},false));
 if(kind==='qrReissue'||kind==='cancelAttendance'&&before.activeCredentialId)o.extra.push(write(path(f,'credentials/'+before.activeCredentialId),{...await stored(f,'credentials/'+before.activeCredentialId),status:'revoked',revokedOperationId:operationId},true),write(path(f,'confirmationCodes/'+before.activeCode),{...await stored(f,'confirmationCodes/'+before.activeCode),active:false,revokedOperationId:operationId},true));
 if(kind==='cancelAttendance'){
  const person=await stored(f,'attendees/'+id),people=await stored(f,'eligible/current');
  o.profile={...person,attendancePlan:'notAttending',revision:person.revision+1,operationId};
  o.people={...people,attendeeIds:people.attendeeIds.filter(x=>x!==id),revision:people.revision+1,operationId,cancelledAttendeeId:id};
  o.assignment={...s,revision:s.revision+1,operationId,cancelledAttendeeId:id,assignments:{...s.assignments,[seatId]:''}};
  o.extra.push(write(path(f,'attendees/'+id),o.profile,true),write(path(f,'eligible/current'),o.people,true),write(path(f,'assignmentState/current'),o.assignment,true));
 }
 return rebuild(f,o);
}
export function rebuild(f,o){const t=write(path(f,'tickets/'+o.attendeeId),o.after,o.before!==null);if(o.transforms.length)t.updateTransforms=o.transforms.flatMap(k=>[{fieldPath:k,setToServerValue:'REQUEST_TIME'},{fieldPath:'eventPayload.after.'+k,setToServerValue:'REQUEST_TIME'}]);o.writes=[write(path(f,'versions/current'),o.versions,true),t,write(path(f,'ticketProtection/current'),o.protection,true),eventWrite(f,o),...o.extra];return o;}
export async function returnPlan(f,id){const b=await core.version(f),operationId=randomUUID(),person=await stored(f,'attendees/'+id),people=await stored(f,'eligible/current'),n={...structuredClone(b),operationId,values:{...b.values,commit:b.values.commit+1,attendee:b.values.attendee+1,reception:b.values.reception+1}};
 const o={id:operationId,versions:n,event:await event(f,operationId,'returnAttendance',b,n,id,{attendancePlan:'planned'}),profile:{...person,attendancePlan:'planned',revision:person.revision+1,operationId},people:{...people,attendeeIds:people.attendeeIds.concat([id]),revision:people.revision+1,operationId}};
 o.writes=[write(path(f,'versions/current'),n,true),write(path(f,'attendees/'+id),o.profile,true),write(path(f,'eligible/current'),o.people,true),eventWrite(f,o)];return o;}
export async function ticketSnapshot(f,o){const paths=['ticketProtection/current','tickets/'+o.attendeeId,'attendees/'+o.attendeeId,'attendeeLabels/'+o.attendeeId,'operations/'+o.id,...[o.before?.activeCredentialId,o.after?.activeCredentialId].filter(Boolean).map(id=>'credentials/'+id),...[o.before?.activeCode,o.after?.activeCode].filter(Boolean).map(id=>'confirmationCodes/'+id)];return core.snapshot(f,paths);}
