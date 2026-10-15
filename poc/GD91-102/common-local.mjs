import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {runLayoutCases} from './common-layout.mjs';
import {owner,user,request,trial,provision,issue,ok} from '../GD91-84/transport.mjs';
import {client} from '../GD91-89/sdk-client.mjs';import {cleanup} from '../GD91-89/support.mjs';
const files=['common-local.mjs','common-layout.mjs','database.rules.json','layout-model.mjs','layout-rules.mjs','publication.mjs','publication-rules.mjs','collection.mjs','collection-rules.mjs','snapshot.mjs','../GD91-100/database.rules.json','../GD91-07/planner.mjs','../GD91-84/transport.mjs','../GD91-84/generation-tests.mjs','../GD91-89/support.mjs','../GD91-89/sdk-client.mjs','../GD91-96/snapshot.mjs','../GD91-92/model.mjs','../GD91-92/references.mjs','../GD91-91/sdk-adapter.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')])),before=hashes();let a,result,clean,failure;
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{get,ref,query,orderByKey,startAt,limitToFirst}=require('firebase/database');
try{
  ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url)))}));
  const m=await provision('owner'),staff=await provision('receptionist');a=await client(staff.human);m.sessionRevision=0;a.sessionRevision=1;
  const io={performanceId:trial.split('/')[1],owner:(p,m='GET',b)=>owner(trial+(p?'/'+p:''),m,b),normal:(f,p,m='GET',b)=>user(p,f.device,m,b),issue:async f=>ok(await issue(f,++f.sessionRevision)),
    sdkRead:async(f,p,params)=>{let target=ref(f.db,trial+'/'+p);if(params)target=query(target,orderByKey(),startAt(JSON.parse(params.startAt)),limitToFirst(Number(params.limitToFirst)));return(await get(target)).val();}};
  result=await runLayoutCases(io,m,a);
}catch(e){failure={code:e.code??'trial-failed'};console.error(e.stack);process.exitCode=1;}finally{if(a)await a.close();clean=await cleanup();}
assert.deepEqual(before,hashes());fs.writeFileSync(new URL('artifacts/common-local-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),...result,cleanup:clean,...(failure?{failure}:{}),googleIdentityMocked:true,realSdkReadUsed:true,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false},null,2)+'\n');console.log(JSON.stringify({groups:result?.reports.length??0,cleanup:clean,failure:failure??null}));process.exit(process.exitCode??0);
