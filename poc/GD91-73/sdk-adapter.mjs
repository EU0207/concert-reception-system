import * as sdk from '../GD91-72/sdk-adapter.mjs';
import {request,base,path,stored,write,commit,ok} from './tests/support.mjs';
import {data} from '../GD91-60/tests/transport.mjs';
export * from '../GD91-72/sdk-adapter.mjs';
// 提案の組立て時に呼ぶ。端末へ保存した後の送信時には内容を追加しない。
export async function preparePlan(f,writes,id,kind='publication'){
 const prepared=structuredClone(writes),w=prepared.find(w=>w.update?.name.endsWith('/versions/current'));
 if(w){
  const v=data({body:w.update});
  let assignments={};
  if(v.seatIds.length){const a=prepared.find(w=>w.update?.name.endsWith('/assignmentState/current'));assignments=a?data({body:a.update}).assignments:(await stored(f,'assignmentState/current',f.manager.token)).assignments;}
  const event=prepared.map(w=>data({body:w.update})).find(e=>['publishSection','extendSection','seatEdit'].includes(e.kind));
  if(event){
   const r=await request(base+'/'+path(f,'sectionDisplay/'+event.generation),f.manager.token);
   if(r.status===404){
    const m=await stored(f,'candidates/'+event.generation,f.manager.token);
    const current=await request(base+'/'+path(f,'publicIndex/current'),f.manager.token);if(![200,404].includes(current.status))ok(current);
    const priorGeneration=current.status===200?data(current).sections[event.sectionId]:null;
    const previous=priorGeneration?await stored(f,'sectionDisplay/'+priorGeneration,f.manager.token):f.models?.find(model=>model.section.sectionId===event.sectionId)?.section;
    if(!previous?.name||!['left','top'].includes(previous.stagePosition))throw new Error('section-display-input-required');
    ok(await commit([write(path(f,'sectionDisplay/'+event.generation),{schemaVersion:1,environmentId:v.environmentId,performanceId:v.performanceId,sectionId:event.sectionId,generation:event.generation,rows:m.geometry.rows,columns:m.geometry.columns,name:previous.name,stagePosition:previous.stagePosition},false)],f.manager.token));
   }
   else ok(r);
  }
  const r=await request(base+'/'+path(f,'publicIndex/current'),f.manager.token);if(![200,404].includes(r.status))ok(r);
  prepared.push(write(path(f,'publicIndex/current'),{schemaVersion:1,environmentId:v.environmentId,performanceId:v.performanceId,versions:v.values,sections:v.sections,seatIds:v.seatIds,assignments},r.status===200));
 }
 return sdk.plan(f,prepared,id,kind);
}
