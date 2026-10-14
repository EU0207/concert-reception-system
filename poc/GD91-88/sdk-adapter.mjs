import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import * as previous from '../GD91-86/sdk-adapter.mjs';
import {trial,user} from '../GD91-84/transport.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{update,ref}=require('firebase/database');
export const {client,close,prepare}=previous;
const normalize=(value,time)=>value&&typeof value==='object'?(Object.keys(value).length===1&&value['.sv']==='timestamp'?time:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,time)]))):value;

function verify(subject,p){
  assert.equal(p.formatVersion,1);assert.equal(p.performanceId,trial.split('/')[1]);assert.equal(p.humanUid,subject.human.uid);
  assert.equal(p.bodyHash,createHash('sha256').update(JSON.stringify(p.body)).digest('hex'));
  assert.equal(p.kind,'seat');assert.equal(p.target,'event');assert.equal(p.operationId,p.body.commit.operationId);
  assert.equal(p.resultPath,'event/operations/'+p.operationId);
}

export async function inspect(subject,p) {
  if(p.kind==='shared')return previous.inspect(subject,p);
  verify(subject,p);const response=await user(p.resultPath,subject.device);assert.equal(response.status,200,'result-unavailable');
  if(response.body===null)return{state:'absent'};
  const expected=p.body['operations/'+p.operationId],actual=response.body;
  assert.deepEqual(actual,normalize(expected,actual.committedAt),'operation-payload-mismatch');
  await verifyPayload(subject,p,actual);
  return{state:'committed'};
}

async function verifyPayload(subject,p,op){
  const target=op.target,revision=op.resultRevision;
  const expected={commit:{revision,operationId:p.operationId},['operations/'+p.operationId]:p.body['operations/'+p.operationId]};
  const add=(path,value)=>{expected[path]=value;};
  async function displayName(id){const row=await user('event/people/'+id,subject.device);assert.equal(row.status,200);return row.body.displayName;}
  if(['swap','move','assign','unassign'].includes(op.kind)){
    const people=new Set([op.beforeA,op.beforeB,op.afterA,op.afterB].filter(x=>x!=='none'));
    for(const id of people)add('people/'+id,{seatId:id===op.afterA?op.seatA:id===op.afterB?op.seatB:'none',revision,active:true,displayName:await displayName(id)});
    for(const [seat,id]of[[op.seatA,op.afterA],[op.seatB,op.afterB]])if(seat!=='none'){
      add('seats/'+seat,{personId:id,revision});add('view/'+seat,{personId:id,revision,displayName:id==='none'?'':expected['people/'+id].displayName});
    }
  }else{
    if(op.kind==='register'||op.kind==='payment'){
      const row=await user('event/profiles/'+target,subject.device);assert.equal(row.status,200);assert(row.body);
      add('profiles/'+target,{...row.body,paid:op.kind==='register'?false:op.paid,revision});
    }
    if(['register','cancelAttendance','returnAttendance'].includes(op.kind))add('people/'+target,{active:op.kind!=='cancelAttendance',seatId:'none',displayName:await displayName(target),revision});
    if(op.kind==='cancelAttendance'&&op.previousSeat!=='none'){
      add('seats/'+op.previousSeat,{personId:'none',revision});add('view/'+op.previousSeat,{personId:'none',displayName:'',revision});
    }
    if(op.ticketSnapshot!=='none')add('tickets/'+target,op.ticketSnapshot);
    if(['qrCreate','qrReissue'].includes(op.kind)){
      const t=op.ticketSnapshot;add('credentials/'+op.newCredential,{personId:target,currentCycle:t.currentCycle,credentialVersion:t.credentialVersion,code:op.newCode,active:true,revision});
      add('codes/'+op.newCode,{credentialRef:op.newCredential,active:true,revision});
    }
    if(['qrReissue','cancelAttendance'].includes(op.kind)&&op.previousCredential){
      const t=op.ticketSnapshot;add('credentials/'+op.previousCredential,{personId:target,currentCycle:t.currentCycle,credentialVersion:t.credentialVersion-(op.kind==='qrReissue'?1:0),code:op.previousCode,active:false,revision});
      add('codes/'+op.previousCode,{credentialRef:op.previousCredential,active:false,revision});
    }
  }
  assert.deepEqual(normalize(p.body,op.committedAt),normalize(expected,op.committedAt),'operation-body-mismatch');
}

export async function send(subject,p,{online=true,trace={writes:0},write}={}) {
  if(!online)throw Object.assign(new Error('explicit-offline'),{code:'explicit-offline'});
  if(p.kind==='shared')return previous.send(subject,p,{online,trace,write});
  if((await inspect(subject,p)).state==='committed')return{state:'already-committed'};
  trace.writes++;if(write)await write(p);else await update(ref(subject.db,trial+'/event'),p.body);
  assert.equal((await inspect(subject,p)).state,'committed');return{state:'committed'};
}
