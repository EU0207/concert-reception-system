// 隔離診断。採用済みの同期方式・本番認証を実装するものではない。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {collection,query,orderBy,limit,onSnapshot,writeBatch,doc,serverTimestamp,Timestamp,getDocsFromServer} from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';
import {fixture,seedMany,pub} from '../GD91-75/fixtures.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
import {client} from '../GD91-72/sdk-adapter.mjs';
import {event} from '../GD91-77/receipt-client.mjs';
import {base,request,ok} from '../GD91-60/tests/transport.mjs';
const paths=['diagnose.mjs','../GD91-75/fixtures.mjs','../GD91-72/sdk-adapter.mjs','../GD91-77/receipt-client.mjs',
  '../GD91-78/node_modules/.cache/firestore.rules','../POC-001/node_modules/@firebase/firestore/dist/index.node.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),[nText='1000',mode='mixed']=process.argv.slice(2),n=Number(nText);
assert([600,1000].includes(n));assert(['mixed','separate'].includes(mode));
const clients=[],unsubscribers=[],observers=[];let report;
async function until(test,ms){const end=Date.now()+ms;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return test();}
async function bounded(work,ms=60000){let t;try{return await Promise.race([work,new Promise((_,r)=>{t=setTimeout(()=>r(new Error('operation-timeout')),ms);})]);}finally{clearTimeout(t);}}
try{
  const f=await fixture(n),actors=[f.reader];for(let i=1;i<6;i++)actors.push(await reader(f));
  await seedMany(f.attendees.map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
  const writers=[];
  for(const a of actors){const c=await client(a.device.token);clients.push(c);writers.push(c);}
  for(let i=0;i<6;i++){
    const c=mode==='mixed'?writers[i]:await client(actors[i].device.token);if(mode==='separate')clients.push(c);
    const q=query(collection(c.db,'publicationShows',f.show,'receiptEvents'),orderBy('receivedAt'),limit(2048));
    const o={query:q,db:c.db,callbacks:0,serverOnly:0,fromCache:0,pending:0,confirmedSize:0,last:null,error:null,trace:[]};observers.push(o);
    unsubscribers.push(onSnapshot(q,{includeMetadataChanges:true},s=>{
      o.callbacks++;if(s.metadata.fromCache)o.fromCache++;if(s.metadata.hasPendingWrites)o.pending++;
      const sample={size:s.size,fromCache:s.metadata.fromCache,pending:s.metadata.hasPendingWrites,
        confirmedDocuments:s.docs.filter(d=>!d.metadata.hasPendingWrites&&d.get('receivedAt') instanceof Timestamp).length};
      o.last=sample;o.trace.push(sample);if(o.trace.length>12)o.trace.shift();
      if(!sample.fromCache&&!sample.pending){o.serverOnly++;o.confirmedSize=s.size;}
    },e=>{o.error=e.code;}));
  }
  assert(await until(()=>observers.every(o=>o.serverOnly),15000),'initial-listen-timeout');
  const events=f.attendees.map((id,i)=>event(f,actors[i%6],id,Math.floor(i/6)+1));
  let writes=0,requests=0;const started=Date.now();
  await bounded(Promise.all(writers.map(async(c,index)=>{
    const mine=events.filter(e=>e.deviceUid===actors[index].device.uid);
    for(let i=0;i<mine.length;i+=3){const batch=writeBatch(c.db);
      for(const e of mine.slice(i,i+3))batch.set(doc(c.db,pub(f,'receiptEvents/'+e.eventId)),{
        ...e,observedAt:Timestamp.fromDate(new Date(e.observedAt.$timestamp)),receivedAt:serverTimestamp()});
      await batch.commit();writes+=mine.slice(i,i+3).length;requests++;
    }
  })),120000);
  const writeMs=Date.now()-started;
  const converged=await until(()=>observers.every(o=>o.confirmedSize===n||o.error),15000)&&observers.every(o=>o.confirmedSize===n&&!o.error);
  const beforeGet=observers.map(({query,db,...o})=>structuredClone(o));
  const rest=await request(base+'/publicationShows/'+f.show+':runQuery',actors[0].device.token,'POST',{
    structuredQuery:{from:[{collectionId:'receiptEvents'}],limit:2048}});ok(rest);
  const restDocuments=rest.body.filter(x=>x.document);
  const restIds=restDocuments.map(x=>x.document.name.split('/').at(-1)).sort();
  assert.deepEqual(restIds,events.map(e=>e.eventId).sort(),'server-event-id-mismatch');
  // 独立した明示読取りで、サーバー正本の件数と購読の通知を区別する。
  const direct=await bounded(getDocsFromServer(observers[0].query));
  const afterExplicitRead=await until(()=>observers.every(o=>o.confirmedSize===n||o.error),10000);
  report={people:n,mode,identities:6,sdkInstances:clients.length,writes,requests,writeMs,convergedBeforeExplicitRead:converged,
    beforeGet,restCurrentReadSize:restDocuments.length,restExactEventIds:true,
    directReadSize:direct.size,directReadHasPendingWrites:direct.metadata.hasPendingWrites,
    directReadFromCache:direct.metadata.fromCache,afterExplicitRead,afterGet:observers.map(({query,db,...o})=>o),
    observationAfterWritesMs:15000,productionRootCauseConfirmed:false,sharingLatencyVerified:false,
    productionFreeTierVerified:false,tested3000:false};
}catch(e){report={people:n,mode,error:{message:e.message,code:e.code??null},observers:observers.map(({query,db,...o})=>o),tested3000:false};process.exitCode=1;}
finally{for(const u of unsubscribers)u();for(const c of clients)await c.close();}
report.sourceHashes=sourceHashes;report.endSourceHashes=hashes();assert.deepEqual(report.sourceHashes,report.endSourceHashes);
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/'+n+'-'+mode+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({people:n,mode,writes:report.writes,writeMs:report.writeMs,converged:report.convergedBeforeExplicitRead,
  directReadSize:report.directReadSize,last:report.beforeGet?.map(o=>o.last),error:report.error}));
