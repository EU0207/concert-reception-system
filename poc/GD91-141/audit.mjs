import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {buildRules} from '../GD91-139/generate.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL('artifacts/'+p,root))),hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex'),profiles=[600,1000].map(n=>read('profile-'+n+'.json'));
for(const r of profiles){assert(!r.failure);assert.equal(r.reports.length,13);assert.deepEqual(r.sourceHashes,r.endSourceHashes);for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(hash(fs.readFileSync(new URL(p,root),'utf8')),h,p);assert.equal(hash(buildRules()),r.rulesHash);
 assert(r.cleanup.browserAndServerClosed&&r.cleanup.rulesClosed&&r.cleanup.trialDocumentsEmpty&&r.cleanup.authUsersRemaining===0);
 assert(r.browserAuthSdkWithRestData&&!r.firestoreSdkDataTransport&&r.businessDocumentsOwnerSeeded&&!r.businessWriteRegressionVerified&&!r.rawSdkExpiryEnforcementVerified&&!r.fullBusinessFreeTierVerified&&!r.externalFirebaseConnected&&!r.wireBytesMeasured);
 const by=id=>r.reports.find(x=>x.id.startsWith(id));assert.equal(by('F01').browserAuthContexts,6);assert(by('F01').normalSessionIssue);
 assert(by('R01').requestsPerClient.every(n=>n===Math.ceil(r.people/32)+3));assert(by('R02').oneRequestPerClient);assert(by('R03').metadataDocumentsPerClient===r.people&&by('R03').bodyDocumentsPerClient===1);assert.equal(by('R04').bodyDocumentsPerClient,0);
 assert(by('R05').oldCacheUnchanged&&by('R05').recoveryVerified);assert(by('R06').noPrivateDocumentReturned&&by('R06').bothMixedOrdersRejected);assert(by('R07').cacheUnchanged&&by('R07').fixtureRestored);
 assert(by('A01').otherDeviceContinues&&by('A02').otherHumanContinues);assert(by('A03').duringReceiveDenied&&by('A03').cacheUnchanged&&by('A03').freshMaskedAndBatchDenied);assert(by('P01').otherPerformanceDenied);assert(by('P02').missingDuplicateAndErrorRejected);
 assert(r.metrics.unchanged.every(x=>x.requests===1&&x.responseBytes<4096));
}
assert.deepEqual(profiles[0].sourceHashes,profiles[1].sourceHashes);
const b=read('budget-summary.json');assert.equal(b.reports.length,6);assert.equal(b.allBusinessTotals,null);for(const x of b.reports){assert(x.initialPlus50RenameBusinessReadsLowerBound>50000);assert.equal(x.staticReferenceGuarantee,x.pageSize!==32);assert(!x.dependencyReadsIncluded&&!x.otherBusinessIncluded);}
assert(b.reports.filter(x=>x.pageSize===32).every(x=>x.renameResponseBytes50PerClient>20000000&&!x.fits20MbWith50Renames));assert(!b.pollingPeriodAdopted);
const result={groups:26,profiles:[600,1000],sourceComparisonsPerProfile:Object.keys(profiles[0].sourceHashes).length,rulesUnchangedFromGd139:true,browserAuthContextsPerProfile:6,
 readOnlyPathVerified:true,page32StaticReferenceGuarantee:false,fullRefreshReadAmplificationBlocker:true,rawSdkExpiryEnforcementVerified:false,fullBusinessFreeTierVerified:false,cleanupVerified:true,externalFirebaseConnected:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
