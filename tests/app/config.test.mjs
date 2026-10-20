import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConfig, configFingerprint, StartupError } from '../../src/app/config.ts';
import { NavigationGate } from '../../src/app/navigation.ts';
const sample = JSON.parse(readFileSync(new URL('../../config/app-config.local.example.json', import.meta.url), 'utf8'));
test('APP258-T01 設定の必須項目・環境・版と余分な秘密項目を拒否する', () => {
  for (const patch of [{ schemaVersion: 2 }, { appVersion: 'other' }, { environmentType: 'unknown' },
    { environmentId: 'not-id' }, { environmentName: '' }, { password: 'fictional-invalid-value' }, { firebase: {} }]) {
    assert.throws(() => parseConfig({ ...sample, ...patch }), StartupError);
  }
  assert.deepEqual(parseConfig(sample), sample);
});
test('APP258-T02 異なる評価環境と設定変更を指紋で識別する', async () => {
  const first = await configFingerprint(parseConfig(sample));
  const changed = await configFingerprint(parseConfig({ ...sample, environmentId: '00000000-0000-4000-8000-000000000259' }));
  assert.notEqual(first, changed);
  assert.equal(first, await configFingerprint(parseConfig({ ...sample })));
});
test('APP258-T03 非ローカル設定は接続先の省略・HTTP・不正ホストを拒否する', () => {
  assert.throws(() => parseConfig({ ...sample, environmentType: 'production' }), StartupError);
  for (const databaseURL of ['http://invalid.example/', 'https://invalid.example/', 'https://fake.firebaseio.com/?token=fictional']) {
    assert.throws(() => parseConfig({ ...sample, environmentType: 'production', firebase: {
      apiKey: 'fictional', authDomain: 'fictional', projectId: 'fictional', appId: 'fictional', databaseURL,
    } }), StartupError);
  }
});
test('APP258-T04 未保存離脱の続行・保存失敗は入力を捨てず、保存成功だけ移動する', async () => {
  const gate = new NavigationGate(); let discarded = 0, saved = false;
  gate.editor = { isDirty: () => true, save: async () => saved, discard: () => discarded++ };
  assert.equal(await gate.leave(async () => 'continue'), false);
  assert.equal(await gate.leave(async () => 'save'), false); assert.equal(discarded, 0);
  saved = true; assert.equal(await gate.leave(async () => 'save'), true);
  assert.equal(await gate.leave(async () => 'discard'), true); assert.equal(discarded, 1);
});
test('APP258-T05 保存例外と離脱確認の二重要求を拒否し、再確認できる', async () => {
  const gate = new NavigationGate(); let resolve;
  gate.editor = { isDirty: () => true, save: async () => { throw new Error('fictional storage failure'); }, discard: () => {} };
  const pending = gate.leave(() => new Promise(r => { resolve = r; }));
  assert.equal(await gate.leave(async () => 'discard'), false); resolve('continue'); await pending;
  await assert.rejects(gate.leave(async () => 'save'));
  assert.equal(await gate.leave(async () => 'continue'), false);
});
