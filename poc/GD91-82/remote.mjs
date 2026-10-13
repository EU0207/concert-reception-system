import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {runCases} from './test-cases.mjs';import {remoteContext} from './remote-support.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,signInAnonymously}=require('firebase/auth');
const {getDatabase,goOffline}=require('firebase/database');assert.equal(process.argv[2],'--run-approved');
const c=await remoteContext(),s=c.state;assert(s.gd82Ready&&!s.trial);
const trial={purpose:'GD91-82',rtdbRoots:[],users:[]};s.trial=trial;c.save();
const files=['remote.mjs','remote-support.mjs','test-cases.mjs','database.rules.json','deny.rules.json','../GD91-80/remote-support.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),apps=[],subjects=[],cleanup={rulesClosed:false,rootsEmpty:false,authRestored:false,usersDeleted:0};let normalRequests=0,result;
const guard=()=>assert(c.requests()+normalRequests<165,'reserve-cleanup-budget');
const io={registerRoot:p=>{assert(/^checks\/[0-9a-f-]{36}$/.test(p));trial.rtdbRoots.push(p);c.save();},
  owner:async(path,method,body)=>{guard();return c.owner(path,method,body);},
  user:async(path,{method='GET',body,token,params={},stream=false,signal}={})=>{
    guard();assert(path.startsWith('checks/'));normalRequests++;
    const u=new URL(s.gd82DatabaseUrl+'/'+path+'.json');if(token)u.searchParams.set('auth',token);
    for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);
    return fetch(u,{method,headers:{'content-type':'application/json',...(stream?{Accept:'text/event-stream'}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal??AbortSignal.timeout(25000)});
  }};
try{
  const original=(await c.owner('.settings/rules')).body;assert.equal(original.rules['.read'],false);assert.equal(original.rules['.write'],false);
  await c.owner('.settings/rules','PUT',JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8')));
  for(let i=0;i<2;i++){const app=initializeApp(s.sdkConfig,randomUUID());apps.push(app);const auth=initializeAuth(app,{persistence:inMemoryPersistence});
    const user=(await signInAnonymously(auth)).user;trial.users.push(user.uid);c.save();
    const token=await user.getIdToken();assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aud,s.projectId);
    subjects.push({uid:user.uid,token,db:getDatabase(app,s.gd82DatabaseUrl)});}
  result=await runCases(io,subjects);
}catch(e){result={error:{code:e.apiCode??e.code??'unexpected-error',httpStatus:e.httpStatus??null}};process.exitCode=1;}
finally{
  for(const subject of subjects)goOffline(subject.db);for(const app of apps)try{await deleteApp(app);}catch{cleanup.localAppDeletionFailed=true;process.exitCode=1;}
  try{
    const deny=JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8'));
    await c.owner('.settings/rules','PUT',deny);assert.deepEqual((await c.owner('.settings/rules')).body,deny);cleanup.rulesClosed=true;
    for(const path of trial.rtdbRoots){await c.owner(path,'DELETE');assert.equal((await c.owner(path)).body,null);}cleanup.rootsEmpty=true;
    assert.equal((await c.owner('')).body,null,'remaining-data');
    for(const uid of trial.users){await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:delete',{method:'POST',body:{localId:uid}});cleanup.usersDeleted++;}
    const users=(await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:batchGet?maxResults=10')).body;
    assert.equal((users.users??[]).length,0);cleanup.authUsersRemaining=0;
    const url='https://identitytoolkit.googleapis.com/admin/v2/projects/'+s.projectId+'/config';
    await c.api(url+'?updateMask=signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{anonymous:{enabled:s.gd82PreviousAnonymous}}}});
    const auth=(await c.api(url)).body;assert.equal(auth.signIn?.anonymous?.enabled??false,s.gd82PreviousAnonymous);cleanup.authRestored=true;
    const billing=(await c.api('https://cloudbilling.googleapis.com/v1/projects/'+s.projectId+'/billingInfo')).body;
    assert(!billing.billingEnabled&&!billing.billingAccountName);cleanup.billingAccountUnlinked=true;
    cleanup.rootsDeleted=trial.rtdbRoots.length;delete s.trial;c.save();
  }catch(e){cleanup.error={code:e.apiCode??e.code??'unexpected-error',httpStatus:e.httpStatus??null};process.exitCode=1;}
}
const report={sourceHashes,endSourceHashes:hashes(),...result,cleanup,ownerAndManagementRequests:c.requests(),normalRestRequests:normalRequests,
  applicationRequests:c.requests()+normalRequests+(result?.sdkApplicationCalls??0)+subjects.length,
  sdkInternalWireRequestsMeasured:false,productionFreeTierVerified:false,productionAdoptionApproved:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);assert(report.applicationRequests<=200);
fs.writeFileSync(new URL('artifacts/remote-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:report.reports?.length??0,error:report.error??null,applicationRequests:report.applicationRequests,cleanup}));process.exit(process.exitCode??0);
