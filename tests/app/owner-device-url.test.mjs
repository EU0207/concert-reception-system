// 追加端末リンクの秘密をURL断片へ限定し、他の公開先・公演を拒否する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerDeviceUrl, parseOwnerDeviceUrl } from '../../src/app/owner-device-url.ts';
import { takeOwnerDeviceToken, createOwnerDeviceToken } from '../../src/domain/authorization/device-registration.ts';

test('OWNER317-D01 リンクは同じ公開先・公演へ限定し、秘密をクエリーへ含めない', async () => {
  const scope = {environmentId:crypto.randomUUID(),performanceId:crypto.randomUUID()}, {token} = await createOwnerDeviceToken();
  const base='https://example.invalid/concert/?old=1#/events', link=ownerDeviceUrl(base,scope,token), url=new URL(link);
  assert.equal(url.search.includes(token),false); assert.equal(url.search.includes('old'),false);
  assert.equal(parseOwnerDeviceUrl(link,base,scope),token);
  for(const changed of [link.replace('example.invalid','other.invalid'),link.replace('/concert/','/other/'),
    link.replace(scope.performanceId,crypto.randomUUID()),link.replace(scope.environmentId,crypto.randomUUID())]) {
    assert.throws(()=>parseOwnerDeviceUrl(changed,base,scope),{code:'OWNER_LINK_BINDING_MISMATCH'});
  }
});

test('OWNER317-D02 不正な秘密でも、解析前にURL断片の除去を実行する', () => {
  let stripped=false;
  assert.throws(()=>takeOwnerDeviceToken(new URL('https://example.invalid/#owner-device-link=invalid'),()=>{stripped=true;}),
    {code:'INVALID_OWNER_DEVICE_TOKEN'});
  assert.equal(stripped,true);
});
