import assert from 'node:assert/strict';
import {trial,owner,user,check,provision,issue,session,ok,denied,actor} from './transport.mjs';

export async function authorizationTests(){
  await owner(trial+'/control','PUT',{state:'operating',revision:1});
  await owner(trial+'/probes','PUT',{general:'FAKE-public',management:'FAKE-private',sensitive:'FAKE-recent',temporary:'FAKE-temp'});
  const actors={};for(const role of ['owner','deputy','temporary','receptionist']){const f=await provision(role);ok(await issue(f));actors[role]=f;}
  for(const [role,f]of Object.entries(actors))await check('A-'+role,async()=>{
    ok(await user('probes/general',f.device));
    const manager=['owner','deputy'].includes(role);
    (manager?ok:denied)(await user('probes/management',f.device));
    (manager?ok:denied)(await user('probes/edit',f.device,'PUT','FAKE-edit'));
    (role==='temporary'?ok:denied)(await user('probes/temporary',f.device));
    denied(await user('probes/management',f.human));return{generalRead:true,management:manager,temporary:role==='temporary'};
  });
  const f=actors.owner;
  await check('A-session-forgery',async()=>{for(const changes of [{humanUid:actors.deputy.human.uid},{humanAuthTime:f.human.claims.auth_time*1000+1},{authProvider:'password'},{roleRevision:2},{expiresAt:Date.now()+13*3600000},{performanceId:'FAKE-other'},{extra:'FAKE-injected'}])denied(await issue(f,2,changes));denied(await user('sessions/'+f.device.uid,f.device,'PUT',session(f,2)));return{mutationsRejected:8};});
  await check('A-cross-human',async()=>{denied(await user('sessions/'+f.device.uid,actors.deputy.human,'PUT',session(f,2)));return{denied:true};});
  await check('A-unverified',async()=>{const bad=await provision('receptionist');bad.human=await actor('password',false);await owner(trial+'/devices/'+bad.device.uid+'/humanUid','PUT',bad.human.uid);await owner(trial+'/roles/'+bad.human.uid,'PUT',bad.role);denied(await issue(bad));return{denied:true};});
  await check('A-wrong-provider',async()=>{const bad=await provision('owner','password');denied(await issue(bad));return{denied:true};});
  await check('A-self-escalation',async()=>{denied(await user('roles/'+f.human.uid,f.device,'PUT',{...f.role,role:'owner',revision:2}));denied(await user('devices/'+f.device.uid,f.device,'PUT',f.registration));return{denied:true};});
  await check('A-malformed-role',async()=>{for(const changes of [{role:'FAKE-unknown'},{revision:1.5},{receptionBaselineRevision:1},{active:false},{endsAt:Date.now()-1000}]){await owner(trial+'/roles/'+f.human.uid,'PUT',{...f.role,...changes});denied(await user('probes/general',f.device));denied(await issue(f,2));}await owner(trial+'/roles/'+f.human.uid,'PUT',f.role);return{invalidStatesRejected:5,statesSeeded:true};});
  await check('A-device-revocation',async()=>{await owner(trial+'/devices/'+f.device.uid+'/active','PUT',false);denied(await user('probes/general',f.device));denied(await user('probes/edit',f.device,'PUT','FAKE'));denied(await issue(f,2));ok(await user('probes/general',actors.deputy.device));await owner(trial+'/devices/'+f.device.uid+'/active','PUT',true);return{stoppedDeviceDenied:true,otherContinues:true};});
  await check('A-session-revocation',async()=>{const old=await owner(trial+'/sessions/'+f.device.uid);ok(await user('sessions/'+f.device.uid,f.human,'PUT',{...old,active:false,revision:2}));denied(await user('probes/general',f.device));ok(await issue(f,3));ok(await user('probes/general',f.device));return{revokeAndReissue:true};});
  await check('A-expiration',async()=>{const old=await owner(trial+'/sessions/'+f.device.uid);await owner(trial+'/sessions/'+f.device.uid+'/expiresAt','PUT',Date.now()-1000);denied(await user('probes/general',f.device));await owner(trial+'/sessions/'+f.device.uid,'PUT',old);return{denied:true,expiredStateSeeded:true};});
  await check('A-recent-auth',async()=>{const old=await owner(trial+'/sessions/'+f.device.uid);await owner(trial+'/sessions/'+f.device.uid+'/humanAuthTime','PUT',Date.now()-901000);denied(await user('probes/sensitive',f.device));ok(await user('probes/management',f.device));await owner(trial+'/sessions/'+f.device.uid,'PUT',old);return{highImpactDenied:true,oldTimeSeeded:true};});
  await check('A-promotion-preparation',async()=>{const x=actors.receptionist;await owner(trial+'/roles/'+x.human.uid,'PUT',{...x.role,role:'temporary',revision:2,receptionBaselineRevision:1});ok(await user('probes/general',x.device));denied(await user('probes/temporary',x.device));await owner(trial+'/devices/'+x.device.uid+'/preparedRoleRevision','PUT',2);ok(await issue(x,2,{roleRevision:2}));ok(await user('probes/temporary',x.device));return{baselineGeneralOnly:true,newPreparationRequired:true};});
  await check('A-demotion',async()=>{const x=actors.temporary;await owner(trial+'/roles/'+x.human.uid,'PUT',{...x.role,role:'receptionist',revision:2,receptionBaselineRevision:0});denied(await user('probes/temporary',x.device));denied(await user('probes/general',x.device));await owner(trial+'/devices/'+x.device.uid+'/preparedRoleRevision','PUT',2);ok(await issue(x,2,{roleRevision:2}));ok(await user('probes/general',x.device));denied(await user('probes/temporary',x.device));return{oldPrivilegeDenied:true,newGeneralPreparationRequired:true};});
  await check('A-control',async()=>{await owner(trial+'/control/state','PUT','stopped');denied(await user('probes/general',f.device));ok(await user('probes/edit',f.device,'PUT','FAKE-stop-edit'));await owner(trial+'/control/state','PUT','closed');denied(await user('probes/edit',f.device,'PUT','FAKE-closed'));await owner(trial+'/control/state','PUT','operating');return{receptionStopped:true,closedEditingDenied:true};});
  return actors;
}
