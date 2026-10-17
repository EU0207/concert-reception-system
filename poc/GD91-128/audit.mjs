import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);let comparisons=0;
for(const file of ['conversion-summary.json','local-summary.json']){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/'+file,root)));assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const[p,h]of Object.entries(r.sourceHashes)){assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;}
 if(file==='local-summary.json'){assert(!r.failure);assert.equal(r.reports.length,8);assert(r.cleanup.firestore.rulesClosed&&r.cleanup.firestore.emulatorDocumentsEmpty&&r.cleanup.rtdb.rulesClosed&&r.cleanup.rtdb.trialRootEmpty);}
 else{assert.equal(r.positiveCases,1);assert.equal(r.rejectedInputs.length,19);assert(r.archiveCorruptionRejected);}
}
for(const file of ['first-local-failure.json','second-local-failure.json']){const r=JSON.parse(fs.readFileSync(new URL('artifacts/'+file,root)));assert(r.failure);assert(r.cleanup.firestore.rulesClosed&&r.cleanup.firestore.emulatorDocumentsEmpty&&r.cleanup.rtdb.rulesClosed&&r.cleanup.rtdb.trialRootEmpty);}
const result={sourceComparisons:comparisons,localDatabaseGroups:8,conversionPositiveCases:1,rejectedConversionInputs:19,
 earlierPartialRunsExcluded:true,externalFirebaseConnected:false,allBusinessMigrationVerified:false,formalBackupFormatVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
