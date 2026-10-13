import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {trial,owner,user,check,ok,denied,metrics} from './transport.mjs';

export const labelKey=label=>label.replaceAll('%','%25').replaceAll('.','%2E').replaceAll('$','%24').replaceAll('#','%23').replaceAll('[','%5B').replaceAll(']','%5D').replaceAll('/','%2F');
export const layoutItem=(i,kind='seat',section='sec1')=>({id:'cell-'+i,kind,sectionId:section,lineId:'line1',label:kind==='seat'?'A-'+i:''});
export const rosterItem=i=>({id:'person-'+i,kind:'person',name:'架'.repeat(50),displayName:'架空来場者名',extra:Object.fromEntries(Array.from({length:10},(_,j)=>['f'+j,'補'.repeat(200)]))});
const patch=(body,actor)=>user('',actor,'PATCH',body);
export function generation(id,kind,count){return{meta:{kind,phase:'building',revision:1,cursor:0,expectedParts:count,lastPart:''}};}
export async function start(f,id,kind,parts,sectionCount=2){const meta=generation(id,kind,parts).meta;ok(await user('generations/'+id+'/meta',f.device,'PUT',meta));if(kind==='layout')for(let i=0;i<sectionCount;i++)ok(await user('generations/'+id+'/sections/sec'+i,f.device,'PUT',{name:'区'.repeat(100)}));return meta;}
export function partPlan(id,meta,items){
  const part='p'+meta.cursor,slots=Object.fromEntries(items.map((item,i)=>['s'+String(i).padStart(2,'0'),item]));
  const body={['generations/'+id+'/meta']:{...meta,cursor:meta.cursor+1,revision:meta.revision+1,lastPart:part},['generations/'+id+'/parts/'+part]:{index:meta.cursor,count:items.length,slots}};
  for(const[slot,item]of Object.entries(slots)){
    body['generations/'+id+'/ids/'+item.id]={part,slot};
    if(item.kind==='seat')body['generations/'+id+'/labels/'+item.sectionId+'/'+item.lineId+'/'+labelKey(item.label)]={part,slot};
  }
  return body;
}
export async function add(f,id,meta,items){const body=partPlan(id,meta,items);ok(await patch(body,f.device));return body['generations/'+id+'/meta'];}
export async function seal(f,id,meta){const next={...meta,phase:'ready',revision:meta.revision+1};ok(await user('generations/'+id+'/meta',f.device,'PUT',next));return next;}
export async function build(f,id,kind,items,sectionCount=2){const width=kind==='roster'?4:32;let meta=await start(f,id,kind,Math.ceil(items.length/width),sectionCount),maxPartBytes=0,maxRequestBytes=0;
  for(let i=0;i<items.length;i+=width){const body=partPlan(id,meta,items.slice(i,i+width));maxPartBytes=Math.max(maxPartBytes,Buffer.byteLength(JSON.stringify(body['generations/'+id+'/parts/p'+meta.cursor])));maxRequestBytes=Math.max(maxRequestBytes,Buffer.byteLength(JSON.stringify(body)));ok(await patch(body,f.device));meta=body['generations/'+id+'/meta'];}
  meta=await seal(f,id,meta);return{meta,maxPartBytes,maxRequestBytes,parts:meta.cursor};}
export function publish(id,revision,operationId=randomUUID()){return {head:{generation:id,revision,operationId},['operations/'+operationId]:{kind:'publish',generation:id,resultRevision:revision}};}
async function unchanged(body,f,expected=401){const before=await owner(trial+'/generations'),r=await patch(body,f.device);assert.equal(r.status,expected,JSON.stringify(r.body));assert.deepEqual(await owner(trial+'/generations'),before);}
export async function collectPart(f,id,meta,index){const part='p'+index,r=await user('generations/'+id+'/parts/'+part,f.device);ok(r);if(!r.body)return false;
  const body={['generations/'+id+'/parts/'+part]:null};
  for(const item of Object.values(r.body.slots)){body['generations/'+id+'/ids/'+item.id]=null;if(item.kind==='seat')body['generations/'+id+'/labels/'+item.sectionId+'/'+item.lineId+'/'+labelKey(item.label)]=null;}
  ok(await patch(body,f.device));return true;
}
export async function collectSections(f,id){ok(await patch(Object.fromEntries(Array.from({length:16},(_,i)=>['generations/'+id+'/sections/sec'+i,null])),f.device));}
export async function generationTests(actors){
  const f=actors.owner;
  await check('G-partial-and-duplicate',async()=>{
    const id='basic',meta=await start(f,id,'layout',2),body=partPlan(id,meta,[layoutItem(0),layoutItem(1)]);
    for(const omitted of Object.keys(body)){const partial={...body};delete partial[omitted];await unchanged(partial,f);}
    let m=await add(f,id,meta,[layoutItem(0),layoutItem(1)]);
    await unchanged(partPlan(id,m,[layoutItem(0)]),f);
    await unchanged(partPlan(id,m,[{...layoutItem(2),label:'A-0'}]),f);
    m=await add(f,id,m,[layoutItem(2)]);await seal(f,id,m);return{missingLocationsRejected:Object.keys(body).length,duplicateIdsAndLabelsRejected:true};
  });
  await check('G-escaped-labels',async()=>{const id='labels',labels=['臨時1','A.1','A%2E1','A/1','A$1','A#1','A[1]','=A+1'];let m=await start(f,id,'layout',2);m=await add(f,id,m,labels.map((label,i)=>({...layoutItem('label-'+i),label})));await unchanged(partPlan(id,m,[{...layoutItem('duplicate'),label:'A.1'}]),f);m=await add(f,id,m,[{...layoutItem('other-line'),lineId:'line2',label:'A.1'}]);await seal(f,id,m);return{distinctReservedForms:labels.length,duplicateSameLineRejected:true,otherLineAllowed:true};});
  await check('G-slot-and-schema-bounds',async()=>{const id='bounds',m=await start(f,id,'layout',1);await unchanged(partPlan(id,m,Array.from({length:33},(_,i)=>layoutItem('bound-'+i))),f);for(const item of [{...layoutItem('long'),label:'長'.repeat(65)},{...layoutItem('extra'),name:'FAKE-private'}])await unchanged(partPlan(id,m,[item]),f);const raw=partPlan(id,m,[{...layoutItem('control'),label:'A\n1'}]);await unchanged(raw,f,400);await unchanged(Object.fromEntries(Object.entries(raw).map(([k,v])=>[k.replaceAll('\n','%0A'),v])),f);return{oversizedAndUnknownFieldsRejected:true,invalidKeyStatus:400,controlInValueStatus:401};});
  await check('G-roster-max-fields',async()=>{const id='roster-bound',m=await start(f,id,'roster',1);await unchanged(partPlan(id,m,[{...rosterItem('long'),name:'架'.repeat(51)}]),f);await unchanged(partPlan(id,m,[{...rosterItem('field'),extra:{...rosterItem(0).extra,f0:'補'.repeat(201)}}]),f);await unchanged(partPlan(id,m,Array.from({length:5},(_,i)=>rosterItem(i))),f);const after=await add(f,id,m,[rosterItem(0),rosterItem(1),rosterItem(2),rosterItem(3)]);await seal(f,id,after);return{maxName50AndTenFields200Accepted:true,partWidth4:true};});
  await check('G-publication-boundary',async()=>{
    denied(await patch(publish('bounds',1),f.device));const full=publish('basic',1);denied(await patch({head:full.head},f.device));const only=Object.fromEntries(Object.entries(full).filter(([k])=>k!=='head'));denied(await patch(only,f.device));ok(await patch(full,f.device));
    ok(await user('generations/basic/parts/p0',actors.receptionist.device));denied(await user('generations/roster-bound/parts/p0',actors.receptionist.device));denied(await user('generations/labels/parts/p0',actors.receptionist.device));denied(await patch(full,f.device));return{onlyReadyPublished:true,privateAndNoncurrentReadDenied:true,pastOperationRejected:true};
  });
  await check('G-pin-and-collection',async()=>{
    const id='basic',before=await owner(trial+'/generations/'+id+'/meta');
    denied(await user('generations/'+id+'/meta',f.device,'PUT',{...before,phase:'deleting',revision:before.revision+1}));
    const ref='FAKE-prepared-base';ok(await patch({['references/'+ref]:{generation:id,deviceUid:f.device.uid,active:true},['generations/'+id+'/refs/'+ref]:true},f.device));
    denied(await patch({['references/'+ref]:{generation:id,deviceUid:actors.deputy.device.uid,active:false},['generations/'+id+'/refs/'+ref]:null},actors.deputy.device));
    ok(await patch(publish('labels',2),f.device));denied(await user('generations/'+id+'/meta',f.device,'PUT',{...before,phase:'deleting',revision:before.revision+1}));
    denied(await user('generations/'+id+'/refs/'+ref,f.device,'DELETE'));
    ok(await patch({['references/'+ref]:{generation:id,deviceUid:f.device.uid,active:false},['generations/'+id+'/refs/'+ref]:null},f.device));
    const deleting={...before,phase:'deleting',revision:before.revision+1};ok(await user('generations/'+id+'/meta',f.device,'PUT',deleting));
    denied(await patch(publish(id,3),f.device));denied(await patch({['references/new']: {generation:id,deviceUid:f.device.uid,active:true},['generations/'+id+'/refs/new']:true},f.device));
    denied(await user('generations/'+id+'/parts/p0',f.device,'DELETE'));await collectPart(f,id,deleting,0);
    // RAMのリストを使わず、保存済みmetaと次のpartを取得して回収を再開する。
    const resumed=(await user('generations/'+id+'/meta',f.device)).body;assert.equal(resumed.phase,'deleting');assert.equal(await collectPart(f,id,resumed,0),false);assert.equal(await collectPart(f,id,resumed,1),true);
    await collectSections(f,id);ok(await user('generations/'+id+'/meta',f.device,'PUT',{...resumed,phase:'deleted',revision:resumed.revision+1}));
    const oldId=(await owner(trial+'/operations'));assert.equal(Object.values(oldId).filter(x=>x.generation===id).length,1);
    return{currentAndReferencedProtected:true,republishDuringGCRejected:true,interruptedGCResumed:true,operationResultRetained:true};
  });
  await check('G-unpublished-collection',async()=>{const id='bounds',m=(await user('generations/'+id+'/meta',f.device)).body;const next={...m,phase:'deleting',revision:m.revision+1};ok(await user('generations/'+id+'/meta',f.device,'PUT',next));await collectSections(f,id);ok(await user('generations/'+id+'/meta',f.device,'PUT',{...next,phase:'deleted',revision:next.revision+1}));return{failedBuildingGenerationCollected:true};});
  return f;
}
