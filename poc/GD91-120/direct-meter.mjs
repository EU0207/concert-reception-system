import tls from 'node:tls';import net from 'node:net';import assert from 'node:assert/strict';
// 接続先・認証情報と通信本文を残さず、暗号化側の公開Socketカウンターだけを使う。
export function installDirectMeter(allowedHost){
 const original=tls.connect,sockets=[];let unsupported=0;
 tls.connect=function(options,...rest){
  if(typeof options!=='object'||options===null){unsupported++;return original.call(tls,options,...rest);}
  const host=String(options.servername??options.host??'');if(!allowedHost(host))return original.call(tls,options,...rest);
  if(options.socket){unsupported++;return original.call(tls,options,...rest);}
  const port=Number(options.port??443);assert(Number.isSafeInteger(port)&&port>0&&port<65536);
  const raw=net.connect({host:options.host??host,port,...(options.lookup?{lookup:options.lookup}:{}),...(options.family?{family:options.family}:{})});
  const secure=original.call(tls,{...options,socket:raw,servername:options.servername??host},...rest);sockets.push({raw,secure});return secure;
 };
 return{stats:()=>({connections:sockets.length,tlsDownloadBytes:sockets.reduce((n,x)=>n+x.raw.bytesRead,0),tlsUploadBytes:sockets.reduce((n,x)=>n+x.raw.bytesWritten,0),unsupportedConnections:unsupported}),
  restore:()=>{tls.connect=original;},close:()=>{for(const x of sockets){x.secure.destroy();x.raw.destroy();}}};
}
