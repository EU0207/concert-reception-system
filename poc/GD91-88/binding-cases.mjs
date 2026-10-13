import assert from 'node:assert/strict';
import {generation,partPlan,layoutItem,publish} from '../GD91-84/generation-tests.mjs';
import {proposal} from '../GD91-86/model.mjs';import {command} from './model.mjs';import {plan,key,sameEvent} from './receipt-client.mjs';
export const nodes=value=>value===null||typeof value!=='object'?1:1+Object.values(value).reduce((sum,v)=>sum+nodes(v),0);

export async function runBindingCases(io,manager,staff){
  let maxJsonNodes=0,sequence=0,controlRevision=1;const reports=[];
  async function normal(f,path,method,body,status=200){const r=await io.normal(f,path,method,body);assert.equal(r.status,status,'normal-status-mismatch');return r.body;}
  async function state(){return io.owner('event');}
  async function measure(){maxJsonNodes=Math.max(maxJsonNodes,nodes(await io.owner('')));assert(maxJsonNodes<=500,'node-budget');}
  async function control(stateName){controlRevision++;await io.owner('control','PUT',{state:stateName,revision:controlRevision});}
  async function operation(kind){const p=command(manager,await state(),kind,'person',{controlRevision});await normal(manager,'event','PATCH',p);await measure();return p;}
  async function scan(scanned,status=200){const p=plan(io.performanceId,staff,sequence+1,'person',scanned,{sourceControlRevision:controlRevision});await normal(staff,'receipts/'+staff.device.uid,'PATCH',p.body,status);if(status===200){sequence++;const result=await normal(staff,'receipts/'+staff.device.uid+'/events/'+key(sequence));assert(sameEvent(result,p.event));}return p;}
  await io.owner('','PUT',{control:{state:'preparing',revision:1}});
  for(const[f,role]of[[manager,'owner'],[staff,'receptionist']]){
    f.sessionRevision=0;await io.owner('roles/'+f.human.uid,'PUT',{active:true,role,revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});
    await io.owner('devices/'+f.device.uid,'PUT',{schemaVersion:2,performanceId:io.performanceId,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1});await io.issue(f,Date.now()+3600000);
  }
  const meta=generation('layout','layout',1).meta;await normal(manager,'generations/layout/meta','PUT',meta);await normal(manager,'generations/layout/sections/sec1','PUT',{name:'FAKE-section'});
  const part=partPlan('layout',meta,[layoutItem(0),layoutItem(1)]);await normal(manager,'','PATCH',part);await normal(manager,'generations/layout/meta','PUT',{...part['generations/layout/meta'],phase:'ready',revision:3});await normal(manager,'','PATCH',publish('layout',1,'initial-layout'));
  await normal(manager,'event/commit','PUT',{revision:1,operationId:'initialize'});await operation('register');
  async function assign(){const local=await state();local.seats??={};local.seats['cell-0']??={personId:'none',revision:1};await normal(manager,'event','PATCH',proposal(manager,local,'assign','cell-0','none','person'));}
  await assign();await operation('qrCreate');const first=(await state()).tickets.person;
  await control('operating');await scan(first);reports.push({id:'C01',normalRegistrationAssignmentAndQr:true,uncheckedQrAccepted:true,ownerPersonOrTicketWrites:0});
  await normal(manager,'event','PATCH',proposal(manager,await state(),'unassign','cell-0'),401);reports.push({id:'C02',generatedQrProtectsSeat:true});
  await control('stopped');await operation('qrReissue');const second=(await state()).tickets.person;assert.equal(second.credentialVersion,2);assert.equal((await state()).credentials[first.credentialRef].active,false);
  await control('operating');await scan(first,401);await scan(second);reports.push({id:'C03',oldReissueCredentialDenied:true,newCredentialAccepted:true});
  await control('stopped');await operation('cancelAttendance');assert.equal((await state()).people.person.active,false);assert.equal((await state()).seats['cell-0'].personId,'none');assert((await io.owner('receipts/'+staff.device.uid+'/events/'+key(1))).eventId);reports.push({id:'C04',absenceFreesSeat:true,priorReceiptPreserved:true});
  await operation('returnAttendance');const closed=(await state()).tickets.person;assert(closed.cycleClosed);assert.equal(closed.credentialRef,'');await assign();await operation('qrCreate');const third=(await state()).tickets.person;assert.equal(third.currentCycle,2);assert.equal(third.credentialVersion,first.credentialVersion);assert.notEqual(third.credentialRef,first.credentialRef);
  await control('operating');await scan(first,401);await scan({...third,currentCycle:1},401);await scan({...third,credentialRef:first.credentialRef},401);await scan(third);await measure();reports.push({id:'C05',equalVersionOldCycleDenied:true,mixedCycleAndCredentialDenied:2,currentAccepted:true,returnDoesNotRestoreOldQr:true});
  io.record({bindingGroups:reports.length,passed:true});
  return{reports,maxJsonNodes,acceptedReceipts:sequence,ownerControlAndAuthBootstrap:true,stopIsDeclarationNotDeviceProof:true,realStopAcknowledgementsVerified:false};
}
