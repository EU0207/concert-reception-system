import fs from 'node:fs';import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {request,user,owner,trial,provision,issue,ok} from '../GD91-99/support.mjs';import {cleanup} from '../GD91-89/support.mjs';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';import {initialize} from '../GD91-89/projection.mjs';
import {build,snapshot} from '../GD91-116/layout.mjs';import {generated} from '../GD91-116/generate.mjs';
import {preparePublication} from '../GD91-104/slide.mjs';import {numberedExtension,prepareNumbered} from '../GD91-107/edit.mjs';
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['addition-local.mjs']),before=hashes(),reports=[];let clean,failure,stage='setup';
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:generated()}));
 for(const people of [600,1000]){
  stage='setup-'+people;await owner(trial,'DELETE');const m=await provision('owner');ok(await issue(m));
  await owner(trial+'/control','PUT',{state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1});
  const send=async(p,method,body)=>{const r=await user(p,m.device,method,body);ok(r);return r.body;},read=p=>send(p,'GET');
  const columns=people+7,s=createSection({name:'架空境界区画',rows:1,columns,axis:'horizontal',seatOrder:'forward',stagePosition:'top',lines:[{name:'A列',prefix:'A-',startNumber:1}]},{maxCells:4096});
  const model=numberInitial(s,Object.fromEntries(s.section.cells.map((c,i)=>['0,'+c.column,i<people?'seat':'unset'])),{maxCells:4096});
  stage='initial-'+people;const initial=await build(send,'initial',[model]),first=await preparePublication(read,send,m,'initial');await send('','PATCH',first.publish(1));await send('','PATCH',first.complete());
  const state=initialize();await send('event','PATCH',{commit:state.commit,'reception/0000000000':1});
  const proposal=numberedExtension([model],model.section.sectionId,{dimension:'columns',count:2,selections:{['0,'+columns]:'seat',['0,'+(columns+1)]:'unset'}});
  stage='addition-'+people;const added=await build(send,'added',proposal.models);assert.equal(added.meta.expectedParts,initial.meta.expectedParts+1);
  const proof=await prepareNumbered(read,send,m,'added',proposal.edit),oldHead=await read('head');
  const partial=proof.publish();delete partial['operations/'+proof.record.publicationOperationId];assert.equal((await user('',m.device,'PATCH',partial)).status,401);assert.deepEqual(await read('head'),oldHead);
  await send('','PATCH',proof.publish());await send('','PATCH',proof.complete());await send('numberProofs/'+proof.id,'DELETE');
  const view=await snapshot(read,async()=>({rows:{}})),actual=view.models[0];assert.equal(Object.keys(view.cells).length,columns+2);assert.equal(actual.seats.length,people+1);
  for(const old of model.seats)assert.deepEqual(actual.seats.find(x=>x.seatId===old.seatId),old);
  assert.equal(new Set(actual.seats.map(x=>x.seatId)).size,people+1);assert.equal(new Set(actual.seats.map(x=>x.prefix+x.number)).size,people+1);
  reports.push({people,initialCells:columns,addedCells:2,finalCells:columns+2,initialParts:initial.meta.expectedParts,finalParts:added.meta.expectedParts,
   partialPublicationRefused:true,oldSeatIdsAndFieldsPreserved:true,seatIdsAndNumbersUnique:true,attendeeRecords:0,realRegistrationAndQrNotTestedHere:true});
 }
}catch(e){failure={stage,code:e.code??e.name,message:e.message};console.error(JSON.stringify(failure));process.exitCode=1;}finally{clean=await cleanup();}
assert.deepEqual(before,hashes());fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/addition-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,cleanup:clean,...(failure?{failure}:{}),externalFirebaseConnected:false,productionImplementation:false,fullBusinessFreeTierVerified:false},null,2)+'\n');
console.log(JSON.stringify({additionGroups:reports.length,failure:failure??null,cleanup:clean}));
