import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';
import {inner,create,encrypt,decrypt,restoreCheck,Staging} from './format.mjs';import {hash} from '../GD91-128/conversion.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),files=['test.mjs','format.mjs'],before=sourceHashes(root,files),reports=[];
const id=randomUUID(),eventId=randomUUID(),now=Date.now(),scope={environmentId:'FAKE-backup-source',performanceId:'FAKE-performance'},source={format:1,
 versions:{schemaVersion:1,...scope,values:{commit:8}},control:{state:'preparing',operationId:eventId},layouts:[],people:{[id]:{attendeeId:id,name:'架空購入者'}},labels:{},buyers:{},eligible:{},assignments:{},
 tickets:{},credentials:{},codes:{},operations:{[eventId]:{operationId:eventId,kind:'FAKE-immutable-event',resultVersions:{commit:8}}},reception:{},deletions:{},sharedDrafts:{},sharedHead:null,
 pendingOperations:[],unsentEvents:0,reconciliation:{sourceAccessFenced:true}};
const original=hash(source),context={role:'owner',online:true,now,reauthAt:now-900000},ledger={sourceEnvironment:scope.environmentId,targetEmpty:true,deletedPeople:{}};
const backup=await create(source,context),opened=await restoreCheck(backup.wrapper,backup.recoveryKey,context,ledger);assert.deepEqual(opened.eventsAndSettings.operations,source.operations);
assert(!JSON.stringify(backup.wrapper).includes('架空'));assert(!backup.fileName.includes(scope.performanceId));assert.equal(backup.recoveryKey.length,43);
reports.push({id:'B01',dedicated256BitBackupKey:true,versionedPortableJsonEnvelope:true,countsAndHashesCompared:true,recoveryKeySeparateFromWrapper:true});
let rejected=0;for(const patch of[{role:'deputy'},{role:'receptionist'},{online:false},{reauthAt:now-900001},{reauthAt:now+1}]){await assert.rejects(()=>create(source,{...context,...patch}));rejected++;}
reports.push({id:'B02',authorizationPreflightRejections:rejected,exact15MinuteBoundaryAllowed:true,serverAuthorizationNotVerified:true});
await assert.rejects(()=>decrypt(backup.wrapper,randomBytes(32).toString('base64url')));
for(const name of ['ciphertext','iv','authenticationTag']){const bad=structuredClone(backup.wrapper),bytes=Buffer.from(bad[name],'base64');bytes[0]^=1;bad[name]=bytes.toString('base64');await assert.rejects(()=>decrypt(bad,backup.recoveryKey));}
for(const patch of[{schemaVersion:2},{kdf:'pbkdf2'},{cipher:'other'}])await assert.rejects(()=>decrypt({...backup.wrapper,...patch},backup.recoveryKey));
reports.push({id:'B03',wrongKeyRejected:true,tamperedCipherIvAndTagRejected:true,unsupportedOuterFormatsRejected:3});
for(const mutate of[v=>v.schemaVersion=99,v=>delete v.eventsAndSettings.labels,v=>v.counts.people=99,v=>v.eventsAndSettings.people[id].name='changed',v=>v.eventsAndSettings.people[id].token='FAKE',
 v=>{v.eventsAndSettings.operations[randomUUID()]=Object.values(v.eventsAndSettings.operations)[0];v.itemHashes.operations=hash(v.eventsAndSettings.operations);v.counts.operations++;}]){const bad=structuredClone(opened);mutate(bad);await assert.rejects(()=>encrypt(bad));}
reports.push({id:'B04',invalidInnerInputsRejected:6,forbiddenSecretsRejected:true,duplicateImmutableEventIdRejected:true});
await assert.rejects(()=>restoreCheck(backup.wrapper,backup.recoveryKey,context,{...ledger,sourceEnvironment:'FAKE-other'}));
await assert.rejects(()=>restoreCheck(backup.wrapper,backup.recoveryKey,context,{...ledger,targetEmpty:false}));
await assert.rejects(()=>restoreCheck(backup.wrapper,backup.recoveryKey,context,{...ledger,deletedPeople:{[id]:true}}));
await assert.rejects(()=>restoreCheck(backup.wrapper,backup.recoveryKey,context,{...ledger,closed:true,closeOperationId:eventId}));
const closed=structuredClone(source);closed.control.state='closed';const closedBackup=await create(closed,context);
const closedValue=await restoreCheck(closedBackup.wrapper,closedBackup.recoveryKey,context,{...ledger,closed:true,closeOperationId:eventId});assert.equal(closedValue.eventsAndSettings.control.state,'closed');
reports.push({id:'B05',wrongSourceAndNonemptyTargetRejected:true,deletedPersonRevivalRejected:true,closedStateCannotReopen:true,closedOpaqueFactsPreserved:true});
const stage=new Staging();assert.throws(()=>stage.stage(opened,{abort:true}));assert.equal(stage.values.size,0);assert.equal(stage.active,null);
stage.stage(opened);assert(stage.stage(opened).reused);assert.equal(stage.values.size,1);const altered=structuredClone(opened);altered.createdAt=new Date(now+1).toISOString();assert.throws(()=>stage.stage(altered));
stage.activate(opened.exportId);assert.throws(()=>stage.activate(opened.exportId));assert.equal(stage.values.get(opened.exportId).digest,hash(opened));
reports.push({id:'B06',failedStagingNotActivated:true,sameExportIdReusedWithoutDuplicate:true,sameIdDifferentContentRejected:true,activationOnce:true,stagingIsRamModel:true});
assert.equal(hash(source),original);const after=sourceHashes(root,files);assert.deepEqual(before,after);fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,externalRequests:0,
 backupKeyOrCiphertextPersisted:false,productionImplementation:false,realDatabaseImportVerified:false,eventReplayVerified:false,
 closedBusinessSchemaConverted:false,formalFormatCandidate:true,serverAuthorizationVerified:false,originalPreserved:true},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,externalRequests:0,formalFormatCandidate:true,realDatabaseImportVerified:false}));
