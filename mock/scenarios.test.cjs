// 実行: node --test mock/scenarios.test.cjs（追加ライブラリ不要）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const inputs = {}, timers = new Map(), listeners = {};
  let nextTimer = 0;
  const context = vm.createContext({
    structuredClone,
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    document: {
      getElementById: id => inputs[id] || null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener: (name, fn, capture) => { (listeners[name] ||= []).push({ fn, capture }); },
      body: { classList: { toggle() {} } }
    },
    window: { history: { replaceState() {}, pushState() {} }, addEventListener() {}, matchMedia: () => ({ matches: false }) }
  });
  for (const file of ['app.js', 'scenarios.js']) vm.runInContext(fs.readFileSync(`${__dirname}/${file}`, 'utf8').replace(/render\(\);\s*$/, ''), context);
  vm.runInContext('render = () => {}; toast = message => { S.toast = message; };', context);
  const run = code => vm.runInContext(code, context);
  return { inputs, timers, listeners, run, tick(delay) {
    const entry = [...timers].find(([, t]) => t.delay === delay);
    assert.ok(entry, `timer ${delay}ms`); timers.delete(entry[0]); entry[1].fn();
  } };
}

test('新規会場・番号消費・種別往復・列方向・固定ID・保存破棄', () => {
  const h = harness(), r = h.run;
  r("S.screen='seats'; switchScenario('new'); S.cells=new Set(['cell-0','cell-1','cell-2']); handle('cellType:seat')");
  assert.equal(r("S.layout.cells[2].code"), 'A-3');
  r("S.cell='cell-1'; S.cells=new Set([S.cell]); handle('cellType:gap')");
  assert.equal(r("S.layout.cells[2].code"), 'A-3');
  r("handle('cellType:space')");
  assert.equal(r("S.layout.cells[2].code"), 'A-2');
  r("handle('cellType:aisle'); handle('cellType:unset'); handle('cellType:seat')");
  assert.equal(r("S.layout.cells[1].id"), 'cell-1');
  r("save(); S.cells=new Set(['cell-0']); handle('cellType:space'); resetDraft()");
  assert.equal(r("S.layout.cells[0].type"), 'seat');
  h.inputs['grid-rows'] = { value: '6' }; h.inputs['grid-cols'] = { value: '9' }; h.inputs['grid-direction'] = { value: 'vertical' };
  h.inputs['grid-order'] = { value: 'forward' };
  r("S.gridDraft.names[0]='前'; S.gridDraft.starts[0]=7");
  r("handle('gridSettings')");
  assert.equal(r('S.layout.cells.length'), 54);
  assert.equal(r("S.layout.cells[0].code"), '前-7');
  assert.equal(r("S.layout.cells.find(c=>c.id==='cell-1').code"), 'B-1');
  h.inputs['grid-rows'].value = '31'; r("handle('gridSettings')");
  assert.equal(r('S.layout.rows'), 6);
  r('S.gridPending=true'); assert.equal(r('save()'), false); r('S.gridPending=false');
  h.inputs['grid-rows'].value = '30'; h.inputs['grid-cols'].value = '30'; r("handle('gridSettings')");
  assert.equal(r('S.layout.cells.length'), 900);
  assert.equal(r('new Set(S.layout.cells.map(c=>c.id)).size'), 900);
  r("switchScenario('sample')");
  assert.match(r('S.modal.title'), /切り替える/);
  r("handle('scenarioDiscard:sample')");
  assert.equal(r('S.people[0].seat'), 'A-12');
});

test('逆順採番・番号消費・固定ID・保存破棄・配置保護', () => {
  const h = harness(), r = h.run;
  r("S.screen='seats'; switchScenario('new'); S.layout=createLayout(false); S.layout.cells.forEach(c=>c.type='seat'); S.layout.cells[1].type='gap'; S.layout.cells[2].type='space'; S.layout.cells[3].type='aisle'; S.layout.cells[4].type='unset'; numberLayout(S.layout); resetGridDraft(); save()");
  h.inputs['grid-rows'] = { value: '5' }; h.inputs['grid-cols'] = { value: '8' };
  h.inputs['grid-direction'] = { value: 'horizontal' }; h.inputs['grid-order'] = { value: 'reverse' };
  r("handle('gridSettings')");
  assert.equal(r("S.layout.cells[7].code"), 'A-1');
  assert.equal(r("S.layout.cells[1].code"), 'A-4');
  assert.equal(r("S.layout.cells[0].code"), 'A-5');
  assert.equal(r("S.layout.cells[2].code"), '');
  assert.equal(r("S.cell"), 'cell-0');
  r('resetDraft()'); assert.equal(r('S.layout.reverse'), false);
  h.inputs['grid-direction'].value = 'vertical';
  r("handle('gridSettings'); save(); S.cells=new Set(['cell-32']); handle('cellType:space')");
  assert.equal(r("S.layout.cells[24].code"), 'A-1');
  r('resetDraft()');
  assert.equal(r("S.layout.cells[32].code"), 'A-1');
  assert.equal(r("S.layout.cells[0].code"), 'A-5');
  assert.equal(r('S.layout.reverse'), true);
  h.inputs['person-to-place'] = { value: '6' };
  r("S.screen='placement'; S.cell='cell-0'; syncAssignments(); handle('place'); save(); S.screen='seats'");
  h.inputs['grid-order'].value = 'forward'; r("handle('gridSettings')");
  assert.equal(r('S.layout.reverse'), true);
  assert.match(r('S.modal.title'), /席設定を解除/);
  r("handle('cancelLayout'); S.people[5].issued=true; handle('gridSettings')");
  assert.equal(r('S.layout.reverse'), true);
  assert.match(r('S.toast'), /発行済み/);
});

test('発行済み保護・未発行配置解除の確認・配置を含む復元', () => {
  const { run: r, inputs } = harness();
  r("S.screen='seats'; handle('cellType:space')");
  assert.equal(r('selectedCell().type'), 'seat');
  assert.match(r('S.toast'), /発行済み/);
  inputs['person-to-place'] = { value: '6' };
  r("S.screen='placement'; S.cell='cell-6'; syncAssignments(); handle('place'); save(); S.screen='seats'");
  r("S.cell='cell-6'; S.cells=new Set([S.cell]); handle('cellType:gap')");
  assert.equal(r('S.people[5].seat'), 'A-16');
  r("handle('cancelLayout')");
  assert.equal(r('S.people[5].seat'), 'A-16');
  r("handle('cellType:gap'); handle('applyLayout')");
  assert.equal(r('S.people[5].seat'), '');
  r('resetDraft()');
  assert.equal(r('S.people[5].seat'), 'A-16');
  assert.equal(r('selectedCell().type'), 'seat');
});

test('複数と矩形選択・ドラッグは選択しない', () => {
  const h = harness(), r = h.run;
  const click = h.listeners.click.find(l => l.capture).fn;
  const event = id => ({ target: { closest: () => ({ dataset: { cell: id } }) }, stopImmediatePropagation() {}, preventDefault() {} });
  r("S.screen='seats'; S.selectionMode='range'");
  click(event('cell-0')); click(event('cell-9'));
  assert.equal(r('S.cells.size'), 4);
  r("S.selectionMode='multiple'"); click(event('cell-9'));
  assert.equal(r('S.cells.size'), 3);
  const viewport = { scrollLeft: 0, scrollTop: 0 };
  h.listeners.pointerdown[0].fn({ target: { closest: () => viewport }, button: 0, pointerType: 'mouse', clientX: 100, clientY: 100 });
  h.listeners.pointermove[0].fn({ clientX: 70, clientY: 60, preventDefault() {} });
  h.listeners.pointerup[0].fn(); click(event('cell-20'));
  assert.equal(viewport.scrollLeft, 30);
  assert.equal(r('S.cell'), 'cell-9');
});

test('連絡10件・重要2件・通常既読と重要確認・件数一致', () => {
  const { run: r } = harness();
  assert.equal(r('S.notices.length'), 10); assert.equal(r('S.notices.filter(n=>n.important).length'), 2);
  assert.equal(r('unreadCount()'), 3);
  r('showNotice(1)'); assert.equal(r('unreadCount()'), 3);
  r("handle('noticeRead:1')"); assert.equal(r('unreadCount()'), 2);
  r('showNotice(3)'); assert.equal(r('unreadCount()'), 1);
  const html = r('messages()'); assert.ok(html.indexOf('集合場所') < html.indexOf('座席案内'));
});

test('席移動・交換は確定時のみ・発行済み理由・重複なし・破棄', () => {
  const h = harness(), r = h.run;
  h.inputs['move-person'] = { value: '1' }; h.inputs['move-reason'] = { value: '', focus() {} };
  r("S.screen='placement'; S.cell='cell-4'; syncAssignments(); proposeMove(); commitMove()");
  assert.equal(r('S.people[0].seat'), 'A-12');
  r("handle('cancelMove')"); assert.equal(r('S.people[2].seat'), 'A-14');
  r('proposeMove()'); h.inputs['move-reason'].value = '案内変更'; r('commitMove()');
  assert.equal(r('S.people[0].seat'), 'A-14'); assert.equal(r('S.people[2].seat'), 'A-12');
  assert.equal(r('new Set(S.people.filter(p=>p.seat).map(p=>p.seat)).size'), 2);
  r('resetDraft()'); assert.equal(r('S.people[0].seat'), 'A-12');
  h.inputs['person-to-place'] = { value: '6' };
  r("S.cell='cell-6'; syncAssignments(); handle('place')");
  h.inputs['move-person'].value = '6'; r("S.cell='cell-0'; syncAssignments(); proposeMove(); commitMove()");
  assert.equal(r('S.people[5].seat'), 'A-10');
  r("S.cell='cell-11'; syncAssignments(); proposeMove()"); assert.equal(r('S.pendingMove'), null);
});

test('6人目は未配置・案内の編集取消し・保存破棄・空欄解除・表示への反映', () => {
  const { run: r, inputs } = harness();
  assert.equal(r('S.people[5].seat'), '');
  assert.equal(r('S.people[5].payment'), true);
  r("S.screen='people'; handle('editNote:2')");
  inputs['person-note'] = { value: '架空の案内\n手渡しを確認', setCustomValidity() {}, reportValidity() {} };
  r("handle('modalClose')"); assert.equal(r('S.people[1].note'), '');
  r("handle('editNote:2'); handle('applyNote:2')");
  assert.equal(r('S.people[1].note'), '架空の案内\n手渡しを確認');
  assert.equal(r('S.dirty'), true);
  assert.match(r('people()'), /要確認・編集/);
  r('resetDraft()'); assert.equal(r('S.people[1].note'), '');
  assert.equal(r('S.people[0].cellId'), 'cell-2');
  r("handle('editNote:2'); handle('applyNote:2'); save()");
  inputs['person-note'].value = ''; r("handle('editNote:2'); handle('applyNote:2')");
  assert.equal(r('S.people[1].note'), '');
  r('resetDraft()'); assert.equal(r('S.people[1].note'), '架空の案内\n手渡しを確認');
  r("handle('showTicketPerson:2')"); assert.match(r('S.modal.body'), /手渡しを確認/);
  r("handle('editNote:2')"); inputs['person-note'].value = 'あ'.repeat(201);
  r("handle('applyNote:2')"); assert.equal(r('S.people[1].note'), '架空の案内\n手渡しを確認');
});

test('出力見本は交付方法と席を反映し、確認・中止で状態を変更しない', () => {
  const { run: r } = harness();
  r("S.screen='output'");
  assert.match(r('nav()'), /お客様対応状況/);
  assert.match(r('output()'), /架空 太郎/);
  assert.match(r('output()'), /例示 三郎/);
  assert.doesNotMatch(r('output()'), /架空 四郎/);
  r("handle('previewPdf:1')");
  assert.match(r('S.modal.title'), /電子チケットPDF/);
  assert.match(r('S.modal.body'), /架空 太郎.*A-12/);
  r("handle('modalClose')");
  assert.equal(r('S.people[0].issued'), true);
  r("handle('previewPdf:1'); handle('completePdf:1')");
  assert.match(r('S.toast'), /実ファイルは作成されません/);
  assert.equal(r('S.people[0].delivered'), false);
  r("handle('previewPaperExcel')");
  assert.match(r('S.modal.body'), /1件/);
  r("handle('completePaperExcel')");
  assert.equal(r('S.people[2].delivered'), true);
  r("S.people[2].seat=''; handle('previewPaperExcel')");
  assert.match(r('S.toast'), /対象はありません/);
  r("S.role='一般受付担当者'; handle('previewPdf:1')");
  assert.match(r('S.toast'), /管理者/);
  assert.doesNotMatch(r('output()'), /架空 太郎/);
});

test('端末申請と本人追加を区別し、他端末の準備・データ削除を拒否する', () => {
  const { run: r } = harness();
  r("deviceAction('stop',2,true)"); assert.equal(r('S.devices[1].stopped'), true); assert.equal(r('S.devices[0].stopped'), false);
  r("deviceAction('resume',2,true)"); assert.equal(r('S.devices[1].stopped'), false);
  r("deviceAction('erase',2,true)"); assert.equal(r('S.devices[1].erased'), false);
  r("deviceAction('prepare',2,true)"); assert.equal(r('S.devices[1].prepared'), false);
  r("S.screen='staff'; handle('device:retire:3')"); assert.match(r('S.modal.title'), /重大操作.*1\/2/);
  r("handle('deviceAgain:retire:3')"); assert.match(r('S.modal.title'), /2\/2/);
  r("handle('deviceCommit:retire:3')"); assert.equal(r('S.devices[2].retired'), true);
  assert.equal(r('S.devices[2].erased'), false);
  assert.doesNotMatch(r('staff()'), /data-action="device:(prepare|erase):/);
  assert.match(r('staff()'), /class="cautionbtn" data-action="device:stop:2"/);
  assert.match(r('staff()'), /class="dangerbtn" data-action="device:retire:2"/);
  r("handle('registerDevice')"); assert.equal(r('S.devices[3].approval'), 'pending');
  assert.equal(r('S.devices[3].role'), '一般受付担当者');
  r("deviceAction('approve',4,true)"); assert.equal(r('S.devices[3].approval'), 'approved');
  r("handle('linkDevice'); handle('linkDeviceDo')");
  assert.equal(r('S.devices[4].role'), '主担当');
  assert.equal(r('S.devices[4].approval'), 'approved');
  assert.equal(r('S.devices[4].prepared'), false);
  r("S.devices[0].prepared=false; S.screen='other'; deviceAction('prepare',1,true)");
  assert.equal(r('S.devices[0].prepared'), true);
  assert.equal(r('S.devices.filter(d=>d.current).length'), 1);
  r("S.role='臨時管理者'");
  assert.doesNotMatch(r('staff()'), /data-action="(registerDevice|linkDevice|device:)/);
});

test('一般受付は管理メニュー非表示・自身の端末だけ削除・未送信保護', () => {
  const { run: r } = harness();
  r("S.role='一般受付担当者'");
  assert.doesNotMatch(r('nav()'), /data-screen="staff"|data-screen="device"/);
  assert.match(r('nav()'), /data-screen="other"/);
  r("go('staff')"); assert.equal(r('S.screen'), 'other');
  assert.match(r('body()'), /この端末のデータを削除/);
  r("handle('registerDevice'); handle('linkDevice'); deviceAction('approve',3,true); deviceAction('erase',3,true); deviceAction('stop',1,true)");
  assert.equal(r('S.devices.length'), 3);
  assert.equal(r('S.devices[2].approval'), 'pending');
  assert.equal(r('S.devices[2].erased'), false);
  assert.equal(r('S.devices[0].stopped'), false);
  r("S.devices[0].unsent=1; handle('device:erase:1')");
  assert.match(r('S.modal.title'), /削除できません/);
  r("S.devices[0].unsent=0; handle('device:erase:1')"); assert.match(r('S.modal.title'), /削除できません/);
  assert.match(r('other()'), /data-action="device:erase:1" disabled/);
  assert.doesNotMatch(r('other()'), /data-action="deleteReadyDemo"/);
  r("handle('deleteReadyDemo')"); assert.equal(r('S.devices[0].mockClosed'), false);
  r("S.role='主担当'; handle('deleteReadyDemo'); S.role='一般受付担当者'");
  assert.match(r('other()'), /data-action="device:erase:1" >/);
  r("handle('device:erase:1')"); assert.match(r('S.modal.title'), /1\/2/);
  r("handle('deviceAgain:erase:1')"); assert.match(r('S.modal.title'), /2\/2/);
  assert.equal(r('S.devices[0].erased'), false);
  r("handle('deviceCommit:erase:1')"); assert.equal(r('S.devices[0].erased'), true);
  assert.doesNotMatch(r('other()'), /data-action="device:erase/);
  assert.doesNotMatch(r('other()'), /data-action="device:prepare/);
  r("S.role='主担当'"); assert.match(r('nav()'), /data-screen="staff"/);
  assert.match(r('staff()'), /再登録が必要/);
  assert.doesNotMatch(r('staff()'), /data-action="device:erase:1"/);
});

test('自己端末の削除は受領と締め・廃止を確認し、確認中の未送信発生でも拒否する', () => {
  const { run: r } = harness();
  r("S.screen='other'; handle('deleteReadyDemo')");
  assert.equal(r('S.devices[0].mockReceiptConfirmed'), true);
  assert.equal(r('S.devices[0].mockClosed'), true);
  r("handle('device:erase:1'); handle('deviceAgain:erase:1')");
  r("S.devices[0].unsent=1; handle('deviceCommit:erase:1')");
  assert.equal(r('S.devices[0].erased'), false);
  r("S.devices[0].unsent=0; S.online=false; deviceAction('erase',1,true)");
  assert.equal(r('S.devices[0].erased'), false);
  r("S.online=true; S.devices[0].mockReceiptConfirmed=false; deviceAction('erase',1,true)");
  assert.equal(r('S.devices[0].erased'), false);
  r("S.devices[0].mockReceiptConfirmed=true; S.devices[0].mockClosed=false; deviceAction('erase',1,true)");
  assert.equal(r('S.devices[0].erased'), false);
});

test('主担当は下位役割を変更し、同じ利用者の端末をまとめて追加準備待ちにする', () => {
  const { run: r, inputs } = harness();
  r("S.screen='staff'; S.devices.push({...S.devices[1], id:4, name:'見本端末 04', prepared:true, unsent:0})");
  assert.doesNotMatch(r('staff()'), /data-action="roleChange:1"/);
  r("handle('roleChange:2')"); assert.match(r('S.modal.title'), /役割を変更/);
  inputs['role-target'] = { value: '臨時管理者' };
  r("handle('rolePreview:2')"); assert.match(r('S.modal.body'), /一般受付担当者 → 臨時管理者/);
  r("handle('modalClose')"); assert.equal(r('S.devices[1].role'), '一般受付担当者');
  r("handle('roleChange:2'); handle('rolePreview:2'); handle('roleCommit:2')");
  assert.equal(r('S.devices[1].role'), '臨時管理者');
  assert.equal(r('S.devices[3].role'), '臨時管理者');
  assert.equal(r('S.devices[3].prepared'), false);
  assert.equal(r('S.devices[1].roleChangePending'), true);
  assert.match(r('staff()'), /追加準備待ち/);
  assert.equal(r('S.devices[1].roleExpiresAt'), '2027/10/11 23:59');
  r("handle('roleChange:3')"); assert.match(r('S.modal.body'), /代理管理者/);
  inputs['role-target'] = { value: '一般受付担当者' };
  r("handle('rolePreview:3'); handle('roleCommit:3')"); assert.equal(r('S.devices[2].role'), '一般受付担当者');
});

test('代理管理者は下位2役割だけ変更でき、権限喪失・オフライン時は確定できない', () => {
  const { run: r, inputs } = harness();
  r("S.screen='staff'; S.role='代理管理者'");
  assert.doesNotMatch(r('staff()'), /data-action="roleChange:(1|3)"/);
  r("handle('roleChange:2')"); assert.doesNotMatch(r('S.modal.body'), /option value="代理管理者"/);
  inputs['role-target'] = { value: '代理管理者' };
  r("handle('rolePreview:2')"); assert.equal(r('S.pendingRoleChange'), null);
  inputs['role-target'] = { value: '臨時管理者' };
  r("handle('rolePreview:2'); S.role='一般受付担当者'; handle('roleCommit:2')");
  assert.equal(r('S.devices[1].role'), '一般受付担当者');
  r("S.role='代理管理者'; S.online=false; handle('roleChange:2')");
  assert.equal(r('S.devices[1].role'), '一般受付担当者');
  r("S.online=true; handle('roleChange:2'); handle('rolePreview:2'); S.online=false; handle('roleCommit:2')");
  assert.equal(r('S.devices[1].role'), '一般受付担当者');
});

test('結果の初回表示だけアニメーション・理由と例外の確認後も結果を維持', () => {
  for (const [result, action, commit] of [['duplicate', 'reason', 'reasonDo'], ['invalid', 'exception', 'exceptionDo']]) {
    const h = harness(), r = h.run;
    r(`S.screen='camera'; handle('scan:${result}')`);
    assert.match(r('camera()'), /camera-result entering/);
    r("document.querySelector = selector => selector === '.camera-result' ? {} : null");
    r(`handle('${action}')`); assert.ok(r('S.modal'));
    assert.doesNotMatch(r('camera()'), /camera-result entering/);
    r(`handle('${commit}')`);
    assert.equal(r('S.modal'), null); assert.equal(r('S.cameraResult'), true);
    assert.equal(r('S.result'), result); assert.equal(h.timers.size, 0);
    assert.doesNotMatch(r('camera()'), /camera-result entering/);
    r("handle('scan:success')"); assert.equal(r('S.result'), result);
    r("handle('next')"); assert.match(r('camera()'), /camera-result closing/);
    h.tick(160); h.tick(500);
    r("document.querySelector = () => null; handle('scan:success')");
    assert.match(r('camera()'), /camera-result entering/);
  }
});

test('結果中の追加読取り拒否・終了後500ms・離脱時タイマー破棄', () => {
  const h = harness(), r = h.run;
  r("S.screen='camera'; S.online=false; handle('scan:success'); handle('scan:success')");
  assert.equal(r('S.unsent'), 1); assert.equal(r('S.screen'), 'camera');
  r("deviceAction('erase',1,true)"); assert.equal(r('S.devices[0].erased'), false); r('S.modal=null');
  r("handle('next')"); h.tick(160); assert.equal(r('S.cameraWaiting'), true);
  r("handle('scan:success')"); assert.equal(r('S.unsent'), 1);
  h.tick(500); r("handle('scan:success')"); assert.equal(r('S.unsent'), 2);
  r("handle('next'); go('venue')"); assert.equal(h.timers.size, 0); assert.equal(r('S.light'), false);
  r("window.matchMedia=()=>({matches:true}); go('camera'); handle('scan:duplicate'); handle('next')"); h.tick(0); h.tick(500);
  assert.equal(r('S.cameraWaiting'), false);
});
