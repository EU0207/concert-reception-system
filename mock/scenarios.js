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
    code: sample ? `A-${10 + i}` : ''
  }));
  return { rows: 5, cols: 8, direction: 'horizontal', reverse: false, sample, cells,
    names: Array.from({ length: 30 }, (_, i) => columnName(i)),
    starts: Array(30).fill(1), nextId: 40 };
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
S.devices = sampleDevices.map((d, i) => ({ ...d, approval: i === 2 ? 'pending' : 'approved', prepared: i === 0, stopped: false, retired: false, erased: false, unsent: i === 1 ? 1 : 0 }));
S.cameraResult = false;
S.cameraWaiting = false;
S.cameraTimer = null;
S.cameraGeneration = 0;
S.moveHistory = [];
S.placementMode = 'place';
S.imageOpen = false;
function resetGridDraft() {
  S.gridDraft = structuredClone({ rows: S.layout.rows, cols: S.layout.cols, direction: S.layout.direction, reverse: S.layout.reverse, names: S.layout.names, starts: S.layout.sample ? Array(30).fill(10) : S.layout.starts });
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
  if (layout.sample) return;
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
  if (affected.length) return openModal('配置を解除して変更しますか？', `<p>未発行のお客様の配置を解除します。</p><ul>${affected.map(p => `<li>${esc(p.name)}：${esc(p.seat)}</li>`).join('')}</ul>`, [
    { label: '配置を解除して変更', action: 'applyLayout', style: 'primary' }, { label: 'キャンセル', action: 'cancelLayout' }
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
  return c?.type === 'seat' ? S.people.some(p => p.seat && p.cellId === c.id) ? '配置済み' : '空席' : cellTypes[c?.type] || '未';
};

seatTiles = function () {
  const l = S.layout;
  return `<div class="seatmap editable-map" style="transform:scale(${S.zoom});grid-template-columns:90px repeat(${l.cols},74px);grid-template-rows:repeat(${l.rows},72px)"><div class="stage-label" style="grid-row:1/${l.rows + 1};grid-column:1">舞台</div>${l.cells.map(c => {
    const p = S.people.find(p => p.seat && p.cellId === c.id);
    return `<button class="seat cell-${c.type} ${S.cells.has(c.id) && S.screen === 'seats' || S.cell === c.id ? 'selected' : ''}" style="grid-column:${c.col + 2};grid-row:${c.row + 1}" data-cell="${c.id}" data-seat="${esc(c.code)}" aria-label="${esc(c.code || `${c.row + 1}行${c.col + 1}列`)} ${cellTypes[c.type]}"><strong>${esc(c.code || cellTypes[c.type])}</strong>${p ? seatDisplayName(p.label) : `<span>${cellTypes[c.type]}</span>`}</button>`;
  }).join('')}</div>`;
};

function venueImage() {
  return `<details data-venue-image ${S.imageOpen ? 'open' : ''}><summary>架空の会場画像</summary><div class="venue image-pan" data-pan><div class="image-content" style="width:${S.imageZoom * 100}%;height:${S.imageZoom * 100}%">${venueSvg()}</div></div><div class="row">${btn('画像 −', 'imageOut')}${btn('画像 ＋', 'imageIn')}${btn('前の画像', 'prevImage')}${btn('次の画像', 'nextImage')}<span>${S.imageIndex}/2</span></div></details>`;
}

seats = function () {
  const l = S.layout, d = S.gridDraft, groups = d.direction === 'horizontal' ? +d.rows : +d.cols;
  return page('会場席の編集', `<div class="stage ${S.panelBottom ? 'panel-bottom' : ''}"><section class="card stack settings-card"><div class="paneltop"><strong>席の設定</strong>${btn(S.panelCollapsed ? '開く' : '最小化', 'panelCollapse', 'textbtn')}</div>${S.panelCollapsed ? '' : `
    <div class="row">${btn('配置済みの例', 'scenario:sample', S.scenario === 'sample' ? 'primary' : '')}${btn('新規会場の例', 'scenario:new', S.scenario === 'new' ? 'primary' : '')}</div>
    <p class="small muted">ドラッグで移動。範囲選択は始点と終点を順にタップします。席・欠番だけが番号を消費します。</p>
    <div class="row"><label class="field">縦<input id="grid-rows" type="number" min="1" max="30" value="${esc(d.rows)}"></label><label class="field">横<input id="grid-cols" type="number" min="1" max="30" value="${esc(d.cols)}"></label></div>
    <div class="row numbering-settings"><label class="field">列の並び<select id="grid-direction"><option value="horizontal" ${d.direction === 'horizontal' ? 'selected' : ''}>横方向</option><option value="vertical" ${d.direction === 'vertical' ? 'selected' : ''}>縦方向</option></select></label><label class="field">席番の順序<select id="grid-order"><option value="forward" ${!d.reverse ? 'selected' : ''}>${d.direction === 'horizontal' ? '左から' : '上から'}</option><option value="reverse" ${d.reverse ? 'selected' : ''}>${d.direction === 'horizontal' ? '右から' : '下から'}</option></select></label></div>
    <details><summary>列名・開始番号（配置済みの例を変更すると全体を再採番）</summary><div class="column-settings">${Array.from({ length: Math.min(30, Math.max(0, groups)) }, (_, i) => `<label>${i + 1}列 <input data-column-name="${i}" value="${esc(d.names[i])}" aria-label="${i + 1}列の名前"><input data-column-start="${i}" type="number" min="1" value="${esc(d.starts[i])}" aria-label="${i + 1}列の開始番号"></label>`).join('')}</div></details>
    ${btn('設定を反映', 'gridSettings')}<div class="row">${btn('下書きを保存', 'saveDraft', 'primary draft-button')}${btn('編集内容を確定', 'confirmFinalize', 'primary')}${btn('保存状態に戻す', 'discardEditor')}</div>${btn(S.panelBottom ? 'パネルを上に' : 'パネルを下に', 'panelPosition')}`}</section>
    <div class="selection-strip"><div class="selection-details"><span>選択 <strong>${esc(selectedCell()?.code || '未採番セル')}</strong></span><span class="pill neutral">${selectedCellState()}</span><span>${S.cells.size}セル</span><select data-selection-mode aria-label="選択方法"><option value="single" ${S.selectionMode === 'single' ? 'selected' : ''}>個別</option><option value="multiple" ${S.selectionMode === 'multiple' ? 'selected' : ''}>複数</option><option value="range" ${S.selectionMode === 'range' ? 'selected' : ''}>範囲（始点→終点）</option></select>${S.rangeStart ? '<small>終点を選んでください</small>' : ''}</div><div class="seat-actions">${Object.entries(cellTypes).map(([key, text]) => btn(`${text}に`, `cellType:${key}`)).join('')}</div>${editStatus()}<div class="selection-image">${venueImage()}</div></div><div class="seat-workspace"><section class="card canvas-card"><h3>座席キャンバス</h3>${canvas()}</section></div></div>`, '空の会場と配置済みの会場で編集を試せます。');
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

const basePlacement = placement;
placement = function () {
  const assigned = S.people.filter(p => p.seat && !p.inactive);
  if (!assigned.some(p => p.id === S.movePerson)) S.movePerson = assigned[0]?.id;
  let html = basePlacement().replace('<h3>席未割当', `<details class="move-settings" ${S.placementMode === 'move' ? 'open' : ''}><summary>配置済みのお客様の席替え</summary><label class="field">席替えする方<select id="move-person">${assigned.map(p => `<option value="${p.id}" ${S.movePerson === p.id ? 'selected' : ''}>${esc(p.name)}（${esc(p.seat)}）</option>`).join('')}</select></label><p>移動先の席をキャンバスで選択してください。配置済みなら交換します。</p>${btn('移動・交換を確認', 'moveGuest')}</details><h3>席未割当`);
  if (S.placementMode === 'move') html = html.replace(/(<strong id="selected-person-name">)[\s\S]*?(<\/strong>)/, `$1${esc(assigned.find(p => p.id === S.movePerson)?.name || '対象なし')}$2`);
  return html;
};

function proposeMove() {
  const p = S.people.find(p => p.id === +$('move-person')?.value);
  const c = selectedCell();
  if (!p || p.inactive || !p.seat || c?.type !== 'seat') return toast('配置済みのお客様と席を選んでください');
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

staff = function () {
  if (S.role === '一般受付担当者') return other();
  return page('スタッフ・端末', `<div class="notice">架空の端末だけを操作します。役割と端末の状態は別に管理します。</div><div class="row device-registration-actions">${btn('新しい端末で登録を試す', 'registerDevice', 'primary')}${btn('主担当本人の追加端末', 'linkDevice')}</div><div class="stack">${S.devices.map(d => `<section class="card"><h3>${esc(d.name)} ${d.current ? '<span class="pill">この端末</span>' : ''}</h3><p>利用者の役割：${esc(d.role)}</p><p>承認：${d.approval === 'approved' ? '承認済み' : '承認待ち'} · 準備：${d.prepared ? '完了' : '未完了'} · 状態：${d.retired ? '廃止' : d.stopped ? '停止中' : d.approval !== 'approved' ? '承認待ち' : !d.prepared ? '未準備' : '利用可能'}</p><p>端末内データ：${d.erased ? '削除済み' : 'あり'} · 未送信 ${d.unsent}件</p><div class="row">${d.retired ? '' : `${d.approval === 'pending' ? btn('承認', `device:approve:${d.id}`) : !d.prepared ? btn('準備', `device:prepare:${d.id}`) : ''}${btn(d.stopped ? '停止解除' : '停止', `device:${d.stopped ? 'resume' : 'stop'}:${d.id}`)}${btn('廃止', `device:retire:${d.id}`)}`}${!d.current && !d.erased ? btn('端末内データ削除', `device:erase:${d.id}`, 'dangerbtn') : ''}</div></section>`).join('')}</div>`, '端末の承認・停止と、他端末のデータ削除を確認します。自身のデータ削除は「その他」へ進んでください。');
};
device = function () { return staff(); };
function other() {
  const d = S.devices.find(d => d.current);
  return page('その他', `<section class="card stack"><h3>この端末のデータ</h3><p>${esc(d?.name || '対象端末なし')} <span class="pill">この端末（ダミー）</span></p><p>端末内データ：${d?.erased ? '削除済み' : 'あり'} · 未送信 ${d?.unsent || 0}件</p><p class="small muted">この端末だけが対象です。未送信記録がある場合は削除できません。削除後は復元できないため、2回確認します。</p>${d && !d.erased ? btn('この端末のデータを削除', `device:erase:${d.id}`, 'dangerbtn') : ''}</section>`, '自身の端末内データを管理します。実データの削除は行いません。');
}
const baseNav = nav;
nav = function () {
  const html = baseNav();
  const link = S.role === '一般受付担当者' || html.includes('data-screen="staff"') ? '' : `<button data-screen="staff" class="${S.screen === 'staff' ? 'active' : ''}" ${S.screen === 'staff' ? 'aria-current="page"' : ''}>スタッフ・端末</button>`;
  return html.replace(/<button data-screen="device"[\s\S]*?<\/button>/, link).replace('</nav>', `<span class="group">端末設定</span><button data-screen="other" class="${S.screen === 'other' ? 'active' : ''}" ${S.screen === 'other' ? 'aria-current="page"' : ''}>その他</button></nav>`);
};
const baseVenue = venue;
venue = function () { return baseVenue().replace(/<details open>[\s\S]*?<\/details>/, venueImage()); };
management = function () {
  return page('当日管理', `<section class="card"><h3>端末の確認</h3><p>承認・停止・端末内データ削除は「スタッフ・端末」で行います。</p>${btn('スタッフ・端末へ', 'staff')}</section><section class="card"><h3>公演終了</h3>${btn('締め画面へ', 'close')}${btn('公演後の再ログイン表示', 'relogin')}</section>`, '端末操作と公演の締めを確認します。');
};

function deviceAction(op, id, confirmed = false) {
  const d = S.devices.find(d => d.id === id);
  if (!d) return;
  // 一般受付は自分の端末内データ削除だけを許可し、確認後も対象を再検証する。
  if (S.role === '一般受付担当者' && (op !== 'erase' || !d.current)) return toast('この操作は管理者が行います');
  if (op === 'erase' && d.unsent) return openModal('端末内データは削除できません', `<p>${esc(d.name)}には未送信記録が${d.unsent}件あります。送信確認前の削除を拒否します。</p>`, [{ label: '閉じる', action: 'modalClose' }]);
  if (!confirmed) return confirmAction(['erase', 'retire'].includes(op) ? `重大操作：${esc(d.name)}の${op === 'erase' ? '端末内データ削除' : '廃止'}（1/2）` : `${esc(d.name)}の${{ approve: '承認', prepare: '準備', stop: '停止', resume: '停止解除' }[op]}`, `${esc(d.name)}だけが対象です。${op === 'erase' ? '削除後は復元できません。' : op === 'retire' ? 'この端末の利用を終了します。再利用には新しい登録が必要です。' : '端末内データは削除しません。'}`, ['erase', 'retire'].includes(op) ? `deviceAgain:${op}:${id}` : `deviceCommit:${op}:${id}`, ['erase', 'retire'].includes(op));
  if (op === 'approve') d.approval = 'approved';
  if (op === 'prepare' && d.approval === 'approved' && !d.retired) { d.prepared = true; d.erased = false; }
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
    if (!p || p.inactive || p.seat || S.people.some(p => p.seat && p.cellId === S.cell)) return toast('未配置のお客様と空席を選んでください');
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
    if (!d || S.role === '一般受付担当者' && (op !== 'erase' || !d.current)) return toast('この操作は管理者が行います');
    return confirmAction('重大操作：最終確認（2/2）', `${esc(d.name)}の${op === 'erase' ? 'データ削除' : '廃止'}を実行します。この操作は復元できません。`, `deviceCommit:${op}:${id}`, true);
  }
  if (action === 'registerDevice') {
    if (S.role === '一般受付担当者') return toast('この操作は管理者が行います');
    S.modal = null;
    S.devices.push({ id: Math.max(...S.devices.map(d => d.id)) + 1, name: `見本の申請端末 ${S.devices.length + 1}`, role: '一般受付担当者', current: false, approval: 'pending', prepared: false, stopped: false, retired: false, erased: false, unsent: 0 });
    return render();
  }
  if (action === 'linkDevice' && S.role === '一般受付担当者') return toast('この操作は管理者が行います');
  if (action === 'linkDevice') return openModal('主担当本人の追加端末', '<ol><li>既存の承認済み端末で追加申請を確認します。</li><li>新端末に表示された照合コードを照合します。</li><li>関連付けを承認して、新端末を準備します。</li></ol><p>このモックでは申請端末を追加し、管理者の承認を体験します。</p>', [{ label: '申請端末を追加', action: 'registerDevice', style: 'primary' }, { label: '閉じる', action: 'modalClose' }]);
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
      if (current) current.unsent++;
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
  if (e.target.matches('.move-settings')) {
    S.placementMode = e.target.open ? 'move' : 'place';
    const id = e.target.open ? S.movePerson : S.personToPlace;
    const name = $('selected-person-name'); if (name) name.textContent = S.people.find(p => p.id === id)?.name || '対象なし';
  }
}, true);

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
