import assert from 'node:assert/strict';
import {hash} from '../GD91-128/conversion.mjs';
import {decode} from '../GD91-123/model.mjs';
import {noSecrets} from '../GD91-143/contract.mjs';
export const excluded=['roles','devices','sessions','references','probes','deviceRoster'];
export const business=['control','head','operations','sharedHead','generations','view','private','shared','sharedOperations','event','receipts','quarantine','receiptClocks','receiptSources','receiptEventIds','quarantineReviewState','quarantineReviews','reviewOperations','managedReceipts','referenceClosures','reviewReleases','postClosePermits','postClosePermitHeads','lossDeclarations','postCloseCorrections','actuals','actualTotals','publicationChecks','sectionViews','sectionPresentation','numberProofs','closing','closingRuns','performanceFacts','closingResults','closingCancellations','images'];
export function exportBundle(root){
 for(const k of Object.keys(root))assert([...business,...excluded].includes(k),'unmapped-native-root:'+k);
 assert.equal(root.control.businessSchemaVersion,3,'unsupported-business-schema');assert.equal(root.control.layoutSchemaVersion,2);
 assert.equal(root.control.state,'closed','closed-only-candidate');
 assert.equal(root.closing.meta.phase,'closed');assert(root.closingResults[root.closing.meta.operationId],'missing-close-result');
 for(const r of Object.values(root.references??{}))assert(!r.pendingOperationId,'unresolved-operation');
 // 暗号文は保管だけでは移行先で操作できない。鍵の引継ぎを偽装せず拒否する。
 for(const k of ['private','shared','sharedHead','sharedOperations'])assert(!root[k]||Object.keys(root[k]).length===0,'encrypted-draft-reencryption-required:'+k);
 const areas=Object.fromEntries(business.filter(k=>Object.hasOwn(root,k)).map(k=>[k,structuredClone(root[k])]));
 noSecrets(areas);
 const hashes=Object.fromEntries(Object.entries(areas).map(([k,v])=>[k,hash(v)]));
 for(const slot of Object.values(areas.images??{})){assert(slot.head.active);const p=slot.banks[slot.head.bank];assert.equal(p.sha256,slot.head.sha256);decode(p);}
 const facts=Object.values(areas.actuals),totals=Object.values(areas.actualTotals),result=areas.closingResults[areas.closing.meta.operationId];
 assert.equal(facts.length,result.peopleCount);assert.equal(totals.reduce((n,x)=>n+x.total,0),facts.length);assert.equal(totals.reduce((n,x)=>n+x.arrived,0),facts.filter(x=>x.arrived).length);
 for(const [id,fact]of Object.entries(areas.actuals)){assert.equal(fact.attendeeId,id);assert.equal(fact.name,areas.event.profiles[id].name);assert.equal(fact.closeOperationId,result.operationId);}
 return{format:'gd91-native-rtdb-closed-v1',areas,hashes,provenance:{sourceDeviceRoster:structuredClone(root.deviceRoster),sourceControlHash:hash(root.control)},sourceHash:hash(areas)};
}
export function compare(bundle,readBack){
 assert.equal(bundle.format,'gd91-native-rtdb-closed-v1');
 const actual=Object.fromEntries(Object.keys(bundle.areas).map(k=>[k,readBack[k]]));
 assert.equal(hash(actual),bundle.sourceHash,'bundle-content-mismatch');
 for(const [k,h]of Object.entries(bundle.hashes))assert.equal(hash(readBack[k]),h,'area-mismatch:'+k);
 for(const k of excluded)assert(!readBack[k],'runtime-identity-copied:'+k);
 return{areas:Object.keys(bundle.areas).length,people:Object.keys(actual.event.people).length,actuals:Object.keys(actual.actuals).length,images:Object.keys(actual.images??{}).length};
}
