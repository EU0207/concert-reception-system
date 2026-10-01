// 静的モックの操作シナリオ。すべて架空データで、保存先はメモリー内の写しだけ。
const cellTypes = { unset: '未', seat: '席', gap: '欠番', space: '空間', aisle: '通路' };

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function createLayout(sample = false) {
  const cells = Array.from({ length: 40 }, (_, i) => ({
    id: `cell-${i}`, row: Math.floor(i / 8), col: i % 8,
    type: sample && ![11, 29].includes(i) ? 'seat' : sample ? 'space' : 'unset',
    code: ''
  }));
  const layout = { rows: 5, cols: 8, direction: sample ? 'vertical' : 'horizontal', reverse: sample, sample, cells,
    names: Array.from({ length: 30 }, (_, i) => columnName(i)),
    starts: Array(30).fill(1), nextId: 40 };
  if (sample) numberLayout(layout);
  return layout;
}

S.layout = createLayout(true);
S.scenario = 'sample';
S.cell = 'cell-2';
S.cells = new Set([S.cell]);
S.selectionMode = 'single';
S.rangeStart = null;
S.scenarios = {};
S.notices = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, important: i < 2, read: i >= 3,
  date: `2027/10/10 ${String(18 - i).padStart(2, '0')}:00`,
  title: ['集合場所の確認', '緊急時の連絡先', '座席案内', '入口の案内板', '受付備品の確認', '休憩の交代', '紙受付の保管場所', '開場前の確認', '会場内の動線', '当日の持ち物'][i],
  text: ['開始前に受付入口で集合してください。', '困った場合は会場責任者へ声をかけてください。', '席のご案内には会場席画面を使用してください。'][i % 3] + '（架空の連絡）'
}));
S.devices = sampleDevices.map((d, i) => ({ ...d, accountId: `staff-${d.id}`, approval: i === 2 ? 'pending' : 'approved', prepared: i === 0 || i === 3, stopped: false, retired: false, erased: false, unsent: i === 1 ? 1 : 0, isolated: 0, mockReceiptConfirmed: false, mockClosed: false }));
S.pendingRoleChange = null;
S.cameraResult = false;
S.cameraWaiting = false;
S.cameraTimer = null;
S.cameraGeneration = 0;
S.moveHistory = [];
S.placementMode = 'place';
S.imageOpen = false;
function resetGridDraft() {
  S.gridDraft = structuredClone({ rows: S.layout.rows, cols: S.layout.cols, direction: S.layout.direction, reverse: S.layout.reverse, names: S.layout.names, starts: S.layout.starts });
  S.gridPending = false;
}
resetGridDraft();

function selectedCell() { return S.layout.cells.find(c => c.id === S.cell); }
function syncAssignments() {
  for (const p of S.people) {
    if (p.seat && !p.cellId) p.cellId = S.layout.cells.find(c => c.code === p.seat)?.id || '';
    if (p.cellId) p.seat = S.layout.cells.find(c => c.id === p.cellId)?.code || '';
    if (!p.seat) p.cellId = '';
  }
  S.seat = selectedCell()?.code || '';
}
syncAssignments();

function snapshotEditor() { return structuredClone({ layout: S.layout, people: S.people, moveHistory: S.moveHistory }); }
S.savedEditor = snapshotEditor();

function numberLayout(layout) {
  for (let group = 0; group < (layout.direction === 'horizontal' ? layout.rows : layout.cols); group++) {
    let number = layout.starts[group];
    const cells = layout.cells.filter(c => (layout.direction === 'horizontal' ? c.row : c.col) === group)
      .sort((a, b) => layout.direction === 'horizontal' ? a.col - b.col : a.row - b.row);
    // 列名の並びは維持し、各列内の番号を振る順序だけを反転する。
    if (layout.reverse) cells.reverse();
    for (const c of cells) c.code = ['seat', 'gap'].includes(c.type) ? `${layout.names[group]}-${number++}` : '';
  }
}

// 変更案を先に計算し、発行済み席の保護と確認を通してから一括反映する。
function proposeLayout(layout) {
  numberLayout(layout);
  const affected = S.people.filter(p => p.seat).filter(p => {
    const before = S.layout.cells.find(c => c.id === p.cellId);
    const after = layout.cells.find(c => c.id === p.cellId);
    return !after || after.type !== 'seat' || after.code !== before?.code;
  });
  if (affected.some(p => p.issued)) return toast('券発行済みの席番号変更・削除はできません。対象席を除いてください。');
  S.pendingLayout = { layout, affected: affected.map(p => p.id) };
  if (affected.length) return openModal('席設定を解除して変更しますか？', `<p>未発行のお客様の席設定を解除します。</p><ul>${affected.map(p => `<li>${esc(p.name)}：${esc(p.seat)}</li>`).join('')}</ul>`, [
    { label: '席設定を解除して変更', action: 'applyLayout', style: 'primary' }, { label: 'キャンセル', action: 'cancelLayout' }
  ]);
  applyLayout();
}

function applyLayout() {
  if (!S.pendingLayout) return;
  for (const id of S.pendingLayout.affected) {
    const p = S.people.find(p => p.id === id);
    p.cellId = ''; p.seat = '';
  }
  S.layout = S.pendingLayout.layout;
  resetGridDraft();
  S.pendingLayout = null;
  if (!selectedCell()) S.cell = S.layout.cells[0].id;
  S.cells = new Set([...S.cells].filter(id => S.layout.cells.some(c => c.id === id)));
  syncAssignments(); S.dirty = true; S.modal = null; render();
}

function switchScenario(target) {
  if (target === S.scenario) return;
  if (S.dirty) return openModal('会場を切り替える前に', '<p>現在の編集内容が未保存です。</p>', [
    { label: '保存して切り替える', action: `scenarioSave:${target}`, style: 'primary' },
    { label: '破棄して切り替える', action: `scenarioDiscard:${target}` }, { label: 'キャンセル', action: 'modalClose' }
  ]);
  S.scenarios[S.scenario] = { current: snapshotEditor(), saved: structuredClone(S.savedEditor) };
  const stored = S.scenarios[target];
  if (stored) { S.layout = structuredClone(stored.current.layout); S.people = structuredClone(stored.current.people); S.moveHistory = structuredClone(stored.current.moveHistory); S.savedEditor = structuredClone(stored.saved); }
  else {
    S.layout = createLayout(false);
    S.moveHistory = [];
    S.people = structuredClone(initialPeople).map(p => ({ ...p, seat: '', cellId: '', issued: false, delivered: false }));
    S.savedEditor = snapshotEditor();
  }
  S.scenario = target; S.cell = S.layout.cells[0].id; S.cells = new Set([S.cell]); S.rangeStart = null;
  resetGridDraft();
  S.savedPeople = structuredClone(S.people); S.modal = null; syncAssignments(); render();
}

selectedCellState = function () {
  const c = selectedCell();
  return c?.type === 'seat' ? S.people.some(p => p.seat && p.cellId === c.id) ? '席設定済み' : '空席' : cellTypes[c?.type] || '未';
};

seatTiles = function () {
  const l = S.layout;
  return `<div class="seatmap editable-map" style="transform:scale(${S.zoom});grid-template-columns:90px repeat(${l.cols},74px);grid-template-rows:repeat(${l.rows},72px)"><div class="stage-label" style="grid-row:1/${l.rows + 1};grid-column:1">舞台</div>${l.cells.map(c => {
    const p = S.people.find(p => p.seat && p.cellId === c.id);
    const arrived = S.screen === 'venue' && c.type === 'seat' && p && S.arrived === c.code;
    return `<button class="seat cell-${c.type} ${S.cells.has(c.id) && S.screen === 'seats' || S.cell === c.id ? 'selected' : ''} ${arrived ? 'arrived' : ''}" style="grid-column:${c.col + 2};grid-row:${c.row + 1}" data-cell="${c.id}" data-seat="${esc(c.code)}" aria-label="${esc(c.code || `${c.row + 1}行${c.col + 1}列`)} ${cellTypes[c.type]}${arrived ? '、来場済み' : ''}"><strong>${esc(c.code || cellTypes[c.type])}${arrived ? ' ✓' : ''}</strong>${p ? seatDisplayName(p.label) : `<span>${cellTypes[c.type]}</span>`}</button>`;
  }).join('')}</div>`;
};

function venueImage() {
  return `<details data-venue-image ${S.imageOpen ? 'open' : ''}><summary>架空の会場画像</summary><div class="venue image-pan" data-pan><div class="image-content" style="width:${S.imageZoom * 100}%;height:${S.imageZoom * 100}%">${venueSvg()}</div></div><div class="row">${btn('画像 −', 'imageOut')}${btn('画像 ＋', 'imageIn')}${btn('前の画像', 'prevImage')}${btn('次の画像', 'nextImage')}<span>${S.imageIndex}/2</span></div></details>`;
}

seats = function () {
  const l = S.layout, d = S.gridDraft, groups = d.direction === 'horizontal' ? +d.rows : +d.cols;
  return page('会場席の編集', `<div class="stage ${S.panelBottom ? 'panel-bottom' : ''}"><section class="card stack settings-card"><div class="paneltop"><strong>席の設定</strong>${btn(S.panelCollapsed ? '開く' : '最小化', 'panelCollapse', 'textbtn')}</div>${S.panelCollapsed ? '' : `
    <div class="scenario-switch"><div class="scenario-current"><span>表示中：</span><strong>${S.scenario === 'sample' ? '席設定済みの例' : '新規会場の例'}</strong></div>${S.scenario === 'sample' ? btn('新規会場の例に切り替える', 'scenario:new', 'secondary') : btn('席設定済みの例に切り替える', 'scenario:sample', 'secondary')}</div>
    <p class="small muted">ドラッグで移動。範囲選択は始点と終点を順にタップします。席・欠番だけが番号を消費します。</p>
    <div class="row"><label class="field">縦<input id="grid-rows" type="number" min="1" max="30" value="${esc(d.rows)}"></label><label class="field">横<input id="grid-cols" type="number" min="1" max="30" value="${esc(d.cols)}"></label></div>
    <div class="row numbering-settings"><label class="field">列の並び<select id="grid-direction"><option value="horizontal" ${d.direction === 'horizontal' ? 'selected' : ''}>横方向</option><option value="vertical" ${d.direction === 'vertical' ? 'selected' : ''}>縦方向</option></select></label><label class="field">席番の順序<select id="grid-order"><option value="forward" ${!d.reverse ? 'selected' : ''}>${d.direction === 'horizontal' ? '左から' : '上から'}</option><option value="reverse" ${d.reverse ? 'selected' : ''}>${d.direction === 'horizontal' ? '右から' : '下から'}</option></select></label></div>
    <details><summary>列名・開始番号（席設定済みの例を変更すると全体を再採番）</summary><div class="column-settings">${Array.from({ length: Math.min(30, Math.max(0, groups)) }, (_, i) => `<label>${i + 1}列 <input data-column-name="${i}" value="${esc(d.names[i])}" aria-label="${i + 1}列の名前"><input data-column-start="${i}" type="number" min="1" value="${esc(d.starts[i])}" aria-label="${i + 1}列の開始番号"></label>`).join('')}</div></details>
    ${btn('設定を反映', 'gridSettings')}<div class="row">${btn('下書きを保存', 'saveDraft', 'primary draft-button')}${btn('編集内容を確定', 'confirmFinalize', 'primary')}${btn('保存状態に戻す', 'discardEditor')}</div>${btn(S.panelBottom ? 'パネルを上に' : 'パネルを下に', 'panelPosition')}`}</section>
    <div class="selection-strip"><div class="selection-details"><span>選択 <strong>${esc(selectedCell()?.code || '未採番セル')}</strong></span><span class="pill neutral">${selectedCellState()}</span><span>${S.cells.size}セル</span><select data-selection-mode aria-label="選択方法"><option value="single" ${S.selectionMode === 'single' ? 'selected' : ''}>個別</option><option value="multiple" ${S.selectionMode === 'multiple' ? 'selected' : ''}>複数</option><option value="range" ${S.selectionMode === 'range' ? 'selected' : ''}>範囲（始点→終点）</option></select>${S.rangeStart ? '<small>終点を選んでください</small>' : ''}</div><div class="seat-actions">${Object.entries(cellTypes).map(([key, text]) => btn(`${text}に`, `cellType:${key}`)).join('')}</div>${editStatus()}<div class="selection-image">${venueImage()}</div></div><div class="seat-workspace"><section class="card canvas-card"><h3>座席キャンバス</h3>${canvas()}</section></div></div>`, '空の会場と席設定済みの会場で編集を試せます。');
};

const baseSave = save;
save = function () {
  if (S.gridPending) { toast('席の設定を「設定を反映」で確認してから保存してください'); return false; }
  syncAssignments(); const ok = baseSave(); if (ok) S.savedEditor = snapshotEditor(); return ok;
};
const baseReset = resetDraft;
resetDraft = function () {
  if (['seats', 'placement'].includes(S.screen)) {
    S.layout = structuredClone(S.savedEditor.layout); S.people = structuredClone(S.savedEditor.people);
    S.moveHistory = structuredClone(S.savedEditor.moveHistory);
    if (!selectedCell()) S.cell = S.layout.cells[0].id;
    S.cells = new Set([S.cell]); syncAssignments(); S.dirty = false; S.conflict = false;
    resetGridDraft();
  } else { baseReset(); syncAssignments(); }
};

placement = function () {
  const assigned = S.people.filter(p => p.seat && !p.inactive);
  const unplaced = S.people.filter(p => !p.seat && !p.inactive);
  const candidates = unplaced.filter(p => S.placementFilter === 'all' || p.payment === (S.placementFilter === 'confirmed'));
  const selectedPerson = candidates.find(p => p.id === S.personToPlace) || candidates[0];
  if (!assigned.some(p => p.id === S.movePerson)) S.movePerson = assigned[0]?.id;
  const moving = S.placementMode === 'move';
  const person = moving ? assigned.find(p => p.id === S.movePerson) : selectedPerson;
  const tabs = `<div class="placement-tabs" role="tablist" aria-label="席設定対象">${[['place', '席未設定', unplaced.length], ['move', '席設定済み', assigned.length]].map(([mode, label, count]) => `<button id="placement-tab-${mode}" role="tab" data-placement-tab="${mode}" data-action="placementTab:${mode}" aria-selected="${S.placementMode === mode}" aria-controls="placement-target-panel" tabindex="${S.placementMode === mode ? '0' : '-1'}">${label}<span>${count}件</span></button>`).join('')}</div>`;
  const controls = moving ? `${person ? `<label class="field">席替えする方<select id="move-person">${assigned.map(p => `<option value="${p.id}" ${S.movePerson === p.id ? 'selected' : ''}>${esc(p.name)}（${esc(p.seat)}）</option>`).join('')}</select></label><p>移動先の席をキャンバスで選択してください。席設定済みなら交換します。</p>${btn('移動・交換を確認', 'moveGuest', 'primary')}` : '<p>席設定済みのお客様はいません。</p>'}` : `<label class="field">表示する対象<select data-placement-filter><option value="confirmed" ${S.placementFilter === 'confirmed' ? 'selected' : ''}>入金確認済み</option><option value="unconfirmed" ${S.placementFilter === 'unconfirmed' ? 'selected' : ''}>入金未確認</option><option value="all" ${S.placementFilter === 'all' ? 'selected' : ''}>来場予定の席未設定全員</option></select></label><p class="small muted">表示中 ${candidates.length}件。不参加の方は候補から除外します。</p>${person ? `<label class="field">席を設定するお客様<select id="person-to-place">${candidates.map(p => `<option value="${p.id}" ${p.id === person.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><p>空席を選び「この席に設定」を押します。</p>${btn('この席に設定', 'place', 'primary')}` : '<p>この条件に合う席未設定の方はいません。</p>'}`;
  return page('お客様の席を設定', `<div class="stage ${S.placementPanelBottom ? 'panel-bottom' : ''}"><section class="card stack settings-card">${tabs}<div class="stack" id="placement-target-panel" role="tabpanel" aria-labelledby="placement-tab-${S.placementMode}">${controls}</div><div class="row">${btn('下書きを保存', 'saveDraft')}${btn('席設定を確定', 'confirmFinalize', 'primary')}</div>${btn(S.placementPanelBottom ? 'パネルを上に' : 'パネルを下に', 'panelPosition')}</section><div class="selection-strip"><span>選択中の席 <strong>${esc(S.seat)}</strong></span><span>お客様 <strong id="selected-person-name">${person ? esc(person.name) : '対象なし'}</strong></span>${editStatus()}</div><section class="card canvas-card"><h3>座席キャンバス</h3>${canvas()}</section></div>`, '席未設定のお客様の席設定と、席設定済みのお客様の席替えを確認します。');
};

function proposeMove() {
  const p = S.people.find(p => p.id === +$('move-person')?.value);
  const c = selectedCell();
  if (!p || p.inactive || !p.seat || c?.type !== 'seat') return toast('席設定済みのお客様と席を選んでください');
  if (p.cellId === c.id) return toast('現在と同じ席です');
  const other = S.people.find(q => q.seat && q.cellId === c.id);
  if (other?.inactive) return toast('不参加のお客様は交換できません');
  S.pendingMove = { person: p.id, other: other?.id, destination: c.id, origin: p.cellId, reasonRequired: p.issued || !!other?.issued };
  openModal(other ? '席を交換しますか？' : '席を移動しますか？', `<p>${esc(p.name)}：${esc(p.seat)} → ${esc(c.code)}</p>${other ? `<p>${esc(other.name)}：${esc(other.seat)} → ${esc(p.seat)}</p>` : ''}${S.pendingMove.reasonRequired ? '<label class="field">券発行済みの変更理由（必須）<input id="move-reason"></label><p class="small muted">本番での旧QR無効化・再発行は別工程です。</p>' : ''}`, [
    { label: '変更を確定', action: 'commitMove', style: 'primary' }, { label: 'キャンセル', action: 'cancelMove' }
  ]);
}

function commitMove() {
  const move = S.pendingMove;
  if (!move) return;
  const reason = $('move-reason')?.value.trim() || '';
  if (move.reasonRequired && !reason) { $('move-reason')?.focus(); return; }
  const p = S.people.find(p => p.id === move.person), other = S.people.find(p => p.id === move.other);
  if (p.inactive || p.cellId !== move.origin || selectedCell()?.id !== move.destination) return toast('対象が変わりました。確認し直してください');
  S.moveHistory.push({ ...move, reason });
  // 確定までは配置を変更せず、交換する両者を同じ処理で更新する。
  p.cellId = move.destination;
  if (other) other.cellId = move.origin;
  syncAssignments(); S.pendingMove = null; S.modal = null; S.dirty = true; render();
}

function unreadCount() { return S.notices.filter(n => !n.read).length; }
messages = function () {
  return page('スタッフ連絡', `<p>未読 ${unreadCount()}件</p><div class="stack">${[...S.notices].sort((a, b) => Number(b.important) - Number(a.important) || b.date.localeCompare(a.date)).map(n => `<button class="notice-row card ${n.read ? 'is-read' : ''}" data-action="notice:${n.id}"><span class="unread-mark" aria-label="${n.read ? '既読' : '未読'}">${n.read ? '' : '●'}</span><span><small>${n.important ? '重要 · ' : ''}${n.date}</small><strong>${esc(n.title)}</strong></span></button>`).join('')}</div><p>${btn('戻る', 'back')}</p>`, '左端の印は未読です。重要連絡は内容を確認してから「確認しました」を押します。');
};

function showNotice(id) {
  const n = S.notices.find(n => n.id === id);
  if (!n) return;
  if (!n.important) n.read = true;
  S.unread = unreadCount();
  openModal(n.title, `<p>${esc(n.text)}</p><small>${n.date}</small>`, n.important ? [
    { label: '確認しました', action: `noticeRead:${id}`, style: 'primary' }, { label: '閉じる', action: 'modalClose' }
  ] : [{ label: '閉じる', action: 'modalClose' }]);
}

function changeableRoles(device) {
  if (!S.online || device.current || device.retired || device.erased) return [];
  const sameUser = S.devices.filter(other => other.accountId === device.accountId);
  if (sameUser.some(other => other.current || other.role !== device.role)) return [];
  const allowed = S.role === '主担当' ? ['代理管理者', '臨時管理者', '一般受付担当者'] : S.role === '代理管理者' ? ['臨時管理者', '一般受付担当者'] : [];
  return allowed.includes(device.role) ? allowed.filter(role => role !== device.role) : [];
}

function roleChangeDeadline() {
  return S.form.title.includes('2日目') ? '2027/10/12 23:59' : '2027/10/11 23:59';
}

function needsManagerReplacement(device) {
  if (!['主担当', '代理管理者'].includes(device.role) || device.approval !== 'approved' || device.erased) return false;
  return !S.devices.some(other => other.id !== device.id && ['主担当', '代理管理者'].includes(other.role) && other.approval === 'approved' && other.prepared && !other.stopped && !other.retired && !other.erased);
}

staff = function () {
  if (S.role === '一般受付担当者') return other();
  const canManage = ['主担当', '代理管理者'].includes(S.role);
  const cards = S.devices.map(d => {
    const state = d.retired ? (d.erased ? '廃止・削除済み' : '廃止・削除未確認') : d.erased ? '再登録が必要' : d.stopped ? '停止中' : d.approval !== 'approved' ? '承認待ち' : d.roleChangePending ? '追加準備待ち' : !d.prepared ? '未準備' : '利用可能';
    const registration = d.registration === 'staff' ? '<p class="small muted">一般受付担当者の新端末申請</p>' : d.registration === 'linked' ? '<p class="small muted">主担当本人の追加端末・関連付け済み</p>' : '';
    const replacementNeeded = needsManagerReplacement(d);
    const current = S.devices.find(other => other.current);
    const waitingCandidates = S.devices.filter(other => other.id !== d.id && ['主担当', '代理管理者'].includes(other.role) && other.approval === 'approved' && !other.prepared && !other.stopped && !other.retired && !other.erased);
    const waitingReplacement = replacementNeeded && (waitingCandidates.find(other => other.accountId === d.accountId && other.registration === 'linked') || waitingCandidates.find(other => other.current) || waitingCandidates[0]);
    const replacementNotice = waitingReplacement
      ? `代替端末「${esc(waitingReplacement.name)}」は追加済みですが、まだ準備が完了していません。${waitingReplacement.current ? '現在の端末の「その他」で準備を完了してください。' : current?.accountId === waitingReplacement.accountId ? '「この端末として操作を試す」で切り替え、「その他」で準備を完了してください。' : 'その端末自身で準備を完了してください。'}準備前は、この端末の廃止と端末内データ削除はできません。`
      : '利用可能な代替管理端末がありません。この端末の廃止と端末内データ削除はできません。別の管理端末を準備するか、端末喪失時は環境所有者の復旧手順へ進んでください。';
    const canSwitch = canManage && !d.current && current?.accountId === d.accountId && current.role === d.role && d.approval === 'approved' && !d.stopped && !d.retired && !d.erased;
    const switchButton = canSwitch ? btn('この端末として操作を試す', `switchMockDevice:${d.id}`) : '';
    const controls = d.retired || !canManage ? '' : `${changeableRoles(d).length ? btn('役割を変更', `roleChange:${d.id}`) : ''}${d.approval === 'pending' ? btn('承認', `device:approve:${d.id}`) : ''}${d.approval === 'approved' ? btn(d.stopped ? '停止解除' : '停止', `device:${d.stopped ? 'resume' : 'stop'}:${d.id}`, d.stopped ? 'secondary' : 'cautionbtn') : ''}${btn('廃止', `device:retire:${d.id}`, 'dangerbtn', replacementNeeded ? 'disabled' : '')}`;
    return `<section class="card"><h3>${esc(d.name)} ${d.current ? '<span class="pill">この端末</span>' : ''}</h3>${registration}<p>利用者の役割：${esc(d.role)}${d.role === '臨時管理者' && d.roleExpiresAt ? ` · 期限：${esc(d.roleExpiresAt)}` : ''}</p><p>承認：${d.approval === 'approved' ? '承認済み' : '承認待ち'} · 準備：${d.prepared ? '完了' : '未完了'} · 状態：${state}</p><p>端末内データ：${d.erased ? '削除済み' : d.retired ? '削除未確認' : 'あり'} · 未送信 ${d.unsent}件</p>${replacementNeeded ? `<p class="notice warn">${replacementNotice}</p>` : ''}<div class="row">${switchButton}${controls}</div></section>`;
  }).join('');
  return page('スタッフ・端末', `<div class="notice">架空の端末だけを操作します。主担当・代理管理者は承認・停止・廃止を行います。役割変更はオンライン時に利用者単位で行い、同じ利用者の端末にも反映します。準備完了は各端末で準備した結果です。端末内データの削除は、対象端末の操作か廃止時の削除要求として扱います。</div>${canManage ? `<div class="row device-registration-actions">${btn('一般受付担当者の新端末を申請', 'registerDevice', 'primary')}${S.role === '主担当' ? btn('主担当本人の追加端末', 'linkDevice') : ''}</div>` : ''}<div class="stack">${cards}</div>`, '登録申請と主担当本人の追加端末は別の操作です。');
};
device = function () { return staff(); };
function selfEraseConditions(d) {
  return [
    { label: '未送信・隔離記録が0件', met: d.unsent === 0 && d.isolated === 0 },
    { label: 'サーバーで全件受領を確認', met: d.mockReceiptConfirmed },
    { label: '管理者による公演の締め、または端末廃止', met: d.mockClosed || d.retired },
    { label: '利用可能な代替管理端末がある（管理端末の場合）', met: !needsManagerReplacement(d) },
    { label: 'オンラインで最新状態を確認', met: S.online }
  ];
}
function other() {
  const d = S.devices.find(d => d.current);
  const conditions = d ? selfEraseConditions(d) : [];
  const canErase = conditions.length && conditions.every(condition => condition.met);
  return page('その他', `<section class="card stack"><h3>この端末の準備とデータ</h3><p>${esc(d?.name || '対象端末なし')} <span class="pill">この端末（ダミー）</span></p><p>準備：${d?.prepared ? '完了' : '未完了'} · 端末内データ：${d?.erased ? '削除済み' : 'あり'} · 未送信 ${d?.unsent || 0}件</p><p class="small muted">準備はこの端末で行い、管理画面には結果だけを表示します。データ削除もこの端末だけが対象です。削除後に使う場合は再登録が必要です。</p>${d && !d.erased ? `<h3>データ削除の条件</h3><ul class="deletion-conditions">${conditions.map(condition => `<li><span class="pill ${condition.met ? '' : 'warn'}">${condition.met ? '確認済み' : '未達'}</span> ${condition.label}</li>`).join('')}</ul><p class="small muted">締め・端末廃止は主担当または代理管理者の操作です。公演翌日23:59は受付権限の期限であり、削除許可にはなりません。モックではサーバーへの確認を行いません。</p>` : ''}<div class="row">${d && d.approval === 'approved' && !d.prepared && !d.retired && !d.erased ? btn('この端末を準備する', `device:prepare:${d.id}`, 'primary') : ''}${d && !d.erased && !d.mockReceiptConfirmed && !d.mockClosed && ['主担当', '代理管理者'].includes(S.role) ? btn('管理者の受領・締め確認を再現', 'deleteReadyDemo', 'secondary', d.unsent || d.isolated || !S.online ? 'disabled' : '') : ''}${d && !d.erased ? btn('この端末のデータを削除', `device:erase:${d.id}`, 'dangerbtn', canErase ? '' : 'disabled') : ''}${d?.registration === 'linked' ? btn('スタッフ・端末へ戻る', 'staff') : ''}</div></section>`, '自身の端末で準備します。実データの保存と削除は行いません。');
}
const baseNav = nav;
nav = function () {
  const html = baseNav();
  const staffLink = S.role === '一般受付担当者' ? '' : `<button data-screen="staff" class="${S.screen === 'staff' ? 'active' : ''}" ${S.screen === 'staff' ? 'aria-current="page"' : ''}>スタッフ・端末</button>`;
  const otherLink = `<button data-screen="other" class="${S.screen === 'other' ? 'active' : ''}" ${S.screen === 'other' ? 'aria-current="page"' : ''}>その他</button>`;
  return html.replace(/<button data-screen="(?:staff|device)"[\s\S]*?<\/button>/g, '').replace('</nav>', `<span class="group">端末設定</span>${staffLink}${otherLink}</nav>`);
};
const baseVenue = venue;
venue = function () { return baseVenue().replace(/<details open>[\s\S]*?<\/details>/, venueImage()); };
management = function () {
  return page('当日管理', `<div class="stack"><section class="card stack"><h3>端末の確認</h3><p>承認・停止・廃止は「スタッフ・端末」で行います。</p><div class="row">${btn('スタッフ・端末へ', 'staff')}</div></section><section class="card stack"><h3>公演終了</h3><div class="row">${btn('締め画面へ', 'close')}${btn('公演後の再ログイン表示', 'relogin')}</div></section></div>`, '端末操作と公演の締めを確認します。');
};

function deviceAction(op, id, confirmed = false) {
  const d = S.devices.find(d => d.id === id);
  if (!d) return;
  // 確認画面の後も対象端末と操作権限を再検証する。
  if (op === 'erase' && (!d.current || S.screen !== 'other')) return toast('端末内データは対象端末の「その他」で削除します');
  if (op === 'prepare' && (!d.current || S.screen !== 'other')) return toast('準備は対象端末で行います');
  if (!['erase', 'prepare'].includes(op) && !['主担当', '代理管理者'].includes(S.role)) return toast('この操作は管理者が行います');
  if (d.retired && op !== 'erase') return toast('廃止した端末は操作できません');
  if (op === 'prepare' && (d.approval !== 'approved' || d.erased)) return toast('承認済みの端末だけ準備できます');
  if (['retire', 'erase'].includes(op) && needsManagerReplacement(d)) return openModal('最後の管理端末は操作できません', '<p>利用可能な代替管理端末を先に準備してください。端末を失った場合は、環境所有者による復旧手順を使用します。</p>', [{ label: '閉じる', action: 'modalClose' }]);
  if (op === 'erase' && (d.erased || selfEraseConditions(d).some(condition => !condition.met))) return openModal('端末内データは削除できません', `<p>${esc(d.name)}の削除条件が未達です。未送信・隔離記録の全件受領と、管理者による締めまたは廃止を確認してください。</p>`, [{ label: '閉じる', action: 'modalClose' }]);
  if (!confirmed) return confirmAction(['erase', 'retire'].includes(op) ? `重大操作：${esc(d.name)}の${op === 'erase' ? '端末内データ削除' : '廃止'}（1/2）` : `${esc(d.name)}の${{ approve: '承認', prepare: '準備', stop: '停止', resume: '停止解除' }[op]}`, `${esc(d.name)}だけが対象です。${op === 'erase' ? '削除後は復元できません。' : op === 'retire' ? '利用不可にしてデータ削除を要求します。未送信記録が残る間は削除しません。実際の端末への反映は行いません。' : '端末内データは削除しません。'}`, ['erase', 'retire'].includes(op) ? `deviceAgain:${op}:${id}` : `deviceCommit:${op}:${id}`, ['erase', 'retire'].includes(op));
  if (op === 'approve') d.approval = 'approved';
  if (op === 'prepare' && d.approval === 'approved' && !d.retired) { d.prepared = true; d.erased = false; d.roleChangePending = false; }
  if (op === 'stop') d.stopped = true;
  if (op === 'resume') d.stopped = false;
  if (op === 'retire') { d.retired = true; d.stopped = true; }
  if (op === 'erase') { d.erased = true; d.prepared = false; }
  S.modal = null; render();
}

function stopCamera() {
  clearTimeout(S.cameraTimer); S.cameraGeneration++; S.cameraTimer = null;
  S.cameraResult = false; S.cameraWaiting = false; S.light = false;
}
const baseGo = go;
go = function (target, ...args) {
  if (target === 'device') target = 'staff';
  if (target === 'staff' && S.role === '一般受付担当者') target = 'other';
  if (S.screen === 'camera' && target !== 'camera') stopCamera();
  return baseGo(target, ...args);
};
const baseCamera = camera, baseResult = result;
camera = function () {
  // 確認ダイアログや通知で再表示しても、表示中の受付結果には入場アニメーションを付け直さない。
  const entering = !document.querySelector('.camera-result');
  return `${baseCamera().replace('架空QRの判定を選んで試してください', S.cameraWaiting ? '読取り再開を待っています…' : '架空QRの判定を選んで試してください')}<p>${btn('会場席を確認', 'venue')}</p>${S.cameraResult ? `<div class="camera-result ${S.cameraClosing ? 'closing' : entering ? 'entering' : ''}" role="dialog" aria-modal="true" aria-label="受付結果">${baseResult()}</div>` : ''}`;
};
const baseRender = render;
render = function () {
  if (S.role === '一般受付担当者' && ['staff', 'device'].includes(S.screen)) S.screen = 'other';
  const image = document.querySelector('.image-pan');
  const position = image ? { left: image.scrollLeft, top: image.scrollTop } : null;
  S.unread = unreadCount(); baseRender();
  if (position) document.querySelector('.image-pan')?.scrollTo(position);
  if (S.modal) {
    const main = document.querySelector('.main'); if (main) main.inert = true;
    const side = document.querySelector('.side'); if (side) side.inert = true;
  }
  if (S.screen === 'camera') {
    const content = document.querySelector('.content');
    if (content) for (const child of content.children) if (!child.classList.contains('camera-result')) child.inert = S.cameraResult;
    const header = document.querySelector('.top'); if (header) header.inert = S.cameraResult;
    const nav = document.querySelector('.side'); if (nav) nav.inert = S.cameraResult;
    const result = document.querySelector('.camera-result'); if (result) result.inert = !!S.modal;
    if (S.cameraResult && !S.modal) document.querySelector('.camera-result button')?.focus();
  }
};

const baseHandle = handle;
handle = function (action) {
  if (action === 'deleteReadyDemo') {
    const d = S.devices.find(device => device.current);
    if (S.screen !== 'other' || !d || d.erased || !['主担当', '代理管理者'].includes(S.role) || !S.online || d.unsent || d.isolated) return toast('管理者確認または未送信・隔離記録の条件を満たしていません');
    d.mockReceiptConfirmed = true; d.mockClosed = true;
    return render();
  }
  if (action.startsWith('roleChange:')) {
    const d = S.devices.find(device => device.id === +action.split(':')[1]);
    if (S.screen !== 'staff' || !d) return;
    const choices = changeableRoles(d);
    if (!choices.length) return toast('この利用者の役割は変更できません');
    return openModal('利用者の役割を変更', `<p>${esc(d.name)}の利用者：現在の役割は${esc(d.role)}です。同じ利用者の端末にも反映します。</p><label class="field">変更後の役割<select id="role-target">${choices.map(role => `<option value="${role}">${role}</option>`).join('')}</select></label><p class="small muted">臨時管理者は公演翌日23:59まで。変更後は対象端末で追加準備が必要です。モックでは本人再認証と同期は行いません。</p>`, [{ label: '変更内容を確認', action: `rolePreview:${d.id}`, style: 'primary' }, { label: '戻る', action: 'modalClose' }]);
  }
  if (action.startsWith('rolePreview:')) {
    const d = S.devices.find(device => device.id === +action.split(':')[1]);
    const nextRole = $('role-target')?.value;
    if (S.screen !== 'staff' || !d || !changeableRoles(d).includes(nextRole)) return toast('変更できる役割を選んでください');
    S.pendingRoleChange = { id: d.id, accountId: d.accountId, previousRole: d.role, nextRole };
    return confirmAction('役割変更の確認', `${esc(d.name)}の利用者：${esc(d.role)} → ${esc(nextRole)}。同じ利用者の端末はすべて追加準備待ちになります。${nextRole === '臨時管理者' ? `有効期限：${roleChangeDeadline()}。` : ''}${nextRole === '代理管理者' ? '本番では本人のGoogle認証とアカウントの対応付けを確認します。' : ''}実際の権限・認証は変更しません。`, `roleCommit:${d.id}`);
  }
  if (action.startsWith('roleCommit:')) {
    const pending = S.pendingRoleChange, d = S.devices.find(device => device.id === +action.split(':')[1]);
    if (S.screen !== 'staff' || !pending || !d || pending.id !== d.id || pending.accountId !== d.accountId || pending.previousRole !== d.role || !changeableRoles(d).includes(pending.nextRole)) {
      S.pendingRoleChange = null;
      return toast('役割の変更条件が変わりました。選び直してください');
    }
    for (const device of S.devices.filter(device => device.accountId === d.accountId)) {
      device.role = pending.nextRole; device.prepared = false; device.roleChangePending = true;
      device.roleExpiresAt = pending.nextRole === '臨時管理者' ? roleChangeDeadline() : null;
    }
    S.pendingRoleChange = null; S.modal = null; return render();
  }
  if (action === 'modalClose') S.pendingRoleChange = null;
  if (action.startsWith('placementTab:')) {
    const mode = action.split(':')[1];
    if (!['place', 'move'].includes(mode)) return;
    S.placementMode = mode; render();
    document.querySelector(`#placement-tab-${mode}`)?.focus();
    return;
  }
  if (action.startsWith('scenario:')) return switchScenario(action.split(':')[1]);
  if (action.startsWith('scenarioSave:')) { const target = action.split(':')[1]; if (save()) switchScenario(target); return; }
  if (action.startsWith('scenarioDiscard:')) { resetDraft(); return switchScenario(action.split(':')[1]); }
  if (action.startsWith('cellType:')) {
    if (S.gridPending) return toast('先に「設定を反映」で席の設定を確認してください');
    const l = structuredClone(S.layout), type = action.split(':')[1];
    l.cells.filter(c => S.cells.has(c.id)).forEach(c => { c.type = type; });
    return proposeLayout(l);
  }
  if (action === 'gridSettings') {
    const rows = +$('grid-rows').value, cols = +$('grid-cols').value;
    if (![rows, cols].every(n => Number.isInteger(n) && n >= 1 && n <= 30)) return toast('縦横は1〜30の整数を指定してください');
    const l = structuredClone(S.layout); l.sample = false; l.rows = rows; l.cols = cols; l.direction = $('grid-direction').value;
    l.reverse = $('grid-order').value === 'reverse';
    l.names = [...S.gridDraft.names]; l.starts = S.gridDraft.starts.map(Number);
    for (const input of document.querySelectorAll('[data-column-name]')) l.names[+input.dataset.columnName] = input.value.trim();
    for (const input of document.querySelectorAll('[data-column-start]')) l.starts[+input.dataset.columnStart] = +input.value;
    const groups = l.direction === 'horizontal' ? rows : cols;
    if (l.names.slice(0, groups).some(n => !n) || new Set(l.names.slice(0, groups)).size !== groups || l.starts.some(n => !Number.isSafeInteger(n) || n < 1 || n > Number.MAX_SAFE_INTEGER - 30)) return toast('列名は重複しない名前、開始番号は1以上の整数にしてください');
    const old = l.cells;
    l.cells = Array.from({ length: rows * cols }, (_, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      return old.find(c => c.row === row && c.col === col) || { id: `cell-${l.nextId++}`, row, col, type: 'unset', code: '' };
    });
    return proposeLayout(l);
  }
  if (action === 'applyLayout') return applyLayout();
  if (action === 'cancelLayout') { S.pendingLayout = null; return closeModal(); }
  if (action === 'discardEditor') { resetDraft(); return render(); }
  if (action === 'finalize') { if (save()) { S.version++; S.modal = null; render(); } return; }
  if (action === 'place') {
    if (selectedCell()?.type !== 'seat') return toast('席セルを選んでください');
    const p = S.people.find(p => p.id === +$('person-to-place')?.value);
    if (!p || p.inactive || p.seat || S.people.some(p => p.seat && p.cellId === S.cell)) return toast('席未設定のお客様と空席を選んでください');
    p.cellId = S.cell; syncAssignments(); S.dirty = true; return render();
  }
  if (action === 'moveGuest') return proposeMove();
  if (action === 'commitMove') return commitMove();
  if (action === 'cancelMove') { S.pendingMove = null; return closeModal(); }
  if (action.startsWith('notice:')) return showNotice(+action.split(':')[1]);
  if (action.startsWith('noticeRead:')) { S.notices.find(n => n.id === +action.split(':')[1]).read = true; return closeModal(); }
  if (action === 'messages') return go('messages');
  if (action === 'messagesBack') return go(backTarget());
  if (action.startsWith('device:') || action.startsWith('deviceCommit:')) {
    const [prefix, op, id] = action.split(':'); return deviceAction(op, +id, prefix === 'deviceCommit');
  }
  if (action.startsWith('deviceEraseAgain:')) return handle(`deviceAgain:erase:${action.split(':')[1]}`);
  if (action.startsWith('deviceAgain:')) {
    const [, op, id] = action.split(':'), d = S.devices.find(d => d.id === +id);
    if (!d || !['erase', 'retire'].includes(op)) return;
    if (op === 'erase' && (!d.current || S.screen !== 'other')) return toast('端末内データは対象端末の「その他」で削除します');
    if (op === 'erase' && selfEraseConditions(d).some(condition => !condition.met)) return toast('端末内データの削除条件が未達です');
    if (op === 'retire' && needsManagerReplacement(d)) return toast('利用可能な代替管理端末がありません');
    if (op === 'retire' && !['主担当', '代理管理者'].includes(S.role)) return toast('この操作は管理者が行います');
    return confirmAction('重大操作：最終確認（2/2）', `${esc(d.name)}の${op === 'erase' ? 'データ削除' : '廃止'}を実行します。${op === 'retire' ? '廃止後は利用できず、端末内データの削除は未確認として残ります。' : 'この操作は復元できません。'}`, `deviceCommit:${op}:${id}`, true);
  }
  if (action.startsWith('switchMockDevice:')) {
    const current = S.devices.find(d => d.current);
    const target = S.devices.find(d => d.id === +action.split(':')[1]);
    if (S.screen !== 'staff' || !['主担当', '代理管理者'].includes(S.role) || !current || !target || target.current || S.role !== current.role || current.accountId !== target.accountId || current.role !== target.role || target.approval !== 'approved' || target.stopped || target.retired || target.erased) return;
    S.devices.forEach(d => { d.current = d.id === target.id; });
    return go('other');
  }
  if (action === 'registerDevice') {
    if (!['主担当', '代理管理者'].includes(S.role)) return toast('この操作は管理者が行います');
    S.modal = null;
    S.devices.push({ id: Math.max(...S.devices.map(d => d.id)) + 1, name: `見本の申請端末 ${S.devices.length + 1}`, role: '一般受付担当者', accountId: `staff-${Math.max(...S.devices.map(d => d.id)) + 1}`, registration: 'staff', current: false, approval: 'pending', prepared: false, stopped: false, retired: false, erased: false, unsent: 0, isolated: 0, mockReceiptConfirmed: false, mockClosed: false });
    return render();
  }
  if (action === 'linkDevice') {
    if (S.role !== '主担当') return toast('主担当本人の端末で行います');
    return openModal('主担当本人の追加端末', '<ol><li>既存の承認済み主担当端末で関連付けを始めます。</li><li>新端末で同じ本人として再認証し、1回限りの照合情報を確認します。</li><li>関連付け後、新端末自身で準備を完了します。</li></ol><p>モックでは本人確認と端末間照合を行わず、主担当・承認済み・未準備の架空端末を追加します。</p>', [{ label: '関連付けを再現', action: 'linkDeviceDo', style: 'primary' }, { label: '閉じる', action: 'modalClose' }]);
  }
  if (action === 'linkDeviceDo') {
    if (S.role !== '主担当' || !S.devices.some(d => d.current && d.role === '主担当' && d.approval === 'approved' && !d.retired && !d.stopped && !d.erased)) return toast('承認済みの主担当端末から操作してください');
    S.modal = null;
    S.devices.push({ id: Math.max(...S.devices.map(d => d.id)) + 1, name: `主担当の追加端末 ${S.devices.length + 1}`, role: '主担当', accountId: S.devices.find(d => d.current).accountId, registration: 'linked', current: false, approval: 'approved', prepared: false, stopped: false, retired: false, erased: false, unsent: 0, isolated: 0, mockReceiptConfirmed: false, mockClosed: false });
    return render();
  }
  if (action === 'focusSeat') {
    const viewport = $('canvas'), tile = viewport?.querySelector(`[data-cell="${S.cell}"]`);
    if (!tile) return;
    const a = viewport.getBoundingClientRect(), b = tile.getBoundingClientRect();
    return viewport.scrollTo({ left: viewport.scrollLeft + b.left - a.left - (viewport.clientWidth - b.width) / 2, top: viewport.scrollTop + b.top - a.top - (viewport.clientHeight - b.height) / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  if (['stopDevice', 'stopDo', 'stoppedRecords', 'deleteNotice', 'approve', 'prepare'].includes(action)) return go('staff');
  if (action.startsWith('scan:')) {
    if (S.screen !== 'camera' || S.cameraResult || S.cameraWaiting || S.modal) return;
    S.result = action.split(':')[1]; S.cameraResult = true; S.cameraClosing = false;
    if (!S.online && S.result === 'success') {
      S.unsent++;
      const current = S.devices.find(d => d.current);
      if (current) { current.unsent++; current.mockReceiptConfirmed = false; }
    }
    return render();
  }
  if (action === 'next' && S.screen === 'camera') {
    if (!S.cameraResult || S.cameraClosing) return;
    S.cameraClosing = true; render();
    const generation = S.cameraGeneration;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    S.cameraTimer = setTimeout(() => {
      if (generation !== S.cameraGeneration || S.screen !== 'camera') return;
      S.cameraResult = false; S.cameraClosing = false; S.cameraWaiting = true; render();
      S.cameraTimer = setTimeout(() => {
        if (generation !== S.cameraGeneration || S.screen !== 'camera') return;
        S.cameraWaiting = false; render();
      }, 500);
    }, duration);
    return;
  }
  const value = baseHandle(action);
  if (action.startsWith('checkConfirm:') || action.startsWith('bulkDo:')) {
    for (const p of S.savedEditor.people) {
      const saved = S.savedPeople.find(q => q.id === p.id);
      if (saved) for (const key of Object.keys(checkLabels)) p[key] = saved[key];
    }
  }
  return value;
};

// セル選択はクリック、移動は一定距離以上のドラッグとして区別する。
let drag = null, suppressClick = false;
document.addEventListener('pointerdown', e => {
  const viewport = e.target.closest('.canvas-outer, [data-pan]');
  if (!viewport || e.button !== 0 || e.pointerType === 'touch') return;
  drag = { viewport, x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 6) drag.moved = true;
  if (drag.moved) { drag.viewport.scrollLeft = drag.left - dx; drag.viewport.scrollTop = drag.top - dy; e.preventDefault(); }
});
document.addEventListener('pointerup', () => { suppressClick = !!drag?.moved; drag = null; });
document.addEventListener('pointercancel', () => { drag = null; suppressClick = false; });
document.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; e.stopImmediatePropagation(); e.preventDefault(); return; }
  const tile = e.target.closest('[data-cell]');
  if (!tile) {
    const row = e.target.closest('[data-seat]');
    if (row) {
      const c = S.layout.cells.find(c => c.code === row.dataset.seat);
      if (c) { e.stopImmediatePropagation(); S.cell = c.id; S.cells = new Set([c.id]); syncAssignments(); render(); }
    }
    return;
  }
  e.stopImmediatePropagation();
  S.cell = tile.dataset.cell;
  const c = selectedCell();
  if (S.screen !== 'seats' || S.selectionMode === 'single') S.cells = new Set([c.id]);
  else if (S.selectionMode === 'multiple') S.cells.has(c.id) ? S.cells.delete(c.id) : S.cells.add(c.id);
  else if (!S.rangeStart) { S.rangeStart = c.id; S.cells = new Set([c.id]); }
  else {
    const start = S.layout.cells.find(c => c.id === S.rangeStart);
    S.cells = new Set(S.layout.cells.filter(x => x.row >= Math.min(start.row, c.row) && x.row <= Math.max(start.row, c.row) && x.col >= Math.min(start.col, c.col) && x.col <= Math.max(start.col, c.col)).map(x => x.id));
    S.rangeStart = null;
  }
  syncAssignments(); render();
}, true);
document.addEventListener('change', e => {
  if (e.target.id === 'grid-direction') { S.gridDraft.direction = e.target.value; S.gridPending = true; S.dirty = true; render(); }
  if (e.target.id === 'grid-order') { S.gridDraft.reverse = e.target.value === 'reverse'; S.gridPending = true; S.dirty = true; render(); }
  if (e.target.dataset.method) {
    const p = S.savedEditor.people.find(p => p.id === +e.target.dataset.method);
    if (p) p.method = e.target.value;
  }
  if (e.target.matches('[data-selection-mode]')) { S.selectionMode = e.target.value; S.rangeStart = null; S.cells = new Set([S.cell]); render(); }
  if (e.target.id === 'move-person') {
    S.movePerson = +e.target.value; S.placementMode = 'move';
    const name = $('selected-person-name'); if (name) name.textContent = S.people.find(p => p.id === S.movePerson)?.name || '対象なし';
  }
  if (e.target.matches('[data-unread]')) {
    e.stopImmediatePropagation(); S.notices.forEach((n, i) => { n.read = i >= +e.target.value; }); render();
  }
}, true);

document.addEventListener('toggle', e => {
  if (e.target.matches('[data-venue-image]')) S.imageOpen = e.target.open;
}, true);

document.addEventListener('keydown', e => {
  const tab = e.target.closest('[data-placement-tab]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const mode = e.key === 'Home' ? 'place' : e.key === 'End' ? 'move' : tab.dataset.placementTab === 'place' ? 'move' : 'place';
  handle(`placementTab:${mode}`);
});

document.addEventListener('input', e => {
  const target = e.target;
  if (target.id === 'grid-rows') S.gridDraft.rows = target.value;
  else if (target.id === 'grid-cols') S.gridDraft.cols = target.value;
  else if (target.dataset.columnName !== undefined) S.gridDraft.names[+target.dataset.columnName] = target.value;
  else if (target.dataset.columnStart !== undefined) S.gridDraft.starts[+target.dataset.columnStart] = target.value;
  else return;
  S.gridPending = true; S.dirty = true;
});

// 追加シナリオと保存済みの写しをそろえてから最初の画面を表示する。

render();
