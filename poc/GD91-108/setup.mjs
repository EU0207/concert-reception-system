import assert from 'node:assert/strict';
import {owner,user,trial,provision,issue,ok} from '../GD91-99/support.mjs';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {build} from '../GD91-104/geometry.mjs';
import {preparePublication} from '../GD91-104/slide.mjs';
import {initialize,applyModel} from '../GD91-89/projection.mjs';

export async function setup(people,sections){
 const control={state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1};
 await owner(trial+'/control','PUT',control);
 const manager=await provision('owner'),staff=await provision('receptionist');ok(await issue(manager));ok(await issue(staff));
 const sendLayout=async(p,method,body)=>{const r=await user(p,manager.device,method,body);ok(r);return r.body;};
 const read=async p=>{const r=await user(p,manager.device);ok(r);return r.body;};
 const models=[];let remaining=people;
 for(let i=0;i<sections;i++){
  const count=Math.ceil(remaining/(sections-i));remaining-=count;
  const base=createSection({name:'架空区画'+i,rows:1,columns:count*2,axis:'horizontal',seatOrder:i%2?'reverse':'forward',stagePosition:i%2?'top':'left',lines:[{name:'列'+i,prefix:'A'+i+'-',startNumber:1}]},{maxCells:100000});
  const selections=Object.fromEntries(base.section.cells.map((c,j)=>['0,'+c.column,j<count?'seat':['unset','space','aisle','gap'][j%4]]));
  models.push(numberInitial(base,selections,{maxCells:100000}));
 }
 assert.equal(remaining,0);
 const layout=await build(sendLayout,'layout',models),checked=await preparePublication(read,sendLayout,manager,'layout');
 await sendLayout('','PATCH',checked.publish(1));await sendLayout('','PATCH',checked.complete());
 const state=initialize();await sendLayout('event','PATCH',{commit:state.commit,'reception/0000000000':1});
 const seatIds=models.flatMap(m=>m.seats.map(s=>s.seatId));assert.equal(seatIds.length,people);
 return{manager,staff,state,layout,models,seatIds,cells:layout.items,send:async body=>{const r=await user('event',manager.device,'PATCH',body);ok(r);applyModel(state,body);return r;},control:(state,revision)=>owner(trial+'/control','PUT',{...control,state,revision})};
}
