import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generated as legacy} from '../GD91-154/rules.mjs';
import {generated} from './rules.mjs';
import {exportBundle} from '../GD91-148/bundle.mjs';
import {session} from '../GD91-84/transport.mjs';
import {prepare} from '../GD91-123/model.mjs';
import {tinyPng} from '../GD91-123/common-cases.mjs';
import {importer} from './importer.mjs';

export async function guardCheck(io,source,human){
 const device=await io.anonymous(),f={human,device};
 const role={active:true,role:'owner',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000};
 await io.owner('target','','PATCH',{
  control:{state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1,closingSchemaVersion:1},
  ['roles/'+human.uid]:role,
  ['devices/'+device.uid]:{schemaVersion:2,performanceId:io.performanceId,deviceUid:device.uid,humanUid:human.uid,active:true,preparedRoleRevision:1}
 });
 const normal=(path,method,body)=>io.normal(f,'target',path,method,body);
 const ok=r=>assert([200,204].includes(r.status),'guard-positive-status:'+r.status);
 const deny=r=>assert([401,403].includes(r.status),'guard-negative-status:'+r.status);
 ok(await io.normal({device:{token:human.token}},'target','sessions/'+device.uid,'PUT',session(f,1,{performanceId:io.performanceId})));
 const client=await importer(io,exportBundle(source),f,{exportId:randomUUID(),sourceEnvironment:io.sourceEnvironment});
 const image=prepare(tinyPng(),'image/png'),path='images/0/banks/a';
 await io.applyRules(legacy());
 const oldImage=await normal(path,'PUT',image),oldBegin=await normal('','PATCH',client.beginPayload());
 deny(oldImage);deny(oldBegin);assert.equal(await io.owner('target','importHead'),null);
 await io.applyRules(generated());
 ok(await normal(path,'PUT',image));await io.owner('target','images','DELETE');
 const mixed={...client.beginPayload(),[path]:image};
 deny(await normal('','PATCH',mixed));
 assert.equal(await io.owner('target','importHead'),null);assert.equal(await io.owner('target','images'),null);
 for(const phase of ['missing','checking','verified','unexpected']){
  const head=randomUUID();await io.owner('target','deletionCheckHead','PUT',head);
  if(phase!=='missing')await io.owner('target','deletionChecks/'+head+'/meta/phase','PUT',phase);
  deny(await normal(path,'PUT',image));
  await io.owner('target','','PATCH',{deletionCheckHead:null,['deletionChecks/'+head]:null});
 }
 await client.begin();await client.recover();assert.equal(client.metadata().phase,'uploading');
 const report={id:'G01-inlet-freeze-and-mixed-update',legacyBeginStatus:oldBegin.status,legacyImageStatus:oldImage.status,missingHeadAllowed:true,malformedHeadDenied:true,checkingAndVerifiedDenied:true,mixedBeginDeniedAtomically:true,currentBeginAccepted:true,sourceOwnerSeeded:false,legacyRulesComparedLocallyOnly:true};
 io.report?.({id:report.id,passed:true});return{reports:[report],fullPipelineVerified:false};
}
