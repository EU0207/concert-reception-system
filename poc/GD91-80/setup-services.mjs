import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {context} from './remote-support.mjs';
const c=await context(),{state:s,api,poll}=c,p=s.projectId;let stage='enable-required-apis';
const report={setupOnly:true,billingEnabled:false,billingAccountLinked:false,ownerVerified:true,hostingDeployed:false,secretKeyIssued:false,externalVerificationExecuted:false};
try{
  for(const service of['firestore.googleapis.com','identitytoolkit.googleapis.com','firebaserules.googleapis.com']){
    const url='https://serviceusage.googleapis.com/v1/projects/'+s.projectNumber+'/services/'+service;
    const before=(await api(url)).body;
    if(before.state!=='ENABLED'){const o=(await api(url+':enable',{method:'POST',body:{}})).body;if(o.name)await poll('https://serviceusage.googleapis.com/v1',o.name);}
  }
  stage='create-closed-database';
  const base='https://firestore.googleapis.com/v1/projects/'+p;
  const databases=(await api(base+'/databases')).body.databases??[];
  if(!databases.length){const o=(await api(base+'/databases?databaseId=(default)',{method:'POST',body:{locationId:'asia-northeast1',type:'FIRESTORE_NATIVE',databaseEdition:'STANDARD',pointInTimeRecoveryEnablement:'POINT_IN_TIME_RECOVERY_DISABLED'}})).body;
    if(o.name)await poll('https://firestore.googleapis.com/v1',o.name);}
  const database=(await api(base+'/databases/(default)')).body;
  assert.equal(database.type,'FIRESTORE_NATIVE');assert.equal(database.locationId,'asia-northeast1');assert(database.pointInTimeRecoveryEnablement!=='POINT_IN_TIME_RECOVERY_ENABLED');
  report.databaseReady=true;report.location=database.locationId;
  stage='create-web-config';
  if(!s.webAppId){const created=(await api('https://firebase.googleapis.com/v1beta1/projects/'+p+'/webApps',{method:'POST',body:{displayName:'Authorization validation'}})).body;
    const app=created.done?created.response:await poll('https://firebase.googleapis.com/v1beta1',created.name);s.webAppId=app.appId;c.save();}
  const sdk=(await api('https://firebase.googleapis.com/v1beta1/projects/'+p+'/webApps/'+s.webAppId+'/config')).body;
  assert.equal(sdk.projectId,p);assert(sdk.apiKey);s.sdkConfig={projectId:p,apiKey:sdk.apiKey,appId:s.webAppId};c.save();report.webConfigStoredOutsideGit=true;
  stage='configure-test-auth';
  const configUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+p+'/config';
  const original=await api(configUrl,{allowed:[200,404]});
  if(original.status===404){
    throw Object.assign(new Error('firebase-auth-console-initialization-required'),{apiCode:'AUTH_CONSOLE_INITIALIZATION_REQUIRED'});
  }
  const before=(await api(configUrl)).body;
  if(!Object.hasOwn(s,'previousSignIn'))s.previousSignIn=before.signIn??{};c.save();
  const updated=(await api(configUrl+'?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{
    method:'PATCH',body:{signIn:{email:{enabled:true,passwordRequired:true},anonymous:{enabled:true}}}})).body;
  assert(updated.signIn.email.enabled&&updated.signIn.anonymous.enabled);s.servicesReady=true;c.save();
  report.authReady=true;report.setupState='ready-for-minimal-verification';
}catch(e){report.setupState='requires-attention';report.failedStage=stage;report.error={code:e.apiCode??e.code??e.message,httpStatus:e.httpStatus??null};process.exitCode=1;}
report.managementRequests=c.requests();report.sourceHashes=Object.fromEntries(['setup-services.mjs','remote-support.mjs'].map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
fs.writeFileSync(new URL('artifacts/service-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
