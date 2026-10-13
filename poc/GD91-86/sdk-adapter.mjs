import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID,createHash} from 'node:crypto';
import {trial,project,namespace,owner,actor,issue,ok,user} from '../GD91-84/transport.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase/app'),{initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth'),{getDatabase,connectDatabaseEmulator,ref,update,goOffline}=require('firebase/database');
const hash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
export async function client(role='owner'){
  const human=await actor('google.com'),app=initializeApp({projectId:project,apiKey:'demo-api-key'},randomUUID()),auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});const signed=(await signInAnonymously(auth)).user,device={uid:signed.uid,token:await signed.getIdToken()},db=getDatabase(app,'http://127.0.0.1:9000/?ns='+namespace);connectDatabaseEmulator(db,'127.0.0.1',9000);
  const f={human,device,db,app,role};await owner(trial+'/roles/'+human.uid,'PUT',{active:true,role,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});await owner(trial+'/devices/'+device.uid,'PUT',{schemaVersion:2,performanceId:trial.split('/')[1],deviceUid:device.uid,humanUid:human.uid,active:true,preparedRoleRevision:1});ok(await issue(f));return f;
}
export function prepare(f,body,kind='seat'){
  assert(['seat','shared'].includes(kind));
  const copy=structuredClone(body),operationId=kind==='seat'?copy.commit.operationId:copy.sharedHead.operationId,target=kind==='seat'?'event':'',resultPath=(kind==='seat'?'event/operations/':'sharedOperations/')+operationId;
  return{formatVersion:1,performanceId:trial.split('/')[1],humanUid:f.human.uid,kind,operationId,target,resultPath,body:copy,bodyHash:hash(copy)};
}
function verify(f,p){assert(['seat','shared'].includes(p.kind));assert.equal(p.formatVersion,1);assert.equal(p.performanceId,trial.split('/')[1]);assert.equal(p.humanUid,f.human.uid);assert.equal(p.bodyHash,hash(p.body));assert.equal(p.operationId,p.kind==='seat'?p.body.commit.operationId:p.body.sharedHead.operationId,'operation-id-mismatch');assert.equal(p.resultPath,(p.kind==='seat'?'event/operations/':'sharedOperations/')+p.operationId);assert.equal(p.target,p.kind==='seat'?'event':'');}
export async function inspect(f,p){verify(f,p);const r=await user(p.resultPath,f.device);if(r.status!==200)throw Object.assign(new Error('result-unavailable'),{code:'result-unavailable'});if(r.body===null)return{state:'absent'};const expected=p.body[(p.kind==='seat'?'operations/':'sharedOperations/')+p.operationId];assert.deepEqual(r.body,expected,'operation-payload-mismatch');return{state:'committed'};}
export async function send(f,p,{online=true,trace={writes:0},write}={}){
  if(!online)throw Object.assign(new Error('explicit-offline'),{code:'explicit-offline'});verify(f,p);
  if((await inspect(f,p)).state==='committed')return{state:'already-committed'};
  trace.writes++;if(write)await write(p);else await update(ref(f.db,trial+(p.target?'/'+p.target:'')),p.body);
  assert.equal((await inspect(f,p)).state,'committed');return{state:'committed'};
}
export async function close(f){goOffline(f.db);await deleteApp(f.app);}
