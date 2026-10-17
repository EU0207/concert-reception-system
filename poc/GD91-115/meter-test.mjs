import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {installMeter} from './meter.mjs';
const original=globalThis.fetch;let finish;
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('broken'))throw new Error('injected-transport-error');
 if(String(url).includes('pending'))await new Promise(resolve=>{finish=resolve;});
 return new Response('架空の応答',{status:options.method==='DELETE'?401:200});
};
const stub=globalThis.fetch,meter=installMeter(),reports=[];
try{
 meter.phase('register');const r=await fetch('http://127.0.0.1:9000/test.json',{method:'PUT',body:'架空'});
 assert.equal(await r.text(),'架空の応答');assert.equal(meter.snapshot()['register:normal'].requestBodyBytes,6);assert.equal(meter.snapshot()['register:normal'].responseBodyBytes,15);
 reports.push({id:'M01',utf8BytesCounted:true,callerCanStillConsumeResponse:true});
 await fetch('http://127.0.0.1:9000/test.json',{headers:{authorization:'Bearer owner'}});
 assert.equal(meter.snapshot()['register:diagnostic'].requests,1);assert.equal(meter.snapshot()['register:normal'].requests,1);
 reports.push({id:'M02',ownerDiagnosticsSeparated:true});
 await fetch('http://127.0.0.1:9000/test.json',{method:'DELETE'});
 assert.equal(meter.snapshot()['register:normal'].failedResponses,1);
 reports.push({id:'M03',deniedResponseIsNotFreeOrInvisible:true});
 await assert.rejects(()=>fetch('http://127.0.0.1:9000/broken.json'),/injected-transport-error/);
 assert.equal(meter.snapshot()['register:normal'].transportErrors,1);
 reports.push({id:'M04',transportFailureCounted:true});
 const pending=fetch('http://127.0.0.1:9000/pending.json');await Promise.resolve();meter.phase('closing');finish();await pending;
 assert.equal(meter.snapshot()['register:normal'].requests,4);assert(!meter.snapshot()['closing:normal']);
 reports.push({id:'M05',phasePinnedWhenRequestStarts:true});
 const before=meter.snapshot();await fetch('http://127.0.0.1:9191/auth');await fetch('http://localhost:4181/test');
 assert.deepEqual(meter.snapshot(),before);assert(!JSON.stringify(before).includes('Bearer'));assert(!JSON.stringify(before).includes('test.json'));
 reports.push({id:'M06',otherServicesExcluded:true,credentialsAndUrlsNotRecorded:true});
}finally{meter.restore();assert.equal(globalThis.fetch,stub);globalThis.fetch=original;}
const paths=['meter-test.mjs','meter.mjs'],sourceHashes=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/meter-test-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:sourceHashes,reports,externalFirebaseConnected:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({meterCases:reports.length,networkCalls:0,credentialsRecorded:false}));
