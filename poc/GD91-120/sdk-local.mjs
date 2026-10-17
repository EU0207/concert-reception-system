import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {project,namespace,trial,owner,request,ok} from '../GD91-84/transport.mjs';
import {profile} from '../GD91-88/model.mjs';import {modelsFor} from '../GD91-117/models.mjs';import {build} from '../GD91-116/layout.mjs';
import {lease,queuedEvent} from '../GD91-96/queue.mjs';
const people=Number(process.env.GD120_PEOPLE),url=new URL(process.env.GD120_DATABASE_URL);assert([4,600,1000].includes(people));assert.equal(url.hostname,'localhost');assert.equal(url.protocol,'https:');assert.equal(url.searchParams.get('ns'),namespace);assert(project.startsWith('demo-'));
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['sdk-local.mjs']),before=hashes();
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase/app'),{initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth'),{getDatabase,ref,get,onChildAdded,query,orderByKey,startAfter,goOffline}=require('firebase/database');
const apps=[],clients=[],stops=[],reports=[];let failure,clean,stage='setup';
const wait=async(test)=>{const end=Date.now()+60000;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));assert(test(),'sdk-observation-timeout');};
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:{rules:{checks:{$run:{'.read':'auth != null','.write':false}}}}}));
 const layout={};if(people!==4)await build(async(p,method,body)=>{
  const set=(key,value)=>{const keys=key.split('/');let node=layout;for(const k of keys.slice(0,-1))node=node[k]??={};node[keys.at(-1)]=value;};
  if(p)set(p,body);else for(const [key,value] of Object.entries(body))set(key,value);
 },'layout',modelsFor(people));
 const dataset={layout:layout.generations?.layout??{fixture:'small'},profiles:Object.fromEntries(Array.from({length:people},(_,i)=>['fiction-'+i,profile(i)]))};
 const dataBytes=Buffer.byteLength(JSON.stringify(dataset));await owner(trial,'PUT',{wireData:dataset});
 stage='six-sdk-snapshots';for(let n=0;n<6;n++){
  const app=initializeApp({projectId:project,apiKey:'demo-api-key',databaseURL:url.href},randomUUID());apps.push(app);
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});await signInAnonymously(auth);
  const db=getDatabase(app,url.href);clients.push({db,count:0,eventBytes:0,error:null});const value=(await get(ref(db,trial+'/wireData'))).val();assert.deepEqual(value,dataset);
 }
 reports.push({id:'six-snapshots',sdkEnvironments:6,dataBytes,logicalResponseBodyBytes:6*dataBytes});
 stage='six-listeners';for(const c of clients)stops.push(onChildAdded(query(ref(c.db,trial+'/wireEvents'),orderByKey(),startAfter('0000000000')),snap=>{c.count++;c.eventBytes+=Buffer.byteLength(JSON.stringify(snap.val()));},e=>{c.error=e.code;}));
 // listener登録完了を値の往復で待ち、最初のイベントを取りこぼさない。
 for(const c of clients)await get(ref(c.db,trial+'/wireEvents'));
 const subject={human:{uid:'fictional-human'},device:{uid:'fictional-writer'}},l=lease(subject,{generation:'layout',revision:1},2);
 for(let n=1;n<=people;n++){
  const event=queuedEvent(trial.split('/')[1],subject,n,'fiction-'+(n-1),{credentialRef:'fictional-credential',currentCycle:1,credentialVersion:1},l).event;
  await owner(trial+'/wireEvents/'+String(1000000000+n),'PUT',event);
 }
 await wait(()=>clients.every(c=>c.count===people&&!c.error));
 reports.push({id:'six-listeners',eventsPerEnvironment:clients.map(c=>c.count),logicalResponseBodyBytes:clients.reduce((n,c)=>n+c.eventBytes,0)});
}catch(e){failure={stage,code:e.code??e.name,message:e.message};process.exitCode=1;}
finally{
 for(const stop of stops)stop();for(const c of clients)goOffline(c.db);for(const app of apps)await deleteApp(app);
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:{rules:{'.read':false,'.write':false}}}));await owner(trial,'DELETE');clean={rulesClosed:JSON.stringify((await request('.settings/rules',{token:'owner'})).body)===JSON.stringify({rules:{'.read':false,'.write':false}}),trialRootEmpty:(await owner(trial))===null};
}
assert.deepEqual(before,hashes());fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/sdk-'+people+'-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),people,reports,cleanup:clean,...(failure?{failure}:{}),transportFixtureOnly:true,
 businessAuthorizationVerifiedHere:false,registrationAndTicketsSeeded:true,externalFirebaseConnected:false,productionImplementation:false,fullBusinessFreeTierVerified:false},null,2)+'\n');
console.log(JSON.stringify({people,sdkGroups:reports.length,failure:failure??null,cleanup:clean}));
process.exit(process.exitCode??0);
