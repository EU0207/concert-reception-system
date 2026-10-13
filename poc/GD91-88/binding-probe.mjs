import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {trial,owner,user,request,provision,issue,ok} from '../GD91-84/transport.mjs';
import {build,layoutItem,publish} from '../GD91-84/generation-tests.mjs';import {proposal} from '../GD91-86/model.mjs';import {plan} from '../GD91-87/receipt-client.mjs';import {emptyEvent,command} from './model.mjs';
const source=fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'),ruleHash=createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex');
async function rules(body){ok(await request('.settings/rules',{method:'PUT',token:'owner',body}));}
const state=()=>owner(trial+'/event');let report;
try{await rules(JSON.parse(source));await owner(trial+'/control','PUT',{state:'operating',revision:1});const a=await provision('owner'),r=await provision('receptionist');ok(await issue(a));ok(await issue(r));await build(a,'layout','layout',[layoutItem(0)]);ok(await user('',a.device,'PATCH',publish('layout',1,'layout')));await owner(trial+'/event','PUT',emptyEvent(['cell-0']));
 const send=async kind=>ok(await user('event',a.device,'PATCH',command(a,await state(),kind,'a',{controlRevision:1}))),assign=async()=>ok(await user('event',a.device,'PATCH',proposal(a,await state(),'assign','cell-0','none','a')));
 await send('register');await assign();await send('qrCreate');const old=(await state()).tickets.a;await owner(trial+'/control/state','PUT','stopped');await send('cancelAttendance');await send('returnAttendance');await assign();await send('qrCreate');await send('ticketCheck');await owner(trial+'/control/state','PUT','operating');const current=(await state()).tickets.a;
 assert.equal(current.credentialVersion,old.credentialVersion);assert.notEqual(current.currentCycle,old.currentCycle);assert.notEqual(current.credentialRef,old.credentialRef);
 const oldVersionOnly=plan(trial.split('/')[1],r,1,'a',{credentialVersion:old.credentialVersion});const response=await user('receipts/'+r.device.uid,r.device,'PATCH',oldVersionOnly.body);assert.equal(response.status,200);
 report={rulesHash:ruleHash,oldVersionOnlyRequestAccepted:true,oldAndNewCredentialVersionsEqual:true,currentCycleChanged:true,credentialIdChanged:true,productionAcceptanceClaimed:false,externalFirebaseConnected:false};
}finally{const deny=JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8'));await rules(deny);assert.deepEqual((await request('.settings/rules',{token:'owner'})).body,deny);await owner(trial,'DELETE');assert.equal(await owner(trial),null);}
report.cleanup={rulesClosed:true,trialRootEmpty:true};fs.writeFileSync(new URL('artifacts/pre-binding-probe.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
