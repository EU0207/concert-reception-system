import {randomUUID} from 'node:crypto';
import {commit,update,ok} from './staging.mjs';

const scope = f => ({ schemaVersion:10, environmentId: 'FAKE-environment', performanceId: f.show });
export function bootstrapPlan(f) {
  const id = randomUUID();
  return {
    id,
    people: { ...scope(f), revision: 1, operationId: id, attendeeId: '', eligibleAttendeeIds: [] },
    ticket: { ...scope(f), revision: 1, operationId: id, protectedAttendeeIds: [] },
    versions: { ...scope(f),sectionId:'',generation:'',operationId:id,labelOperationId:'',values:{commit:1,layout:0,source:0,assignment:0,attendee:1,ticket:1,control:f.controlRevision,reception:1} },
    event: { ...scope(f), operationId: id, kind: 'bootstrapBusiness', deviceUid: f.owner.uid, generation:'',expectedVersions:null,
      resultVersions:{commit:1,layout:0,source:0,assignment:0,attendee:1,ticket:1,control:f.controlRevision,reception:1} }
  };
}
export function bootstrapWrites(f, o) {
  return [update(f, 'attendeeState/current', o.people, undefined, false),
    update(f, 'ticketState/current', o.ticket, undefined, false),
    update(f, 'operations/' + o.id, o.event, undefined, false), update(f,'versions/current',o.versions,undefined,false)];
}
export async function bootstrap(f, o = bootstrapPlan(f)) {
  ok(await commit(f, bootstrapWrites(f, o)));
  f.people = o.people; f.ticket = o.ticket; f.sharedVersions = o.versions; f.profiles = new Map(); f.labels = new Map();
}
