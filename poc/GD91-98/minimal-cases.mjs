import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lease,queuedEvent,createQueue} from '../GD91-96/queue.mjs';
import {createQuarantine} from './quarantine.mjs';

export async function runMinimalCases(io,a,b){
 const reports=[],head={generation:'layout',revision:1};let maxJsonNodes=0,maxRootJsonBytes=0;
 const nodes=v=>v===null||typeof v!=='object'?1:1+Object.values(v).reduce((n,x)=>n+nodes(x),0);
 const measure=async()=>{const root=await io.owner('');maxJsonNodes=Math.max(maxJsonNodes,nodes(root));maxRootJsonBytes=Math.max(maxRootJsonBytes,Buffer.byteLength(JSON.stringify(root)));assert(maxJsonNodes<=2000);assert(maxRootJsonBytes<=1048576);};
 const rows=Object.fromEntries([0,1].map(i=>['i-person-'+i,{personId:'person-'+i,credentialRef:'credential-'+i,credentialVersion:1,currentCycle:1}]));
 // 業務登録・配置公開と停止指示は前提投入。今回の共通比較は隔離受領だけを検証する。
 await io.owner('', 'PUT',{
  control:{state:'operating',revision:2},head:{...head,operationId:'fixture-layout'},
  generations:{layout:{meta:{kind:'layout',phase:'ready',revision:3,cursor:1,expectedParts:1,lastPart:'p0'}}},
  roles:{[a.human.uid]:{active:true,role:'receptionist',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000}},
  devices:Object.fromEntries([a,b].map(f=>[f.device.uid,{schemaVersion:2,performanceId:io.performanceId,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1}])),
  event:{people:Object.fromEntries([0,1].map(i=>['person-'+i,{active:true,seatId:'cell-'+i,displayName:'架空',revision:1}])),tickets:Object.fromEntries([0,1].map(i=>['person-'+i,{credentialRef:'credential-'+i,credentialVersion:1,currentCycle:1,cycleClosed:false,everIssued:false}])),reception:rows}
 });
 for(const f of[a,b])await io.issue(f);
 const states=[null,null],transport=(f,p,m='GET',body)=>io.normal(f,p,m,body);
 const stores=states.map((_,i)=>({loadState:async()=>structuredClone(states[i]),saveState:async value=>{states[i]=structuredClone(value);}}));
 const queues=stores.map(s=>createQueue({user:transport,...s})),leases=[lease(a,head,2),lease(b,head,2)];
 for(let i=0;i<2;i++)await queues[i].acquire([a,b][i],leases[i]);
 const events=[0,1].map(i=>queuedEvent(io.performanceId,a,i+1,'person-'+i,rows['i-person-'+i],leases[0]));for(const p of events)await queues[0].append(a,p);
 const make=(p,sequence=1)=>({counter:{sequence,eventKey:String(1000000000+sequence),eventId:p.event.eventId,lastSourceSequence:p.event.sequence},['events/'+String(1000000000+sequence)]:structuredClone(p.event),['ids/'+p.event.eventId]:String(1000000000+sequence)});
 const path='quarantine/'+a.device.uid,receiver=createQuarantine({user:transport,...stores[0]});
 assert.equal((await io.normal(a,path,'PATCH',make(events[1]))).status,401);assert.equal((await io.normal(a,'receipts/'+a.device.uid,'PATCH',events[0].body)).status,200);
 reports.push({id:'M01',liveQuarantineDenied:true,normalReceiptAccepted:true,businessRegistrationAndPublicationPreloaded:true});
 await io.owner('control','PUT',{state:'stopped',revision:3});await io.owner('devices/'+a.device.uid+'/active','PUT',false);await measure();
 assert.equal((await io.normal(a,'event/reception')).status,401);assert.equal((await io.normal(a,'receipts/'+a.device.uid,'PATCH',events[1].body)).status,401);
 assert.equal((await io.normal(b,path,'PATCH',make(events[1]))).status,401);const wrong=make(events[1]);wrong['events/1000000001'].layoutReferenceId=leases[1].id;assert.equal((await io.normal(a,path,'PATCH',wrong)).status,401);
 reports.push({id:'M02',stoppedNormalRouteDenied:true,otherDeviceAndReferenceDenied:true});
 let committed=false;
 await assert.rejects(()=>receiver.transfer(a,{write:async({path,body})=>{const r=await io.normal(a,path,'PATCH',body);assert.equal(r.status,200);committed=true;throw new Error('injected-response-ignore');}}),/injected-response-ignore/);
 assert(committed);assert.equal(states[0].queue.length,1);assert.equal(states[0].received[0].destination,'normal');
 reports.push({id:'M03',normalResultReused:true,quarantineCommittedBeforeIgnoredResponse:true,physicalSocketDropTestedHere:false});
 const trace={writes:0};await receiver.transfer(a,{trace});assert.equal(trace.writes,0);assert.equal(states[0].queue.length,0);assert.equal(states[0].received.length,2);assert.equal(states[0].received[1].destination,'quarantine');
 assert.equal((await io.owner(path+'/counter')).sequence,1);assert.equal((await io.normal(b,path+'/ids/'+events[1].event.eventId)).status,401);
 reports.push({id:'M04',sameIdAndContentLookup:true,secondQuarantineWrites:0,otherDeviceResultDenied:true});
 const future=structuredClone(events[1]);future.event.eventId=randomUUID();future.event.sequence=3;const body=make(future,2);
 for(const omitted of Object.keys(body)){const partial={...body};delete partial[omitted];assert.equal((await io.normal(a,path,'PATCH',partial)).status,401);}
 assert.equal((await io.normal(a,path+'/events/1000000001','DELETE')).status,401);assert.equal((await io.normal(a,path,'PATCH',make(events[1],2))).status,401);
 reports.push({id:'M05',partialRequestsDenied:3,deleteAndReplayDenied:true});
 assert.deepEqual(await io.owner('event/reception'),rows);assert.equal(await io.owner('generations/layout/refs/'+leases[0].id),true);await assert.rejects(()=>queues[0].release(a));
 assert.equal(states[0].received.length,2);await measure();
 reports.push({id:'M06',publicReceptionUnchanged:true,referenceAndLocalArchiveHeld:true,manualAdoptionVerified:false});
 return{reports,maxJsonNodes,maxRootJsonBytes,realIndexedDbVerifiedHere:false,managerLoginAndReviewTestedHere:false,fullBusinessFreeTierVerified:false};
}
