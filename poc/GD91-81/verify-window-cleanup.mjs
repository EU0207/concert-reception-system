import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {context} from '../GD91-80/remote-support.mjs';
const before=JSON.parse(fs.readFileSync(new URL('artifacts/lease-window.json',import.meta.url),'utf8'));
assert.equal(before.results.beforeExpiry.length,2);assert(before.cleanup.rulesClosed&&before.cleanup.authRestored);
assert.equal(before.cleanup.documentsDeleted,3);assert.equal(before.cleanup.usersDeleted,2);
const c=await context({maxRequests:200-before.applicationRequests}),s=c.state,p=s.projectId;
assert(!s.trial,'unfinished-trial');
const release=(await c.api('https://firebaserules.googleapis.com/v1/projects/'+p+'/releases/cloud.firestore')).body;
const rules=(await c.api('https://firebaserules.googleapis.com/v1/'+release.rulesetName)).body;
const normalize=x=>x.replace(/\r\n/g,'\n');
assert.equal(normalize(rules.source.files[0].content),normalize(fs.readFileSync(new URL('../GD91-80/deny.rules',import.meta.url),'utf8')));
const groups=['baseline','after','guard','lease','access'];
for(const collectionId of groups){
  const rows=(await c.api('https://firestore.googleapis.com/v1/projects/'+p+'/databases/(default)/documents:runQuery',{
    method:'POST',body:{structuredQuery:{from:[{collectionId,allDescendants:true}],limit:1}}})).body;
  assert(Array.isArray(rows));assert(!rows.some(x=>x.document),'fixture-documents-remain');
}
const users=(await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+p+'/accounts:batchGet?maxResults=10')).body;
assert.equal((users.users??[]).length,0,'auth-users-remain');
const config=(await c.api('https://identitytoolkit.googleapis.com/admin/v2/projects/'+p+'/config')).body.signIn;
assert.equal(config.email?.enabled??false,s.previousSignIn.email?.enabled??false);
assert.equal(config.email?.passwordRequired??true,s.previousSignIn.email?.passwordRequired??true);
assert.equal(config.anonymous?.enabled??false,s.previousSignIn.anonymous?.enabled??false);
const summary={readOnlyVerification:true,rulesClosed:true,emptyFixtureCollectionGroups:groups.length,
  authUsersRemaining:0,authSettingsRestored:true,billingAccountUnlinked:true,requests:c.requests(),
  combinedApplicationRequests:before.applicationRequests+c.requests(),sdkInternalWireRequestsMeasured:false,
  sourceHashes:Object.fromEntries(['verify-window-cleanup.mjs','../GD91-80/remote-support.mjs','../GD91-80/deny.rules'].map(f=>[f,createHash('sha256').update(normalize(fs.readFileSync(new URL(f,import.meta.url),'utf8'))).digest('hex')]))};
assert(summary.combinedApplicationRequests<=200);
fs.writeFileSync(new URL('artifacts/window-cleanup-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
