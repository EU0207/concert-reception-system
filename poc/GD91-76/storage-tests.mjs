import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from '../POC-001/node_modules/playwright/index.mjs';
const paths = ['storage-tests.mjs', 'cache-store.mjs', 'browser.html', 'vite.config.mjs'];
const hashes = () => Object.fromEntries(paths.map(p => [p, createHash('sha256')
  .update(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const sourceHashes = hashes(), reports = [];
const profile = fileURLToPath(new URL('node_modules/.cache/storage-' + randomUUID(), import.meta.url));
const context = await chromium.launchPersistentContext(profile, {channel: 'msedge', headless: true});
let firestoreRequests = 0; context.on('request', r => { if (new URL(r.url()).port === '8181') firestoreRequests++; });
try {
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4180/poc/GD91-76/browser.html');
  await page.waitForFunction(() => window.cache);
  const result = await page.evaluate(async () => {
    const scenarios = [], dbName = 'concert-gd91-76-isolated-read-cache';
    const scoped = p => ({performanceId: p, humanUid: 'FAKE-human', deviceUid: 'FAKE-device'});
    const id = c => JSON.stringify(['FAKE-environment', c.performanceId, c.humanUid, c.deviceUid, 1]);
    const keyId = c => JSON.stringify(['FAKE-environment', c.performanceId, c.deviceUid, 1]);
    async function reject(work, contains) {
      try { await work(); } catch (error) { if (!contains || error.message.includes(contains)) return; throw error; }
      throw new Error('expected-rejection');
    }
    async function edit(c, work) {
      return new Promise((resolve, fail) => { const r = indexedDB.open(dbName, 1);
        r.onsuccess = () => { const db = r.result, tx = db.transaction(['keys', 'cache'], 'readwrite');
          work(tx, id(c), keyId(c)); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => fail(tx.error); };
      });
    }
    const a = scoped('FAKE-original'), entries = [['FAKE-entry', {seatDisplayName: '架空来場者'}]];
    await window.cache.save(a, entries); const original = await window.cache.inspect(a);
    const loss = scoped('FAKE-key-loss'); await window.cache.save(loss, entries);
    await edit(loss, (tx, _, key) => tx.objectStore('keys').delete(key));
    await reject(() => window.cache.load(loss), 'cache-key-missing');
    await reject(() => window.cache.save(loss, entries, {expectedVersion: 1}), 'cache-key-missing');
    const held = await window.cache.inspect(loss);
    if (!held.recordExists || held.version !== 1 || held.keyExtractable !== null) throw new Error('key-loss-state');
    scenarios.push({id: 'S-key-loss', status: 'passed', ciphertextRetainedWithoutSilentKeyReplacement: true});
    const swapped = {...a, humanUid: 'FAKE-other-human'};
    await edit(a, (tx, current) => { const store = tx.objectStore('cache'), r = store.get(current);
      r.onsuccess = () => store.put(r.result, id(swapped)); });
    await reject(() => window.cache.load(swapped));
    if (JSON.stringify((await window.cache.load(a)).entries) !== JSON.stringify(entries)) throw new Error('original-altered');
    scenarios.push({id: 'S-aad-splice', status: 'passed', sameDeviceKeyCannotDecryptOtherUserRecord: true});
    const future = scoped('FAKE-future-format'); await window.cache.save(future, entries);
    // 未対応形式の暗号文を試験専用に作り、復号できても採用しないことを確認する。
    const db = await new Promise(resolve => { const r = indexedDB.open(dbName, 1); r.onsuccess = () => resolve(r.result); });
    const key = await new Promise(resolve => { const r = db.transaction('keys', 'readonly').objectStore('keys').get(keyId(future)); r.onsuccess = () => resolve(r.result); }); db.close();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id(future))}, key,
      new TextEncoder().encode(JSON.stringify({formatVersion: 99, scope: JSON.parse(id(future)), entries})));
    await edit(future, (tx, current) => tx.objectStore('cache').put({version: 1, iv, ciphertext}, current));
    await reject(() => window.cache.load(future), 'cache-format-or-scope-mismatch');
    scenarios.push({id: 'S-future-format', status: 'passed', unsupportedFormatNotAdopted: true});
    const large = scoped('FAKE-byte-limit');
    await reject(() => window.cache.save(large, [['FAKE-entry', 'x'.repeat(8 * 1024 * 1024)]]), 'cache-byte-limit');
    const largeState = await window.cache.inspect(large);
    if (largeState.recordExists || largeState.keyExtractable !== null) throw new Error('oversize-saved');
    if (JSON.stringify(await window.cache.inspect(a)) !== JSON.stringify(original)) throw new Error('other-scope-altered');
    scenarios.push({id: 'S-byte-limit', status: 'passed', rejectedBeforeKeyOrRecordCreation: true, productPeopleLimitNotTested: true});
    return scenarios;
  });
  reports.push(...result); assert.equal(reports.length, 4); assert.equal(firestoreRequests, 0); assert.deepEqual(hashes(), sourceHashes);
  fs.mkdirSync(new URL('artifacts/', import.meta.url), {recursive: true});
  fs.writeFileSync(new URL('artifacts/storage-summary.json', import.meta.url), JSON.stringify({scope: 'browser-storage-only',
    sourceHashes, endSourceHashes: hashes(), reports, firestoreRequests, serverRulesVerified: false}, null, 2) + '\n');
  console.log(JSON.stringify({scope: 'browser-storage-only', scenarios: reports.length, status: 'passed'}));
} finally { await context.close(); }
