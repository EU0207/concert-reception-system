import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from '../POC-001/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeFirestore,connectFirestoreEmulator,doc,runTransaction,getDocFromServer,
  Timestamp,serverTimestamp,terminate,disableNetwork,enableNetwork,writeBatch,setLogLevel}
  from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';

const project='demo-concert-seat-gd91-60';
assert.equal(process.env.GCLOUD_PROJECT,project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9191');
setLogLevel('silent');
export function decode(v){
 if(v instanceof Timestamp)return {$timestamp:v.toDate().toISOString()};
 if(Array.isArray(v))return v.map(decode);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));
 return v;
}
function encode(v){
 if(v&&typeof v==='object'&&Object.hasOwn(v,'$timestamp'))return Timestamp.fromDate(new Date(v.$timestamp));
 if(Array.isArray(v))return v.map(encode);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));
 return v;
}
export async function client(token,{port=8181}={}){
 assert([8181,8281].includes(port));
 const app=initializeApp({projectId:project,apiKey:'demo-api-key',appId:'demo-sdk-test'},randomUUID());
 const db=initializeFirestore(app,{experimentalForceLongPolling:true});
 connectFirestoreEmulator(db,'127.0.0.1',port,{mockUserToken:token});
 return {db,ref:p=>doc(db,p),read:async p=>{const s=await getDocFromServer(doc(db,p));return s.exists()?decode(s.data()):null;},
  offline:()=>disableNetwork(db),online:()=>enableNetwork(db),close:async()=>{await terminate(db);await deleteApp(app);}};
}
export function fault(code){return Object.assign(new Error(code),{code});}
export function plan(f,writes,id,kind){
 const root='publicationShows/'+f.show+'/',eventPath=root+(kind==='publication'?'operations/':'performanceEvents/')+id;
 const canonical=writes.map(w=>({path:w.update.name.split('/documents/')[1],value:decodeFields(w.update.fields),transforms:w.updateTransforms??[]}));
 const expected=kind==='publication'?canonical.find(w=>w.path===eventPath).value.expectedVersions:f.publicationVersion?.values;
 assert(expected,'Expected version must come from the confirmed proposal');
 return {id,kind,eventPath,versionPath:root+'versions/current',expected:structuredClone(expected),writes:canonical};
}
function decodeFields(fields){
 const d=v=>Object.hasOwn(v,'nullValue')?null:Object.hasOwn(v,'booleanValue')?v.booleanValue:Object.hasOwn(v,'integerValue')?Number(v.integerValue):Object.hasOwn(v,'stringValue')?v.stringValue:Object.hasOwn(v,'timestampValue')?{$timestamp:v.timestampValue}:Object.hasOwn(v,'arrayValue')?(v.arrayValue.values??[]).map(d):decodeFields(v.mapValue.fields??{});
 return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,d(v)]));
}
function same(a,b){try{assert.deepEqual(a,b);return true;}catch{return false;}}
export function matches(p,event){if(!event)return false;const expected=p.writes.find(w=>w.path===p.eventPath).value;const actual={...event};delete actual.occurredAt;return same(actual,expected);}
export async function inspect(c,p){
 try{const event=await c.read(p.eventPath);return event===null?{state:'absent'}:matches(p,event)?{state:'committed',event}:{state:'id-conflict'};}
 catch(e){return{state:'unknown',code:e.code};}
}
export async function send(c,p,{online=true,trace={callbacks:0,writes:0}}={}){
 if(!online)throw fault('explicit-offline');
 return runTransaction(c.db,async tx=>{
  trace.callbacks++;
  const event=await tx.get(c.ref(p.eventPath));
  if(event.exists()){if(!matches(p,decode(event.data())))throw fault('operation-id-conflict');return {state:'already-committed',id:p.id};}
  const version=await tx.get(c.ref(p.versionPath));
  if(!version.exists()||!same(decode(version.data()).values,p.expected))throw fault('stale-version');
  for(const w of p.writes){const value=encode(w.value);for(const t of w.transforms){assert.equal(t.setToServerValue,'REQUEST_TIME');value[t.fieldPath]=serverTimestamp();}tx.set(c.ref(w.path),value);trace.writes++;}
  return{state:'committed',id:p.id};
 },{maxAttempts:3});
}
// 対照試験専用。オフラインの自動送信を観測するため、本候補のsendからは呼ばない。
export function rawBatch(c,p){const batch=writeBatch(c.db);for(const w of p.writes){const v=encode(w.value);for(const t of w.transforms)v[t.fieldPath]=serverTimestamp();batch.set(c.ref(w.path),v);}return batch.commit();}
