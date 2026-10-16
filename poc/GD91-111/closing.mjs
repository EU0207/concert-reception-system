import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export function beginClose(control,roster,peopleCount,head,facts,{mode='normal',id=randomUUID()}={}){
 assert(control.state==='stopped'&&control.endedAt>0,'performance-not-ended');assert(roster.count>0&&Number.isSafeInteger(peopleCount));
 return{operationId:id,phase:'scan',revision:1,mode,registryCount:roster.count,registryRevision:roster.revision,peopleCount,sourceControlRevision:control.revision,businessRevision:facts.businessRevision,generation:head.generation,layoutRevision:head.revision,deviceIndex:0,sequenceCursor:0,partCursor:0,personCursor:0,seatCount:0,arrivedCount:0,activeUnarrived:0,lossCount:0,performanceName:facts.performanceName,venueName:facts.venueName,venueAddress:facts.venueAddress};
}
export const acknowledgement=(meta,uid,finalSequence)=>({operationId:meta.operationId,deviceUid:uid,finalSequence,localPending:0,controlRevision:meta.sourceControlRevision,confirmedAt:{'.sv':'timestamp'}});
export const advance=(meta,changes)=>({...meta,...changes,revision:meta.revision+1});
export function foldSource(meta,uid,event,previous,adopted=true){
 const next=advance(meta,{sequenceCursor:meta.sequenceCursor+1}),body={'closing/meta':next};
 if(adopted){assert(['firstReception','reread'].includes(event.kind),'unsupported-reception-kind');body['closingRuns/'+meta.operationId+'/arrivals/'+event.attendeeId]={deviceUid:uid,sequence:next.sequenceCursor,eventId:event.eventId,firstCount:(previous?.firstCount??0)+(event.kind==='firstReception'?1:0)};}
 return body;
}
export function factStep(meta,person,profile,ticket,arrival,oldTotal){
 if(oldTotal?.closeOperationId!==meta.operationId)oldTotal=null;
 const partition='part'+Math.floor(meta.personCursor/64),arrived=!!arrival,body={};
 body['actuals/'+person.id]={attendeeId:person.id,currentCycle:ticket?.currentCycle??0,partition,arrived,revision:1,lastCorrectionId:meta.operationId,closeOperationId:meta.operationId,name:profile.name,activeAtClose:person.active,performanceId:person.performanceId};
 body['actualTotals/'+partition]={total:(oldTotal?.total??0)+1,arrived:(oldTotal?.arrived??0)+(arrived?1:0),revision:(oldTotal?.revision??0)+1,lastCorrectionId:meta.operationId,closeOperationId:meta.operationId};
 body['closing/meta']=advance(meta,{personCursor:meta.personCursor+1,arrivedCount:meta.arrivedCount+(arrived?1:0),activeUnarrived:meta.activeUnarrived+(person.active&&!arrived?1:0)});return body;
}
export function cancelClose(meta,control,manager,reason){
 assert(!['closed','aborted'].includes(meta.phase));return{'closing/meta':advance(meta,{phase:'aborted'}),control:{...control,revision:control.revision+1},['closingCancellations/'+meta.operationId]:{operationId:meta.operationId,reason,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,controlRevision:control.revision+1,cancelledAt:{'.sv':'timestamp'}}};
}
export const confirmDuplicate=(meta,manager,firstCount,reason)=>({firstCount,confirmed:true,reason,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,controlRevision:meta.sourceControlRevision,confirmedAt:{'.sv':'timestamp'}});
export const declareLoss=(meta,manager,uid,sequence,lastReceivedAt,reason)=>({deviceUid:uid,fromSequence:sequence+1,lastReceivedAt,unreceivedCount:'unknown',deletionState:'unconfirmed',paperConfirmed:true,reason,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,controlRevision:meta.sourceControlRevision,decidedAt:{'.sv':'timestamp'}});
export function completeClose(meta,control,manager,confirmations){
 assert(confirmations&&['conflicts','paper','absences','devices'].every(k=>confirmations[k]===true),'manager-confirmation-required');
 assert(meta.phase==='facts'&&meta.personCursor===meta.peopleCount,'facts-incomplete');const result={operationId:meta.operationId,mode:meta.mode,deviceCount:meta.registryCount,peopleCount:meta.peopleCount,arrived:meta.arrivedCount,activeUnarrived:meta.activeUnarrived,seatCount:meta.seatCount,lossCount:meta.lossCount,unreceivedPossible:meta.lossCount>0,performanceName:meta.performanceName,venueName:meta.venueName,venueAddress:meta.venueAddress,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,controlRevision:control.revision+1,closedAt:{'.sv':'timestamp'}};
 for(const key of ['conflicts','paper','absences','devices'])result['confirmed'+key[0].toUpperCase()+key.slice(1)]=true;
 return{'closing/meta':advance(meta,{phase:'closed'}),control:{...control,state:'closed',revision:control.revision+1},['closingResults/'+meta.operationId]:result};
}
