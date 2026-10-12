import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const report=JSON.parse(fs.readFileSync(new URL('artifacts/receipt-summary.json',import.meta.url)));
const scales=report.reports.filter(x=>x.people===600||x.people===1000);
assert.equal(scales.length,2);
const estimate=scales.map(r=>{
  const clients=6,pollsPerClient=360;
  const queryCount=clients*(pollsPerClient+Math.ceil(r.people/100));
  const geometry=clients*(r.warmGeometry.documents+5*r.warmGeometry.requests);
  const writerRules=6*r.normalReceiptWrites;
  // 5秒ごと・30分の仮定。各問い合わせの最低1読取りを過小計上しない。
  const receiveDocuments=clients*r.people+clients*pollsPerClient;
  const queryRules=4*queryCount,indexReadAllowance=queryCount;
  const reads=geometry+writerRules+receiveDocuments+queryRules+indexReadAllowance;
  return{people:r.people,clients,pollsPerClient,queryCount,geometry,writerRules,receiveDocuments,queryRules,indexReadAllowance,
    modeledReads:reads,withSafetyFactor2:2*reads,freeDailyReads:50000,
    modeledReadsWithOneBoundaryRepeatPerPoll:2*(reads+clients*pollsPerClient),
    receiptWrites:r.normalReceiptWrites,fullDayFreeTierVerified:false};
});
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const result={sourceHashes:Object.fromEntries(['budget-estimate.mjs','artifacts/receipt-summary.json'].map(p=>[p,hash(p)])),
  estimate,assumptions:{receptionMinutes:30,pollSeconds:5,queryPageSize:100,writeRuleReferencesPerEvent:6,
    readRuleReferencesPerQuery:4,indexReadsPerQuery:1,indexScansMeasured:false,clockBoundaryRepeatBoundVerified:false,
    preparationAndIrregularOperationsIncluded:false,retriesAndReentryIncluded:false,productPollingModeAdopted:false},
  productionBillingMeasured:false,normalRegistrationVerified:false,productionFreeTierVerified:false,tested3000:false};
fs.writeFileSync(new URL('artifacts/budget-estimate.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({estimate,productionFreeTierVerified:false}));
