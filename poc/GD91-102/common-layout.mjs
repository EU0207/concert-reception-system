import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {build} from './layout-model.mjs';
import {preparePublication} from './publication.mjs';
import {collect} from './collection.mjs';
import {snapshot} from './snapshot.mjs';
import {initialize} from '../GD91-89/projection.mjs';
import {command,bulk,applyModel} from '../GD91-92/model.mjs';
import {createReferences} from '../GD91-92/references.mjs';
import {prepare} from '../GD91-91/sdk-adapter.mjs';
import {publish} from '../GD91-84/generation-tests.mjs';

export async function runLayoutCases(io,m,a){
  const reports=[];let maxJsonNodes=0,maxRootJsonBytes=0;
  const nodes=v=>v===null||typeof v!=='object'?1:1+Object.values(v).reduce((n,x)=>n+nodes(x),0);
  async function report(id,facts){const root=await io.owner('');maxJsonNodes=Math.max(maxJsonNodes,nodes(root));maxRootJsonBytes=Math.max(maxRootJsonBytes,Buffer.byteLength(JSON.stringify(root)));assert(maxJsonNodes<=2000);assert(maxRootJsonBytes<=1048576);reports.push({id,...facts});}
  for(const[f,role]of[[m,'owner'],[a,'receptionist']]){
    await io.owner('roles/'+f.human.uid,'PUT',{active:true,role,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});
    await io.owner('devices/'+f.device.uid,'PUT',{schemaVersion:2,performanceId:io.performanceId,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1});await io.issue(f);
  }
  await io.owner('control','PUT',{state:'preparing',revision:1,layoutSchemaVersion:2});
  const read=async p=>{const r=await io.normal(m,p);assert.equal(r.status,200);return r.body;};
  const send=async(p,method,body)=>{const r=await io.normal(m,p,method,body);assert.equal(r.status,200);return r.body;};
  const cx={maxCells:100000},base=createSection({name:'検証区画',rows:2,columns:5,axis:'horizontal',seatOrder:'reverse',stagePosition:'top',lines:[{name:'A',prefix:'A-',startNumber:1},{name:'B',prefix:'B-',startNumber:1}]},cx);
  const model=numberInitial(base,{'0,0':'seat','0,1':'gap','1,0':'seat','1,1':'gap'},cx);
  const cell=model.section.cells.find(c=>c.row===0&&c.column===1);cell.kind='seat';cell.seatId=randomUUID();model.seats.push({seatId:cell.seatId,sectionId:model.section.sectionId,lineId:model.section.lineSettings[0].lineId,numberingMode:'manual',manualNumber:'補助/1',category:'reserved',usable:true,reservedLabel:'架空確保席',emergencyChange:{kind:'add',reason:'架空の補助席用途'}});
  await build(send,'layout',[model]);const initial=await preparePublication(read,send,m,'layout');await send('','PATCH',initial.publish(1));await send('','PATCH',initial.complete());
  const state=initialize();await send('event','PATCH',{commit:state.commit,'reception/0000000000':1});const head=await read('head');
  const user=(p,device,method='GET',body)=>io.normal({device},p,method,body),refs=createReferences({user,inspect:async()=>{throw new Error('ack-only');}});await refs.acquire(m,head);let reference=await read('references/'+m.referenceId);
  async function commit(body){const p=prepare(m,body);reference=await refs.reserveKnown(m,p,reference);const ack=await io.normal(m,'event','PATCH',body);assert.equal(ack.status,200);applyModel(state,body);reference=await refs.clearAcknowledged(m,p,reference,ack);}
  for(let i=0;i<2;i++)await commit(command(m,state,head,'register','person-'+i));await commit(bulk(m,state,head,{'person-0':model.seats[0].seatId,'person-1':model.seats[1].seatId}));await commit(command(m,state,head,'qrCreate','person-0'));
  const ticket=await read('event/tickets/person-0');await report('S01',{typedLayoutNormallySaved:true,normalPeopleRegistered:2,cellAndSeatIdsDistinct:true});

  await io.owner('control','PUT',{state:'operating',revision:2,layoutSchemaVersion:2});
  const result=await snapshot(p=>io.sdkRead(a,p),async()=>({rows:await io.sdkRead(a,'event/reception',{orderBy:'"$key"',startAt:'"i-"',limitToFirst:'32'})??{}}));
  assert.equal(Object.keys(result.cellsById).length,10);assert.equal(Object.keys(result.seatsById).length,3);assert.equal(result.models[0].section.stagePosition,'top');assert.equal(result.models[0].seats.find(s=>s.numberingMode==='manual').emergencyChange.reason,'架空の補助席用途');assert.equal((await io.normal(a,'event/profiles')).status,401);await report('S02',{sdkTypedProjectionRead:true,privateProfilesDenied:true});
  await io.owner('control','PUT',{state:'preparing',revision:3,layoutSchemaVersion:2});

  const missing=structuredClone(model),removed=missing.seats.shift(),old=missing.section.cells.find(c=>c.seatId===removed.seatId);old.kind='unset';delete old.seatId;
  await build(send,'missing',[missing]);let rejected;
  await assert.rejects(()=>preparePublication(read,async(p,method,body)=>{const r=await io.normal(m,p,method,body);if(r.status!==200){rejected=r.status;throw new Error('expected-refusal');}return r.body;},m,'missing'));assert.equal(rejected,401);assert.equal((await read('head')).generation,'layout');await report('S03',{assignedSeatOmissionRefusedBeforePublish:true});

  await build(send,'candidate',[model]);assert.equal((await io.normal(m,'','PATCH',publish('candidate',2))).status,401);
  const pinned=await preparePublication(read,send,m,'candidate'),meta=await read('generations/candidate/meta');
  assert.equal((await io.normal(m,'generations/candidate/meta','PUT',{...meta,phase:'deleting',revision:meta.revision+1})).status,401);assert.equal((await io.normal(m,'','PATCH',pinned.complete())).status,401);await report('S04',{uncheckedPublishRefused:true,candidateReferenceProtectsFromCollection:true,unacknowledgedCompletionDenied:true});
  assert.equal((await io.normal(m,'generations/candidate/refs/publication-'+pinned.id,'DELETE')).status,401);await send('','PATCH',pinned.cancel());assert.equal((await read('publicationChecks/'+pinned.id)).phase,'cancelled');await report('S05',{rawPinReleaseDenied:true,explicitCancellationRecorded:true});

  const stale=await preparePublication(read,send,m,'candidate');await commit(command(m,state,head,'register','person-2',{controlRevision:3}));assert.equal((await io.normal(m,'','PATCH',stale.publish(2))).status,401);await send('','PATCH',stale.cancel());await report('S06',{eventRevisionFenced:true,staleProofExplicitlyCancelled:true});
  const checked=await preparePublication(read,send,m,'candidate'),body=checked.publish(2);await send('','PATCH',body);assert.deepEqual(await read('event/tickets/person-0'),ticket);assert.equal((await read('event/people/person-0')).seatId,model.seats[0].seatId);assert.equal((await io.normal(m,'','PATCH',checked.cancel())).status,401);await send('','PATCH',checked.complete());assert.equal((await read('publicationChecks/'+checked.id)).phase,'published');await report('S07',{qrAndAssignmentPreserved:true,completeRecordedAfterPublish:true,publishedProofNotCancelled:true});
  await build(send,'collectible',[model]);const cancelled=await preparePublication(read,send,m,'collectible');await send('','PATCH',cancelled.cancel());await collect(read,send,'collectible');assert.equal((await read('generations/collectible/meta')).phase,'deleted');assert.equal((await io.normal(m,'generations/candidate/indexes','DELETE')).status,401);await report('S08',{unreferencedTypedLayoutCollected:true,currentGenerationProtected:true});
  return{reports,maxJsonNodes,maxRootJsonBytes,fullLayoutBusinessWorkflowVerified:false,groupContractVerified:false,realIndexedDbVerifiedHere:false,physicalSocketDropTestedHere:false,wholeBrowserApplicationTested:false,fullBusinessFreeTierVerified:false};
}
