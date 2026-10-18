import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {actor,human,data,fields,request as firestore,base as firestoreBase} from '../GD91-60/tests/transport.mjs';
import {generated} from '../GD91-126/contract-rules.mjs';import {session} from '../GD91-84/transport.mjs';
import {hash} from '../GD91-128/conversion.mjs';import {decode} from '../GD91-123/model.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {convert,step} from './images.mjs';
const root=new URL('./',import.meta.url),entries=['local.mjs','images.mjs','bootstrap.mjs','run-local.mjs','firebase.json'];
const before=sourceHashes(root,entries),project='demo-concert-seat-gd91-60',namespace=project+'-default-rtdb',run=randomUUID(),target='checks/'+run;
const reports=[],users=[],state={},metrics={requests:0,requestBodyBytes:0,responseBodyBytes:0};let cleanup,failure,phase='source-fixture';
const report=(id,facts)=>{reports.push({id,...facts});console.log(JSON.stringify({case:id,passed:true}));};
async function rest(p,token='owner',method='GET',body){
 assert(p==='.settings/rules'||p===target||p.startsWith(target+'/'),'isolated-target-only');
 const u=new URL('http://127.0.0.1:9100/'+p+'.json');u.searchParams.set('ns',namespace);if(token!=='owner')u.searchParams.set('auth',token);
 const encoded=body===undefined?undefined:JSON.stringify(body);metrics.requests++;metrics.requestBodyBytes+=Buffer.byteLength(encoded??'');
 const r=await fetch(u,{method,headers:{'content-type':'application/json',...(token==='owner'?{authorization:'Bearer owner'}:{})},body:encoded,signal:AbortSignal.timeout(30000)});
 const text=await r.text();metrics.responseBodyBytes+=Buffer.byteLength(text);return{status:r.status,body:JSON.parse(text)};
}
const owner=async(p,method='GET',body)=>{const r=await rest(p,'owner',method,body);assert.equal(r.status,200);return r.body;};
async function identity(){const h=await human(),d=await actor();users.push(h,d);h.claims=JSON.parse(Buffer.from(h.token.split('.')[1],'base64url'));const m={human:h,device:d};
 await owner(target+'/roles/'+h.uid,'PUT',{role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});
 await owner(target+'/devices/'+d.uid,'PUT',{schemaVersion:2,performanceId:run,deviceUid:d.uid,humanUid:h.uid,active:true,preparedRoleRevision:1});
 assert.equal((await rest(target+'/sessions/'+d.uid,h.token,'PUT',session(m,1,{performanceId:run}))).status,200,'human-session-issuance');return m;
}
const sourcePath=slot=>'poc006CompactShows/'+run+'/images/'+slot;
const sourceDoc=async p=>{const r=await firestore(firestoreBase+'/'+p,'owner');assert.equal(r.status,200);if(r.body.fields.payload){assert(typeof r.body.fields.payload.bytesValue==='string','source-payload-must-be-firestore-bytes');r.body.fields.payload={stringValue:r.body.fields.payload.bytesValue};}return data(r);};
try{
 await owner('.settings/rules','PUT',generated());await owner(target+'/control','PUT',{state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1});
 const m=await identity(),other=await identity(),normalRead=async p=>{const r=await rest(target+'/'+p,m.device.token);assert.equal(r.status,200);return r.body;};
 const normalWrite=async(p,method,body)=>{const r=await rest(target+'/'+p,m.device.token,method,body);assert.equal(r.status,200);return r.body;};
 const sources=[];
 for(let i=0;i<5;i++){
  const payload=Buffer.alloc(1000000,65+i).toString('base64'),meta={activeBank:'1',draftBank:'0',activeVersion:i+2,draftVersion:i+3};
  for(const [p,value]of [[sourcePath(i),meta],[sourcePath(i)+'/banks/1',{version:i+2,mimeType:'image/png',payload}]]){
   const encoded=fields(value);if(Object.hasOwn(value,'payload'))encoded.payload={bytesValue:value.payload};
   const r=await firestore(firestoreBase+'/'+p,'owner','PATCH',{fields:encoded});assert.equal(r.status,200);
  }
  sources.push({format:'poc006-compact-bytes-v1',slot:String(i),meta:await sourceDoc(sourcePath(i)),bank:await sourceDoc(sourcePath(i)+'/banks/1')});
 }
 const original=hash(sources),items=sources.map(s=>convert(s,randomUUID()));
 report('I01-source-export-and-byte-conversion',{slots:5,rawBytesPerSlot:1000000,sourceVersionsPreservedInManifest:true,sourceFixtureOwnerSeeded:true,imageDecodeVerified:false});
 let rejected=0;for(const mutate of [s=>s.format='poc006-seven-chunks-v1',s=>s.slot='5',s=>s.bank.version++,s=>s.bank.mimeType='application/pdf',s=>s.bank.payload=Buffer.alloc(1000001).toString('base64'),s=>s.bank.payload+='?',s=>s.bank.token='FAKE']){
  const s=structuredClone(sources[0]);mutate(s);assert.throws(()=>convert(s,randomUUID()));rejected++;
 }
 assert.equal(await owner(target+'/images'),null);report('I02-invalid-source-before-target-write',{rejectedInputs:rejected,targetStillEmpty:true,noAutomaticResizeOrFormatDowngrade:true});
 phase='bank-failure';await assert.rejects(()=>step(items[0],{read:normalRead,write:normalWrite,state,afterBank:async()=>{throw Error('injected-after-bank');}}),/injected-after-bank/);
 assert.equal(await normalRead('images/0/head'),null);assert.equal(state['0'].phase,'staged');
 assert.equal((await rest(target+'/images/0/head',other.device.token)).body,null);
 report('I03-staging-interruption',{unpublishedHeadRemainsEmpty:true,sameOperationPlanPreservedInRam:true});
 phase='resume';await step(items[0],{read:normalRead,write:normalWrite,state});
 await assert.rejects(()=>step(items[1],{read:normalRead,write:normalWrite,state,afterPublish:async()=>{throw Error('injected-lost-response');}}),/injected-lost-response/);
 const beforeResume=metrics.requests;const resumed=await step(items[1],{read:normalRead,write:normalWrite,state});assert(resumed.reused);
 report('I04-resume-and-lost-response',{stagedBankReused:true,committedOperationReadBack:true,duplicatePublicationWrites:0,resumeReadRequests:metrics.requests-beforeResume});
 phase='revoked-device';await owner(target+'/devices/'+m.device.uid+'/active','PUT',false);
 await assert.rejects(()=>step(items[2],{read:normalRead,write:normalWrite,state}));assert.equal(await owner(target+'/images/2'),null);
 assert.equal((await rest(target+'/images/0/head',other.device.token)).status,200);
 await owner(target+'/devices/'+m.device.uid+'/active','PUT',true);
 report('I05-device-stop',{revokedImporterDenied:true,nextSlotNotWritten:true,otherApprovedDeviceContinues:true,restartIsOwnerFixtureOnly:true});
 phase='complete';for(let i=2;i<5;i++)await step(items[i],{read:normalRead,write:normalWrite,state});
 for(const item of items){const p=await normalRead('images/'+item.slot+'/banks/a');assert.deepEqual(decode(p),Buffer.from(sources[Number(item.slot)].bank.payload,'base64'));assert.equal(Object.keys(await owner(target+'/images/'+item.slot+'/operations')).length,1);}
 assert.equal(Object.values(state).filter(s=>s.phase==='verified').length,5);
 assert.equal(hash(sources),original);for(const s of sources){assert.deepEqual(await sourceDoc(sourcePath(s.slot)),s.meta);assert.deepEqual(await sourceDoc(sourcePath(s.slot)+'/banks/1'),s.bank);}
 report('I06-five-slot-normal-publication',{normalImagePublicationAndReadback:true,oneOperationPerSlot:true,all5000000OriginalBytesPreserved:true,sourceUnchanged:true,oldAuthorizationNotImported:true});
 phase='rollback';await owner(target+'/roles/'+m.human.uid+'/active','PUT',false);assert.equal((await rest(target+'/images/0/head',m.device.token)).status,401);
 assert.equal((await rest(target+'/images/0/head',other.device.token)).status,200);
 assert.equal(Object.keys(await owner(target+'/images')).length,5);assert.equal(hash(sources),original);
 report('I07-stop-with-preservation',{stoppedIdentityDenied:true,importedImagesAndSourcePreserved:true,automaticSourceResume:false});
}catch(e){failure={phase,code:e.code??e.name,message:e.message.slice(0,500)};process.exitCode=1;}
finally{
 try{
  await owner('.settings/rules','PUT',{rules:{'.read':false,'.write':false}});await owner(target,'DELETE');
  const cleared=await fetch('http://127.0.0.1:8181/emulator/v1/projects/'+project+'/databases/(default)/documents',{method:'DELETE'});assert.equal(cleared.status,200);
  for(const u of users)assert.equal((await firestore('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-api-key',null,'POST',{idToken:u.token})).status,200);
  const remaining=await firestore('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:query','owner','POST',{});assert.equal(remaining.status,200);
  cleanup={denyRulesInstalled:true,targetEmpty:(await owner(target))===null,sourceDocumentsCleared:true,authUsersRemaining:(remaining.body.userInfo??[]).length};
 }catch(e){cleanup={failed:true,code:e.code??e.name};process.exitCode=1;}
 const after=sourceHashes(root,entries);assert.deepEqual(before,after);fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
 fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,cleanup,...(failure?{failure}:{}),metrics,externalFirebaseConnected:false,allBusinessMigrationVerified:false,sourceInactiveBanksConverted:false,sourceClosedStateConverted:false,productionImplementation:false,credentialValuesPersisted:false},null,2)+'\n');
 console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup}));
}
process.exit(process.exitCode??0);
