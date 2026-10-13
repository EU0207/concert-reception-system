import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {context} from '../GD91-80/remote-support.mjs';
const require=createRequire(import.meta.url),auth=require('../POC-004/node_modules/firebase-tools/lib/auth.js');
export async function remoteContext(){
  const c=await context({maxRequests:70}),s=c.state,account=auth.getGlobalDefaultAccount();
  // 既存CLIと同じ要求範囲を使う。サービスアカウント用スコープや秘密鍵を追加しない。
  const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/userinfo.email']);
  let requests=0;
  async function request(url,{method='GET',body,allowed=[200]}={}){
    const u=new URL(url);assert.equal(u.protocol,'https:');
    assert(u.origin==='https://firebasedatabase.googleapis.com'||(s.gd82DatabaseUrl&&u.origin===new URL(s.gd82DatabaseUrl).origin));
    assert(++requests+c.requests()<=180,'owner-request-budget');
    const r=await fetch(u,{method,headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
    const v=await r.json().catch(()=>null);if(!allowed.includes(r.status))throw Object.assign(new Error('rtdb-request-rejected'),{apiCode:v?.error?.status??'remote-rejected',httpStatus:r.status});
    return{status:r.status,body:v};
  }
  const list=(await request('https://firebasedatabase.googleapis.com/v1beta/projects/'+s.projectNumber+'/locations/-/instances')).body.instances??[];
  assert.equal(list.length,1,'initialize-one-default-database-in-console');const database=list[0];
  assert(database.name.endsWith('/'+s.projectId+'-default-rtdb'),'unexpected-instance');assert.equal(database.state,'ACTIVE');
  const u=new URL(database.databaseUrl);assert.equal(u.protocol,'https:');assert.equal(u.hostname,s.projectId+'-default-rtdb.asia-southeast1.firebasedatabase.app');
  s.gd82DatabaseUrl=u.origin;s.gd82InstanceName=database.name;c.save();
  return{...c,request,owner:async(path,method='GET',body)=>{
    assert(path==='.settings/rules'||path===''&&method==='GET'||s.trial?.rtdbRoots?.some(p=>path===p||path.startsWith(p+'/')),'outside-owned-trial');
    return request(s.gd82DatabaseUrl+'/'+path+'.json',{method,body});
  },requests:()=>requests+c.requests()};
}
