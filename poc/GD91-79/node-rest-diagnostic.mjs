import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {initializeApp,deleteApp} from '../POC-001/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeFirestore,connectFirestoreEmulator,collection,query,orderBy,limit,onSnapshot,terminate,setLogLevel} from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';
import {fixture,seedMany,pub} from '../GD91-75/fixtures.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
import {event,send} from '../GD91-77/receipt-client.mjs';
import {ok} from '../GD91-60/tests/transport.mjs';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');setLogLevel('silent');
const paths=['node-rest-diagnostic.mjs','../GD91-78/node_modules/.cache/firestore.rules','../GD91-75/fixtures.mjs','../GD91-77/receipt-client.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),transport=process.argv[2]??'longpoll',clients=[],states=[],stops=[];assert(['default','longpoll'].includes(transport));let report;
async function wait(test,ms=10000){const end=Date.now()+ms;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return test();}
try{
  const f=await fixture(1000),actors=[f.reader];for(let i=1;i<6;i++)actors.push(await reader(f));
  await seedMany(f.attendees.map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
  for(const a of actors){const app=initializeApp({projectId:'demo-concert-seat-gd91-60',apiKey:'demo-api-key',appId:'demo-node-rest'},randomUUID());
    const db=initializeFirestore(app,transport==='longpoll'?{experimentalForceLongPolling:true}:{});connectFirestoreEmulator(db,'127.0.0.1',8181,{mockUserToken:a.device.token});clients.push({app,db});
    const state={callbacks:0,confirmed:0,initial:false,pending:0,cache:0,error:null};states.push(state);
    const q=query(collection(db,'publicationShows',f.show,'receiptEvents'),orderBy('receivedAt'),limit(2048));
    stops.push(onSnapshot(q,{includeMetadataChanges:true},s=>{state.callbacks++;if(s.metadata.fromCache)state.cache++;if(s.metadata.hasPendingWrites)state.pending++;
      if(!s.metadata.fromCache&&!s.metadata.hasPendingWrites){state.initial=true;state.confirmed=s.size;}},e=>{state.error=e.code;}));
  }
  assert(await wait(()=>states.every(s=>s.initial)),'initial-listen-timeout');
  const events=f.attendees.map((id,i)=>event(f,actors[i%6],id,Math.floor(i/6)+1));let requests=0;const begin=Date.now();
  await Promise.all(actors.map(async(a,i)=>{const mine=events.filter(e=>e.deviceUid===a.device.uid);
    for(let at=0;at<mine.length;at+=3){ok(await send(mine.slice(at,at+3),a.device.token));requests++;}}));
  const writeMs=Date.now()-begin;await wait(()=>states.every(s=>s.confirmed===1000||s.error));
  report={people:1000,transport,sender:'REST',receiptWrites:1000,requests,writeMs,states,converged:states.every(s=>s.confirmed===1000&&!s.error),
    observationAfterWriteMs:10000,productionRootCauseConfirmed:false,sharingLatencyVerified:false,tested3000:false};
}catch(e){report={transport,error:{message:e.message,code:e.code??null},states,tested3000:false};process.exitCode=1;}
finally{for(const s of stops)s();for(const {app,db} of clients){await terminate(db);await deleteApp(app);}}
report.sourceHashes=sourceHashes;report.endSourceHashes=hashes();assert.deepEqual(sourceHashes,report.endSourceHashes);
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/node-rest-'+transport+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({transport,writeMs:report.writeMs,converged:report.converged,states:report.states,error:report.error}));process.exit(process.exitCode??0);
