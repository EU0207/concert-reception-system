import net from 'node:net';import tls from 'node:tls';import assert from 'node:assert/strict';
export async function proxy({key,cert,targetPort}){
 assert(Number.isSafeInteger(targetPort)&&targetPort>0&&targetPort<65536);
 const raw=[],secure=new Set(),upstream=new Set();let closed=false;
 const server=tls.createServer({key,cert,ALPNProtocols:['http/1.1']},socket=>{
  secure.add(socket);socket.once('close',()=>secure.delete(socket));
  const target=net.connect({host:'127.0.0.1',port:targetPort});upstream.add(target);target.once('close',()=>upstream.delete(target));
  socket.on('error',()=>target.destroy());target.on('error',()=>socket.destroy());socket.pipe(target).pipe(socket);
 });
 server.on('connection',socket=>raw.push(socket));server.on('tlsClientError',()=>{});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const stats=()=>({connections:raw.length,tlsDownloadBytes:raw.reduce((n,s)=>n+s.bytesWritten,0),tlsUploadBytes:raw.reduce((n,s)=>n+s.bytesRead,0)});
 return{port:server.address().port,stats,close:async()=>{if(closed)return;closed=true;for(const socket of secure)socket.destroy();for(const socket of upstream)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
