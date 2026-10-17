// 隔離PoC。旧下書きの保全と接続先選択の原子的な更新だけを検査する。
const enc=new TextEncoder(),dec=new TextDecoder(),name='GD91-129-isolated-migration';
function assert(value,code){if(!value)throw Error(code);}
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{for(const n of ['keys','records'])r.result.createObjectStore(n);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transaction(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction(['keys','records'],mode);let result,failure;
 const set=v=>result=v,abort=e=>{failure=e;tx.abort();};
 try{fn(tx,set,abort);}catch(e){abort(e);}
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure??tx.error??Error('aborted'));tx.onerror=()=>{};
 });}finally{db.close();}}
const get=async(store,id)=>transaction('readonly',(tx,set)=>{const r=tx.objectStore(store).get(id);r.onsuccess=()=>set(r.result);});
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(v))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const key=()=>crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
async function seal(value,k,scope){const iv=crypto.getRandomValues(new Uint8Array(12));return{format:1,iv,ciphertext:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(scope)},k,enc.encode(JSON.stringify(value)))};}
async function unseal(value,k,scope){assert(value.format===1,'unsupported-envelope');return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:value.iv,additionalData:enc.encode(scope)},k,value.ciphertext)));}
const oldScope='FAKE-performance/FAKE-old-human/FAKE-old-device',newScope='FAKE-performance/FAKE-new-human/FAKE-new-device';
export async function seed(){
 const k=await key(),draft={format:1,baseVersions:{commit:8,layout:2},content:{label:'架空の未送信案'},operationId:crypto.randomUUID()},hash=await digest(draft.content);
 const old=await seal(draft,k,oldScope),pending={id:draft.operationId,contentHash:hash,status:'unknown'};
 await transaction('readwrite',(tx)=>{tx.objectStore('keys').put(k,oldScope);const s=tx.objectStore('records');s.put(old,'oldDraft');s.put(pending,'pending');s.put({adapter:'firestore',version:1,writesAllowed:false},'config');});
 return{oldHash:await digest(draft),pending};
}
export async function inspect(){
 const old=await get('records','oldDraft'),oldKey=await get('keys',oldScope),config=await get('records','config'),next=await get('records','newDraft'),newKey=await get('keys',newScope);
 let exportDenied=false;try{await crypto.subtle.exportKey('raw',oldKey);}catch{exportDenied=true;}
 const oldDraft=await unseal(old,oldKey,oldScope),newDraft=next?await unseal(next,newKey,newScope):null;
 let newIdentityUsesSeparateKey=null;
 if(newKey){newIdentityUsesSeparateKey=false;try{await unseal(old,newKey,oldScope);}catch{newIdentityUsesSeparateKey=true;}}
 return{config,oldHash:await digest(oldDraft),oldBaseVersions:oldDraft.baseVersions,newDraft,
  pending:await get('records','pending'),oldKeyExtractable:oldKey.extractable,newKeyExtractable:newKey?.extractable??null,exportDenied,
  plaintextStored:JSON.stringify(old).includes('架空'),newIdentityUsesSeparateKey};
}
export async function migrate(options){
 const config=await get('records','config'),pending=await get('records','pending'),old=await get('records','oldDraft'),oldKey=await get('keys',oldScope);
 assert(config.version===1&&config.adapter==='firestore'&&!config.writesAllowed,'source-not-stopped-or-stale');
 assert(options.format===2,'unsupported-target-format');assert(options.targetVerified&&options.newIdentityPrepared,'target-not-prepared');
 assert(options.result?.status==='committed'&&options.result.id===pending.id&&options.result.contentHash===pending.contentHash,'unresolved-or-mismatched-result');
 assert(options.unsentEvents===0,'unreceived-event');
 const draft=await unseal(old,oldKey,oldScope),newKey=await key(),converted={format:2,sourceBaseVersions:draft.baseVersions,targetBaseRevision:8,
  content:draft.content,sourceOperationId:draft.operationId,needsReview:true,automaticallyCommitted:false};
 const next=await seal(converted,newKey,newScope);
 if(options.corrupt)next.ciphertext=new Uint8Array([0]).buffer;
 assert(JSON.stringify(await unseal(next,newKey,newScope))===JSON.stringify(converted),'conversion-roundtrip');
 await transaction('readwrite',(tx,set,abort)=>{const s=tx.objectStore('records'),r=s.get('config');r.onsuccess=()=>{
  if(r.result.version!==1||r.result.adapter!=='firestore'){abort(Error('stale-migration'));return;}
  tx.objectStore('keys').put(newKey,newScope);s.put(next,'newDraft');s.put({...pending,status:'committed'},'pending');
  const w=s.put({adapter:'rtdb',version:2,writesAllowed:false,requiresReview:true,newIdentityPrepared:true},'config');
  if(options.abort)w.onsuccess=()=>abort(new DOMException('injected-abort','QuotaExceededError'));set({converted:true,oldPreserved:true});
 };});
 return inspect();
}
export async function stopAfterNewFact(){
 const fact=await seal({kind:'arrival',person:'FAKE-person',eventId:crypto.randomUUID()},await get('keys',newScope),newScope);
 await transaction('readwrite',tx=>{const s=tx.objectStore('records');s.put(fact,'newFact');s.put({adapter:'rtdb',version:3,writesAllowed:false,recoveryDecisionRequired:true,legacyResumeAllowed:false},'config');});
 return{...await inspect(),newFactPreserved:!!await get('records','newFact')};
}
window.migration={seed,inspect,migrate,stopAfterNewFact};
