import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID,createHash,webcrypto} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {chromium} from '../POC-001/node_modules/playwright/index.mjs';
import {fixture,freeze,readSnapshot,clean as cleanLegacy,t} from '../GD91-128/legacy.mjs';
import {human as newHuman} from '../GD91-60/tests/transport.mjs';
import {convert,compare} from '../GD91-128/conversion.mjs';import {generated} from '../GD91-126/contract-rules.mjs';
import {session} from '../GD91-84/transport.mjs';import {command} from '../GD91-126/model.mjs';import {prepare} from '../GD91-91/sdk-adapter.mjs';import {createReferences} from '../GD91-92/references.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';
import {create as createBackup,restoreCheck} from '../GD91-132/format.mjs';
const root=new URL('./',import.meta.url),files=['local.mjs','browser.mjs','browser.html','bootstrap.mjs','run-local.mjs','generate.mjs','firebase.json','node_modules/.cache/storage.mjs','node_modules/.cache/firestore.rules','node_modules/.cache/deny.rules.json','../GD91-129/browser.mjs','../GD91-130/local.mjs','../GD91-130/generate.mjs','../GD91-132/format.mjs'];
const before=sourceHashes(root,files),run=randomUUID(),target='checks/'+run,namespace='demo-concert-seat-gd91-60-default-rtdb',reports=[];
const cache=fileURLToPath(new URL('node_modules/.cache/',root)),profile=path.join(cache,'sdk-switch-'+randomUUID());let vite,context,page,failure,cleanup,phase='fixture',externalRequests=0;
const report=(id,facts)=>{reports.push({id,...facts});console.log(JSON.stringify({case:id,passed:true}));};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function rest(p,token='owner',method='GET',body){assert(p==='.settings/rules'||p===target||p.startsWith(target+'/'));const u=new URL('http://127.0.0.1:9200/'+p+'.json');u.searchParams.set('ns',namespace);if(token!=='owner')u.searchParams.set('auth',token);
 const r=await fetch(u,{method,headers:{'content-type':'application/json',...(token==='owner'?{authorization:'Bearer owner'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return{status:r.status,body:await r.json()};}
const owner=async(p,method='GET',body)=>{const r=await rest(p,'owner',method,body);assert.equal(r.status,200);return r.body;};
const call=(api,name,value)=>page.evaluate(({api,name,value})=>window[api][name](value),{api,name,value});
try{
 const setup=await fixture(),f=setup.f;phase='old-sdk';
 vite=spawn(process.execPath,['poc/POC-004/node_modules/vite/bin/vite.js','--config','poc/GD91-86/vite.config.mjs','--port','4184'],{windowsHide:true,stdio:'ignore'});
 let ready=false;for(let i=0;i<80&&!ready;i++){try{ready=(await fetch('http://127.0.0.1:4184/poc/GD91-133/browser.html')).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,250));}assert(ready);
 context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true});await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname)){externalRequests++;return route.abort();}return route.continue();});
 phase='browser-module';page=await context.newPage();await page.goto('http://127.0.0.1:4184/poc/GD91-133/browser.html');await page.waitForFunction(()=>window.sdkSwitch);
 phase='old-sdk-actor';const oldDevice=await call('sdkSwitch','old'),originalDevice=await t.stored(f,'devices/'+f.manager.uid),originalSession=await t.stored(f,'sessions/'+f.manager.uid);
 await t.seed(t.path(f,'devices/'+oldDevice.uid),{...originalDevice,deviceUid:oldDevice.uid});await t.seed(t.path(f,'sessions/'+oldDevice.uid),{...originalSession,deviceUid:oldDevice.uid});
 f.deviceDeclarations.push({deviceUid:oldDevice.uid,pendingOperations:[],unsentEvents:0});
 phase='old-sdk-read';const oldPath=t.path(f,'versions/current'),version=await call('sdkSwitch','readOld',oldPath),operation=await call('sdkSwitch','readOld',t.path(f,'operations/'+version.operationId));
 phase='new-sdk-actor';const device=await call('sdkSwitch','prepareNext'),human=await newHuman(),m={device,human:{...human,claims:JSON.parse(Buffer.from(human.token.split('.')[1],'base64url'))}};
 assert.notEqual(device.uid,oldDevice.uid);assert.notEqual(human.uid,f.person.uid);

 phase='shared-plan';const shared=await t.draftPlan(f,{formatVersion:1,models:[f.next.model],sourceBaseVersions:version.values});phase='shared-save';await t.apply(f,shared);
 phase='shared-decrypt';const decryptedShared=await t.decryptDraft(shared);
 assert.equal(shared.key.extractable,false);await assert.rejects(()=>webcrypto.subtle.exportKey('raw',shared.key));
 const corrupt=structuredClone(shared.draft),bytes=Buffer.from(corrupt.payload.ciphertext,'base64');bytes[0]^=1;corrupt.payload.ciphertext=bytes.toString('base64');
 await assert.rejects(()=>t.decryptDraft(shared,corrupt));
 // 実際の旧共有暗号文を、旧鍵を抽出せず復号し、新本人用の再確認待ち案へ変換する。
 phase='indexeddb-seed';const seeded=await call('migration','seed',{oldScope:f.show+'/'+f.person.uid+'/'+oldDevice.uid,newScope:f.show+'/'+human.uid+'/'+device.uid,
  draft:{format:1,baseVersions:version.values,content:decryptedShared,operationId:shared.id},pending:{id:version.operationId,contentHash:digest(operation),status:'unknown'}}),initial=await call('migration','inspect');
 assert.equal(seeded.pending.contentHash,digest(operation));
 const resolved=await call('sdkSwitch','readOld',t.path(f,'operations/'+version.operationId)),resolvedOldResult={status:'committed',id:version.operationId,contentHash:digest(resolved)};
 assert.equal(resolvedOldResult.contentHash,seeded.pending.contentHash);assert.equal(resolved.operationId,seeded.pending.id);
 report('S01-old-sdk-and-indexeddb',{realOldSdkRead:true,encryptedDraftAndUnknownOperationStored:true,realOldSdkResultLookupMatched:true,realLegacySharedCiphertextSaved:true,legacyKeyNotExported:true,tamperedLegacyDraftRejected:true,originalVersionPreserved:true,additionalOldDevicePreparationOwnerSeeded:true});
 phase='fence-export';await freeze();assert((await call('sdkSwitch','fenceOld',oldPath)).denied);
 
 const source=await readSnapshot(f),backupContext={role:'owner',online:true,now:Date.now(),reauthAt:Date.now()-1000},ledger={sourceEnvironment:source.versions.environmentId,targetEmpty:true,deletedPeople:source.deletions};
 const backup=await createBackup(source,backupContext),restored=await restoreCheck(backup.wrapper,backup.recoveryKey,backupContext,ledger);
 const recovered={format:1,...restored.eventsAndSettings,pendingOperations:[],unsentEvents:0,reconciliation:source.reconciliation};assert.deepEqual(recovered,source);
 const closed=structuredClone(source);closed.control.state='closed';const closedBackup=await createBackup(closed,backupContext);
 const preserved=await restoreCheck(closedBackup.wrapper,closedBackup.recoveryKey,backupContext,{...ledger,closed:true,closeOperationId:closed.control.operationId});
 assert.equal(preserved.eventsAndSettings.control.state,'closed');assert.equal(await owner(target),null);
 await assert.rejects(()=>convert(closed,randomUUID()),/unsupported-source-state/);assert.equal(await owner(target),null);
 const snapshot=await convert(recovered,randomUUID());compare(source,snapshot);
 assert.deepEqual(source.sharedDrafts[shared.id].payload,shared.draft.payload);

 const rules=generated();await owner('.settings/rules','PUT',rules);await owner(target,'PUT',{...snapshot,control:{state:'stopped',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1}});
 compare(source,await owner(target));const unchanged=(await owner(target+'/event/commit')).revision;
 report('S02-frozen-source-and-target',{oldSdkServerReadDenied:true,newTargetSavedAndCompared:true,allSourceDevicesReconciled:true,bd08FormatCandidateRoundtrip:true,dedicatedBackupKey:true,allBusinessAreasCompared:true,closedOpaqueSourcePreservedAndActivationRejected:true,closedStatePreconditionSeeded:true,legacySharedCiphertextPreserved:true});
 phase='new-identity';assert.equal((await rest(target+'/event/commit',device.token)).status,401);
 await owner(target+'/roles/'+human.uid,'PUT',{role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});
 await owner(target+'/devices/'+device.uid,'PUT',{schemaVersion:2,performanceId:run,deviceUid:device.uid,humanUid:human.uid,active:true,preparedRoleRevision:1});
 assert.equal((await rest(target+'/sessions/'+device.uid,human.token,'PUT',session(m,1,{performanceId:run}))).status,200);
 assert.deepEqual((await rest(target+'/head',device.token)).body,snapshot.head);
 phase='storage-switch';const options={format:2,targetVerified:true,newIdentityPrepared:true,result:resolvedOldResult,unsentEvents:0,targetBaseRevision:unchanged};
 await assert.rejects(()=>call('migration','migrate',{...options,result:{...options.result,status:'notFound'}}));assert.deepEqual(await call('migration','inspect'),initial);
 await assert.rejects(()=>call('migration','migrate',{...options,abort:true}));assert.deepEqual(await call('migration','inspect'),initial);
 
 await call('migration','migrate',options);const migrated=await call('migration','inspect');assert.equal(migrated.oldHash,seeded.oldHash);
 assert(migrated.newDraft.needsReview&&!migrated.newDraft.automaticallyCommitted);assert.deepEqual(migrated.newDraft.content,decryptedShared);
 assert.equal(migrated.newDraft.sourceOperationId,shared.id);assert.deepEqual(migrated.newDraft.sourceBaseVersions,version.values);

 assert((await call('sdkSwitch','next')).selected);
 assert.equal((await owner(target+'/event/commit')).revision,unchanged);assert.equal((await call('sdkSwitch','stats')).writes,0);
 report('S03-same-browser-adapter-selection',{notFoundAndTransactionAbortPreserveOldDraft:true,newIdentityUnpreparedDenied:true,noAutomaticBusinessWrites:true});
 phase='new-sdk-read';
 const observed=await call('sdkSwitch','readNew',target+'/head');assert.deepEqual(observed,snapshot.head);
 const newState=structuredClone(snapshot.event);newState.commit=await call('sdkSwitch','readNew',target+'/event/commit');
 for(const category of ['people','profiles','tickets'])newState[category][setup.active]=await call('sdkSwitch','readNew',target+'/event/'+category+'/'+setup.active);
 assert.equal(newState.tickets[setup.active].credentialRef,source.tickets[setup.active].activeCredentialId);
 report('S04-real-new-sdk-after-repreparation',{newHumanAndDevice:true,normalNewSdkRead:true,qualificationIdsPreserved:true});
 phase='new-sdk-write';const user=(p,d,method='GET',body)=>rest(target+(p?'/'+p:''),d.token,method,body),refs=createReferences({user,inspect:async()=>{throw Error('ack-only');}});
 await refs.acquire(m,snapshot.head);let record=(await user('references/'+m.referenceId,device)).body;
 const body=command(m,newState,snapshot.head,'payment',setup.active,{paid:false}),pending=prepare(m,body);record=await refs.reserveKnown(m,pending,record);
 const committed=await page.evaluate(({p,body})=>window.sdkSwitch.write(p,body),{p:target+'/event',body});await refs.clearAcknowledged(m,pending,record,{status:200,body:{['operations/'+pending.operationId]:committed}});
 assert.equal((await owner(target+'/event/commit')).revision,unchanged+1);assert.equal((await owner(target+'/event/profiles/'+setup.active)).paid,false);
 assert.equal((await call('migration','inspect')).oldHash,seeded.oldHash);assert.equal((await call('sdkSwitch','stats')).writes,1);
 report('S05-explicit-new-sdk-save',{realSdkMultiPathUpdate:true,exactNextRevision:true,sameOperationResultCompared:true,oldDraftPreserved:true,convertedSharedDraftNeedsReview:true});
 phase='rollback';await owner(target+'/sessions/'+device.uid,'PATCH',{active:false});assert.equal((await rest(target+'/event/commit',device.token)).status,401);
 assert.equal((await t.request(t.base+'/'+oldPath,oldDevice.token)).status,403);
 assert.equal((await owner(target+'/event/operations/'+pending.operationId)).kind,'payment');assert.equal((await call('migration','inspect')).oldHash,seeded.oldHash);
 report('S06-both-backends-fenced',{oldAndNewNormalReadsDenied:true,newOperationAndOldDraftPreserved:true,unsafeLegacyNotResumed:true});
 assert.equal(externalRequests,0);
}catch(e){failure={phase,code:e.code??e.name,...failureDiagnostic(e),...(String(e.message).match(/(?:auth|database|firestore)\/[a-z-]+/)?{firebaseCode:String(e.message).match(/(?:auth|database|firestore)\/[a-z-]+/)[0]}:{})};console.log(JSON.stringify({failure}));process.exitCode=1;}
finally{
 if(page)await call('sdkSwitch','close').catch(()=>{});if(context)await context.close();if(vite&&vite.exitCode===null)execFileSync('taskkill',['/PID',String(vite.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 await owner('.settings/rules','PUT',{rules:{'.read':false,'.write':false}});await owner(target,'DELETE');const rtdb={rulesClosed:true,trialRootEmpty:(await owner(target))===null};const firestore=await cleanLegacy();
 let isolatedProfileRemoved=false;if(fs.existsSync(profile)){const a=fs.realpathSync(cache),b=fs.realpathSync(profile);assert(path.dirname(b)===a&&path.basename(b).startsWith('sdk-switch-'));try{fs.rmSync(b,{recursive:true,maxRetries:10,retryDelay:200});isolatedProfileRemoved=true;}catch(e){console.log(JSON.stringify({profileCleanupCode:e.code}));}}
 cleanup={rtdb,firestore,isolatedProfileRemoved};
}
const after=sourceHashes(root,files);assert.deepEqual(before,after);fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,cleanup,...(failure?{failure}:{}),externalRequests,
 externalFirebaseConnected:false,sameBrowserSdkAndIndexedDbVerified:!failure,allBusinessMigrationVerified:false,formalBackupFormatCandidateVerified:true,formalBackupImplementationAccepted:false,closedBusinessSchemaConverted:false,credentialValuesPersisted:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,cleanup,failure:failure??null}));process.exit(process.exitCode??0);
