import assert from 'node:assert/strict';import {webcrypto,randomBytes,randomUUID} from 'node:crypto';import {canonical,hash} from '../GD91-128/conversion.mjs';
const {subtle}=webcrypto,format='concert-reception-encrypted-backup',aad=Buffer.from(format+'/1/AES-256-GCM/none');
const areas=['versions','control','layouts','people','labels','buyers','eligible','assignments','tickets','credentials','codes','operations','reception','deletions','sharedDrafts','sharedHead'];
const forbid=new Set(['password','token','idToken','refreshToken','privateKey','cryptoKey','deviceCryptoKey','qrPayload','invitationLink','serviceAccount','authenticationUsers']);
function safe(value){if(!value||typeof value!=='object')return;for(const[k,v]of Object.entries(value)){assert(!forbid.has(k),'forbidden-backup-field');safe(v);}}
function counts(data){return Object.fromEntries(areas.map(k=>[k,Array.isArray(data[k])?data[k].length:data[k]&&typeof data[k]==='object'?Object.keys(data[k]).length:0]));}
function access(context){assert(context.role==='owner'&&context.online,'owner-online-required');assert(Number.isSafeInteger(context.now)&&context.reauthAt<=context.now&&context.now-context.reauthAt<=900000,'recent-reauth-required');}
function validate(inner){
 assert.equal(inner.schemaVersion,1,'unsupported-inner-schema');assert.equal(inner.appVersion,'GD91-132-isolated-format-1');assert(Number.isFinite(Date.parse(inner.createdAt)));
 assert.equal(inner.exportId.length,36);assert.equal(inner.sourceEnvironment,inner.eventsAndSettings.versions.environmentId);
 assert.equal(inner.performanceId,inner.eventsAndSettings.versions.performanceId);assert.deepEqual(Object.keys(inner.eventsAndSettings).sort(),[...areas].sort());
 safe(inner);for(const k of areas)assert.equal(inner.itemHashes[k],hash(inner.eventsAndSettings[k]),'item-hash-mismatch');
 assert.deepEqual(inner.counts,counts(inner.eventsAndSettings),'count-mismatch');
 assert.equal(new Set(Object.values(inner.eventsAndSettings.operations).map(e=>e.operationId)).size,Object.keys(inner.eventsAndSettings.operations).length,'duplicate-event-id');
 for(const[id,p]of Object.entries(inner.eventsAndSettings.people)){assert.equal(p.attendeeId,id,'person-id-mismatch');assert(!inner.eventsAndSettings.deletions[id],'deleted-person-present');}
 assert(['preparing','ended','closed'].includes(inner.eventsAndSettings.control.state),'unsupported-control-state');
 return inner;
}
export function inner(source,{exportId=randomUUID(),now=Date.now()}={}){
 assert.equal(source.format,1);assert.equal(source.pendingOperations.length,0,'pending-operation');assert.equal(source.unsentEvents,0,'unsent-event');
 assert(source.reconciliation?.sourceAccessFenced,'source-not-fenced');
 const eventsAndSettings=Object.fromEntries(areas.map(k=>{assert(Object.hasOwn(source,k),'missing-area');return[k,structuredClone(source[k])];}));
 return validate({schemaVersion:1,exportId,createdAt:new Date(now).toISOString(),sourceEnvironment:source.versions.environmentId,
  appVersion:'GD91-132-isolated-format-1',performanceId:source.versions.performanceId,counts:counts(eventsAndSettings),eventsAndSettings,
  itemHashes:Object.fromEntries(areas.map(k=>[k,hash(eventsAndSettings[k])]))});
}
export async function encrypt(value,recoveryKey){
 validate(value);const key=recoveryKey?await subtle.importKey('raw',Buffer.from(recoveryKey,'base64url'),'AES-GCM',true,['encrypt','decrypt']):await subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const raw=Buffer.from(await subtle.exportKey('raw',key));assert.equal(raw.length,32);const iv=randomBytes(12),sealed=Buffer.from(await subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,Buffer.from(canonical(value))));
 return{recoveryKey:raw.toString('base64url'),wrapper:{format,schemaVersion:1,cipher:'AES-256-GCM',kdf:'none',iv:iv.toString('base64'),ciphertext:sealed.subarray(0,-16).toString('base64'),authenticationTag:sealed.subarray(-16).toString('base64')}};
}
export async function create(source,context){access(context);const value=inner(source,{now:context.now});const sealed=await encrypt(value);return{...sealed,fileName:'evaluation-'+new Date(context.now).toISOString().slice(0,10)+'-'+value.exportId.slice(0,8)+'.json'};}
export async function decrypt(wrapper,recoveryKey){
 assert.deepEqual(Object.keys(wrapper).sort(),['format','schemaVersion','cipher','kdf','iv','ciphertext','authenticationTag'].sort());
 assert.equal(wrapper.format,format);assert.equal(wrapper.schemaVersion,1);assert.equal(wrapper.cipher,'AES-256-GCM');assert.equal(wrapper.kdf,'none');
 const bytes=k=>{const value=Buffer.from(wrapper[k],'base64');assert.equal(value.toString('base64'),wrapper[k],'noncanonical-base64');return value;};
 const iv=bytes('iv'),tag=bytes('authenticationTag');assert.equal(iv.length,12);assert.equal(tag.length,16);
 const raw=Buffer.from(recoveryKey,'base64url');assert.equal(raw.length,32);assert.equal(raw.toString('base64url'),recoveryKey);
 const key=await subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']),plain=await subtle.decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,Buffer.concat([bytes('ciphertext'),tag]));
 return validate(JSON.parse(Buffer.from(plain).toString()));
}
export async function restoreCheck(wrapper,recoveryKey,context,ledger){
 access(context);const value=await decrypt(wrapper,recoveryKey);assert.equal(value.sourceEnvironment,ledger.sourceEnvironment,'source-environment-mismatch');
 assert(ledger.targetEmpty,'nonempty-target');
 for(const id of Object.keys(ledger.deletedPeople??{}))assert(!value.eventsAndSettings.people[id],'deleted-data-would-revive');
 if(ledger.closed){assert.equal(value.eventsAndSettings.control.state,'closed','closed-state-would-reopen');assert.equal(value.eventsAndSettings.control.operationId,ledger.closeOperationId,'closing-generation-mismatch');}
 return value;
}
// ステージングとexportId重複防止のRAMモデル。DBへの通常取込機能の合格ではない。
export class Staging{
 constructor(){this.values=new Map();this.active=null;}
 stage(value,{abort=false}={}){assert(!this.active,'already-active');const digest=hash(value),old=this.values.get(value.exportId);if(old){assert.equal(old.digest,digest,'export-id-content-mismatch');return{duplicate:false,reused:true};}
  if(abort)throw Error('injected-staging-failure');this.values.set(value.exportId,{digest,value:structuredClone(value)});return{staged:true};}
 activate(id){assert(!this.active,'already-active');assert(this.values.has(id),'missing-staging');this.active=id;}
}
