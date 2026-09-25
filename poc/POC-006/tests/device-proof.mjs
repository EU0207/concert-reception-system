import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const encoder = new TextEncoder();
const now = Math.floor(Date.now() / 1000);
const userId = 'FAKE-shared-user';
const showId = 'FAKE-show';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function newKeyPair() {
  return subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
}

async function signToken(privateKey, claims) {
  const header = base64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const value = `${header}.${payload}`;
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(value));
  return `${value}.${base64url(signature)}`;
}

async function verifyToken(publicKey, token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const head = JSON.parse(decode(header).toString());
  if (head.alg !== 'ES256') return null;
  const valid = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(signature), encoder.encode(`${header}.${payload}`));
  if (!valid) return null;
  const claims = JSON.parse(decode(payload).toString());
  if (claims.iss !== 'FAKE-issuer' || claims.aud !== 'FAKE-project' || claims.exp <= now || !claims.sub) return null;
  return claims;
}

function canonical({ uid, deviceId, method, path, timestamp, nonce, body }) {
  return [uid, deviceId, method, path, String(timestamp), nonce, sha256(body)].join('\n');
}

async function signedRequest(device, method, path, body = '') {
  const request = {
    token,
    deviceId: device.id,
    method,
    path,
    body,
    timestamp: now,
    nonce: randomUUID()
  };
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.keys.privateKey, encoder.encode(canonical({ ...request, uid: userId })));
  return { ...request, signature: base64url(signature) };
}

const identityKeys = await newKeyPair();
const token = await signToken(identityKeys.privateKey, { iss: 'FAKE-issuer', aud: 'FAKE-project', sub: userId, exp: now + 3600 });
const A = { id: 'FAKE-A', keys: await newKeyPair(), active: true };
const B = { id: 'FAKE-B', keys: await newKeyPair(), active: true };
const devices = new Map([[A.id, A], [B.id, B]]);
const seenNonces = new Set();
const data = new Map([['FAKE-record', 'FAKE-original']]);

async function gateway(request) {
  const claims = await verifyToken(identityKeys.publicKey, request.token);
  if (!claims) return 401;
  const device = devices.get(request.deviceId);
  if (!device || !device.active || Math.abs(now - request.timestamp) > 120) return 403;
  if (seenNonces.has(`${device.id}:${request.nonce}`)) return 403;
  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    device.keys.publicKey,
    decode(request.signature),
    encoder.encode(canonical({ ...request, uid: claims.sub }))
  );
  if (!valid) return 403;
  if (request.path !== `/shows/${showId}/records/FAKE-record`) return 403;
  if (!['GET', 'PUT'].includes(request.method)) return 403;
  seenNonces.add(`${device.id}:${request.nonce}`);
  if (request.method === 'PUT') data.set('FAKE-record', request.body);
  return 200;
}

assert.equal(await gateway(await signedRequest(A, 'GET', `/shows/${showId}/records/FAKE-record`)), 200);
assert.equal(await gateway(await signedRequest(B, 'GET', `/shows/${showId}/records/FAKE-record`)), 200);

A.active = false;
for (const method of ['GET', 'PUT']) {
  assert.equal(await gateway(await signedRequest(A, method, `/shows/${showId}/records/FAKE-record`, 'FAKE-attempt')), 403, `stopped A ${method}`);
  const spoof = await signedRequest(A, method, `/shows/${showId}/records/FAKE-record`, 'FAKE-attempt');
  spoof.deviceId = B.id;
  assert.equal(await gateway(spoof), 403, `A pretending B ${method}`);
}
assert.equal(data.get('FAKE-record'), 'FAKE-original');

const accepted = await signedRequest(B, 'PUT', `/shows/${showId}/records/FAKE-record`, 'FAKE-from-B');
assert.equal(await gateway(accepted), 200);
assert.equal(await gateway(accepted), 403, 'replay denied');
assert.equal(await gateway(await signedRequest(B, 'GET', '/shows/FAKE-other/records/FAKE-record')), 403);
assert.equal(data.get('FAKE-record'), 'FAKE-from-B');

console.log(JSON.stringify({ result: 'PASS', sharedUser: userId, stoppedDevice: A.id, activeDevice: B.id, rejectedOperations: ['A GET', 'A PUT', 'A-as-B GET', 'A-as-B PUT', 'replay', 'other show'] }));
