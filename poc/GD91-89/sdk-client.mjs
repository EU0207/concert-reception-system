import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {project,trial,namespace,owner,issue,ok} from '../GD91-84/transport.mjs';
import {download} from './projection.mjs';import {key,accept,journal} from '../GD91-88/receipt-client.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase/app'),{initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const {getDatabase,connectDatabaseEmulator,ref,query,orderByKey,startAt,startAfter,limitToFirst,get,onChildAdded,goOffline}=require('firebase/database');
export async function client(human){
 const app=initializeApp({projectId:project,apiKey:'demo-api-key',databaseURL:`https://${namespace}.firebaseio.com`},randomUUID());
 const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});
 const u=(await signInAnonymously(auth)).user,device={uid:u.uid,token:await u.getIdToken()},f={human,device};
 await owner(trial+'/devices/'+device.uid,'PUT',{schemaVersion:2,performanceId:trial.split('/')[1],deviceUid:device.uid,humanUid:human.uid,active:true,preparedRoleRevision:1});ok(await issue(f));
 const db=getDatabase(app);connectDatabaseEmulator(db,'127.0.0.1',9000);let reads=0,bodyBytes=0;
 async function read(p,params){let q=ref(db,trial+'/'+p);if(params)q=query(q,orderByKey(),startAt(JSON.parse(params.startAt)),limitToFirst(Number(params.limitToFirst)));const snapshot=await get(q);reads++;const v=snapshot.val();bodyBytes+=Buffer.byteLength(JSON.stringify(v));return v;}
 return {...f,db,snapshot:()=>download(read),stats:()=>({sdkGetOperations:reads,responseBodyBytes:bodyBytes}),
  subscribe:(writerUid,store=journal())=>{
   const stats={events:0,bodyBytes:0,error:null},path=trial+'/receipts/'+writerUid+'/events',cursor=store.snapshot().cursors.get(writerUid)??0;let chain=Promise.resolve();
   const stop=onChildAdded(query(ref(db,path),orderByKey(),startAfter(key(cursor))),snapshot=>{const event=snapshot.val();stats.events++;stats.bodyBytes+=Buffer.byteLength(JSON.stringify(event));chain=chain.then(async()=>{const next=accept(store,writerUid,event);if(next)await store.save(next);}).catch(e=>{stats.error=e.code??e.message;});},e=>{stats.error=e.code;});
   return {stats,store,stop:async()=>{stop();await chain;}};
  },close:async()=>{goOffline(db);await deleteApp(app);}};
}
export async function wait(test,ms=60000){const end=Date.now()+ms;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,25));assert(test(),'sdk-observation-timeout');}
