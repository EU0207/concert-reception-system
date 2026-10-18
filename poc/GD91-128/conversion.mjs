import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {convertLayouts} from '../GD91-124/migration.mjs';
import {row} from '../GD91-89/projection.mjs';
import {credentialPattern,codePattern} from '../GD91-126/contract-rules.mjs';

export const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);
export const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export async function convert(source,exportId){
  assert.equal(source.format,1,'unsupported-migration-format');
  assert.equal(source.control.state,'preparing','unsupported-source-state');
  assert.equal(source.versions.schemaVersion,1,'unsupported-business-schema');
  assert(source.reconciliation?.coverageConfirmed,'missing-device-reconciliation');
  assert(source.reconciliation.sourceAccessFenced,'source-access-not-fenced');
  assert.equal(source.pendingOperations.length,0,'unresolved-operation');
  assert.equal(source.unsentEvents,0,'unreceived-events');
  const geometry=await convertLayouts(source.layouts),v=source.versions.values.commit;
  assert(Number.isSafeInteger(v)&&v>0);const seats=new Set(geometry.models.flatMap(m=>m.seats.map(s=>s.seatId)));
  const event={commit:{revision:v,operationId:exportId},people:{},profiles:{},seats:{},view:{},tickets:{},credentials:{},codes:{},
    roster:{count:Object.keys(source.people).length,byOrder:{}},groupInfo:{},groupStates:{},reception:{'0000000000':v}};
  for(const seat of seats){event.seats[seat]={personId:'none',revision:v};event.view[seat]={personId:'none',displayName:'',revision:v};}
  let order=0;const assigned=new Map();
  for(const[seat,person]of Object.entries(source.assignments.assignments))if(person){
    assert(seats.has(seat)&&source.people[person],'dangling-assignment');assert(!assigned.has(person),'duplicate-person-assignment');assigned.set(person,seat);
  }
  const people=Object.entries(source.people).sort(([,a],[,b])=>a.rosterOrder-b.rosterOrder);
  assert.deepEqual(Object.keys(source.eligible.roster).sort(),Object.keys(source.people).sort(),'roster-person-set-mismatch');
  for(const[id,p]of people){
    assert.equal(p.schemaVersion,1);assert.equal(p.attendeeId,id);assert(!source.deletions[id],'deleted-person-present');
    assert.equal(p.environmentId,source.versions.environmentId);assert.equal(p.performanceId,source.versions.performanceId);
    assert.equal(p.rosterOrder,order,'noncontiguous-source-roster');
    assert.deepEqual(source.eligible.roster[id],{groupId:p.groupId,rosterOrder:p.rosterOrder},'roster-index-mismatch');
    assert(['planned','notAttending'].includes(p.attendancePlan),'unsupported-attendance-state');
    assert(p.groupId===null||Object.hasOwn(source.eligible.groups??{},p.groupId),'missing-source-group');
    const label=source.labels[id]?.seatDisplayName,buyer=source.buyers[p.buyerId];
    assert(typeof label==='string'&&label.length<=6,'missing-display-name');assert(typeof buyer?.name==='string'&&buyer.name.length>0&&buyer.name.length<=50,'missing-buyer-fact');
    const seatId=assigned.get(id)??'none',active=p.attendancePlan==='planned';assert(active||seatId==='none','cancelled-still-assigned');
    const groupId=p.groupId??'none';event.people[id]={active,seatId,displayName:label,revision:v,groupId,rosterOrder:order};
    assert(buyer.extra===undefined,'unsupported-buyer-extra');
    event.profiles[id]={name:buyer.name,displayName:label,paid:p.paid,extra:Object.fromEntries(Array.from({length:10},(_,i)=>['f'+i,''])),revision:v};event.roster.byOrder['n'+order++]=id;
    if(seatId!=='none'){event.seats[seatId]={personId:id,revision:v};event.view[seatId]={personId:id,displayName:label,revision:v};}
    const t=source.tickets[id];if(t){
      assert.equal(t.schemaVersion,1);const epoch=value=>value?.$timestamp?Date.parse(value.$timestamp):0;
      const everSent=Object.values(source.operations).some(e=>e.targetId===id&&e.payload?.after?.sent===true);
      event.tickets[id]={credentialRef:t.activeCredentialId??'',code:t.activeCode??'',currentCycle:t.currentCycle,credentialVersion:t.credentialVersion,
        cycleClosed:t.cycleClosed,everIssued:t.everIssued,everSent,issued:t.issued,sent:t.sent,
        issuedAt:t.issued?epoch(t.issuedAt):0,sentAt:t.sent?epoch(t.sentAt):0,revision:v};
    }
  }
  for(const[groupId,members]of Object.entries(source.eligible.groups??{})){
    assert(Array.isArray(members)&&members.length>0&&members.length<=10);
    assert.deepEqual(members,people.filter(([,p])=>p.groupId===groupId).map(([id])=>id),'group-order-mismatch');
    const old=source.assignments.groups?.[groupId]??{fixed:false,manualReason:null};
    assert(typeof old.fixed==='boolean');assert(!old.fixed||typeof old.manualReason==='string'&&old.manualReason.trim().length>0);
    event.groupInfo[groupId]={count:members.length,members:Object.fromEntries(members.map((id,i)=>['m'+i,id]))};
    event.groupStates[groupId]={fixed:old.fixed,manualReason:old.manualReason??'',revision:v,lastOperationId:exportId};
  }
  for(const[id,c]of Object.entries(source.credentials)){
    assert.equal(c.schemaVersion,1);assert(new RegExp(credentialPattern).test(id),'unsupported-credential');assert(['active','revoked'].includes(c.status));
    const code=Object.entries(source.codes).find(([,x])=>x.credentialId===id)?.[0];assert(code,'credential-code-missing');
    assert(event.people[c.ticketId],'credential-person-missing');
    event.credentials[id]={personId:c.ticketId,currentCycle:c.currentCycle,credentialVersion:c.credentialVersion,code,active:c.status==='active',revision:v};
  }
  for(const[code,c]of Object.entries(source.codes)){
    assert.equal(c.schemaVersion,1);assert(new RegExp(codePattern).test(code),'unsupported-code');
    assert(event.credentials[c.credentialId],'code-credential-missing');event.codes[code]={credentialRef:c.credentialId,active:c.active,revision:v};
  }
  for(const[id,t]of Object.entries(event.tickets))if(t.credentialRef){
    const c=event.credentials[t.credentialRef];assert(c&&c.personId===id&&c.active&&c.currentCycle===t.currentCycle&&c.credentialVersion===t.credentialVersion);
    assert.equal(event.codes[t.code]?.credentialRef,t.credentialRef);assert(event.codes[t.code].active);
  }
  for(const id of Object.keys(event.people))event.reception['i-'+id]=row(event,id,v);
  const head={generation:'isolated-migration',revision:1,operationId:exportId};
  const archive=Buffer.from(canonical(source)).toString('base64'),parts={};
  for(let i=0;i<archive.length;i+=65536)parts['p'+(i/65536)]=archive.slice(i,i+65536);
  return{...geometry.store,head,event,migration:{schemaVersion:1,exportId,sourceHash:hash(source),sourceVersions:source.versions,
    sourceLayoutGenerations:source.versions.sections,sourceArchive:{format:1,partCount:Object.keys(parts).length,parts},
    reception:structuredClone(source.reception),deletions:structuredClone(source.deletions),
    state:'staged',sourceAuthorizationCopied:false,sourceDeviceKeysCopied:false}};
}

export function compare(source,target){
  assert.equal(target.migration.sourceHash,hash(source));const archive=target.migration.sourceArchive;
  assert.equal(archive.format,1);assert.equal(Object.keys(archive.parts).length,archive.partCount);
  const restored=JSON.parse(Buffer.from(Array.from({length:archive.partCount},(_,i)=>archive.parts['p'+i]).join(''),'base64').toString());
  assert.deepEqual(restored,source);assert.equal(hash(restored),target.migration.sourceHash);
  assert.deepEqual(target.migration.sourceVersions,source.versions);assert.equal(target.event.commit.revision,source.versions.values.commit);
  assert.equal(Object.keys(target.event.people).length,Object.keys(source.people).length);
  for(const[id,p]of Object.entries(source.people)){
    const current=target.event.people[id];assert.equal(current.active,p.attendancePlan==='planned');assert.equal(current.displayName,source.labels[id].seatDisplayName);
    assert.equal(target.event.profiles[id].paid,p.paid);assert.equal(target.event.profiles[id].name,source.buyers[p.buyerId].name);
    assert.equal(current.rosterOrder,p.rosterOrder);assert.equal(current.groupId,p.groupId??'none');
    const old=source.tickets[id],next=target.event.tickets?.[id];if(old){
      for(const k of ['currentCycle','credentialVersion','cycleClosed','everIssued','issued','sent'])assert.equal(next[k],old[k]);
      assert.equal(next.credentialRef,old.activeCredentialId??'');assert.equal(next.code,old.activeCode??'');
    }
  }
  for(const[g,members]of Object.entries(source.eligible.groups??{}))assert.deepEqual(Object.values(target.event.groupInfo[g].members),members);
  for(const[seat,p]of Object.entries(source.assignments.assignments))assert.equal(target.event.seats[seat].personId,p||'none');
  assert.deepEqual(target.migration.reception,source.reception);assert.deepEqual(target.migration.deletions,source.deletions);
  return{people:Object.keys(source.people).length,tickets:Object.keys(source.tickets).length,
    qualificationRecords:Object.keys(source.credentials).length,immutableOperations:Object.keys(source.operations).length,
    originalVersionsPreserved:true,originalOperationsPreserved:true,originalQualificationIdsPreserved:true};
}
