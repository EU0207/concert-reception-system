import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import {hashes,rules,cleanup,setup,trial,owner,user,request,ok,command,proposal,issue,finish} from './support.mjs';
import {client,wait} from './sdk-client.mjs';import {streamObserver} from '../GD91-86/google-observers.mjs';
import {namespace} from '../GD91-84/transport.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{ref,query,orderByKey,startAt,limitToFirst,onValue}=require('firebase/database');
const before=hashes(['expiry.mjs','sdk-client.mjs','../GD91-86/google-observers.mjs']),reports=[],clients=[],stops=[];let clean;
try{await rules();for(const kind of['session-expiry','role-and-session-expiry']){
 await owner(trial,'DELETE');const f=await setup(2),{manager:m,state,send}=f;
 await send(command(m,state,'register','person'));await send(proposal(m,{...state,seats:{'cell-0':{personId:'none'}}},'assign','cell-0','none','person'));await f.control('operating',2);
 const expired=await client(f.staff.human),valid=await client(m.human);clients.push(expired,valid);
 const paths=['event/reception','event/reception/i-person','event/reception/i-person/credentialRef'],observations=[];
 for(const c of[expired,valid])for(const path of paths){const state={count:0,error:null};let q=ref(c.db,trial+'/'+path);if(path==='event/reception')q=query(q,orderByKey(),startAt('i-'),limitToFirst(32));stops.push(onValue(q,()=>{state.count++;},e=>{state.error=e.code;}));observations.push(state);}
 await wait(()=>observations.every(x=>x.count===1));const baseline=observations.map(x=>x.count),controller=new AbortController(),url=new URL('http://127.0.0.1:9000/'+trial+'/event/reception.json');url.searchParams.set('ns',namespace);url.searchParams.set('auth',expired.device.token);url.searchParams.set('orderBy','"$key"');url.searchParams.set('startAt','"i-"');url.searchParams.set('limitToFirst','32');
 const stream=await streamObserver(await fetch(url,{headers:{accept:'text/event-stream'},signal:controller.signal}),controller);try{
  await wait(()=>stream.state.seen.length===1);const expires=Date.now()+3000;if(kind==='role-and-session-expiry')await owner(trial+'/roles/'+expired.human.uid+'/endsAt','PUT',expires);ok(await issue(expired,2,{expiresAt:expires}));await wait(()=>Date.now()>expires+350,6000);
  const params={orderBy:'"$key"',startAt:'"i-"',limitToFirst:'32'};assert.equal((await request(trial+'/event/reception',{token:expired.device.token,params})).status,401);
  await send(command(m,state,'qrCreate','person',{controlRevision:2}));await wait(()=>observations.slice(3).every((x,i)=>x.count===baseline[i+3]+1)&&stream.state.error==='cancel');await new Promise(r=>setTimeout(r,1000));
  assert.deepEqual(observations.slice(0,3).map(x=>x.count),baseline.slice(0,3));assert.equal(stream.state.seen.length,1);
  reports.push({kind,expiredSdkNewDataByPath:[0,0,0],validSdkNewDataByPath:[1,1,1],sdkCancellationObserved:observations.slice(0,3).map(x=>x.error==='PERMISSION_DENIED'),freshRestRejected:true,restStreamCancelled:true,restStreamNewData:0,roleAndSessionExpiryCoincide:kind==='role-and-session-expiry',normalQrCreationUsed:true,clockOnlyDisconnectClaimed:false});console.log(JSON.stringify({kind,passed:true}));
 }finally{await stream.close();for(const stop of stops)stop();stops.length=0;for(const c of clients)await c.close();clients.length=0;}
}}finally{for(const stop of stops)stop();for(const c of clients)await c.close();clean=await cleanup();}
finish('expiry',before,reports,clean);process.exit(0);
