import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import fs from 'node:fs';
export const project='demo-concert-seat-gd91-84',namespace=project+'-default-rtdb';
export const trial='checks/'+randomUUID(),reports=[],metrics={requests:0,requestBodyBytes:0,responseBodyBytes:0,ownerRequests:0,userRequests:0};
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export async function request(path,{method='GET',body,token,params={}}={}){
  const url=new URL('http://127.0.0.1:9000/'+path+'.json');url.searchParams.set('ns',namespace);
  if(token&&token!=='owner')url.searchParams.set('auth',token);for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);
  const encoded=body===undefined?undefined:JSON.stringify(body);metrics.requests++;metrics[token==='owner'?'ownerRequests':'userRequests']++;metrics.requestBodyBytes+=Buffer.byteLength(encoded??'');
  const r=await fetch(url,{method,headers:{'content-type':'application/json',...(token==='owner'?{authorization:'Bearer owner'}:{})},body:encoded,signal:AbortSignal.timeout(20000)});
  const text=await r.text();metrics.responseBodyBytes+=Buffer.byteLength(text);return{status:r.status,body:JSON.parse(text)};
}
export async function owner(path,method='GET',body){assert(path===trial||path.startsWith(trial+'/'));const r=await request(path,{method,body,token:'owner'});assert.equal(r.status,200);return r.body;}
export const user=(path,actor,method='GET',body)=>request(trial+'/'+path,{method,body,token:actor.token});
export const ok=r=>assert.equal(r.status,200,JSON.stringify(r.body));
export const denied=r=>assert.equal(r.status,401,JSON.stringify(r.body));
export async function check(id,fn){const result=await fn();reports.push({id,...result});console.log(JSON.stringify({case:id,passed:true}));}
async function auth(path,body,ownerAuth=false){const r=await fetch('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1/'+path,{method:'POST',headers:{'content-type':'application/json',...(ownerAuth?{authorization:'Bearer owner'}:{})},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();}
export async function actor(provider='anonymous',verified=true){
  let response;const fakeId=randomUUID(),email='fake-'+fakeId+'@example.com',password=randomUUID()+'A7!';
  if(provider==='anonymous')response=await auth('accounts:signUp?key=demo-api-key',{returnSecureToken:true});
  else if(provider==='google.com')response=await auth('accounts:signInWithIdp?key=demo-api-key',{requestUri:'http://localhost',postBody:new URLSearchParams({providerId:provider,id_token:JSON.stringify({sub:fakeId,email,email_verified:verified})}).toString(),returnSecureToken:true});
  else{response=await auth('accounts:signUp?key=demo-api-key',{email,password,returnSecureToken:true});if(verified){await auth('projects/'+project+'/accounts:update',{localId:response.localId,emailVerified:true},true);response=await auth('accounts:signInWithPassword?key=demo-api-key',{email,password,returnSecureToken:true});}}
  const claims=JSON.parse(Buffer.from(response.idToken.split('.')[1],'base64url'));assert.equal(claims.aud,project);assert.equal(claims.firebase.sign_in_provider,provider);
  return{uid:response.localId,token:response.idToken,claims};
}
export async function provision(role='owner',provider=['owner','deputy'].includes(role)?'google.com':'password'){
  const human=await actor(provider),device=await actor(),roleData={active:true,role,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000};
  const deviceData={schemaVersion:2,performanceId:trial.split('/')[1],deviceUid:device.uid,humanUid:human.uid,active:true,preparedRoleRevision:1};
  await owner(trial+'/roles/'+human.uid,'PUT',roleData);await owner(trial+'/devices/'+device.uid,'PUT',deviceData);
  return{human,device,role:roleData,registration:deviceData};
}
export function session(f,revision=1,overrides={}){return{schemaVersion:2,performanceId:trial.split('/')[1],deviceUid:f.device.uid,humanUid:f.human.uid,active:true,emailVerified:true,authProvider:f.human.claims.firebase.sign_in_provider,roleRevision:1,revision,issuedAt:{'.sv':'timestamp'},expiresAt:Date.now()+3600000,humanAuthTime:f.human.claims.auth_time*1000,...overrides};}
export const issue=(f,revision=1,overrides={})=>user('sessions/'+f.device.uid,f.human,'PUT',session(f,revision,overrides));
export function sourceHashes(files){return Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n'))]));}
