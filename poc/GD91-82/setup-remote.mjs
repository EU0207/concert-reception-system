import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {remoteContext} from './remote-support.mjs';
const c=await remoteContext(),s=c.state;assert(!s.trial);
const rules=(await c.owner('.settings/rules')).body;assert.equal(rules.rules['.read'],false);assert.equal(rules.rules['.write'],false);
assert.equal((await c.owner('')).body,null,'database-must-be-empty');
const url='https://identitytoolkit.googleapis.com/admin/v2/projects/'+s.projectId+'/config';
const before=(await c.api(url)).body;s.gd82PreviousAnonymous=before.signIn?.anonymous?.enabled??false;c.save();
const after=(await c.api(url+'?updateMask=signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{anonymous:{enabled:true}}}})).body;
assert(after.signIn.anonymous.enabled);s.gd82Ready=true;c.save();
const report={setupOnly:true,databaseReady:true,region:'asia-southeast1',rulesInitiallyClosed:true,databaseInitiallyEmpty:true,
  ownerVerified:true,billingAccountUnlinked:true,anonymousEnabledForTest:true,requests:c.requests(),productionAdoptionApproved:false,
  sourceHashes:Object.fromEntries(['setup-remote.mjs','remote-support.mjs','../GD91-80/remote-support.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]))};
fs.writeFileSync(new URL('artifacts/setup-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
