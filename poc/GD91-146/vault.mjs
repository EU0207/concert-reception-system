import {ensure} from './codec.mjs';
const name='gd91-146-import-only';
let scope;export function configure(value){ensure(value.performanceId&&value.deviceUid&&value.exportId,'vault-scope');scope=value.performanceId+'|'+value.deviceUid+'|'+value.exportId;}
const scoped=id=>{ensure(scope,'vault-not-configured');return scope+'|'+id;};
async function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transaction(mode,work){const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction('records',mode),s=t.objectStore('records');let result;work(s,x=>result=x);t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{db.close();}}
const get=key=>transaction('readonly',(s,set)=>{const r=s.get(scoped(key));r.onsuccess=()=>set(r.result);});
async function key(){let k=await get('key');if(!k){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await transaction('readwrite',s=>s.put(k,scoped('key')));}ensure(!k.extractable,'extractable-key');return k;}
export async function save(id,value){const k=await key(),iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new TextEncoder().encode(JSON.stringify(value)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(scoped(id))},k,bytes);await transaction('readwrite',s=>s.put({iv,cipher},scoped(id)));}
export async function load(id){const r=await get(id);if(!r)return null;return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:r.iv,additionalData:new TextEncoder().encode(scoped(id))},await key(),r.cipher)));}
export async function summary(){const records=await transaction('readonly',(s,set)=>{const r=s.getAll();r.onsuccess=()=>set(r.result);});return {records:records.length,keyNonExtractable:records.some(x=>x instanceof CryptoKey&&!x.extractable),encryptedRecords:records.filter(x=>x?.cipher instanceof ArrayBuffer).length,plainPayloadOrTokens:records.some(x=>x?.chunks||x?.token||x?.manifest)};}
export async function forgetCompleted(){await transaction('readwrite',s=>{s.delete(scoped('plan'));s.delete(scoped('pending'));s.delete(scoped('key'));});}
