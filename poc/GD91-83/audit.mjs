import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const report=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',import.meta.url),'utf8'));
assert.equal(report.failure,undefined);
assert.deepEqual(report.sourceHashes,report.endSourceHashes);
for(const [file,expected]of Object.entries(report.sourceHashes)){
  const actual=createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
  assert.equal(actual,expected,file);
}
assert.equal(report.reports.length,16);
assert.deepEqual(report.reports.map(x=>x.id),Array.from({length:16},(_,i)=>'P'+String(i+1).padStart(2,'0')));
const get=id=>report.reports.find(x=>x.id===id);
assert.equal(get('P01').partialSubsetsRejected,254);
assert.equal(get('P01').updateLocations,8);
assert.equal(get('P01').stateUnchanged,true);
assert.equal(get('P02').crossFragmentSwapCommitted,true);
assert.equal(get('P02').credentialReferencesUnchanged,true);
assert.equal(get('P03').payloadMatches,true);
assert.equal(get('P03').secondCommitSent,false);
assert.equal(get('P03').physicalPacketLossSimulated,false);
for(const id of ['P04','P05','P06','P07','P08','P09','P10','P11','P12','P14']){
  assert.equal(get(id).status,401,id);assert.equal(get(id).stateUnchanged,true,id);
}
assert.deepEqual(get('P13').statuses,[200,401]);
assert.equal(get('P15').otherAuthorizedSubjectContinues,true);
assert.equal(get('P16').wholeEventPutDenied,true);
assert.deepEqual(report.cleanup,{rulesClosed:true,trialRootEmpty:true});
for(const key of ['externalFirebaseConnected','fullBusinessRulesVerified','productionFreeTierVerified','tested3000'])assert.equal(report[key],false);
function scan(value){
  if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){
    assert(!/^(token|idToken|refreshToken|password|privateKey|email|authorization|uid|projectId|databaseURL)$/i.test(key),key);scan(item);
  }
  if(typeof value==='string')assert(!/AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|https:\/\//.test(value));
}
scan(report);
console.log(JSON.stringify({groups:16,partialSubsetsRejected:254,sourceHashesVerified:Object.keys(report.sourceHashes).length,
  cleanupReadBackVerified:true,externalFirebaseConnected:false,fullBusinessRulesVerified:false,issue167Complete:false}));
