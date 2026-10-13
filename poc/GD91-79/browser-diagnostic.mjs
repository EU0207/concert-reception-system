import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {chromium} from '../POC-001/node_modules/playwright/index.mjs';
import {fixture,seedMany,pub} from '../GD91-75/fixtures.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
import {event,send} from '../GD91-77/receipt-client.mjs';
import {ok} from '../GD91-60/tests/transport.mjs';
const paths=['browser-diagnostic.mjs','browser-watch.mjs','browser.html','vite.config.mjs',
  '../GD91-78/node_modules/.cache/firestore.rules','../GD91-75/fixtures.mjs','../GD91-77/receipt-client.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),[nText='1000',transport='default']=process.argv.slice(2),n=Number(nText);
assert([600,1000].includes(n));assert(['default','longpoll'].includes(transport));let browser,report;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const f=await fixture(n),actors=[f.reader];for(let i=1;i<6;i++)actors.push(await reader(f));
  await seedMany(f.attendees.map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
  const pages=[];
  for(const a of actors){const context=await browser.newContext(),page=await context.newPage();pages.push(page);
    await page.goto('http://127.0.0.1:4180/poc/GD91-79/browser.html');await page.waitForFunction(()=>window.diagnostic);
    await page.evaluate(o=>window.diagnostic.start(o),{show:f.show,token:a.device.token,forceLongPolling:transport==='longpoll'});
  }
  const events=f.attendees.map((id,i)=>event(f,actors[i%6],id,Math.floor(i/6)+1));let requests=0;
  const begin=Date.now();
  // Web SDK受信だけの比較。送信はGD91-77の通常REST認可を使用する。
  await Promise.all(actors.map(async(a,i)=>{const mine=events.filter(e=>e.deviceUid===a.device.uid);
    for(let at=0;at<mine.length;at+=3){ok(await send(mine.slice(at,at+3),a.device.token));requests++;}}));
  const writeMs=Date.now()-begin,deadline=Date.now()+10000;let states;
  do{states=await Promise.all(pages.map(p=>p.evaluate(()=>window.diagnostic.state())));if(states.every(s=>s.confirmed===n||s.error))break;await new Promise(r=>setTimeout(r,20));}while(Date.now()<deadline);
  report={people:n,transport,independentIdentities:6,browserContexts:6,receiptWrites:n,requests,writeMs,states,
    converged:states.every(s=>s.confirmed===n&&!s.error),observationAfterWriteMs:10000,
    browserVersion:browser.version(),sender:'REST',realDevices:false,sharingLatencyVerified:false,productionFreeTierVerified:false,tested3000:false};
  for(const page of pages)await page.evaluate(()=>window.diagnostic.close());
}catch(e){report={people:n,transport,error:{message:e.message,code:e.code??null},tested3000:false};process.exitCode=1;}
finally{if(browser)await browser.close();}
const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);report.sourceHashes=sourceHashes;report.endSourceHashes=endSourceHashes;
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/browser-'+n+'-'+transport+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
