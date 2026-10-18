import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(new URL('artifacts/'+p,import.meta.url))),hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const results=['node','browser'].map(mode=>read(mode+'-summary.json')),observations=[];
for(const r of results){assert(!r.failure);assert.equal(r.reports.length,8);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(hash(fs.readFileSync(new URL(p,import.meta.url),'utf8')),h,p);
 assert.equal(hash(fs.readFileSync(new URL('firestore.rules',import.meta.url),'utf8')),r.rulesHash);
 assert(r.cleanup.sdkClientsClosed&&r.cleanup.rulesClosed&&r.cleanup.trialDocumentsEmpty&&r.cleanup.authUsersRemaining===0);
 assert(r.minimalDiagnosticOnly&&!r.businessRulesVerified&&!r.productionBehaviorVerified&&!r.underlyingCauseConfirmed&&!r.externalFirebaseConnected);
 const by=id=>r.reports.find(x=>x.id.startsWith(id));
 assert(by('T01').sdk.allowed&&by('T01').restGet.allowed&&by('T01').restBatchGet.allowed);
 assert(!by('T02').sdk.allowed&&!by('T02').restGet.allowed&&!by('T02').restBatchGet.allowed);
 assert(by('T03').existingConnection.restGet.allowed&&by('T03').existingConnection.restBatchGet.allowed&&by('T03').newConnection.allowed);
 for(const id of ['T04','T05','T06']){const x=by(id),current=x.existingConnection??x.afterDeadline;assert(!current.restGet.allowed&&!current.restBatchGet.allowed&&!x.newConnection.allowed);}
 assert(!by('T07').restGet.allowed&&!by('T07').restBatchGet.allowed&&!by('T07').newConnection.allowed);
 assert(by('T08').sdkDataBuffered&&by('T08').postCheckDenied&&!by('T08').dataReturnedToCaller);
 observations.push({mode:r.mode,sourceComparisons:Object.keys(r.sourceHashes).length,lowerBoundExistingSdkAllowed:by('T03').existingConnection.sdk.allowed,
  updatedExpiryExistingSdkAllowed:by('T04').existingConnection.sdk.allowed,naturalSessionExpiryExistingSdkAllowed:by('T05').afterDeadline.sdk.allowed,
  naturalRoleExpiryExistingSdkAllowed:by('T06').afterDeadline.sdk.allowed,directResourceExpiredSdkAllowed:by('T07').existingConnection.allowed});
}
assert.deepEqual(results[0].sourceHashes,results[1].sourceHashes);assert.equal(results[0].rulesHash,results[1].rulesHash);
const inspection=read('sdk-inspection.json');assert(inspection.getDocFromServerUsesSnapshotListener&&inspection.nodeConnectionFactoryUsesGrpc&&inspection.browserConnectionFactoryUsesWebChannel&&!inspection.underlyingCauseConfirmed);
const result={groups:16,observations,restGetAndBatchGetDeniedExpiredRequests:true,newSdkConnectionDeniedExpiredRequests:true,postCheckBlockedBufferedData:true,cleanupVerified:true,externalFirebaseConnected:false,productionBehaviorVerified:false,underlyingCauseConfirmed:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
