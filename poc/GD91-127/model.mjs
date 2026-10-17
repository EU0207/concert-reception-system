import assert from 'node:assert/strict';
import {command as original} from '../GD91-126/model.mjs';
export {applyModel} from '../GD91-103/model.mjs';
export const stats={created:0,checked:0,credentialBytes:16,credentialCharacters:22,codeCharacters:8,qualificationValuesPersisted:false};
export function command(...args){
  const body=original(...args),op=body['operations/'+body.commit.operationId];
  if(op.kind==='qrCreate'){
    assert(/^[A-Za-z0-9_-]{21}[AQgw]$/.test(op.newCredential));
    assert.equal(Buffer.from(op.newCredential,'base64url').length,16);
    assert(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(op.newCode));stats.created++;
  }
  if(op.kind==='ticketCheck')stats.checked++;
  return body;
}
