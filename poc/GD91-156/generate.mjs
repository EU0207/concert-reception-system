import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
let meter=fs.readFileSync(new URL('../GD91-155/meter.mjs',root),'utf8').replace(/\r\n/g,'\n');
function replace(text,a,b){assert(text.includes(a),a);return text.replace(a,b);}
meter=replace(meter,'cleanupMode:false,groups:{}','cleanupMode:false,groups:{},oauthRequests:0,serviceRequests:0,lastBlockedReason:null');
meter=replace(meter,"const url=new URL(input);assert(allow(url),'unapproved-endpoint');",`const url=new URL(input);
   const block=reason=>{state.lastBlockedReason=reason;onProgress();throw Error('transport-policy-'+reason);};
   const oauth=url.origin==='https://www.googleapis.com'&&url.pathname==='/oauth2/v3/token'&&url.search==='';
   if(!oauth&&!allow(url))block('unapproved-endpoint');
   if(oauth){
    if(options.method!=='POST'||!Buffer.isBuffer(options.body)||options.body.length>16384)block('oauth-request-shape');
    const contentType=new Headers(options.headers).get('content-type')??'';
    if(!contentType.startsWith('multipart/form-data; boundary='))block('oauth-content-type');
    if(state.oauthRequests>=scope.maxOAuthCredentialRefreshCalls+(state.cleanupMode?scope.cleanupOAuthRefreshReserve:0))block('oauth-call-budget');
   }`);
meter=replace(meter,"assert(options.body===undefined||typeof options.body==='string','unsupported-request-body');","assert(options.body===undefined||typeof options.body==='string'||oauth&&Buffer.isBuffer(options.body),'unsupported-request-body');");
meter=replace(meter,'state.requests++;state.groups[tag]',"state.requests++;if(oauth)state.oauthRequests++;else state.serviceRequests++;state.groups[tag]");
meter=replace(meter,'fetcher(input,{...options,signal})',"fetcher(input,{...options,...(oauth?{redirect:'error'}:{}),signal})");
fs.writeFileSync(new URL('meter.mjs',root),meter);
let remote=fs.readFileSync(new URL('../GD91-155/remote.mjs',root),'utf8').replace(/\r\n/g,'\n');
for(const name of ['rules','cases','restore'])remote=replace(remote,"from './"+name+".mjs'","from '../GD91-155/"+name+".mjs'");
remote=remote.replaceAll('GD91-155','GD91-156').replaceAll('gd155','gd156');
// 既存の業務検証コードと固定fixtureは155をそのまま使う。
for(const name of ['rules','cases','restore'])remote=replace(remote,"from '../GD91-156/"+name+".mjs'","from '../GD91-155/"+name+".mjs'");
remote=replace(remote,"new URL('artifacts/source-fixture-summary.json',root)","new URL('../GD91-155/artifacts/source-fixture-summary.json',root)");
remote=replace(remote,"new URL('node_modules/.cache/source-fixture.json',root)","new URL('../GD91-155/node_modules/.cache/source-fixture.json',root)");
remote=replace(remote,"['requests','requestBodyBytes','responseBodyBytes']","['requests','requestBodyBytes','responseBodyBytes','oauthRequests','serviceRequests']");
remote=replace(remote,"const files=['remote.mjs','restore.mjs','rules.mjs','cases.mjs','post-publish.mjs','importer.mjs'","const files=['remote.mjs','../GD91-155/restore.mjs','../GD91-155/rules.mjs','../GD91-155/cases.mjs','../GD91-155/post-publish.mjs','../GD91-155/importer.mjs'");
remote=replace(remote,'externalFirebaseConnected:true,productionImplementation:false','externalFirebaseConnected:b.state.serviceRequests>0,transportPolicyFailure:b.state.lastBlockedReason,productionImplementation:false');
remote=replace(remote,'if(!recovery){\n execFileSync',`if(!recovery){
 const preparation=JSON.parse(fs.readFileSync(new URL('../GD91-155/artifacts/stop-audit-summary.json',root)));
 assert.equal(preparation.serviceApiRequestsIssued,0);assert.equal(preparation.externalRequestsIssued,0);
 assert.equal(preparation.externalTrialStarted,false);assert.equal(preparation.approvedExternalTrialRemaining,true);
 execFileSync`);
fs.writeFileSync(new URL('remote.mjs',root),remote);
for(const name of ['meter-check.mjs','offline-guard.mjs','preflight-check.mjs']){
 let code=fs.readFileSync(new URL('../GD91-155/'+name,root),'utf8').replace(/\r\n/g,'\n');
 if(name==='preflight-check.mjs'){
  code=replace(code,"'--run-approved-118','--diagnostic'","'--run-approved-118','--run-approved-120','--diagnostic'");
 }
 fs.writeFileSync(new URL(name,root),code);
}
console.log(JSON.stringify({generated:['meter.mjs','remote.mjs','meter-check.mjs','preflight-check.mjs','offline-guard.mjs'],externalRequestsExecuted:0}));
