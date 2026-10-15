import {collect as collectBase} from '../GD91-102/collection.mjs';
export async function collect(read,send,generation){
 let meta=await read('generations/'+generation+'/meta');
 if(meta.phase!=='deleting'){meta={...meta,phase:'deleting',revision:meta.revision+1};await send('generations/'+generation+'/meta','PUT',meta);}
 await send('sectionViews/'+generation,'DELETE');
 for(let i=0;i<meta.expectedSections;i++){const id=await read('generations/'+generation+'/sectionOrder/s'+i);if(id)await send('generations/'+generation+'/geometry/'+id,'DELETE');}
 await collectBase(read,send,generation);
}
