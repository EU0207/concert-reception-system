import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readerClient} from './read-client.mjs';

// 応答形式と通信障害の単体試験。Rulesの合格件数へ加算しない。
const paths = ['transport-tests.mjs', 'read-client.mjs', '../GD91-60/tests/transport.mjs'];
const hashes = () => Object.fromEntries(paths.map(p => [p, createHash('sha256')
  .update(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const sourceHashes = hashes(), reports = [];
let respond, calls = 0;
const context = {performanceId: 'FAKE-show', humanUid: 'FAKE-human', deviceUid: 'FAKE-device', token: 'FAKE-token'};
const transport = async (url, options) => {
  assert(url.startsWith('http://127.0.0.1:8181/'));
  assert.equal(options.method, 'POST'); calls++;
  return respond(JSON.parse(options.body).documents);
};
const document = (name, value) => ({found: {name, fields: {value: {stringValue: value}}}});
const response = (body, status = 200) => new Response(JSON.stringify(body), {status});
const refs = ['a', 'b', 'c'].map(path => ({kind: 'publication', path: 'attendeeLabels/' + path, cacheTag: 'v1'}));
const create = extras => readerClient({...context, transport, ...extras});
const run = async (id, work) => { await work(); reports.push({id, status: 'passed'}); };

await run('U-response-order', async () => {
  respond = names => response(names.map((n, i) => document(n, String(i))).reverse());
  assert.deepEqual(await create().session(many => many(refs)), [{value: '0'}, {value: '1'}, {value: '2'}]);
});
await run('U-missing-required', async () => {
  respond = names => response([{missing: names[0]}]);
  await assert.rejects(() => create().session(many => many([refs[0]])), e => e.code === 'missing-required-document');
  assert.deepEqual(await create().session(many => many([{...refs[0], optional: true}])), [null]);
});
for (const [id, make, expected] of [
  ['U-response-incomplete', names => [document(names[0], 'a')], 'incomplete-batch-response'],
  ['U-response-duplicate', names => [document(names[0], 'a'), document(names[0], 'b')], 'unexpected-batch-document'],
  ['U-response-unknown', names => [document(names[0] + '-other', 'a')], 'unexpected-batch-document'],
]) await run(id, async () => {
  const c = create(); respond = names => response(make(names));
  await assert.rejects(() => c.session(many => many(refs)), e => e.code === expected);
  assert.equal(c.cacheSize(), 0);
});
await run('U-partial-session', async () => {
  const c = create({groupSize: 1}); let batch = 0;
  respond = names => ++batch === 1 ? response([document(names[0], 'first')]) : response({}, 503);
  await assert.rejects(() => c.session(many => many(refs)), e => e.code === 'read-http-503');
  assert.equal(c.cacheSize(), 0);
});
await run('U-quota-keeps-cache-no-retry', async () => {
  const c = create(); respond = names => response(names.map(n => document(n, 'saved')));
  await c.session(many => many([refs[0]]));
  respond = () => response({}, 429); const before = calls;
  await assert.rejects(() => c.session(many => many([refs[1]])), e => e.code === 'read-http-429');
  assert.equal(c.cacheSize(), 1); assert.equal(calls - before, 1);
});
await run('U-lost-response-no-retry', async () => {
  const c = create(); respond = () => { throw new TypeError('FAKE-connection-lost'); }; const before = calls;
  await assert.rejects(() => c.session(many => many(refs)), /FAKE-connection-lost/);
  assert.equal(c.cacheSize(), 0); assert.equal(calls - before, 1);
});
await run('U-denied-entry-clears-cache', async () => {
  const c = create(); respond = names => response(names.map(n => document(n, 'saved')));
  await c.session(many => many([refs[0]]));
  respond = () => response([{error: {code: 7}}]);
  await assert.rejects(() => c.session(many => many([refs[1]])), e => e.code === 'permission-denied');
  assert.equal(c.cacheSize(), 0);
});
await run('U-cache-copy-isolation', async () => {
  const c = create(); respond = names => response(names.map(n => document(n, 'original')));
  (await c.session(many => many([refs[0]])))[0].value = 'modified';
  const before = calls;
  assert.equal((await c.session(many => many([refs[0]])))[0].value, 'original');
  assert.equal(calls, before);
  assert.equal(create({humanUid: 'FAKE-other-human'}).cacheSize(), 0);
  assert.equal(create({performanceId: 'FAKE-other-show'}).cacheSize(), 0);
});
assert.deepEqual(hashes(), sourceHashes);
fs.mkdirSync(new URL('artifacts/', import.meta.url), {recursive: true});
fs.writeFileSync(new URL('artifacts/transport-summary.json', import.meta.url), JSON.stringify({scope: 'mock-transport-unit-only',
  sourceHashes, endSourceHashes: hashes(), reports, rulesVerified: false, browserPersistenceVerified: false}, null, 2) + '\n');
console.log(JSON.stringify({scope: 'mock-transport-unit-only', scenarios: reports.length, status: 'passed'}));
