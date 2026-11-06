// 全て架空の本人・端末。認可の境界試験で使う最小の現在状態。
import { TEMPORARY_PERMISSIONS } from '../../../src/domain/authorization/index.ts';

export const now = Date.parse('2026-11-06T00:00:00Z');
export const scope = {
  environmentId: '00000000-0000-4000-8000-000000000001',
  performanceId: '00000000-0000-4000-8000-000000000002',
};

export function snapshot(role = 'owner') {
  return {
    ...scope,
    deviceAuthUid: 'fictional-device-a',
    state: 'operating',
    staffDeadline: now + 172800000,
    role: {
      ...scope,
      humanUid: 'fictional-human',
      role,
      active: true,
      revision: 1,
      startsAt: now - 1000,
      endsAt: now + 172800000,
    },
    device: {
      ...scope,
      schemaVersion: 2,
      deviceUid: 'fictional-device-a',
      humanUid: 'fictional-human',
      active: true,
      approved: true,
      retired: false,
      storageEpoch: '00000000-0000-4000-8000-000000000003',
      preparedRole: role,
      preparedRoleRevision: 1,
    },
    session: {
      ...scope,
      schemaVersion: 2,
      deviceUid: 'fictional-device-a',
      humanUid: 'fictional-human',
      active: true,
      emailVerified: true,
      authProvider: ['owner', 'deputy'].includes(role) ? 'google.com' : 'password',
      roleRevision: 1,
      revision: 1,
      issuedAt: now - 1000,
      expiresAt: now + 3600000,
      humanAuthTime: now - 1000,
    },
    temporaryProfile: {
      schemaVersion: 1,
      humanUid: 'fictional-human',
      roleVersion: 1,
      status: 'active',
      validFrom: now - 1000,
      validUntil: now + 86400000,
      permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true])),
    },
  };
}
