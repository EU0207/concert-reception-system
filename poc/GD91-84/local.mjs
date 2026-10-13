import fs from 'node:fs';import assert from 'node:assert/strict';
import {trial,request,owner,reports,metrics,sourceHashes} from './transport.mjs';
import {authorizationTests} from './authorization-tests.mjs';
const files=['auth-rules.mjs','generate.mjs','database.rules.json','deny.rules.json','firebase.json','transport.mjs','authorization-tests.mjs','local.mjs'];
const before=sourceHashes(files);let failure,cleanup={rulesClosed:false,trialRootEmpty:false};
async function rules(file){const r=await request('.settings/rules',{method:'PUT',token:'owner',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'))});assert.equal(r.status,200,JSON.stringify(r.body));}
try{await rules('database.rules.json');await authorizationTests();}
catch(e){failure={code:e.code??'ASSERTION',message:e.message};process.exitCode=1;}
finally{await rules('deny.rules.json');cleanup.rulesClosed=JSON.stringify((await request('.settings/rules',{token:'owner'})).body)===JSON.stringify(JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')));await owner(trial,'DELETE');cleanup.trialRootEmpty=(await owner(trial))===null;}
const report={sourceHashes:before,endSourceHashes:sourceHashes(files),reports,metrics,cleanup,...(failure?{failure}:{}),externalFirebaseConnected:false,productionAuthorizationVerified:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/local-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup}));process.exit(process.exitCode??0);
