import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {meter as oldMeter} from '../GD91-155/meter.mjs';
import {meter} from './meter.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),before=sourceHashes(root,['transport-check.mjs']);
const require=createRequire(new URL('../POC-004/package.json',root));
const auth=require('firebase-tools/lib/auth.js');
const originalFetch=globalThis.fetch;
const tokenUrl='https://www.googleapis.com/oauth2/v3/token';
const domains=new Set(['cloudbilling.googleapis.com','firebase.googleapis.com']);
const allow=u=>u.protocol==='https:'&&domains.has(u.hostname);
const fakeRefresh=()=> 'fake-unregistered-'+randomUUID();
let checks=0,networkRequests=0;
try{
 let fetched=0;const endpoints=[];
 const old=oldMeter({allow:u=>{endpoints.push({origin:u.origin,path:u.pathname});return allow(u);},fetcher:async()=>{fetched++;throw Error('unreachable');}});
 globalThis.fetch=old.fetch;
 await assert.rejects(()=>auth.getAccessToken(fakeRefresh(),['https://www.googleapis.com/auth/cloud-platform']));
 assert.equal(fetched,0);assert.equal(old.state.requests,0);assert.deepEqual(endpoints,[{origin:'https://www.googleapis.com',path:'/oauth2/v3/token'}]);checks++;

 const formats=[];
 const current=meter({allow,fetcher:async(input,o)=>{
  assert.equal(String(input),tokenUrl);assert.equal(o.method,'POST');assert.equal(o.redirect,'error');assert(Buffer.isBuffer(o.body));assert(o.body.length<16384);
  formats.push({bufferBody:true,requestBytes:o.body.length});
  return new Response(JSON.stringify({access_token:'fake-access-'+randomUUID(),expires_in:3600,token_type:'Bearer'}));
 }});
 globalThis.fetch=current.fetch;
 const refresh=()=>auth.getAccessToken(fakeRefresh(),current.state.oauthRequests%2===0?['https://www.googleapis.com/auth/cloud-platform']:['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/userinfo.email']);
 for(let n=0;n<3;n++){
  const r=await refresh();assert(r.access_token.startsWith('fake-access-'));
 }
 assert.equal(current.state.requests,3);assert.equal(current.state.oauthRequests,3);assert.equal(current.state.serviceRequests,0);checks++;
 await assert.rejects(refresh);
 assert.equal(current.state.lastBlockedReason,'oauth-call-budget');assert.equal(current.state.requests,3);checks++;
 current.cleanup();for(let n=0;n<3;n++)await refresh();
 assert.equal(current.state.requests,6);assert.equal(current.state.oauthRequests,6);checks++;
 await assert.rejects(refresh);assert.equal(current.state.requests,6);checks++;

 const isolated=meter({allow,fetcher:async()=>{throw Error('must-not-send');}});
 for(const [url,options,reason] of [
  ['https://www.googleapis.com/oauth2/v3/other',{},'unapproved-endpoint'],
  ['http://www.googleapis.com/oauth2/v3/token',{},'unapproved-endpoint'],
  [tokenUrl,{method:'GET',body:Buffer.from('fake')},'oauth-request-shape'],
  [tokenUrl,{method:'POST',body:'fake'},'oauth-request-shape'],
  [tokenUrl,{method:'POST',body:Buffer.alloc(16385)},'oauth-request-shape'],
  [tokenUrl,{method:'POST',body:Buffer.from('fake')},'oauth-content-type']
 ]){await assert.rejects(()=>isolated.fetch(url,options),e=>e.message==='transport-policy-'+reason);checks++;}
 assert.equal(isolated.state.requests,0);assert.equal(isolated.state.requestBodyBytes,0);
 assert.equal(current.state.requestBodyBytes,formats.reduce((n,f)=>n+f.requestBytes,0));assert(current.state.responseBodyBytes>0);checks++;
}finally{globalThis.fetch=originalFetch;}
assert.deepEqual(sourceHashes(root,['transport-check.mjs']),before);
const installedCliHashes=Object.fromEntries(['auth.js','apiv2.js'].map(name=>[name,createHash('sha256').update(fs.readFileSync(new URL('../POC-004/node_modules/firebase-tools/lib/'+name,root))).digest('hex')]));
const result={sourceHashes:before,endSourceHashes:before,checks,externalRequestsExecuted:networkRequests,
 installedCliHashes,legacyFailureReproduced:true,fakeUnregisteredRefreshTokensOnly:true,officialExactTokenEndpointOnly:true,bufferRequestBodyCounted:true,normalOAuthCalls:3,cleanupOAuthReserve:3,unexpectedShapesRejectedBeforeSend:true,realCredentialsTransmitted:false};
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});fs.writeFileSync(new URL('artifacts/transport-check-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks,externalRequestsExecuted:0}));
