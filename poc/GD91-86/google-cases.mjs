import assert from 'node:assert/strict';
import {generation,partPlan,layoutItem,publish} from '../GD91-84/generation-tests.mjs';
import {shared} from '../GD91-84/shared-tests.mjs';
import {initial,proposal} from './model.mjs';

export const paths=['head','head/generation','sharedHead','sharedHead/generation','generations/new/meta','generations/new/meta/cursor','references/base','references/base/active','event/view/cell-0','event/view/cell-0/personId','event/operations/future','event/operations/future/resultRevision'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,ms=12000){const end=Date.now()+ms;while(!test()&&Date.now()<end)await sleep(25);assert(test(),'observation-timeout');}
export function nodes(value){return value===null||typeof value!=='object'?1:1+Object.values(value).reduce((n,v)=>n+nodes(v),0);}

// 外部とEmulatorで同じ手順を使う。owner投入は前提値と失効後の変更注入に限定する。
export async function runGoogleCases(io,a,b,{expiryWindowMs=10000}={}){
  const reports=[];let maxJsonNodes=0;
  async function normal(path,method,body){const r=await io.normal(b,path,method,body);assert.equal(r.status,200,'normal-manager-request-rejected');return r.body;}
  async function build(id){let meta=generation(id,'layout',1).meta;await normal('generations/'+id+'/meta','PUT',meta);await normal('generations/'+id+'/sections/sec1','PUT',{name:'FAKE-section'});const body=partPlan(id,meta,[0,1,2].map(i=>layoutItem(i)));await normal('','PATCH',body);meta={...body['generations/'+id+'/meta'],phase:'ready',revision:3};await normal('generations/'+id+'/meta','PUT',meta);}
  async function measure(){maxJsonNodes=Math.max(maxJsonNodes,nodes(await io.owner('')));assert(maxJsonNodes<=500,'node-budget');}
  for(const kind of ['session-expiry','role-and-session-expiry']){
    await io.owner('','PUT',{control:{state:'operating',revision:1},event:initial()});
    const role={active:true,role:'owner',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt:Date.now()+3600000};
    await io.owner('roles/'+a.human.uid,'PUT',role);
    for(const f of [a,b]){f.sessionRevision=0;await io.owner('devices/'+f.device.uid,'PUT',{schemaVersion:2,performanceId:io.performanceId,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1});await io.issue(f,role.endsAt);}
    await build('g1');await build('g2');
    await normal('','PATCH',publish('g1',1,'initial'));await normal('','PATCH',shared('g1',1,1,'initial'));
    await normal('','PATCH',{'references/base':{generation:'g1',deviceUid:b.device.uid,active:true},'generations/g1/refs/base':true});
    const meta=generation('new','layout',1).meta;await normal('generations/new/meta','PUT',meta);await measure();
    const watches=[];
    try{
      for(const path of paths)watches.push({path,first:io.sdkWatch(a,path),other:io.sdkWatch(b,path),stream:await io.restWatch(a,path)});
      await until(()=>watches.every(w=>w.first.state.seen.length&&w.other.state.seen.length&&w.stream.state.seen.length));
      for(const w of watches){assert.equal((await io.normal(a,w.path)).status,200);w.count=w.first.state.seen.length;w.otherCount=w.other.state.seen.length;w.restCount=w.stream.state.seen.length;}
      const expires=Date.now()+expiryWindowMs;
      if(kind==='role-and-session-expiry'){await io.owner('roles/'+a.human.uid+'/endsAt','PUT',expires);await io.issue(b,expires);}
      await io.issue(a,expires);await until(()=>Date.now()>expires+300,expiryWindowMs+3000);
      for(const w of watches)assert.equal((await io.normal(a,w.path)).status,401,'expired-new-read-accepted');
      if(kind==='role-and-session-expiry')assert.equal((await io.normal(b,'head')).status,401,'second-session-not-expired');
      // 同じ本人の両端末が失効する条件では、有効な別管理者を追加せずownerでデータ変更を注入する。
      const change=kind==='session-expiry'?normal:async(p,m,body)=>io.owner(p,m,body);
      await change('generations/new/sections/sec1','PUT',{name:'FAKE-added-section'});
      const part=partPlan('new',meta,[layoutItem('new')]);await change('','PATCH',part);
      await change('generations/new/meta','PUT',{...part['generations/new/meta'],phase:'ready',revision:3});
      await change('','PATCH',publish('g2',2,'future'));await change('','PATCH',shared('g2',2,2,'future'));
      await change('','PATCH',{'references/base':{generation:'g1',deviceUid:b.device.uid,active:false},'generations/g1/refs/base':null});
      await change('event','PATCH',proposal(b,initial(),'swap','cell-0','cell-1','none','future'));await measure();
      await until(()=>watches.every(w=>w.first.state.error&&w.stream.state.error&&(kind==='session-expiry'?w.other.state.seen.length>w.otherCount:w.other.state.error)));
      for(const w of watches){assert.equal(w.first.state.error,'PERMISSION_DENIED');assert.equal(w.stream.state.error,'cancel');assert.equal(w.first.state.seen.length,w.count,'expired-sdk-received-data');assert.equal(w.stream.state.seen.length,w.restCount,'expired-rest-stream-received-data');
        if(kind==='session-expiry')assert.equal(w.other.state.error,null);else{assert.equal(w.other.state.error,'PERMISSION_DENIED');assert.equal(w.other.state.seen.length,w.otherCount);}}
      reports.push({kind,paths:paths.length,newRestRejected:paths.length,sdkNewDataRejected:paths.length,restStreamNewDataRejected:paths.length,otherValidDeviceContinues:kind==='session-expiry'?paths.length:0,bothSameHumanDevicesRejected:kind==='role-and-session-expiry'?paths.length:0,normalManagerChanges:kind==='session-expiry',ownerChangeInjection:kind==='role-and-session-expiry',missingOperationCreatedAfterExpiry:true,clockOnlyDisconnectClaimed:false});
      io.record({kind,paths:paths.length,passed:true});
    }finally{for(const w of watches){w.first.close();w.other.close();await w.stream.close();}}
  }
  return{reports,maxJsonNodes,logicalReadLocations:6,parentAndChildPaths:paths.length,expiryWindowMs,wholeBusinessConnected:false};
}
