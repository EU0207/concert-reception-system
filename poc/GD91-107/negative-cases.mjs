import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {extend} from '../GD91-07/planner.mjs';import {collect} from '../GD91-104/collection.mjs';import {snapshot} from '../GD91-105/snapshot.mjs';
export async function runNegatives({fixture,proposal,stage,publish,read,send,io,m,a,report}){
 const denied=fn=>assert.rejects(fn,e=>/permission[_ ]denied/i.test(e.code??e.message));
 async function rejectProposal(p,{intercept}={}){const head=await read('head'),event=await io.owner('event');await denied(()=>stage(p,{intercept}));assert.deepEqual(await read('head'),head);assert.deepEqual(await io.owner('event'),event);}
 {
  const f=await fixture(),model=f.model,spec={dimension:'columns',count:2},defaulted=extend(model,spec,{maxCells:100000});assert(defaulted.after.section.cells.filter(c=>!model.section.cells.some(old=>old.cellId===c.cellId)).every(c=>c.kind==='unset'));
  const p={models:[defaulted.after],edit:{...proposal(model,'columns',{count:2}).edit}},s=await stage(p);const after=await publish(f,s);assert.deepEqual(after.section.lineSettings,model.section.lineSettings);await report('N02-default-new-cells-remain-unset');
 }
 {
  const f=await fixture();await io.owner('control','PUT',{...f.control,state:'operating',revision:2,firstReceptionStartedAt:Date.now()});await rejectProposal(proposal(f.model,'columns'));
  const p=proposal(f.model,'columns',{reason:'架空：当日追加の用途'}),s=await stage(p),after=await publish(f,s);const newSeats=after.seats.filter(seat=>!f.model.seats.some(old=>old.seatId===seat.seatId));assert(newSeats.length>0);assert(newSeats.every(seat=>seat.emergencyChange?.kind==='add'&&seat.emergencyChange.reason===p.edit.reason));
  const staff=await snapshot(p=>io.sdkRead(a,p),async()=>({rows:{}}));assert.deepEqual(staff.models, [after]);await report('N03-day-of-reason-and-staff-read');
 }
 {
  const variants=[body=>({...body,index:body.index+1}),body=>({...body,nextNumber:body.nextNumber+1}),body=>({...body,cellId:randomUUID()})];
  for(const mutate of variants){const f=await fixture();let changed=false;await rejectProposal(proposal(f.model,'columns'),{intercept:(p,method,body)=>{if(p.startsWith('numberProofs/')&&!changed){changed=true;return{p,method,body:mutate(body)};}return{p,method,body};}});assert(changed);}
  await report('N04-proof-skip-count-and-cell-forgeries-denied',{variants:3});
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns'),s=await stage(p),proofs=await read('numberProofs/'+s.proof.id),[line,steps]=Object.entries(proofs)[0],[step,body]=Object.entries(steps)[0];
  await denied(()=>send('numberProofs/'+s.proof.id+'/'+line+'/'+step,'PUT',body));await denied(()=>send('numberProofs/'+s.proof.id,'DELETE'));
  const incomplete={...s.proof.record,cursor:0,candidateCursor:0};await denied(()=>send('publicationChecks/'+s.proof.id,'PUT',incomplete));await publish(f,s);assert.equal(await read('numberProofs/'+s.proof.id),null);await report('N05-proof-rewrite-early-delete-and-cursor-rollback-denied');
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns'),oldIds=new Set(f.model.section.cells.map(c=>c.cellId));
  for(const line of p.models[0].section.lineSettings)line.nextAutomaticNumber++;
  for(const cell of p.models[0].section.cells)if(!oldIds.has(cell.cellId)&&cell.kind==='gap')cell.consumedNumber++;
  for(const seat of p.models[0].seats)if(!f.model.seats.some(old=>old.seatId===seat.seatId))seat.number++;
  await rejectProposal(p);await report('N06-noncontiguous-new-numbers-denied');
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns');p.models[0].seats.find(s=>s.seatId===f.model.seats[0].seatId).usable=false;await rejectProposal(p);await report('N07-assigned-existing-seat-change-denied');
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns'),newSeat=p.models[0].seats.find(s=>!f.model.seats.some(old=>old.seatId===s.seatId));newSeat.numberingMode='manual';newSeat.manualNumber='途中追加';delete newSeat.number;delete newSeat.prefix;await rejectProposal(p);await report('N08-manual-seat-in-terminal-numbering-denied');
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns'),s=await stage(p);await f.register('q');const head=await read('head');await denied(()=>send('','PATCH',s.proof.publish()));assert.deepEqual(await read('head'),head);await send('','PATCH',s.proof.cancel());await send('numberProofs/'+s.proof.id,'DELETE');assert.deepEqual(await read('event/tickets/p'),f.ticket);await report('N09-business-update-fences-publication');
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns'),s=await stage(p),path='roles/'+m.human.uid,old=await io.owner(path);await io.owner(path,'PUT',{...old,active:false});try{await denied(()=>send('','PATCH',s.proof.publish()));}finally{await io.owner(path,'PUT',old);}await publish(f,s);await report('N10-revoked-authority-denies-numbered-publication');
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns'),s=await stage(p);await denied(()=>collect(read,send,f.head.generation));await denied(()=>collect(read,send,s.generation));await send('','PATCH',s.proof.cancel());await send('numberProofs/'+s.proof.id,'DELETE');await collect(read,send,s.generation);assert.equal((await read('generations/'+s.generation+'/meta')).phase,'deleted');assert.deepEqual(await read('event/tickets/p'),f.ticket);await report('N11-source-and-candidate-held-until-cancel');
 }
 {
  const f=await fixture(),one=await stage(proposal(f.model,'columns')),two=await stage(proposal(f.model,'columns'));const results=await Promise.allSettled([send('','PATCH',one.proof.publish()),send('','PATCH',two.proof.publish())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const winner=results[0].status==='fulfilled'?one:two,loser=winner===one?two:one;await send('','PATCH',winner.proof.complete());await send('','PATCH',loser.proof.cancel());await send('numberProofs/'+winner.proof.id,'DELETE');await send('numberProofs/'+loser.proof.id,'DELETE');assert.equal((await read('head')).generation,winner.generation);assert.deepEqual(await read('event/tickets/p'),f.ticket);await report('N12-concurrent-numbered-publication-one-winner');
 }
 {
  const f=await fixture(),p=proposal(f.model,'columns');await f.rename('改名後');const latest=(await snapshot(read,async()=>({rows:{}}))).models[0];const fresh=proposal(latest,'columns'),s=await stage(fresh),after=await publish(f,s);assert.equal(after.section.name,'改名後');await report('N13-current-presentation-preserved');
 }
 {
  const f=await fixture(),model=structuredClone(f.model),line=model.section.lineSettings[0],cell=model.section.cells.find(c=>c.row===0&&c.kind==='unset');assert(cell);const seatId=randomUUID();cell.kind='seat';cell.seatId=seatId;model.seats.push({seatId,sectionId:model.section.sectionId,lineId:line.lineId,numberingMode:'manual',manualNumber:line.prefix+line.nextAutomaticNumber,category:'general',usable:true});
  assert.throws(()=>proposal(model,'columns'),/duplicate display number/);
  const overflow=structuredClone(f.model);for(const l of overflow.section.lineSettings)l.nextAutomaticNumber=Number.MAX_SAFE_INTEGER;assert.throws(()=>proposal(overflow,'columns'),/number overflow/);await report('N14-local-collision-and-overflow-rejected');
 }
}
