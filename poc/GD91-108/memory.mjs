import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {setup} from './setup.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {trial,owner,user,request,ok,metrics,cleanup} from '../GD91-99/support.mjs';import {namespace} from '../GD91-84/transport.mjs';
import {command,applyModel} from '../GD91-103/model.mjs';import {bulk} from '../GD91-92/model.mjs';
import {createReferences} from '../GD91-92/references.mjs';import {prepare} from '../GD91-91/sdk-adapter.mjs';

const mode=process.argv[2],people=Number(process.env.GD108_DIAGNOSTIC_PEOPLE??1000),writes=people===4?2:100;
assert(['full-history','compact-history','rules-control','identical-rules-reset'].includes(mode));assert([4,1000].includes(people));assert(namespace.startsWith('demo-'));
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['memory.mjs','memory-run.mjs','../GD91-107/database.rules.json','../GD91-107/deny.rules.json']),before=hashes();
const samples=[],completed=[];let failure,clean,phase='rules',fixtureBytes,fixtureOperations,controlRulesHash,identicalRulesReset,lastBody;
const normalize=(v,t)=>v&&typeof v==='object'?(Object.keys(v).length===1&&v['.sv']==='timestamp'?t:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x,t)]))):v;
const jcmd=(...a)=>execFileSync('jcmd',a,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:60000});
const found=JSON.parse(execFileSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe',['-NoProfile','-Command',"Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}));const candidates=Array.isArray(found)?found:[found];assert.equal(candidates.length,1,'emulator-java-pid-ambiguous');const pid=String(candidates[0]);assert(/^\d+$/.test(pid));
assert.equal(execFileSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe',['-NoProfile','-Command','(Get-Process -Id '+pid+').ProcessName'],{encoding:'utf8',windowsHide:true}).trim(),'java');
function heap(){const text=jcmd(pid,'GC.heap_info'),match=/heap\s+total\s+(\d+)K,\s+used\s+(\d+)K/.exec(text);assert(match,'unexpected-heap-info');return{committedBytes:Number(match[1])*1024,usedBytes:Number(match[2])*1024};}
function sample(stage){
 const prior=heap(),histogram=jcmd(pid,'GC.class_histogram'),after=heap();
 const topClasses=histogram.split(/\r?\n/).map(x=>/^\s*\d+:\s+(\d+)\s+(\d+)\s+(.+)$/.exec(x)).filter(Boolean).slice(0,15).map(m=>({instances:Number(m[1]),bytes:Number(m[2]),className:m[3]}));assert(topClasses.length);
 const value={stage,usedBeforeForcedGc:prior.usedBytes,usedAfterForcedGc:after.usedBytes,committedBytes:after.committedBytes,topClasses};samples.push(value);console.log(JSON.stringify({mode,stage,usedAfterForcedGc:after.usedBytes}));
}
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('../GD91-107/database.rules.json',import.meta.url)))}));sample('rules-loaded');
 phase='layout';const f=await setup(people,people===4?2:16),m=f.manager,head=(await user('head',m.device)).body;
 const refs=createReferences({user,inspect:async()=>{throw Error('acknowledged-only');}});await refs.acquire(m,head);let reference=(await user('references/'+m.referenceId,m.device)).body;
 phase='fixture';const time=Date.now();
 for(let i=0;i<people;i++)applyModel(f.state,normalize(command(m,f.state,head,'register','person-'+i),time));
 applyModel(f.state,normalize(bulk(m,f.state,head,Object.fromEntries(f.seatIds.map((id,i)=>['person-'+i,id]))),time));
 for(let i=0;i<people;i++)applyModel(f.state,normalize(command(m,f.state,head,'qrCreate','person-'+i,{code:String(10000000+i)}),time));
 if(mode==='compact-history')f.state.operations={[f.state.commit.operationId]:f.state.operations[f.state.commit.operationId]};
 fixtureBytes=Buffer.byteLength(JSON.stringify(f.state));fixtureOperations=Object.keys(f.state.operations).length;
 await owner(trial+'/event','PUT',f.state);
 if(mode==='rules-control'){
  const permission="auth != null && auth.uid === '"+m.device.uid+"'",rules={rules:{'.read':false,'.write':false,checks:{[trial.split('/')[1]]:{'.read':permission,'.write':permission}}}};
  controlRulesHash=createHash('sha256').update(JSON.stringify(rules)).digest('hex');ok(await request('.settings/rules',{token:'owner',method:'PUT',body:rules}));
 }
 sample('fixture-stored');phase='ticket-check';const start={...metrics};
 for(let i=0;i<writes;i++){
  const body=command(m,f.state,head,'ticketCheck','person-'+i,{issued:true}),p=prepare(m,body);
  reference=await refs.reserveKnown(m,p,reference);const ack=await user('event',m.device,'PATCH',body);ok(ack);lastBody=body;
  const op=ack.body['operations/'+p.operationId]??ack.body.operations?.[p.operationId];assert(op);applyModel(f.state,normalize(body,op.committedAt));reference=await refs.clearAcknowledged(m,p,reference,ack);completed.push(i);
  if((i+1)%50===0||i+1===writes)sample('ticket-check-'+(i+1));
 }
 const normalRequests=metrics.userRequests-start.userRequests;assert.equal(normalRequests,writes*3);assert.equal(metrics.ownerRequests,start.ownerRequests);
 sample('final');completed.push({normalRequests});
 if(mode==='identical-rules-reset'){
  phase='identical-rules-reset';const dataHash=async()=>createHash('sha256').update(JSON.stringify(await owner(trial))).digest('hex');
  const priorHash=await dataHash(),rules=JSON.parse(fs.readFileSync(new URL('../GD91-107/database.rules.json',import.meta.url)));
  assert.deepEqual((await request('.settings/rules',{token:'owner'})).body,rules);const priorUsed=samples.at(-1).usedAfterForcedGc;
  ok(await request('.settings/rules',{token:'owner',method:'PUT',body:rules}));assert.deepEqual((await request('.settings/rules',{token:'owner'})).body,rules);assert.equal(await dataHash(),priorHash);
  sample('identical-rules-reloaded');const afterUsed=samples.at(-1).usedAfterForcedGc;
  assert.equal((await user('event',m.device,'PATCH',lastBody)).status,401);assert.equal(await dataHash(),priorHash);
  const body=command(m,f.state,head,'ticketCheck','person-'+writes,{issued:true}),p=prepare(m,body);reference=await refs.reserveKnown(m,p,reference);const reservedHash=await dataHash();
  assert.equal((await user('event',f.staff.device,'PATCH',body)).status,401);assert.equal(await dataHash(),reservedHash);
  const ack=await user('event',m.device,'PATCH',body);ok(ack);reference=await refs.clearAcknowledged(m,p,reference,ack);assert.equal((await user('event/commit',m.device)).body.operationId,p.operationId);sample('continued-after-reset');
  identicalRulesReset={applicationDataHashUnchanged:true,rulesHash:createHash('sha256').update(JSON.stringify(rules)).digest('hex'),beforeUsedBytes:priorUsed,afterUsedBytes:afterUsed,releasedBytes:priorUsed-afterUsed,replayDenied:true,otherActorDenied:true,continuedNormalOperation:true};
 }
}catch(e){failure={phase,code:e.code??e.name,message:e.message.slice(0,500)};process.exitCode=1;}
finally{try{clean=await cleanup();}catch(e){clean={rulesClosed:false,trialRootEmpty:false,error:e.code??e.name};process.exitCode=1;}}
assert.deepEqual(before,hashes());
const result={sourceHashes:before,endSourceHashes:hashes(),mode,people,writes,fixtureBytes,fixtureOperations,controlRulesHash,identicalRulesReset,samples,completed,cleanup:clean,...(failure?{failure}:{}),seededStateUsesOwner:true,diagnosticOnly:true,forcedGcAtBoundaries:true,objectContentsRecorded:false,realHeapDumpCreated:false,javaHeapBytes:8589934592,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false};
const name=(people===4?'smoke-':'')+'memory-'+mode+'-summary.json';fs.writeFileSync(new URL('artifacts/'+name,import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mode,people,samples:samples.length,failure:failure??null,cleanup:clean}));process.exit(process.exitCode??0);
