import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';import fs from 'node:fs';
const root=new URL('./',import.meta.url),results=[];
execFileSync(process.execPath,['poc/GD91-139/generate.mjs'],{windowsHide:true,stdio:'pipe'});
for(const people of (process.argv.includes('--smoke')?[4]:[4,600,1000])){
 for(const port of [8383,9493,4488,4588,9150])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
 const command='node poc/GD91-139/local.mjs --people='+people;
 const child=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-center-gd91-139','--config','poc/GD91-139/firebase.json','--only','auth,firestore',command],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
 const [code]=await once(child,'exit');
 const result=JSON.parse(fs.readFileSync(new URL('artifacts/profile-'+people+'.json',root)));results.push(result);
 if(code!==0||result.failure||result.cleanup.error){process.exitCode=1;break;}
}
const first=results[0];assert(first);
for(const r of results){assert.deepEqual(r.sourceHashes,first.sourceHashes);assert.deepEqual(r.endSourceHashes,r.sourceHashes);assert.equal(r.rulesHash,first.rulesHash);}
const meter=Object.fromEntries(Object.keys(first.meter).map(k=>[k,k==='maxRequestJsonBytes'?Math.max(...results.map(r=>r.meter[k])):results.reduce((sum,r)=>sum+r.meter[k],0)]));
const summary={...first,reports:results.flatMap(r=>r.reports),profiles:results.flatMap(r=>r.profiles),meter,
 accessChecks:results.reduce((sum,r)=>sum+r.accessChecks,0),blockedGroups:results.reduce((sum,r)=>sum+r.blockedGroups,0),
 cleanup:{sdkClientsClosed:results.every(r=>r.cleanup.sdkClientsClosed),rulesClosed:results.every(r=>r.cleanup.rulesClosed),trialDocumentsEmpty:results.every(r=>r.cleanup.trialDocumentsEmpty),authUsersRemaining:results.reduce((sum,r)=>sum+(r.cleanup.authUsersRemaining??-1),0)},
 failure:results.find(r=>r.failure)?.failure,isolatedEmulatorPerProfile:true,javaHeapLimitGiB:8,
 accessGateCandidateVerified:results.every(r=>r.accessGateCandidateVerified),profileArtifacts:results.map(r=>'profile-'+r.profiles[0]?.people+'.json')};
if(results.some(r=>r.cleanup.error))summary.cleanup.error='profile cleanup failed; inspect profile artifacts';
fs.writeFileSync(new URL('artifacts/'+(process.argv.includes('--smoke')?'smoke-summary.json':'local-summary.json'),root),JSON.stringify(summary,null,2)+'\n');
