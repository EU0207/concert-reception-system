import assert from 'node:assert/strict';
import {prepare,decode} from '../GD91-123/model.mjs';
import {hash} from '../GD91-128/conversion.mjs';

// POC-006の採用候補だったBytes単体形式。旧7片・5MB形式は1MB上限へ読み替えない。
export function convert(source,operationId){
 assert.deepEqual(Object.keys(source).sort(),['format','slot','meta','bank'].sort(),'unsupported-image-area');
 assert.equal(source.format,'poc006-compact-bytes-v1','unsupported-image-format');
 assert(/^[0-4]$/.test(source.slot),'unsupported-image-slot');
 assert.deepEqual(Object.keys(source.meta).sort(),['activeBank','draftBank','activeVersion','draftVersion'].sort(),'unsupported-image-meta');
 assert(['0','1'].includes(source.meta.activeBank),'unsupported-source-bank');
 assert(Number.isSafeInteger(source.meta.activeVersion)&&source.meta.activeVersion>0,'invalid-source-version');
 assert.equal(source.bank.version,source.meta.activeVersion,'mixed-image-version');
 assert.deepEqual(Object.keys(source.bank).sort(),['version','mimeType','payload'].sort(),'unsupported-bank-field');
 const bytes=Buffer.from(source.bank.payload,'base64');
 assert.equal(bytes.toString('base64'),source.bank.payload,'noncanonical-base64');
 const payload=prepare(bytes,source.bank.mimeType,0,operationId);assert.deepEqual(decode(payload),bytes);
 return {slot:source.slot,payload,sourceHash:hash(source),sourceVersion:source.meta.activeVersion,sourceBank:source.meta.activeBank};
}

// stateは再開確認用のRAM。端末保存と正式な移行用UIの証拠ではない。
export async function step(item,{read,write,state,afterBank=async()=>{},afterPublish=async()=>{}}){
 const p=item.payload,path='images/'+item.slot,head=await read(path+'/head');
 if(head){
  assert.equal(head.operationId,p.operationId,'target-image-operation-conflict');
  assert.equal(head.sha256,p.sha256,'target-image-hash-conflict');
  assert.equal(head.bank,'a');assert.equal(head.revision,1);assert.equal(head.active,true);
  assert.deepEqual(await read(path+'/banks/a'),p,'target-image-bytes-conflict');
  const op=await read(path+'/operations/'+p.operationId);assert(op&&op.sha256===p.sha256&&op.kind==='publish','missing-publication-result');
  state[item.slot]={phase:'verified',sourceHash:item.sourceHash,operationId:p.operationId};
  return {reused:true};
 }
 // 未作成バンクは通常権限で読めない。権限エラーを不存在へ読み替えない。
 if(state[item.slot]?.phase==='staged')assert.deepEqual(await read(path+'/banks/a'),p,'staged-image-conflict');
 else await write(path+'/banks/a','PUT',p);
 state[item.slot]={phase:'staged',sourceHash:item.sourceHash,operationId:p.operationId};await afterBank();
 const result={schemaVersion:1,kind:'publish',slot:item.slot,revision:1,bank:'a',sha256:p.sha256,committedAt:{'.sv':'timestamp'}};
 await write(path,'PATCH',{head:{schemaVersion:1,revision:1,active:true,bank:'a',operationId:p.operationId,sha256:p.sha256},['operations/'+p.operationId]:result});
 await afterPublish();
 return step(item,{read,write,state});
}
