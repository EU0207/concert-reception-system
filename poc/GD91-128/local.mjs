import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fixture,freeze,readSnapshot,clean as cleanLegacy,t} from './legacy.mjs';
import {human as newHuman} from '../GD91-60/tests/transport.mjs';
import {convert,compare,hash} from './conversion.mjs';
import {generated as previous} from '../GD91-126/contract-rules.mjs';
import {manager} from '../GD91-84/auth-rules.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {seal,open,key} from '../GD91-124/migration.mjs';
import {session} from '../GD91-84/transport.mjs';
import {command} from '../GD91-126/model.mjs';
import {createReferences} from '../GD91-92/references.mjs';
import {prepare} from '../GD91-91/sdk-adapter.mjs';
import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const {getDatabase,connectDatabaseEmulator,ref,get,goOffline}=require('firebase/database');
const project='demo-concert-seat-gd91-60',namespace=project+'-default-rtdb',run=randomUUID(),target='checks/'+run;
const root=new URL('./',import.meta.url),files=['local.mjs','legacy.mjs','conversion.mjs','bootstrap.mjs','run-local.mjs','firebase.json','../GD91-73/generate.mjs','node_modules/.cache/firestore.rules','node_modules/.cache/deny.rules.json'];
const before=sourceHashes(root,files),reports=[];let app,db,failure,oldClean,newClean,phase='legacy-fixture';
const report=(id,facts)=>{reports.push({id,...facts});console.log(JSON.stringify({case:id,passed:true}));};
async function rest(path,token='owner',method='GET',body){
  assert(path==='.settings/rules'||path===target||path.startsWith(target+'/'));
  const url=new URL('http://127.0.0.1:9100/'+path+'.json');url.searchParams.set('ns',namespace);if(token!=='owner')url.searchParams.set('auth',token);
  const response=await fetch(url,{method,headers:{'content-type':'application/json',...(token==='owner'?{authorization:'Bearer owner'}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  return{status:response.status,body:await response.json()};
}
const owner=async(path,method='GET',body)=>{const r=await rest(path,'owner',method,body);assert.equal(r.status,200);return r.body;};
try{
  const setup=await fixture(),f=setup.f;phase='frozen-export';await freeze();
  const normal=await t.request(t.base+'/'+t.path(f,'versions/current'),f.manager.token);assert.equal(normal.status,403);
  const source=await readSnapshot(f),sourceHash=hash(source);
  report('M01-real-firestore-export',{normalLegacySourceReadsFenced:true,sections:source.layouts.length,people:Object.keys(source.people).length,
    operations:Object.keys(source.operations).length,buyerNameAndArrivalPreconditionsOwnerSeeded:true,exportAuthOrKeys:false});
  const originalVersion=source.versions;
  await assert.rejects(()=>readSnapshot(f,{between:()=>t.seed(t.path(f,'versions/current'),{...originalVersion,operationId:randomUUID(),values:{...originalVersion.values,commit:originalVersion.values.commit+1}})}),/source-version-changed/);
  await t.seed(t.path(f,'versions/current'),originalVersion);assert.equal(hash(await readSnapshot(f)),sourceHash);
  report('M02-version-fence',{mixedVersionRejected:true,originalRestoredAndCompared:true});
  phase='conversion';const exportId=randomUUID(),snapshot=await convert(source,exportId);compare(source,snapshot);
  for(const mutate of [s=>s.format=99,s=>s.pendingOperations.push({id:randomUUID(),state:'unknown'}),s=>s.unsentEvents=1,
    s=>delete s.buyers[Object.values(s.people)[0].buyerId],s=>s.deletions[Object.keys(s.people)[0]]={deleted:true}]){
    const bad=structuredClone(source);mutate(bad);await assert.rejects(()=>convert(bad,exportId));
  }
  assert.equal(hash(source),sourceHash);report('M03-conversion-and-rejections',{...compare(source,snapshot),invalidInputs:5,originalUnchanged:true});
  const cryptoKey=await key(),backup=await seal(source,cryptoKey),draft={format:1,baseVersions:source.versions,operationId:randomUUID(),contentHash:sourceHash};
  const encryptedDraft=await seal(draft,cryptoKey);assert.deepEqual(await open(backup,cryptoKey),source);
  assert.deepEqual(await open(encryptedDraft,cryptoKey),draft);assert.equal(cryptoKey.extractable,false);
  report('M04-encrypted-preservation',{sourceAndDraftPreserved:true,nonextractableKey:true,backupFormat:'isolated AES-GCM envelope; formal BD-08 package unverified',indexedDbVerified:false});
  phase='target-staging';const rules=previous();rules.rules.checks.$run.migration={'.read':manager,'.write':false};await owner('.settings/rules','PUT',rules);
  const control={state:'stopped',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1};
  const expectedHead=snapshot.head;delete snapshot.head;
  await owner(target,'PUT',{...snapshot,control});const staged=await owner(target);assert.equal(staged.head,undefined);
  staged.head=expectedHead;const facts=compare(source,staged);
  app=initializeApp({projectId:project,apiKey:'demo-api-key',databaseURL:'https://'+namespace+'.firebaseio.com'},'GD91-128-'+run);
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9291',{disableWarnings:true});
  const signed=await signInAnonymously(auth),token=await signed.user.getIdToken();db=getDatabase(app);connectDatabaseEmulator(db,'127.0.0.1',9100);
  const person=await newHuman('google.com'),claims=JSON.parse(Buffer.from(person.token.split('.')[1],'base64url'));
  const m={device:{uid:signed.user.uid,token},human:{uid:person.uid,token:person.token,claims}};
  assert.notEqual(m.device.uid,f.manager.uid);assert.notEqual(m.human.uid,f.person.uid);
  assert.equal((await rest(target+'/event/commit',token)).status,401);
  report('M05-real-rtdb-staging',{...facts,targetReadbackCompared:true,headUnpublished:true,unpreparedIdentityDenied:true,legacyAuthNotCopied:true});
  phase='activate';await owner(target+'/head','PUT',expectedHead);await owner(target+'/migration/state','PUT','validated');
  await owner(target+'/roles/'+m.human.uid,'PUT',{role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});
  await owner(target+'/devices/'+m.device.uid,'PUT',{schemaVersion:2,performanceId:run,deviceUid:m.device.uid,humanUid:m.human.uid,active:true,preparedRoleRevision:1});
  assert.equal((await rest(target+'/sessions/'+m.device.uid,m.human.token,'PUT',session(m,1,{performanceId:run}))).status,200);
  const sdkRead=async path=>(await get(ref(db,target+'/'+path))).val();
  assert.deepEqual(await sdkRead('head'),expectedHead);
  assert.equal((await sdkRead('event/tickets/'+setup.active)).credentialRef,source.tickets[setup.active].activeCredentialId);
  assert.equal((await sdkRead('event/people/'+setup.cancelled)).active,false);
  assert.equal((await sdkRead('event/tickets/'+setup.cancelled)).cycleClosed,true);
  assert.deepEqual(await sdkRead('migration/reception'),source.reception);
  report('M06-prepared-sdk-read',{newIdentityReprepared:true,realSdkTargetRead:true,activeAndRevokedQualificationsPreserved:true,arrivalPreserved:true,oldBackendRemainsFenced:true});
  phase='new-business-write';const user=(p,d,method='GET',body)=>rest(target+(p?'/'+p:''),d.token,method,body);
  const refs=createReferences({user,inspect:async()=>{throw Error('acknowledged-only');}});await refs.acquire(m,expectedHead);
  let record=(await user('references/'+m.referenceId,m.device)).body;
  const body=command(m,staged.event,expectedHead,'payment',setup.active,{paid:false});const pending=prepare(m,body);record=await refs.reserveKnown(m,pending,record);
  const ack=await user('event',m.device,'PATCH',body);assert.equal(ack.status,200);record=await refs.clearAcknowledged(m,pending,record,ack);
  assert.equal((await sdkRead('event/profiles/'+setup.active)).paid,false);
  assert.equal((await sdkRead('event/commit')).revision,source.versions.values.commit+1);
  assert.equal((await t.request(t.base+'/'+t.path(f,'versions/current'),f.manager.token)).status,403);
  report('M07-single-target-operation',{normalPaymentAfterImport:true,exactNextRevision:true,sourceNormalAccessDenied:true,newOperationIdDistinct:true});
  phase='rollback';await owner(target+'/sessions/'+m.device.uid,'PATCH',{active:false});assert.equal((await rest(target+'/event/commit',token)).status,401);
  assert.equal((await t.request(t.base+'/'+t.path(f,'versions/current'),f.manager.token)).status,403);
  const after=await owner(target);assert.equal(after.event.profiles[setup.active].paid,false);compare(source,{...staged,migration:after.migration});
  assert.equal(hash(await readSnapshot(f)),sourceHash);assert.deepEqual(await open(encryptedDraft,cryptoKey),draft);
  report('M08-rollback-after-new-fact',{bothNormalWritersStopped:true,newPaymentAndOperationPreserved:true,sourceAndDraftPreserved:true,
    unsafeFirestoreNotResumed:true,automaticRollback:false,recoveryDecisionRequired:true});
}catch(e){failure={phase,code:e.code??e.name,...failureDiagnostic(e)};process.exitCode=1;}
finally{
  if(db)goOffline(db);if(app)await deleteApp(app);
  await owner('.settings/rules','PUT',{rules:{'.read':false,'.write':false}});const closed=await owner('.settings/rules');
  await owner(target,'DELETE');newClean={rulesClosed:closed.rules['.read']===false&&closed.rules['.write']===false,trialRootEmpty:(await owner(target))===null};
  oldClean=await cleanLegacy();
}
const after=sourceHashes(root,files);assert.deepEqual(before,after);
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,
  cleanup:{firestore:oldClean,rtdb:newClean},...(failure?{failure}:{}),externalFirebaseConnected:false,
  productionImplementation:false,realDeviceAcceptance:false,formalBackupFormatVerified:false,allBusinessMigrationVerified:false,
  productionOrActualAttendeeDataUsed:false,credentialValuesPersisted:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,cleanup:{firestore:oldClean,rtdb:newClean},failure:failure??null}));
process.exit(process.exitCode??0);
