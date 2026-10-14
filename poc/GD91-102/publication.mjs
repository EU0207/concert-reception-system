import {randomUUID} from 'node:crypto';
import {publish as originalPublish} from '../GD91-84/generation-tests.mjs';

export async function preparePublication(read,send,actor,candidateGeneration) {
  const head=await read('head'),event=await read('event/commit'),control=await read('control');
  const id=randomUUID();let record={candidateGeneration,sourceGeneration:head?.generation??'none',
    sourceHeadRevision:head?.revision??0,sourceEventRevision:event?.revision??0,sourceControlRevision:control.revision,
    deviceUid:actor.device.uid,publicationOperationId:randomUUID(),cursor:0,phase:'checking'};
  await send('','PATCH',{['publicationChecks/'+id]:record,['generations/'+candidateGeneration+'/refs/publication-'+id]:true});
  const count=head?(await read('generations/'+head.generation+'/meta')).expectedParts:0;
  while(record.cursor<count){const cursor=record.cursor+1;record={...record,cursor,slots:Object.fromEntries(Array.from({length:16},(_,i)=>['s'+String(i).padStart(2,'0'),cursor]))};await send('publicationChecks/'+id,'PUT',record);}
  record={...record,phase:'checked'};await send('publicationChecks/'+id,'PUT',record);
  return{id,record,cancel:()=>({['publicationChecks/'+id]:{...record,phase:'cancelled'},['generations/'+candidateGeneration+'/refs/publication-'+id]:null}),
    complete:()=>({['publicationChecks/'+id]:{...record,phase:'published'},['generations/'+candidateGeneration+'/refs/publication-'+id]:null}),
    publish:(revision,operationId)=>{
    const body=originalPublish(candidateGeneration,revision,operationId??record.publicationOperationId);
    body.head.publicationCheckId=id;body['operations/'+body.head.operationId].publicationCheckId=id;return body;
  }};
}
