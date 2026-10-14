import {labelKey} from '../GD91-84/generation-tests.mjs';

export function removePart(id,index,part){
  const prefix='generations/'+id,body={[prefix+'/parts/p'+index]:null};
  for(const item of Object.values(part.slots)){
    body[prefix+'/ids/'+item.id]=null;
    if(item.kind==='seat')body[prefix+'/labels/'+item.sectionId+'/'+item.lineId+'/'+labelKey(item.label)]=null;
  }
  return body;
}
export async function collect(read,send,id){
  let meta=await read('generations/'+id+'/meta');
  if(meta.phase!=='deleting'){meta={...meta,phase:'deleting',revision:meta.revision+1};await send('generations/'+id+'/meta','PUT',meta);}
  await send('generations/'+id+'/indexes','DELETE');
  for(let i=0;i<meta.expectedParts;i++){const part=await read('generations/'+id+'/parts/p'+i);if(part)await send('','PATCH',removePart(id,i,part));}
  for(let i=0;i<meta.expectedSections;i++){const section=await read('generations/'+id+'/sectionOrder/s'+i);if(section)await send('','PATCH',{['generations/'+id+'/sections/'+section]:null,['generations/'+id+'/sectionOrder/s'+i]:null});}
  await send('generations/'+id+'/meta','PUT',{...meta,phase:'deleted',revision:meta.revision+1});
}
