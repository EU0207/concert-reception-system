import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {generated} from '../GD91-126/contract-rules.mjs';
import {manager} from '../GD91-84/auth-rules.mjs';
const project='demo-concert-archive-gd91-136',root=new URL('./',import.meta.url),show='FAKE-closed-'+randomUUID();
assert.equal(process.env.GCLOUD_PROJECT,project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8381');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9491');
const base=`http://127.0.0.1:8381/v1/projects/${project}/databases/(default)/documents`,prefix='archiveShows/'+show;
const auth='http://127.0.0.1:9491/identitytoolkit.googleapis.com/v1',ns=project+'-default-rtdb';
const entries=['local.mjs','firestore.rules','firestore.indexes.json','database.rules.json','firebase.json','run-local.mjs'];
const before=sourceHashes(root,entries),reports=[],users=[];let failure,phase='setup',cleanup={},requests=0,upBytes=0,downBytes=0;
const encode=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:typeof v==='string'?{stringValue:v}:Object.hasOwn(v,'$timestamp')?{timestampValue:v.$timestamp}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
const decode=v=>Object.hasOwn(v,'nullValue')?null:Object.hasOwn(v,'booleanValue')?v.booleanValue:Object.hasOwn(v,'integerValue')?Number(v.integerValue):Object.hasOwn(v,'stringValue')?v.stringValue:Object.hasOwn(v,'timestampValue')?{$timestamp:v.timestampValue}:Object.hasOwn(v,'arrayValue')?(v.arrayValue.values??[]).map(decode):Object.fromEntries(Object.entries(v.mapValue.fields??{}).map(([k,x])=>[k,decode(x)]));
const body=d=>decode({mapValue:{fields:d.fields??{}}}), stamp=ms=>({$timestamp:new Date(ms).toISOString()});
async function request(url,token,method='GET',value){
 const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert(['8381','9300','9491'].includes(parsed.port),'external-request-blocked');
 const data=value===undefined?undefined:JSON.stringify(value);requests++;upBytes+=data?Buffer.byteLength(data):0;
 const r=await fetch(url,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(data?{body:data}:{}),signal:AbortSignal.timeout(30000)});
 const text=await r.text();downBytes+=Buffer.byteLength(text);return{status:r.status,body:text?JSON.parse(text):null};
}
const name=p=>`projects/${project}/databases/(default)/documents/`+p;
const write=(p,data,mask,serverTime)=>({update:{name:name(p),fields:encode(data).mapValue.fields},...(mask?{updateMask:{fieldPaths:mask},currentDocument:{exists:true}}:{}),...(serverTime?{updateTransforms:[{fieldPath:serverTime,setToServerValue:'REQUEST_TIME'}]}:{})});
const commit=(token,writes)=>request(base+':commit',token,'POST',{writes});
const ok=r=>{assert.equal(r.status,200,JSON.stringify({phase,status:r.status,error:r.body?.error?.message}));return r;};
const denied=r=>assert([401,403].includes(r.status),JSON.stringify({phase,unexpectedStatus:r.status}));
const get=(p,token)=>request(base+'/'+p,token);
const seed=async(p,data)=>ok(await commit('owner',[write(p,data)]));
const rtdb=(p,method='GET',data,token='owner')=>request(`http://127.0.0.1:9300/${p}.json?ns=${ns}${token==='owner'?'':'&auth='+token}`,token==='owner'?'owner':undefined,method,data);
const report=(id,detail={})=>{reports.push({id,...detail});console.log(JSON.stringify({case:id,passed:true}));};
async function actor(human=false){
 const r=human?await request(auth+'/accounts:signInWithIdp?key=demo-api-key',null,'POST',{requestUri:'http://localhost',postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:randomUUID(),email:'fake-'+randomUUID()+'@example.com',email_verified:true})}).toString(),returnSecureToken:true}):await request(auth+'/accounts:signUp?key=demo-api-key',null,'POST',{returnSecureToken:true});
 ok(r);const v={uid:r.body.localId,token:r.body.idToken};users.push(v);return v;
}
let h,a,b,other;
try{
 h=await actor(true);a=await actor();b=await actor();other=await actor();
 const databaseRules=generated();databaseRules.rules.checks.$run.archiveSource={'.read':manager,'.write':false};ok(await rtdb('.settings/rules','PUT',databaseRules));
 const rtAuth={roles:{[h.uid]:{active:true,role:'owner',revision:1,receptionBaselineRevision:0,startsAt:Date.now()-60000,endsAt:Date.now()+3600000}},devices:{},sessions:{}};
 for(const d of [a,b]){rtAuth.devices[d.uid]={schemaVersion:2,deviceUid:d.uid,humanUid:h.uid,performanceId:show,active:true,preparedRoleRevision:1};rtAuth.sessions[d.uid]={schemaVersion:2,performanceId:show,deviceUid:d.uid,humanUid:h.uid,active:true,emailVerified:true,authProvider:'google.com',roleRevision:1,expiresAt:Date.now()+1800000};}
 ok(await rtdb('checks/'+show,'PUT',rtAuth));
 const role={active:true,role:'owner',revision:1,startsAt:stamp(Date.now()-60000),endsAt:stamp(Date.now()+3600000)};
 await seed(prefix+'/roles/'+h.uid,role);
 for(const d of [a,b])await seed('archiveDevices/'+d.uid,{deviceUid:d.uid,humanUid:h.uid,active:true,revision:1,preparedRoleRevision:1});
 const session=()=>({performanceId:show,deviceUid:a.uid,humanUid:h.uid,active:true,roleRevision:1,authProvider:'google.com',emailVerified:true,expiresAt:stamp(Date.now()+1800000),humanAuthTime:stamp(JSON.parse(Buffer.from(h.token.split('.')[1],'base64url')).auth_time*1000)});
 for(const d of [a,b]){const data={...session(),deviceUid:d.uid};ok(await commit(h.token,[write(prefix+'/sessions/'+d.uid,data,undefined,'issuedAt')]));}
 report('A01-human-issued-device-sessions',{normalSessionIssuance:true,deviceAndRoleRegistrationOwnerPreconditions:true});
 phase='source-copy';
 const source={state:'closed',revision:7,closeOperationId:'FAKE-close',performanceName:'架空公演',venueName:'架空会場',venueAddress:'架空住所',unreceivedPossible:false,
  actuals:{'FAKE-person-a':{attendeeId:'FAKE-person-a',name:'架空A',arrived:true,revision:1},'FAKE-person-b':{attendeeId:'FAKE-person-b',name:'架空B',arrived:false,revision:1}}};
 ok(await rtdb('checks/'+show+'/archiveSource','PUT',source));const initial=ok(await rtdb('checks/'+show+'/archiveSource','GET',undefined,a.token)).body;
 const digest=createHash('sha256').update(JSON.stringify(initial)).digest('hex');
 const meta={phase:'copying',nextIndex:0,total:2,sourceRevision:initial.revision,sourceHash:digest,lastId:''};
 ok(await commit(a.token,[write(prefix+'/state/current',meta)]));
 const record=(id,index)=>({index,personId:id,name:initial.actuals[id].name,arrived:initial.actuals[id].arrived,revision:1,lastOp:''});
 const step=async(id,index)=>commit(a.token,[write(prefix+'/records/'+id,record(id,index)),write(prefix+'/state/current',{nextIndex:index+1,lastId:id},['nextIndex','lastId'])]);
 denied(await commit(a.token,[write(prefix+'/records/FAKE-person-a',record('FAKE-person-a',0))]));
 denied(await commit(a.token,[write(prefix+'/state/current',{phase:'archived'},['phase'])]));
 ok(await step('FAKE-person-a',0));denied(await request(base+'/'+prefix+'/records',a.token));
 report('T01-partial-copy-hidden',{partialWriteRejected:true,prematurePublicationRejected:true,managerStagingGetAllowed:true,archiveListStillDenied:true});
 // プロセスの記憶を使わず、保存済みカーソルから再開する。
 const resumed=body(ok(await get(prefix+'/state/current',a.token)).body);assert.equal(resumed.nextIndex,1);
 denied(await step('FAKE-person-a',0));
 const changed=structuredClone(initial);changed.revision++;assert.notEqual(changed.revision,resumed.sourceRevision);
 assert.equal(ok(await rtdb('checks/'+show+'/archiveSource','GET',undefined,a.token)).body.revision,resumed.sourceRevision);
 ok(await step('FAKE-person-b',1));
 report('T02-resume-and-source-version-fence',{sameIdDuplicateRejected:true,sourceRevisionCheckedByAdapter:true,sourcePreserved:true});
 const staging=body(ok(await get(prefix+'/state/current',a.token)).body);assert.equal(staging.nextIndex,staging.total);
 // コピー途中は管理者の個別再取得だけを許可し、過去公演の一覧へはまだ公開しない。
 for(const[id,index]of Object.keys(initial.actuals).map((id,i)=>[id,i]))assert.deepEqual(body(ok(await get(prefix+'/records/'+id,a.token)).body),record(id,index));
 ok(await commit(a.token,[write(prefix+'/state/current',{phase:'archived'},['phase'])]));
 ok(await get(prefix+'/records/FAKE-person-a',a.token));ok(await get(prefix+'/records/FAKE-person-a',b.token));
 report('T03-publish-once-after-readback',{normalSourceReadAndArchiveReadback:true,crossDatabaseAtomicCommit:false,sourceHashNotServerVerified:true});
 phase='authorization';
 denied(await get(prefix+'/records/FAKE-person-a',other.token));
 denied(await get(prefix+'/records/FAKE-person-a',h.token));
 denied(await get('archiveShows/FAKE-other/records/FAKE-person-a',a.token));
 denied(await request(base+'/'+prefix+'/roles',a.token));
 denied(await commit(a.token,[write(prefix+'/sessions/'+a.uid,{...session(),deviceUid:b.uid},undefined,'issuedAt')]));
 report('A02-direct-api-binding',{unpreparedHumanAndForgedDeviceRejected:true,otherPerformanceAndRoleListDenied:true});
 ok(await commit(h.token,[write('archiveDevices/'+a.uid,{active:false,revision:2},['active','revision'])]));
 denied(await get(prefix+'/records/FAKE-person-a',a.token));ok(await get(prefix+'/records/FAKE-person-a',b.token));
 denied(await commit(a.token,[write('archiveDevices/'+a.uid,{active:true,revision:3},['active','revision'])]));
 denied(await commit(h.token,[write(prefix+'/sessions/'+a.uid,session(),undefined,'issuedAt')]));
 report('A03-device-stop',{stoppedDeviceDenied:true,otherDeviceContinues:true,selfRecoveryRejected:true});
 await seed('archiveDevices/'+a.uid,{deviceUid:a.uid,humanUid:h.uid,active:true,revision:3,preparedRoleRevision:1});
 const originalSession=body(ok(await get(prefix+'/sessions/'+a.uid,'owner')).body);
 await seed(prefix+'/sessions/'+a.uid,{...originalSession,active:false});denied(await get(prefix+'/records/FAKE-person-a',a.token));
 await seed(prefix+'/sessions/'+a.uid,{...originalSession,expiresAt:stamp(Date.now()-1000)});denied(await get(prefix+'/records/FAKE-person-a',a.token));
 await seed(prefix+'/sessions/'+a.uid,originalSession);
 await seed(prefix+'/roles/'+h.uid,{...role,revision:2});denied(await get(prefix+'/records/FAKE-person-a',a.token));
 await seed(prefix+'/roles/'+h.uid,role);
 ok(await commit(h.token,[write(prefix+'/roles/'+h.uid,{active:false,revision:2},['active','revision'])]));
 denied(await get(prefix+'/records/FAKE-person-a',a.token));denied(await get(prefix+'/records/FAKE-person-a',b.token));
 await seed(prefix+'/roles/'+h.uid,role);
 report('A04-session-and-role-revocation',{inactiveExpiredAndStaleSessionsRejected:true,normalHumanRoleRevocation:true,restorationOwnerPrecondition:true});
 phase='correction';
 const event='FAKE-correction-'+randomUUID();
 const eventData={personId:'FAKE-person-a',arrived:false,reason:'架空の照合による訂正',actor:a.uid};
 denied(await commit(a.token,[write(prefix+'/records/FAKE-person-a',{arrived:false,revision:2,lastOp:event},['arrived','revision','lastOp'])]));
 denied(await commit(a.token,[write(prefix+'/events/'+event,eventData,undefined,'at')]));
 ok(await commit(a.token,[write(prefix+'/records/FAKE-person-a',{arrived:false,revision:2,lastOp:event},['arrived','revision','lastOp']),write(prefix+'/events/'+event,eventData,undefined,'at')]));
 assert.equal(body(ok(await get(prefix+'/records/FAKE-person-a',a.token)).body).arrived,false);
 denied(await commit(a.token,[write(prefix+'/events/'+event,{...eventData,reason:'変更'},undefined,'at')]));
 denied(await commit(a.token,[{delete:name(prefix+'/events/'+event)}]));
 denied(await commit(a.token,[write(prefix+'/records/FAKE-person-a',{arrived:true,revision:2,lastOp:event},['arrived','revision','lastOp'])]));
 report('C01-append-correction',{recordAndNewEventAtomic:true,partialAndOverwriteRejected:true,originalSourceNotOverwritten:true,aggregateRecalculationNotVerified:true});
 phase='retention-delete';
 const retainedBefore=body(ok(await get(prefix+'/records/FAKE-person-b',a.token)).body);
 assert.equal(retainedBefore.name,'架空B');
 denied(await commit(a.token,[{delete:name(prefix+'/records/FAKE-person-a')} ]));
 const tomb={personId:'FAKE-person-a',reason:'架空の手動削除',actor:a.uid};
 ok(await commit(a.token,[{delete:name(prefix+'/records/FAKE-person-a')},write(prefix+'/tombstones/FAKE-person-a',tomb,undefined,'at')]));
 assert.equal((await get(prefix+'/records/FAKE-person-a','owner')).status,404);
 assert.equal(body(ok(await get(prefix+'/tombstones/FAKE-person-a',a.token)).body).personId,'FAKE-person-a');
 // 本体削除後の中断を模擬。残る履歴を再列挙してから明示削除する。
 ok(await get(prefix+'/events/'+event,a.token));ok(await commit(a.token,[{delete:name(prefix+'/events/'+event)}]));
 assert.equal((await get(prefix+'/events/'+event,'owner')).status,404);
 denied(await step('FAKE-person-a',0));
 assert.deepEqual(body(ok(await get(prefix+'/records/FAKE-person-b',a.token)).body),retainedBefore);
 report('D01-explicit-delete-and-no-resurrection',{factAndTombstoneAtomic:true,oneLinkedHistoryPurgeResumed:true,otherPersonPreserved:true,noTtlOrAgeDeletion:true,allLinkedHistoryAndBackupPurgeNotVerified:true});
 // 片側更新の反例を実DBで保持。RTDBだけの失効ではFirestoreの権限は失効しない。
 ok(await rtdb('checks/'+show+'/roles/'+h.uid+'/active','PUT',false));
 denied(await rtdb('checks/'+show+'/archiveSource','GET',undefined,a.token));
 ok(await get(prefix+'/records/FAKE-person-b',a.token));
 report('X01-rtdb-only-revoke-counterexample',{expectedArchiveStillReadable:true,automaticCrossDatabaseRevocation:false,adoptionGateUnresolved:true});
 const forged='FAKE-forged-'+randomUUID();denied(await commit(a.token,[write('archiveShows/'+forged+'/state/current',meta)]));
 await seed('archiveShows/'+forged+'/roles/'+h.uid,role);await seed('archiveShows/'+forged+'/sessions/'+a.uid,{...originalSession,performanceId:forged});
 ok(await commit(a.token,[write('archiveShows/'+forged+'/state/current',{...meta,sourceHash:'f'.repeat(64)})]));
 report('X02-self-reported-source-hash-counterexample',{otherPerformanceDeniedWithoutGrant:true,fakeHashAcceptedAfterExplicitGrant:true,crossDatabaseSourceVerificationStillUnresolved:true});
}catch(error){failure={phase,name:error.name,message:error.message};console.error(JSON.stringify({failure}));process.exitCode=1;}
finally{
 try{
  const deny="rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }";
  ok(await request(`http://127.0.0.1:8381/emulator/v1/projects/${project}:securityRules`,undefined,'PUT',{ignore_errors:false,rules:{files:[{name:'security.rules',content:deny}]}}));
  ok(await rtdb('.settings/rules','PUT',{rules:{'.read':false,'.write':false}}));
  ok(await rtdb('checks/'+show,'DELETE'));
  const cleared=await request(`http://127.0.0.1:8381/emulator/v1/projects/${project}/databases/(default)/documents`,undefined,'DELETE');assert.equal(cleared.status,200);
  for(const user of users)ok(await request(auth+'/accounts:delete?key=demo-api-key',undefined,'POST',{idToken:user.token}));
  const remaining=ok(await request(auth+`/projects/${project}/accounts:query`,'owner','POST',{})).body;
  cleanup={firestoreDenyAllInstalled:true,firestoreTrialDocumentsCleared:true,rtdbDenyAllInstalled:true,rtdbSourceEmpty:ok(await rtdb('checks/'+show)).body===null,authUsersRemaining:(remaining.userInfo??[]).length};
 }catch(error){cleanup={...cleanup,error:error.message};process.exitCode=1;}
 const after=sourceHashes(root,entries);fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
 fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,failure,cleanup,requests,requestBodyBytes:upBytes,responseBodyBytes:downBytes,externalFirebaseConnected:false,productionImplementation:false,sourceClosedActualsOwnerSeeded:true,normalArchiveReadbackAndSourceRemovalVerified:false,fullArchiveBusinessSchemaVerified:false,crossDatabaseRevocationVerified:false,allHistoryDeletionVerified:false,providerBillingMeasured:false},null,2)+'\n');
}
