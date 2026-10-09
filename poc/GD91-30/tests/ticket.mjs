import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {commit,update,get,data,ok} from './support.mjs';
const scope=f=>({schemaVersion:4,environmentId:'FAKE-environment',performanceId:f.show});
const alphabet='23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const generateCredential=()=>randomBytes(16).toString('base64url');
export const generateCode=()=>Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');
export function audit(t){return t===null?null:Object.fromEntries(['revision','issued','sent','issuedAt','sentAt','currentCycle','cycleClosed','everIssued','credentialVersion'].map(k=>[k,t[k]]));}
export async function ticketPlan(f,attendeeId,kind='qrCreate',options={}){
 const r=await get(f,'tickets/'+attendeeId),before=r.status===404?null:data(r),id=randomUUID();
 const after=before?{...structuredClone(before),revision:before.revision+1,operationId:id,lastKind:kind}
  :{...scope(f),attendeeId,ticketId:attendeeId,revision:1,operationId:id,lastKind:kind,currentCycle:1,cycleClosed:false,
    everIssued:false,issued:false,sent:false,issuedAt:null,sentAt:null,activeCredentialId:'',activeCode:'',credentialVersion:0};
 const transforms=[];
 if(kind==='qrCreate')Object.assign(after,{activeCredentialId:options.credentialId??generateCredential(),activeCode:options.code??generateCode(),credentialVersion:1});
 else{const field=options.field??'issued';after[field]=options.value??true;after[field+'At']=null;transforms.push(field+'At');after.everIssued=(before?.everIssued??false)||after.issued;}
 const versions={...structuredClone(f.sharedVersions),operationId:id,values:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,ticket:f.sharedVersions.values.ticket+1}};
 const index={...structuredClone(f.ticket),revision:f.ticket.revision+1,operationId:id,attendeeId};
 const protectedIds=new Set(index.protectedAttendeeIds);if(after.issued||after.everIssued||after.activeCredentialId)protectedIds.add(attendeeId);else protectedIds.delete(attendeeId);index.protectedAttendeeIds=[...protectedIds];
 const event={schemaVersion:3,environmentId:'FAKE-environment',performanceId:f.show,operationId:id,kind,deviceUid:kind==='ticketCheck'?'':f.owner.uid,
  generation:f.sharedVersions.generation,expectedVersions:structuredClone(f.sharedVersions.values),resultVersions:structuredClone(versions.values),
  payload:{attendeeId,creating:before===null,before:audit(before),after:audit(after)}};
 const credential=kind!=='qrCreate'?null:{...scope(f),ticketId:attendeeId,currentCycle:1,credentialVersion:1,status:'active',createdOperationId:id,revokedOperationId:''};
 const code=kind!=='qrCreate'?null:{...scope(f),ticketId:attendeeId,credentialId:after.activeCredentialId,active:true,createdOperationId:id,revokedOperationId:''};
 return{id,attendeeId,before,after,versions,index,event,credential,code,transforms,kind};
}
export function ticketWrites(f,o){
 const t=update(f,'tickets/'+o.attendeeId,o.after,undefined,o.before!==null),e=update(f,'operations/'+o.id,o.event,undefined,false);
 if(o.transforms.length){t.updateTransforms=o.transforms.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}));e.updateTransforms=o.transforms.map(k=>({fieldPath:'payload.after.'+k,setToServerValue:'REQUEST_TIME'}));}
 const writes=[t,update(f,'ticketState/current',o.index,undefined,true),update(f,'versions/current',o.versions,undefined,true),e];
 if(o.credential)writes.push(update(f,'credentials/'+o.after.activeCredentialId,o.credential,undefined,false),update(f,'confirmationCodes/'+o.after.activeCode,o.code,undefined,false));
 return writes;
}
export async function acceptTicket(f,o){f.sharedVersions=o.versions;f.ticket=data(await get(f,'ticketState/current'));return data(await get(f,'tickets/'+o.attendeeId));}
export async function saveTicket(f,o){ok(await commit(f,ticketWrites(f,o)));return acceptTicket(f,o);}
export async function ticketSnapshot(f,o){
 const paths=['versions/current','attendeeState/current','ticketState/current','assignmentState/current','head/current','control/current','tickets/'+o.attendeeId,'operations/'+o.id];
 if(o.after.activeCredentialId)paths.push('credentials/'+o.after.activeCredentialId,'confirmationCodes/'+o.after.activeCode);
 return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await get(f,p)])));
}
