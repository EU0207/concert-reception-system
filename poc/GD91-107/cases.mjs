import assert from 'node:assert/strict';
import {createSection,numberInitial,extend} from '../GD91-07/planner.mjs';
import {build} from '../GD91-104/geometry.mjs';import {preparePublication} from '../GD91-104/slide.mjs';
import {snapshot} from '../GD91-105/snapshot.mjs';import {initialize} from '../GD91-89/projection.mjs';import {command,applyModel} from '../GD91-103/model.mjs';import {bulk} from '../GD91-92/model.mjs';import {createReferences} from '../GD91-92/references.mjs';import {prepare} from '../GD91-91/sdk-adapter.mjs';
import {numberedExtension,prepareNumbered} from './edit.mjs';
import {runNegatives} from './negative-cases.mjs';import {display} from '../GD91-105/model.mjs';import {collect} from '../GD91-104/collection.mjs';
export async function runCases(io,m,a,{minimal=false}={}){
 const reports=[],profiles=[];let serial=0;
 const send=async(p,method='GET',body)=>method==='GET'?io.sdkRead(m,p):io.sdkWrite(m,p,method,body),read=p=>send(p),normal=(f,p,method='GET',body)=>io.normal(f,p,method,body);
 const denied=fn=>assert.rejects(fn,e=>/permission[_ ]denied/i.test(e.code??e.message));
 const report=async(id,facts={})=>{reports.push({id,...facts});io.onReport?.({id,...facts});console.log(JSON.stringify({id,passed:true}));};
 async function fixture({axis='horizontal',seatOrder='forward',stagePosition='left'}={}){
  await io.reset();m.sessionRevision=0;a.sessionRevision=0;
  for(const[f,role]of[[m,'owner'],[a,'receptionist']]){await io.owner('roles/'+f.human.uid,'PUT',{active:true,role,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});await io.owner('devices/'+f.device.uid,'PUT',{schemaVersion:2,performanceId:io.performanceId,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1});await io.issue(f);}
  const control={state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1};await io.owner('control','PUT',control);
  const model=numberInitial(createSection({name:'架空区画',rows:2,columns:3,axis,seatOrder,stagePosition,lines:Array.from({length:axis==='horizontal'?2:3},(_,i)=>({name:'列'+i,prefix:'A'+i+'-',startNumber:7}))},{maxCells:100000}),{'0,0':'seat','0,1':'gap','1,2':'seat'},{maxCells:100000});
  await build(send,'initial'+(++serial),[model]);const first=await preparePublication(read,send,m,'initial'+serial);await send('','PATCH',first.publish(1));await send('','PATCH',first.complete());const head=await read('head'),state=initialize();await send('event','PATCH',{commit:state.commit,'reception/0000000000':1});
  const refs=createReferences({user:(p,d,method='GET',body)=>normal({device:d},p,method,body),inspect:async()=>({state:'absent'})});await refs.acquire(m,head);let reference=await read('references/'+m.referenceId);
  async function event(body){const p=prepare(m,body);reference=await refs.reserveKnown(m,p,reference);const ack=await normal(m,'event','PATCH',body);assert.equal(ack.status,200);applyModel(state,body);reference=await refs.clearAcknowledged(m,p,reference,ack);}
  await event(command(m,state,head,'register','p'));await event(bulk(m,state,head,{p:model.seats[0].seatId}));await event(command(m,state,head,'qrCreate','p'));
  async function rename(name){const currentHead=await read('head'),body=display(m,state,currentHead,model,null,'rename',name),ev=Object.fromEntries(Object.entries(body).filter(([k])=>k.startsWith('event/')).map(([k,v])=>[k.slice(6),v])),p=prepare(m,ev);reference=await refs.reserveKnown(m,p,reference);await send('','PATCH',body);applyModel(state,ev);reference=await refs.clearAcknowledged(m,p,reference,{status:200,body:{['operations/'+p.operationId]:await read('event/operations/'+p.operationId)}});}
  return{model,control,head,ticket:await read('event/tickets/p'),refs,rename,register:async id=>event(command(m,state,await read('head'),'register',id))};
 }
 function proposal(model,dimension,{count=4,reason=''}={}){
  const spec={dimension,count,...((model.section.axis==='horizontal'?'columns':'rows')===dimension?{}:{lines:Array.from({length:count},(_,i)=>({name:'追加列'+i,prefix:'追加'+i+'-',startNumber:20}))})};
  const preview=extend(model,spec,{maxCells:100000}),ids=new Set(preview.change.addedCellIds),kinds=['seat','gap','space','aisle','unset'];spec.selections=Object.fromEntries(preview.after.section.cells.filter(c=>ids.has(c.cellId)).map((c,i)=>[c.row+','+c.column,kinds[i%kinds.length]]));
  return numberedExtension([model],model.section.sectionId,spec,{reason});
 }
 async function stage(p,{intercept}={}){const generation='numbered'+(++serial);let checkId;const write=async(path,method,body)=>{for(const key of Object.keys(body??{}))if(key.startsWith('publicationChecks/'))checkId=key.slice(18);const actual=intercept?intercept(path,method,body):{p:path,method,body};return send(actual.p,actual.method,actual.body);};try{await build(send,generation,p.models);return{generation,proof:await prepareNumbered(read,write,m,generation,p.edit)};}catch(e){if(checkId){const record=await read('publicationChecks/'+checkId);if(record){await send('','PATCH',{['publicationChecks/'+checkId]:{...record,phase:'cancelled'},...Object.fromEntries([record.sourceGeneration,record.candidateGeneration].map(g=>['generations/'+g+'/refs/publication-'+checkId,null]))});await send('numberProofs/'+checkId,'DELETE');await collect(read,send,generation);}}throw e;}}
 async function publish(f,p){await send('','PATCH',p.proof.publish());await send('','PATCH',p.proof.complete());await send('numberProofs/'+p.proof.id,'DELETE');const current=await snapshot(read,async()=>({rows:{}}));assert.deepEqual(await read('event/tickets/p'),f.ticket);assert.equal((await read('event/seats/'+f.model.seats[0].seatId)).personId,'p');return current.models[0];}
 for(const axis of['horizontal','vertical'])for(const seatOrder of['forward','reverse'])for(const dimension of['rows','columns'])for(const stagePosition of['left','top']){
  const f=await fixture({axis,seatOrder,stagePosition}),p=proposal(f.model,dimension),s=await stage(p),after=await publish(f,s);
  const oldById=new Map(f.model.section.cells.map(c=>[c.cellId,c]));for(const c of after.section.cells){const old=oldById.get(c.cellId);if(old)assert.equal(c.kind,old.kind);}
  for(const seat of f.model.seats)assert.deepEqual(after.seats.find(s=>s.seatId===seat.seatId),{...seat,displayOrder:after.seats.find(s=>s.seatId===seat.seatId).displayOrder});
  assert.deepEqual(after.section.lineSettings,p.models[0].section.lineSettings);assert.deepEqual(after.section.cells,p.models[0].section.cells);profiles.push({axis,seatOrder,dimension,stagePosition,oldSeatAndQrPreserved:true});
  if(minimal)break;
 }
 await report('N01-terminal-numbering-profiles',{profiles:profiles.length});
 if(!minimal)await runNegatives({fixture,proposal,stage,publish,read,send,io,m,a,report});
 return{reports,profiles,realIndexedDbVerifiedHere:false,fullBusinessFreeTierVerified:false};
}
