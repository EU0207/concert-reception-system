import assert from 'node:assert/strict';
import {owner,user,trial,provision,issue,ok} from '../GD91-99/support.mjs';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {build} from '../GD91-110/layout.mjs';
import {preparePublication} from '../GD91-104/slide.mjs';
import {initialize,applyModel} from '../GD91-89/projection.mjs';

export async function setup(people,sections){
 const control={state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1,closingSchemaVersion:1};
 await owner(trial+'/control','PUT',control);
 const manager=await provision('owner'),staff=await provision('receptionist');ok(await issue(manager));ok(await issue(staff));await owner(trial+'/deviceRoster','PUT',{meta:{count:2,revision:2,lastDeviceUid:staff.device.uid},byOrder:{n0:manager.device.uid,n1:staff.device.uid},byId:{[manager.device.uid]:0,[staff.device.uid]:1}});
 const sendLayout=async(p,method,body)=>{const r=await user(p,manager.device,method,body);ok(r);return r.body;};
 const read=async p=>{const r=await user(p,manager.device);ok(r);return r.body;};
 const models=[];let remaining=people;
 for(let i=0;i<sections;i++){
  const count=Math.ceil(remaining/(sections-i));remaining-=count;
  const axis=i%2?'vertical':'horizontal',rows=people===4?1:8,columns=people===4?count*2:32,lines=Array.from({length:axis==='horizontal'?rows:columns},()=>({name:'界'.repeat(64),prefix:'界'.repeat(48),startNumber:9007199254740000}));
  const base=createSection({name:'区'.repeat(100),rows,columns,axis,seatOrder:i%4<2?'forward':'reverse',stagePosition:i%2?'left':'top',lines},{maxCells:4096});
  const selections=Object.fromEntries(base.section.cells.map((c,j)=>[c.row+','+c.column,j<count?'seat':['unset','space','aisle','gap'][j%4]]));
  const model=numberInitial(base,selections,{maxCells:4096});for(const s of model.seats){s.reservedLabel='用'.repeat(100);s.emergencyChange={kind:'add',reason:'架'.repeat(200)};}models.push(model);
 }
 assert.equal(remaining,0);
 const layout=await build(sendLayout,'layout',models),checked=await preparePublication(read,sendLayout,manager,'layout');
 await sendLayout('','PATCH',checked.publish(1));await sendLayout('','PATCH',checked.complete());
 const state=initialize();await sendLayout('event','PATCH',{commit:state.commit,'reception/0000000000':1});
 const seatIds=models.flatMap(m=>m.seats.map(s=>s.seatId));assert.equal(seatIds.length,people);
 return{manager,staff,state,layout,models,seatIds,cells:layout.items,send:async body=>{const r=await user('event',manager.device,'PATCH',body);ok(r);applyModel(state,body);return r;},control:(state,revision)=>owner(trial+'/control','PUT',{...control,state,revision})};
}
