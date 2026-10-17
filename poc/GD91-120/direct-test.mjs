import fs from 'node:fs';import assert from 'node:assert/strict';import https from 'node:https';
import {certificate} from './tls-fixture.mjs';import {installDirectMeter} from './direct-meter.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['direct-test.mjs']),before=hashes(),cert=certificate(),meter=installDirectMeter(h=>h==='localhost'),reports=[];
let server,agent,failure;
try{
 server=https.createServer({key:cert.key,cert:cert.cert},(req,res)=>{const body=Buffer.alloc(Number(req.headers['x-size']??0),97);res.writeHead(req.url==='/denied'?401:200,{'content-length':body.length});res.end(body);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 agent=new https.Agent({keepAlive:true,ca:cert.cert,maxSockets:1});
 for(const [id,size,path] of [['empty',0,'/'],['payload',65536,'/'],['denied',32,'/denied']]){
  const start=meter.stats(),result=await new Promise((resolve,reject)=>https.get({hostname:'localhost',port:server.address().port,path,headers:{'x-size':String(size)},agent},res=>{let bytes=0;res.on('data',c=>bytes+=c.length);res.on('end',()=>resolve({bytes,status:res.statusCode}));res.on('error',reject);}).on('error',reject));
  const end=meter.stats();assert.equal(result.bytes,size);assert.equal(result.status,path==='/denied'?401:200);assert(end.tlsDownloadBytes-start.tlsDownloadBytes>size);assert.equal(end.unsupportedConnections,0);
  reports.push({id,bodyBytes:size,status:result.status,tlsDownloadBytes:end.tlsDownloadBytes-start.tlsDownloadBytes,connections:end.connections});
 }
 assert.equal(meter.stats().connections,1);
}catch(e){failure={code:e.code??e.name,message:e.message};process.exitCode=1;}
finally{agent?.destroy();meter.close();meter.restore();if(server)await new Promise(resolve=>server.close(resolve));cert.remove();}
assert.deepEqual(before,hashes());fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/direct-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,...(failure?{failure}:{}),temporaryCertificateRemoved:!fs.existsSync(cert.certPath),externalFirebaseConnected:false,productionImplementation:false,fullBusinessFreeTierVerified:false},null,2)+'\n');
console.log(JSON.stringify({directCases:reports.length,failure:failure??null}));
