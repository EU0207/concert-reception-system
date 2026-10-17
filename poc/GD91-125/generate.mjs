import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
let helper=fs.readFileSync(new URL('../GD91-123/app-check.mjs',root),'utf8').replace(/\r\n/g,'\n');
function replaceHelper(a,b){assert(helper.includes(a),'helper-adaptation-missing');helper=helper.replace(a,b);}
replaceHelper("||path===app+':exchangeDebugToken'",'');
replaceHelper("const r=await admin(app+':exchangeDebugToken',{method:'POST',body:{debugToken:debugSecret}});",`
    // 公式JS SDK client.tsに対応。管理用OAuthと交換要求を混ぜない。
    const apiKey=state.sdkConfig.apiKey;assert(typeof apiKey==='string'&&apiKey.length>0,'missing-web-api-key');
    const url=new URL(api+'projects/'+state.projectId+'/apps/'+appId+':exchangeDebugToken');url.searchParams.set('key',apiKey);
    const body={debug_token:debugSecret};count();bodyMeter(body);
    const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    const value=await response.json().catch(()=>({}));bodyMeter(value);
    if(response.status!==200)throw Object.assign(new Error('app-check-exchange-rejected'),{httpStatus:response.status,apiCode:value.error?.status??'unknown'});
    const r={body:value};`);
fs.writeFileSync(new URL('app-check.mjs',root),helper);
let remote=fs.readFileSync(new URL('../GD91-123/remote.mjs',root),'utf8').replace(/\r\n/g,'\n');
const replace=(a,b)=>{assert(remote.includes(a),'remote-adaptation-missing:'+a);remote=remote.replaceAll(a,b);};
for(const name of ['model.mjs','common-cases.mjs','image-rules.mjs'])replace("'./"+name+"'","'../GD91-123/"+name+"'");
replace("'common-cases.mjs','image-rules.mjs','app-check.mjs','model.mjs'","'../GD91-123/common-cases.mjs','../GD91-123/image-rules.mjs','app-check.mjs','../GD91-123/model.mjs'");
replace('TECH-DD91-113','TECH-DD91-114');replace('GD91-123-images-and-appcheck','GD91-125-images-and-appcheck');
replace('--run-approved-images-and-appcheck','--run-approved-images-and-appcheck-retry');
replace('generate-remote.mjs','generate.mjs');
const guard="execFileSync(process.execPath,[fileURLToPath(new URL('./audit.mjs',import.meta.url))]";
replace(guard,`const prior=JSON.parse(fs.readFileSync(new URL('../GD91-123/artifacts/remote-summary.json',import.meta.url)));
assert.equal(prior.decisionId,'TECH-DD91-113');assert.equal(prior.failure?.httpStatus,401);
for(const flag of ['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(prior.cleanup[flag],true);
assert.equal(prior.cleanup.authUsersRemaining,0);assert(Object.values(prior.cleanup.appCheck).every(x=>x===true));
`+guard);
fs.writeFileSync(new URL('remote.mjs',root),remote);
let test=fs.readFileSync(new URL('../GD91-123/app-check-test.mjs',root),'utf8').replace(/\r\n/g,'\n');
const replaceTest=(a,b)=>{assert(test.includes(a),'test-adaptation-missing:'+a);test=test.replaceAll(a,b);};
replaceTest("'generate-remote.mjs'","'generate.mjs'");replaceTest('TECH-DD91-113','TECH-DD91-114');
replaceTest("sdkConfig:{appId:'1:1234:web:abcd'}","sdkConfig:{appId:'1:1234:web:abcd',apiKey:'fake-web-api-key'}");
replaceTest("const body=options.body?JSON.parse(options.body):null;let value={};",`
    const exchange=url.pathname.endsWith(':exchangeDebugToken');
    if(exchange){assert.equal(url.searchParams.get('key'),'fake-web-api-key');assert.equal(options.headers.authorization,undefined);
      assert.equal(url.pathname,'/v1/projects/crs-authcheck-20261013-abcd/apps/1:1234:web:abcd:exchangeDebugToken');}
    else{assert.equal(url.searchParams.get('key'),null);assert.equal(options.headers.authorization,'Bearer fake-owner');}
    const body=options.body?JSON.parse(options.body):null;let value={};`);
replaceTest("assert.equal(body.debugToken,secret);value={token:'fake-issued-'+randomUUID(),ttl:'3600s'};",`
      assert.deepEqual(Object.keys(body),['debug_token']);assert.equal(body.debug_token,secret);
      if(failAt==='exchange-401')return{status:401,json:async()=>({error:{status:'UNAUTHENTICATED'}})};
      value={token:'fake-issued-'+randomUUID(),ttl:'3600s'};`);
replaceTest("await scenario('foreign-project-number',{failAt:'foreign-project'});", "await scenario('foreign-project-number',{failAt:'foreign-project'});await scenario('exchange-401-restored',{failAt:'exchange-401'});");
replaceTest("console.log(JSON.stringify({mockAndGuardCases:reports.length", "console.log(JSON.stringify({httpContractVerified:true,mockAndGuardCases:reports.length");
fs.writeFileSync(new URL('app-check-test.mjs',root),test);
console.log(JSON.stringify({decisionId:'TECH-DD91-114',generated:true,externalRequestsExecuted:0}));
