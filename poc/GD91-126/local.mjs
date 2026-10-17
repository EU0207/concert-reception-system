import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generated as prior} from '../GD91-123/image-rules.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {request,owner,trial} from '../GD91-84/transport.mjs';
import {user,ok} from '../GD91-99/support.mjs';
import {cleanup} from '../GD91-89/support.mjs';
import {setup} from '../GD91-108/setup.mjs';
import {proposal,applyModel} from '../GD91-103/model.mjs';
import {createReferences} from '../GD91-92/references.mjs';
import {prepare} from '../GD91-91/sdk-adapter.mjs';
import {generated,credentialPattern,codePattern} from './contract-rules.mjs';
import {command} from './model.mjs';
import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';
const root=new URL('./',import.meta.url),files=['local.mjs','contract-rules.mjs','model.mjs','run-local.mjs'];
const before=sourceHashes(root,files),reports=[];let failure,clean;
const report=(id,facts)=>reports.push({id,...facts});
try{
  const current=generated(),old=prior(),copy=structuredClone(current);
  copy.rules.checks.$run.event.credentials.$credential['.validate']=old.rules.checks.$run.event.credentials.$credential['.validate'];
  copy.rules.checks.$run.event.codes.$code['.validate']=old.rules.checks.$run.event.codes.$code['.validate'];
  assert.deepEqual(copy,old);ok(await request('.settings/rules',{method:'PUT',token:'owner',body:current}));
  const f=await setup(2,1),m=f.manager,id=randomUUID(),seat=f.seatIds[0],other=f.seatIds[1];
  const head=(await user('head',m.device)).body,refs=createReferences({user,inspect:async()=>{throw Error('acknowledged-only');}});
  await refs.acquire(m,head);let record=(await user('references/'+m.referenceId,m.device)).body;
  async function reserve(body){const p=prepare(m,body);record=await refs.reserveKnown(m,p,record);return p;}
  async function commit(body){const p=prepare(m,body);if(record.pendingOperationId==='')await reserve(body);else assert.equal(record.pendingOperationId,p.operationId);
    const ack=await user('event',m.device,'PATCH',body);ok(ack);const actual=ack.body['operations/'+p.operationId]??ack.body.operations?.[p.operationId];assert(actual);
    const normalize=v=>v&&typeof v==='object'?(Object.keys(v).length===1&&v['.sv']==='timestamp'?actual.committedAt:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)]))):v;
    applyModel(f.state,normalize(body));record=await refs.clearAcknowledged(m,p,record,ack);
  }
  await commit(command(m,f.state,head,'register',id));await commit(proposal(m,f.state,head,'assign',seat,'none',id));
  const c=command(m,f.state,head,'qrCreate',id,{code:'ABCD2345'});await commit(c);
  const first=structuredClone(f.state.tickets[id]);assert(new RegExp(credentialPattern).test(first.credentialRef));assert.equal(Buffer.from(first.credentialRef,'base64url').length,16);
  assert.equal(first.code,'ABCD2345');assert.equal(first.currentCycle,1);
  report('Q01-approved-credential-and-code',{randomBytes:16,base64urlCharacters:22,alphabeticCodeAccepted:true,normalCreation:true});
  const beforeMove=structuredClone(first);await commit(proposal(m,f.state,head,'move',seat,other,'none',{reason:'架空の席移動'}));
  assert.deepEqual(f.state.tickets[id],beforeMove);report('Q02-seat-move-preserves-qualification',{sameCredentialAndCode:true,sameCycleAndVersion:true});
  assert.equal((await user('event/credentials/'+first.credentialRef,f.staff.device)).status,401);
  assert.equal((await user('event/codes/'+first.code,f.staff.device)).status,401);
  report('Q03-management-read-boundary',{generalCredentialReadDenied:true,generalCodeReadDenied:true});
  await f.control('stopped',2);
  const next=command(m,f.state,head,'qrReissue',id,{controlRevision:2}),op=next.commit.operationId;await reserve(next);
  for(const options of [{credential:randomUUID()},{credential:'Z'.repeat(22)},{credential:'A'.repeat(21)},{code:'00000000'},{code:'ABCI2345'}]){
    const beforeState=await owner(trial+'/event'),bad=command(m,f.state,head,'qrReissue',id,{controlRevision:2,id:op,...options});
    assert.equal((await user('event',m.device,'PATCH',bad)).status,401);assert.deepEqual(await owner(trial+'/event'),beforeState);
  }
  report('Q04-invalid-formats',{rejected:5,uuidAndShortNoncanonicalCredentialDenied:true,ambiguousCodesDenied:true,businessStatePreserved:true});
  const partial=structuredClone(next);delete partial['credentials/'+first.credentialRef];
  assert.equal((await user('event',m.device,'PATCH',partial)).status,401);await commit(next);
  assert.equal(f.state.credentials[first.credentialRef].active,false);assert.equal(f.state.codes[first.code].active,false);
  assert.equal(f.state.tickets[id].currentCycle,1);assert.equal(f.state.tickets[id].credentialVersion,2);
  assert.equal((await user('event/operations/'+op,m.device)).body.newCredential,f.state.tickets[id].credentialRef);
  assert.equal((await user('event',m.device,'PATCH',next)).status,401);
  report('Q05-reissue-and-operation-result',{partialRevocationDenied:true,oldCredentialAndCodeRevoked:true,cyclePreserved:true,versionIncremented:true,replayDenied:true});
  const second=structuredClone(f.state.tickets[id]);await commit(command(m,f.state,head,'cancelAttendance',id,{controlRevision:2}));
  assert(f.state.tickets[id].cycleClosed);assert.equal(f.state.credentials[second.credentialRef].active,false);
  await commit(command(m,f.state,head,'returnAttendance',id,{controlRevision:2}));await commit(proposal(m,f.state,head,'assign',other,'none',id,{controlRevision:2}));
  await commit(command(m,f.state,head,'qrCreate',id,{controlRevision:2}));assert.equal(f.state.tickets[id].currentCycle,2);
  assert.equal(f.state.credentials[first.credentialRef].active,false);assert.equal(f.state.credentials[second.credentialRef].active,false);
  report('Q06-cancel-and-next-cycle',{oldQualificationsRemainRevoked:true,newCycle:2,normalReturnAndCreation:true});
  report('Q07-difference-boundary',{changedValidationFormulas:2,otherSeatImageAndAuthRulesUnchanged:true});
}catch(e){failure={code:e.code??e.name,...failureDiagnostic(e)};process.exitCode=1;}
finally{clean=await cleanup();}
const after=sourceHashes(root,files);assert.deepEqual(before,after);
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,cleanup:clean,...(failure?{failure}:{}),
  externalFirebaseConnected:false,productionImplementation:false,allBusinessRegressionVerified:false,realDatabaseMigrationVerified:false,
  qualificationValuesPersisted:false,emptySeatRegistryOwnerSeeded:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup:clean}));
