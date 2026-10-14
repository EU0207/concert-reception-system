import {randomUUID} from 'node:crypto';
export function reviewRequest(manager,sourceDeviceUid,sourceKey,source,progress,{outcome,reason,controlRevision,id=randomUUID(),paperConfirmed=true}){
 const decision={sourceEventId:source.eventId,sourceSequence:source.sequence,referenceId:source.layoutReferenceId,outcome,reason,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,controlRevision,operationId:id,paperConfirmed,decidedAt:{'.sv':'timestamp'}};
 const path='quarantineReviews/'+sourceDeviceUid+'/'+sourceKey;
 const body={[path]:decision,['quarantineReviewState/'+source.layoutReferenceId]:{...progress,reviewedCount:progress.reviewedCount+1,lastReviewKey:sourceKey},['reviewOperations/'+id]:{sourceDeviceUid,sourceKey,referenceId:source.layoutReferenceId}};
 if(outcome==='adopt')body['managedReceipts/'+id]={decisionId:id,sourceDeviceUid,sourceKey,sourceEventId:source.eventId,attendeeId:source.attendeeId,currentCycle:source.currentCycle,kind:source.kind,appliedAt:{'.sv':'timestamp'}};
 return{path,decision,body};
}
export function sealRequest(subject,reference,finalSequence,receivedQuarantineCount,controlRevision,id=randomUUID()){
 return{deviceUid:subject.device.uid,referenceId:reference.id,finalSequence,receivedQuarantineCount,controlRevision,operationId:id,closedAt:{'.sv':'timestamp'}};
}
export function releaseRequest(manager,reference,closure,progress,controlRevision,id=randomUUID()){
 const r=reference.record,body={['reviewReleases/'+reference.id]:{operationId:id,referenceId:reference.id,deviceUid:r.deviceUid,finalSequence:closure.finalSequence,reviewedCount:progress.reviewedCount,humanUid:manager.human.uid,managerDeviceUid:manager.device.uid,controlRevision,releasedAt:{'.sv':'timestamp'}},['quarantine/'+r.deviceUid+'/leaseHolds/'+reference.id]:null,['quarantine/'+r.deviceUid+'/lastReviewRelease']:{referenceId:reference.id,operationId:id},['references/'+reference.id]:{...r,active:false,revision:r.revision+1},['generations/'+r.generation+'/refs/'+reference.id]:null};
 return{path:'reviewReleases/'+reference.id,decision:body['reviewReleases/'+reference.id],body};
}
