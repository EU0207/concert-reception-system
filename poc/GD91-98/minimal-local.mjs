import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {runMinimalCases} from './minimal-cases.mjs';
import {actor,request,trial,owner,user,session,ok} from '../GD91-84/transport.mjs';
import {cleanup} from '../GD91-89/support.mjs';
const files=['minimal-local.mjs','minimal-cases.mjs','database.rules.json','quarantine.mjs','quarantine-rules.mjs','../GD91-96/queue.mjs','../GD91-88/receipt-client.mjs','../GD91-87/receipt-client.mjs','../GD91-84/transport.mjs','../GD91-84/auth-rules.mjs','../GD91-89/support.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const before=hashes();let result,clean,failure;
try{ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'))}));const human=await actor('password'),a={human,device:await actor()},b={human,device:await actor()};result=await runMinimalCases({performanceId:trial.split('/')[1],owner:(p,m='GET',body)=>owner(trial+(p?'/'+p:''),m,body),normal:(f,p,m='GET',body)=>user(p,f.device,m,body),issue:async f=>ok(await user('sessions/'+f.device.uid,f.human,'PUT',session(f)))},a,b);
}catch(e){failure={code:e.code??'trial-failed'};console.error(e.message);process.exitCode=1;}finally{clean=await cleanup();}
assert.deepEqual(before,hashes());fs.writeFileSync(new URL('artifacts/minimal-local-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),...result,cleanup:clean,...(failure?{failure}:{}),externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false},null,2)+'\n');console.log(JSON.stringify({groups:result?.reports.length??0,cleanup:clean,failure:failure??null}));process.exit(process.exitCode??0);
