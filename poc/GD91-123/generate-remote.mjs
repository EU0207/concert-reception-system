import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
let source=fs.readFileSync(new URL('../GD91-119/remote.mjs',root),'utf8').replace(/\r\n/g,'\n');
function replace(a,b){assert(source.includes(a),'adaptation-target-missing:'+a);source=source.replaceAll(a,b);}
replace("from '../GD91-116/generate.mjs'","from './image-rules.mjs'");
replace("from '"+"./cases.mjs'","from './common-cases.mjs'");
source="import {appCheckTrial} from './app-check.mjs';\nimport {prepare,publish} from './model.mjs';\nimport {tinyPng} from './common-cases.mjs';\n"+source;
const scope={decisionId:'TECH-DD91-113',developerApprovalRequired:true,externalTrialCount:1,maxAuthUsers:5,
  realGoogleHumans:1,fakePasswordHumans:1,anonymousDevices:3,manualGoogleLoginRequired:true,
  fixtureReceptionPeople:0,fixtureMaxCellsPerGeneration:5,maxJsonNodes:4000,maxRootJsonBytes:1048576,
  maxApplicationCallsIncludingCleanup:600,cleanupCallReserve:80,maxObservedApplicationBodyBytes:20971520,
  appCheckDebugTokensCreatedAtMost:1,appCheckApiEnabledOnlyIfDisabled:true,previousApiStateRestored:true,
  realtimeDatabaseEnforcementTemporarilyEnabled:true,previousEnforcementRestored:true,
  debugSecretsAndIssuedTokensPersisted:false,propagationRoundsAtMost:33,propagationIntervalMillis:30000,
  conditions:['six-existing-capacity-sharing-sdk-paths','four-common-image-paths','valid-missing-invalid-app-check-rest',
    'invalid-auth-with-valid-app-check','fresh-sdk-image-read-after-enforcement'],
  productionAdoptionApproved:false,productionAttestationVerified:false,billingAccountRequired:false,tested3000:false};
const scopeLine=source.match(/const scope=\{[^\n]+;/)?.[0];assert(scopeLine);replace(scopeLine,'const scope='+JSON.stringify(scope)+';');
replace('TECH-DD91-109','TECH-DD91-113');
replace('--run-approved-upper-bound-and-closing','--run-approved-images-and-appcheck');
replace('GD91-119-upper-bound-and-closing','GD91-123-images-and-appcheck');
replace("../GD91-116/audit.mjs","./audit.mjs");
replace("['remote.mjs','cases.mjs','../GD91-116/generate.mjs'","['remote.mjs','common-cases.mjs','image-rules.mjs','app-check.mjs','model.mjs'");
replace("'generate.mjs':createHash('sha256').update(fs.readFileSync(new URL('generate.mjs',import.meta.url)","'generate-remote.mjs':createHash('sha256').update(fs.readFileSync(new URL('generate-remote.mjs',import.meta.url)");
replace("require('firebase/database');","require('firebase/database');const {initializeAppCheck,CustomProvider}=require('firebase/app-check');");
replace('let normalCalls=0,sdkCalls=0,','let appCheck,appCheckCalls=0,normalCalls=0,sdkCalls=0,');
replace('c.requests()+normalCalls+sdkCalls','c.requests()+normalCalls+sdkCalls+appCheckCalls');
replace('queryParams={}}={})','queryParams={},appCheckMode=\'valid\'}={})');
replace("if(filtered)for(const[k,v]of Object.entries(params))", "const attestation=appCheckMode==='valid'?await appCheck.token():appCheckMode==='invalid'?'invalid-attestation':null;if(attestation)url.searchParams.set('ac',attestation);if(filtered)for(const[k,v]of Object.entries(params))");
replace('apps.push(app);const auth=initializeAuth',
  'apps.push(app);initializeAppCheck(app,{provider:new CustomProvider({getToken:async()=>({token:await appCheck.token(),expireTimeMillis:appCheck.expiresAt()})}),isTokenAutoRefreshEnabled:false});const auth=initializeAuth');
const captured='s.trial.previousAuthorizedDomains=config.authorizedDomains??[];save();';
replace(captured,captured+`
  appCheck=await appCheckTrial({state:s,persist:save,count:()=>{reserve();appCheckCalls++;save();},bodyMeter:countBody,
    management:async(url,options={})=>{
      if(!options.pollOperation)return api(url,options);
      for(let i=0;i<20;i++){const r=await api(url);if(r.body.done){assert(!r.body.error,'service-operation-failed');return r;}await new Promise(r=>setTimeout(r,2000));}
      throw new Error('service-operation-deadline');
    }});await appCheck.prepare();`);
const cases='result=await runCases(io,m,a,{minimal:true});';
replace(cases,cases+`
  let enforced=false,rounds=0;
  for(;rounds<scope.propagationRoundsAtMost;rounds++){
    const valid=await normalRaw(m,'head'),missing=await normalRaw(m,'head',{appCheckMode:'missing'}),invalid=await normalRaw(m,'head',{appCheckMode:'invalid'});
    assert.equal(valid.status,200,'valid-app-check-denied');
    if([401,403].includes(missing.status)&&[401,403].includes(invalid.status)){enforced=true;break;}
    assert([200,401,403].includes(missing.status)&&[200,401,403].includes(invalid.status),'unexpected-enforcement-response');
    if(rounds+1<scope.propagationRoundsAtMost)await new Promise(r=>setTimeout(r,scope.propagationIntervalMillis));
  }
  assert(enforced,'app-check-enforcement-not-observed');
  const gate={id:'A01-app-check-rest-gate',validAccepted:true,missingAndInvalidDenied:true,propagationRounds:rounds+1};result.reports.push(gate);io.onReport(gate);
  assert([401,403].includes((await normalRaw({device:{token:'invalid-auth'}},'head')).status));
  const authGate={id:'A02-valid-app-check-does-not-grant-auth',invalidAuthDenied:true};result.reports.push(authGate);io.onReport(authGate);
  const png=tinyPng(),image=prepare(png,'image/png');
  assert.equal((await normalRaw(m,'images/1/banks/a',{method:'PUT',body:image})).status,200);
  assert.equal((await normalRaw(m,'images/1',{method:'PATCH',body:publish('1','a',image)})).status,200);
  assert.equal((await io.sdkRead(a,'images/1/head')).operationId,image.operationId);
  assert.equal((await io.sdkRead(a,'images/1/banks/a')).sha256,image.sha256);
  const fresh={id:'A03-enforced-fresh-sdk-image',freshSdkImageVerified:true};result.reports.push(fresh);io.onReport(fresh);
  result.appCheckEnforcementVerified=true;`);
const cleanupStart="  await clean('rules',async()=>";
replace(cleanupStart,"  await clean('appCheck',async()=>{if(appCheck)cleanup.appCheck=await appCheck.restore();else cleanup.appCheck={enforcementRestored:true,debugTokensRemoved:true,apiStateRestored:true};});\n"+cleanupStart);
replace('normalCalls,sdkApplicationCalls:sdkCalls','normalCalls,appCheckCalls,debugProviderOnly:true,productionAttestationVerified:false,sdkApplicationCalls:sdkCalls');
replace('cleanup.authRestored&&cleanup.billingAccountUnlinked){',
  'cleanup.authRestored&&cleanup.billingAccountUnlinked&&cleanup.appCheck?.enforcementRestored&&cleanup.appCheck?.debugTokensRemoved&&cleanup.appCheck?.apiStateRestored){');
assert(source.includes('explicit-approval-required'));assert(source.includes('trial-already-finished'));
assert(!source.includes('TECH-DD91-109'));fs.writeFileSync(new URL('remote.mjs',root),source);
console.log(JSON.stringify({decisionId:scope.decisionId,externalRequestsExecuted:0}));
