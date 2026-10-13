import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fixture,seedMany,pub,getOwner} from '../GD91-75/fixtures.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
import {request,base,ok} from '../GD91-60/tests/transport.mjs';
import {event,send,memoryJournal} from '../GD91-77/receipt-client.mjs';
import {watchClient} from '../GD91-78/watch-client.mjs';
const paths=['authorization.mjs','../GD91-78/watch-client.mjs','../GD91-78/node_modules/.cache/firestore.rules',
  '../GD91-75/fixtures.mjs','../GD91-72/sdk-adapter.mjs','../GD91-77/receipt-client.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),reports=[];let current;
async function wait(test,ms=10000){const end=Date.now()+ms;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return test();}
async function bounded(work){let t;try{return await Promise.race([work,new Promise((_,r)=>{t=setTimeout(()=>r(new Error('operation-timeout')),15000);})]);}finally{clearTimeout(t);}}
try{
  for(const kind of ['role','device','session','control']){
    const f=await fixture(10),a=f.reader,b=await reader(f);
    await seedMany(f.attendees.slice(0,2).map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
      attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
    current=await watchClient(f.show,a,memoryJournal(f.show,a.device.uid,a.person.uid));await bounded(current.start());
    ok(await send([event(f,b,f.attendees[0],1)],b.device.token));assert(await wait(()=>current.journal.snapshot().records.size===1));
    const body={structuredQuery:{from:[{collectionId:'receiptEvents'}],limit:10}},url=base+'/publicationShows/'+f.show+':runQuery';
    const initial=await request(url,a.device.token,'POST',body);ok(initial);
    const readTime=initial.body.filter(x=>x.readTime).at(-1).readTime;
    const path=pub(f,kind==='role'?'roles/'+a.person.uid:kind==='device'?'devices/'+a.device.uid:kind==='session'?'sessions/'+a.device.uid:'control/current');
    const original=await getOwner(path);
    await seedMany([[path,kind==='control'?{...original,state:'preparing',revision:2}:{...original,active:false,revision:2}]]);
    const stoppedWithoutEvent=await wait(()=>Boolean(current.state().failure));
    const now=await request(url,a.device.token,'POST',body),historical=await request(url,a.device.token,'POST',{...body,readTime});
    const before=current.journal.snapshot().records.size;
    const next=event(f,b,f.attendees[1],2);
    // 停止中は通常受付も拒否されるため、通知再評価だけをowner投入で切り分ける。
    if(kind==='control')await seedMany([[pub(f,'receiptEvents/'+next.eventId),{...next,receivedAt:{$timestamp:new Date().toISOString()}}]]);
    else ok(await send([next],b.device.token));
    await wait(()=>Boolean(current.state().failure)||current.journal.snapshot().records.size>before);
    const afterNewEvent={...current.state(),records:current.journal.snapshot().records.size};
    await current.stop();let freshCode=null;
    try{await bounded(current.start());}catch(e){freshCode=e.code??e.message;}
    reports.push({kind,fixturePeople:10,stoppedWithoutEvent,observationMs:10000,currentReadStatus:now.status,
      historicalReadStatus:historical.status,historicalDocuments:Array.isArray(historical.body)?historical.body.filter(x=>x.document).length:0,
      before,afterNewEvent,freshListenError:freshCode,newEventOwnerInjected:kind==='control'});
    console.log(JSON.stringify(reports.at(-1)));await current.close();current=null;
  }
}catch(e){reports.push({error:{message:e.message,code:e.code??null}});process.exitCode=1;}
finally{if(current)await current.close();}
const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/authorization.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,
  productionReproduced:false,serverAuthorizationVerified:false,clientStopIsSecurityProof:false,tested3000:false},null,2)+'\n');
