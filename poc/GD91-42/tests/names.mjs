import {randomUUID} from 'node:crypto';
import {update,commit,get,data,ok} from './support.mjs';
export function labelPlanSync(f,attendeeId,seatDisplayName,reason='架空：表示修正') {
 const id=randomUUID(),before=f.labels.get(attendeeId),after={...before,revision:before.revision+1,operationId:id,seatDisplayName};
 const versions={...structuredClone(f.sharedVersions),operationId:id,labelOperationId:id,values:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,attendee:f.sharedVersions.values.attendee+1,reception:f.sharedVersions.values.reception+1}};
 const people={...structuredClone(f.people),revision:versions.values.attendee,attendeeId,operationId:id,labelOperationId:id};
 const event={schemaVersion:10,environmentId:'FAKE-environment',performanceId:f.show,operationId:id,kind:'labelChange',attendeeId,actorUid:f.human.uid,deviceUid:f.owner.uid,beforeValues:f.sharedVersions.values,afterValues:versions.values,confirmed:true,onDay:f.nameDay??false,reason,beforeLabel:before,afterLabel:after,profile:null};
 const own=f.nameDay?{schemaVersion:10,environmentId:'FAKE-environment',performanceId:f.show,operationId:id,kind:'labelChange',attendeeId,actorUid:f.human.uid,deviceUid:f.owner.uid,beforeRevision:before.revision,afterRevision:after.revision,controlRevision:versions.values.control,receptionRevision:versions.values.reception,reason}:null;
 return{id,attendeeId,nameOnly:true,before,after,versions,people,event,own};
}
export function labelWrites(f,o) {
 const event=update(f,'operations/'+o.id,o.event,undefined,false);event.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];
 const index=update(f,'attendeeState/current',Object.fromEntries(['revision','attendeeId','operationId','labelOperationId'].map(k=>[k,o.people[k]])),['revision','attendeeId','operationId','labelOperationId'],true);
 const w=[update(f,'versions/current',o.versions,undefined,true),update(f,'attendeeLabels/'+o.attendeeId,o.after,undefined,true),index,event];
 if(o.own){const own=update(f,`dayEvents/${f.human.uid}/entries/${o.id}`,o.own,undefined,false);own.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];w.push(own);}return w;
}
export function labelAccept(f,o){f.sharedVersions=o.versions;f.people=o.people;f.labels.set(o.attendeeId,o.after);}
export async function saveLabel(f,o){ok(await commit(f,labelWrites(f,o)));labelAccept(f,o);return o;}
export async function readLabel(f,id,token=f.owner.token){return get(f,'attendeeLabels/'+id,token);}
