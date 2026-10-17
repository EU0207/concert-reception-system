import fs from 'node:fs';import assert from 'node:assert/strict';import http from 'node:http';import https from 'node:https';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {certificate} from './tls-fixture.mjs';import {proxy} from './tls-proxy.mjs';
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['transport-test.mjs']),before=hashes(),reports=[];
const cert=certificate();let server,tunnel,agent,failure;
try{
 server=http.createServer((req,res)=>{
  const size=Number(req.headers['x-test-size']??0);assert(Number.isSafeInteger(size)&&size>=0&&size<=1048576);
  const denied=req.url==='/denied',body=denied?Buffer.from('{"error":"denied"}'):Buffer.alloc(size,97);
  res.writeHead(denied?401:200,{'content-length':body.length,'content-type':'application/json'});res.end(body);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 tunnel=await proxy({...cert,targetPort:server.address().port});agent=new https.Agent({keepAlive:true,maxSockets:1,ca:cert.cert});
 async function get(size,path='/'){
  return new Promise((resolve,reject)=>{https.get({hostname:'localhost',port:tunnel.port,path,agent,headers:{'x-test-size':String(size)}},res=>{let bytes=0;res.on('data',c=>bytes+=c.length);res.on('end',()=>resolve({status:res.statusCode,bytes}));res.on('error',reject);}).on('error',reject);});
 }
 for(const size of [0,30000,1048576]){
  const start=tunnel.stats(),r=await get(size),end=tunnel.stats();assert.equal(r.status,200);assert.equal(r.bytes,size);assert(end.tlsDownloadBytes-start.tlsDownloadBytes>size);
  reports.push({id:'body-'+size,bodyBytes:size,tlsDownloadBytes:end.tlsDownloadBytes-start.tlsDownloadBytes,newConnections:end.connections-start.connections});
 }
 const retained=tunnel.stats().connections;assert.equal(retained,1);reports.push({id:'keepalive',requests:3,connections:retained});
 const start=tunnel.stats(),denied=await get(0,'/denied'),end=tunnel.stats();assert.equal(denied.status,401);assert(end.tlsDownloadBytes>start.tlsDownloadBytes);reports.push({id:'denied',bodyBytes:denied.bytes,tlsDownloadBytes:end.tlsDownloadBytes-start.tlsDownloadBytes});
 agent.destroy();agent=new https.Agent({keepAlive:false,ca:cert.cert});await get(30000);assert.equal(tunnel.stats().connections,2);reports.push({id:'reconnect',connections:2});
 const badAgent=new https.Agent({keepAlive:false});try{await assert.rejects(()=>new Promise((resolve,reject)=>https.get({hostname:'localhost',port:tunnel.port,agent:badAgent},resolve).on('error',reject)),e=>['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(e.code));}finally{badAgent.destroy();}reports.push({id:'certificate-verification-not-disabled',untrustedCertificateRejected:true});
}catch(e){failure={code:e.code??e.name,message:e.message};process.exitCode=1;}finally{
 agent?.destroy();if(tunnel)await tunnel.close();if(server)await new Promise(resolve=>server.close(resolve));cert.remove();
}
assert.deepEqual(before,hashes());fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/transport-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,...(failure?{failure}:{}),
 temporaryCertificateRemoved:!fs.existsSync(cert.certPath),measurement:'Raw server TCP socket counters include TLS and application protocol bytes, excluding TCP/IP headers and retransmissions. Local certificate only; not Firebase billing.',externalFirebaseConnected:false,productionImplementation:false,fullBusinessFreeTierVerified:false},null,2)+'\n');
console.log(JSON.stringify({transportCases:reports.length,failure:failure??null,temporaryCertificateRemoved:!fs.existsSync(cert.certPath)}));
