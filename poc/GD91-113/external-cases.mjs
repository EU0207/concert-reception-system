import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {lease,queuedEvent,createQueue} from '../GD91-96/queue.mjs';

// 外部用の代表8群。登録・発券・回収許可は架空の前提投入とする。
export async function runExternalCases(io,a){
 const reports=[],head={generation:'layout',revision:1};let maxJsonNodes=0,maxRootJsonBytes=0;
 const nodes=x=>x===null||typeof x!=='object'?1:1+Object.values(x).reduce((n,v)=>n+nodes(v),0);
 for(const [id,kind,expected] of [['E01','normal',200],['E02','expired',401],['E03','revoked',401],['E04','stopped',200],['E05','closed',401],['E06','permitted',200],['E07','expired-permit',401],['E08','malformed',401]]){
  const quarantined=['stopped','closed','permitted','expired-permit'].includes(kind),closed=['closed','permitted','expired-permit'].includes(kind);
  await io.owner('','PUT',{
   control:{state:'operating',revision:2,closingSchemaVersion:1},head,
   generations:{layout:{meta:{kind:'layout',phase:'ready',revision:3,cursor:1,expectedParts:1,lastPart:'p0'}}},
   roles:{[a.human.uid]:{active:true,role:'receptionist',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000}},
   devices:{[a.device.uid]:{schemaVersion:2,performanceId:io.performanceId,deviceUid:a.device.uid,humanUid:a.human.uid,active:true,preparedRoleRevision:1}},
   event:{people:{'person-0':{active:true,seatId:'cell-0',displayName:'架空',revision:1}},tickets:{'person-0':{credentialRef:'credential-0',credentialVersion:1,currentCycle:1,cycleClosed:false,everIssued:false}}}
  });
  a.sessionRevision=0;await io.issue(a);const l=lease(a,head,2);let state=null;
  await createQueue({user:io.normal,loadState:async()=>state,saveState:async v=>{state=v;}}).acquire(a,l);
  if(kind==='expired')await io.owner('sessions/'+a.device.uid+'/expiresAt','PUT',Date.now()-60000);
  if(kind==='revoked')await io.owner('roles/'+a.human.uid+'/active','PUT',false);
  if(quarantined)await io.owner('control','PUT',{state:closed?'closed':'stopped',revision:3,closingSchemaVersion:1});
  if(closed)await io.owner('devices/'+a.device.uid+'/active','PUT',false);
  if(['permitted','expired-permit'].includes(kind)){
   const operationId=randomUUID();await io.owner('postClosePermits/'+operationId,'PUT',{operationId,referenceId:l.id,deviceUid:a.device.uid,controlRevision:3,startSequence:1,endSequence:1,expiresAt:Date.now()+(kind==='permitted'?300000:-60000),reason:'架空紙原本の照合',paperConfirmed:true,humanUid:'fixture-manager',managerDeviceUid:'fixture-device',decidedAt:Date.now()});
   await io.owner('postClosePermitHeads/'+l.id,'PUT',{operationId,revision:1});
  }
  const p=queuedEvent(io.performanceId,a,1,'person-0',{credentialRef:'credential-0',credentialVersion:1,currentCycle:1},l,{observedAt:Date.now()+86400000});
  if(kind==='malformed')p.event.observedAt='future';
  const path=(quarantined?'quarantine/':'receipts/')+a.device.uid,key=p.body.counter.eventKey;
  const body=quarantined?{counter:{...p.body.counter,lastSourceSequence:1},['events/'+key]:p.event,['ids/'+p.event.eventId]:key,['leaseHolds/'+l.id]:true}:p.body;
  const before=await io.owner(''),r=await io.normal(a,path,'PATCH',body),after=await io.owner('');assert.equal(r.status,expected,id);
  if(expected===401)assert.deepEqual(after,before);
  else{const event=after[quarantined?'quarantine':'receipts'][a.device.uid].events[key];assert.equal(event.observedAt,p.event.observedAt);assert(Number.isInteger(event.receivedAt));assert.deepEqual(after.event.reception,before.event.reception);}
  maxJsonNodes=Math.max(maxJsonNodes,nodes(after));maxRootJsonBytes=Math.max(maxRootJsonBytes,Buffer.byteLength(JSON.stringify(after)));assert(maxJsonNodes<=4000&&maxRootJsonBytes<=1048576);
  const report={id,kind,httpStatus:r.status,clientObservationPreserved:expected===200,bootstrapBusinessAndPermitsSeeded:true,normalManagerPermitCreationVerified:false};reports.push(report);io.onReport?.(report);
 }
 return {reports,maxJsonNodes,maxRootJsonBytes,realGoogleLoginUsed:false,normalBusinessPreparationVerified:false,productionFreeTierVerified:false};
}
