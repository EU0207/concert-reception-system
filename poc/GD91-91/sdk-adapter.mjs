import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import * as previous from '../GD91-88/sdk-adapter.mjs';import {trial,user} from '../GD91-84/transport.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{update,ref}=require('firebase/database');
export const {prepare,client,close}=previous;
const hash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
const normalize=(v,time)=>v&&typeof v==='object'?(Object.keys(v).length===1&&v['.sv']==='timestamp'?time:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x,time)]))):v;
export async function inspect(subject,p){
 if(p.kind==='shared')return previous.inspect(subject,p);
 assert.equal(p.formatVersion,1);assert.equal(p.performanceId,trial.split('/')[1]);assert.equal(p.humanUid,subject.human.uid);assert.equal(p.kind,'seat');assert.equal(p.target,'event');assert.equal(p.operationId,p.body.commit.operationId);assert.equal(p.resultPath,'event/operations/'+p.operationId);assert.equal(p.bodyHash,hash(p.body));
 const r=await user(p.resultPath,subject.device);assert.equal(r.status,200,'result-unavailable');if(r.body===null)return{state:'absent'};
 const op=r.body;assert.deepEqual(op,normalize(p.body['operations/'+p.operationId],op.committedAt),'operation-payload-mismatch');
 const snapshots=op.qrSnapshot==='none'?{}:op.qrSnapshot;assert(snapshots&&typeof snapshots==='object');const ids=Object.keys(snapshots);
 assert.deepEqual(Object.keys(p.body).filter(k=>k.startsWith('reception/')).sort(),['reception/0000000000',...ids.map(id=>'reception/i-'+id)].sort());assert.equal(p.body['reception/0000000000'],op.resultRevision);
 async function publicRow(id,seatId,active){const person=await user('event/people/'+id,subject.device);assert.equal(person.status,200);assert(person.body);const qr=snapshots[id];return{personId:id,active,seatId,displayName:person.body.displayName,...qr,eligible:active&&seatId!=='none'&&qr.credentialRef.length>0,revision:op.resultRevision};}
 if(op.kind==='bulkAssign'){
  assert.deepEqual(ids.sort(),Object.keys(op.targets).sort());const expected={commit:{revision:op.resultRevision,operationId:p.operationId},['operations/'+p.operationId]:p.body['operations/'+p.operationId],'reception/0000000000':op.resultRevision};
  for(const[id,seatId]of Object.entries(op.targets)){const row=await publicRow(id,seatId,true);expected['people/'+id]={active:true,seatId,displayName:row.displayName,revision:op.resultRevision};expected['seats/'+seatId]={personId:id,revision:op.resultRevision};expected['view/'+seatId]={personId:id,displayName:row.displayName,revision:op.resultRevision};expected['reception/i-'+id]=row;}
  assert.deepEqual(p.body,expected,'bulk-body-mismatch');
 }else{
  const body=Object.fromEntries(Object.entries(p.body).filter(([k])=>!k.startsWith('reception/')));assert.equal((await previous.inspect(subject,{...p,body,bodyHash:hash(body)})).state,'committed');
  for(const id of ids){const seatKind=['assign','unassign','swap','move'].includes(op.kind),seatId=seatKind?(op.afterA===id?op.seatA:op.afterB===id?op.seatB:'none'):['register','cancelAttendance','returnAttendance'].includes(op.kind)?'none':op.previousSeat;assert.deepEqual(p.body['reception/i-'+id],await publicRow(id,seatId,op.kind!=='cancelAttendance'),'reception-body-mismatch');}
 }
 return{state:'committed'};
}
export async function send(subject,p,{online=true,trace={writes:0},write}={}){
 if(!online)throw Object.assign(new Error('explicit-offline'),{code:'explicit-offline'});
 if(p.kind==='shared')return previous.send(subject,p,{online,trace,write});
 if((await inspect(subject,p)).state==='committed')return{state:'already-committed'};
 trace.writes++;if(write)await write(p);else await update(ref(subject.db,trial+'/event'),p.body);
 assert.equal((await inspect(subject,p)).state,'committed');return{state:'committed'};
}
