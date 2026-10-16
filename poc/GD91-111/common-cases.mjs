import assert from 'node:assert/strict';
import {runCases as capacityCases} from '../GD91-110/common-cases.mjs';
import {initialize} from '../GD91-89/projection.mjs';
import {command,applyModel} from '../GD91-103/model.mjs';
import {bulk} from '../GD91-92/model.mjs';
import {createReferences} from '../GD91-92/references.mjs';
import {lease,queuedEvent} from '../GD91-96/queue.mjs';
import {createQueue} from '../GD91-99/queue.mjs';
import {createQuarantine} from '../GD91-98/quarantine.mjs';
import {reviewRequest} from '../GD91-99/review.mjs';
import {appendDevice} from './registry.mjs';
import {executeClosing} from './execute.mjs';
import {beginClose,acknowledgement,advance,foldSource,factStep,completeClose,cancelClose,declareLoss} from './closing.mjs';

// 同じ入出力契約で、ローカル確認と承認後の外部代表確認を実行する。
export async function runCases(io,m,a){
 const prior=await capacityCases(io,m,a),reports=[];
 let maxJsonNodes=prior.maxJsonNodes,maxRootJsonBytes=prior.maxRootJsonBytes;
 const nodes=v=>v===null||typeof v!=='object'?1:1+Object.values(v).reduce((n,x)=>n+nodes(x),0);
 const report=async(id,facts)=>{
  const root=await io.owner('');maxJsonNodes=Math.max(maxJsonNodes,nodes(root));maxRootJsonBytes=Math.max(maxRootJsonBytes,Buffer.byteLength(JSON.stringify(root)));
  assert(maxJsonNodes<=4000);assert(maxRootJsonBytes<=1048576);reports.push({id,...facts});io.onReport?.({id,...facts});
 };
 const normal=(subject,path,method='GET',body)=>io.normal(subject,path,method,body);
 const send=async body=>{const r=await normal(m,'','PATCH',body);assert.equal(r.status,200);return r.body;};
 const read=async path=>{const r=await normal(m,path);assert.equal(r.status,200);return r.body;};
 const control={...(await read('control')),state:'preparing',revision:1,closingSchemaVersion:1};await io.owner('control','PUT',control);
 const boot=[m,a];await io.owner('deviceRoster','PUT',{meta:{count:2,revision:2,lastDeviceUid:a.device.uid},byOrder:{n0:m.device.uid,n1:a.device.uid},byId:{[m.device.uid]:0,[a.device.uid]:1}});
 const b=await io.newDevice(a.human);await send(appendDevice(await read('deviceRoster/meta'),{schemaVersion:2,performanceId:io.performanceId,deviceUid:b.device.uid,humanUid:a.human.uid,active:true,preparedRoleRevision:1}));await io.issue(b);
 const head=await read('head'),state=initialize(),refs=createReferences({user:(path,device,method='GET',body)=>normal({device},path,method,body),inspect:async(subject,p)=>{const r=await normal(subject,'event/operations/'+p.operationId);assert.equal(r.status,200);return{state:r.body?'committed':'absent'};}});await refs.acquire(m,head);
 const commit=async body=>{
  const p={operationId:body.commit.operationId,body};await refs.reserve(m,p);const r=await normal(m,'event','PATCH',body);assert.equal(r.status,200);applyModel(state,body);await refs.clear(m,p);
 };
 for(let i=0;i<2;i++)await commit(command(m,state,head,'register','person-'+i,{profile:{name:'架空氏名'+i,displayName:'架空'+i,paid:false,extra:Object.fromEntries(Array.from({length:10},(_,j)=>['f'+j,'']))}}));
 assert.equal((await read('event/commit')).revision,state.commit.revision);
 const generationMeta=await read('generations/'+head.generation+'/meta'),seatIds=[];for(let n=0;n<generationMeta.expectedParts;n++){const part=await read('generations/'+head.generation+'/parts/p'+n);seatIds.push(...Object.values(part.slots).filter(s=>s.kind==='seat').map(s=>s.id));}assert.equal(seatIds.length,2);
 await commit(bulk(m,state,head,{'person-0':seatIds[0],'person-1':seatIds[1]}));
 for(const id of ['person-0','person-1']){await commit(command(m,state,head,'qrCreate',id));await commit(command(m,state,head,'ticketCheck',id));}
 await io.owner('control','PUT',{...control,state:'operating',revision:2});
 let queueState=null;const qlease=lease(a,head,2),storage={user:normal,loadState:async()=>structuredClone(queueState),saveState:async value=>{queueState=structuredClone(value);}},queue=createQueue(storage);await queue.acquire(a,qlease);
 await queue.append(a,queuedEvent(io.performanceId,a,1,'person-0',state.tickets['person-0'],qlease));await queue.flush(a);
 const stopped={...control,state:'stopped',revision:3,endedAt:Date.now()};await io.owner('control','PUT',stopped);
 const pending=queuedEvent(io.performanceId,a,2,'person-1',state.tickets['person-1'],qlease);queueState={lease:qlease,queue:[pending],received:[],nextSequence:3};await createQuarantine(storage).transfer(a);
 const source=await read('receiptSources/'+a.device.uid+'/1000000002');assert.equal(source.destination,'quarantine');
 const event=await read('quarantine/'+a.device.uid+'/events/'+source.key);await send(reviewRequest(m,a.device.uid,source.key,event,await read('quarantineReviewState/'+qlease.id),{outcome:'adopt',reason:'架空紙原本を照合',controlRevision:3}).body);
 await io.owner('performanceFacts','PUT',{performanceName:'架空公演',venueName:'架空会場',venueAddress:'架空住所'});
 const baseline=await io.owner('');assert.equal(Object.keys(baseline.devices).length,3);assert.equal(baseline.deviceRoster.meta.count,3);const subjects=[...boot,b],confirmations={conflicts:true,paper:true,absences:true,devices:true};
 await report('K01',{existingCapacityGroups:prior.reports.length,normalRuntimeDeviceRegistration:true,normalBusinessRegistrationAndQr:true,sourceIndexedQuarantineReviewed:true});

 const first=await executeClosing({read,send,normal,manager:m,subjects,confirmations,assertLocalEmpty:async()=>{assert.equal(queueState.queue.length,0);}});
 assert.equal(first.result.deviceCount,3);assert.equal(first.result.arrived,2);assert.equal((await read('actuals/person-0')).name,'架空氏名0');assert.equal((await read('actualTotals/part0')).arrived,2);
 await report('K02',{normalCloseAllRegisteredDevices:true,initialActualsCreatedNormally:true,closedAndActualsNotSeeded:true,sourceEvents:2});

 await io.owner('','PUT',baseline);let meta=beginClose(stopped,baseline.deviceRoster.meta,2,head,{...baseline.performanceFacts,businessRevision:state.commit.revision});await send({'closing/meta':meta});
 assert.equal((await normal(m,'closingRuns/'+meta.operationId+'/acks/'+a.device.uid,'PUT',acknowledgement(meta,a.device.uid,2))).status,401);
 const invalid=completeClose({...meta,phase:'facts',personCursor:2},stopped,m,confirmations);assert.equal((await normal(m,'','PATCH',invalid)).status,401);
 await send(cancelClose(meta,stopped,m,'架空の照合やり直し'));const current=await read('control');
 assert.equal((await normal(m,'closing/meta','PUT',beginClose(current,baseline.deviceRoster.meta,2,head,{...baseline.performanceFacts,businessRevision:state.commit.revision},{id:meta.operationId}))).status,401);
 const fresh=beginClose(current,baseline.deviceRoster.meta,2,head,{...baseline.performanceFacts,businessRevision:state.commit.revision});await send({'closing/meta':fresh});await send(cancelClose(fresh,current,m,'架空の試験完了'));
 await report('K03',{proxyAcknowledgementAndSkippedStagesDenied:true,cancellationAudited:true,oldOperationIdReuseDenied:true,newOperationIdAccepted:true});

 await io.owner('','PUT',baseline);await io.owner('devices/'+a.device.uid+'/active','PUT',false);
 meta=beginClose(stopped,baseline.deviceRoster.meta,2,head,{...baseline.performanceFacts,businessRevision:state.commit.revision},{mode:'exceptional'});await send({'closing/meta':meta});
 for(const subject of [m,b])assert.equal((await normal(subject,'closingRuns/'+meta.operationId+'/acks/'+subject.device.uid,'PUT',acknowledgement(meta,subject.device.uid,0))).status,200);
 await send({'closing/meta':advance(meta,{deviceIndex:1})});meta=await read('closing/meta');
 assert.equal((await normal(m,'','PATCH',{'closing/meta':advance(meta,{deviceIndex:2})})).status,401);
 await send({['closingRuns/'+meta.operationId+'/losses/'+a.device.uid]:declareLoss(meta,m,a.device.uid,2,event.receivedAt,'架空紙照合済み、端末回収不能')});
 for(let n=1;n<=2;n++){
  const index=await read('receiptSources/'+a.device.uid+'/'+String(1000000000+n)),value=await read((index.destination==='normal'?'receipts':'quarantine')+'/'+a.device.uid+'/events/'+index.key);
  await send(foldSource(meta,a.device.uid,value,await read('closingRuns/'+meta.operationId+'/arrivals/'+value.attendeeId)));meta=await read('closing/meta');
 }
 for(const changes of [{deviceIndex:2,sequenceCursor:0,lossCount:1},{deviceIndex:3},{phase:'geometry'}]){await send({'closing/meta':advance(meta,changes)});meta=await read('closing/meta');}
 const part=await read('generations/'+head.generation+'/parts/p0');await send({'closing/meta':advance(meta,{partCursor:1,seatCount:Object.values(part.slots).filter(s=>s.kind==='seat').length})});meta=await read('closing/meta');await send({'closing/meta':advance(meta,{phase:'facts'})});meta=await read('closing/meta');
 for(let i=0;i<2;i++){
  const id='person-'+i;await send(factStep(meta,{...(await read('event/people/'+id)),id,performanceId:io.performanceId},await read('event/profiles/'+id),await read('event/tickets/'+id),await read('closingRuns/'+meta.operationId+'/arrivals/'+id),await read('actualTotals/part0')));meta=await read('closing/meta');
 }
 await send(completeClose(meta,stopped,m,confirmations));const result=await read('closingResults/'+meta.operationId);assert.equal(result.lossCount,1);assert.equal(result.unreceivedPossible,true);assert.equal(result.arrived,2);const loss=await read('closingRuns/'+meta.operationId+'/losses/'+a.device.uid);assert.equal(loss.unreceivedCount,'unknown');assert.equal(loss.deletionState,'unconfirmed');
 await report('K04',{exceptionalCloseRequiresLossEvidence:true,receivedEventsRetained:true,unknownNotZero:true,localDeletionNotClaimed:true});
 return{reports,maxJsonNodes,maxRootJsonBytes,existingCapacityGroups:prior.reports.length,bootstrapAndStoppedControlSeeded:true,closedAndActualsNotSeeded:true,localStore:'RAM',realIndexedDbVerifiedHere:false,productionFreeTierVerified:false};
}
