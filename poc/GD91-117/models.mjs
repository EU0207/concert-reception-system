import assert from 'node:assert/strict';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {checkCapacity} from '../GD91-116/policy.mjs';
export function modelsFor(people){
 assert([600,1000].includes(people));let remaining=people;
 const models=Array.from({length:16},(_,i)=>{
  const axis=i%2?'vertical':'horizontal',rows=axis==='horizontal'?256:1,columns=axis==='vertical'?256:1;
  const lines=Array.from({length:256},(_,j)=>({name:'列'.repeat(64),prefix:'界'.repeat(42)+String(i).padStart(2,'0')+String(j).padStart(4,'0'),startNumber:9007199254740000}));
  const base=createSection({name:'区'.repeat(100),rows,columns,axis,seatOrder:i%4<2?'forward':'reverse',stagePosition:i%2?'left':'top',lines},{maxCells:4096});
  const count=Math.ceil(remaining/(16-i));remaining-=count;
  const result=numberInitial(base,Object.fromEntries(base.section.cells.map((c,j)=>[c.row+','+c.column,j<count?'seat':['unset','space','aisle','gap'][j%4]])),{maxCells:4096});
  for(const seat of result.seats){seat.reservedLabel='用'.repeat(100);seat.emergencyChange={kind:'add',reason:'由'.repeat(200)};}
  return result;
 });
 assert.equal(remaining,0);assert.equal(models.flatMap(x=>x.seats).length,people);assert.equal(checkCapacity(models).cells,4096);
 return models;
}
