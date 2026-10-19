import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {actor,session} from '../GD91-84/transport.mjs';import {generated} from '../GD91-126/contract-rules.mjs';
import {prepare,publish,decode} from '../GD91-123/model.mjs';import {hash} from '../GD91-128/conversion.mjs';
import {exportBundle,compare} from './bundle.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),entries=['probe.mjs','bundle.mjs','capacity.mjs','run-local.mjs','firebase.json'],before=sourceHashes(root,entries);
const namespace='demo-concert-seat-gd91-84-import-target',reports=[],meter={requests:0,requestBodyBytes:0,responseBodyBytes:0};let targetPath,cleanup,failure;
const report=(id,facts)=>{reports.push({id,...facts});console.log(JSON.stringify({case:id,passed:true}));};
async function rest(path,token='owner',method='GET',body){
 assert(path==='.settings/rules'||path===targetPath||path.startsWith(targetPath+'/'));
 const u=new URL('http://127.0.0.1:9000/'+path+'.json');u.searchParams.set('ns',namespace);if(token!=='owner')u.searchParams.set('auth',token);
 const text=body===undefined?undefined:JSON.stringify(body);meter.requests++;meter.requestBodyBytes+=Buffer.byteLength(text??'');
 const r=await fetch(u,{method,headers:{'content-type':'application/json',...(token==='owner'?{authorization:'Bearer owner'}:{})},body:text,signal:AbortSignal.timeout(30000)});
 const received=await r.text();meter.responseBodyBytes+=Buffer.byteLength(received);return{status:r.status,body:JSON.parse(received)};
}
const owner=async(path,method='GET',body)=>{const r=await rest(path,'owner',method,body);assert.equal(r.status,200);return r.body;};
globalThis.__gd145Images=async({m,user})=>{
 for(let i=0;i<5;i++){const p=prepare(Buffer.alloc(1000000,65+i),'image/png');assert.equal((await user('images/'+i+'/banks/a',m.device,'PUT',p)).status,200);assert.equal((await user('images/'+i,m.device,'PATCH',publish(String(i),'a',p))).status,200);}
};
globalThis.__gd145Migration=async({source,sourceOwner,sourceRequest,trial,manager})=>{
 targetPath=trial;const original=hash(source),bundle=exportBundle(source);let phase='coverage';
 try{
  assert.equal(Object.keys(source.devices).length,8);assert.equal(Object.keys(bundle.areas.images).length,5);
  let rejected=0;for(const change of [r=>r.unknownArea={data:'FAKE'},r=>r.control.businessSchemaVersion=99,r=>r.control.state='preparing',r=>r.actualTotals.part0.total++,r=>r.actuals[Object.keys(r.actuals)[0]].name='FAKE',r=>r.private={FAKE:{ciphertext:'FAKE'}},r=>r.references.FAKE={pendingOperationId:'FAKE'},r=>r.event.profiles['person-0'].idToken='FAKE',r=>r.images['0'].banks.a.privateKey='FAKE']){const bad=structuredClone(source);change(bad);assert.throws(()=>exportBundle(bad));rejected++;}
  report('N01-native-closed-coverage',{...compare(bundle,bundle.areas),rejectedInputs:rejected,sourceClosedThroughNormalOperations:true,sourceBootstrapAndEndedStateOwnerSeeded:true,encryptedDraftUnsupported:true});
  phase='source-fence';assert.equal((await sourceRequest('.settings/rules',{token:'owner',method:'PUT',body:{rules:{'.read':false,'.write':false}}})).status,200);
  assert.equal((await sourceRequest(trial+'/actuals/person-0',{token:manager.device.token})).status,401);
  await owner('.settings/rules','PUT',{rules:{'.read':false,'.write':false}});assert.equal(await owner(targetPath),null);
  const names=Object.keys(bundle.areas),progress={done:[],sourceHash:bundle.sourceHash};
  for(const name of names.slice(0,2)){await owner(targetPath+'/'+name,'PUT',bundle.areas[name]);progress.done.push(name);}
  assert.equal((await rest(targetPath+'/head',manager.device.token)).status,401);
  assert.equal(await owner(targetPath+'/actuals'),null);
  report('N02-partial-import-fenced',{stagingInterruptedAfterAreas:2,targetNotNormallyReadable:true,sourceNormalAccessFenced:true,partialImportNotActivated:true,operatorImportUsesEmulatorOwner:true});
  phase='resume';for(const name of names){const old=await owner(targetPath+'/'+name);if(old!==null)assert.equal(hash(old),bundle.hashes[name]);else await owner(targetPath+'/'+name,'PUT',bundle.areas[name]);}
  const restored=await owner(targetPath);compare(bundle,restored);assert.equal(hash(await sourceOwner(trial)),original);
  report('N03-all-areas-readback',{...compare(bundle,restored),noSourceWrites:true,oneAreaCopyPerPresentArea:true,resumeProgressIsRam:true,rawSourceIdentityNotCopied:true});
  phase='new-identity';await owner('.settings/rules','PUT',generated());
  assert.equal((await rest(targetPath+'/actuals/person-0',manager.device.token)).status,401);
  const h=await actor('google.com'),d=await actor(),m={human:h,device:d},performanceId=trial.split('/')[1];
  assert.notEqual(h.uid,manager.human.uid);assert.notEqual(d.uid,manager.device.uid);
  await owner(targetPath+'/roles/'+h.uid,'PUT',{role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});
  await owner(targetPath+'/devices/'+d.uid,'PUT',{schemaVersion:2,performanceId,deviceUid:d.uid,humanUid:h.uid,active:true,preparedRoleRevision:1});
  assert.equal((await rest(targetPath+'/sessions/'+d.uid,h.token,'PUT',session(m,1,{performanceId}))).status,200);
  const normal=async p=>{const r=await rest(targetPath+'/'+p,d.token);assert.equal(r.status,200,'target-normal-read:'+p);return r.body;};
  assert.equal((await rest(targetPath,d.token,'PUT',await owner(targetPath))).status,401,'ordinary-client-root-import-denied');
  for(const id of Object.keys(bundle.areas.actuals))assert.deepEqual(await normal('actuals/'+id),source.actuals[id]);
  for(let i=0;i<5;i++){const head=await normal('images/'+i+'/head'),p=await normal('images/'+i+'/banks/'+head.bank);assert.deepEqual(decode(p),decode(source.images[i].banks[source.images[i].head.bank]));}
  assert.equal((await normal('control')).state,'closed');
  report('N04-reprepared-native-reads',{newGoogleHumanAndAnonymousDevice:true,newSessionNormallyIssued:true,roleAndDeviceAreOwnerFixtures:true,oldIdentityDenied:true,allNamesAndArrivalsReadable:true,imagesNormallyReadable:true,closedStatePreserved:true,ordinaryClientCannotImportRoot:true});
  phase='tamper-and-stop';const firstId=Object.keys(bundle.areas.event.operations)[0],oldOperation=bundle.areas.event.operations[firstId];
  assert(firstId);assert.equal((await rest(targetPath+'/event/operations/'+firstId,d.token,'PUT',{...oldOperation,kind:'FAKE-tamper'})).status,401);
  assert.deepEqual(await owner(targetPath+'/event/operations/'+firstId),oldOperation);
  assert.equal((await rest(targetPath+'/control',d.token,'PUT',{...source.control,state:'preparing'})).status,401);
  await owner(targetPath+'/devices/'+d.uid+'/active','PUT',false);assert.equal((await rest(targetPath+'/actuals/person-0',d.token)).status,401);
  assert.equal(hash(await sourceOwner(trial)),original);assert.equal((await owner(targetPath+'/actuals/person-0')).name,source.actuals['person-0'].name);
  report('N05-rollback-and-immutable-history',{oldOperationTamperDenied:true,closedCannotReopen:true,targetRevokedAndSourceFenced:true,sourceAndImportedFactsPreserved:true,automaticRollback:false});
 }catch(e){failure={phase,code:e.code??e.name,message:e.message.slice(0,500)};throw e;}
 finally{
  await owner('.settings/rules','PUT',{rules:{'.read':false,'.write':false}});await owner(targetPath,'DELETE');cleanup={targetDenyAllInstalled:true,targetEmpty:(await owner(targetPath))===null};
  const auth='http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
  const admin=async(p,body)=>{const r=await fetch(auth+p,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200,'auth-emulator-cleanup');return r.json();};
  const users=await admin('/projects/demo-concert-seat-gd91-84/accounts:query',{});
  for(const u of users.userInfo??[])await admin('/accounts:delete?key=demo-api-key',{localId:u.localId});
  cleanup.authUsersRemaining=((await admin('/projects/demo-concert-seat-gd91-84/accounts:query',{})).userInfo??[]).length;assert.equal(cleanup.authUsersRemaining,0);
  assert.deepEqual(before,sourceHashes(root,entries));fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
  fs.writeFileSync(new URL('artifacts/native-'+(process.env.GD101_PEOPLE??'4')+'-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:before,reports,cleanup,...(failure?{failure}:{}),meter,externalFirebaseConnected:false,sourceAndTargetAreDifferentLocalEmulatorNamespaces:true,additionalProductionDatabaseCreated:false,privilegedImportToolIsEmulatorFixture:true,legacyFirestoreClosedConverted:false,encryptedSharedDraftConverted:false,allBusinessMigrationVerified:false,productionImplementation:false,credentialValuesPersisted:false},null,2)+'\n');
 }
};
