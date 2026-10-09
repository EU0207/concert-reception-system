import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {commit,update,get,data,ok} from './support.mjs';import {audit} from './ticket.mjs';
export async function cancelPlan(f,attendeeId,options={confirmedPrimary:true,confirmedTicketWarning:true,stopConfirmed:true}){
 assert(options.confirmedPrimary&&options.confirmedTicketWarning&&options.stopConfirmed,'Both confirmations and device stop required');
 const before=data(await get(f,'tickets/'+attendeeId)),oldAssignment=data(await get(f,'assignmentState/current')),beforeProfile=data(await get(f,'attendees/'+attendeeId)),id=randomUUID();
 assert(!before.cycleClosed&&before.activeCredentialId&&beforeProfile.attendancePlan==='planned');
 const oldSeatId=Object.keys(oldAssignment.assignments).find(k=>oldAssignment.assignments[k]===attendeeId);assert(oldSeatId);
 const versions={...structuredClone(f.sharedVersions),operationId:id,values:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,attendee:f.sharedVersions.values.attendee+1,assignment:f.sharedVersions.values.assignment+1,ticket:f.sharedVersions.values.ticket+1}};
 const after={...structuredClone(before),revision:before.revision+1,operationId:id,lastKind:'cancelAttendance',ticketRevision:versions.values.ticket,
  expectedVersions:structuredClone(f.sharedVersions.values),resultVersions:structuredClone(versions.values),cycleClosed:true,activeCredentialId:'',activeCode:'',
  issued:false,sent:false,issuedAt:null,sentAt:null,previousCredentialId:before.activeCredentialId,previousCode:before.activeCode,closedSeatId:oldSeatId};
 const index={...structuredClone(f.ticket),operationId:id,revision:f.ticket.revision+1,attendeeId,protectedAttendeeIds:f.ticket.protectedAttendeeIds.filter(x=>x!==attendeeId)};
 const profile={...beforeProfile,attendancePlan:'notAttending',revision:beforeProfile.revision+1,operationId:id,cancelOperationId:id};
 const people={...structuredClone(f.people),attendeeId,operationId:id,cancelOperationId:id,revision:f.people.revision+1,eligibleAttendeeIds:f.people.eligibleAttendeeIds.filter(x=>x!==attendeeId)};
 const assignment={...structuredClone(oldAssignment),revision:oldAssignment.revision+1,operationId:id,cancelOperationId:id,cancelledAttendeeId:attendeeId,lastKind:"cancelAttendance",assignments:{...oldAssignment.assignments,[oldSeatId]:''}};
 const oldCredential={...data(await get(f,'credentials/'+before.activeCredentialId)),status:'revoked',revokedOperationId:id};
 const oldCode={...data(await get(f,'confirmationCodes/'+before.activeCode)),active:false,revokedOperationId:id};
 const event={schemaVersion:6,environmentId:'FAKE-environment',performanceId:f.show,operationId:id,kind:'cancelAttendance',deviceUid:f.owner.uid,generation:f.sharedVersions.generation,
  expectedVersions:structuredClone(f.sharedVersions.values),resultVersions:structuredClone(versions.values),payload:{attendeeId,creating:false,before:audit(before),after:audit(after),oldSeatId,...options,confirmedControlVersion:f.sharedVersions.values.control}};
 return{id,attendeeId,before,after,index,profile,people,assignment,oldAssignment,beforeProfile,oldCredential,oldCode,event,versions,oldSeatId};
}
export function cancelWrites(f,o){return[
 update(f,'tickets/'+o.attendeeId,o.after,undefined,true),update(f,'ticketState/current',o.index,undefined,true),update(f,'versions/current',o.versions,undefined,true),
 update(f,'operations/'+o.id,o.event,undefined,false),update(f,'attendees/'+o.attendeeId,o.profile,undefined,true),update(f,'attendeeState/current',o.people,undefined,true),
 update(f,'assignmentState/current',o.assignment,undefined,true),update(f,'credentials/'+o.before.activeCredentialId,o.oldCredential,undefined,true),update(f,'confirmationCodes/'+o.before.activeCode,o.oldCode,undefined,true)
];}
export async function acceptCancel(f,o){f.sharedVersions=o.versions;f.ticket=o.index;f.people=o.people;f.profiles.set(o.attendeeId,o.profile);return data(await get(f,'tickets/'+o.attendeeId));}
export async function saveCancel(f,o){ok(await commit(f,cancelWrites(f,o)));return acceptCancel(f,o);}
export async function cancelSnapshot(f,o){const paths=['versions/current','attendeeState/current','ticketState/current','assignmentState/current','control/current','tickets/'+o.attendeeId,'attendees/'+o.attendeeId,'operations/'+o.id,'credentials/'+o.before.activeCredentialId,'confirmationCodes/'+o.before.activeCode,'receptions/'+o.attendeeId];return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await get(f,p)])));}
