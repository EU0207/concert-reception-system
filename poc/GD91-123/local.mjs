import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '../POC-001/node_modules/playwright/index.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {generated as previous} from '../GD91-116/generate.mjs';
import {request,user,owner,trial,provision,issue,ok,denied,metrics} from '../GD91-84/transport.mjs';
import {cleanup} from '../GD91-89/support.mjs';
import {setup} from '../GD91-108/setup.mjs';
import {generated} from './image-rules.mjs';
import {prepare,decode,publish,remove,digest} from './model.mjs';
import {withTlsReaders} from './tls-reads.mjs';

const root=new URL('./',import.meta.url),files=['local.mjs','image-rules.mjs','model.mjs','run-local.mjs'];
const hashes=()=>sourceHashes(root,files),before=hashes(),reports=[];
let browser,clean,failure,stage='setup',externalBrowserRequests=0;
const record=async(id,fn)=>{stage=id;const value=await fn();reports.push({id,...value});console.log(JSON.stringify({case:id,passed:true}));};
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function paddedPng(small,bytes){
  const data=Buffer.from('poc\0'+'x'.repeat(bytes-small.length-16),'ascii');
  const type=Buffer.from('tEXt'),size=Buffer.alloc(4),crc=Buffer.alloc(4);
  size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  const result=Buffer.concat([small.subarray(0,-12),size,type,data,crc,small.subarray(-12)]);
  assert.equal(result.length,bytes);return result;
}
try{
  const rules=generated(),withoutImages=structuredClone(rules);delete withoutImages.rules.checks.$run.images;
  assert.deepEqual(withoutImages,previous());
  ok(await request('.settings/rules',{token:'owner',method:'PUT',body:rules}));
  const f=await setup(4,1),manager=f.manager,staff=[f.staff];
  const other=await provision('deputy');ok(await issue(other));
  for(let i=1;i<6;i++){const a=await provision('receptionist');ok(await issue(a));staff.push(a);}
  const baselineHead=await owner(trial+'/head');
  const get=(path,actor=manager)=>user(path,actor.device);
  const put=(path,body,actor=manager)=>user(path,actor.device,'PUT',body);
  const patch=(path,body,actor=manager)=>user(path,actor.device,'PATCH',body);
  const bank=(slot,id)=>`images/${slot}/banks/${id}`,slotPath=slot=>`images/${slot}`;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({offline:true});
  context.on('request',r=>{if(/^https?:/.test(r.url()))externalBrowserRequests++;});
  const page=await context.newPage();
  const fixture=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=4;c.height=2;
    c.getContext('2d').fillRect(0,0,4,2);
    return{png:c.toDataURL('image/png').split(',')[1],jpeg:c.toDataURL('image/jpeg').split(',')[1]};
  });
  const smallPng=Buffer.from(fixture.png,'base64'),jpeg=Buffer.from(fixture.jpeg,'base64');
  const maximum=paddedPng(smallPng,1000000),maxPayload=prepare(maximum,'image/png');
  await record('I01-real-png-jpeg-and-client-verification',async()=>{
    for(const [bytes,mime] of [[maximum,'image/png'],[jpeg,'image/jpeg']]){
      const p=prepare(bytes,mime);assert.deepEqual(decode(p),bytes);
      const size=await page.evaluate(async({base64,mime})=>{
        const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
        const bitmap=await createImageBitmap(new Blob([bytes],{type:mime}));
        const size=[bitmap.width,bitmap.height];bitmap.close();return size;
      },p);assert.deepEqual(size,[4,2]);
    }
    const requests=metrics.requests;
    assert.throws(()=>prepare(Buffer.alloc(1000001),'image/png'));
    assert.throws(()=>decode({...maxPayload,sha256:'0'.repeat(64)}));
    await assert.rejects(()=>page.evaluate(async()=>createImageBitmap(new Blob(['invalid'],{type:'image/png'}))));
    assert.equal(metrics.requests,requests);
    return{pngBytes:maximum.length,jpegBytes:jpeg.length,decodedDimensions:[4,2],invalidClientInputsSent:0};
  });
  const payloads=[];
  await record('I02-five-maximal-staged-slots',async()=>{
    for(let i=0;i<5;i++){
      const p=prepare(maximum,'image/png');payloads.push(p);ok(await put(bank(i,'a'),p));
      denied(await get(bank(i,'a'),staff[0]));
    }
    denied(await put(bank(0,'b'),prepare(jpeg,'image/jpeg'),staff[0]));
    return{slots:5,rawBytesEach:1000000,encodedBytesEach:maxPayload.base64.length,
      stageWriteJsonBytes:Buffer.byteLength(JSON.stringify(payloads[0])),stagingPrivate:true};
  });
  await record('I03-atomic-publication-and-partial-rejection',async()=>{
    const body=publish('0','a',payloads[0]);
    denied(await put('images/0/head',body.head));
    const [resultPath,result]=Object.entries(body)[1];denied(await put('images/0/'+resultPath,result));
    const missing=publish('4','b',prepare(jpeg,'image/jpeg'));denied(await patch(slotPath(4),missing));
    for(let i=0;i<5;i++)ok(await patch(slotPath(i),publish(String(i),'a',payloads[i])));
    return{completePublications:5,headOnlyRejected:true,resultOnlyRejected:true,missingPayloadRejected:true};
  });
  await record('I04-six-authorized-readers',async()=>{
    const measured=await withTlsReaders(staff,async read=>{
      let bodyBytes=0;
      for(let reader=0;reader<staff.length;reader++)for(let i=0;i<5;i++){
        const h=await read('images/'+i+'/head',reader);ok(h);assert(h.body.active);
        const r=await read(bank(i,h.body.bank),reader);ok(r);bodyBytes+=Buffer.byteLength(JSON.stringify(r.body));
        assert.equal(digest(decode(r.body)),digest(maximum));
      }
      return{independentDeviceAuths:6,imagesPerDevice:5,payloadGets:30,jsonResponseBodyBytes:bodyBytes};
    });
    denied(await get('images',staff[0]));denied(await get('event/profiles',staff[0]));
    return{...measured,managerBranchesNotDistributed:true,realSdkUsed:false};
  });
  await record('I05-direct-boundaries-and-forged-lengths',async()=>{
    const over=paddedPng(smallPng,1000001),p={...prepare(jpeg,'image/jpeg',1),rawBytes:1000001,base64:over.toString('base64'),sha256:digest(over)};
    const bad=[p,{...p,rawBytes:1000000},{...p,rawBytes:1,base64:'!!!!'},
      {...p,base64:7},{...prepare(jpeg,'image/jpeg',1),mime:'text/html'},
      {...prepare(jpeg,'image/jpeg',1),sha256:'wrong'},{...prepare(jpeg,'image/jpeg',1),unknown:1}];
    for(const x of bad)denied(await put(bank(0,'b'),x));
    denied(await put(bank(5,'a'),prepare(jpeg,'image/jpeg')));
    denied(await put(bank(0,'c'),prepare(jpeg,'image/jpeg',1)));
    return{directInvalidBodies:bad.length,sameBase64LengthOverflowRejected:true,sixthSlotRejected:true,thirdBankRejected:true};
  });
  await record('I06-version-switch-and-old-version-removal',async()=>{
    const p=prepare(jpeg,'image/jpeg',1);ok(await put(bank(0,'b'),p));
    denied(await get(bank(0,'b'),staff[0]));
    denied(await put(bank(0,'a'),prepare(jpeg,'image/jpeg',1)));
    denied(await user(bank(0,'a'),manager.device,'DELETE'));
    ok(await patch(slotPath(0),publish('0','b',p)));
    denied(await get(bank(0,'a'),staff[0]));denied(await get(bank(0,'a')));
    ok(await user(bank(0,'a'),manager.device,'DELETE'));
    const r=await get(bank(0,'b'),staff[0]);ok(r);assert.deepEqual(decode(r.body),jpeg);
    return{jpegPublished:true,publishedPayloadMutationRejected:true,oldReadsDeniedForBothRoles:true,oldBankDeletedNormally:true};
  });
  await record('I07-same-operation-result-without-rewrite',async()=>{
    const h=(await get('images/0/head')).body,beforeHead=structuredClone(h);
    const count=metrics.requests;
    for(let i=0;i<2;i++)ok(await get('images/0/operations/'+h.operationId));
    assert.equal(metrics.requests-count,2);
    denied(await patch(slotPath(0),publish('0','b',prepare(jpeg,'image/jpeg',1,h.operationId))));
    assert.deepEqual((await get('images/0/head')).body,beforeHead);
    return{resultQueries:2,writeResendsDuringQueries:0,replayRejected:true,headPreserved:true};
  });
  await record('I08-competing-publish-and-remove',async()=>{
    const p=prepare(jpeg,'image/jpeg',1);ok(await put(bank(1,'b'),p));
    const outcomes=await Promise.all([patch(slotPath(1),publish('1','b',p)),patch(slotPath(1),remove('1',1),other)]);
    assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,401]);
    return{successfulChanges:1,rejectedChanges:1,independentManagers:true};
  });
  await record('I09-stopped-expired-and-role-stale-readers',async()=>{
    const s=staff[0],device=await owner(trial+'/devices/'+s.device.uid);
    await owner(trial+'/devices/'+s.device.uid,'PATCH',{active:false});
    denied(await get('images/0/head',s));denied(await get(bank(0,'b'),s));ok(await get(bank(0,'b'),staff[1]));
    await owner(trial+'/devices/'+s.device.uid,'PUT',device);
    const session=await owner(trial+'/sessions/'+s.device.uid);
    await owner(trial+'/sessions/'+s.device.uid,'PATCH',{expiresAt:Date.now()-1});denied(await get(bank(0,'b'),s));
    await owner(trial+'/sessions/'+s.device.uid,'PUT',session);
    const role=await owner(trial+'/roles/'+s.human.uid);
    await owner(trial+'/roles/'+s.human.uid,'PATCH',{revision:role.revision+1});denied(await get(bank(0,'b'),s));
    await owner(trial+'/roles/'+s.human.uid,'PATCH',{active:false});denied(await get(bank(0,'b'),s));
    await owner(trial+'/roles/'+s.human.uid,'PUT',role);
    return{stoppedDeviceDenied:true,expiredSessionDenied:true,staleRolePreparationDenied:true,revokedRoleDenied:true,
      otherDeviceContinued:true,authorizationFaultsOwnerInjected:true};
  });
  await record('I10-interrupted-stage-and-stopped-writer',async()=>{
    const old=(await get('images/3/head')).body,p=prepare(jpeg,'image/jpeg',1);ok(await put(bank(3,'b'),p));
    const device=await owner(trial+'/devices/'+manager.device.uid);
    await owner(trial+'/devices/'+manager.device.uid,'PATCH',{active:false});
    denied(await patch(slotPath(3),publish('3','b',p)));denied(await get(bank(3,'b')));
    const h=await get('images/3/head',staff[1]);ok(h);assert.deepEqual(h.body,old);
    ok(await get(bank(3,'a'),staff[1]));ok(await get('images/3/head',other));
    await owner(trial+'/devices/'+manager.device.uid,'PUT',device);
    const result=await get('images/3/operations/'+p.operationId);ok(result);assert.equal(result.body,null);
    assert.deepEqual((await get('images/3/head')).body,old);
    return{interruptedCandidateNotPublished:true,stoppedWriterDenied:true,oldPublishedImageKept:true,
      notFoundDidNotResend:true,physicalResponseLossTested:false};
  });
  await record('I11-removal-tombstone-and-operation-retention',async()=>{
    const body=remove('4',1);ok(await patch(slotPath(4),body));
    const h=await get('images/4/head',staff[0]);ok(h);assert.equal(h.body.active,false);
    denied(await get(bank(4,'a'),staff[0]));ok(await user(bank(4,'a'),manager.device,'DELETE'));
    denied(await user(slotPath(4),manager.device,'DELETE'));
    denied(await user('images/4/operations/'+body.head.operationId,manager.device,'DELETE'));
    ok(await get('images/4/operations/'+body.head.operationId));
    return{logicalRemovalAtomic:true,payloadDeletedNormally:true,wholeSlotDeletionRejected:true,operationResultRetained:true};
  });
  await record('I12-ended-control-and-seat-boundary',async()=>{
    const control=await owner(trial+'/control');await owner(trial+'/control','PATCH',{state:'ended'});
    denied(await get('images/0/head',staff[0]));ok(await get('images/0/head'));
    denied(await put(bank(2,'b'),prepare(jpeg,'image/jpeg',1)));
    await owner(trial+'/control','PUT',control);
    assert.deepEqual(await owner(trial+'/head'),baselineHead);
    return{endedStaffReadDenied:true,endedMutationDenied:true,managerBackupReadAllowed:true,
      publishedSeatHeadUnchanged:true,existingSeatRulesUnchanged:true};
  });
}catch(error){failure={stage,name:error.name,message:error.message};process.exitCode=1;console.error(JSON.stringify(failure));}
finally{if(browser)await browser.close();clean=await cleanup();}
assert.equal(externalBrowserRequests,0);assert.deepEqual(before,hashes());
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
const output={sourceHashes:before,endSourceHashes:hashes(),reports,cleanup:clean,
  ...(failure?{failure}:{}),decision:'TECH-DD91-112-A, developer, 2026-10-17',
  restHelperMeterExcludingTlsReads:{...metrics},externalBrowserRequests,externalFirebaseConnected:false,
  existingSeatRulesUnchanged:true,realImagesDecodedInIsolatedEdge:true,
  realDeviceAcceptance:false,providerBillingMeasured:false,fullBusinessFreeTierVerified:false,productionImplementation:false};
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,failure:failure??null,cleanup:clean}));
