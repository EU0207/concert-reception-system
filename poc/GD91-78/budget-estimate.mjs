import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const summary=JSON.parse(fs.readFileSync(new URL('artifacts/watch-summary.json',import.meta.url),'utf8'));
const estimate=[600,1000].map(n=>{
  const r=summary.reports.find(x=>x.people===n);assert(r);
  const clients=6,geometry=156,writerRules=6*n,receiveDocuments=clients*n;
  const initialMinimumAndRules=clients*5;
  const observedServerCallbacks=r.status==='passed'?r.stats.reduce((sum,s)=>sum+s.serverSnapshots,0):null;
  const callbackComparison=observedServerCallbacks===null?null:2*(geometry+writerRules+receiveDocuments+initialMinimumAndRules+4*observedServerCallbacks);
  const oneResultUpdatePerEvent=2*(geometry+writerRules+receiveDocuments+initialMinimumAndRules+4*clients*n);
  const fullReconnectAdditional=2*clients*(n+4);
  return{people:n,clients,geometry,writerRules,receiveDocuments,initialMinimumAndRules,observedServerCallbacks,
    callbackComparison,oneResultUpdatePerEvent,fullReconnectAdditional,
    oneResultUpdateWithOneFullReconnect:oneResultUpdatePerEvent+fullReconnectAdditional,
    freeDailyReads:50000,receiptWritesInModel:n,scaleConvergencePassed:r.status==='passed',fullDayFreeTierVerified:false};
});
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const result={sourceHashes:Object.fromEntries(['budget-estimate.mjs','artifacts/watch-summary.json'].map(p=>[p,hash(p)])),estimate,
  assumptions:{geometryFromGD9177Model:true,writeRuleReferencesPerEvent:6,readRuleReferencesPerUpdate:4,
    safetyFactor:2,oneExplicitRangeFieldInWatch:true,watchIndexEntriesExemptUnderPricingRule:true,
    callbackCountIsBillingMeasurement:false,billedRuleEvaluationGroupingVerified:false,
    preparationAndIrregularOperationsIncluded:false,retriesAndReentryIncluded:false,
    SDKWireBytesMeasured:false,fullReconnectChargedAsNewQuery:true},
  productionBillingMeasured:false,productionFreeTierVerified:false,normalRegistrationVerified:false,tested3000:false};
fs.writeFileSync(new URL('artifacts/budget-estimate.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({estimate,productionFreeTierVerified:false}));
