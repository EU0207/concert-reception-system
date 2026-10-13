import fs from 'node:fs';import assert from 'node:assert/strict';
import {trial,request,owner,reports,metrics,sourceHashes} from './transport.mjs';
import {authorizationTests} from './authorization-tests.mjs';
import {generationTests} from './generation-tests.mjs';
import {capacityTests} from './capacity-tests.mjs';
import {sharedTests} from './shared-tests.mjs';
const files=['auth-rules.mjs','generate.mjs','generation-rules.mjs','generation-tests.mjs','capacity-tests.mjs','shared-rules.mjs','shared-tests.mjs','database.rules.json','deny.rules.json','firebase.json','transport.mjs','authorization-tests.mjs','local.mjs'];
const before=sourceHashes(files);let failure,cleanup={rulesClosed:false,trialRootEmpty:false};
async function rules(file){const r=await request('.settings/rules',{method:'PUT',token:'owner',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'))});assert.equal(r.status,200,JSON.stringify(r.body));}
try{await rules('database.rules.json');const actors=await authorizationTests();await generationTests(actors);await sharedTests(actors);await capacityTests(actors);}
catch(e){failure={code:e.code??'ASSERTION',message:e.message};console.error(e.stack);fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});const coverage=await fetch('http://127.0.0.1:9000/.inspect/coverage.json?ns=demo-concert-seat-gd91-84-default-rtdb').then(r=>r.text());fs.writeFileSync(new URL('node_modules/.cache/coverage.json',import.meta.url),coverage);process.exitCode=1;}
finally{await rules('deny.rules.json');cleanup.rulesClosed=JSON.stringify((await request('.settings/rules',{token:'owner'})).body)===JSON.stringify(JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')));await owner(trial,'DELETE');cleanup.trialRootEmpty=(await owner(trial))===null;}
const report={sourceHashes:before,endSourceHashes:sourceHashes(files),reports,metrics,cleanup,...(failure?{failure}:{}),externalFirebaseConnected:false,productionAuthorizationVerified:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/local-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup}));process.exit(process.exitCode??0);
