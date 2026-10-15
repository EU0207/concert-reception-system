import assert from 'node:assert/strict';import {namespace,issue} from '../GD91-84/transport.mjs';
// demo Authの同一本人を通常の認証経路で再認証する。時刻や権限を管理用書込みで差し替えない。
export function createReauthentication({afterMs=600000}={}){
 assert(namespace.startsWith('demo-'));assert(Number.isSafeInteger(afterMs)&&afterMs>=0);
 const stats={refreshes:0,emulatorAuthRequests:0,sessionRequests:0};
 async function ensure(actor){
  if(Date.now()-actor.human.claims.auth_time*1000<afterMs)return;
  const sub=actor.human.claims.firebase.identities['google.com'][0];assert.equal(actor.human.claims.firebase.sign_in_provider,'google.com');
  stats.emulatorAuthRequests++;
  const response=await fetch('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestUri:'http://localhost',postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub,email:actor.human.claims.email,email_verified:true})}).toString(),returnSecureToken:true}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200);const auth=await response.json(),claims=JSON.parse(Buffer.from(auth.idToken.split('.')[1],'base64url'));assert.equal(auth.localId,actor.human.uid);assert.equal(claims.firebase.sign_in_provider,'google.com');assert(claims.auth_time*1000>=Date.now()-5000);
  actor.human={uid:auth.localId,token:auth.idToken,claims};actor.sessionRevision=(actor.sessionRevision??1)+1;stats.sessionRequests++;
  assert.equal((await issue(actor,actor.sessionRevision)).status,200);stats.refreshes++;
 }
 return{ensure,stats};
}
