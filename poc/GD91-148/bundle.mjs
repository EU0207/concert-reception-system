import assert from 'node:assert/strict';import {exportBundle as previous,business as priorBusiness} from '../GD91-145/bundle.mjs';import {hash} from '../GD91-128/conversion.mjs';import {noSecrets} from '../GD91-143/contract.mjs';
export const business=[...priorBusiness,'references','migrationOrigins'];
export function exportBundle(source){
 const old=previous(source),areas=structuredClone(old.areas),references=structuredClone(source.references??{});let disabled=0,removed=0;
 for(const [id,r]of Object.entries(references)){
  assert([3,5].includes(r.schemaVersion),'unsupported-source-reference-schema');assert(typeof r.deviceUid==='string'&&r.deviceUid.length>0);assert(typeof r.active==='boolean');assert(!r.pendingOperationId,'unresolved-operation');assert(Number.isSafeInteger(r.revision)&&r.revision>0);
  if(r.active){assert(source.generations?.[r.generation],'active-reference-generation-missing');disabled++;}
  r.active=false;
  for(const g of Object.values(areas.generations??{})){if(g.refs&&Object.hasOwn(g.refs,id)){delete g.refs[id];removed++;if(!Object.keys(g.refs).length)delete g.refs;}}
 }
 if(Object.keys(references).length)areas.references=references;
 assert(source.deviceRoster?.meta?.count>0,'source-roster-required');assert.equal(source.deviceRoster.meta.count,areas.closingResults[areas.closing.meta.operationId].deviceCount,'source-roster-count');
 areas.migrationOrigins={schemaVersion:1,sourceBusinessHash:old.sourceHash,sourceReferencesHash:hash(source.references??{}),sourceControlHash:old.provenance.sourceControlHash,sourceDeviceRoster:structuredClone(source.deviceRoster),referenceCount:Object.keys(references).length,disabledReferenceCount:disabled,removedGenerationPinCount:removed};
 noSecrets(areas);const hashes=Object.fromEntries(Object.entries(areas).map(([k,v])=>[k,hash(v)]));
 return{format:'gd91-native-rtdb-closed-v2',areas,hashes,sourceHash:hash(areas),provenance:{...old.provenance,referencePermissionsNotCarried:true,sourceBusinessHash:old.sourceHash}};
}
