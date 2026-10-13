import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {runCases} from './test-cases.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const {getDatabase,connectDatabaseEmulator,goOffline}=require('firebase/database');
const project='demo-concert-seat-gd91-82',base='http://127.0.0.1:9000',ns=project+'-default-rtdb',apps=[],subjects=[],roots=[];
const files=['local.mjs','test-cases.mjs','database.rules.json','deny.rules.json','generate.mjs','firebase.json'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes();let requests=0,result,cleanup={rulesClosed:false,rootsEmpty:false};
async function http(path,{method='GET',body,token,params={},stream=false,signal}={}){const u=new URL(base+'/'+path+'.json');u.searchParams.set('ns',ns);
  if(token&&token!=='owner')u.searchParams.set('auth',token);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);requests++;
  return fetch(u,{method,headers:{'content-type':'application/json',...(token==='owner'?{authorization:'Bearer owner'}:{}),...(stream?{Accept:'text/event-stream'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal??AbortSignal.timeout(20000)});}
async function rules(file){const r=await http('.settings/rules',{method:'PUT',token:'owner',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'))});assert.equal(r.status,200);}
const io={registerRoot:p=>roots.push(p),user:http,owner:async(path,method,body)=>{assert(roots.some(r=>path===r||path.startsWith(r+'/')));const r=await http(path,{method,body,token:'owner'});assert.equal(r.status,200);return r;}};
try{
  await rules('database.rules.json');
  for(let i=0;i<2;i++){const app=initializeApp({projectId:project,apiKey:'demo-api-key'},randomUUID());apps.push(app);
    const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});
    const user=(await signInAnonymously(auth)).user,db=getDatabase(app,base+'/?ns='+ns);connectDatabaseEmulator(db,'127.0.0.1',9000);
    subjects.push({uid:user.uid,token:await user.getIdToken(),db});}
  result=await runCases(io,subjects);
}catch(e){result={error:{code:e.code??e.message}};process.exitCode=1;}
finally{
  for(const subject of subjects)goOffline(subject.db);for(const app of apps)await deleteApp(app);
  await rules('deny.rules.json');cleanup.rulesClosed=true;
  for(const root of roots)await io.owner(root,'DELETE');
  cleanup.rootsEmpty=true;for(const root of roots){const r=await http(root,{token:'owner'});assert.equal(await r.json(),null);}
}
const report={sourceHashes,endSourceHashes:hashes(),...result,cleanup,restRequests:requests,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/local-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:report.reports?.length??0,error:report.error??null,cleanup,peakNodes:report.peakNodes,externalFirebaseConnected:false}));process.exit(process.exitCode??0);
