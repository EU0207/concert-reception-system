import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const project='demo-concert-seat-gd91-83',ns=project+'-default-rtdb';
const root='checks/'+randomUUID(),apps=[],subjects=[],reports=[];
const sourceFiles=['generate.mjs','database.rules.json','deny.rules.json','firebase.json','local.mjs'];
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,hash(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n'))]));
const sourceHashes=hashes();
let requests=0,cleanup={rulesClosed:false,trialRootEmpty:false},failure;

async function http(path,{method='GET',body,token,headers={}}={}){
  const url=new URL('http://127.0.0.1:9000/'+path+'.json');
  url.searchParams.set('ns',ns);
  if(token&&token!=='owner')url.searchParams.set('auth',token);
  requests++;
  const r=await fetch(url,{method,headers:{'content-type':'application/json',...(token==='owner'?{authorization:'Bearer owner'}:{}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  return {status:r.status,body:await r.json(),etag:r.headers.get('etag')};
}
async function rules(file){assert.equal((await http('.settings/rules',{method:'PUT',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8')),token:'owner'})).status,200);}
async function owner(path,method='GET',body){assert(path===root||path.startsWith(root+'/'));const r=await http(path,{method,body,token:'owner'});assert.equal(r.status,200);return r.body;}
const eventPath=root+'/event';
function initial(){return {commit:{revision:1,operationId:'initial'},
  fragments:{f0001:{seats:{s001:'a001'}},f0002:{seats:{s002:'a002'}}},
  people:{a001:'s001',a002:'s002'},view:{s001:'a001',s002:'a002'},
  operations:{initial:{kind:'seed'}},tickets:{a001:{credentialRef:'FAKE-credential-1',everIssued:true},a002:{credentialRef:'FAKE-credential-2',everIssued:true}}};}
function proposal(state,id){const beforeA=state.fragments.f0001.seats.s001,beforeB=state.fragments.f0002.seats.s002;
  return {commit:{revision:state.commit.revision+1,operationId:id},
    'fragments/f0001/seats/s001':beforeB,'fragments/f0002/seats/s002':beforeA,
    'people/a001':beforeB==='a001'?'s001':'s002','people/a002':beforeB==='a002'?'s001':'s002',
    'view/s001':beforeB,'view/s002':beforeA,
    ['operations/'+id]:{kind:'swap',expectedRevision:state.commit.revision,resultRevision:state.commit.revision+1,beforeA,beforeB,afterA:beforeB,afterB:beforeA}};}
async function reset(){await owner(root,'PUT',{access:Object.fromEntries(subjects.map(x=>[x.uid,true])),event:initial()});}
const patch=(body,subject=subjects[0])=>http(eventPath,{method:'PATCH',body,token:subject.token});
async function denied(id,body){const before=await owner(eventPath),r=await patch(body),after=await owner(eventPath);assert.equal(r.status,401,id);assert.deepEqual(after,before,id);reports.push({id,status:r.status,stateUnchanged:true});}

try{
  await rules('database.rules.json');
  for(let i=0;i<2;i++){
    const app=initializeApp({projectId:project,apiKey:'demo-api-key'},randomUUID());apps.push(app);
    const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});
    const user=(await signInAnonymously(auth)).user;subjects.push({uid:user.uid,token:await user.getIdToken()});
  }
  await reset();
  const state=initial(),full=proposal(state,'swap-1'),entries=Object.entries(full);
  // 8更新先の全ての部分集合を通常利用者で送信。全体の前後をownerで照合する。
  let rejected=0;
  for(let mask=1;mask<(1<<entries.length)-1;mask++){
    const part=Object.fromEntries(entries.filter((_,i)=>mask&(1<<i)));
    const r=await patch(part);assert.equal(r.status,401,'subset '+mask);assert.deepEqual(await owner(eventPath),state,'subset '+mask);rejected++;
  }
  reports.push({id:'P01',updateLocations:entries.length,partialSubsetsRejected:rejected,stateUnchanged:true});
  const success=await patch(full);assert.equal(success.status,200);
  const committed=await owner(eventPath);assert.equal(committed.commit.revision,2);assert.equal(committed.fragments.f0001.seats.s001,'a002');
  assert.equal(committed.fragments.f0002.seats.s002,'a001');assert.deepEqual(committed.tickets,state.tickets);
  reports.push({id:'P02',crossFragmentSwapCommitted:true,revision:2,credentialReferencesUnchanged:true});
  // 応答を利用しなかった再開を模擬。同じ操作IDの内容照合を先に行い、再送しない。
  const result=await http(eventPath+'/operations/swap-1',{token:subjects[0].token});assert.equal(result.status,200);assert.deepEqual(result.body,full['operations/swap-1']);
  assert.equal((await owner(eventPath)).commit.revision,2);reports.push({id:'P03',resultFound:true,payloadMatches:true,secondCommitSent:false,physicalPacketLossSimulated:false});
  await denied('P04',full);
  const next=proposal(committed,'swap-2');next['operations/swap-2'].afterA='a002';await denied('P05',next);
  const extra=proposal(committed,'swap-3');extra['tickets/a001/everIssued']=false;await denied('P06',extra);
  const deleted=proposal(committed,'swap-4');deleted['people/a001']=null;await denied('P07',deleted);
  const view=proposal(committed,'swap-5');view['view/s001']='a002';await denied('P08',view);
  const unknown=proposal(committed,'swap-6');unknown['fragments/f0003/seats/s003']='a001';await denied('P09',unknown);
  const history=proposal(committed,'swap-7');history['operations/swap-1']=null;await denied('P10',history);
  const duplicate=proposal(committed,'swap-8');duplicate['fragments/f0002/seats/s002']='a001';await denied('P11',duplicate);
  const altered=proposal(committed,'swap-1');await denied('P12',altered);
  await reset();
  const [a,b]=await Promise.all([patch(proposal(initial(),'race-a')),patch(proposal(initial(),'race-b'),subjects[1])]);
  assert.deepEqual([a.status,b.status].sort(),[200,401]);const raced=await owner(eventPath);assert.equal(raced.commit.revision,2);
  assert.equal(Object.keys(raced.operations).length,2);reports.push({id:'P13',statuses:[a.status,b.status].sort(),successfulCommits:1});
  await reset();const revoked=proposal(initial(),'revoked');await owner(root+'/access/'+subjects[0].uid,'PUT',false);
  await denied('P14',revoked);assert.equal((await http(eventPath,{token:subjects[0].token})).status,401);
  assert.equal((await patch(proposal(initial(),'other'),subjects[1])).status,200);reports.push({id:'P15',otherAuthorizedSubjectContinues:true});
  // JSONの親全体をPUTしても、子の許可から親の書込み許可へは昇格しない。
  const now=await owner(eventPath);assert.equal((await http(eventPath,{method:'PUT',body:now,token:subjects[1].token})).status,401);
  assert.deepEqual(await owner(eventPath),now);reports.push({id:'P16',wholeEventPutDenied:true});
}catch(e){failure={code:e.code??'ASSERTION',message:e.message};process.exitCode=1;}
finally{
  await rules('deny.rules.json');
  cleanup.rulesClosed=JSON.stringify((await http('.settings/rules',{token:'owner'})).body)===JSON.stringify(JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')));
  await owner(root,'DELETE');cleanup.trialRootEmpty=(await owner(root))===null;
  for(const app of apps)await deleteApp(app);
}
const report={sourceHashes,endSourceHashes:hashes(),reports,cleanup,restRequests:requests,
  externalFirebaseConnected:false,fullBusinessRulesVerified:false,productionFreeTierVerified:false,tested3000:false,...(failure?{failure}:{})};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('local-summary.json',new URL('artifacts/',import.meta.url)),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup,restRequests:requests,externalFirebaseConnected:false}));
process.exit(process.exitCode??0);
