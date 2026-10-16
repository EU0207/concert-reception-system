import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {runCases} from '../GD91-111/common-cases.mjs';
import {runReceiptCases} from '../GD91-111/receipt-diagnostic-cases.mjs';
import {serverOffset} from '../GD91-111/server-offset.mjs';
import {request,user,owner,trial,provision,issue,ok} from '../GD91-99/support.mjs';
import {actor} from '../GD91-84/transport.mjs';import {client} from '../GD91-89/sdk-client.mjs';import {cleanup} from '../GD91-89/support.mjs';
import {timingProbe} from './timing-probe.mjs';

const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{get,ref,onValue}=require('firebase/database');
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['local.mjs','../GD91-111/database.rules.json']);
const before=hashes(),clients=[],reports=[];let full,minimal,failure,clean;
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('../GD91-111/database.rules.json',import.meta.url)))}));
 const mh=await provision('owner'),ah=await provision('receptionist'),m=await client(mh.human),a=await client(ah.human);clients.push(m,a);
 m.sessionRevision=a.sessionRevision=1;await owner(trial+'/devices/'+mh.device.uid,'DELETE');await owner(trial+'/devices/'+ah.device.uid,'DELETE');
 const io={performanceId:trial.split('/')[1],owner:(p,method='GET',body)=>owner(trial+(p?'/'+p:''),method,body),normal:(s,p,method='GET',body)=>user(p,s.device,method,body),
  newDevice:async human=>({human,device:await actor(),sessionRevision:0}),issue:async s=>ok(await issue(s,++s.sessionRevision)),
  sdkRead:async(s,p)=>(await get(ref(s.db,trial+'/'+p))).val(),serverOffset:s=>serverOffset(s.db,{ref,onValue})};
 full=await runCases({...io,normal:timingProbe(io,'normal-business-preparation',reports)},m,a);
 minimal=await runReceiptCases({...io,normal:timingProbe(io,'seeded-minimal',reports)},a);
 assert.equal(reports.length,8);assert.equal(full.reports.length,4);assert.equal(full.existingCapacityGroups,6);
 assert.deepEqual(minimal.reports.map(r=>r.httpStatus),[200,401,200]);
}catch(error){failure={code:error.code??error.name};console.error(JSON.stringify(failure));process.exitCode=1;}
finally{for(const c of clients)await c.close();clean=await cleanup();}
assert.deepEqual(before,hashes());
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/local-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,fullCommonGroups:full?.reports.length,existingGroups:full?.existingCapacityGroups,minimalStatuses:minimal?.reports.map(r=>r.httpStatus),cleanup:clean,...(failure?{failure}:{}),externalFirebaseConnected:false,externalFailureCauseConfirmed:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({timingCases:reports.length,fullCommonGroups:full?.reports.length,failure:failure??null,cleanup:clean}));
process.exit(process.exitCode??0);
