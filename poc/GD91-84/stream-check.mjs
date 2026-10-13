import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {trial,project,namespace,request,owner,user,actor,issue,ok,sourceHashes,metrics,hash} from './transport.mjs';
import {runRevocations,restObserver} from './revocation-cases.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase/app'),{initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const {getDatabase,connectDatabaseEmulator,ref,onValue,goOffline}=require('firebase/database');
const files=['stream-check.mjs','revocation-cases.mjs','transport.mjs','auth-rules.mjs','generation-rules.mjs','shared-rules.mjs','generate.mjs','database.rules.json','deny.rules.json','firebase.json'];
const before=sourceHashes(files),apps=[],dbs=[],listeners=[],streams=[];let failure,result;
const fenced=process.argv[2]==='--data-revision',deployedRules=JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'));
if(fenced)deployedRules.rules.checks.$run.probes.general['.read']+=' && data.child(\'revision\').isNumber() && data.child(\'revision\').val() > 0';
async function rules(body){ok(await request('.settings/rules',{method:'PUT',token:'owner',body}));}
const io={owner:(p,method,body)=>owner(p?trial+'/'+p:trial,method,body),
  subjects:async()=>{const result=[];for(let i=0;i<2;i++){
    const human=await actor('password'),app=initializeApp({projectId:project,apiKey:'demo-api-key'},randomUUID());apps.push(app);
    const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});const signed=(await signInAnonymously(auth)).user;
    const device={uid:signed.uid,token:await signed.getIdToken()},db=getDatabase(app,'http://127.0.0.1:9000/?ns='+namespace);connectDatabaseEmulator(db,'127.0.0.1',9000);dbs.push(db);
    result.push({human,device,db,sessionRevision:0});}return result;},
  reset:async(f,endsAt)=>{await owner(trial+'/roles/'+f.human.uid,'PUT',{active:true,role:'receptionist',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt});await owner(trial+'/devices/'+f.device.uid,'PUT',{schemaVersion:2,performanceId:trial.split('/')[1],deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1});},
  issue:async(f,expiresAt)=>ok(await issue(f,++f.sessionRevision,{expiresAt})),
  sdkWatch:f=>{const state={seen:[],error:null},close=onValue(ref(f.db,trial+'/probes/general'),s=>state.seen.push(s.val()?.value),e=>{state.error=e.code;});listeners.push(close);return{state,close};},
  restWatch:async f=>{const controller=new AbortController(),url=new URL('http://127.0.0.1:9000/'+trial+'/probes/general.json');url.searchParams.set('ns',namespace);url.searchParams.set('auth',f.device.token);const stream=await restObserver(await fetch(url,{headers:{accept:'text/event-stream'},signal:controller.signal}),controller);streams.push(stream.close);return stream;},
  current:f=>user('probes/general',f.device),record:r=>console.log(JSON.stringify(r))};
let cleanup={rulesClosed:false,trialRootEmpty:false};
try{await rules(deployedRules);result=await runRevocations(io);}
catch(e){failure={code:e.code??'ASSERTION',message:e.message};process.exitCode=1;}
finally{for(const stop of listeners)stop();for(const close of streams)await close();for(const db of dbs)goOffline(db);for(const app of apps)await deleteApp(app);const deny=JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8'));await rules(deny);cleanup.rulesClosed=JSON.stringify((await request('.settings/rules',{token:'owner'})).body)===JSON.stringify(deny);await owner(trial,'DELETE');cleanup.trialRootEmpty=(await owner(trial))===null;}
const report={sourceHashes:before,endSourceHashes:sourceHashes(files),...result,metrics,cleanup,...(failure?{failure}:{}),ruleVariant:fenced?'data-revision':'baseline',deployedRulesHash:hash(deployedRules),externalFirebaseConnected:false,productionAuthorizationVerified:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);fs.writeFileSync(new URL('artifacts/'+(fenced?'stream-check-fence-summary.json':'stream-check-summary.json'),import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({groups:report.reports?.length??0,ruleVariant:report.ruleVariant,allComparedRevocationsVerified:report.allComparedRevocationsVerified,cleanup,failure:failure??null}));process.exit(process.exitCode??0);
