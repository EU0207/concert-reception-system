import fs from 'node:fs';import https from 'node:https';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createMeteredAgent} from './direct-meter.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const scope={requests:3,method:'GET',authenticated:false,authCreated:0,dataWrites:0,settingsChanges:0,bodyStopBytes:65536,googleLoginRequired:false};
if(process.argv[2]==='--plan'){console.log(JSON.stringify(scope));process.exit(0);}
assert.equal(process.argv[2],'--read-only');
const config=new URL('../GD91-80/firebase-client-config.local.json',import.meta.url);execFileSync('git',['check-ignore','-q',fileURLToPath(config)],{stdio:'pipe',windowsHide:true});
const state=JSON.parse(fs.readFileSync(config));assert(!state.trial&&!state.activeTrial,'prior-trial-still-active');
const base=new URL(state.gd82DatabaseUrl);assert.equal(base.protocol,'https:');assert(!base.username&&!base.password&&!base.search&&!base.hash);assert(/\.(firebaseio\.com|firebasedatabase\.app)$/.test(base.hostname));
const resultFile=new URL('artifacts/read-only-remote-summary.json',import.meta.url);assert(!fs.existsSync(resultFile),'read-only-observation-already-recorded');
const before=sourceHashes(new URL('./',import.meta.url),['read-only-remote.mjs']),meter=createMeteredAgent({allowedHost:h=>h===base.hostname,keepAlive:true,maxSockets:1}),reports=[];
let failure;
try{
 for(let i=0;i<scope.requests;i++){
  const target=new URL('/__transport_probe__/'+randomUUID()+'.json',base),start=meter.stats();
  const response=await new Promise((resolve,reject)=>{
   const req=https.get(target,{agent:meter.agent,timeout:10000},res=>{let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>scope.bodyStopBytes)req.destroy(new Error('read-only-body-limit'));});res.on('end',()=>resolve({status:res.statusCode,bodyBytes:bytes}));res.on('error',reject);});
   req.on('timeout',()=>req.destroy(new Error('read-only-timeout')));req.on('error',reject);
  });
  const end=meter.stats();assert.equal(response.status,401,'unauthenticated-read-must-be-denied');
  reports.push({id:i+1,...response,tlsDownloadBytes:end.tlsDownloadBytes-start.tlsDownloadBytes,tlsUploadBytes:end.tlsUploadBytes-start.tlsUploadBytes,newConnections:end.connections-start.connections});
 }
}catch(e){failure={code:e.code??e.name};process.exitCode=1;}
finally{meter.close();}
const after=sourceHashes(new URL('./',import.meta.url),['read-only-remote.mjs']);assert.deepEqual(before,after);
fs.writeFileSync(resultFile,JSON.stringify({sourceHashes:before,endSourceHashes:after,scope,reports,...(failure?{failure}:{}),
 externalFirebaseConnected:true,targetAndCredentialsRecorded:false,providerBillingMeasured:false,fullBusinessFreeTierVerified:false},null,2)+'\n');
console.log(JSON.stringify({requestsCompleted:reports.length,downloadBytes:reports.reduce((n,x)=>n+x.tlsDownloadBytes,0),failure:failure??null}));
