import {randomUUID} from 'node:crypto';import {reviewRequest} from '../GD91-99/review.mjs';
export function permitRequest(manager,reference,progress,controlRevision,{endSequence,reason='紙記録と回収端末を照合',id=randomUUID(),expiresAt=Date.now()+300000,revision=1}={}){
 const path='postClosePermits/'+id,decision={operationId:id,referenceId:reference.id,deviceUid:reference.record.deviceUid,controlRevision,startSequence:progress+1,endSequence,expiresAt,reason,paperConfirmed:true,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,decidedAt:{'.sv':'timestamp'}};
 return{path,decision,body:{[path]:decision,['postClosePermitHeads/'+reference.id]:{operationId:id,revision}}};
}
export function correctionRequest(manager,sourceUid,key,event,progress,fact,total,controlRevision){
 const proposal=reviewRequest(manager,sourceUid,key,event,progress,{outcome:'adopt',reason:'締め後に紙原本と照合して訂正',controlRevision}),id=proposal.decision.operationId;
 proposal.body['postCloseCorrections/'+id]={operationId:id,sourceDeviceUid:sourceUid,sourceKey:key,sourceEventId:event.eventId,attendeeId:event.attendeeId,referenceId:event.layoutReferenceId,controlRevision,previousRevision:fact.revision,previousArrived:fact.arrived,arrived:true,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,decidedAt:{'.sv':'timestamp'}};
 proposal.body['actuals/'+event.attendeeId]={...fact,arrived:true,revision:fact.revision+1,lastCorrectionId:id};proposal.body['actualTotals/'+fact.partition]={...total,arrived:total.arrived+(fact.arrived?0:1),revision:total.revision+1,lastCorrectionId:id};return proposal;
}
