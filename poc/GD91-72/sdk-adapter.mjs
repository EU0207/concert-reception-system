import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from '../POC-001/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeFirestore,connectFirestoreEmulator,doc,runTransaction,getDocFromServer,Timestamp,serverTimestamp,terminate,disableNetwork,enableNetwork,setLogLevel} from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';
const project='demo-concert-seat-gd91-60';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9191');setLogLevel('silent');
function timestamp(s){const m=s.match(/^(.*:\d\d)(?:\.(\d{1,9}))?Z$/);assert(m,'UTC timestamp required');return new Timestamp(Date.parse(m[1]+'Z')/1000,Number((m[2]??'').padEnd(9,'0')));}
function timestampText(v){return new Date(v.seconds*1000).toISOString().slice(0,19)+'.'+String(v.nanoseconds).padStart(9,'0')+'Z';}
export function decode(v){if(v instanceof Timestamp)return{$timestamp:timestampText(v)};if(Array.isArray(v))return v.map(decode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));return v;}
function encode(v){if(v&&typeof v==='object'&&Object.hasOwn(v,'$timestamp'))return timestamp(v.$timestamp);if(Array.isArray(v))return v.map(encode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));return v;}
export async function client(token){
 const app=initializeApp({projectId:project,apiKey:'demo-api-key',appId:'demo-sdk-test'},randomUUID()),db=initializeFirestore(app,{experimentalForceLongPolling:true});
 connectFirestoreEmulator(db,'127.0.0.1',8181,{mockUserToken:token});
 return{db,ref:p=>doc(db,p),read:async p=>{const s=await getDocFromServer(doc(db,p));return s.exists()?decode(s.data()):null;},offline:()=>disableNetwork(db),online:()=>enableNetwork(db),close:async()=>{await terminate(db);await deleteApp(app);}};
}
function decodeFields(fields){const d=v=>Object.hasOwn(v,'nullValue')?null:Object.hasOwn(v,'booleanValue')?v.booleanValue:Object.hasOwn(v,'integerValue')?Number(v.integerValue):Object.hasOwn(v,'stringValue')?v.stringValue:Object.hasOwn(v,'timestampValue')?{$timestamp:timestampText(timestamp(v.timestampValue))}:Object.hasOwn(v,'arrayValue')?(v.arrayValue.values??[]).map(d):decodeFields(v.mapValue.fields??{});return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,d(v)]));}
export function plan(f,writes,id,kind='publication'){
 const root='publicationShows/'+f.show+'/',eventPath=root+(kind==='state'?'performanceEvents/':kind==='shared'?'sharedDrafts/':'operations/')+id;
 const canonical=writes.map(w=>({path:w.update.name.split('/documents/')[1],value:decodeFields(w.update.fields),transforms:w.updateTransforms??[]}));
 const expected=kind==='initialize'?null:kind==='state'?f.publicationVersion.values:canonical.find(w=>w.path===eventPath).value.expectedVersions;
 assert(kind==='initialize'||expected);return{id,kind,eventPath,versionPath:root+'versions/current',expected:structuredClone(expected),writes:canonical};
}
function same(a,b){try{assert.deepEqual(a,b);return true;}catch{return false;}}
export function matches(p,event){
 if(!event)return false;const write=p.writes.find(w=>w.path===p.eventPath),expected=structuredClone(write.value),actual=structuredClone(event);
 if(typeof actual.occurredAt?.$timestamp!=='string')return false;
 for(const t of write.transforms){
  const value=t.fieldPath.split('.').reduce((a,k)=>a?.[k],actual);
  if(!same(value,actual.occurredAt))return false;
  if(t.fieldPath!=='occurredAt')setField(expected,t.fieldPath,value);
 }
 delete actual.occurredAt;return same(actual,expected);
}
export async function inspect(c,p){try{const event=await c.read(p.eventPath);return event===null?{state:'absent'}:matches(p,event)?{state:'committed',event}:{state:'id-conflict'};}catch(e){return{state:'unknown',code:e.code};}}
function setField(value,path,next){const parts=path.split('.');let target=value;for(const key of parts.slice(0,-1)){assert(Object.hasOwn(target,key)&&typeof target[key]==='object');target=target[key];}target[parts.at(-1)]=next;}
export async function send(c,p,{online=true,trace={callbacks:0,writes:0}}={}){
 if(!online)throw Object.assign(new Error('explicit-offline'),{code:'explicit-offline'});
 return runTransaction(c.db,async tx=>{
  trace.callbacks++;const event=await tx.get(c.ref(p.eventPath));
  if(event.exists()){if(!matches(p,decode(event.data())))throw Object.assign(new Error('operation-id-conflict'),{code:'operation-id-conflict'});return{state:'already-committed',id:p.id};}
  const version=await tx.get(c.ref(p.versionPath));
  if(p.kind==='initialize'?version.exists():!version.exists()||!same(decode(version.data()).values,p.expected))throw Object.assign(new Error('stale-version'),{code:'stale-version'});
  for(const w of p.writes){const value=encode(w.value);for(const t of w.transforms){assert.equal(t.setToServerValue,'REQUEST_TIME');setField(value,t.fieldPath,serverTimestamp());}tx.set(c.ref(w.path),value);trace.writes++;}
  return{state:'committed',id:p.id};
 },{maxAttempts:3});
}
