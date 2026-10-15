import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {extend} from '../GD91-07/planner.mjs';import {intent} from '../GD91-104/edit.mjs';
export function numberedExtension(models,sectionId,spec,{reason=''}={}){
 const found=models.find(m=>m.section.sectionId===sectionId);assert(found);
 const result=extend(found,spec,{maxCells:100000,duringPerformance:reason!=='',reason});
 return{models:models.map(m=>m===found?result.after:structuredClone(m)),edit:intent('extend',sectionId,{dimension:spec.dimension,count:spec.count,reason,numbered:true})};
}
export async function prepareNumbered(read,send,actor,candidate,edit){
 const head=await read('head'),event=await read('event/commit'),control=await read('control'),id=randomUUID();
 let record={candidateGeneration:candidate,sourceGeneration:head.generation,sourceHeadRevision:head.revision,sourceHeadViewRevision:head.viewRevision,sourceEventRevision:event.revision,sourceControlRevision:control.revision,deviceUid:actor.device.uid,publicationOperationId:randomUUID(),cursor:0,candidateCursor:0,phase:'checking',edit};
 const pin=value=>Object.fromEntries([head.generation,candidate].map(g=>['generations/'+g+'/refs/publication-'+id,value]));
 await send('','PATCH',{['publicationChecks/'+id]:record,...pin(true)});
 const section=await read('generations/'+candidate+'/sections/'+edit.sectionId),source=await read('generations/'+head.generation+'/sections/'+edit.sectionId),along=(section.axis==='horizontal'?'columns':'rows')===edit.dimension;
 for(const line of Object.values(section.lines)){
  if(!along&&source.lines[line.lineId])continue;
  const count=along?edit.count:(section.axis==='horizontal'?section.columns:section.rows);let next=source.lines[line.lineId]?.nextAutomaticNumber??line.startNumber;
  for(let index=0;index<count;index++){
   const position=section.seatOrder==='reverse'?count-1-index:(section.axis==='horizontal'?section.columns:section.rows)-count+index,row=section.axis==='horizontal'?line.index:position,column=section.axis==='horizontal'?position:line.index;
   const point=await read('generations/'+candidate+'/indexes/coordinates/'+edit.sectionId+'/r'+row+'c'+column),cell=(await read('generations/'+candidate+'/parts/'+point.part)).slots[point.slot];
   if(cell.kind==='seat'||cell.kind==='gap')next++;
   await send('numberProofs/'+id+'/'+line.lineId+'/s'+index,'PUT',{index,cellId:cell.cellId,nextNumber:next});
  }
 }
 const oldParts=(await read('generations/'+head.generation+'/meta')).expectedParts,newParts=(await read('generations/'+candidate+'/meta')).expectedParts;
 for(const[field,count,slots]of[['cursor',oldParts,'slots'],['candidateCursor',newParts,'candidateSlots']])while(record[field]<count){record={...record,[field]:record[field]+1,[slots]:Object.fromEntries(Array.from({length:16},(_,i)=>['s'+String(i).padStart(2,'0'),record[field]+1]))};await send('publicationChecks/'+id,'PUT',record);}
 record={...record,phase:'checked'};await send('publicationChecks/'+id,'PUT',record);
 return{id,record,publish:()=>({head:{generation:candidate,revision:head.revision+1,operationId:record.publicationOperationId,publicationCheckId:id,viewRevision:head.viewRevision+1},['operations/'+record.publicationOperationId]:{kind:'publish',generation:candidate,resultRevision:head.revision+1,publicationCheckId:id}}),cancel:()=>({['publicationChecks/'+id]:{...record,phase:'cancelled'},...pin(null)}),complete:()=>({['publicationChecks/'+id]:{...record,phase:'published'},...pin(null)})};
}
