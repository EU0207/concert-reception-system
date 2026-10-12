import {encryptJson,decryptJson} from '../POC-004/src/crypto.ts';

const databaseName='concert-gd91-72-isolated-drafts';
const keyOf=c=>JSON.stringify([c.performanceId,c.humanUid]);
const allowed=c=>c.active&&['owner','deputy'].includes(c.role);
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(databaseName,1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function record(c){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts','readonly').objectStore('drafts').get(keyOf(c));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
export async function save(c,draft,passphrase,{expectedLocalVersion=0,abortAfterPut=false}={}){
 if(!allowed(c))throw new Error('local-access-denied');
 const envelope={...draft,formatVersion:1,performanceId:c.performanceId,humanUid:c.humanUid};
 if(envelope.operation)envelope.operationHash=await hash(envelope.operation);
 const payload=await encryptJson(envelope,passphrase,c.expiresAt),db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');let failure,version;
  const r=store.get(keyOf(c));r.onsuccess=()=>{
   if((r.result?.version??0)!==expectedLocalVersion){failure=new Error('stale-local-version');tx.abort();return;}
   version=expectedLocalVersion+1;const put=store.put({key:keyOf(c),version,payload});
   if(abortAfterPut)put.onsuccess=()=>{failure=new DOMException('injected-write-abort','QuotaExceededError');tx.abort();};
  };
  tx.oncomplete=()=>resolve({version,saved:true});
  tx.onabort=()=>reject(failure??tx.error??new Error('local-write-aborted'));
  tx.onerror=()=>{};
 });}finally{db.close();}
}
export async function load(c,passphrase){
 if(!allowed(c))throw new Error('local-access-denied');const r=await record(c);if(!r)return null;
 const e=await decryptJson(r.payload,passphrase);
 if(e.formatVersion!==1||e.performanceId!==c.performanceId||e.humanUid!==c.humanUid)throw new Error('local-scope-or-format-mismatch');
 if(e.operation&&e.operationHash!==await hash(e.operation))throw new Error('local-operation-mismatch');
 return{version:r.version,envelope:e};
}
// 保存形式と平文非混入を確認する隔離試験専用の読取り。
export const inspectEncrypted=record;
