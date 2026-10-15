import assert from 'node:assert/strict';import {snapshot as readBase} from '../GD91-102/snapshot.mjs';import {project} from './slide.mjs';
export async function snapshot(read,readReception,{cached,...options}={}){
 const base=await readBase(read,readReception,{...options,cached:cached?.baseSnapshot,context:{initialNumbered:true,assignments:[],ticketRefs:[]}}),models=[],views={};
 for(const model of base.models){const id=model.section.sectionId,view=await read('sectionViews/'+base.head.generation+'/'+id);views[id]=view;const {bounds,...section}=model.section;models.push(project({...model,section,initialNumbered:true},view));}
 assert.deepEqual(await read('head'),base.head,'snapshot-view-changed');const cellsById={},seatsById={};for(const m of models){for(const c of m.section.cells)cellsById[c.cellId]=c;for(const s of m.seats)seatsById[s.seatId]=s;}
 return{...base,baseSnapshot:base,models,views,cellsById,seatsById};
}
