import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
assert.equal(r.reports.length,6);assert.equal(r.externalRequests,0);assert(r.reports[0].realLegacySharedCiphertextSaved&&r.reports[0].legacyKeyNotExported);
assert(r.reports[1].bd08FormatCandidateRoundtrip&&r.reports[1].closedOpaqueSourcePreservedAndActivationRejected&&r.reports[4].convertedSharedDraftNeedsReview);
assert(r.cleanup.firestore.rulesClosed&&r.cleanup.firestore.emulatorDocumentsEmpty&&r.cleanup.rtdb.rulesClosed&&r.cleanup.rtdb.trialRootEmpty&&r.cleanup.isolatedProfileRemoved);
for(const file of['first-local-failure.json','second-local-failure.json','third-local-failure.json']){const p=JSON.parse(fs.readFileSync(new URL('artifacts/'+file,root)));assert(p.failure);assert.equal(p.reports.length,0);}
const remaining=fs.readdirSync(new URL('node_modules/.cache/',root)).filter(x=>x.startsWith('sdk-switch-'));assert.equal(remaining.length,0);
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:6,backupFormatCandidateConnected:true,legacySharedPlaintextCompared:true,
 oldKeyNotCopied:true,closedSourceActivationRejected:true,allOwnedProfilesRecovered:true,earlierZeroGroupRunsExcluded:true,
 externalRequests:0,formalBackupImplementationAccepted:false,closedBusinessSchemaConverted:false,serverImportAuthorizationVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
