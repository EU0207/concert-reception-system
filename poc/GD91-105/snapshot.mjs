import assert from 'node:assert/strict';import {snapshot as readLayout} from '../GD91-104/snapshot.mjs';
export async function snapshot(read,readReception,options={}){
 const base=await readLayout(read,readReception,options),presentations={};
 const models=[];for(const model of base.models){const p=await read('sectionPresentation/'+model.section.sectionId);presentations[model.section.sectionId]=p;models.push(p?{...model,section:{...model.section,name:p.name,stagePosition:p.stagePosition}}:model);}
 assert.deepEqual(await read('head'),base.head,'snapshot-section-display-changed');return{...base,models,presentations};
}
