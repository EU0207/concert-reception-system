import assert from 'node:assert/strict';
import {lease,queuedEvent,createQueue} from '../GD91-96/queue.mjs';

// 受付保存だけを診断する。登録・発券・公開の通常経路の合格には使わない。
export async function runReceiptCases(io,a){
 const reports=[],head={generation:'layout',revision:1};let maxJsonNodes=0,maxRootJsonBytes=0;
 const nodes=v=>v===null||typeof v!=='object'?1:1+Object.values(v).reduce((n,x)=>n+nodes(x),0);
 for(const [id,offset] of [['R01',null],['R02',60000],['R03','past']]){
  await io.owner('','PUT',{
   control:{state:'operating',revision:2,closingSchemaVersion:1},head,
   generations:{layout:{meta:{kind:'layout',phase:'ready',revision:3,cursor:1,expectedParts:1,lastPart:'p0'}}},
   roles:{[a.human.uid]:{active:true,role:'receptionist',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000}},
   devices:{[a.device.uid]:{schemaVersion:2,performanceId:io.performanceId,deviceUid:a.device.uid,humanUid:a.human.uid,active:true,preparedRoleRevision:1}},
   event:{people:{'person-0':{active:true,seatId:'cell-0',displayName:'架空',revision:1}},tickets:{'person-0':{credentialRef:'credential-0',credentialVersion:1,currentCycle:1,cycleClosed:false,everIssued:false}}}
  });
  // 条件ごとに試行根を初期化したため、セッション版も初版から作る。
  a.sessionRevision=0;await io.issue(a);const l=lease(a,head,2);let state=null;
  const queue=createQueue({user:io.normal,loadState:async()=>structuredClone(state),saveState:async value=>{state=structuredClone(value);}});
  await queue.acquire(a,l);const observedAt=offset==='past'?0:Date.now()+(offset??0);
  const p=queuedEvent(io.performanceId,a,1,'person-0',{credentialRef:'credential-0',credentialVersion:1,currentCycle:1},l,{observedAt});
  const serverOffsetMs=await io.serverOffset(a),response=await io.normal(a,'receipts/'+a.device.uid,'PATCH',p.body);
  const root=await io.owner('');maxJsonNodes=Math.max(maxJsonNodes,nodes(root));maxRootJsonBytes=Math.max(maxRootJsonBytes,Buffer.byteLength(JSON.stringify(root)));
  assert(maxJsonNodes<=4000&&maxRootJsonBytes<=1048576);
  reports.push({id,observation:offset==='past'?'epoch-zero':offset===null?'pc-current':'pc-plus-60-seconds',serverOffsetMs,httpStatus:response.status,knownPermissionDenied:response.body?.error==='Permission denied',receiptStored:!!root.receipts?.[a.device.uid]?.counter,bootstrapBusinessDataSeeded:true});
  io.onReport?.(reports.at(-1));
 }
 return {reports,maxJsonNodes,maxRootJsonBytes,googleAccountUsed:false,externalFailureCauseConfirmed:false,normalBusinessPreparationVerified:false};
}
