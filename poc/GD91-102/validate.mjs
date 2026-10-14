import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createSection, numberInitial} from '../GD91-07/planner.mjs';
import {request, user, owner, trial, provision, issue, ok, metrics} from '../GD91-84/transport.mjs';
import {cleanup} from '../GD91-89/support.mjs';
import {encode, initialMeta, sectionPlan, partPlan, build, decode} from './layout-model.mjs';
import {publish} from '../GD91-84/generation-tests.mjs';
import {snapshot} from './snapshot.mjs';
import {preparePublication} from './publication.mjs';
import {initialize} from '../GD91-89/projection.mjs';
import {command, bulk, applyModel} from '../GD91-92/model.mjs';
import {createReferences} from '../GD91-92/references.mjs';
import {prepare} from '../GD91-91/sdk-adapter.mjs';
import {collect,removePart} from './collection.mjs';

const files = ['validate.mjs','layout-model.mjs','layout-rules.mjs','generate.mjs','snapshot.mjs','publication.mjs','publication-rules.mjs','collection.mjs','collection-rules.mjs','database.rules.json','../GD91-100/database.rules.json','../GD91-07/planner.mjs','../GD91-84/transport.mjs','../GD91-84/generation-tests.mjs','../GD91-89/support.mjs','../GD91-96/snapshot.mjs','../GD91-89/projection.mjs','../GD91-92/model.mjs','../GD91-92/references.mjs','../GD91-91/sdk-adapter.mjs'];
const hashes = () => Object.fromEntries(files.map(f=>[f, createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const before = hashes(), reports = []; let stage = 'setup', clean, failure;
async function check(id, fn) {stage=id; reports.push({id,...await fn()}); console.log(JSON.stringify({id,passed:true}));}
const context = {maxCells: 100000};
function fixture(rows=2, columns=5) {
  const base = createSection({name:'区'.repeat(100), rows, columns, axis:'horizontal', seatOrder:'reverse', stagePosition:'top', lines:Array.from({length:rows},(_,i)=>({name:'列'+i,prefix:'A.'+i+'-',startNumber:1}))},context);
  const selected = {};for (const c of base.section.cells) if(c.column<2)selected[c.row+','+c.column]=c.column===0?'seat':'gap';
  const m = numberInitial(base,selected,context);
  if(columns>2){const c=m.section.cells.find(c=>c.row===0&&c.column===1);c.kind='seat';c.seatId=randomUUID();m.seats.push({seatId:c.seatId,sectionId:m.section.sectionId,lineId:m.section.lineSettings[0].lineId,numberingMode:'manual',manualNumber:'補助/1',category:'reserved',usable:true,reservedLabel:'架'.repeat(100),emergencyChange:{kind:'add',reason:'補'.repeat(200)}});}
  return m;
}

try {
  ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url)))}));
  await owner(trial+'/control','PUT',{state:'preparing',revision:1,layoutSchemaVersion:2});
  const manager=await provision('owner'), staff=await provision('receptionist');ok(await issue(manager));ok(await issue(staff));
  const send=async(p,method,body)=>{const r=await user(p,manager.device,method,body);ok(r);return r.body;};
  const read=async p=>{const r=await user(p,manager.device);ok(r);return r.body;};
  const m=fixture();let first;
  await check('F01-full-layout-normal-save-and-roundtrip',async()=>{first=await build(send,'full-first',[m]);const checked=await preparePublication(read,send,manager,'full-first');ok(await user('',manager.device,'PATCH',checked.publish(1)));const result=decode(first.sections,first.items,{});assert.deepEqual(result[0].section.cells,m.section.cells);assert.deepEqual(result[0].section.lineSettings,m.section.lineSettings);assert.equal(result[0].section.stagePosition,'top');for(const seat of m.seats){const actual=result[0].seats.find(s=>s.seatId===seat.seatId);for(const[k,v]of Object.entries(seat))assert.deepEqual(actual[k],v);}return{cells:m.section.cells.length,distinctCellAndSeatIds:true,allSeatFieldsRoundtripped:true};});
  stage='normal-event-initialization';const state=initialize();await send('event','PATCH',{commit:state.commit,'reception/0000000000':1});
  await owner(trial+'/control','PUT',{state:'operating',revision:2,layoutSchemaVersion:2});
  await check('F02-reception-reads-full-model-without-private-person-data',async()=>{let reads=0;const read=async p=>{reads++;const r=await user(p,staff.device);ok(r);return r.body;};const a=await snapshot(read,async()=>({rows:{}}));assert.equal(Object.keys(a.cellsById).length,10);assert.equal(Object.keys(a.seatsById).length,3);assert.equal(a.models[0].seats.find(s=>s.numberingMode==='manual').emergencyChange.reason,'補'.repeat(200));const n=reads;const b=await snapshot(read,async()=>({rows:{}}),{cached:a});assert(b.cachedGeometryUsed);assert.equal(reads-n,2);assert.equal((await user('event/profiles',staff.device)).status,401);return{geometryReused:true,secondReadCalls:2,privateProfilesDenied:true};});
  async function prepared(id,model=m){const e=encode([model]);let meta=initialMeta(1,1);await send('generations/'+id+'/meta','PUT',meta);const [key,s]=Object.entries(e.sections)[0],p=sectionPlan(id,meta,key,s);await send('','PATCH',p);meta=p['generations/'+id+'/meta'];return{meta,items:e.items};}
  await check('F03-partial-index-and-coordinate-writes-rejected',async()=>{const f=await prepared('invalid-index'),body=partPlan('invalid-index',f.meta,f.items);let rejected=0;for(const k of Object.keys(body).filter(k=>/\/(cells|coordinates|numbers)\//.test(k))){const p={...body};delete p[k];assert.equal((await user('',manager.device,'PATCH',p)).status,401);rejected++;}return{omittedIndexesRejected:rejected};});
  await check('F04-out-of-range-and-conflicting-coordinate-rejected',async()=>{const f=await prepared('invalid-coordinate');for(const changed of [[{...f.items[0],row:2},...f.items.slice(1)],[f.items[0],{...f.items[1],row:f.items[0].row,column:f.items[0].column},...f.items.slice(2)]])assert.equal((await user('',manager.device,'PATCH',partPlan('invalid-coordinate',f.meta,changed))).status,401);return{rangeAndDuplicateCoordinatesRejected:true};});
  await check('F05-missing-cell-cannot-be-sealed',async()=>{const f=await prepared('incomplete'),p=partPlan('incomplete',f.meta,f.items.slice(0,-1));await send('','PATCH',p);const meta=p['generations/incomplete/meta'];assert.equal((await user('generations/incomplete/meta',manager.device,'PUT',{...meta,phase:'ready',revision:meta.revision+1})).status,401);return{incompleteGridRejected:true};});
  await check('F06-legacy-schema-bypass-rejected',async()=>{const legacy={kind:'layout',phase:'building',revision:1,cursor:0,expectedParts:1,lastPart:''};assert.equal((await user('generations/legacy-bypass/meta',manager.device,'PUT',legacy)).status,401);return{versionRequiredByControl:true};});
  await check('F07-numbering-and-emergency-contracts-rejected-when-invalid',async()=>{const f=await prepared('invalid-fields');for(const change of [{number:0},{prefix:'別の接頭部'},{emergencyChange:{kind:'add',reason:''}},{usable:'yes'},{cellId:'invalid'},{seatId:randomUUID()}]){const p=partPlan('invalid-fields',f.meta,[{...f.items[0],...change},...f.items.slice(1)]);assert.equal((await user('',manager.device,'PATCH',p)).status,401);}return{invalidFieldGroups:6};});
  stage='normal-registration-and-assignment';
  await owner(trial+'/control','PUT',{state:'preparing',revision:2,layoutSchemaVersion:2});
  const head=await read('head'),refs=createReferences({user,inspect:async()=>{throw new Error('ack-only');}});await refs.acquire(manager,head);let reference=await read('references/'+manager.referenceId);
  async function commit(body){const p=prepare(manager,body);reference=await refs.reserveKnown(manager,p,reference);const ack=await user('event',manager.device,'PATCH',body);ok(ack);applyModel(state,body);reference=await refs.clearAcknowledged(manager,p,reference,ack);}
  await commit(command(manager,state,head,'register','person-0',{controlRevision:2}));
  await commit(bulk(manager,state,head,{'person-0':m.seats[0].seatId},{controlRevision:2}));
  await commit(command(manager,state,head,'qrCreate','person-0',{controlRevision:2}));
  const protectedTicket=structuredClone(state.tickets['person-0']);
  async function deniedPublication(id){let deniedStatus;await assert.rejects(()=>preparePublication(read,async(p,method,body)=>{const r=await user(p,manager.device,method,body);if(r.status!==200){deniedStatus=r.status;throw new Error('expected-check-refusal');}return r.body;},manager,id));assert.equal(deniedStatus,401);}
  await check('P01-assigned-seat-removal-refused-before-publication',async()=>{const after=structuredClone(m),s=after.seats.shift(),c=after.section.cells.find(c=>c.seatId===s.seatId);delete c.seatId;c.kind='unset';await build(send,'missing-assigned',[after]);await deniedPublication('missing-assigned');assert.equal((await read('head')).generation,'full-first');return{missingAssignedSeatRejectedByServer:true};});
  await check('P02-assigned-seat-attribute-change-refused',async()=>{const after=structuredClone(m);after.seats[0].category='reserved';await build(send,'changed-assigned',[after]);await deniedPublication('changed-assigned');return{assignedAttributeChangeRejectedByServer:true};});
  await build(send,'unchanged',[m]);
  await check('P03-unchecked-and-incomplete-publication-refused',async()=>{assert.equal((await user('',manager.device,'PATCH',publish('unchanged',2))).status,401);const checked=await preparePublication(read,send,manager,'unchanged'),body=checked.publish(2);const partial={...body};delete partial['operations/'+body.head.operationId];assert.equal((await user('',manager.device,'PATCH',partial)).status,401);return{proofRequired:true,partialPublishRejected:true};});
  await check('P04-stale-proof-cannot-publish-after-event-update',async()=>{const checked=await preparePublication(read,send,manager,'unchanged');await commit(command(manager,state,head,'register','person-1',{controlRevision:2}));assert.equal((await user('',manager.device,'PATCH',checked.publish(2))).status,401);return{eventRevisionFenced:true};});
  await check('P05-stale-proof-cannot-publish-after-control-update',async()=>{const checked=await preparePublication(read,send,manager,'unchanged');await owner(trial+'/control/revision','PUT',3);assert.equal((await user('',manager.device,'PATCH',checked.publish(2))).status,401);await owner(trial+'/control/revision','PUT',2);return{controlRevisionFenced:true,controlFixtureRestored:true};});
  await check('P06-current-proof-publishes-with-assignment-preserved',async()=>{const checked=await preparePublication(read,send,manager,'unchanged');await send('','PATCH',checked.publish(2));assert.equal((await read('event/people/person-0')).seatId,m.seats[0].seatId);assert.deepEqual(await read('event/tickets/person-0'),protectedTicket);assert.equal((await read('head')).generation,'unchanged');assert.equal((await user('',manager.device,'PATCH',checked.cancel())).status,401);await send('','PATCH',checked.complete());assert.equal((await read('publicationChecks/'+checked.id)).phase,'published');assert.equal(await owner(trial+'/generations/unchanged/refs/publication-'+checked.id),null);return{protectedSeatUnchanged:true,qrUnchanged:true,publishedProofCannotBeCancelled:true,pinReleasedAfterAcknowledgement:true};});
  await check('P07-more-than-64-parts-can-be-published-and-read',async()=>{
    const margin=createSection({name:'追加の余白',rows:1,columns:1040,axis:'horizontal',seatOrder:'forward',stagePosition:'left',lines:[{name:'余白',prefix:'Z-',startNumber:1}]},context);
    const built=await build(send,'expanded-parts',[m,margin]);assert.equal(built.meta.expectedParts,66);
    const checked=await preparePublication(read,send,manager,'expanded-parts');await send('','PATCH',checked.publish(3));
    await owner(trial+'/control/state','PUT','operating');
    const staffRead=async p=>{const r=await user(p,staff.device);ok(r);return r.body;};
    const result=await snapshot(staffRead,async()=>({rows:{}}));assert.equal(Object.keys(result.cellsById).length,1050);assert.equal(Object.keys(result.seatsById).length,3);
    await owner(trial+'/control/state','PUT','preparing');
    return{publishedParts:66,cells:1050,readerPartBudget:256,old64PartGuardRemoved:true,productCellLimitApproved:false};
  });
  await check('P08-cursor-jump-and-stale-slot-flags-refused',async()=>{
    const nowHead=await read('head'),id=randomUUID(),record={candidateGeneration:'unchanged',sourceGeneration:nowHead.generation,sourceHeadRevision:nowHead.revision,sourceEventRevision:state.commit.revision,sourceControlRevision:2,deviceUid:manager.device.uid,publicationOperationId:randomUUID(),cursor:0,phase:'checking'};
    assert.equal((await user('publicationChecks/'+randomUUID(),manager.device,'PUT',{...record,phase:'checked'})).status,401);
    await send('','PATCH',{['publicationChecks/'+id]:record,['generations/unchanged/refs/publication-'+id]:true});
    const flags=cursor=>Object.fromEntries(Array.from({length:16},(_,i)=>['s'+String(i).padStart(2,'0'),cursor]));
    assert.equal((await user('publicationChecks/'+id,manager.device,'PUT',{...record,cursor:66,slots:flags(66)})).status,401);
    await send('publicationChecks/'+id,'PUT',{...record,cursor:1,slots:flags(1)});
    assert.equal((await user('publicationChecks/'+id,manager.device,'PUT',{...record,cursor:2,slots:flags(1)})).status,401);
    const partial=flags(2);delete partial.s00;assert.equal((await user('publicationChecks/'+id,manager.device,'PUT',{...record,cursor:2,slots:partial})).status,401);
    assert.equal((await user('publicationChecks/'+id,manager.device,'PUT',{...record,cursor:1,phase:'checked',slots:flags(1)})).status,401);
    return{uncheckedClaimRejected:true,cursorJumpRejected:true,staleAndOmittedFlagsRejected:true};
  });
  await check('P09-event-change-cannot-be-bundled-with-publication',async()=>{
    const nowHead=await read('head');await refs.acquire(manager,nowHead);reference=await read('references/'+manager.referenceId);
    const checked=await preparePublication(read,send,manager,'unchanged'),body=command(manager,state,nowHead,'register','person-2',{controlRevision:2}),p=prepare(manager,body);
    reference=await refs.reserveKnown(manager,p,reference);
    const combined={...checked.publish(4),...Object.fromEntries(Object.entries(body).map(([k,v])=>['event/'+k,v]))};
    assert.equal((await user('',manager.device,'PATCH',combined)).status,401);
    assert.equal((await read('head')).revision,3);assert.equal((await read('event/commit')).revision,state.commit.revision);
    const ack=await user('event',manager.device,'PATCH',body);ok(ack);applyModel(state,body);reference=await refs.clearAcknowledged(manager,p,reference,ack);
    assert.equal((await user('',manager.device,'PATCH',checked.publish(4))).status,401);
    return{postUpdateEventFenceChecked:true,partialStateNotCommitted:true};
  });
  await check('R01-publication-candidate-pin-prevents-collection',async()=>{
    await build(send,'collectible',[m]);const checked=await preparePublication(read,send,manager,'collectible'),meta=await read('generations/collectible/meta');
    assert.equal((await user('generations/collectible/meta',manager.device,'PUT',{...meta,phase:'deleting',revision:meta.revision+1})).status,401);
    assert.equal((await user('generations/collectible/refs/publication-'+checked.id,manager.device,'DELETE')).status,401);
    assert.equal((await user('',manager.device,'PATCH',checked.complete())).status,401);
    await send('','PATCH',checked.cancel());assert.equal((await read('publicationChecks/'+checked.id)).phase,'cancelled');assert.equal(await owner(trial+'/generations/collectible/refs/publication-'+checked.id),null);
    return{candidatePinned:true,unacknowledgedCompletionRejected:true,explicitCancellationReleasesPin:true};
  });
  await check('R02-retired-layout-indexes-and-parts-collected-in-order',async()=>{
    const meta=await read('generations/collectible/meta');await send('generations/collectible/meta','PUT',{...meta,phase:'deleting',revision:meta.revision+1});
    const part=await read('generations/collectible/parts/p0');assert.equal((await user('',manager.device,'PATCH',removePart('collectible',0,part))).status,401);
    await collect(read,send,'collectible');const result=await owner(trial+'/generations/collectible');assert.equal(result.meta.phase,'deleted');for(const key of['parts','ids','labels','indexes','sectionOrder','sections','refs'])assert(!result[key]);
    assert.equal((await read('event/people/person-0')).seatId,m.seats[0].seatId);return{indexesClearedBeforeParts:true,allGenerationPayloadCollected:true,operationAndAssignmentRetained:true};
  });
  await check('R03-current-layout-indexes-cannot-be-cleared',async()=>{assert.equal((await user('generations/expanded-parts/indexes',manager.device,'DELETE')).status,401);assert.equal((await read('head')).generation,'expanded-parts');return{currentGenerationProtected:true};});
} catch(e) {failure={stage,code:e.code??'trial-failed'};console.error(e.stack);process.exitCode=1;}
finally {clean=await cleanup();}
assert.deepEqual(before,hashes());
fs.writeFileSync(new URL('artifacts/validate-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,cleanup:clean,...(failure?{failure}:{}),metrics,formalLayoutSchemaConnected:true,assignedSeatPublicationProtectionVerified:!failure,publicationProtectionVerified:false,groupContractVerified:false,completeLayoutBusinessWorkflowVerified:false,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,cleanup:clean,failure:failure??null}));process.exit(process.exitCode??0);
