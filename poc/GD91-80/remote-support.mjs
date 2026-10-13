import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),auth=require('../POC-004/node_modules/firebase-tools/lib/auth.js');
const local=new URL('firebase-client-config.local.json',import.meta.url);
export async function context({maxRequests=100}={}){
  execFileSync('git',['check-ignore','-q',fileURLToPath(local)],{stdio:'pipe',windowsHide:true});
  assert.equal(execFileSync('git',['ls-files','--',fileURLToPath(local)],{encoding:'utf8',windowsHide:true}).trim(),'');
  const state=JSON.parse(fs.readFileSync(local,'utf8'));assert.equal(state.purpose,'GD91-80');assert(state.createdByThisRun&&state.ownerVerified&&state.billingVerifiedUnlinked);
  assert(/^crs-authcheck-20261013-[0-9a-f]{4}$/.test(state.projectId));
  const a=auth.getGlobalDefaultAccount(),t=await auth.getAccessToken(a.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  let requests=0;
  async function api(url,{method='GET',body,allowed=[200]}={}){
    const u=new URL(url);assert(u.protocol==='https:');assert(['cloudresourcemanager.googleapis.com','cloudbilling.googleapis.com',
      'firebase.googleapis.com','firestore.googleapis.com','identitytoolkit.googleapis.com','serviceusage.googleapis.com','firebaserules.googleapis.com'].includes(u.hostname));
    assert(++requests<=maxRequests,'management-request-budget');
    const r=await fetch(url,{method,headers:{authorization:'Bearer '+t.access_token,'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    const v=await r.json().catch(()=>({}));if(!allowed.includes(r.status))throw Object.assign(new Error('remote-api-rejected'),{httpStatus:r.status,apiCode:v.error?.status??'unknown'});
    return{status:r.status,body:v};
  }
  const billing=(await api('https://cloudbilling.googleapis.com/v1/projects/'+state.projectId+'/billingInfo')).body;
  assert(billing.billingEnabled!==true&&!billing.billingAccountName,'billing-must-remain-unlinked');
  const policy=(await api('https://cloudresourcemanager.googleapis.com/v1/projects/'+state.projectId+':getIamPolicy',{method:'POST',body:{}})).body;
  assert(policy.bindings?.some(b=>b.role==='roles/owner'&&b.members?.includes('user:'+a.user.email)),'owner-mismatch');
  async function poll(origin,name){
    assert(/^https:\/\/(firebase|firestore|serviceusage)\.googleapis\.com\/(v1|v1beta1)$/.test(origin));
    for(let i=0;i<20;i++){
      const o=(await api(origin+'/'+name)).body;
      if(o.done){if(o.error)throw Object.assign(new Error('operation-rejected'),{apiCode:o.error.status??o.error.code});return o.response??{};}
      await new Promise(r=>setTimeout(r,2000));
    }throw new Error('operation-deadline');
  }
  return{state,api,poll,save:()=>fs.writeFileSync(local,JSON.stringify(state,null,2)+'\n'),requests:()=>requests};
}
export const encode=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:
  typeof v==='string'?{stringValue:v}:v.$timestamp?{timestampValue:v.$timestamp}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
