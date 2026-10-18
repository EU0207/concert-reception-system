import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);let comparisons=0;const scales=[];
const check=(entries,base=root)=>{for(const[p,h]of Object.entries(entries)){assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,base),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;}};
for(const count of [4]){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/native-'+count+'-summary.json',root))),s=JSON.parse(fs.readFileSync(new URL('artifacts/source-capacity-'+count+'-summary.json',root)));
 assert(!r.failure&&!s.failure);assert.equal(r.reports.length,5);assert.deepEqual(r.sourceHashes,r.endSourceHashes);check(r.sourceHashes);
 assert.deepEqual(s.sourceHashes,s.endSourceHashes);check(s.sourceHashes,new URL('../GD91-127/',root));
 assert(r.cleanup.targetDenyAllInstalled&&r.cleanup.targetEmpty);assert.equal(r.cleanup.authUsersRemaining,0);assert(s.cleanup.rulesClosed&&s.cleanup.trialRootEmpty);
 const facts=r.reports.find(x=>x.id==='N01-native-closed-coverage');assert.equal(facts.people,count);assert.equal(facts.actuals,count);assert.equal(facts.images,5);
 assert(r.reports.find(x=>x.id==='N04-reprepared-native-reads').ordinaryClientCannotImportRoot);assert.equal(r.allBusinessMigrationVerified,false);
 assert.equal(s.reports[0].closing.result.peopleCount,count);assert.equal(s.reports[0].closing.result.deviceCount,8);assert(s.reports[0].closing.closedAndActualsNotSeeded);
 scales.push({people:count,groups:5,areas:facts.areas,images:5,authUsersRemaining:0,ordinaryClientRootImportDenied:true,migrationMeter:r.meter});
}
const withdrawn=JSON.parse(fs.readFileSync(new URL('artifacts/scale-run-withdrawal.json',root))),interrupted=JSON.parse(fs.readFileSync(new URL('artifacts/source-capacity-600-summary.json',root)));
assert.equal(withdrawn.people600,'intentionally-interrupted-not-passed');assert.equal(withdrawn.people1000,'not-started');assert(interrupted.failure);assert.equal(interrupted.failure.phase,'register');assert.equal(interrupted.reports.length,0);assert(interrupted.cleanup.rulesClosed&&interrupted.cleanup.trialRootEmpty);
assert(!fs.existsSync(new URL('artifacts/native-600-summary.json',root)));assert(!fs.existsSync(new URL('artifacts/native-1000-summary.json',root)));
const result={sourceComparisons:comparisons,scales,earlierFourPeopleResultExcluded:true,people600IntentionallyInterrupted:true,people1000NotExecuted:true,externalFirebaseConnected:false,allBusinessMigrationVerified:false,privilegedImportToolIsEmulatorFixture:true,legacyFirestoreClosedConverted:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sourceComparisons:comparisons,scales:scales.length,groups:5,people600IntentionallyInterrupted:true,people1000NotExecuted:true,allBusinessMigrationVerified:false}));
