import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {get,data,commit,update,ok} from './support.mjs';
const confirmations={confirmedPrimary:true};
export async function noTicketPlan(f,attendeeId,options=confirmations){
 assert(options.confirmedPrimary,'Cancellation confirmation required');
 const ticket=await get(f,'tickets/'+attendeeId);assert.equal(ticket.status,404,'Existing ticket requires the ticket cancellation route');
 const profileBefore=data(await get(f,'attendees/'+attendeeId));assert.equal(profileBefore.attendancePlan,'planned');
 const rawAssignment=await get(f,'assignmentState/current');assert([200,404].includes(rawAssignment.status));const assignmentBefore=rawAssignment.status===200?data(rawAssignment):null;
 const oldSeatId=Object.keys(assignmentBefore?.assignments??{}).find(s=>assignmentBefore.assignments[s]===attendeeId)??'';
 const id=randomUUID(),versions={...structuredClone(f.sharedVersions),operationId:id,values:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,reception:f.sharedVersions.values.reception+1,attendee:f.sharedVersions.values.attendee+1,assignment:f.sharedVersions.values.assignment+(oldSeatId?1:0)}};
 const profile={...profileBefore,revision:profileBefore.revision+1,operationId:id,attendancePlan:'notAttending',cancelNoTicketOperationId:id};
 const people={...structuredClone(f.people),revision:f.people.revision+1,operationId:id,attendeeId,cancelNoTicketOperationId:id,eligibleAttendeeIds:f.people.eligibleAttendeeIds.filter(x=>x!==attendeeId)};
 const assignment=oldSeatId?{...structuredClone(assignmentBefore),revision:assignmentBefore.revision+1,operationId:id,lastKind:'cancelWithoutTicket',cancelOperationId:id,cancelledAttendeeId:attendeeId,assignments:{...assignmentBefore.assignments,[oldSeatId]:''}}:null;
 const event={schemaVersion:10,environmentId:'FAKE-environment',performanceId:f.show,operationId:id,kind:'cancelWithoutTicket',deviceUid:f.owner.uid,generation:f.sharedVersions.generation,expectedVersions:structuredClone(f.sharedVersions.values),resultVersions:structuredClone(versions.values),payload:{attendeeId,oldSeatId,ticketAbsent:true,...options,confirmedControlVersion:f.sharedVersions.values.control}};
 return{id,attendeeId,profileBefore,profile,people,versions,assignmentBefore,assignment,oldSeatId,event};
}
export function noTicketWrites(f,o){return[update(f,'versions/current',o.versions,undefined,true),update(f,'attendees/'+o.attendeeId,o.profile,undefined,true),update(f,'attendeeState/current',o.people,undefined,true),update(f,'operations/'+o.id,o.event,undefined,false),...(o.assignment?[update(f,'assignmentState/current',o.assignment,undefined,true)]:[])];}
export function acceptNoTicket(f,o){f.sharedVersions=o.versions;f.people=o.people;f.profiles.set(o.attendeeId,o.profile);}
export async function saveNoTicket(f,o){ok(await commit(f,noTicketWrites(f,o)));acceptNoTicket(f,o);return o;}
export async function noTicketSnapshot(f,o){const paths=['versions/current','attendeeState/current','ticketState/current','assignmentState/current','control/current','attendees/'+o.attendeeId,'tickets/'+o.attendeeId,'receptions/'+o.attendeeId,'operations/'+o.id];return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await get(f,p)])));}
