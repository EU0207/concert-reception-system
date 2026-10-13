import assert from 'node:assert/strict';
import {collection,query,orderBy,limit,onSnapshot,Timestamp,writeBatch,doc,serverTimestamp} from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';
import {client,decode} from '../GD91-72/sdk-adapter.mjs';
import {sameEvent,derive} from '../GD91-77/receipt-client.mjs';

export const windowLimit=2048; // 隔離比較用。製品上限・採用済み取得方式ではない。
function timestamp(text) {
  const m=text.match(/^(.*:\d\d)(?:\.(\d{1,9}))?Z$/);assert(m);
  return new Timestamp(Date.parse(m[1]+'Z')/1000,Number((m[2]??'').padEnd(9,'0')));
}
export function wireTime(value) {
  if(Array.isArray(value))return value.map(wireTime);
  if(value&&typeof value==='object'){
    if(Object.hasOwn(value,'$timestamp')){
      const t=timestamp(value.$timestamp),digits=String(t.nanoseconds).padStart(9,'0');
      const width=t.nanoseconds===0?0:t.nanoseconds%1000000===0?3:t.nanoseconds%1000===0?6:9;
      return {$timestamp:new Date(t.seconds*1000).toISOString().slice(0,19)+(width?'.'+digits.slice(0,width):'')+'Z'};
    }
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wireTime(v)]));
  }
  return value;
}

// 範囲を固定した購読比較。再接続の全読取りと認証更新は別途評価する。
export async function watchClient(show,actor,journal,{onApplied=()=>{}}={}) {
  assert(journal.scope.show===show&&journal.scope.deviceUid===actor.device.uid&&journal.scope.humanUid===actor.person.uid);
  const sdk=await client(actor.device.token);
  const stats={starts:0,stops:0,serverSnapshots:0,cacheSnapshots:0,deliveredDocuments:0,
    duplicates:0,saves:0,applied:0,maximumSnapshotSize:0};
  let running=false,epoch=0,unsubscribe=null,queue=Promise.resolve(),failure=null;
  let readyResolve,readyReject;
  function detach() { if(unsubscribe){unsubscribe();unsubscribe=null;stats.stops++;} }
  function fail(error) {
    if(!running)return;
    failure={code:error.code??'local-processing-failed',message:error.message};
    running=false;epoch++;detach();readyReject?.(error);
  }
  function start() {
    assert(!running,'listener-already-started');running=true;failure=null;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
    const token=++epoch;
    const q=query(collection(sdk.db,'publicationShows',show,'receiptEvents'),orderBy('receivedAt'),limit(windowLimit));
    stats.starts++;
    unsubscribe=onSnapshot(q,{includeMetadataChanges:true},snapshot=>{
      if(!running||token!==epoch)return;
      if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){stats.cacheSnapshots++;return;}
      queue=queue.then(async()=>{
        if(!running||token!==epoch)return;
        stats.serverSnapshots++;stats.maximumSnapshotSize=Math.max(stats.maximumSnapshotSize,snapshot.size);
        // 満杯を全件取得済みと誤認しない。保持・表示の成功を止める。
        assert(snapshot.size<windowLimit,'watch-window-saturated');
        const next=journal.snapshot();let changed=false;
        for(const change of snapshot.docChanges()){
          assert.notEqual(change.type,'removed','immutable-event-removed');stats.deliveredDocuments++;
        }
        // キャッシュ通知を採用しなくても、サーバー確認時の全結果から初回分を拾う。
        for(const document of snapshot.docs){
          const e=wireTime(decode(document.data()));
          assert.equal(e.performanceId,show);assert.equal(e.environmentId,'FAKE-environment');
          assert.equal(document.id,e.eventId);assert(e.receivedAt?.$timestamp);
          const previous=next.records.get(e.eventId);
          if(previous){assert(sameEvent(previous,e),'event-content-conflict');stats.duplicates++;}
          else{next.records.set(e.eventId,e);changed=true;}
        }
        const projection=derive(next.records);
        // 最大受信時刻を、未受信がないことの証拠として使わない。
        if(changed){await journal.save(next);stats.saves++;}
        if(!running||token!==epoch)return;
        await onApplied(projection);stats.applied++;readyResolve();
      }).catch(fail);
    },error=>{if(running&&token===epoch)fail(error);});
    return ready;
  }
  async function stop() { running=false;epoch++;detach();readyResolve?.();await queue; }
  async function send(events){
    assert(events.length>0&&events.length<=3);const batch=writeBatch(sdk.db);
    for(const e of events){assert.equal(e.performanceId,show);assert.equal(e.deviceUid,actor.device.uid);
      batch.set(doc(sdk.db,'publicationShows',show,'receiptEvents',e.eventId),{
        ...e,observedAt:timestamp(e.observedAt.$timestamp),receivedAt:serverTimestamp()});}
    await batch.commit();
  }
  return {start,stop,send,stats,journal,state:()=>({running,failure}),idle:()=>queue,offline:sdk.offline,online:sdk.online,
    close:async()=>{await stop();await sdk.close();}};
}
