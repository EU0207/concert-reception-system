import fs from 'node:fs';import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
import {certificate} from './tls-fixture.mjs';import {proxy} from './tls-proxy.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const counts=process.argv.slice(2);assert(counts.length&&counts.every(x=>['4','600','1000'].includes(x)));
for(const port of[9000,9191])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['run-sdk.mjs']),before=hashes();
const cert=certificate();let tunnel;
try{
 tunnel=await proxy({...cert,targetPort:9000});
 for(const count of counts){
  const start=tunnel.stats();const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-84','--config','poc/GD91-117/firebase.json','--only','auth,database','node poc/GD91-120/sdk-local.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,NODE_EXTRA_CA_CERTS:cert.certPath,GD120_DATABASE_URL:'https://localhost:'+tunnel.port+'/?ns=demo-concert-seat-gd91-84-default-rtdb',GD120_PEOPLE:count,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
  const[code]=await once(cli,'exit'),end=tunnel.stats(),file=new URL('artifacts/sdk-'+count+'-summary.json',import.meta.url);if(fs.existsSync(file)){
   const r=JSON.parse(fs.readFileSync(file));r.tlsProxy={...Object.fromEntries(Object.keys(end).map(k=>[k,end[k]-start[k]])),sourceHashes:before,endSourceHashes:hashes(),localCertificateOnly:true,tcpIpHeadersAndRetransmissionExcluded:true,providerBillingMeasured:false};fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
  }
  if(code){process.exitCode=code;break;}
 }
}finally{if(tunnel)await tunnel.close();cert.remove();}
