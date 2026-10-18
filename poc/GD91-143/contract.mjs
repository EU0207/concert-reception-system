import assert from 'node:assert/strict';
import {convert as previous,compare} from '../GD91-128/conversion.mjs';

export const topFields=['format','control','versions','layouts','people','labels','buyers','eligible','assignments','tickets','credentials','codes','operations','reception','deletions','sharedDrafts','sharedHead','pendingOperations','unsentEvents','reconciliation'];
const denied=new Set(['password','token','idToken','refreshToken','privateKey','cryptoKey','deviceCryptoKey','qrPayload','invitationLink','serviceAccount','authenticationUsers','roles','devices','sessions']);
export function noSecrets(value){
 if(!value||typeof value!=='object')return;
 for(const [k,v]of Object.entries(value)){assert(!denied.has(k),'forbidden-migration-field:'+k);noSecrets(v);}
}
export function supported(source){
 noSecrets(source);
 assert.deepEqual(Object.keys(source).sort(),[...topFields].sort(),'unmapped-source-area');
 assert.equal(source.control.state,'preparing','unmapped-control-state');
 assert.equal(Object.keys(source.reception).length,0,'reception-not-converted');
 assert.equal(Object.keys(source.sharedDrafts).length,0,'shared-draft-not-converted');
 assert.equal(source.sharedHead,null,'shared-draft-head-not-converted');
 assert.equal(source.pendingOperations.length,0,'unresolved-operation');
 assert.equal(source.unsentEvents,0,'unsent-event');
 // operations/deletionsは旧128では原本保管だけ。通常照会・再計算へ接続するまで許可しない。
 assert.equal(Object.keys(source.operations).length,0,'immutable-operation-not-converted');
 assert.equal(Object.keys(source.deletions).length,0,'deletion-ledger-not-converted');
 return true;
}
export async function convert(source,id){supported(source);const result=await previous(source,id);compare(source,result);return result;}

export function activationProof({sourceHash,sourceAreas,readBackAreas,requiredAreas,reauthenticated,devicesReprepared,sourceFenced,unresolvedOperations,unsentEvents}){
 assert(typeof sourceHash==='string'&&/^[a-f0-9]{64}$/.test(sourceHash),'source-hash-required');
 assert(reauthenticated&&devicesReprepared&&sourceFenced,'authorization-boundary-not-ready');
 assert.equal(unresolvedOperations,0,'unresolved-operation');assert.equal(unsentEvents,0,'unsent-event');
 assert.deepEqual(Object.keys(sourceAreas).sort(),[...requiredAreas].sort(),'source-area-coverage');
 assert.deepEqual(Object.keys(readBackAreas).sort(),[...requiredAreas].sort(),'readback-area-coverage');
 for(const area of requiredAreas){
  const from=sourceAreas[area],to=readBackAreas[area];
  assert(from.mode==='native'&&to.mode==='native','preservation-only-not-activation:'+area);
  assert.equal(from.format,to.format,'area-format-mismatch:'+area);
  assert.equal(from.hash,to.hash,'area-content-mismatch:'+area);
  assert(/^[a-f0-9]{64}$/.test(from.hash),'area-hash-required');
 }
 return true;
}
