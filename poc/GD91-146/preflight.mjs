import fs from 'node:fs';import assert from 'node:assert/strict';import {generated} from './rules.mjs';
const url='http://127.0.0.1:9000/.settings/rules.json?ns=demo-concert-seat-gd91-84-import-rules';
const body=JSON.stringify(generated()),start=Date.now();
const r=await fetch(url,{method:'PUT',headers:{authorization:'Bearer owner','content-type':'application/json'},body,signal:AbortSignal.timeout(120000)});
const response=await r.text();console.log(JSON.stringify({bytes:Buffer.byteLength(body),status:r.status,response:response.slice(0,4000),ms:Date.now()-start}));
const cleanup=await fetch(url,{method:'PUT',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({rules:{'.read':false,'.write':false}})});assert.equal(cleanup.status,200);
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/rules-preflight.json',import.meta.url),JSON.stringify({bytes:Buffer.byteLength(body),status:r.status,response:JSON.parse(response),rulesRestoredToDeny:true,externalFirebaseConnected:false},null,2)+'\n');
assert.equal(r.status,200);
