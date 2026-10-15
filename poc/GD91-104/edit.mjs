import {randomUUID} from 'node:crypto';import {extend,validate} from '../GD91-07/planner.mjs';import {editModel} from '../GD91-71/tests/model.mjs';
export function editModels(models,spec){return models.map(m=>{
 if(m.section.sectionId!==spec.sectionId)return structuredClone(m);
 if(spec.kind==='extend')return extend(m,{dimension:spec.dimension,count:spec.count,...(spec.lines?{lines:spec.lines}:{})},{maxCells:100000,duringPerformance:spec.reason!== '',reason:spec.reason}).after;
 const result=editModel(m,{...spec,kind:({number:'renumber',position:'move'})[spec.kind]??spec.kind});
 for(const seat of result.seats)if(seat.seatId===spec.seatId)seat.emergencyChange.kind=spec.kind;
 return validate(result,{maxCells:100000});
});}
export function intent(kind,sectionId,options={}){return{kind,sectionId,dimension:'',count:0,sourceCellId:'',targetCellId:'',seatId:'',number:'',reason:'架空：当日補助席の用途',...options};}
export async function prepareEdit(read,send,actor,candidate,edit){
 const head=await read('head'),event=await read('event/commit'),control=await read('control'),id=randomUUID();
 const {lines,...spec}=edit;
 let record={candidateGeneration:candidate,sourceGeneration:head.generation,sourceHeadRevision:head.revision,sourceHeadViewRevision:head.viewRevision,sourceEventRevision:event.revision,sourceControlRevision:control.revision,deviceUid:actor.device.uid,publicationOperationId:randomUUID(),cursor:0,candidateCursor:0,phase:'checking',edit:spec};
 const pin=value=>Object.fromEntries([head.generation,candidate].map(g=>['generations/'+g+'/refs/publication-'+id,value]));
 await send('','PATCH',{['publicationChecks/'+id]:record,...pin(true)});
 const oldParts=(await read('generations/'+head.generation+'/meta')).expectedParts,newParts=(await read('generations/'+candidate+'/meta')).expectedParts;
 for(const[field,count,slots]of[['cursor',oldParts,'slots'],['candidateCursor',newParts,'candidateSlots']])while(record[field]<count){record={...record,[field]:record[field]+1,[slots]:Object.fromEntries(Array.from({length:16},(_,i)=>['s'+String(i).padStart(2,'0'),record[field]+1]))};await send('publicationChecks/'+id,'PUT',record);}
 record={...record,phase:'checked'};await send('publicationChecks/'+id,'PUT',record);
 return{id,record,publish:()=>({head:{generation:candidate,revision:head.revision+1,operationId:record.publicationOperationId,publicationCheckId:id,viewRevision:head.viewRevision+1},['operations/'+record.publicationOperationId]:{kind:'publish',generation:candidate,resultRevision:head.revision+1,publicationCheckId:id}}),cancel:()=>({['publicationChecks/'+id]:{...record,phase:'cancelled'},...pin(null)}),complete:()=>({['publicationChecks/'+id]:{...record,phase:'published'},...pin(null)})};
}
