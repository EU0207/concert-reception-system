import assert from 'node:assert/strict';

export async function restoreTrial({state,project,configUrl,googleUrl,deny,api,owned,appCheck,persist}){
 const j=state.trial,result={};
 const clean=async(name,fn)=>{try{await fn();result[name]=true;}catch(e){result[name]=false;result[name+'Failure']={code:e.apiCode??e.code??e.name,httpStatus:e.httpStatus??null};}};
 await clean('appCheckRestored',async()=>{result.appCheck=appCheck?await appCheck.restore():{enforcementRestored:true,debugTokensRemoved:true,apiStateRestored:true};assert(Object.values(result.appCheck).every(v=>v===true));});
 await clean('rulesClosed',async()=>{if(j.rulesChangeAttempted){assert(j.preflightOwnedAndEmpty);await owned('.settings/rules','PUT',deny);}assert.deepEqual(await owned('.settings/rules'),deny);});
 await clean('rootsEmpty',async()=>{assert(j.preflightOwnedAndEmpty||!j.rulesChangeAttempted);if(j.rulesChangeAttempted)for(const path of j.rtdbRoots){await owned(path,'DELETE');assert.equal(await owned(path),null);}assert.equal(await owned(''),null);});
 await clean('authUsersEmpty',async()=>{
  const current=(await api('https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:batchGet?maxResults=10')).body.users??[];
  assert(current.every(u=>j.users.includes(u.localId)),'unowned-auth-user-must-not-be-deleted');
  const existing=new Set(current.map(u=>u.localId));
  for(const uid of j.users){
   if(!existing.has(uid))continue;
   await api('https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:delete',{method:'POST',body:{localId:uid}});
   (j.deletedUsers??=[]).push(uid);persist();
  }
  const users=(await api('https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:batchGet?maxResults=10')).body.users??[];
  result.authUsersRemaining=users.length;assert.equal(users.length,0);
 });
 await clean('authSettingsRestored',async()=>{
  if(!j.authChangeAttempted)return;
  assert.equal(typeof j.previousAnonymous,'boolean');assert.equal(typeof j.previousGoogleEnabled,'boolean');assert(Array.isArray(j.previousAuthorizedDomains));
  await api(configUrl+'?updateMask=signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{anonymous:{enabled:j.previousAnonymous}}}});
  await api(googleUrl+'?updateMask=enabled',{method:'PATCH',body:{enabled:j.previousGoogleEnabled}});
  const restored=(await api(configUrl)).body,google=(await api(googleUrl)).body;
  assert.equal(restored.signIn?.anonymous?.enabled??false,j.previousAnonymous);assert.equal(google.enabled??false,j.previousGoogleEnabled);
  assert.deepEqual(restored.authorizedDomains??[],j.previousAuthorizedDomains);
 });
 await clean('billingUnlinked',async()=>{const r=(await api('https://cloudbilling.googleapis.com/v1/projects/'+project+'/billingInfo')).body;assert(!r.billingEnabled&&!r.billingAccountName);});
 result.complete=['appCheckRestored','rulesClosed','rootsEmpty','authUsersEmpty','authSettingsRestored','billingUnlinked'].every(k=>result[k]===true);
 j.cleanup=result;persist();return result;
}
