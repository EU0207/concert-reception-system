import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {request,base} from './transport.mjs';

// Emulator以外へ転送しない。資格情報は要求内だけで扱い、結果へ残さない。
export async function loseCommit(writes,token,{forward=true}={}){
 assert(base.startsWith('http://127.0.0.1:8181/'));
 let calls=0;let upstream;let serverError;
 const server=http.createServer(async(req,res)=>{try{calls++;const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));assert.equal(req.method,'POST');assert.equal(req.url,'/commit');if(forward){upstream=await request(base+':commit',token,'POST',body);assert.equal(upstream.status,200,JSON.stringify(upstream));}res.destroy();}catch(e){serverError=e;res.destroy();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let failed=false;
 try{await request('http://127.0.0.1:'+server.address().port+'/commit',token,'POST',{writes});}catch{failed=true;}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(serverError)throw serverError;assert(failed,'client must not receive a successful response');assert.equal(calls,1);
 return{clientResponseLost:true,upstreamCommitted:forward,proxyRequests:calls};
}
export function queryInNewProcess(path,token){
 assert(path.startsWith('publicationShows/')||path.startsWith('sourceProofShows/'));
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[new URL('./resume-query.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{stdio:['pipe','pipe','pipe'],env:process.env});let output='',errors='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>errors+=x);child.on('error',reject);child.on('close',code=>{if(code!==0)reject(new Error('query process failed: '+errors));else resolve(JSON.parse(output));});child.stdin.end(JSON.stringify({path,token}));});
}
