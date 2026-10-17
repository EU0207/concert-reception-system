import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function prepare(bytes, mime, revision = 0, operationId = randomUUID()) {
  assert(bytes.length > 0 && bytes.length <= 1000000, 'image-raw-byte-limit');
  assert(['image/png','image/jpeg'].includes(mime),'image-mime');
  return {schemaVersion:1,expectedRevision:revision,revision:revision+1,operationId,mime,
    rawBytes:bytes.length,base64:bytes.toString('base64'),sha256:digest(bytes)};
}
export function decode(payload) {
  const bytes = Buffer.from(payload.base64,'base64');
  assert.equal(bytes.toString('base64'),payload.base64,'noncanonical-base64');
  assert.equal(bytes.length,payload.rawBytes,'image-size-mismatch');
  assert.equal(digest(bytes),payload.sha256,'image-hash-mismatch');
  assert(bytes.length <= 1000000,'image-raw-byte-limit');
  return bytes;
}
export function publish(slot,bank,payload) {
  const head = {schemaVersion:1,revision:payload.revision,active:true,bank,
    operationId:payload.operationId,sha256:payload.sha256};
  return {head,['operations/'+payload.operationId]:{schemaVersion:1,kind:'publish',slot,
    revision:head.revision,bank,sha256:head.sha256,committedAt:{'.sv':'timestamp'}}};
}
export function remove(slot,revision) {
  const operationId=randomUUID(),head={schemaVersion:1,revision:revision+1,active:false,bank:'',operationId,sha256:''};
  return {head,['operations/'+operationId]:{schemaVersion:1,kind:'remove',slot,revision:head.revision,bank:'',sha256:'',committedAt:{'.sv':'timestamp'}}};
}
