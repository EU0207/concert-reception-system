import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {runCases} from './cases.mjs';import {createBudget} from './budget.mjs';
import {request,user,owner,trial,provision,issue,ok} from '../GD91-84/transport.mjs';import {client} from '../GD91-89/sdk-client.mjs';import {cleanup} from '../GD91-89/support.mjs';
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['validate.mjs','run-local.mjs','../GD91-105/cases.mjs','../GD91-105/database.rules.json','../GD91-103/database.rules.json']);
const before=hashes(),require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{ref,get,set,update,remove}=require('firebase/database'),runs=[];
for(const spec of [{name:'baseline-unlimited',cache:false,minimal:true,enforce:false},{name:'baseline-capped',cache:false,minimal:true,enforce:true},{name:'cached-capped',cache:true,minimal:true,enforce:true},{name:'cached-full',cache:true,minimal:false,enforce:false}]){
 const clients=[],progress=[],budget=createBudget({enforce:spec.enforce});let result,failure,clean;
 try {
  ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('../GD91-105/database.rules.json',import.meta.url)))}));
  const human=await provision('owner'),staff=await provision('receptionist');
  const make=async human=>{const f=await client(human);f.sessionRevision=1;clients.push(f);return f;},m=await make(human.human),a=await make(staff.human);
  const io={performanceId:trial.split('/')[1],onReport:r=>progress.push({...r,applicationCalls:budget.summary().calls}),
   owner:(p,method='GET',body)=>{budget.count('owner-'+method,p);return owner(trial+(p?'/'+p:''),method,body);},
   normal:(f,p,method='GET',body)=>{budget.count('normal-'+method,p);return user(p,f.device,method,body);},
   issue:async f=>{budget.count('session','');return ok(await issue(f,++f.sessionRevision));},otherManager:f=>make(f.human),
   sdkRead:async(f,p)=>{budget.count('sdk-GET',p);return(await get(ref(f.db,trial+'/'+p))).val();},
   sdkWrite:async(f,p,method,body)=>{budget.count('sdk-'+method,p);const q=ref(f.db,trial+(p?'/'+p:''));if(method==='PUT')await set(q,body);else if(method==='PATCH')await update(q,body);else if(method==='DELETE')await remove(q);else throw Error('unsupported-write');return body;}
  };result=await runCases(io,m,a,spec);
 }catch(e){failure={code:e.code??'validation-failed',budgetStopped:budget.summary().stopped};if(!spec.enforce||spec.cache)console.error(e.stack);}
 finally{for(const c of clients)await c.close();clean=await cleanup();}
 runs.push({spec,...result,progress,budget:budget.summary(),failure:failure??null,cleanup:clean});
 console.log(JSON.stringify({name:spec.name,groups:progress.length,calls:budget.summary().calls,failure:failure??null,cleanup:clean}));
 if(spec.name==='baseline-capped'){assert(failure&&budget.summary().stopped);assert.equal(progress.length,3);assert.equal(budget.summary().calls,240);}else{assert(!failure);assert.equal(progress.length,spec.minimal?4:18);}
 assert(clean.rulesClosed&&clean.trialRootEmpty);
}
assert(runs[2].budget.calls<240);assert(runs[0].budget.calls>240);assert.equal(runs[0].progress.length,runs[2].progress.length);assert.deepEqual(before,hashes());
fs.writeFileSync(new URL('artifacts/validate-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),runs,realSdkReadAndWriteUsed:true,googleIdentityMocked:true,externalStartupCallsModelled:18,externalCleanupReserveModelled:60,localSetupAndCleanupNotIncludedInModel:true,externalFirebaseConnected:false,externalRetryExecuted:false,productionFreeTierVerified:false,tested3000:false},null,2)+'\n');
process.exit(0);
