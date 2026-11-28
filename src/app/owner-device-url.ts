// 追加端末リンクを同じ公開先・公演へ限定し、平文トークンを保存せず受け渡す。

import { takeOwnerDeviceToken } from '../domain/authorization/device-registration.ts';
import { requireValue } from '../domain/seats/validation.ts';
import type { Scope } from '../domain/seats/types.ts';

/** 公演の識別子だけをクエリーへ、秘密のトークンをURL断片へ入れる。 */
export function ownerDeviceUrl(base: string, scope: Scope, token: string): string {
  requireValue(/^[A-Za-z0-9_-]{43}$/.test(token), 'INVALID_OWNER_DEVICE_TOKEN');
  const url = new URL(base);
  url.search = '';
  url.searchParams.set('environment', scope.environmentId);
  url.searchParams.set('performance', scope.performanceId);
  url.hash = 'owner-device-link=' + token;
  return url.href;
}

/** 貼り付けたリンクの公開先と公演を照合し、トークンだけを取り出す。 */
export function parseOwnerDeviceUrl(value: string, base: string, scope: Scope): string {
  const url = new URL(value), origin = new URL(base);
  requireValue(url.origin === origin.origin && url.pathname === origin.pathname &&
    url.searchParams.get('environment') === scope.environmentId && url.searchParams.get('performance') === scope.performanceId,
    'OWNER_LINK_BINDING_MISMATCH');
  const token = takeOwnerDeviceToken(url, () => {});
  requireValue(token, 'INVALID_OWNER_DEVICE_TOKEN');
  return token;
}
