import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {base, fields, request, data} from '../GD91-60/tests/transport.mjs';
const root = base.slice(base.indexOf('/projects/') + 1);
const ordered = v => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])) : v;
const canonical = v => JSON.stringify(ordered(v));
export const sameEvent = (a,b) => {
  const withoutTime = ({receivedAt, ...rest}) => rest;
  return canonical(withoutTime(a)) === canonical(withoutTime(b));
};
export function event(f, actor, attendeeId, sequence, changes = {}) {
  return {schemaVersion:1, environmentId:'FAKE-environment', performanceId:f.show, eventId:randomUUID(),
    deviceUid:actor.device.uid, humanUid:actor.person.uid, sequence, sourceControlRevision:1,
    attendeeId, credentialVersion:1, kind:'firstReception', reason:'',
    observedAt:{$timestamp:new Date().toISOString()}, ...changes};
}
export const eventPath = (show,id) => 'publicationShows/' + show + '/receiptEvents/' + id;
export const eventWrite = e => ({update:{name:root + '/' + eventPath(e.performanceId,e.eventId),fields:fields(e)},
  currentDocument:{exists:false}, updateTransforms:[{fieldPath:'receivedAt',setToServerValue:'REQUEST_TIME'}]});
export async function send(events, token) {
  // 作成要求は最大3件。応答不明時に別IDへ作り直さない。
  assert(events.length > 0 && events.length <= 3);
  return request(base + ':commit', token, 'POST', {writes:events.map(eventWrite)});
}
export async function inspect(e,token) {
  const r = await request(base + '/' + eventPath(e.performanceId,e.eventId),token);
  if (r.status === 404) return {state:'absent'};
  if (r.status !== 200) return {state:'unknown',code:r.status};
  return {state:sameEvent(e,data(r)) ? 'committed' : 'id-conflict'};
}
export function memoryJournal(show, deviceUid, humanUid) {
  assert(show && deviceUid && humanUid);
  let records = new Map(), cursor = null, fail = false;
  return {scope:{show,deviceUid,humanUid}, snapshot:()=>({records:new Map(records),cursor:structuredClone(cursor)}),
    failNext:()=>{fail=true;},
    save:async next=>{if(fail){fail=false;throw new Error('injected-journal-abort');}
      records=new Map(next.records);cursor=structuredClone(next.cursor);}};
}
export function deltaClient(show,actor,journal,{pageSize=100}={}) {
  assert(journal.scope.show===show && journal.scope.deviceUid===actor.device.uid && journal.scope.humanUid===actor.person.uid);
  assert(Number.isInteger(pageSize)&&pageSize>0&&pageSize<=100);
  const stats={queries:0,documents:0,emptyQueries:0,duplicates:0,savedPages:0,watermarkSaves:0};
  let pending;
  async function perform({afterPage=async()=>{}}={}) {
    const initial=journal.snapshot();
    // 次回は同時刻の境界を含めて読む。ページ内だけ文書名を使って先へ進む。
    let cursor=initial.cursor ? {values:[{timestampValue:initial.cursor.receivedAt}],before:true} : null;
    let cutoff;
    for(;;){
      const query={from:[{collectionId:'receiptEvents'}],orderBy:[
        {field:{fieldPath:'receivedAt'},direction:'ASCENDING'},
        {field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:pageSize,...(cursor?{startAt:cursor}:{}),
        ...(cutoff?{where:{fieldFilter:{field:{fieldPath:'receivedAt'},op:'LESS_THAN_OR_EQUAL',value:{timestampValue:cutoff}}}}:{})};
      const r=await request(base + '/publicationShows/' + show + ':runQuery',actor.device.token,'POST',
        {structuredQuery:query});
      stats.queries++;
      if(r.status!==200)throw Object.assign(new Error('delta-query-denied'),{code:r.status});
      assert(Array.isArray(r.body)); const rows=r.body.filter(x=>x.document);
      // 過去時点の読取りを要求しない。上限フィルターと不変イベントでページを固定する。
      cutoff??=r.body.filter(x=>x.readTime).at(-1)?.readTime;
      assert(cutoff,'server-read-time-required');
      stats.documents+=rows.length;if(!rows.length)stats.emptyQueries++;
      const next=journal.snapshot();
      for(const row of rows){
        const e=data({body:row.document}), prior=next.records.get(e.eventId);
        assert.equal(e.performanceId,show);assert.equal(e.environmentId,'FAKE-environment');
        if(prior){assert(sameEvent(prior,e),'event-content-conflict');stats.duplicates++;}
        else next.records.set(e.eventId,e);
      }
      if(rows.length){
        const last=rows.at(-1).document;
        next.cursor={receivedAt:last.fields.receivedAt.timestampValue,name:last.name};
        await journal.save(next);stats.savedPages++;
        cursor={values:[{timestampValue:next.cursor.receivedAt},{referenceValue:next.cursor.name}],before:false};
        await afterPage();
      }
      if(rows.length<pageSize){
        const complete=journal.snapshot();complete.cursor={receivedAt:cutoff,name:null};
        await journal.save(complete);stats.watermarkSaves++;return journal.snapshot();
      }
    }
  }
  function sync(options){
    pending??=perform(options).finally(()=>{pending=null;});
    return pending;
  }
  return {sync,stats,journal};
}
export function derive(records) {
  const people=new Map(), sequences=new Map();
  for(const e of records.values()){
    const key=e.deviceUid+'/'+e.sequence, previous=sequences.get(key);
    assert(!previous||previous===e.eventId,'duplicate-device-sequence');sequences.set(key,e.eventId);
    const state=people.get(e.attendeeId)??{initial:new Set(),rereads:0};
    if(e.kind==='firstReception')state.initial.add(e.eventId);else state.rereads++;
    people.set(e.attendeeId,state);
  }
  return [...people].sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>({attendeeId:id,
    status:s.initial.size>1?'conflict':s.initial.size===1?'received':'notReceived',rereads:s.rereads}));
}
