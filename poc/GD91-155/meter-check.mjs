import {sourceHashes} from '../GD91-105/source-audit.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {meter} from './meter.mjs';
const endpoint='http://127.0.0.1:9000/test.json',allow=u=>u.origin==='http://127.0.0.1:9000';
const source=sourceHashes(new URL('./',import.meta.url),['meter-check.mjs']);let checks=0;
{
 let calls=0,checkpoint=0;
 const m=meter({allow,fetcher:async()=>{calls++;return new Response('ok');},maxCalls:3,normalCallLimit:2,maxBodyBytes:100,cleanupReserveBytes:10,onProgress:()=>{checkpoint=m.state.responseBodyBytes;}});
 await assert.rejects(()=>m.fetch('https://example.invalid/'),/unapproved-endpoint/);
 await assert.rejects(()=>m.fetch(endpoint,{body:'x'.repeat(91)}),/body-budget/);
 assert.equal(m.state.requests,0);assert.equal(m.state.requestBodyBytes,0);assert.equal(calls,0);checks++;
 assert.equal(await (await m.fetch(endpoint,{body:'架空'})).text(),'ok');
 await m.fetch(endpoint);assert.equal(m.state.requestBodyBytes,6);assert.equal(m.state.responseBodyBytes,4);assert.equal(checkpoint,4);checks++;
 await assert.rejects(()=>m.fetch(endpoint),/call-budget/);assert.equal(calls,2);checks++;
 m.cleanup();await m.fetch(endpoint);await assert.rejects(()=>m.fetch(endpoint),/call-budget/);assert.equal(calls,3);assert.equal(m.state.groups.cleanup,1);checks++;
}
{
 let cancelled=false,requests=0;
 const m=meter({allow,maxCalls:5,normalCallLimit:4,maxBodyBytes:40,cleanupReserveBytes:20,maxResponseBytes:10,
  fetcher:async()=>{requests++;return requests===1?new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(11));},cancel(){cancelled=true;}})):new Response('ok');}});
 await assert.rejects(()=>m.fetch(endpoint),/response-body-budget/);assert(cancelled);assert.equal(m.state.responseBodyBytes,11);checks++;
 m.cleanup();await m.fetch(endpoint);assert.equal(m.state.requests,2);checks++;
}
{
 const m=meter({allow,maxCalls:3,normalCallLimit:2,maxBodyBytes:30,cleanupReserveBytes:20,fetcher:async()=>new Response('01234567890')});
 await assert.rejects(()=>m.fetch(endpoint),/response-body-budget/);assert.equal(m.state.responseBodyBytes,11);checks++;
 await assert.rejects(()=>m.fetch(endpoint,{body:'x'}),/body-budget/);assert.equal(m.state.requests,1);checks++;
}
{
 const m=meter({allow,maxCalls:3,normalCallLimit:2,fetcher:async()=>{throw Error('network-failure');}});
 await assert.rejects(()=>m.fetch(endpoint),/network-failure/);assert.equal(m.state.requests,1);checks++;
}
const result={sourceHashes:source,endSourceHashes:sourceHashes(new URL('./',import.meta.url),['meter-check.mjs']),checks,externalRequestsExecuted:0,unissuedRequestsNotCounted:true,requestAndResponseBodyCounted:true,responseCancellationVerified:true,cleanupReservationVerified:true,networkFailureCounted:true,wireAndTlsBytesMeasured:false};
fs.writeFileSync(new URL('artifacts/meter-check-summary.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
