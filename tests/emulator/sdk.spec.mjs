// ローカルAuth・RTDBへ通常SDKを接続し、端末認可と業務基盤の結合を確認する。

import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createPerformanceCalendar } from '../../src/domain/authorization/performance-calendar.ts';

const project = 'demo-concert-reception-product';
const performanceId = '00000000-0000-4000-8000-000000000002';

test('SHARE104-S01 未採番と5画像を通常SDKで共有し、応答喪失・明示再開と独立端末での復元を確認する', async ({ page, browser }) => {
  test.setTimeout(90000);
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid, 'owner');
  const rootUrl = `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}`;
  const query = `ns=${project}-default-rtdb`;
  const response = await fetch(`${rootUrl}/control/calendar.json?${query}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify(createPerformanceCalendar({ environmentId: f.environmentId, performanceId }, '2099-10-10', 'UTC', 1)),
  });
  expect(response.status).toBe(200);
  const result = await page.evaluate(async ({ scope, identity }) => {
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
    const { createLayout, createSection } = await import('/src/domain/seats/layout.ts');
    const { planSharedDraft, sharedCanonical } = await import('/src/domain/seats/shared-draft.ts');
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
    const { createSeatOperationController, withSeatOperationOwnership } = await import('/src/storage/seat-operation-controller.ts');
    const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
    const { createVenueImageStore } = await import('/src/storage/venue-images.ts');
    const { prepareVenueImage } = await import('/src/domain/seats/venue-image.ts');
    await linkFictionalGoogle(window.testPrincipals, identity);
    const port = await createAuthorizationPort(window.testPrincipals, scope, { emulatorDatabasePort: 9100 });
    await port.issueSession(Date.now() + 3600000);
    await port.initializePerformanceControl();
    const actor = (await port.fetchCurrent()).snapshot;
    const binding = { ...scope, humanUid: actor.role.humanUid, deviceUid: actor.deviceAuthUid, storageEpoch: actor.device.storageEpoch };
    await ensureDeviceKey(binding, true);
    const operations = createSeatDraftStore(binding, () => {}), delivery = createSeatDeliveryStore(binding, () => {});
    const imageStore = createVenueImageStore(binding, () => {}), imageHeads = {};
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    for (let index = 0; index < 5; index++) {
      const slot = String(index), payload = await prepareVenueImage(scope, bytes, 'image/png', 0, crypto.randomUUID());
      await port.images.publish(slot, 'a', payload, imageStore);
      imageHeads[slot] = (await port.images.readCurrent(slot)).head;
    }
    const layout = createSection(createLayout(scope), { name: '架空の未採番区画', rows: 2, columns: 17,
      axis: 'horizontal', seatOrder: 'forward', lines: [{ name: 'A' }, { name: 'B' }] }).after;
    const basis = await port.sharedSeats.basis(), operationId = crypto.randomUUID();
    const plan = planSharedDraft({ layout, editReasons: {}, imageBindings: {} }, basis, operationId, imageHeads);
    const versions = { layoutRevision: 0, assignmentRevision: 0, ticketRevision: 0, attendeeRevision: 0,
      controlRevision: basis.sourceControlRevision, calendarRevision: basis.calendarRevision };
    const input = { draftId: crypto.randomUUID(), baseVersions: versions, layout, editReasons: {}, imageBindings: {} };
    await operations.prepareSeatOperation(input, 0, { operationId, kind: 'share', expectedVersions: { ...versions, roleRevision: 1, deviceRevision: 1 },
      command: { ...scope, sharedPlan: plan } });
    const controller = createSeatOperationController({ scope: binding, operations, delivery, transport: port.sharedSeats.transport,
      assertAuthorized() {}, withOwnership: withSeatOperationOwnership });
    const outcome = await controller.run(operationId, 'send');
    const shared = await port.sharedSeats.readCurrent();
    window.sharedTrial = { port, binding, operations, delivery, controller, operationId, input, imageStore, imageHeads, bytes };

    return { outcome, unchanged: sharedCanonical(shared.source) === sharedCanonical({ layout, editReasons: {}, imageBindings: {} }),
      initialNumbered: shared.source.layout.sections[0].initialNumbered, sharedRevision: shared.head.revision, images: shared.images.length };
  }, { scope: { environmentId: f.environmentId, performanceId }, identity: { sub: randomUUID(), email: f.person.email } });
  expect(result).toMatchObject({ outcome: { status: 'confirmed' }, unchanged: true, initialNumbered: false, sharedRevision: 1, images: 5 });
  const resumed = await page.evaluate(async () => {
    const { port, binding, operations, delivery, controller, operationId, input, imageStore, bytes, imageHeads } = window.sharedTrial;
    const { numberInitial, editUnassignedSeat } = await import('/src/domain/seats/layout.ts');
    const { planSharedDraft, sharedCanonical } = await import('/src/domain/seats/shared-draft.ts');
    const { seatOperationDigest } = await import('/src/storage/seat-operation-controller.ts');
    const { prepareVenueImage } = await import('/src/domain/seats/venue-image.ts');
    const { createSharedDraftImporter } = await import('/src/storage/shared-draft-import.ts');
    const { getFictionalDeviceDatabase, ref, get, set } = await import('/tests/emulator/sdk-fixture.mjs');
    const db = getFictionalDeviceDatabase(window.testPrincipals), root = `environments/${binding.environmentId}/performances/${binding.performanceId}`;
    const replacement = await prepareVenueImage(binding, bytes, 'image/png', 1, crypto.randomUUID());
    await port.images.publish('0', 'b', replacement, imageStore);
    const collected = await Promise.allSettled([port.images.collect('0', 'a')]);
    const retained = await port.sharedSeats.readCurrent();
    const latestImage = await port.images.readCurrent('0');
    await imageStore.saveImage('0', latestImage.head, latestImage.payload, 0);
    const importer = createSharedDraftImporter(binding, () => {});
    const unconfirmed = await Promise.allSettled([importer.replace(retained, 1, false)]);
    const put = IDBObjectStore.prototype.put;
    let writes = 0;
    // 3枚目の保存で失敗させ、下書きと先行する画像も同じトランザクションで戻す。
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'venueImages' && ++writes === 3) throw new DOMException('fixture quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    let importFailure;
    try { importFailure = await Promise.allSettled([importer.replace(retained, 1, true)]); }
    finally { IDBObjectStore.prototype.put = put; }
    const priorDraft = await operations.loadLocalDraft(), priorImage = await imageStore.readImage('0');
    const importedOld = await importer.replace(retained, 1, true);
    const restoredOld = await imageStore.readImage('0');
    let layout = input.layout;
    const section = layout.sections[0].section;
    layout = numberInitial(layout, section.sectionId, Object.fromEntries(section.cells.map((cell) => [cell.cellId, 'seat']))).after;
    const seatId = layout.sections[0].seats[0].seatId;
    layout = editUnassignedSeat(layout, section.sectionId, seatId, { number: '臨時-席', reason: '架空の旧理由' }).after;
    const current = await port.sharedSeats.basis(), nextId = crypto.randomUUID();
    imageHeads['0'] = (await port.images.readCurrent('0')).head;
    const source = { layout, editReasons: { [seatId]: '架空の旧理由' }, imageBindings: { [section.sectionId]: '0' } };
    const plan = planSharedDraft(source, current, nextId, imageHeads);
    const versions = { ...input.baseVersions, controlRevision: current.sourceControlRevision };
    const nextInput = { ...input, ...source, baseVersions: versions };
    await operations.prepareSeatOperation(nextInput, 2, { operationId: nextId, kind: 'share', expectedVersions: { ...versions, roleRevision: 1, deviceRevision: 1 },
      command: { environmentId: binding.environmentId, performanceId: binding.performanceId, sharedPlan: plan } });
    const send = port.sharedSeats.transport.send;
    // 実際の共有確定後に応答を失った状況を、呼出し元へ渡る例外として注入する。
    port.sharedSeats.transport.send = async (op) => { await send(op); throw Error('FICTIONAL_RESPONSE_LOST'); };
    const failed = await Promise.allSettled([controller.run(nextId, 'send')]);
    port.sharedSeats.transport.send = send;
    const checked = await controller.run(nextId, 'check');
    const partialId = crypto.randomUUID(), partialPlan = planSharedDraft(source, await port.sharedSeats.basis(), partialId, imageHeads);
    await operations.prepareSeatOperation(nextInput, 3, { operationId: partialId, kind: 'share', expectedVersions: { ...versions, roleRevision: 1, deviceRevision: 1 },
      command: { environmentId: binding.environmentId, performanceId: binding.performanceId, sharedPlan: partialPlan } });
    const partial = await operations.readPendingSeatOperation(partialId);
    const oldMeta = (await get(ref(db, `${root}/sharedDrafts/${nextId}/meta`))).val();
    // 通常権限で本文準備の最初だけを保存し、中断後の明示再開を検査する。
    await set(ref(db, `${root}/sharedDrafts/${partialId}/meta`), { ...oldMeta, operationId: partialId, generation: partialId,
      expectedSharedRevision: 2, inputDigest: await seatOperationDigest(partial), draftDigest: partial.draftDigest });
    const waiting = await controller.run(partialId, 'check');
    const restarted = await controller.run(partialId, 'retry');
    const first = await operations.readPendingSeatOperation(operationId);
    const past = await port.sharedSeats.transport.lookup(first, await seatOperationDigest(first));
    await port.sharedSeats.transport.verifyApplied(first, past.receipt);
    const final = await port.sharedSeats.readCurrent();
    const beforeCompeting = (await operations.loadLocalDraft()).localRevision;
    const competing = await Promise.allSettled([importer.replace(final, beforeCompeting, true), importer.replace(final, beforeCompeting, true)]);
    const pendingImage = await prepareVenueImage(binding, bytes, 'image/png', 1, crypto.randomUUID());
    await imageStore.prepare('1', 'b', pendingImage);
    const pendingImport = await Promise.allSettled([importer.replace(final, beforeCompeting + 1, true)]);
    const afterPending = await operations.loadLocalDraft();
    window.sharedExpected = source;

    return { collect: collected[0].status, oldBank: retained.images.find((image) => image.slot === '0').head.bank,
      oldBasis: retained.baseVersions.controlRevision,
      unconfirmed: unconfirmed[0].status, importFailure: importFailure[0].status, priorDraftRevision: priorDraft.localRevision,
      priorImageRevision: priorImage.head.revision, importedRevision: importedOld.localRevision, restoredOldImageRevision: restoredOld.head.revision,
      competing: competing.map((value) => value.status).sort(), pendingImport: pendingImport[0].status,
      beforeCompeting, afterPending: afterPending.localRevision,
      failure: failed[0].status, checked: checked.status, waiting: waiting.status, restarted: restarted.status,
      past: past.receipt.resultRevision, revision: final.head.revision, same: sharedCanonical(final.source) === sharedCanonical(source) };
  });
  expect(resumed).toMatchObject({ collect: 'rejected', oldBank: 'a', oldBasis: 6, failure: 'rejected', checked: 'confirmed',
    waiting: 'unknown', restarted: 'confirmed', past: 1, revision: 3, same: true, unconfirmed: 'rejected', importFailure: 'rejected',
    priorDraftRevision: 1, priorImageRevision: 2, importedRevision: 2, restoredOldImageRevision: 1 });
  expect(resumed).toMatchObject({ competing: ['fulfilled', 'rejected'], pendingImport: 'rejected' });
  expect(resumed.afterPending).toBe(resumed.beforeCompeting + 1);
  const secondContext = await browser.newContext();
  try {
    const secondPage = await secondContext.newPage(), second = await signedIn(secondPage, f.environmentId);
    const scope = { environmentId: f.environmentId, performanceId }, now = Date.now();
    const added = await fetch(`${rootUrl}.json?${query}`, { method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({
        [`roles/${second.person.uid}`]: { ...scope, humanUid: second.person.uid, role: 'deputy', active: true, revision: 1,
          startsAt: now - 10000, endsAt: now + 86400000 },
        [`devices/${second.deviceUid}`]: { ...scope, schemaVersion: 2, deviceUid: second.deviceUid, humanUid: second.person.uid,
          active: true, approved: true, retired: false, storageEpoch: randomUUID(), preparedRole: 'deputy', preparedRoleRevision: 1 },
      }) });
    expect(added.status).toBe(200);
    const imported = await secondPage.evaluate(async ({ scope, identity }) => {
      const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
      const { createVenueImageStore } = await import('/src/storage/venue-images.ts');
      const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
      const { sharedCanonical } = await import('/src/domain/seats/shared-draft.ts');
      const { createSharedDraftImporter } = await import('/src/storage/shared-draft-import.ts');
      await linkFictionalGoogle(window.testPrincipals, identity);
      const port = await createAuthorizationPort(window.testPrincipals, scope, { emulatorDatabasePort: 9100 });
      await port.issueSession(Date.now() + 3600000);
      const shared = await port.sharedSeats.readCurrent(), actor = (await port.fetchCurrent()).snapshot;
      const binding = { ...scope, humanUid: actor.role.humanUid, deviceUid: actor.deviceAuthUid, storageEpoch: actor.device.storageEpoch };
      await ensureDeviceKey(binding, true);
      const store = createSeatDraftStore(binding, () => {}), images = createVenueImageStore(binding, () => {});
      const importer = createSharedDraftImporter(binding, () => {});
      await importer.replace(shared, 0, true);
      const restored = await store.loadLocalDraft(), cached = [];
      for (let index = 0; index < 5; index++) cached.push(await images.readImage(String(index)));
      port.dispose();

      return { revision: shared.head.revision, numbered: restored.layout.sections[0].initialNumbered,
        images: cached.filter((image) => image?.blob).length, manual: restored.layout.sections[0].seats[0].manualNumber,
        same: sharedCanonical(restored.layout) === sharedCanonical(shared.source.layout), bindings: Object.values(restored.imageBindings) };
    }, { scope, identity: { sub: randomUUID(), email: second.person.email } });
    expect(imported).toMatchObject({ revision: 3, numbered: true, images: 5, manual: '臨時-席', same: true, bindings: ['0'] });
  } finally { await secondContext.close(); }
  const control = await fetch(`${rootUrl}/control/controlRevision.json?${query}`, { headers: { authorization: 'Bearer owner' } });
  expect(await control.json()).toBe(7);
  const head = await fetch(`${rootUrl}/head.json?${query}`, { headers: { authorization: 'Bearer owner' } });
  expect(await head.json()).toBe(null);
});

async function createPerson() {
  const email = `fictional-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa7!';
  const endpoint = 'http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/';
  const signup = await fetch(endpoint + 'accounts:signUp?key=demo-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  expect(signup.status).toBe(200);
  const account = await signup.json();
  const verified = await fetch(endpoint + `projects/${project}/accounts:update`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer owner',
    },
    body: JSON.stringify({ localId: account.localId, emailVerified: true }),
  });
  expect(verified.status).toBe(200);
  return { uid: account.localId, email, password };
}

/** 通常の業務書込みと分け、試験用の初期認可を投入する。 */
async function seed(environmentId, humanUid, deviceUid, role = 'receptionist', targetPerformanceId = performanceId) {
  const scope = { environmentId, performanceId: targetPerformanceId },
    now = Date.now();
  const data = {
    roles: {
      [humanUid]: {
        ...scope,
        humanUid,
        role,
        active: true,
        revision: 1,
        startsAt: now - 10000,
        endsAt: now + 86400000,
      },
    },
    devices: {
      [deviceUid]: {
        ...scope,
        schemaVersion: 2,
        deviceUid,
        humanUid,
        active: true,
        approved: true,
        retired: false,
        storageEpoch: randomUUID(),
        preparedRole: role,
        preparedRoleRevision: 1,
      },
    },
    control: {
      ...scope,
      state: role === 'owner' ? 'preparing' : 'operating',
      staffDeadline: now + 86400000,
      calendar: createPerformanceCalendar(scope, '2026-11-22', 'Asia/Tokyo', 1),
      ...(role === 'owner' ? { ownerUid: humanUid } : {}),
    },
  };
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${environmentId}/performances/${targetPerformanceId}.json?ns=${project}-default-rtdb`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer owner',
      },
      body: JSON.stringify(data),
    },
  );
  expect(response.status).toBe(200);
}

function config(environmentId) {
  return {
    schemaVersion: 1,
    appVersion: '0.1.0',
    environmentId,
    environmentType: 'evaluation-firebase',
    environmentName: 'ローカル認可試験',
    firebase: {
      apiKey: 'demo-key',
      projectId: project,
      appId: 'demo-web',
      authDomain: 'localhost',
      databaseURL: `https://${project}-default-rtdb.firebaseio.com/`,
    },
  };
}

/** 独立したブラウザーの本人・端末資格を作り、指定された公演環境へ接続する。 */
async function signedIn(page, targetEnvironmentId = randomUUID()) {
  const person = await createPerson(),
    environmentId = targetEnvironmentId,
    settings = config(environmentId);
  await page.goto('http://127.0.0.1:4181/');
  const deviceUid = await page.evaluate(
    async ({ settings, person }) => {
      const module = await import('/src/adapters/firebase/principals.ts');
      const principals = module.createFirebasePrincipals(settings, 9291);
      await module.signInHumanPassword(principals, person.email, person.password);
      const deviceUid = await module.ensureDeviceIdentity(principals);
      window.testPrincipals = principals;
      return deviceUid;
    },
    { settings, person },
  );
  return { person, environmentId, settings, deviceUid };
}

test('PERF111-S01 管理者が製品SDKで公演を初期化し、最新データ版で準備確認を保存する', async ({ page }) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid, 'owner');
  await page.evaluate(
    async ({ environmentId, performanceId, identity }) => {
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
      const principals = window.testPrincipals;
      await linkFictionalGoogle(principals, identity);

      const port = await createAuthorizationPort(principals, { environmentId, performanceId }, {
        emulatorDatabasePort: 9100,
      });
      try {
        await port.issueSession(Date.now() + 3600000);
        await port.initializePerformanceControl();
        await port.initializePerformanceBusiness(1);
      } finally {
        port.dispose();
      }
    },
    { environmentId: f.environmentId, performanceId, identity: { sub: randomUUID(), email: f.person.email } },
  );

  const root = `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}`;
  const query = `ns=${project}-default-rtdb`;
  const response = await fetch(
    `${root}/control.json?${query}`,
    { headers: { authorization: 'Bearer owner' } },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ownerUid: f.person.uid,
    state: 'preparing',
    controlRevision: 1,
    businessSchemaVersion: 3,
    layoutSchemaVersion: 2,
    initializedAt: expect.any(Number),
    businessInitializedFromRevision: 1,
  });
  const emptyBusiness = await fetch(`${root}/event.json?${query}`, {
    headers: { authorization: 'Bearer owner' },
  });
  expect(await emptyBusiness.json()).toEqual({
    commit: { revision: 1, operationId: 'initialize' },
    roster: { count: 0 },
    reception: { '0000000000': 1 },
  });

  // 初回公開の製品経路は後続のため、版だけを試験で投入する。
  const seeded = await fetch(`${root}.json?${query}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ 'event/commit/revision': 4, 'head/revision': 1, 'head/viewRevision': 2 }),
  });
  expect(seeded.status).toBe(200);
  await page.evaluate(async (scope) => {
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const port = await createAuthorizationPort(window.testPrincipals, scope, { emulatorDatabasePort: 9100 });
    try {
      window.savedPreparationBasis = await port.readReceptionPreparationBasis();
      await port.confirmReceptionPreparation(window.savedPreparationBasis);
    } finally {
      port.dispose();
    }
  }, { environmentId: f.environmentId, performanceId });
  const preparation = await fetch(`${root}/receptionPreparation.json?${query}`, {
    headers: { authorization: 'Bearer owner' },
  });
  expect(preparation.status).toBe(200);
  expect(await preparation.json()).toMatchObject({
    environmentId: f.environmentId,
    performanceId,
    controlRevision: 1,
    dataVersion: { commitRevision: 4, layoutRevision: 1, viewRevision: 2, calendarRevision: 1 },
    humanUid: f.person.uid,
    deviceUid: f.deviceUid,
    confirmedAt: expect.any(Number),
  });

  const corrected = await fetch(`${root}/control/calendar.json?${query}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify(createPerformanceCalendar({ environmentId: f.environmentId, performanceId }, '2026-11-23', 'Asia/Tokyo', 2)),
  });
  expect(corrected.status).toBe(200);
  const checkedAgain = await page.evaluate(async (scope) => {
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const port = await createAuthorizationPort(window.testPrincipals, scope, { emulatorDatabasePort: 9100 });
    try {
      const stale = await Promise.allSettled([port.confirmReceptionPreparation(window.savedPreparationBasis)]);
      const current = await port.readReceptionPreparationBasis();
      await port.confirmReceptionPreparation(current);

      return { oldResult: stale[0].status, current };
    } finally {
      port.dispose();
    }
  }, { environmentId: f.environmentId, performanceId });
  expect(checkedAgain).toMatchObject({ oldResult: 'rejected', current: { dataVersion: { calendarRevision: 2 } } });

  // 開始済みの状態だけを投入し、停止と結果照会は通常の端末資格で実行する。
  const firstReceptionStartedAt = Date.now() - 1000;
  const operating = await fetch(`${root}/control.json?${query}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ state: 'operating', controlRevision: 2, firstReceptionStartedAt }),
  });
  expect(operating.status).toBe(200);
  const operationId = randomUUID();
  const result = await page.evaluate(async ({ scope, operationId }) => {
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const port = await createAuthorizationPort(window.testPrincipals, scope, { emulatorDatabasePort: 9100 });
    try {
      await port.stopReception(2, operationId);
      return await port.readReceptionStopResult(operationId);
    } finally {
      port.dispose();
    }
  }, { scope: { environmentId: f.environmentId, performanceId }, operationId });
  expect(result).toMatchObject({ operationId, state: 'stopped', controlRevision: 3, firstReceptionStartedAt });
});

test('PERF111-S02 製品SDKで会場を別公演へコピーし、元の変更を反映しない', async ({ page }) => {
  const f = await signedIn(page);
  const targetPerformanceId = randomUUID();
  await seed(f.environmentId, f.person.uid, f.deviceUid, 'owner');
  await seed(f.environmentId, f.person.uid, f.deviceUid, 'owner', targetPerformanceId);

  const copied = await page.evaluate(async ({ environmentId, performanceId, targetPerformanceId, identity }) => {
    const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const principals = window.testPrincipals;
    await linkFictionalGoogle(principals, identity);
    const source = await createAuthorizationPort(principals, { environmentId, performanceId }, {
      emulatorDatabasePort: 9100,
    });
    const target = await createAuthorizationPort(principals, {
      environmentId,
      performanceId: targetPerformanceId,
    }, { emulatorDatabasePort: 9100 });

    try {
      await source.issueSession(Date.now() + 3600000);
      await target.issueSession(Date.now() + 3600000);
      await source.savePerformanceVenue(0, '架空ホール', '架空市1丁目');
      const original = await target.readPerformanceVenue(performanceId);
      await target.copyPerformanceVenue(original);
      await source.savePerformanceVenue(1, '架空ホール改称', '架空市2丁目');
      return await target.readPerformanceVenue(targetPerformanceId);
    } finally {
      source.dispose();
      target.dispose();
    }
  }, {
    environmentId: f.environmentId,
    performanceId,
    targetPerformanceId,
    identity: { sub: randomUUID(), email: f.person.email },
  });

  expect(copied).toMatchObject({
    performanceId: targetPerformanceId,
    name: '架空ホール',
    address: '架空市1丁目',
    revision: 1,
    sourcePerformanceId: performanceId,
    sourceRevision: 1,
  });
});

test('IMG244-S01 実画像を製品SDKで準備・公開し、端末保存失敗から同じIDで復帰する', async ({ page }) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid, 'owner');
  const rootUrl = `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}`;
  const query = `ns=${project}-default-rtdb`;
  const configured = await fetch(`${rootUrl}/control/calendar.json?${query}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify(createPerformanceCalendar({ environmentId: f.environmentId, performanceId }, '2099-10-10', 'UTC', 1)),
  });
  expect(configured.status).toBe(200);
  const saved = await page.evaluate(async ({ scope, identity }) => {
    const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const { prepareVenueImage } = await import('/src/domain/seats/venue-image.ts');
    const { createVenueImageStore } = await import('/src/storage/venue-images.ts');
    const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
    const principals = window.testPrincipals;
    await linkFictionalGoogle(principals, identity);
    const port = await createAuthorizationPort(principals, scope, { emulatorDatabasePort: 9100 });
    try {
      await port.issueSession(Date.now() + 3600000);
      await port.initializePerformanceControl();
      const { snapshot } = await port.fetchCurrent();
      const binding = { ...scope, humanUid: snapshot.role.humanUid, deviceUid: snapshot.device.deviceUid, storageEpoch: snapshot.device.storageEpoch };
      await ensureDeviceKey(binding, true);
      const store = createVenueImageStore(binding, () => {});
      const canvas = document.createElement('canvas');
      canvas.width = 160; canvas.height = 80;
      const draw = canvas.getContext('2d');
      draw.fillStyle = '#326560'; draw.fillRect(0, 0, 160, 80);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const payload = await prepareVenueImage(scope, bytes, 'image/png', 0, crypto.randomUUID());
      const failure = await Promise.allSettled([port.images.publish('0', 'a', payload, {
        prepare: store.prepare,
        /** サーバー確定直後の端末保存不足を注入し、未解決本文を残す。 */
        async confirm() { throw Error('FICTIONAL_CONFIRM_QUOTA'); },
      })]);
      const pending = await store.readUpload('0');
      const result = await port.images.publish('0', 'a', payload, store);
      const current = await port.images.readCurrent('0');
      await store.saveImage('0', current.head, current.payload, 0);
      const local = await store.readImage('0');
      const next = await prepareVenueImage(scope, bytes, 'image/png', 1, crypto.randomUUID());
      const second = await port.images.publish('0', 'b', next, store);
      const replaced = await port.images.readCurrent('0');
      await store.saveImage('0', replaced.head, replaced.payload, 1);
      const keyResult = await store.readUpload('0');
      await port.images.collect('0', 'a');

      return { failure: failure[0].status, pending: pending.status, firstRevision: result.revision, firstControlRevision: result.controlRevision,
        cachedRevision: local.head.revision, blobSize: local.blob.size, secondRevision: second.revision,
        secondControlRevision: second.controlRevision, journalCompact: keyResult.status === 'confirmed' && !Object.hasOwn(keyResult, 'payload') };
    } finally {
      port.dispose();
    }
  }, { scope: { environmentId: f.environmentId, performanceId }, identity: { sub: randomUUID(), email: f.person.email } });
  expect(saved).toMatchObject({ failure: 'rejected', pending: 'prepared', firstRevision: 1, firstControlRevision: 2,
    cachedRevision: 1, secondRevision: 2, secondControlRevision: 3, journalCompact: true });
  expect(saved.blobSize).toBeGreaterThan(0);
  const response = await fetch(`${rootUrl}/images/0/operations.json?${query}`, { headers: { authorization: 'Bearer owner' } });
  expect(response.status).toBe(200);
  expect(Object.keys(await response.json())).toHaveLength(2);
});

test('AUTH110-S01 本人・端末のAuthを分離し、準備時だけ認証状態を永続化する', async ({ page }) => {
  const f = await signedIn(page);
  const first = await page.evaluate(async () => {
    const module = await import('/src/adapters/firebase/principals.ts');
    const principals = window.testPrincipals;
    const identity = await module.readHumanIdentity(principals);
    await module.setPreparedPersistence(principals, true);
    return {
      uid: identity.uid,
      provider: identity.provider,
      verified: identity.emailVerified,
      differentApps: principals.humanApp.name !== principals.deviceApp.name,
      anonymousDevice: principals.deviceAuth.currentUser.isAnonymous,
    };
  });
  expect(first).toEqual({
    uid: f.person.uid,
    provider: 'password',
    verified: true,
    differentApps: true,
    anonymousDevice: true,
  });
  expect(f.deviceUid).not.toBe(f.person.uid);
  await page.reload();
  const restored = await page.evaluate(async (settings) => {
    const module = await import('/src/adapters/firebase/principals.ts');
    const principals = module.createFirebasePrincipals(settings, 9291);
    const identity = await module.readHumanIdentity(principals);
    const deviceUid = await module.ensureDeviceIdentity(principals);
    await module.signOutHuman(principals);
    return {
      uid: identity.uid,
      deviceUid,
      signedOut: principals.humanAuth.currentUser === null,
      retainedDevice: principals.deviceAuth.currentUser.uid === deviceUid,
    };
  }, f.settings);
  expect(restored).toEqual({
    uid: f.person.uid,
    deviceUid: f.deviceUid,
    signedOut: true,
    retainedDevice: true,
  });
});

test('AUTH110-S02 製品SDKで本人証跡を発行し、現在認可を取得する', async ({ page }) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const result = await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const adapter = await import('/src/adapters/firebase/authorization-port.ts');
      const controllerModule = await import('/src/security/authorization-controller.ts');
      const port = await adapter.createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      const stored = await port.issueSession(Date.now() + 60000);
      const controller = new controllerModule.AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      controller.access('qrReception')();
      window.testAuthorizationPort = port;
      window.testAuthorizationController = controller;
      return {
        state: controller.state,
        humanUid: stored.humanUid,
        deviceUid: stored.deviceUid,
        revision: stored.revision,
      };
    },
    { environmentId: f.environmentId, performanceId },
  );
  expect(result).toEqual({
    state: 'online',
    humanUid: f.person.uid,
    deviceUid: f.deviceUid,
    revision: 1,
  });
  await page.evaluate(async () => {
    await window.testAuthorizationPort.revokeSession();
    window.testAuthorizationController.dispose();
    window.testAuthorizationPort.dispose();
  });
});

test('AUTH110-S03 停止の通知で通常操作をロックし、外部のFirebaseへ要求しない', async ({ page }) => {
  const external = [];
  page.on('request', (request) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname))
      external.push(new URL(request.url()).hostname);
  });
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 60000);
      const controller = new AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      window.testAuthorizationPort = port;
      window.testAuthorizationController = controller;
    },
    { environmentId: f.environmentId, performanceId },
  );
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}/devices/${f.deviceUid}/active.json?ns=${project}-default-rtdb`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer owner',
      },
      body: 'false',
    },
  );
  expect(response.status).toBe(200);
  await expect
    .poll(() => page.evaluate(() => window.testAuthorizationController.state))
    .toBe('locked');
  expect(
    await page.evaluate(() => {
      try {
        window.testAuthorizationController.access('qrReception');
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(external).toEqual([]);
  await page.evaluate(() => {
    window.testAuthorizationController.dispose();
    window.testAuthorizationPort.dispose();
  });
});

test('DD96-S01 同じ本人UIDのGoogle連携後、固定入力を暗号化して役割を一体確定する', async ({
  page,
}) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const uid = await page.evaluate(
    async (identity) => {
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      return linkFictionalGoogle(window.testPrincipals, identity);
    },
    { sub: randomUUID(), email: f.person.email },
  );
  expect(uid).toBe(f.person.uid);
  const now = Date.now(),
    targetUid = `fictional-target-${randomUUID()}`;
  const targetDeviceUid = `fictional-device-${randomUUID()}`;
  const updates = {
    [`roles/${f.person.uid}/role`]: 'owner',
    [`devices/${f.deviceUid}/preparedRole`]: 'owner',
    [`devices/${targetDeviceUid}`]: {
      environmentId: f.environmentId,
      performanceId,
      schemaVersion: 2,
      deviceUid: targetDeviceUid,
      humanUid: targetUid,
      active: true,
      approved: true,
      retired: false,
      storageEpoch: randomUUID(),
      preparedRole: 'receptionist',
      preparedRoleRevision: 1,
    },
    [`roles/${targetUid}`]: {
      environmentId: f.environmentId,
      performanceId,
      humanUid: targetUid,
      role: 'receptionist',
      active: true,
      revision: 1,
      startsAt: now - 1000,
      endsAt: now + 3600000,
    },
  };
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify(updates),
    },
  );
  expect(response.status).toBe(200);
  const result = await page.evaluate(
    async ({ environmentId, performanceId, targetUid, targetDeviceUid, operationId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
      const { createAuthorizationOperationJournal } = await import(
        '/src/storage/authorization-operations.ts'
      );
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 60000);
      const controller = new AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      const { snapshot } = await port.fetchCurrent();
      const keyScope = {
        environmentId,
        performanceId,
        deviceUid: snapshot.deviceAuthUid,
        humanUid: snapshot.role.humanUid,
        storageEpoch: snapshot.device.storageEpoch,
      };
      await ensureDeviceKey(keyScope, true);
      const journal = createAuthorizationOperationJournal(keyScope);
      const authorized = controller.access('manageRoles');
      await port.roles.saveRoleRequest(
        targetUid,
        {
          operationId,
          expectedRevision: 1,
          nextRole: 'temporary',
          startsAt: Date.now() - 1000,
          endsAt: Date.now() + 300000,
        },
        journal,
        authorized,
      );
      const saved = await journal.read(operationId, authorized);
      const first = await port.roles.commit(operationId, journal, authorized);
      const repeated = await port.roles.commit(operationId, journal, authorized);
      const target = await port.roles.target(targetUid);
      const { TEMPORARY_PERMISSIONS } = await import('/src/domain/authorization/types.ts');
      const cancellationId = crypto.randomUUID();
      await port.roles.savePermissionInput(
        targetUid,
        {
          operationId: cancellationId,
          expectedRevision: 2,
          revoke: true,
          validFrom: Date.now() - 500,
          validUntil: Date.now() + 60000,
          permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true])),
        },
        journal,
        authorized,
      );
      const cancelled = await port.roles.cancel(cancellationId, journal, authorized);
      const deviceOperationId = crypto.randomUUID();
      await port.devices.prepare(
        {
          operationId: deviceOperationId,
          targetDeviceUid,
          expectedRevision: 1,
          kind: 'stop',
          replacementDeviceUid: '',
        },
        journal,
        authorized,
      );
      const stopped = await port.devices.commit(deviceOperationId, journal, authorized);
      controller.dispose();
      port.dispose();
      return {
        savedKind: saved.kind,
        first: first.operationId,
        repeated: repeated.operationId,
        revision: target.revision,
        role: target.role,
        cancelled: cancelled.status,
        stopped: stopped.nextActive === false,
      };
    },
    {
      environmentId: f.environmentId,
      performanceId,
      targetUid,
      targetDeviceUid,
      operationId: randomUUID(),
    },
  );
  expect(result.savedKind).toBe('roleChange');
  expect(result.first).toBe(result.repeated);
  expect(result.revision).toBe(2);
  expect(result.role).toBe('temporary');
  expect(result.cancelled).toBe('cancelled');
  expect(result.stopped).toBe(true);
});

test('CONF069-S01 SDKの管理者引継ぎで旧画面をロックし、新管理者の追加準備前は管理を拒否する', async ({
  page,
  context,
}) => {
  const f = await signedIn(page),
    successor = await createPerson();
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const successorPage = await context.newPage();
  await successorPage.goto('http://127.0.0.1:4181/');
  const successorDevice = await successorPage.evaluate(
    async ({ settings, person, googleSub }) => {
      const module = await import('/src/adapters/firebase/principals.ts');
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      const principals = module.createFirebasePrincipals(settings, 9291);
      await module.signInHumanPassword(principals, person.email, person.password);
      await linkFictionalGoogle(principals, { sub: googleSub, email: person.email });
      window.testPrincipals = principals;
      return module.ensureDeviceIdentity(principals);
    },
    { settings: f.settings, person: successor, googleSub: randomUUID() },
  );
  await page.evaluate(
    async (identity) => {
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      await linkFictionalGoogle(window.testPrincipals, identity);
    },
    { sub: randomUUID(), email: f.person.email },
  );
  const now = Date.now(),
    operationId = randomUUID();
  const updates = {
    [`roles/${f.person.uid}/role`]: 'owner',
    [`devices/${f.deviceUid}/preparedRole`]: 'owner',
    'control/ownerUid': f.person.uid,
    [`roles/${successor.uid}`]: {
      environmentId: f.environmentId,
      performanceId,
      humanUid: successor.uid,
      role: 'deputy',
      active: true,
      revision: 1,
      startsAt: now - 1000,
      endsAt: now + 3600000,
    },
    [`devices/${successorDevice}`]: {
      environmentId: f.environmentId,
      performanceId,
      schemaVersion: 2,
      deviceUid: successorDevice,
      humanUid: successor.uid,
      active: true,
      approved: true,
      retired: false,
      storageEpoch: randomUUID(),
      preparedRole: 'deputy',
      preparedRoleRevision: 1,
    },
  };
  const seeded = await fetch(
    `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify(updates),
    },
  );
  expect(seeded.status).toBe(200);
  const setup = async (page, owner) =>
    page.evaluate(
      async ({ environmentId, performanceId, owner }) => {
        const { createAuthorizationPort } = await import(
          '/src/adapters/firebase/authorization-port.ts'
        );
        const { AuthorizationController } = await import(
          '/src/security/authorization-controller.ts'
        );
        const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
        const { createAuthorizationOperationJournal } = await import(
          '/src/storage/authorization-operations.ts'
        );
        const port = await createAuthorizationPort(
          window.testPrincipals,
          { environmentId, performanceId },
          { emulatorDatabasePort: 9100 },
        );
        await port.issueSession(Date.now() + 60000);
        const controller = new AuthorizationController(port, '0.1.0', () => {});
        await controller.reconnect();
        const { snapshot } = await port.fetchCurrent();
        const keyScope = {
          environmentId,
          performanceId,
          deviceUid: snapshot.deviceAuthUid,
          humanUid: snapshot.role.humanUid,
          storageEpoch: snapshot.device.storageEpoch,
        };
        if (owner) {
          await ensureDeviceKey(keyScope, true);
          window.testJournal = createAuthorizationOperationJournal(keyScope);
        }
        window.testAuthorizationPort = port;
        window.testAuthorizationController = controller;
      },
      { environmentId: f.environmentId, performanceId, owner },
    );
  await setup(page, true);
  await setup(successorPage, false);
  await page.evaluate(
    async (input) => {
      const authorized = window.testAuthorizationController.access('handoverOwner');
      window.testHandoverAuthorization = authorized;
      await window.testAuthorizationPort.ownerHandover.prepare(
        input,
        window.testJournal,
        authorized,
      );
    },
    {
      operationId,
      targetUid: successor.uid,
      successorDeviceUid: successorDevice,
      previousOwnerDisposition: 'deputy',
    },
  );
  await successorPage.evaluate(
    async (id) => window.testAuthorizationPort.ownerHandover.accept(id),
    operationId,
  );
  const result = await page.evaluate(
    async (id) =>
      window.testAuthorizationPort.ownerHandover.commit(
        id,
        window.testJournal,
        window.testHandoverAuthorization,
      ),
    operationId,
  );
  expect(result.targetUid).toBe(successor.uid);
  expect(result.targetResultingRevision).toBe(2);
  await expect
    .poll(() => page.evaluate(() => window.testAuthorizationController.state))
    .toBe('locked');
  const waiting = await successorPage.evaluate(async () => {
    const controller = window.testAuthorizationController;
    await controller.reconnect();
    try {
      controller.access('manageRoles');
      return false;
    } catch {
      return true;
    }
  });
  expect(waiting).toBe(true);
  for (const currentPage of [page, successorPage])
    await currentPage.evaluate(() => {
      window.testAuthorizationController.dispose();
      window.testAuthorizationPort.dispose();
    });
  await successorPage.close();
});

test('AUTH110-S04 SDKのキャッシュがあっても、切断後にオンライン認可の再確認を成功にしない', async ({
  page,
}) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const result = await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const { disconnectFictionalDevice } = await import('/tests/emulator/sdk-fixture.mjs');
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 60000);
      const controller = new AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      controller.access('receptionRead')();
      disconnectFictionalDevice(window.testPrincipals);
      let denied = false;
      try {
        await controller.reconnect();
      } catch {
        denied = true;
      }
      const state = controller.state;
      controller.dispose();
      port.dispose();
      return { denied, state };
    },
    { environmentId: f.environmentId, performanceId },
  );
  expect(result).toEqual({ denied: true, state: 'locked' });
});

test('AUTH110-S05 セッション保存が使えなければ、未準備のまま長期保存へ逃げない', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4181/');
  const code = await page.evaluate(async (settings) => {
    const module = await import('/src/adapters/firebase/principals.ts');
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      if (this === sessionStorage)
        throw new DOMException('fictional disabled storage', 'SecurityError');
      return setItem.apply(this, args);
    };
    try {
      module.createFirebasePrincipals(settings, 9291);
      return 'unexpected success';
    } catch (error) {
      return error.code;
    } finally {
      Storage.prototype.setItem = setItem;
    }
  }, config(randomUUID()));
  expect(code).toBe('SESSION_PERSISTENCE_UNAVAILABLE');
});

test('AUTH110-S06 製品SDKで通常登録を承認し、管理者の追加端末は一回リンクでだけ承認する', async ({
  page,
  context,
}) => {
  const issuer = await signedIn(page),
    googleIdentity = { sub: randomUUID(), email: issuer.person.email };
  await seed(issuer.environmentId, issuer.person.uid, issuer.deviceUid);
  await page.evaluate(async (identity) => {
    const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
    await linkFictionalGoogle(window.testPrincipals, identity);
  }, googleIdentity);
  const rootUrl = `http://127.0.0.1:9100/environments/${issuer.environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`;
  const admin = async (updates) => {
    const response = await fetch(rootUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify(updates),
    });
    expect(response.status).toBe(200);
  };
  await admin({
    [`roles/${issuer.person.uid}/role`]: 'owner',
    [`devices/${issuer.deviceUid}/preparedRole`]: 'owner',
    'control/ownerUid': issuer.person.uid,
  });
  await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
      const { createAuthorizationOperationJournal } = await import(
        '/src/storage/authorization-operations.ts'
      );
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 120000);
      const controller = new AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      const { snapshot } = await port.fetchCurrent();
      const scope = {
        environmentId,
        performanceId,
        deviceUid: snapshot.deviceAuthUid,
        humanUid: snapshot.role.humanUid,
        storageEpoch: snapshot.device.storageEpoch,
      };
      await ensureDeviceKey(scope, true);
      window.testAuthorizationPort = port;
      window.testAuthorizationController = controller;
      window.testJournal = createAuthorizationOperationJournal(scope);
    },
    { environmentId: issuer.environmentId, performanceId },
  );

  const openRegistration = async (person, google) => {
    const participant = await context.newPage();
    await participant.goto('http://127.0.0.1:4181/');
    const registration = await participant.evaluate(
      async ({ person, settings, google, performanceId }) => {
        const principalsModule = await import('/src/adapters/firebase/principals.ts');
        const { createAuthorizationPort } = await import(
          '/src/adapters/firebase/authorization-port.ts'
        );
        const principals = principalsModule.createFirebasePrincipals(settings, 9291);
        await principalsModule.signInHumanPassword(principals, person.email, person.password);
        if (google) {
          const { reauthenticateFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
          await reauthenticateFictionalGoogle(principals, google);
        }
        const port = await createAuthorizationPort(
          principals,
          { environmentId: settings.environmentId, performanceId },
          { emulatorDatabasePort: 9100 },
        );
        window.testPrincipals = principals;
        window.testAuthorizationPort = port;
        const requested = await port.registration.request();
        const proof = await port.registration.bindHuman();
        return {
          deviceUid: requested.deviceUid,
          storageEpoch: requested.storageEpoch,
          humanUid: proof.humanUid,
        };
      },
      { person, settings: issuer.settings, google, performanceId },
    );
    return { participant, registration };
  };
  const staff = await createPerson(),
    now = Date.now();
  await admin({
    [`roles/${staff.uid}`]: {
      environmentId: issuer.environmentId,
      performanceId,
      humanUid: staff.uid,
      role: 'receptionist',
      active: true,
      revision: 1,
      startsAt: now - 1000,
      endsAt: now + 3600000,
    },
  });
  const regular = await openRegistration(staff, null);
  await page.evaluate(
    async (input) => {
      const port = window.testAuthorizationPort,
        access = window.testAuthorizationController.access('manageDevices');
      await port.devices.prepare(input, window.testJournal, access);
      await port.devices.commit(input.operationId, window.testJournal, access);
    },
    {
      operationId: randomUUID(),
      targetDeviceUid: regular.registration.deviceUid,
      expectedRevision: 1,
      kind: 'approve',
      replacementDeviceUid: '',
    },
  );
  const regularState = await regular.participant.evaluate(async () => {
    const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
    const port = window.testAuthorizationPort;
    await port.issueSession(Date.now() + 60000);
    const controller = new AuthorizationController(port, '0.1.0', () => {});
    await controller.reconnect();
    let denied = false;
    try {
      controller.access('qrReception');
    } catch {
      denied = true;
    }
    controller.dispose();
    return denied;
  });
  expect(regularState).toBe(true);

  const owner = await openRegistration(issuer.person, googleIdentity),
    operationId = randomUUID();
  const issued = await page.evaluate(
    async ({ targetDeviceUid, operationId }) => {
      const port = window.testAuthorizationPort,
        access = window.testAuthorizationController.access('manageDevices');
      const link = await port.ownerDeviceLinks.issue(
        targetDeviceUid,
        operationId,
        window.testJournal,
        access,
      );
      const fixed = await window.testJournal.read(operationId, access);
      return {
        token: link.token,
        digest: link.digest,
        fixedContainsToken: JSON.stringify(fixed).includes(link.token),
      };
    },
    { targetDeviceUid: owner.registration.deviceUid, operationId },
  );
  expect(issued.fixedContainsToken).toBe(false);
  const reader = await owner.participant.evaluate(async (token) => {
    const { takeOwnerDeviceToken } = await import(
      '/src/domain/authorization/device-registration.ts'
    );
    history.replaceState(null, '', '#owner-device-link=' + token);
    const opened = takeOwnerDeviceToken(new URL(location.href), () =>
      history.replaceState(null, '', '/'),
    );
    const reader = await window.testAuthorizationPort.ownerDeviceLinks.readToken(opened);
    return { operationId: reader.operationId, cleanHash: location.hash === '' };
  }, issued.token);
  expect(reader).toEqual({ operationId, cleanHash: true });
  const result = await owner.participant.evaluate(async (operationId) => {
    const port = window.testAuthorizationPort;
    const first = await port.ownerDeviceLinks.approve(operationId);
    const repeated = await port.ownerDeviceLinks.approve(operationId);
    return {
      first: first.operationId,
      repeated: repeated.operationId,
      epoch: first.storageEpoch,
      readers: (await port.ownerDeviceLinks.listReadLinks()).length,
    };
  }, operationId);
  expect(result).toEqual({
    first: operationId,
    repeated: operationId,
    epoch: owner.registration.storageEpoch,
    readers: 1,
  });
  const stored = await (
    await fetch(rootUrl, { headers: { authorization: 'Bearer owner' } })
  ).json();
  expect(JSON.stringify(stored).includes(issued.token)).toBe(false);
  expect(stored.devices[owner.registration.deviceUid].preparedRoleRevision).toBe(0);
  expect(stored.devices[owner.registration.deviceUid].storageEpoch).toBe(
    owner.registration.storageEpoch,
  );
  for (const participant of [regular.participant, owner.participant]) {
    await participant.evaluate(() => window.testAuthorizationPort.dispose());
    await participant.close();
  }
  await page.evaluate(() => {
    window.testAuthorizationController.dispose();
    window.testAuthorizationPort.dispose();
  });
});

test('AUTH110-S07 通常トークンの期限後も準備済み許可だけを復元し、オフラインで更新要求しない', async ({
  page,
  context,
}) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { createOfflineAuthorizationPort } = await import(
        '/src/adapters/firebase/offline-authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const live = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await live.issueSession(Date.now() + 60000);
      const confirmed = await live.fetchCurrent();
      live.dispose();
      window.testConfirmedSnapshot = confirmed.snapshot;
      window.testOfflineFactory = createOfflineAuthorizationPort;
      window.testOfflineControllerClass = AuthorizationController;
    },
    { environmentId: f.environmentId, performanceId },
  );
  let authRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).port === '9291') authRequests++;
  });
  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const snapshot = window.testConfirmedSnapshot;
    const actualNow = Date.now,
      future = actualNow() + 13 * 3600000;
    Date.now = () => future;
    try {
      const port = await window.testOfflineFactory(window.testPrincipals, snapshot);
      const controller = new window.testOfflineControllerClass(port, '0.1.0', () => {});
      controller.useOffline(snapshot, {
        environmentId: snapshot.environmentId,
        performanceId: snapshot.performanceId,
        deviceUid: snapshot.deviceAuthUid,
        humanUid: snapshot.role.humanUid,
        storageEpoch: snapshot.device.storageEpoch,
        roleRevision: snapshot.role.revision,
        issuedAt: snapshot.session.issuedAt,
        expiresAt: snapshot.staffDeadline,
        appVersion: '0.1.0',
        dataRevision: 1,
      });
      controller.access('qrReception')();
      const state = controller.state;
      let managementDenied = false;
      try {
        controller.access('manageRoles');
      } catch {
        managementDenied = true;
      }
      controller.dispose();
      port.dispose();
      return { state, managementDenied };
    } finally {
      Date.now = actualNow;
    }
  });
  expect(result).toEqual({ state: 'offline', managementDenied: true });
  expect(authRequests).toBe(0);
});
