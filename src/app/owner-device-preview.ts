// 外部通信・永続保存なしで、架空の既存端末と新端末の関連付けを確認する。

import { createOwnerDeviceToken, ownerDeviceLinkDigest, OWNER_DEVICE_LINK_LIFETIME } from '../domain/authorization/device-registration.ts';
import type { OwnerDeviceLink } from '../domain/authorization/device-registration.ts';
import type { Scope } from '../domain/seats/types.ts';
import { requireValue } from '../domain/seats/validation.ts';
import type { OwnerDeviceUiPort, OwnerDeviceView } from './owner-device-types.ts';

/** 既存端末と二つの追加端末が、架空の台帳を共有する。 */
export function createOwnerDevicePreview(scope: Scope) {
  const currentDevice = 'preview-owner-current';
  const newDevices = ['スマートフォン（2台目）', 'タブレット（3台目）'] as const;
  const links = new Map<string, { digest: string; link: OwnerDeviceLink }>();
  const readers = new Set<string>(), approvedDevices = new Set<string>();
  const started = Date.now();

  /** 発行元または新端末の操作を、同じ架空台帳へ接続する。 */
  function port(mode: OwnerDeviceView['mode'], deviceUid: string): OwnerDeviceUiPort {
    const listeners = new Set<() => void>();
    return {
      /** 架空の台帳と結果だけを返し、追加承認や端末準備を自動実行しない。 */
      async load() {
        return structuredClone({ ...scope, mode, deviceUid,
          serverNow: Date.now(), validUntil: started + OWNER_DEVICE_LINK_LIFETIME,
          targets: mode === 'issuer' ? newDevices.filter(target => !approvedDevices.has(target)) : [],
          issues: mode === 'issuer' ? [...links.values()].map(({ link }) => ({ ...link })) : [],
          readers: [...links.values()].filter(({ link }) => link.targetDeviceUid === deviceUid && readers.has(link.operationId) &&
            (link.status === 'consumed' || (link.status === 'pending' && Date.now() < link.expiresAt)))
            .map(({ link }) => ({ operationId: link.operationId, approved: link.status === 'consumed' })) });
      },

      /** トークンは返すだけにし、台帳には照合値だけを保持する。 */
      async issue(target, operationId) {
        requireValue(mode === 'issuer' && newDevices.some(device => device === target) && !approvedDevices.has(target) &&
          !links.has(operationId), 'PENDING_OWNER_DEVICE_REQUIRED');
        const { token, digest } = await createOwnerDeviceToken(), now = Date.now();
        const link: OwnerDeviceLink = { ...scope, schemaVersion: 1, operationId, purpose: 'owner-device', ownerUid: 'preview-owner',
          ownerRoleRevision: 1, issuerDeviceUid: 'preview-owner-current', targetDeviceUid: target, storageEpoch: crypto.randomUUID(),
          issuedAt: now, expiresAt: now + OWNER_DEVICE_LINK_LIFETIME - 1000, status: 'pending', revision: 1 };
        links.set(operationId, { digest, link }); return { token, link: structuredClone(link) };
      },

      /** 見本の未使用リンクだけを取り消す。 */
      async cancel(id) {
        const entry = links.get(id); requireValue(mode === 'issuer' && entry?.link.status === 'pending', 'OWNER_LINK_UNAVAILABLE');
        entry!.link.status = 'cancelled'; entry!.link.revision++;
      },

      /** 照合値と期限の一致を確認し、架空端末の読取り済み状態にする。 */
      async read(token) {
        const digest = await ownerDeviceLinkDigest(token), entry = [...links.values()].find(item => item.digest === digest);
        requireValue(mode === 'receiver' && entry?.link.status === 'pending' && Date.now() < entry.link.expiresAt, 'OWNER_LINK_UNAVAILABLE');
        requireValue(entry.link.targetDeviceUid === deviceUid, 'OWNER_LINK_BINDING_MISMATCH');
        readers.add(entry.link.operationId);
        return entry.link.operationId;
      },

      /** 読取り済みの同じ案だけを一度確定する。 */
      async approve(id) {
        const entry = links.get(id); requireValue(mode === 'receiver' && readers.has(id) && entry?.link.status === 'pending' &&
          Date.now() < entry.link.expiresAt && entry.link.targetDeviceUid === deviceUid &&
          !approvedDevices.has(deviceUid), 'OWNER_LINK_UNAVAILABLE');
        entry.link.status = 'consumed'; entry.link.revision++; approvedDevices.add(deviceUid);
      },

      onInvalidate: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      /** 画面の購読を外し、別の見本画面へ切替えても台帳は保持する。 */
      dispose() { listeners.clear(); },
    };
  }

  return { issuer: port('issuer', currentDevice), receivers: newDevices.map(name => ({ name, port: port('receiver', name) })) };
}
