import https from 'node:https';import tls from 'node:tls';import net from 'node:net';import assert from 'node:assert/strict';
// 接続先・認証情報と通信本文を残さず、暗号化側の公開Socketカウンターだけを使う。
export function createMeteredAgent({allowedHost,...settings}){
 const sockets=[],agent=new https.Agent({...settings});
 agent.createConnection=function(options,callback){
  const host=String(options.servername||options.host);assert(allowedHost(host),'meter-target-not-allowed');assert(!options.socket,'meter-socket-not-supported');
  const port=Number(options.port??443);assert(Number.isSafeInteger(port)&&port>0&&port<65536);
  const raw=net.connect({host:options.host??host,port,...(options.lookup?{lookup:options.lookup}:{}),...(options.family?{family:options.family}:{})});
  let finished=false;const done=(error,socket)=>{if(finished)return;finished=true;callback(error,socket);};
  raw.once('error',error=>done(error));raw.once('connect',()=>{
   const secure=tls.connect({...options,host:undefined,socket:raw,servername:options.servername||host});sockets.push({raw,secure});
   secure.once('error',error=>done(error));secure.once('secureConnect',()=>done(null,secure));
  });
 };
 return{agent,stats:()=>({connections:sockets.length,tlsDownloadBytes:sockets.reduce((n,x)=>n+x.raw.bytesRead,0),tlsUploadBytes:sockets.reduce((n,x)=>n+x.raw.bytesWritten,0)}),
  close:()=>{agent.destroy();for(const x of sockets)if(!x.secure.destroyed)x.secure.destroy();}};
}
