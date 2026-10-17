import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {pack} from '../GD91-49/codec.mjs';
import {convert,compare,hash} from './conversion.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),files=['conversion-cases.mjs','conversion.mjs'],before=sourceHashes(root,files);
const environmentId='FAKE-migration',performanceId=randomUUID(),person=randomUUID(),buyer=randomUUID(),group=randomUUID(),credential=randomBytes(16).toString('base64url'),code='ABCD2345';
const scope={schemaVersion:1,environmentId,performanceId},raw=createSection({name:'架空区画',rows:1,columns:2,axis:'horizontal',seatOrder:'forward',lines:[{name:'A'}]},{maxCells:4096});
const model=numberInitial(raw,{'0,0':'seat','0,1':'seat'},{maxCells:4096}),seat=model.seats[0].seatId,other=model.seats[1].seatId;
const source={format:1,control:{state:'preparing'},versions:{...scope,values:{commit:8},sections:{[model.section.sectionId]:randomUUID()}},
  layouts:[pack({environmentId,performanceId,generation:randomUUID(),model},2,{maxCells:4096})],
  people:{[person]:{...scope,attendeeId:person,buyerId:buyer,attendancePlan:'planned',paid:true,groupId:group,rosterOrder:0}},
  labels:{[person]:{...scope,seatDisplayName:'架空A'}},buyers:{[buyer]:{name:'架空購入者'}},
  eligible:{roster:{[person]:{groupId:group,rosterOrder:0}},groups:{[group]:[person]}},
  assignments:{assignments:{[seat]:person,[other]:''},groups:{[group]:{fixed:true,manualReason:'架空の分割理由'}}},
  tickets:{[person]:{...scope,activeCredentialId:credential,activeCode:code,currentCycle:2,credentialVersion:3,cycleClosed:false,everIssued:true,issued:true,sent:false,
    issuedAt:{$timestamp:'2026-10-17T00:00:00Z'},sentAt:null}},
  credentials:{[credential]:{...scope,ticketId:person,currentCycle:2,credentialVersion:3,status:'active'}},
  codes:{[code]:{...scope,credentialId:credential,active:true}},operations:{[randomUUID()]:{kind:'ticketCheck',targetId:person,payload:{after:{sent:true}}}},
  reception:{[person]:{status:'received'}},deletions:{'FAKE-deleted':{deleted:true}},sharedDrafts:{},sharedHead:null,
  pendingOperations:[],unsentEvents:0,reconciliation:{registeredDevices:1,declaredDevices:1,coverageConfirmed:true,sourceAccessFenced:true}};
const original=hash(source),target=await convert(source,randomUUID());compare(source,target);assert(target.event.tickets[person].everSent);
assert(target.event.groupStates[group].fixed);assert.equal(target.event.groupStates[group].manualReason,'架空の分割理由');assert.equal(hash(source),original);
const cases=[
  ['unsupported-format',s=>s.format=2],['unsupported-state',s=>s.control.state='closed'],['unsupported-schema',s=>s.versions.schemaVersion=99],
  ['missing-reconciliation',s=>delete s.reconciliation],['pending-operation',s=>s.pendingOperations.push({id:randomUUID()})],['unsent-event',s=>s.unsentEvents=1],
  ['source-not-fenced',s=>s.reconciliation.sourceAccessFenced=false],
  ['missing-buyer',s=>delete s.buyers[buyer]],['deleted-person',s=>s.deletions[person]={deleted:true}],['duplicate-assignment',s=>s.assignments.assignments[other]=person],
  ['dangling-assignment',s=>s.assignments.assignments[seat]='FAKE-missing'],['roster-gap',s=>s.people[person].rosterOrder=2],['roster-index-mismatch',s=>s.eligible.roster[person].groupId=null],
  ['group-order-mismatch',s=>s.eligible.groups[group]=['FAKE-person']],['fixed-without-reason',s=>s.assignments.groups[group].manualReason=null],
  ['credential-format',s=>{s.credentials[randomUUID()]=s.credentials[credential];delete s.credentials[credential];}],
  ['code-format',s=>{s.codes['00000000']=s.codes[code];delete s.codes[code];}],['credential-cycle-mismatch',s=>s.credentials[credential].currentCycle=1],
  ['inactive-current-credential',s=>s.credentials[credential].status='revoked']];
for(const[,mutate]of cases){const bad=structuredClone(source);mutate(bad);await assert.rejects(()=>convert(bad,randomUUID()));}
const corrupted=structuredClone(target);corrupted.migration.sourceArchive.parts.p0='AAAA'+corrupted.migration.sourceArchive.parts.p0.slice(4);assert.throws(()=>compare(source,corrupted));
assert.equal(hash(source),original);const after=sourceHashes(root,files);assert.deepEqual(before,after);
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/conversion-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,
  positiveCases:1,rejectedInputs:cases.map(([id])=>id),archiveCorruptionRejected:true,sourcePreserved:true,
  groupOrderAndReasonPreserved:true,qualificationCycleAndVersionPreserved:true,externalRequestsExecuted:0,
  realDatabaseTransferVerified:false,credentialValuesPersisted:false},null,2)+'\n');
console.log(JSON.stringify({positiveCases:1,rejectedInputs:cases.length,archiveCorruptionRejected:true,externalRequestsExecuted:0}));
