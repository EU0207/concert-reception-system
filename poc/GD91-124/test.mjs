import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {pack} from '../GD91-49/codec.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {seal,open,key,convertLayouts,CutoverModel} from './migration.mjs';
const root=new URL('./',import.meta.url),entries=['test.mjs','migration.mjs'],before=sourceHashes(root,entries);
const reports=[],report=(id,facts)=>reports.push({id,...facts});
const snapshots=['horizontal','vertical'].map((axis,i)=>{
  const raw=createSection({name:'架空移行区画'+i,rows:2,columns:3,axis,seatOrder:i?'reverse':'forward',
    stagePosition:i?'top':'left',lines:Array.from({length:axis==='horizontal'?2:3},(_,j)=>({name:'列'+j,prefix:'F'+j+'-',startNumber:3}))},{maxCells:4096});
  const model=numberInitial(raw,Object.fromEntries(raw.section.cells.map((c,j)=>[c.row+','+c.column,j%3===2?'aisle':'seat'])),{maxCells:4096});
  return pack({environmentId:'FAKE-migration',performanceId:'FAKE-show',generation:randomUUID(),model},2,{maxCells:4096});
});
const original=structuredClone(snapshots),converted=await convertLayouts(snapshots);assert.deepEqual(snapshots,original);
report('M01-old-codec-to-current-layout',{oldFormatVersion:2,newLayoutSchemaVersion:2,sections:2,cells:converted.cells,seats:converted.seats,
  horizontalAndVertical:true,idsNumbersAndAttributesPreserved:true,originalUnchanged:true,databaseTransferVerified:false});
for(const mutate of [s=>s[0].formatVersion=99,s=>s[0].chunks[0].attributes.formatVersion=99,
  s=>s[0].chunks.pop(),s=>s[1].performanceId='FAKE-other',s=>s.push(structuredClone(s[0]))]){
  const s=structuredClone(snapshots);mutate(s);await assert.rejects(()=>convertLayouts(s));
}
assert.deepEqual(snapshots,original);report('M02-invalid-inputs',{rejected:5,unsupportedMixedAndMissing:true,sourcePreserved:true});
const cryptoKey=await key(),op={id:randomUUID(),contentHash:createHash('sha256').update('FAKE-operation').digest('hex')};
const drafts={format:1,basis:{legacyGeneration:snapshots[0].generation,layoutRevision:8},draft:snapshots[0],pending:op};
const encrypted=await seal(drafts,cryptoKey);assert(!JSON.stringify(encrypted).includes(drafts.basis.legacyGeneration));assert.equal(cryptoKey.extractable,false);
assert.deepEqual(await open(encrypted,cryptoKey),drafts);
const bad=structuredClone(encrypted),bytes=Buffer.from(bad.ciphertext,'base64');bytes[3]^=1;bad.ciphertext=bytes.toString('base64');
await assert.rejects(()=>open(bad,cryptoKey));const wrongKey=await key();await assert.rejects(()=>open(encrypted,wrongKey));
report('M03-encrypted-source-and-draft',{aesGcmRoundTrip:true,nonextractableKey:true,tamperAndWrongKeyRejected:true,keyPersisted:false,
  indexedDbVerified:false,formalBackupFormatVerified:false});
const make=()=>new CutoverModel({oldSnapshot:snapshots,encryptedDrafts:encrypted,pending:[op]});
const unknown=make();assert.throws(()=>unknown.stage(converted.store));
for(const result of [undefined,{status:'notFound'},{status:'committed',contentHash:'different'}])assert.throws(()=>unknown.reconcile({[op.id]:result}));
assert.equal(unknown.pending.length,1);assert.deepEqual(unknown.original,original);assert.deepEqual(unknown.encryptedDrafts,encrypted);
report('M04-unknown-outcome',{notFoundDoesNotResend:true,mismatchBlocks:true,cutoverBlocked:true,pendingAndDraftPreserved:true});
const ready=make();ready.reconcile({[op.id]:{status:'committed',contentHash:op.contentHash}});ready.stage(converted.store);
for(const options of [{verified:false,devicesReprepared:true},{verified:true,devicesReprepared:false}])assert.throws(()=>ready.activate(options));
assert.deepEqual(ready.writes,{old:false,next:false});ready.activate({verified:true,devicesReprepared:true});
assert.deepEqual(ready.writes,{old:false,next:true});assert.deepEqual(ready.encryptedDrafts,encrypted);
report('M05-single-writer-model',{verificationAndReprepareRequired:true,automaticDraftCommit:false,dualWrite:false,
  authUidCopied:false,deviceKeyCopied:false,actualDeviceSwitchVerified:false});
const beforeResume=make();beforeResume.reconcile({[op.id]:{status:'committed',contentHash:op.contentHash}});beforeResume.stage(converted.store);
const rollback=beforeResume.rollback();assert(rollback.paperFallback&&!rollback.automaticResume);
assert.deepEqual(beforeResume.writes,{old:false,next:false});assert.deepEqual(beforeResume.original,original);
report('M06-rollback-before-resume',{originalPreserved:true,unsafeFirestoreNotResumed:true,paperFallback:true});
const fact={id:randomUUID(),personId:'FAKE-person',kind:'received'};ready.receive(fact);const afterResume=ready.rollback();
assert(afterResume.newFactsPreserved&&!afterResume.automaticResume);assert.equal(ready.phase,'recovery-decision');
assert.deepEqual(ready.newFacts,[fact]);assert.deepEqual(ready.writes,{old:false,next:false});
report('M07-rollback-after-new-fact',{bothWritersStopped:true,newFactPreserved:true,noOldStateOverwrite:true,operatorDecisionRequired:true});
const after=sourceHashes(root,entries);assert.deepEqual(before,after);
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,
  scope:'in-memory format and safety model only',externalRequestsExecuted:0,realDatabaseMigrationVerified:false,
  allBusinessMappingVerified:false,migrationConditionV402Complete:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({localGroups:reports.length,externalRequestsExecuted:0,migrationConditionV402Complete:false}));
