import https from 'node:https';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {certificate} from '../GD91-120/tls-fixture.mjs';
import {proxy} from '../GD91-120/tls-proxy.mjs';
import {namespace,trial} from '../GD91-84/transport.mjs';

// ローカルCAだけを明示的に信頼する。証明書検証は無効化しない。
export async function withTlsReaders(actors,run){
  const cert=certificate(),agents=actors.map(()=>new https.Agent({keepAlive:true,ca:cert.cert}));
  let tunnel,requests=0,responseBodyBytes=0;
  try{
    tunnel=await proxy({...cert,targetPort:9000});
    const read=(path,index)=>new Promise((resolve,reject)=>{
      assert(index>=0&&index<actors.length);assert(!path.startsWith('/')&&!path.includes('..'));
      const url=new URL(`https://localhost:${tunnel.port}/${trial}/${path}.json`);
      url.searchParams.set('ns',namespace);url.searchParams.set('auth',actors[index].device.token);
      requests++;
      const request=https.get(url,{agent:agents[index],timeout:20000},response=>{
        const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);
        response.on('end',()=>{const bytes=Buffer.concat(chunks);responseBodyBytes+=bytes.length;
          try{resolve({status:response.statusCode,body:JSON.parse(bytes.toString('utf8'))});}catch(error){reject(error);}
        });
      });
      request.on('error',reject);request.on('timeout',()=>request.destroy(new Error('local-tls-timeout')));
    });
    const result=await run(read);
    const wire=tunnel.stats();assert.equal(wire.connections,actors.length);assert(wire.tlsDownloadBytes>responseBodyBytes);
    return{...result,tls:{...wire,requests,responseBodyBytes,localCertificateOnly:true,
      ownerAndAuthTrafficExcluded:true,providerBillingMeasured:false}};
  }finally{
    for(const agent of agents)agent.destroy();if(tunnel)await tunnel.close();cert.remove();
    assert(!fs.existsSync(cert.certPath),'temporary-cert-not-removed');
  }
}
