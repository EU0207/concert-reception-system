// 隔離PoC。公演・端末別の非抽出鍵を使い、取得済み表示データだけを保存する。
const databaseName = 'concert-gd91-76-isolated-read-cache';
const enc = new TextEncoder(), dec = new TextDecoder();
const scope = c => ['FAKE-environment', c.performanceId, c.humanUid, c.deviceUid, 1];
const recordId = c => JSON.stringify(scope(c));
const keyId = c => JSON.stringify(['FAKE-environment', c.performanceId, c.deviceUid, 1]);
function checked(c) {
  if ([c.performanceId, c.humanUid, c.deviceUid].some(x => typeof x !== 'string' || !x)) throw new Error('invalid-cache-scope');
}
function database() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(databaseName, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('keys'); r.result.createObjectStore('cache'); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function read(c) {
  checked(c); const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(['keys', 'cache'], 'readonly');
    let key, record;
    const k = tx.objectStore('keys').get(keyId(c)), r = tx.objectStore('cache').get(recordId(c));
    k.onsuccess = () => { key = k.result; }; r.onsuccess = () => { record = r.result; };
    tx.oncomplete = () => resolve({key, record}); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function encryptionKey(c) {
  const {key: existing, record} = await read(c); if (existing) return existing;
  if (record) throw new Error('cache-key-missing');
  const candidate = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite'), store = tx.objectStore('keys'); let key;
    const r = store.get(keyId(c)); r.onsuccess = () => { key = r.result ?? candidate; if (!r.result) store.put(key, keyId(c)); };
    tx.oncomplete = () => resolve(key); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function load(c) {
  const {key, record} = await read(c); if (!record) return null;
  if (!key) throw new Error('cache-key-missing');
  const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: record.iv, additionalData: enc.encode(recordId(c))}, key, record.ciphertext);
  const payload = JSON.parse(dec.decode(plaintext));
  if (payload.formatVersion !== 1 || JSON.stringify(payload.scope) !== recordId(c) || !Array.isArray(payload.entries))
    throw new Error('cache-format-or-scope-mismatch');
  return {version: record.version, entries: payload.entries};
}
export async function save(c, entries, {expectedVersion = 0, abortAfterPut = false} = {}) {
  checked(c); if (!Array.isArray(entries) || entries.length > 10000) throw new Error('cache-entry-limit');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER)
    throw new Error('invalid-cache-version');
  const plaintext = enc.encode(JSON.stringify({formatVersion: 1, scope: scope(c), entries}));
  if (plaintext.byteLength > 8 * 1024 * 1024) throw new Error('cache-byte-limit');
  const key = await encryptionKey(c), iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: enc.encode(recordId(c))}, key, plaintext);
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite'), store = tx.objectStore('cache'); let failure;
    const r = store.get(recordId(c)); r.onsuccess = () => {
      if ((r.result?.version ?? 0) !== expectedVersion) { failure = new Error('stale-cache-version'); tx.abort(); return; }
      const put = store.put({version: expectedVersion + 1, iv, ciphertext}, recordId(c));
      if (abortAfterPut) put.onsuccess = () => { failure = new DOMException('injected-cache-abort', 'QuotaExceededError'); tx.abort(); };
    };
    tx.oncomplete = () => resolve({version: expectedVersion + 1, saved: true, ciphertextBytes: ciphertext.byteLength});
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('cache-save-aborted')); tx.onerror = () => {};
  }); } finally { db.close(); }
}
// 隔離試験用。鍵そのものは返さない。
export async function inspect(c) {
  const {key, record} = await read(c);
  let exportDenied = false;
  if (key) try { await crypto.subtle.exportKey('raw', key); } catch { exportDenied = true; }
  return {recordExists: !!record, version: record?.version ?? 0, keyExtractable: key?.extractable ?? null, exportDenied,
    ciphertextBytes: record?.ciphertext.byteLength ?? 0,
    iv: record ? Array.from(record.iv) : [],
    recordKeys: record ? Object.keys(record).sort() : [],
    metadataHasPlaintext: record ? (JSON.stringify(record) + dec.decode(record.ciphertext)).includes('架空来場者') : false};
}
