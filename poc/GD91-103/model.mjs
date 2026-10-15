import {randomUUID} from 'node:crypto';
import {command as oldCommand,proposal as oldProposal} from '../GD91-92/model.mjs';
import {project,context} from '../GD91-90/model.mjs';import {seal} from '../GD91-91/model.mjs';
export {applyModel} from '../GD91-92/model.mjs';
export function command(f,state,head,kind,target,options={}){
 const body=oldCommand(f,state,head,kind,target,options),op=body['operations/'+body.commit.operationId];
 if(kind==='register'){
  const group=options.groupId??'none',order=state.roster?.count??0,index=group==='none'?-1:(state.groupInfo?.[group]?.count??0);
  Object.assign(body['people/'+target],{groupId:group,rosterOrder:order});Object.assign(op,{groupId:group,memberIndex:index});body['roster/count']=order+1;body['roster/byOrder/n'+order]=target;
  if(group!=='none'){body['groupInfo/'+group+'/count']=index+1;body['groupInfo/'+group+'/members/m'+index]=target;if(!state.groupStates?.[group])body['groupStates/'+group]={fixed:false,manualReason:'',revision:body.commit.revision,lastOperationId:body.commit.operationId};}
 }
 return body;
}
export function proposal(f,state,head,kind,seatA,seatB='none',person='none',options={}){const body=oldProposal(f,state,head,kind,seatA,seatB,person,options);if(options.reason!==undefined)body['operations/'+body.commit.operationId].reason=options.reason;return body;}
export function groupChange(f,state,head,groupId,action,targets={},options={}){
 const id=options.id??randomUUID(),revision=state.commit.revision+1,info=state.groupInfo[groupId],members={},old=state.groupStates[groupId];
 const previous=state.operations?.[options.sourceOperationId];
 for(const p of Object.values(info.members)){const beforeSeat=state.people[p].seatId,afterSeat=action==='unlock'?beforeSeat:action==='undo'?previous.members[p].beforeSeat:targets[p];members[p]={beforeSeat,afterSeat};}
 const op={kind:'groupChange',groupId,action,memberCount:info.count,members,reason:options.reason??'',sourceOperationId:options.sourceOperationId??'',committedAt:{'.sv':'timestamp'},humanUid:f.human.uid,expectedRevision:state.commit.revision,resultRevision:revision,referenceId:f.referenceId};
 const body={commit:{revision,operationId:id},['operations/'+id]:op,['groupStates/'+groupId]:{fixed:action==='split'||action==='undo',manualReason:action==='split'?op.reason:old.manualReason,revision,lastOperationId:id}};
 if(action!=='unlock'){
  for(const member of Object.values(members))if(member.beforeSeat!=='none'){body['seats/'+member.beforeSeat]={personId:'none',revision};body['view/'+member.beforeSeat]={personId:'none',displayName:'',revision};}
  for(const[p,m]of Object.entries(members)){body['people/'+p]={...state.people[p],seatId:m.afterSeat,revision};body['seats/'+m.afterSeat]={personId:p,revision};body['view/'+m.afterSeat]={personId:p,displayName:state.people[p].displayName,revision};}
 }
 return seal(context(project(body,state),head,options.controlRevision??1));
}
