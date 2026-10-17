import assert from 'node:assert/strict';
import {webcrypto,randomBytes} from 'node:crypto';
import {unpack} from '../GD91-49/codec.mjs';
import {build} from '../GD91-104/geometry.mjs';
import {decode} from '../GD91-102/layout-model.mjs';
const {subtle}=webcrypto;

// 隔離RAMモデル。DB間の実移行、正式バックアップ、SDK切替を代替しない。
export async function seal(value,key){
  const iv=randomBytes(12),aad=Buffer.from('GD91-124-envelope-v1');
  const bytes=await subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,Buffer.from(JSON.stringify(value)));
  return{format:1,iv:iv.toString('base64'),ciphertext:Buffer.from(bytes).toString('base64')};
}
export async function open(value,key){
  assert.equal(value.format,1);
  const bytes=await subtle.decrypt({name:'AES-GCM',iv:Buffer.from(value.iv,'base64'),additionalData:Buffer.from('GD91-124-envelope-v1')},key,Buffer.from(value.ciphertext,'base64'));
  return JSON.parse(Buffer.from(bytes).toString());
}
export const key=()=>subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
function put(root,path,value){const keys=path.split('/').filter(Boolean),last=keys.pop();let at=root;for(const k of keys)at=at[k]??={};at[last]=structuredClone(value);}
export async function convertLayouts(snapshots){
  assert(snapshots.length>0);
  const context={maxCells:4096},models=snapshots.map(s=>unpack(s,context).model);
  const scopes=new Set(snapshots.map(s=>s.environmentId+'/'+s.performanceId));assert.equal(scopes.size,1,'mixed-performance');
  const sectionIds=models.map(m=>m.section.sectionId);assert.equal(new Set(sectionIds).size,sectionIds.length,'duplicate-section');
  const cells=models.flatMap(m=>m.section.cells.map(c=>c.cellId)),seats=models.flatMap(m=>m.seats.map(s=>s.seatId));
  assert.equal(new Set(cells).size,cells.length,'duplicate-cell');assert.equal(new Set(seats).size,seats.length,'duplicate-seat');
  assert(cells.length<=4096&&models.length<=16,'migration-capacity');
  const store={},send=async(path,method,body)=>{if(method==='PUT')put(store,path,body);else{assert.equal(method,'PATCH');for(const[p,v]of Object.entries(body))put(store,p,v);}};
  const built=await build(send,'isolated-migration',models);
  const restored=decode(built.sections,built.items,{initialNumbered:true});
  const semantic=m=>({section:m.section,seats:m.seats.map(s=>{const{displayOrder,...other}=s;return{...other,displayOrder:displayOrder??built.items.find(x=>x.id===s.seatId).displayOrder};})});
  // geometry・displayOrderは新形式の導出項目。旧業務ID・採番・属性は削らない。
  const comparable=m=>{const s=structuredClone(m);delete s.section.bounds;delete s.section.displayOrder;return semantic(s);};
  for(let i=0;i<models.length;i++)assert.deepEqual(comparable(restored[i]),comparable(models[i]));
  return{store,models,restored,cells:cells.length,seats:seats.length};
}

export class CutoverModel{
  constructor({oldSnapshot,encryptedDrafts,pending,oldSafe=false}){
    this.original=structuredClone(oldSnapshot);this.encryptedDrafts=structuredClone(encryptedDrafts);
    this.pending=structuredClone(pending);this.oldSafe=oldSafe;
    this.active='old';this.writes={old:false,next:false};this.phase='stopped';this.newFacts=[];
  }
  reconcile(results){
    for(const op of this.pending){
      const r=results[op.id];assert(r?.status==='committed'&&r.contentHash===op.contentHash,'unresolved-or-mismatched-operation');
    }
    this.pending=[];
  }
  stage(value){assert.equal(this.phase,'stopped');assert.equal(this.pending.length,0,'pending-operation');this.staged=structuredClone(value);this.phase='staged';}
  activate({verified,devicesReprepared}){
    assert.equal(this.phase,'staged');assert(verified&&devicesReprepared,'not-ready');
    this.active='next';this.writes={old:false,next:true};this.phase='active';
  }
  receive(fact){assert(this.writes.next&&!this.writes.old);this.newFacts.push(structuredClone(fact));}
  rollback(){
    this.writes={old:false,next:false};this.phase='stopped';
    if(this.newFacts.length){this.phase='recovery-decision';return{automaticResume:false,newFactsPreserved:true};}
    this.active='old';return{automaticResume:false,oldSafe:this.oldSafe,paperFallback:!this.oldSafe};
  }
}
