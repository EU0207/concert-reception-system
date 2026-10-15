import {encode,initialMeta,sectionPlan,partPlan,slotsPerPart} from '../GD91-102/layout-model.mjs';
export function bounds(model){
 const cells=model.section.cells.filter(c=>c.kind!=='unset');
 if(!cells.length)return{empty:true,minRow:0,maxRow:0,minColumn:0,maxColumn:0,witnesses:{minRow:'',maxRow:'',minColumn:'',maxColumn:''}};
 const result={empty:false,witnesses:{}};for(const key of['minRow','maxRow','minColumn','maxColumn']){const coordinate=key.endsWith('Row')?'row':'column',value=Math[key.startsWith('min')?'min':'max'](...cells.map(c=>c[coordinate]));result[key]=value;result.witnesses[key]=cells.find(c=>c[coordinate]===value).cellId;}return result;
}
export async function build(send,generation,models){
 const {sections,items}=encode(models),batches=[];for(let i=0;i<items.length;i+=slotsPerPart)batches.push(items.slice(i,i+slotsPerPart));
 for(const model of models)sections[model.section.sectionId].bounds=bounds(model);
 let meta={...initialMeta(batches.length,Object.keys(sections).length),auditVersion:1,geometryCursor:0,lastGeometrySection:''};
 await send('generations/'+generation+'/meta','PUT',meta);
 for(const[id,s]of Object.entries(sections)){const body=sectionPlan(generation,meta,id,s);await send('','PATCH',body);meta=body['generations/'+generation+'/meta'];}
 for(const batch of batches){const body=partPlan(generation,meta,batch);await send('','PATCH',body);meta=body['generations/'+generation+'/meta'];}
 for(const[id,s]of Object.entries(sections)){meta={...meta,geometryCursor:meta.geometryCursor+1,lastGeometrySection:id};await send('','PATCH',{['generations/'+generation+'/meta']:meta,['generations/'+generation+'/geometry/'+id]:{index:s.displayOrder,verified:true}});}
 meta={...meta,phase:'ready',revision:meta.revision+1};await send('generations/'+generation+'/meta','PUT',meta);return{meta,sections,items};
}
