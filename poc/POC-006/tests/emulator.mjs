import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const requirePoc004 = createRequire(new URL('../../POC-004/package.json', import.meta.url));
const { initializeApp, deleteApp } = requirePoc004('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously } = requirePoc004('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc } = requirePoc004('firebase/firestore');

const project = 'demo-concert-reception-poc-006';
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const storeBase = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const showId = `FAKE-${randomUUID()}`;

async function signUpWithInfo(email) {
  const response = await fetch(`${authBase}/accounts:signUp?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: `FAKE-${randomUUID()}-Strong9`, returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return { token: body.idToken, uid: body.localId };
}

async function signUp(email) {
  return (await signUpWithInfo(email)).token;
}

async function signUpAnonymous() {
  const response = await fetch(`${authBase}/accounts:signUp?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return { token: body.idToken, uid: body.localId };
}

async function firestore(method, path, token, fields) {
  const response = await fetch(`${storeBase}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(fields ? { 'content-type': 'application/json' } : {})
    },
    ...(fields ? { body: JSON.stringify({ fields }) } : {})
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function metaFields(activeBank, draftBank, activeVersion, draftVersion) {
  return {
    activeBank: { stringValue: activeBank },
    draftBank: { stringValue: draftBank },
    activeVersion: { integerValue: String(activeVersion) },
    draftVersion: { integerValue: String(draftVersion) }
  };
}

function chunkFields(version, payload) {
  return {
    version: { integerValue: String(version) },
    payload: { bytesValue: payload.toString('base64') }
  };
}

function imagePath(slot) {
  return `poc006Shows/${showId}/images/${slot}`;
}

function chunkPath(slot, bank, chunk) {
  return `${imagePath(slot)}/banks/${bank}/chunks/${chunk}`;
}

function compactImagePath(slot) {
  return `poc006CompactShows/${showId}/images/${slot}`;
}

function compactBankPath(slot, bank) {
  return `${compactImagePath(slot)}/banks/${bank}`;
}

function compactFields(version, payload, mimeType = 'image/png') {
  return {
    version: { integerValue: String(version) },
    mimeType: { stringValue: mimeType },
    payload: { bytesValue: payload.toString('base64') }
  };
}

function expectStatus(result, status, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`);
}

const admin = await signUp('admin@poc006.example.invalid');
const staff = await Promise.all(Array.from({ length: 6 }, (_, index) => signUp(`staff${index}@poc006.example.invalid`)));

const human = await signUpWithInfo('human@poc006.example.invalid');
const deviceA = await signUpAnonymous();
const deviceB = await signUpAnonymous();
const unauthorizedDevice = await signUpAnonymous();
const deviceShow = `poc006DeviceShows/${showId}`;
const roleFields = (active) => ({ active: { booleanValue: active }, role: { stringValue: 'owner' } });
const assignmentFields = (deviceUid, active) => ({
  active: { booleanValue: active },
  deviceUid: { stringValue: deviceUid },
  humanUid: { stringValue: human.uid }
});
const sessionFields = (active, elevated = false) => ({
  active: { booleanValue: active },
  humanUid: { stringValue: human.uid },
  expiresAt: { timestampValue: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  elevatedUntil: { timestampValue: new Date(Date.now() + (elevated ? 10 : -1) * 60 * 1000).toISOString() }
});
const recordFields = (deviceUid) => ({ deviceUid: { stringValue: deviceUid }, value: { stringValue: 'FAKE' } });
expectStatus(await firestore('PATCH', `${deviceShow}/roles/${human.uid}`, admin, roleFields(true)), 200, 'human role approved');
expectStatus(await firestore('PATCH', `${deviceShow}/devices/${deviceA.uid}`, admin, assignmentFields(deviceA.uid, true)), 200, 'device A approved');
expectStatus(await firestore('PATCH', `${deviceShow}/devices/${deviceB.uid}`, admin, assignmentFields(deviceB.uid, true)), 200, 'device B approved');
expectStatus(await firestore('PATCH', `${deviceShow}/records/FAKE-before-human`, deviceA.token, recordFields(deviceA.uid)), 403, 'device without human session denied');
expectStatus(await firestore('PATCH', `${deviceShow}/sessions/${deviceA.uid}`, human.token, sessionFields(true)), 200, 'human starts session A');
expectStatus(await firestore('PATCH', `${deviceShow}/sessions/${deviceB.uid}`, human.token, sessionFields(true)), 200, 'human starts session B');
expectStatus(await firestore('PATCH', `${deviceShow}/records/FAKE-A`, deviceA.token, recordFields(deviceA.uid)), 200, 'A writes before stop');
expectStatus(await firestore('GET', `${deviceShow}/records/FAKE-A`, deviceB.token), 200, 'B reads before stop');
expectStatus(await firestore('PATCH', `${deviceShow}/records/FAKE-spoof-before-stop`, deviceA.token, recordFields(deviceB.uid)), 403, 'A cannot claim B UID');
expectStatus(await firestore('GET', `${deviceShow}/records/FAKE-A`, unauthorizedDevice.token), 403, 'unapproved device denied');
expectStatus(await firestore('PATCH', `${deviceShow}/devices/${deviceA.uid}`, deviceB.token, assignmentFields(deviceA.uid, false)), 403, 'B cannot stop A before recent human proof');
expectStatus(await firestore('PATCH', `${deviceShow}/sessions/${deviceB.uid}`, human.token, sessionFields(true, true)), 200, 'human elevates session B');
expectStatus(await firestore('PATCH', `${deviceShow}/devices/${deviceA.uid}`, deviceB.token, assignmentFields(deviceA.uid, false)), 200, 'B stops A with recent human proof');
expectStatus(await firestore('GET', `${deviceShow}/records/FAKE-A`, deviceA.token), 403, 'stopped A read denied');
expectStatus(await firestore('PATCH', `${deviceShow}/records/FAKE-A-as-B`, deviceA.token, recordFields(deviceB.uid)), 403, 'stopped A spoofed write denied');
expectStatus(await firestore('PATCH', `${deviceShow}/devices/${deviceA.uid}`, deviceA.token, assignmentFields(deviceA.uid, true)), 403, 'stopped A cannot restart itself');
expectStatus(await firestore('PATCH', `${deviceShow}/records/FAKE-B`, deviceB.token, recordFields(deviceB.uid)), 200, 'B write continues');
expectStatus(await firestore('GET', `${deviceShow}/records/FAKE-B`, deviceB.token), 200, 'B read continues');
expectStatus(await firestore('PATCH', `${deviceShow}/sessions/${deviceB.uid}`, human.token, sessionFields(false)), 200, 'human ends session B');
expectStatus(await firestore('GET', `${deviceShow}/records/FAKE-B`, deviceB.token), 403, 'device token after human logout denied');
expectStatus(await firestore('PATCH', `${deviceShow}/sessions/${deviceB.uid}`, human.token, sessionFields(true)), 200, 'human restarts session B');
expectStatus(await firestore('GET', `${deviceShow}/records/FAKE-B`, deviceB.token), 200, 'B resumes after human login');
expectStatus(await firestore('PATCH', `${deviceShow}/roles/${human.uid}`, admin, roleFields(false)), 200, 'human role stopped');
expectStatus(await firestore('GET', `${deviceShow}/records/FAKE-B`, deviceB.token), 403, 'human role stop denies B');

for (const method of ['GET', 'PATCH']) {
  const result = await firestore(method, 'poc006GatewayOnly/FAKE-record', staff[0], method === 'PATCH' ? { value: { stringValue: 'FAKE' } } : undefined);
  expectStatus(result, 403, `direct ${method} denied`);
}

expectStatus(await firestore('PATCH', imagePath(5), admin, metaFields('0', '1', 0, 1)), 403, 'sixth image denied');
for (let slot = 0; slot < 5; slot++) {
  expectStatus(await firestore('PATCH', imagePath(slot), admin, metaFields('0', '1', 0, 1)), 200, `metadata slot ${slot}`);
}

const small = Buffer.from('FAKE');
expectStatus(await firestore('PATCH', chunkPath(0, '1', 7), admin, chunkFields(1, small)), 403, 'eighth chunk denied');
expectStatus(await firestore('PATCH', chunkPath(0, '1', 0), admin, chunkFields(1, Buffer.alloc(750001))), 403, 'oversize chunk denied');
expectStatus(await firestore('PATCH', chunkPath(0, '1', 6), admin, chunkFields(1, Buffer.alloc(500001))), 403, 'oversize tail denied');
expectStatus(await firestore('PATCH', chunkPath(0, '1', 0), admin, chunkFields(2, small)), 403, 'wrong version denied');
expectStatus(await firestore('PATCH', chunkPath(0, '1', 0), staff[0], chunkFields(1, small)), 403, 'staff write denied');
expectStatus(await firestore('GET', chunkPath(0, '1', 0), staff[0]), 403, 'draft read denied');

const expected = [];
let writeCount = 0;
for (let slot = 0; slot < 5; slot++) {
  const hash = createHash('sha256');
  for (let chunk = 0; chunk < 7; chunk++) {
    const size = chunk === 6 ? 500000 : 750000;
    const payload = randomBytes(size);
    hash.update(payload);
    expectStatus(await firestore('PATCH', chunkPath(slot, '1', chunk), admin, chunkFields(1, payload)), 200, `write slot ${slot} chunk ${chunk}`);
    writeCount++;
  }
  expected.push(hash.digest('hex'));
  expectStatus(await firestore('PATCH', imagePath(slot), admin, metaFields('1', '0', 1, 2)), 200, `publish slot ${slot}`);
}

let readCount = 0;
for (let device = 0; device < 6; device++) {
  for (let slot = 0; slot < 5; slot++) {
    const hash = createHash('sha256');
    let imageSize = 0;
    for (let chunk = 0; chunk < 7; chunk++) {
      const result = await firestore('GET', chunkPath(slot, '1', chunk), staff[device]);
      expectStatus(result, 200, `device ${device} slot ${slot} chunk ${chunk}`);
      const payload = Buffer.from(result.body.fields.payload.bytesValue, 'base64');
      hash.update(payload);
      imageSize += payload.length;
      readCount++;
    }
    assert.equal(imageSize, 5000000);
    assert.equal(hash.digest('hex'), expected[slot]);
  }
}

for (let chunk = 0; chunk < 7; chunk++) {
  expectStatus(await firestore('PATCH', chunkPath(0, '0', chunk), admin, chunkFields(2, Buffer.from(`FAKE-new-${chunk}`))), 200, `new version chunk ${chunk}`);
}
expectStatus(await firestore('PATCH', imagePath(0), admin, metaFields('0', '1', 2, 3)), 200, 'publish new version');
expectStatus(await firestore('GET', chunkPath(0, '1', 0), staff[0]), 403, 'old version read denied');
for (let chunk = 0; chunk < 7; chunk++) {
  expectStatus(await firestore('DELETE', chunkPath(0, '1', chunk), admin), 200, `old version delete ${chunk}`);
}

expectStatus(await firestore('PATCH', compactImagePath(5), admin, metaFields('0', '1', 0, 1)), 403, 'compact sixth image denied');
for (let slot = 0; slot < 5; slot++) {
  expectStatus(await firestore('PATCH', compactImagePath(slot), admin, metaFields('0', '1', 0, 1)), 200, `compact metadata slot ${slot}`);
}
expectStatus(await firestore('PATCH', compactBankPath(0, '1'), admin, compactFields(1, Buffer.alloc(200001))), 403, 'compact oversize denied');
expectStatus(await firestore('PATCH', compactBankPath(0, '1'), admin, compactFields(1, small, 'application/pdf')), 403, 'compact PDF metadata denied');
expectStatus(await firestore('PATCH', compactBankPath(0, '1'), staff[0], compactFields(1, small)), 403, 'compact staff write denied');
expectStatus(await firestore('GET', compactBankPath(0, '1'), staff[0]), 403, 'compact draft read denied');

const compactExpected = [];
for (let slot = 0; slot < 5; slot++) {
  const payload = randomBytes(200000);
  compactExpected.push(createHash('sha256').update(payload).digest('hex'));
  expectStatus(await firestore('PATCH', compactBankPath(slot, '1'), admin, compactFields(1, payload)), 200, `compact write slot ${slot}`);
  expectStatus(await firestore('PATCH', compactImagePath(slot), admin, metaFields('1', '0', 1, 2)), 200, `compact publish slot ${slot}`);
}
for (let device = 0; device < 6; device++) {
  for (let slot = 0; slot < 5; slot++) {
    const result = await firestore('GET', compactBankPath(slot, '1'), staff[device]);
    expectStatus(result, 200, `compact device ${device} slot ${slot}`);
    const payload = Buffer.from(result.body.fields.payload.bytesValue, 'base64');
    assert.equal(payload.length, 200000);
    assert.equal(createHash('sha256').update(payload).digest('hex'), compactExpected[slot]);
  }
}
expectStatus(await firestore('PATCH', compactBankPath(0, '0'), admin, compactFields(2, Buffer.from('FAKE-new-compact'))), 200, 'compact new version');
expectStatus(await firestore('PATCH', compactImagePath(0), admin, metaFields('0', '1', 2, 3)), 200, 'compact publish new version');
expectStatus(await firestore('GET', compactBankPath(0, '1'), staff[0]), 403, 'compact old version read denied');
expectStatus(await firestore('DELETE', compactBankPath(0, '1'), admin), 200, 'compact old version deleted');

const sdkConfig = { apiKey: 'demo-api-key', projectId: project, authDomain: `${project}.firebaseapp.com` };
const humanApp = initializeApp(sdkConfig, `poc006-human-${randomUUID()}`);
const deviceApp = initializeApp(sdkConfig, `poc006-device-${randomUUID()}`);
const humanAuth = getAuth(humanApp);
const deviceAuth = getAuth(deviceApp);
const humanDb = getFirestore(humanApp);
const deviceDb = getFirestore(deviceApp);
connectAuthEmulator(humanAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectAuthEmulator(deviceAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(humanDb, '127.0.0.1', 8080);
connectFirestoreEmulator(deviceDb, '127.0.0.1', 8080);
const sdkHuman = await createUserWithEmailAndPassword(humanAuth, `sdk-human-${randomUUID()}@poc006.example.invalid`, `FAKE-${randomUUID()}-Strong9`);
const sdkDevice = await signInAnonymously(deviceAuth);
assert.notEqual(sdkHuman.user.uid, sdkDevice.user.uid);
const sdkHumanToken = await sdkHuman.user.getIdToken();
expectStatus(await firestore('PATCH', `${deviceShow}/roles/${sdkHuman.user.uid}`, admin, roleFields(true)), 200, 'SDK human role');
expectStatus(await firestore('PATCH', `${deviceShow}/devices/${sdkDevice.user.uid}`, admin, {
  active: { booleanValue: true },
  deviceUid: { stringValue: sdkDevice.user.uid },
  humanUid: { stringValue: sdkHuman.user.uid }
}), 200, 'SDK device approved');
expectStatus(await firestore('PATCH', `${deviceShow}/sessions/${sdkDevice.user.uid}`, sdkHumanToken, {
  active: { booleanValue: true },
  humanUid: { stringValue: sdkHuman.user.uid },
  expiresAt: { timestampValue: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  elevatedUntil: { timestampValue: new Date(Date.now() - 60 * 1000).toISOString() }
}), 200, 'SDK human session');
assert.equal((await getDoc(doc(deviceDb, `${deviceShow}/records/FAKE-B`))).exists(), true, 'secondary Firebase app uses device UID');
await assert.rejects(getDoc(doc(humanDb, `${deviceShow}/records/FAKE-B`)), 'human UID alone cannot bypass device proof');
await Promise.all([deleteApp(humanApp), deleteApp(deviceApp)]);

console.log(JSON.stringify({ result: 'PASS', showId, deviceAuth: 'A stopped and B continues under one human UID', secondaryFirebaseApp: 'verified', imageBytes: 25000000, writeCount, readCount, deliveredBytes: 150000000, distinctStaffTokens: staff.length, oldVersionChunksDeleted: 7, compactImageBytes: 1000000, compactReads: 30, compactDeliveredBytes: 6000000, compactOldBankDeleted: true }));
