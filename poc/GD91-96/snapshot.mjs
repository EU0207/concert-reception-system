import assert from 'node:assert/strict';
export async function snapshot(read,readReception,{maxParts=64,maxSections=16,cached}={}){
 const head=await read('head'),reuse=cached&&['generation','revision','operationId'].every(k=>cached.head?.[k]===head[k]);let cells,sections;
 if(reuse){cells=cached.cells;sections=cached.sections;}else{const meta=await read('generations/'+head.generation+'/meta');assert.equal(meta.kind,'layout');assert.equal(meta.phase,'ready');assert(Number.isSafeInteger(meta.expectedParts)&&meta.expectedParts>0&&meta.expectedParts<=maxParts,'snapshot-part-limit');
 cells={};sections={};for(let i=0;i<meta.expectedParts;i++){const p=await read('generations/'+head.generation+'/parts/p'+i);assert(p&&p.index===i&&Object.keys(p.slots).length===p.count,'snapshot-part-missing');for(const c of Object.values(p.slots)){assert(!cells[c.id],'snapshot-duplicate-cell');cells[c.id]=Object.freeze(c);sections[c.sectionId]??=null;}}
 assert(Object.keys(sections).length<=maxSections,'snapshot-section-limit');for(const id of Object.keys(sections)){const section=await read('generations/'+head.generation+'/sections/'+id);assert(section&&typeof section.name==='string');sections[id]=Object.freeze(section);}Object.freeze(cells);Object.freeze(sections);}
 const reception=await readReception();assert.deepEqual(await read('head'),head,'snapshot-layout-changed');for(const row of Object.values(reception.rows))if(row.active&&row.seatId!=='none')assert(cells[row.seatId]?.kind==='seat','snapshot-assigned-seat-missing');return{head,sections,cells,...reception,cachedGeometryUsed:!!reuse};
}
