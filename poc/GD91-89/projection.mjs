import {command as lifecycle,applyModel} from '../GD91-88/model.mjs';
import {proposal as seatProposal} from '../GD91-86/model.mjs';
export {applyModel};
export const marker='0000000000';
export function row(state,id,revision=state.commit.revision){
  const p=state.people[id],t=state.tickets?.[id];
  return {personId:id,active:p.active,seatId:p.seatId,displayName:p.displayName,
    credentialRef:t?.credentialRef??'',currentCycle:t?.currentCycle??0,credentialVersion:t?.credentialVersion??0,
    eligible:p.active&&p.seatId!=='none'&&!!t?.credentialRef&&!t.cycleClosed,revision};
}
export function project(body,state){
  const next=applyModel(structuredClone(state),body),revision=body.commit.revision;
  const ids=new Set(Object.keys(body).filter(p=>p.startsWith('people/')||p.startsWith('tickets/')).map(p=>p.split('/')[1]));
  const out={...body,['reception/'+marker]:revision};
  for(const id of ids)out['reception/i-'+id]=row(next,id,revision);
  return out;
}
export const initialize=()=>({commit:{revision:1,operationId:'initialize'},reception:{[marker]:1}});
export const command=(f,state,kind,id,options)=>project(lifecycle(f,state,kind,id,options),state);
export const proposal=(f,state,...args)=>project(seatProposal(f,state,...args),state);

export function validateSnapshot(rows,revision){
  for(const[key,r]of Object.entries(rows)){
    if(key!==`i-${r.personId}`||!Number.isSafeInteger(r.revision)||r.revision<1||r.revision>revision)throw new Error('mixed-or-invalid-row');
    if(Object.keys(r).sort().join(',')!==['personId','active','seatId','displayName','credentialRef','currentCycle','credentialVersion','eligible','revision'].sort().join(','))throw new Error('unexpected-reception-fields');
  }
  return {revision,rows:structuredClone(rows)};
}
export async function download(read,{afterPage}={}){
  const first=await read('event/commit'),rows={};let cursor='i-';
  for(;;){
    const page=await read('event/reception',{orderBy:'"$key"',startAt:JSON.stringify(cursor),limitToFirst:'32'});
    const raw=Object.entries(page??{}).sort(([a],[b])=>a<b?-1:a>b?1:0),entries=raw.filter(([key])=>key>cursor);if(!entries.length)break;
    Object.assign(rows,Object.fromEntries(entries));if(afterPage)await afterPage({cursor,rows:structuredClone(rows)});
    cursor=entries.at(-1)[0];
    if(raw.length<32)break;
  }
  const last=await read('event/commit');if(first.revision!==last.revision)throw new Error('snapshot-conflict');
  return validateSnapshot(rows,last.revision);
}
