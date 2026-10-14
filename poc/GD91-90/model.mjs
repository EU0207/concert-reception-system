import {randomUUID} from 'node:crypto';
import {command as lifecycle,applyModel} from '../GD91-88/model.mjs';
import {proposal as seatProposal} from '../GD91-86/model.mjs';
import {row,marker} from '../GD91-89/projection.mjs';
export {applyModel};
export function context(body,head,controlRevision=1){
 const op=body['operations/'+body.commit.operationId];op.sourceLayoutRevision=head.revision;op.sourceLayoutGeneration=head.generation;op.sourceControlRevision=controlRevision;return body;
}
export function project(body,state){
 const revision=body.commit.revision,out={...body,['reception/'+marker]:revision};
 const ids=new Set(Object.keys(body).filter(p=>p.startsWith('people/')||p.startsWith('tickets/')).map(p=>p.split('/')[1]));
 for(const id of ids){const selected={people:{[id]:body['people/'+id]??state.people[id]},tickets:{[id]:body['tickets/'+id]??state.tickets?.[id]}};out['reception/i-'+id]=row(selected,id,revision);}
 return out;
}
export const command=(f,state,head,kind,id,options={})=>context(project(lifecycle(f,state,kind,id,options),state),head,options.controlRevision??1);
export const proposal=(f,state,head,kind,...args)=>context(project(seatProposal(f,state,kind,...args),state),head);
export function bulk(f,state,head,targets,{controlRevision=1,id=randomUUID()}={}){
 const revision=state.commit.revision+1,op={kind:'bulkAssign',targets:structuredClone(targets),expectedRevision:state.commit.revision,resultRevision:revision,humanUid:f.human.uid},body={commit:{revision,operationId:id},['operations/'+id]:op};
 for(const[person,seat]of Object.entries(targets)){body['people/'+person]={...state.people[person],seatId:seat,revision};body['seats/'+seat]={personId:person,revision};body['view/'+seat]={personId:person,displayName:state.people[person].displayName,revision};}
 return context(project(body,state),head,controlRevision);
}
