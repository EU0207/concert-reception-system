import http2 from 'node:http2';
export async function proxy(){
 let blocked=false,forwarded=0,rejected=0;
 const sessions=new Set(),server=http2.createServer();
 server.on('session',s=>{sessions.add(s);s.on('error',()=>{});s.on('close',()=>sessions.delete(s));});
 server.on('stream',(stream,headers)=>{
  stream.on('error',()=>{});
  if(blocked){rejected++;stream.respond({':status':200,'content-type':'application/grpc'},{waitForTrailers:true});stream.on('wantTrailers',()=>stream.sendTrailers({'grpc-status':'14','grpc-message':'FAKE local outage'}));stream.end();return;}
  forwarded++;
  const session=http2.connect('http://127.0.0.1:8181');session.on('error',()=>stream.close());
  const upstream=session.request({...headers,':authority':'127.0.0.1:8181'});let trailers={};
  upstream.on('response',h=>{if(!stream.destroyed)stream.respond(h,{waitForTrailers:true});});
  upstream.on('trailers',h=>{trailers=h;});stream.on('wantTrailers',()=>stream.sendTrailers(trailers));
  upstream.on('error',()=>stream.close());
  stream.pipe(upstream);upstream.pipe(stream);
  stream.on('close',()=>{upstream.close();session.close();});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8281,'127.0.0.1',resolve);});
 return{block:()=>{blocked=true;},unblock:()=>{blocked=false;},stats:()=>({forwarded,rejected}),close:async()=>{for(const s of sessions)s.destroy();await new Promise(r=>server.close(r));}};
}
