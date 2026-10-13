// 承認済みの検証専用環境を作成する。既存環境への接続設定を流用しない。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),auth=require('../POC-004/node_modules/firebase-tools/lib/auth.js');
const local=new URL('firebase-client-config.local.json',import.meta.url),localPath=fileURLToPath(local);
const command=process.argv[2];assert.equal(command,'--create-new');
const git=args=>execFileSync('git',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
git(['check-ignore','-q',localPath]);
assert.equal(git(['ls-files','--',localPath]).trim(),'','local-config-is-tracked');
const accounts=auth.getAllAccounts();assert.equal(accounts.length,1,'select-google-account-before-setup');
const account=auth.getGlobalDefaultAccount();assert(account?.user?.email,'firebase-login-required');
let state=fs.existsSync(local)?JSON.parse(fs.readFileSync(local,'utf8')):{
  projectId:'crs-authcheck-20261013-'+randomBytes(2).toString('hex'),purpose:'GD91-80',createdByThisRun:false};
assert.equal(state.purpose,'GD91-80');assert(/^crs-authcheck-20261013-[0-9a-f]{4}$/.test(state.projectId));
const save=()=>fs.writeFileSync(local,JSON.stringify(state,null,2)+'\n');save();
let stage='create-project',managementRequests=0;
const summary={schemaVersion:1,setupOnly:true,newDedicatedProject:true,externalVerificationExecuted:false,
  hostingDeployed:false,billingEnabledByThisRun:false,secretKeyIssued:false,cliInternalRequestsMeasured:false};
try{
  if(!state.createdByThisRun){
    // CLIの出力には環境識別子があるため、端末出力へ転記しない。
    execFileSync(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','projects:create',state.projectId,
      '--display-name','Concert authorization validation','--non-interactive','--json'],{
      encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:1024*1024});
    state.createdByThisRun=true;save();
  }
  stage='verify-owner-and-billing';
  const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  assert(token?.access_token,'firebase-login-required');
  async function read(url,body){
    const parsed=new URL(url);assert(['cloudresourcemanager.googleapis.com','cloudbilling.googleapis.com','firebase.googleapis.com'].includes(parsed.hostname));
    managementRequests++;
    const r=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    const value=await r.json();if(!r.ok)throw Object.assign(new Error('management-request-failed'),{httpStatus:r.status,apiCode:value.error?.status});return value;
  }
  const policy=await read('https://cloudresourcemanager.googleapis.com/v1/projects/'+state.projectId+':getIamPolicy',{});
  summary.ownerMatchesCurrentCliAccount=policy.bindings?.some(b=>b.role==='roles/owner'&&b.members?.includes('user:'+account.user.email))??false;
  assert(summary.ownerMatchesCurrentCliAccount,'project-owner-not-current-account');
  const billing=await read('https://cloudbilling.googleapis.com/v1/projects/'+state.projectId+'/billingInfo');
  summary.billingEnabled=billing.billingEnabled===true;summary.billingAccountLinked=Boolean(billing.billingAccountName);
  assert(!summary.billingEnabled&&!summary.billingAccountLinked,'billing-must-remain-unlinked');
  const project=await read('https://firebase.googleapis.com/v1beta1/projects/'+state.projectId);
  assert.equal(project.state,'ACTIVE');state.billingVerifiedUnlinked=true;state.ownerVerified=true;state.projectNumber=project.projectNumber;save();
  summary.projectActive=true;summary.setupState='project-created-and-checked';
}catch(e){
  // 生のCLI応答や認証情報はログ・公開結果へ出さない。
  summary.setupState='requires-attention';summary.failedStage=stage;
  summary.error={code:e.apiCode??e.code??'setup-failed',httpStatus:e.httpStatus??null,processStatus:e.status??null};
  summary.projectCreationAcknowledged=state.createdByThisRun;process.exitCode=1;
}
summary.managementRequests=managementRequests;
summary.sourceHashes={'setup-project.mjs':createHash('sha256').update(fs.readFileSync(new URL('setup-project.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')};
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/setup-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
