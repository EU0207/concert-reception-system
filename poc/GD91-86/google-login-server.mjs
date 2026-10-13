import {createServer} from '../POC-004/node_modules/vite/dist/node/index.js';import {fileURLToPath} from 'node:url';import fs from 'node:fs';
// トークンの検証と呼出し予算は、接続先を制限する試験側のコールバックで扱う。
export async function startGoogleLogin(config,{onBegin,onToken,port=4180}){
  let resolve,reject,started=false,completed=false;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});result.catch(()=>{});
  const origin='http://localhost:'+port,root=fileURLToPath(new URL('./',import.meta.url)),deps=fileURLToPath(new URL('../POC-004/node_modules/',import.meta.url));
  const server=await createServer({configFile:false,root,publicDir:false,logLevel:'silent',cacheDir:fileURLToPath(new URL('node_modules/.cache/google-vite/',import.meta.url)),server:{host:'localhost',port,strictPort:true,fs:{strict:true,allow:[root,deps]}},plugins:[{name:'gd86-memory-login',configureServer(s){s.middlewares.use(async(req,res,next)=>{
    const path=req.url?.split('?')[0];if(!path?.startsWith('/__gd86/'))return next();res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
    const answer=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
    if(req.headers.host!=='localhost:'+port)return answer(403,{error:'host-denied'});
    if(req.method==='GET'&&path==='/__gd86/config')return answer(200,config);
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/json')return answer(403,{error:'origin-denied'});
    try{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)throw new Error('body-too-large');}const body=JSON.parse(text);
      if(path==='/__gd86/begin'){if(started)return answer(409,{error:'already-started'});started=true;await onBegin();return answer(200,{started:true});}
      if(path==='/__gd86/token'){if(!started||completed)return answer(409,{error:'not-accepting-login'});completed=true;if(typeof body.token!=='string'||body.token.length<1)throw new Error('token-required');const accepted=await onToken(body.token);answer(200,{accepted:true});resolve(accepted);return;}
      answer(404,{error:'not-found'});
    }catch{answer(400,{error:'login-not-accepted'});reject(new Error('login-not-accepted'));}
  });}}]});
  await server.listen();return{url:origin+'/google-login.html',result,close:()=>server.close(),transform:()=>server.transformRequest('/google-login.mjs')};
}
