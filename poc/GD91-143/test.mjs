import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.mjs';import {convert,supported,activationProof} from './contract.mjs';
import {convert as previous,hash} from '../GD91-128/conversion.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),files=['test.mjs','contract.mjs','fixture.mjs'],before=sourceHashes(root,files),reports=[];
const {source,person}=fixture(),original=hash(source);
const report=(id,facts)=>{reports.push({id,...facts});console.log(JSON.stringify({case:id,passed:true}));};
const baseline=await convert(source,randomUUID());assert.equal(baseline.event.profiles[person].name,source.buyers[source.people[person].buyerId].name);
report('C01-supported-empty-history-fixture',{preparingWithoutHistoryConverted:true,normalDatabaseFixture:false});
const counterexamples=[
 ['images',s=>s.images={'0':{version:1,mimeType:'image/png',payload:'FAKE-bytes'}},r=>!r.images],
 ['settings',s=>s.performanceSettings={name:'架空公演',venueName:'架空会場',venueAddress:'架空住所'},r=>!r.performanceSettings],
 ['actuals',s=>s.actuals={[person]:{arrived:true,revision:2}},r=>!r.actuals],
 ['reception',s=>s.reception[person]={status:'received'},r=>!r.receipts],
 ['deletions',s=>s.deletions['FAKE-deleted']={deleted:true},r=>!r.deletionLedger],
 ['immutable-operations',s=>s.operations[randomUUID()]={kind:'payment',targetId:person,payload:{after:{paid:true}}},r=>!r.event.operations],
 ['shared-encrypted-draft',s=>{s.sharedDrafts['FAKE-share']={ciphertext:'FAKE-encrypted',baseVersion:8};s.sharedHead={revision:1};},r=>!r.shared]
];
for(const [id,mutate,absent]of counterexamples){
 const value=structuredClone(source);mutate(value);const digest=hash(value),old=await previous(value,randomUUID());
 assert(absent(old));assert.equal(old.migration.sourceHash,digest);
 const archive=JSON.parse(Buffer.from(Object.values(old.migration.sourceArchive.parts).join(''),'base64').toString());assert.deepEqual(archive,value);
 await assert.rejects(()=>convert(value,randomUUID()));assert.equal(hash(value),digest);
 report('C02-'+id,{oldConverterSucceeded:true,originalPreservedInArchive:true,nativeAreaMissing:true,newCandidateRejected:true,sourceUnchanged:true});
}
const secret=structuredClone(source);secret.serviceAccount={privateKey:'FAKE-NOT-A-KEY'};
const old=await previous(secret,randomUUID());const restored=JSON.parse(Buffer.from(Object.values(old.migration.sourceArchive.parts).join(''),'base64').toString());
assert.deepEqual(restored.serviceAccount,secret.serviceAccount);await assert.rejects(()=>convert(secret,randomUUID()));
report('C03-extra-secret-shaped-field',{oldArchiveWouldCopyForbiddenField:true,newCandidateRejectedBeforeStaging:true,realSecretUsed:false});
let deniedInputs=0;
for(const [key,value]of Object.entries({password:'FAKE',token:'FAKE',idToken:'FAKE',refreshToken:'FAKE',cryptoKey:'FAKE',deviceCryptoKey:'FAKE',qrPayload:'FAKE',invitationLink:'FAKE',authenticationUsers:[],roles:{},devices:{},sessions:{}})){
 const v=structuredClone(source);v.buyers[source.people[person].buyerId][key]=value;assert.throws(()=>supported(v),/forbidden-migration-field/);deniedInputs++;
}
for(const state of ['operating','stopped','ended','closing','closed','deleting']){const v=structuredClone(source);v.control.state=state;await assert.rejects(()=>convert(v,randomUUID()));deniedInputs++;}
report('C04-unsupported-boundaries',{rejectedInputs:deniedInputs,closedStateNotRewrittenToPreparing:true});
const areas=['layout','people','qualifications','immutableEvents','reception','actuals','images','deletions','settings','sharedDrafts'];
const entries=Object.fromEntries(areas.map(area=>[area,{mode:'native',format:1,hash:hash({area})}]));
const proof={sourceHash:original,sourceAreas:entries,readBackAreas:structuredClone(entries),requiredAreas:areas,reauthenticated:true,devicesReprepared:true,sourceFenced:true,unresolvedOperations:0,unsentEvents:0};
assert(activationProof(proof));let rejectedProofs=0;
for(const area of areas){
 for(const mutate of [p=>delete p.readBackAreas[area],p=>p.readBackAreas[area].mode='archive-only',p=>p.readBackAreas[area].format=99,p=>p.readBackAreas[area].hash=hash('changed')]){
  const p=structuredClone(proof);mutate(p);assert.throws(()=>activationProof(p));rejectedProofs++;
 }
}
for(const patch of [{reauthenticated:false},{devicesReprepared:false},{sourceFenced:false},{unresolvedOperations:1},{unsentEvents:1}]){assert.throws(()=>activationProof({...proof,...patch}));rejectedProofs++;}
report('C05-activation-coverage',{requiredAreas:areas,positiveProofIsSynthetic:true,rejectedProofs,archiveHashAloneInsufficient:true,serverProofVerified:false});
assert.equal(hash(source),original);assert.deepEqual(before,sourceHashes(root,files));
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:before,reports,externalRequests:0,originalPreserved:true,realSecretsUsed:false,realDatabaseTransferVerified:false,allBusinessMigrationVerified:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,rejectedInputs:deniedInputs,rejectedProofs,allBusinessMigrationVerified:false}));
