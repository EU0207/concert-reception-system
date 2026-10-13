import assert from 'node:assert/strict';import {plan,sameEvent,key} from './receipt-client.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function wait(test,ms=12000){const end=Date.now()+ms;while(!test()&&Date.now()<end)await pause(20);assert(test(),'query-observation-timeout');}
const nodes=v=>v===null||typeof v!=='object'?1:1+Object.values(v).reduce((n,x)=>n+nodes(x),0);
export async function runQueryCases(io,a,b,{expiryWindowMs=10000}={}){
  const reports=[];let maxJsonNodes=0;
  for(const kind of ['session-expiry','role-and-session-expiry']){
    await io.owner('','PUT',{control:{state:'operating',revision:1},event:{people:{person:{active:true}},tickets:{person:{everIssued:true,credentialRef:'FAKE-credential',credentialVersion:1,cycleClosed:false}}}});
    for(const f of [a,b]){f.sessionRevision=0;await io.owner('roles/'+f.human.uid,'PUT',{active:true,role:'receptionist',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+86400000});await io.owner('devices/'+f.device.uid,'PUT',{schemaVersion:2,performanceId:io.performanceId,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1});await io.issue(f,Date.now()+3600000);}
    const path='receipts/'+b.device.uid+'/events',child=io.sdk(a,path,'child'),value=io.sdk(a,path,'value'),valid=io.sdk(b,path,'child');let stream;
    try{await wait(()=>value.state.count>0);assert.equal((await io.current(a,path)).status,200);stream=await io.stream(a,path);await wait(()=>stream.state.seen.length>0);const valueCount=value.state.count,streamCount=stream.state.seen.length,expires=Date.now()+expiryWindowMs;
      if(kind==='role-and-session-expiry')await io.owner('roles/'+a.human.uid+'/endsAt','PUT',expires);await io.issue(a,expires);await wait(()=>Date.now()>expires+300,expiryWindowMs+3000);assert.equal((await io.current(a,path)).status,401);
      const p=plan(io.performanceId,b,1,'person');assert.equal((await io.write(b,'receipts/'+b.device.uid,p.body)).status,200);await wait(()=>valid.state.count===1&&stream.state.error);await pause(1000);
      assert.equal(valid.state.error,null);assert.equal(child.state.count,0);assert.equal(value.state.count,valueCount);assert.equal(stream.state.seen.length,streamCount);assert.equal(stream.state.error,'cancel');
      const lookup=await io.lookup(b,'receipts/'+b.device.uid+'/events/'+key(1));assert.equal(lookup.status,200);assert(sameEvent(p.event,lookup.body));maxJsonNodes=Math.max(maxJsonNodes,nodes(await io.owner('')));assert(maxJsonNodes<=500);
      reports.push({kind,freshQueryRejected:true,validDeviceReceivesNewEvent:true,expiredChildNewEvents:0,expiredValueNewEvents:0,restStreamNewEvents:0,restStreamCancelled:true,sdkChildCancellationObserved:child.state.error==='PERMISSION_DENIED',sdkValueCancellationObserved:value.state.error==='PERMISSION_DENIED',sameOperationLookupMatches:true,roleAndSessionExpiryCoincide:kind==='role-and-session-expiry',clockOnlyDisconnectClaimed:false});io.record({kind,passed:true});
    }finally{child.close();value.close();valid.close();if(stream)await stream.close();}
  }return{reports,maxJsonNodes,expiryWindowMs,filteredQuery:true};
}
