// 別端末を本文のUIDで装えないよう、別々のSDK資格で要求し、現在認可を正本から読む。

import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onValue,
  ref,
  serverTimestamp,
  set,
} from 'firebase/database';
import type { Database } from 'firebase/database';
import { initializeAppCheck, getToken, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import type { AppCheck } from 'firebase/app-check';
import { onIdTokenChanged } from 'firebase/auth';
import type { Scope } from '../../domain/seats/types.ts';
import { isId, requireValue } from '../../domain/seats/validation.ts';
import { createPersonSession, validUid } from '../../domain/authorization/policy.ts';
import type {
  AuthorizationSnapshot,
  DeviceGrant,
  HumanIdentity,
  PersonSession,
  RoleGrant,
  TemporaryProfile,
} from '../../domain/authorization/types.ts';
import type { AuthorizationPort } from '../../security/authorization-controller.ts';
import type { FirebasePrincipals } from './principals.ts';
import { ensureDeviceIdentity, readHumanIdentity } from './principals.ts';
import { createRoleManagementPort } from './role-management-port.ts';
import { createOwnerHandoverPort } from './owner-handover-port.ts';
import { createDeviceManagementPort } from './device-management-port.ts';
import { createDeviceRegistrationPort } from './device-registration-port.ts';
import { createOwnerDeviceLinkPort } from './owner-device-link-port.ts';

interface ConnectionOptions {
  appCheckSiteKey?: string;
  /** エミュレーター接続はdemo-プロジェクトの評価環境でだけ呼ぶ。 */
  emulatorDatabasePort?: number;
}

const appChecks = new Map<string, { siteKey: string; instance: AppCheck }>();
const emulatorConnections = new WeakMap<Database, number>();

function appCheckFor(app: FirebasePrincipals['humanApp'], siteKey: string): AppCheck {
  const prior = appChecks.get(app.name);
  if (prior) {
    requireValue(prior.siteKey === siteKey, 'APP_CHECK_CONFIGURATION_MISMATCH');
    return prior.instance;
  }
  const instance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  appChecks.set(app.name, { siteKey, instance });
  return instance;
}

/** 無検査の接続を作らないよう、App Checkを準備してから本人・端末用のDBを取得する。 */
export async function createAuthorizationPort(
  principals: FirebasePrincipals,
  scope: Scope,
  options: ConnectionOptions,
): Promise<
  AuthorizationPort & {
    issueSession(expiresAt: number): Promise<PersonSession>;
    revokeSession(): Promise<void>;
    dispose(): void;
    roles: ReturnType<typeof createRoleManagementPort>;
    ownerHandover: ReturnType<typeof createOwnerHandoverPort>;
    devices: ReturnType<typeof createDeviceManagementPort>;
    registration: ReturnType<typeof createDeviceRegistrationPort>;
    ownerDeviceLinks: ReturnType<typeof createOwnerDeviceLinkPort>;
  }
> {
  requireValue(
    isId(scope.environmentId) && isId(scope.performanceId),
    'INVALID_AUTHORIZATION_SCOPE',
  );
  requireValue(
    principals.humanApp.name === `concert:${scope.environmentId}:human` &&
      principals.deviceApp.name === `concert:${scope.environmentId}:device`,
    'FIREBASE_ENVIRONMENT_MISMATCH',
  );
  let identity: HumanIdentity | null = await readHumanIdentity(principals);
  requireValue(identity.emailVerified, 'VERIFIED_HUMAN_REQUIRED');
  const deviceUid = await ensureDeviceIdentity(principals);
  const emulator = options.emulatorDatabasePort !== undefined;
  let checks: AppCheck[] = [];
  if (emulator) {
    requireValue(
      principals.humanApp.options.projectId?.startsWith('demo-') &&
        principals.humanAuth.emulatorConfig?.host === '127.0.0.1' &&
        principals.deviceAuth.emulatorConfig?.host === '127.0.0.1' &&
        Number.isSafeInteger(options.emulatorDatabasePort) &&
        options.emulatorDatabasePort! >= 1024 &&
        options.emulatorDatabasePort! <= 65535,
      'INVALID_EMULATOR_CONFIGURATION',
    );
  } else {
    requireValue(
      typeof options.appCheckSiteKey === 'string' && options.appCheckSiteKey.length > 0,
      'APP_CHECK_REQUIRED',
    );
    checks = [
      appCheckFor(principals.humanApp, options.appCheckSiteKey),
      appCheckFor(principals.deviceApp, options.appCheckSiteKey),
    ];
  }
  const humanDatabase = getDatabase(principals.humanApp),
    deviceDatabase = getDatabase(principals.deviceApp);
  if (emulator) {
    for (const database of [humanDatabase, deviceDatabase]) {
      const priorPort = emulatorConnections.get(database);
      if (priorPort === undefined) {
        connectDatabaseEmulator(database, '127.0.0.1', options.emulatorDatabasePort!);
        emulatorConnections.set(database, options.emulatorDatabasePort!);
      } else
        requireValue(
          priorPort === options.emulatorDatabasePort,
          'FIREBASE_CONNECTION_MODE_MISMATCH',
        );
    }
  }
  const root = `environments/${scope.environmentId}/performances/${scope.performanceId}`;
  const listeners = new Set<(reason?: 'authorization' | 'network') => void>();
  const disposers: (() => void)[] = [];
  let disposed = false;

  const invalidate = (reason: 'authorization' | 'network' = 'authorization') => {
    for (const listener of listeners) listener(reason);
  };
  const watch = (database: Database, path: string, expectedInitial?: unknown) => {
    let initial = true;
    let finishInitial!: () => void;
    const state = {
      value: undefined as unknown,
      error: undefined as unknown,
      ready: new Promise<void>((resolve) => {
        finishInitial = resolve;
      }),
    };
    disposers.push(
      onValue(
        ref(database, path),
        (value) => {
          state.value = value.val();
          if (initial) {
            initial = false;
            finishInitial();
            if (
              expectedInitial !== undefined &&
              JSON.stringify(value.val()) !== JSON.stringify(expectedInitial)
            )
              invalidate();
            return;
          }
          invalidate();
        },
        (error) => {
          state.error = error;
          finishInitial();
          invalidate();
        },
      ),
    );
    return state;
  };
  const watchAuth = (auth: FirebasePrincipals['humanAuth']) => {
    let initial = true;
    disposers.push(
      onIdTokenChanged(auth, () => {
        if (initial) {
          initial = false;
          return;
        }
        identity = null;
        invalidate();
      }),
    );
  };
  watchAuth(principals.humanAuth);
  watchAuth(principals.deviceAuth);
  const metadataWatches = [
    watch(humanDatabase, `${root}/roles/${identity.uid}`),
    watch(deviceDatabase, `${root}/devices/${deviceUid}`),
    watch(deviceDatabase, `${root}/sessions/${deviceUid}`),
  ];
  let connectedOnce = false;
  disposers.push(
    onValue(ref(deviceDatabase, '.info/connected'), (value) => {
      if (value.val() === true) connectedOnce = true;
      else if (connectedOnce) invalidate('network');
    }),
  );
  let controlWatched = false;

  const verified = async () => {
    requireValue(!disposed, 'AUTHORIZATION_PORT_DISPOSED');
    // 本人確認が失敗した後に、前回の成功値で操作を続けないよう先に無効にする。
    identity = null;
    identity = await readHumanIdentity(principals);
    requireValue(
      identity.emailVerified && principals.deviceAuth.currentUser?.uid === deviceUid,
      'CURRENT_IDENTITY_MISMATCH',
    );
    for (const check of checks) await getToken(check, false);
    return identity;
  };
  const read = async (database: Database, path: string) =>
    (await get(ref(database, `${root}/${path}`))).val() as unknown;
  const serverNow = async () => {
    const connected = await new Promise<unknown>((resolve, reject) => {
      onValue(ref(deviceDatabase, '.info/connected'), (value) => resolve(value.val()), reject, {
        onlyOnce: true,
      });
    });
    requireValue(connected === true, 'NETWORK_RECONFIRMATION_REQUIRED');
    // .infoはDB本文ではないため、サーバーへのgetではなくSDKの通知から取得する。
    const offset = await new Promise<unknown>((resolve, reject) => {
      onValue(
        ref(deviceDatabase, '.info/serverTimeOffset'),
        (value) => resolve(value.val()),
        reject,
        { onlyOnce: true },
      );
    });
    requireValue(typeof offset === 'number' && Number.isFinite(offset), 'SERVER_TIME_UNAVAILABLE');
    return Math.floor(Date.now() + offset);
  };

  async function fetchCurrent() {
    const human = await verified();
    // 切断中のgetは応答待ちになり得るため、キャッシュ照合より先に接続を確かめる。
    await serverNow();
    // 初回通知を読み飛ばしたまま有効化すると、その間の停止を見落とすため先に待つ。
    await Promise.all(metadataWatches.map((state) => state.ready));
    for (const state of metadataWatches) if (state.error) throw state.error;
    const currentDevice = (await read(
      deviceDatabase,
      `devices/${deviceUid}`,
    )) as DeviceGrant | null;
    requireValue(
      currentDevice &&
        currentDevice.active === true &&
        currentDevice.approved === true &&
        currentDevice.retired === false,
      'DEVICE_UNAVAILABLE',
    );
    const paths = [
      `roles/${human.uid}`,
      `devices/${deviceUid}`,
      `sessions/${deviceUid}`,
      'control',
    ];
    const readAll = () =>
      Promise.all(
        paths.map((path, index) => read(index === 0 ? humanDatabase : deviceDatabase, path)),
      );
    const first = await readAll(),
      second = await readAll();
    requireValue(JSON.stringify(first) === JSON.stringify(second), 'AUTHORIZATION_CHANGED');
    requireValue(
      metadataWatches.every(
        (state, index) => JSON.stringify(state.value) === JSON.stringify(second[index]),
      ),
      'AUTHORIZATION_CHANGED',
    );
    const [role, device, session, control] = second as [
      RoleGrant,
      DeviceGrant,
      PersonSession,
      { state: AuthorizationSnapshot['state']; staffDeadline: number },
    ];
    requireValue(role && device && session && control, 'AUTHORIZATION_RECORD_MISSING');
    const snapshot: AuthorizationSnapshot = {
      ...scope,
      deviceAuthUid: deviceUid,
      role,
      device,
      session,
      state: control.state,
      staffDeadline: control.staffDeadline,
    };
    if (role.role === 'temporary') {
      const profile = (await read(
        deviceDatabase,
        `temporaryPermissionProfiles/${human.uid}/${role.revision}`,
      )) as TemporaryProfile | null;
      if (profile) snapshot.temporaryProfile = profile;
    }
    // serverTimeOffsetは推定値。Rulesが確定した発行時刻より前へは戻さない。
    const currentTime = Math.max(await serverNow(), session.issuedAt);
    if (!controlWatched) {
      watch(deviceDatabase, `${root}/control`, control);
      controlWatched = true;
    }
    return { snapshot, serverNow: currentTime };
  }

  async function issueSession(expiresAt: number): Promise<PersonSession> {
    const human = await verified();
    const [role, device, prior] = (await Promise.all([
      read(humanDatabase, `roles/${human.uid}`),
      read(humanDatabase, `devices/${deviceUid}`),
      read(humanDatabase, `sessions/${deviceUid}`),
    ])) as [RoleGrant, DeviceGrant, PersonSession | null];
    requireValue(role && device, 'AUTHORIZATION_RECORD_MISSING');
    const now = await serverNow();
    const next = createPersonSession({ ...scope, role, device }, human, now, expiresAt, prior);
    await set(ref(humanDatabase, `${root}/sessions/${deviceUid}`), {
      ...next,
      issuedAt: serverTimestamp(),
    });
    const stored = (await read(humanDatabase, `sessions/${deviceUid}`)) as PersonSession;
    requireValue(
      stored &&
        stored.revision === next.revision &&
        stored.humanUid === human.uid &&
        stored.deviceUid === deviceUid &&
        stored.active === true,
      'SESSION_RESULT_MISMATCH',
    );
    return stored;
  }

  async function revokeSession(): Promise<void> {
    const human = await verified();
    const prior = (await read(humanDatabase, `sessions/${deviceUid}`)) as PersonSession | null;
    if (!prior) return;
    requireValue(
      prior.humanUid === human.uid && prior.deviceUid === deviceUid && validUid(human.uid),
      'PRINCIPAL_MISMATCH',
    );
    await set(ref(humanDatabase, `${root}/sessions/${deviceUid}`), {
      ...prior,
      active: false,
      revision: prior.revision + 1,
    });
    invalidate();
  }

  const registration = createDeviceRegistrationPort({
    humanDatabase,
    deviceDatabase,
    scope,
    deviceUid,
    root,
    verify: verified,
    serverNow,
  });
  return {
    devices: createDeviceManagementPort({ deviceDatabase, root, verify: verified, fetchCurrent }),
    registration,
    ownerDeviceLinks: createOwnerDeviceLinkPort({
      deviceDatabase,
      deviceUid,
      root,
      verify: verified,
      fetchCurrent,
      serverNow,
      refreshProof: async () => {
        await registration.request();
        await registration.bindHuman();
      },
    }),
    ownerHandover: createOwnerHandoverPort({
      humanDatabase,
      deviceDatabase,
      root,
      verify: verified,
      fetchCurrent,
      serverNow,
    }),
    roles: createRoleManagementPort({
      humanDatabase,
      deviceDatabase,
      root,
      verify: verified,
      fetchCurrent,
      serverNow,
    }),
    fetchCurrent,
    issueSession,
    revokeSession,
    identity: () => ({
      human: identity,
      deviceUid: principals.deviceAuth.currentUser?.uid ?? null,
    }),
    onInvalidate: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      disposed = true;
      for (const dispose of disposers) dispose();
      listeners.clear();
      identity = null;
    },
  };
}
