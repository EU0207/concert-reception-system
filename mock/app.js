// Issue #85: browser-only review mock. All values and actions are fictional and remain in memory.
const initialPeople = [{
  id: 1,
  name: '架空 太郎',
  label: '架空A',
  seat: 'C-5',
  note: '受付時に案内事項を確認する（架空の例）',
  method: '電子チケット',
  contact: true,
  inactive: false,
  payment: false,
  issued: true,
  delivered: false
}, {
  id: 2,
  name: '見本 花子',
  label: '見本B',
  seat: '',
  note: '',
  method: '未選択',
  contact: true,
  inactive: false,
  payment: true,
  issued: false,
  delivered: false
}, {
  id: 3,
  name: '例示 三郎',
  label: '例示C',
  seat: 'E-5',
  note: '',
  method: '紙チケット',
  contact: true,
  inactive: false,
  payment: true,
  issued: true,
  delivered: true
}, {
  id: 4,
  name: '架空 四郎',
  label: '架空D',
  seat: '',
  note: '',
  method: '電子チケット',
  contact: true,
  inactive: true,
  payment: false,
  issued: false,
  delivered: false
}, {
  id: 5,
  name: '見本 五郎',
  label: '見本E',
  seat: '',
  note: '',
  method: '電子チケット',
  contact: true,
  inactive: false,
  payment: false,
  issued: false,
  delivered: false
}, {
  id: 6,
  name: '例示 六花',
  label: '例示F',
  seat: '',
  note: '紙チケットの手渡し予定を確認する（架空の例）',
  method: '紙チケット',
  contact: false,
  inactive: false,
  payment: true,
  issued: false,
  delivered: false
}];

const sampleDevices = [
  { id: 1, name: '見本端末 01', role: '主担当', current: true },
  { id: 2, name: '見本端末 02', role: '代理管理者', current: false },
  { id: 3, name: '見本端末 03', role: '臨時管理者', current: false },
  { id: 4, name: '見本端末 04', role: '一般受付担当者', current: false }
];

// 画面の仮データと表示状態をここに集める。再読み込みすると初期値に戻る。
const S = {
  screen: 'home',
  history: [],
  drawerOpen: false,
  role: '主担当',
  online: true,
  unread: 3,
  unsent: 0,
  modal: null,
  toast: '',
  dirty: false,
  conflict: false,
  version: 12,
  draftVersion: 12,
  people: structuredClone(initialPeople),
  arrivedIds: new Set(),
  manualTarget: null,
  customCheckIds: ['contact'],
  nextCustomCheckId: 1,
  customChecksOpen: false,
  peoplePageSize: 50,
  peoplePage: 1,
  seat: 'C-5',
  personToPlace: 2,
  placementFilter: 'confirmed',
  zoom: 1,
  imageZoom: 1,
  imageIndex: 1,
  view: 'map',
  sort: 'seat',
  sortReverse: false,
  panelBottom: false,
  placementPanelBottom: false,
  panelCollapsed: false,
  camera: false,
  light: false,
  noticeOpen: false,
  result: 'success',
  prepared: false,
  invited: false,
  approved: false,
  showHistory: false,
  receivedAfterStop: false,
  stopped: false,
  deleted: false,
  selectedIds: new Set(),
  form: {
    title: '秋のコンサート 1日目',
    venue: '架空市民ホール',
    address: '架空県架空市1-2-3'
  },
  savedForm: null
};

S.savedForm = structuredClone(S.form);
S.savedPeople = structuredClone(S.people);
S.gapSeats = new Set();
S.spaceSeats = new Set();
S.savedGapSeats = new Set();
S.savedSpaceSeats = new Set(S.spaceSeats);

const screens = {
  home: '公演一覧',
  prep: '公演準備',
  info: '公演基本情報',
  people: 'お客様情報',
  seats: '会場席の編集',
  placement: 'お客様の席を設定',
  tickets: 'お客様対応状況',
  output: 'チケットデータ出力',
  staff: 'スタッフ・端末',
  device: '端末事前準備',
  other: 'その他',
  day: '当日受付',
  camera: 'QR受付',
  result: '受付結果',
  venue: '会場席管理',
  messages: 'スタッフ連絡',
  management: '当日管理',
  close: '公演終了・締め'
};

const editable = new Set(['info', 'people', 'seats', 'placement']);

const dayScreens = new Set(['day', 'camera', 'venue', 'messages', 'management', 'close']);

const $ = id => document.getElementById(id);

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);

const btn = (label, action, style = 'secondary', extra = '') => `<button class="${style}" data-action="${action}" ${extra}>${label}</button>`;

function toast(message) {
  S.toast = message;
  render();
  setTimeout(() => {
    if (S.toast === message) {
      S.toast = '';
      render();
    }
  }, 3600);
}

function header() {
  const day = dayScreens.has(S.screen);
  const back = day && S.screen !== 'day';
  return `<header class="top"><div class="top-left">` +
    `<button class="iconbtn menu-toggle" data-action="menuOpen" aria-label="メニューを開く" aria-controls="app-menu" aria-expanded="${S.drawerOpen}">☰</button>` +
    `${back ? `<button class="iconbtn" data-action="back" aria-label="前の画面へ戻る">←</button>` : ''}` +
    `<div class="identity"><strong>${esc(S.form.title)}</strong>2027/10/10 · ${esc(S.role)}</div></div>` +
    `<div class="top-right">${day && S.screen !== 'result' ? `<button class="iconbtn" data-action="messages" aria-label="スタッフ連絡、未読${S.unread}件">♧${S.unread ? `<span class="badge">${S.unread > 9 ? '9+' : S.unread}</span>` : ''}</button>` : ''}` +
    `<button class="iconbtn" data-action="connection" aria-label="通信状態を確認">${S.online ? '◉' : '⊘'}</button></div></header>`;
}

function nav() {
  const admin = ['主担当', '代理管理者'].includes(S.role);
  const groups = admin
    ? [['公演準備', ['home', 'prep', 'people', 'tickets', 'seats', 'placement', 'output']],
      ['当日・端末', ['staff', 'device', 'day', 'venue', 'management']]]
    : [['担当公演', ['home', 'device', 'day', 'venue', ...(S.role === '臨時管理者' ? ['management'] : [])]]];
  return `<aside class="side ${S.drawerOpen ? 'open' : ''}" id="app-menu" aria-label="画面メニュー">` +
    `<div class="side-heading"><div class="brand">受付システム <small>操作確認用 UIモック</small></div>` +
    `<button class="iconbtn menu-close" data-action="menuClose" aria-label="メニューを閉じる">×</button></div>` +
    `<nav>${groups.map(([g, ids]) => `<span class="group">${g}</span>${ids.map(id => `<button data-screen="${id}" class="${S.screen === id ? 'active' : ''}" ${S.screen === id ? 'aria-current="page"' : ''}>${screens[id]}</button>`).join('')}`).join('')}</nav></aside>`;
}

function backTarget() {
  return S.screen === 'camera' ? 'day' : S.history.at(-1) || 'day';
}

function breadcrumb() {
  if (!dayScreens.has(S.screen) || S.screen === 'day') return '';
  const target = backTarget();
  return `<nav class="breadcrumbs" aria-label="現在位置"><button data-action="back">${esc(screens[target])}</button><span aria-hidden="true">›</span><span aria-current="page">${esc(screens[S.screen])}</span></nav>`;
}

function page(title, body, subtitle = '', actions = '') {
  return `<div class="pagehead"><div><div class="eyebrow">${esc(S.screen.toUpperCase())} · 操作確認用</div><h1>${title}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div><div class="row">${actions}</div></div>${body}`;
}

function status() {
  return `<div class="row" id="state-status"><span class="pill ${S.online ? '' : 'warn'}">${S.online ? '◉ オンライン' : '⊘ オフライン'}</span><span class="pill neutral">未送信 ${S.unsent}件</span>${S.dirty ? '<span class="pill warn">未保存</span>' : ''}${S.conflict ? '<span class="pill danger">版競合</span>' : ''}</div>`;
}

function editStatus() {
  if (!S.dirty && !S.conflict) return '';
  return `<div class="row">${S.dirty ? '<span class="pill warn">未保存</span>' : ''}${S.conflict ? '<span class="pill danger">版競合</span>' : ''}</div>`;
}

function selectedCellState() {
  if (S.spaceSeats.has(S.seat)) return '空間';
  if (S.gapSeats.has(S.seat)) return '欠番';
  return S.people.some(p => p.seat === S.seat) ? '席設定済み' : '空席';
}

function home() {
  let admin = ['主担当', '代理管理者'].includes(S.role);
  const currentShow = `<section class="card"><div class="eyebrow">現在の公演</div><h2>${esc(S.form.title)}</h2>` +
    `<p>2027年10月10日 · ${esc(S.form.venue)}</p>${status()}` +
    `<p style="margin-top:18px">${btn(admin ? '現在の公演を開く' : '担当公演を開く', admin ? 'prep' : 'day', 'primary')}</p></section>`;
  const nextShow = `<section class="card"><div class="eyebrow">切替候補</div><h2>秋のコンサート 2日目</h2>` +
    `<p>2027年10月11日 · 架空市民ホール</p><span class="pill neutral">未送信 0件</span>` +
    `<p style="margin-top:18px">${btn('内容を確認して切り替える', 'switchShow')}</p></section>`;
  const demoControls = `<div class="card stack" style="margin-top:16px"><h3>操作確認用の条件</h3><div class="row">` +
    `<label class="field">操作する役割・端末<select data-role>${S.devices.map(d => `<option value="${d.id}" ${d.current ? 'selected' : ''}>${esc(d.role)}（${esc(d.name)}）</option>`).join('')}</select></label>` +
    `<label class="field">未読連絡数<select data-unread>${[0, 3, 9, 10].map(n => `<option ${S.unread === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` +
    `${btn(S.online ? 'オフラインにする' : 'オンラインにする', 'toggleOnline')}</div>` +
    `<p class="small muted">選んだ見本端末を「この端末」として表示し、その役割で画面を確認します。認証・同期は実行しません。</p></div>`;
  return page('公演一覧', `<div class="grid two">${currentShow}${nextShow}</div>${demoControls}` +
    '<div class="notice" style="margin-top:17px">このモックの操作はブラウザー内だけで再現されます。再読み込みで初期状態に戻ります。</div>',
  '公演単位の切替と、現在公演の区別を確認します。');
}

function prep() {
  let items = [['1 公演情報と会場', 'info', '公演名・会場情報を入力'], ['2 お客様情報', 'people', '架空名簿を確認'], ['3 会場席', 'seats', '席と空間を編集'], ['4 座席設定', 'placement', '席未設定のお客様に席を割り当てる'], ['5 お客様対応状況', 'tickets', '入金・券発行・送付と確認項目を管理'], ['6 チケットデータ出力', 'output', '電子チケットPDFと紙チケット用Excelを試す'], ['7 スタッフ・端末', 'staff', '招待・準備を確認']];
  return page('公演準備', `<div class="grid">${items.map(([n, id, d]) => `<section class="card action"><div class="eyebrow">準備手順</div><h3>${n}</h3><p>${d}</p>${btn('開く', id, 'secondary')}</section>`).join('')}</div><div class="card" style="margin-top:16px"><h3>当日の開始</h3><p>公演状態：<strong>${S.started ? '当日運用中' : '準備中'}</strong>。開催時刻だけでは受付を開始しません。</p>${btn(S.started ? '受付を停止して準備に戻す' : '受付を開始', 'toggleStart', 'primary')} ${btn('スタッフ連絡を見る', 'messages')}</div>`, '準備の順番と各画面への導線を確認します。');
}

function info() {
  return page('公演基本情報', `<div class="card stack"><div class="formgrid">` +
    `<label class="field">公演名<input data-form="title" value="${esc(S.form.title)}"></label>` +
    '<label class="field">開催日時<input value="2027-10-10 18:00" readonly></label>' +
    `<label class="field">会場名<input data-form="venue" value="${esc(S.form.venue)}"></label>` +
    `<label class="field">住所<input data-form="address" value="${esc(S.form.address)}">` +
    `<small>会場の所在地です。お客様の住所ではありません。</small></label></div>${status()}` +
    `<div class="row">${btn('保存', 'save', 'primary')}${btn('公演準備へ戻る', 'prep')}</div></div>`,
  '編集内容は明示的に保存します。');
}

function people() {
  const pageCount = Math.max(1, Math.ceil(S.people.length / S.peoplePageSize));
  const currentPage = Math.min(S.peoplePage, pageCount);
  S.peoplePage = currentPage;
  const start = (currentPage - 1) * S.peoplePageSize;
  const rows = S.people.slice(start, start + S.peoplePageSize);
  const rowHtml = rows.map((p, index) => {
    const name = esc(p.name);
    return `<tr class="${p.inactive ? 'inactive-row' : ''}"><th scope="row" class="row-number">${start + index + 1}</th>` +
      `<td><button class="buyer-name" data-action="showBuyer:${p.id}" title="この行の情報を表示" aria-label="購入者名 ${name} の行の詳細を表示">${name}</button>` +
      `${p.inactive ? '<span class="pill neutral">不参加</span>' : ''}</td>` +
      `<td><input class="seat-label-input" aria-label="${name}の座席表示名" data-label="${p.id}" value="${esc(p.label)}" maxlength="6"></td>` +
      `<td>${p.seat ? esc(p.seat) : '<span class="pill warn">席未設定</span>'}</td>` +
      `<td><button class="textbtn" data-action="editNote:${p.id}" aria-label="${name}の案内を編集">${p.note ? '要確認・編集' : '追加'}</button></td></tr>`;
  }).join('');

  return page('お客様情報', `
    <div class="card stack people-card">
      <div class="notice">初回取込では席番号が空欄でも登録できます。席未設定の方にはチケットとQRを発行できません。購入者名は名前を押して修正できます。不参加にすると席設定と発行・送付の表示を解除します（モックのみ）。</div>
      <details>
        <summary>大量の名簿を試す（モック専用）</summary>
        <p class="small muted">架空の行を加えて500件にします。再読み込みで元に戻ります。</p>
        ${btn('500件の表示を試す', 'sample500', 'secondary', S.people.length >= 500 ? 'disabled' : '')}
      </details>
      <div class="people-toolbar">
        <div class="row people-pages">
          <label>表示件数 <select data-people-size><option value="50" ${S.peoplePageSize === 50 ? 'selected' : ''}>50件</option><option value="100" ${S.peoplePageSize === 100 ? 'selected' : ''}>100件</option></select></label>
          <span>${S.people.length ? start + 1 : 0}～${start + rows.length} / ${S.people.length}件</span>
          <div class="row people-page-controls">
            ${btn('前へ', 'peoplePrev', 'secondary', currentPage === 1 ? 'disabled' : '')}
            <span>${currentPage} / ${pageCount}ページ</span>
            ${btn('次へ', 'peopleNext', 'secondary', currentPage === pageCount ? 'disabled' : '')}
          </div>
        </div>
        <div class="row">${btn('保存', 'save', 'primary')}${btn('お客様の席を設定', 'placement')}${btn('お客様対応状況', 'tickets')}<div id="state-status">${editStatus()}</div></div>
      </div>
      <div class="people-table-viewport" data-page="${currentPage}" data-page-size="${S.peoplePageSize}" role="region" aria-label="お客様一覧。横方向にもスクロールできます" tabindex="0">
        <table class="table people-table">
          <colgroup><col class="number-col"><col class="buyer-col"><col class="label-col"><col class="seat-col"><col class="note-col"></colgroup>
          <thead><tr><th scope="col">番号</th><th scope="col">購入者名</th><th scope="col">座席表示名</th><th scope="col">席番号</th><th scope="col">案内</th></tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
      <small class="muted">表は左右にスクロールできます。</small>
    </div>`, '購入者名と座席表示名を分けて確認します。', ['主担当', '代理管理者'].includes(S.role) ? btn('お客様を追加', 'addPerson', 'primary') : '');
}

function seatDisplayName(label) {
  const characters = Array.from(label);
  return `<span class="seat-name"><span>${esc(characters.slice(0, 3).join(''))}</span>${characters.length > 3 ? `<span>${esc(characters.slice(3).join(''))}</span>` : ''}</span>`;
}

function isArrived(person) {
  return !!person && S.arrivedIds.has(person.id);
}

function seatTiles() {
  let tiles = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      let n = 10 + r * 8 + c,
        key = `A-${n}`;
      let selected = S.seat === key;
      let cellType = S.spaceSeats.has(key) ? '空間' : S.gapSeats.has(key) ? '欠番' : '';
      if (cellType) {
        tiles.push(S.screen === 'seats' ? `<button class="gapcell ${selected ? 'selected' : ''}" data-seat="${esc(key)}" aria-label="${cellType}セル ${esc(key)}">${cellType}</button>` : `<div class="gapcell">${cellType}</div>`);
        continue;
      }
      let p = S.people.find(x => x.seat === key);
      tiles.push(`<button class="seat ${selected ? 'selected' : ''} ${p ? '' : 'empty'} ${isArrived(p) ? 'arrived' : ''}" data-seat="${esc(key)}" aria-label="席 ${esc(key)}${p ? ', ' + esc(p.label) : ''}${isArrived(p) ? '、来場済み' : ''}"><strong>${esc(key)}</strong>${p ? seatDisplayName(p.label) : '<span>空席</span>'}${isArrived(p) ? '<span>✓ 来場済み</span>' : ''}</button>`);
    }
  }
  return `<div class="seatmap" style="transform:scale(${S.zoom})"><div class="stage-label">舞台</div>${tiles.join('')}</div>`;
}

function canvas() {
  return `${S.screen === 'venue' ? '<div class="seatmap-legend"><span class="arrival-swatch" aria-hidden="true">✓</span>来場済み</div>' : ''}<div class="canvas-outer" id="canvas" data-canvas-screen="${S.screen}"><div class="seatmap-extent">${seatTiles()}</div></div><div class="row" style="margin-top:9px">${btn('－', 'zoomOut')}${btn('＋', 'zoomIn')}${btn('標準倍率で左上へ', 'resetCanvas')}${btn('選択席へ戻る', 'focusSeat')}</div>`;
}

function seats() {
  const settings = `<section class="card stack settings-card"><div class="paneltop"><strong>席の設定</strong>` +
    `${btn(S.panelCollapsed ? '開く' : '最小化', 'panelCollapse', 'textbtn')}</div>` +
    `${S.panelCollapsed ? '' : `<label class="field">区画<select><option>1階 A列</option></select></label>` +
      `<div class="row">${btn('下書きを保存', 'saveDraft', 'primary')}${btn('編集内容を確定', 'confirmFinalize')}</div>` +
      `<details><summary>保存エラーを試す（モック専用）</summary><p class="small muted">他の人が先に保存した状態を作ります。その後「下書きを保存」を押すと、保存できない場合の案内を確認できます。実際の共有先は変更しません。</p>` +
      `${btn('他の人が先に保存した状態にする', 'simulateConflict')}</details>` +
      `<div class="small muted">スマートフォンでは設定パネルの位置を比較できます。</div>` +
      `${btn(S.panelBottom ? 'パネルを上に' : 'パネルを下に', 'panelPosition')}`}</section>`;
  const selection = `<div class="selection-strip"><div class="selection-details">` +
    `<span>選択 <strong>${esc(S.seat)}</strong></span><span class="pill neutral">${selectedCellState()}</span></div>` +
    `<div class="seat-actions">${btn('席に', 'makeSeat')}${btn('欠番に', 'makeGap')}${btn('空間に', 'makeSpace')}</div>${editStatus()}</div>`;
  return page('会場席の編集', `<div class="stage ${S.panelBottom ? 'panel-bottom' : ''}>${settings}${selection}` +
    `<section class="card canvas-card"><h3>座席キャンバス</h3>${canvas()}</section></div>`,
  'キャンバスを縦横に動かし、席を選択してください。');
}

function placement() {
  const unplaced = S.people.filter(p => !p.seat && !p.inactive);
  const candidates = unplaced.filter(p => S.placementFilter === 'all' || p.payment === (S.placementFilter === 'confirmed'));
  const selectedPerson = candidates.find(p => p.id === S.personToPlace) || candidates[0];

  const target = selectedPerson
    ? `<label class="field">席を設定するお客様<select id="person-to-place">` +
      `${candidates.map(p => `<option value="${p.id}" ${p.id === selectedPerson.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}` +
      `</select></label><p>空席を選び「この席に設定」を押します。</p>${btn('この席に設定', 'place', 'primary')}`
    : '<p>この条件に合う席未設定の方はいません。</p>';
  const settings = `<section class="card stack settings-card"><h3>席未設定 ${unplaced.length}件</h3>` +
    `<label class="field">表示する対象<select data-placement-filter>` +
    `<option value="confirmed" ${S.placementFilter === 'confirmed' ? 'selected' : ''}>入金確認済み</option>` +
    `<option value="unconfirmed" ${S.placementFilter === 'unconfirmed' ? 'selected' : ''}>入金未確認</option>` +
    `<option value="all" ${S.placementFilter === 'all' ? 'selected' : ''}>来場予定の席未設定全員</option>` +
    `</select></label><p class="small muted">表示中 ${candidates.length}件。不参加の方は候補から除外します。</p>` +
    `${target}<div class="row">${btn('下書きを保存', 'saveDraft')}${btn('席設定を確定', 'confirmFinalize', 'primary')}</div>` +
    `<div class="small muted">スマートフォンでは設定パネルの位置を比較できます。</div>` +
    `${btn(S.placementPanelBottom ? 'パネルを上に' : 'パネルを下に', 'panelPosition')}</section>`;
  const selection = `<div class="selection-strip"><span>選択中の席 <strong>${esc(S.seat)}</strong></span>` +
    `<span>お客様 <strong id="selected-person-name">${selectedPerson ? esc(selectedPerson.name) : '対象なし'}</strong></span>${editStatus()}</div>`;
  return page('お客様の席を設定', `<div class="stage ${S.placementPanelBottom ? 'panel-bottom' : ''}">` +
    `${settings}${selection}<section class="card canvas-card"><h3>座席キャンバス</h3>${canvas()}</section></div>`,
  '席未設定のお客様から発券までの操作を確認します。');
}

const checkLabels = {
  contact: '連絡済み',
  payment: '入金済み',
  issued: '券発行済み',
  delivered: '券送付済み'
};

const systemCheckIds = new Set(['payment', 'issued', 'delivered']);

function tickets() {
  const checks = Object.entries(checkLabels);
  const rows = S.people.filter(p => !p.inactive);
  if (S.sort === 'seat') rows.sort((x, y) => (x.seat || 'ZZ').localeCompare(y.seat || 'ZZ'));
  else rows.sort((x, y) => Number(x[S.sort]) - Number(y[S.sort]) || (x.seat || 'ZZ').localeCompare(y.seat || 'ZZ'));
  if (S.sortReverse) rows.reverse();

  const headers = checks.map(([key, label]) => `<th scope="col" class="${systemCheckIds.has(key) ? 'system-check-head' : ''}">${esc(label)}${systemCheckIds.has(key) ? '<small>固定</small>' : ''}</th>`).join('');
  const rowHtml = rows.map(p => `<tr>
    <td><label class="ticket-row-select"><input type="checkbox" data-select="${p.id}" ${S.selectedIds.has(p.id) ? 'checked' : ''} aria-label="${esc(p.name)}を選択"></label></td>
    <td><button class="buyer-name" data-action="showTicketPerson:${p.id}" aria-label="${esc(p.name)}の対応状況と案内情報を表示">${esc(p.name)}</button>${p.note ? '<span class="pill warn">要確認</span>' : ''}</td>
    <td>${p.seat ? esc(p.seat) : '<span class="pill warn">席未設定</span>'}</td>
    <td><select data-method="${p.id}">${['未選択', '電子チケット', '紙チケット'].map(m => `<option ${p.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></td>
    ${checks.map(([key, label]) => `<td><button class="${p[key] ? 'pill' : 'secondary'} ${systemCheckIds.has(key) ? 'system-check-button' : ''}" data-check="${p.id}:${key}" aria-label="${esc(p.name)}の${esc(label)}を${p[key] ? '未済み' : '済み'}にする">${p[key] ? '✓ 済' : '□ 未'}</button></td>`).join('')}
    <td>${p.note ? `<button class="textbtn" data-action="showTicketPerson:${p.id}">要確認</button>` : '－'}</td>
  </tr>`).join('');
  const customItems = S.customCheckIds.map(id => `<div class="row"><strong>${esc(checkLabels[id])}</strong>${btn('名前を変更', `renameCustom:${id}`)}${btn('削除', `removeCustom:${id}`)}</div>`).join('');

  return page('お客様対応状況', `<div class="card stack">
    <div class="notice">不参加の方はこの一覧から除外します。チェック項目は追加・変更・削除できます。ただし、緑色の「固定」項目は変更・削除ができません。チェック操作で決済・発送・送信は行いません。</div>
    <details class="custom-checks" ${S.customChecksOpen ? 'open' : ''}><summary>確認用チェック項目を管理</summary>
      <p class="small muted">確認用項目はシステムの判定に使いません。</p>
      <div class="row"><input id="custom-check-name" aria-label="追加する確認用項目名" placeholder="例：連絡済み" maxlength="20">${btn('項目を追加', 'addCustomCheck', 'primary')}</div>
      ${customItems || '<p class="small muted">確認用項目はありません。</p>'}
    </details>
    <div class="row"><label class="field">並べ替え<select data-sort><option value="seat" ${S.sort === 'seat' ? 'selected' : ''}>席番号</option>${checks.map(([key, label]) => `<option value="${key}" ${S.sort === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>${btn(S.sortReverse ? '降順' : '昇順', 'sortReverse')}</div>
    <div class="tablewrap"><table class="table"><thead><tr><th>選択</th><th>購入者名</th><th>席</th><th>交付方法</th>${headers}<th>案内</th></tr></thead><tbody>${rowHtml}</tbody></table></div>
    <div class="row">選択 ${rows.filter(p => S.selectedIds.has(p.id)).length}件 <select id="bulk-field">${checks.map(([key, label]) => `<option value="${key}">${esc(label)}</option>`).join('')}</select>${btn('選択行をチェック', 'bulk', 'primary')}</div>
  </div>`, '未入金のまま発行・送付した状態も確認できます。');
}

function outputPeople(method) {
  return S.people.filter(person => !person.inactive && person.seat && person.method === method)
    .sort((a, b) => a.seat.localeCompare(b.seat, undefined, { numeric: true }));
}

function output() {
  if (!['主担当', '代理管理者'].includes(S.role)) return page('チケットデータ出力', '<div class="notice warn">出力は主担当・代理管理者の操作です。</div>');
  const electronic = outputPeople('電子チケット');
  const paper = outputPeople('紙チケット');
  const waiting = S.people.filter(person => !person.inactive && person.method !== '未選択' && !person.seat);
  const unselected = S.people.filter(person => !person.inactive && person.method === '未選択').length;
  const inactive = S.people.filter(person => person.inactive).length;
  const electronicRows = electronic.map(person => `<div class="output-person"><div><strong>${esc(person.name)}</strong><div class="row"><span class="pill neutral">${esc(person.seat)}</span><span class="small muted">${person.issued ? '券発行済み' : '券未発行'}</span></div></div>${btn('PDFを1枚出力', `previewPdf:${person.id}`, 'primary')}</div>`).join('');
  const paperRows = paper.map(person => `<tr><td>${esc(person.seat)}</td><td>QR画像の位置</td><td>${esc(person.name)}</td><td>${person.issued ? '券発行済み' : '券未発行'}</td></tr>`).join('');

  return page('チケットデータ出力', `<div class="notice">架空データによる出力操作の見本です。PDF・Excelの実ファイルは作成しません。出力を試しても「券発行済み」や「券送付済み」のチェックは変わりません。</div>
    <div class="grid two output-grid">
      <section class="card stack"><div class="eyebrow">電子チケット</div><h2>個別PDF</h2><p class="muted">電子チケットを選んだお客様ごとに1枚ずつ出力します。</p>
        <div class="output-people">${electronicRows || '<p>対象はありません</p>'}</div>
      </section>
      <section class="card stack"><div class="eyebrow">紙チケット</div><h2>印刷業者向けExcel</h2><p class="muted">紙チケットを選んだお客様を席番号順の一覧にまとめます。QR画像は本番のExcelで席番の隣に配置します。</p>
        <div class="tablewrap"><table class="table"><thead><tr><th scope="col">席番号</th><th scope="col">QR画像</th><th scope="col">購入者名</th><th scope="col">対応状況</th></tr></thead><tbody>${paperRows || '<tr><td colspan="4">対象はありません</td></tr>'}</tbody></table></div>
        <div class="row"><span>${paper.length}件</span>${btn('Excel一覧を出力', 'previewPaperExcel', 'primary', paper.length ? '' : 'disabled')}</div>
      </section>
    </div>
    <div class="card stack" style="margin-top:16px"><h3>出力対象外</h3><div class="row"><span class="pill warn">交付方法選択済み・席未設定 ${waiting.length}件</span><span class="pill neutral">交付方法未選択 ${unselected}件</span><span class="pill neutral">不参加 ${inactive}件</span></div><p>席未設定の方は、席を設定すると交付方法に応じた一覧へ表示されます。</p><div class="row">${btn('お客様対応状況を確認', 'tickets')}${btn('お客様の席を設定', 'placement')}</div></div>`, '交付方法と現在の席設定を確認してから出力します。');
}

function staff() {
  const deviceCards = sampleDevices.map(device => {
    const state = device.current ? `${S.approved ? '承認済み' : '承認待ち'}・${S.prepared ? '準備完了' : '未準備'}` : device.id === 2 ? (S.stopped ? '停止中・未同期あり' : '承認済み・稼働中') : '承認済み・差分更新待ち';
    return `<section class="card stack"><div class="row"><h3>${device.name}</h3>${device.current ? '<span class="pill">この端末（ダミー）</span>' : ''}</div><p>利用者の役割：${device.role}</p><span class="pill ${device.id === 2 && S.stopped ? 'danger' : 'neutral'}">${state}</span>${device.current ? btn('端末を承認', 'approve', 'primary', S.approved ? 'disabled' : '') : device.id === 2 ? btn('停止・記録を確認', 'management') : '<p class="small muted">公演データの更新後、差分取得が必要な端末の例です。</p>'}</section>`;
  }).join('');

  return page('スタッフ・端末', `<section class="card stack"><h3>スタッフ招待</h3>` +
    `<p>架空の招待先：staff@example.com</p><span class="pill ${S.invited ? '' : 'warn'}">${S.invited ? '招待済み' : '未招待'}</span>` +
    `${btn('招待を作成', 'invite', 'primary')}</section>` +
    `<h3 style="margin-top:16px">端末一覧（ダミー${S.devices.length}台）</h3><div class="grid">${deviceCards}</div>` +
    '<div class="card" style="margin-top:16px"><h3>この端末の事前準備</h3><p>本人・役割・端末、アプリ・データ、カメラ・練習、オフライン準備を確認します。</p>' +
    `${btn('端末事前準備へ', 'device', 'primary')}</div>`,
  '招待、端末承認、準備を順に確認します。端末識別はすべて架空です。');
}

function device() {
  let steps = [['本人・役割・端末', S.invited && S.approved], ['アプリ・データ', S.prepared], ['カメラ・練習', S.prepared], ['オフライン準備', S.prepared]];
  return page('端末事前準備', `<div class="card stack"><div class="notice ${S.prepared ? '' : 'warn'}">${S.prepared ? '準備完了 · データ版 ' + S.version + ' · オフライン利用期限 2027/10/11' : '事前準備が完了していません。通信可能な場所で実行してください。'}</div>${steps.map(([n, ok]) => `<div class="row between"><strong>${n}</strong><span class="pill ${ok ? '' : 'warn'}">${ok ? '✓ 完了' : '未完了'}</span></div>`).join('')}<div class="row">${btn('事前準備を開始', 'prepare', 'primary')}${btn('架空データで練習', 'practice')}</div></div>`, '確認項目ごとの結果を表示します。');
}

function day() {
  return page('当日受付', `<div class="grid"><section class="card action"><h3>QR受付</h3>` +
    `<p>読取り後は結果を全面表示し、「次へ」まで追加読取りを止めます。</p>${btn('カメラを開く', 'camera', 'primary')}</section>` +
    `<section class="card action"><h3>会場席</h3><p>役割によって閲覧と管理操作を分けます。</p>${btn('会場席を見る', 'venue')}</section>` +
    `<section class="card action"><h3>例外・連絡</h3><p>未読連絡と確認が必要な記録を確認します。</p>${btn('スタッフ連絡を見る', 'messages')}</section></div>` +
    `<div class="card" style="margin-top:16px">${status()}<p style="margin-top:12px">${S.started ? '当日運用中' : '準備中：本番受付の開始前です。操作確認用の架空QRは試せます。'}</p>` +
    `${S.role !== '一般受付担当者' ? btn('当日管理へ', 'management') : ''}</div>`,
  '画面上の受付操作は架空データによる模擬動作です。');
}

function camera() {
  const scanButtons = ['success', 'duplicate', 'invalid', 'special', 'failure']
    .map((v, i) => btn(['初回受付', '受付済み', '受付不可', '要確認', '保存失敗'][i], `scan:${v}`))
    .join('');
  return page('QR受付', `<div class="camera"><div class="camera-inner"><h2>QRを枠内へ</h2>` +
    `<p>${S.noticeOpen ? '連絡を表示中：読取り停止' : '架空QRの判定を選んで試してください'}</p></div></div>` +
    `<div class="camera-actions">${btn(S.light ? 'ライトを消す' : 'ライトを点ける', 'light')}${scanButtons}</div>` +
    '<p class="small muted" style="margin-top:14px">実カメラは起動しません。ライト表示は対応端末を想定した操作見本です。</p>',
  '追加読取りの停止、連絡表示、戻る操作を確認します。');
}

function result() {
  let data = {
    success: ['✓', '受付しました', '1階 C列 C-5', ''],
    duplicate: ['!', 'すでに受付されています', '初回受付 18:02', '受付理由を確認してください'],
    invalid: ['×', '受付できません', 'この公演のチケットではありません', '管理者へ確認してください'],
    special: ['!', '確認が必要です', '特別案内：受付で確認', '対応済みにしてください'],
    failure: ['×', '受付は記録されていません', '再試行するか、紙受付へ切り替えてください', '']
  };
  let d = data[S.result];
  return `<div class="result ${['invalid', 'failure'].includes(S.result) ? 'danger' : ''}"><div><div class="result-symbol">${d[0]}</div><h2>${d[1]}</h2><p>${d[2]}</p><p>${d[3]}</p>${S.result === 'duplicate' ? btn('理由を選ぶ', 'reason') : ''} ${S.result === 'invalid' ? btn('例外を仮登録', 'exception') : ''}<p>${btn('次へ', 'next', 'primary')}</p></div></div>`;
}

function venueSvg() {
  return `<svg viewBox="0 0 900 270" role="img" aria-label="架空の会場画像。左に舞台、右に客席"><rect width="900" height="270" fill="#f2eddf"/><rect x="20" y="35" width="110" height="200" rx="15" fill="#326560"/><text x="75" y="145" text-anchor="middle" fill="white" font-size="26">舞台</text><path d="M150 40h710M150 95h710M150 150h710M150 205h710" stroke="#b3ae98" stroke-width="3"/>${Array.from({
    length: 5
  }, (_, r) => Array.from({
    length: 11
  }, (_, c) => `<rect x="${170 + c * 59}" y="${49 + r * 48}" width="40" height="29" rx="5" fill="#9bc4b0"/>`).join('')).join('')}</svg>`;
}

function venue() {
  const guests = S.people.filter(p => p.seat && !p.inactive);
  const arrivedCount = guests.filter(isArrived).length;
  const p = guests.find(p => p.seat === S.seat);
  const admin = S.role !== '一般受付担当者';
  const list = guests.map(guest => `<tr><td><button data-seat="${esc(guest.seat)}" class="textbtn">${esc(guest.seat)}</button></td><td>${esc(guest.label)}</td><td>${isArrived(guest) ? '来場済み' : '未受付'}</td></tr>`).join('');
  return page('会場席管理', `<div class="card stack">
    <div class="row between"><strong>未受付 ${guests.length - arrivedCount} / 来場済み ${arrivedCount}</strong><div class="row">${btn('座席表', 'mapView', S.view === 'map' ? 'primary' : 'secondary')}${btn('一覧', 'listView', S.view === 'list' ? 'primary' : 'secondary')}</div></div>
    <details open><summary>会場画像を表示／隠す</summary><div class="venue"><div style="width:100%;height:100%;transform:scale(${S.imageZoom})">${venueSvg()}</div></div><div class="venue-controls">${btn('前の画像', 'prevImage')}${btn('次の画像', 'nextImage')}<span>${S.imageIndex}/2</span>${btn('縮小', 'imageOut')}${btn('拡大', 'imageIn')}</div><small>図解用の架空画像。実画像の取得は行いません。</small></details>
    ${S.view === 'map' ? canvas() : `<div class="tablewrap"><table class="table"><thead><tr><th>席番号</th><th>座席表示名</th><th>状態</th></tr></thead><tbody>${list}</tbody></table></div>`}
    <div class="preview"><strong>選択中：${esc(S.seat)}</strong><p>状態：${p ? isArrived(p) ? '来場済み' : '未受付' : '席未設定'} · 座席表示名：${p ? esc(p.label) : '－'}</p>${admin ? `<p>購入者名：${p ? esc(p.name) : '－'}</p><div class="row">${btn('座席表示名を変更', 'changeLabel', 'secondary', p ? '' : 'disabled')}${btn(p && isArrived(p) ? '未受付へ訂正' : '手動受付', 'manual', 'primary', p ? '' : 'disabled')}</div>${p ? '' : '<p class="small muted">お客様が設定されていない席は受付できません。</p>'}` : ''}</div>
  </div>`, '一般受付担当者では直接編集操作と購入者名を表示しません。');
}

function messages() {
  return page('スタッフ連絡', `<div class="card stack"><div class="notice ${S.online ? '' : 'warn'}">${S.online ? '取得済みのスタッフ連絡を表示しています。' : 'オフライン中は新しい連絡を受信できない場合があります。'}</div><div class="preview"><strong>重要 · 集合場所の確認</strong><p>架空の運営連絡です。受付担当者は開始前に内容を確認してください。</p></div><div class="preview"><strong>通常 · 座席案内</strong><p>案内板は会場入口の右側にあります。</p></div>${btn('確認して戻る', 'messagesBack', 'primary')}</div>`, '準備画面からも連絡へ進めます。');
}

function management() {
  return page('当日管理', '<div class="grid two"><section class="card stack"><h3>紛失端末・例外締め</h3><p>端末：見本端末 02 · 最終同期 18:10</p>' +
    `<span class="pill ${S.stopped ? 'danger' : 'warn'}">${S.stopped ? '停止済み・未同期あり' : '稼働中'}</span>` +
    `${btn('端末を停止', 'stopDevice', 'dangerbtn')}${btn('停止中の受付記録を確認', 'stoppedRecords')}</section>` +
    '<section class="card stack"><h3>期限切れと削除案内</h3><p>過去の詳細履歴が残る場合、次回管理画面起動時に削除が必要な理由を案内します。</p>' +
    `${btn('削除案内を表示', 'deleteNotice')}</section></div>` +
    `<div class="card" style="margin-top:16px"><h3>公演終了</h3>${btn('締め画面へ', 'close')} ${btn('公演後の再ログイン表示', 'relogin')}</div>`,
  '停止後の記録を自動採用しないことを確認します。');
}

function close() {
  return page('公演終了・締め', `<div class="card stack"><div class="notice warn">未送信 ${S.unsent}件、停止中の未確認記録 ${S.receivedAfterStop ? 1 : 0}件。未確認のまま通常締めはできません。</div><p>紛失端末がある場合は、未同期記録の扱いを確認して例外締めへ進みます。</p>${btn('例外締めの確認', 'exceptionClose', 'dangerbtn')}${btn('当日管理へ戻る', 'management')}</div>`, '画面上の確認のみを再現します。');
}

function body() {
  return ({
    home,
    prep,
    info,
    people,
    seats,
    placement,
    tickets,
    output,
    staff,
    device,
    other,
    day,
    camera,
    result,
    venue,
    messages,
    management,
    close
  }[S.screen] || home)();
}

function modal() {
  if (!S.modal) return '';
  let m = S.modal;
  return `<div class="modalwrap"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">${esc(m.title)}</h2><div>${m.body}</div><div class="row">${m.buttons.map(b => btn(b.label, b.action, b.style || 'secondary')).join('')}</div></section></div>`;
}

function sizeCanvas() {
  const canvas = $('canvas');
  const map = canvas?.querySelector('.seatmap');
  const extent = canvas?.querySelector('.seatmap-extent');
  if (!map || !extent) return;

  extent.style.width = `${map.offsetWidth * S.zoom}px`;
  extent.style.height = `${map.offsetHeight * S.zoom}px`;
}

function focusSelectedSeat() {
  const canvas = $('canvas');
  const seat = canvas?.querySelector('[data-seat].selected');
  if (!seat) return;

  const viewport = canvas.getBoundingClientRect();
  const selected = seat.getBoundingClientRect();
  canvas.scrollTo({
    left: canvas.scrollLeft + selected.left - viewport.left - (canvas.clientWidth - selected.width) / 2,
    top: canvas.scrollTop + selected.top - viewport.top - (canvas.clientHeight - selected.height) / 2,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  });
}

// S の現在値から画面を組み立て直す。操作後の再表示はここに集約する。
function render() {
  const previousCanvas = $('canvas');
  const previousPosition = previousCanvas?.dataset.canvasScreen === S.screen
    ? { left: previousCanvas.scrollLeft, top: previousCanvas.scrollTop }
    : null;
  const previousTable = document.querySelector('.people-table-viewport');
  const previousTablePosition = S.screen === 'people' &&
    previousTable?.dataset.page === String(S.peoplePage) &&
    previousTable.dataset.pageSize === String(S.peoplePageSize)
    ? { left: previousTable.scrollLeft, top: previousTable.scrollTop }
    : null;

  document.title = `${screens[S.screen]} · UIモック`;
  $('app').innerHTML = `<div class="shell">${nav()}<main class="main" ${S.drawerOpen ? 'inert' : ''}>` +
    `${header()}<div class="content">${breadcrumb()}${body()}</div></main></div>` +
    `${S.drawerOpen ? '<button class="drawer-backdrop" data-action="menuClose" tabindex="-1" aria-label="メニューを閉じる"></button>' : ''}` +
    `${modal()}${S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : ''}`;
  document.body.classList.toggle('menu-open', S.drawerOpen);
  sizeCanvas();

  if (previousPosition) $('canvas')?.scrollTo(previousPosition);
  if (previousTablePosition) document.querySelector('.people-table-viewport')?.scrollTo(previousTablePosition);
  if (S.modal) document.querySelector('.modal button')?.focus();
  else if (S.drawerOpen) document.querySelector('.menu-close')?.focus();
}

function openModal(title, body, buttons) {
  S.drawerOpen = false;
  S.modal = {
    title,
    body,
    buttons
  };
  render();
}

function closeModal() {
  S.modal = null;
  S.manualTarget = null;
  render();
}

// 画面移動の入口。未保存の編集があれば、移動前に扱いを選んでもらう。
function go(target, force = false, fromBrowser = false, recordHistory = true) {
  S.drawerOpen = false;
  if (S.dirty && !force && editable.has(S.screen) && target !== S.screen) {
    openModal('変更が保存されていません', '<p>この画面で変更した内容があります。</p>', [{
      label: '保存して移動',
      action: `leaveSave:${target}`,
      style: 'primary'
    }, {
      label: '保存せず移動',
      action: `leaveDiscard:${target}`
    }, {
      label: '編集を続ける',
      action: 'modalClose'
    }]);
    return;
  }

  if (S.screen === 'camera') {
    S.camera = false;
    S.light = false;
    S.noticeOpen = false;
  }

  if (target === 'camera') S.camera = true;

  if (target !== S.screen) {
    if (recordHistory) S.history.push(S.screen);
    if (!fromBrowser) window.history.pushState({
      screen: target
    }, '', `#${target}`);
  }

  S.screen = target;
  S.modal = null;
  S.noticeOpen = false;
  render();
}

// 保存済みの写しを更新する。版競合の模擬状態では入力を保持して移動を止める。
function save() {
  if (S.conflict) {
    openModal('他の人が先に保存したため、保存できません', `<p>共有先は版 ${S.version + 1} です。この画面の編集内容は残っています。保存エラーの再現を解除し、内容を見直してから保存してください。</p>`, [{
      label: '再現を解除する',
      action: 'resolveConflict',
      style: 'primary'
    }, {
      label: '編集を続ける',
      action: 'modalClose'
    }]);
    return false;
  }

  if (S.screen === 'info') S.savedForm = structuredClone(S.form);
  S.savedPeople = structuredClone(S.people);
  S.savedGapSeats = new Set(S.gapSeats);
  S.savedSpaceSeats = new Set(S.spaceSeats);

  S.dirty = false;
  S.draftVersion = S.version;
  toast('保存しました（モック内のみ）');

  return true;
}

function resetDraft() {
  if (S.screen === 'info') S.form = structuredClone(S.savedForm);
  if (S.screen === 'people' || S.screen === 'placement') S.people = structuredClone(S.savedPeople);
  if (S.screen === 'seats') {
    S.gapSeats = new Set(S.savedGapSeats);
    S.spaceSeats = new Set(S.savedSpaceSeats);
  }

  S.dirty = false;
  S.conflict = false;
}

function confirmAction(title, body, action, danger = false) {
  openModal(title, `<p>${body}</p>`, [{
    label: danger ? '実行する' : '確認して実行',
    action,
    style: danger ? 'dangerbtn' : 'primary'
  }, {
    label: '戻る',
    action: 'modalClose'
  }]);
}

// ボタンの data-action を操作ごとの処理へ振り分ける。
function handle(action) {
  if (!action) return;
  if (screens[action] && action !== 'messages') return go(action);
  if (action.startsWith('previewPdf:') || action.startsWith('completePdf:')) {
    if (!['主担当', '代理管理者'].includes(S.role)) return toast('出力は管理者が行います');
    const person = S.people.find(p => p.id === +action.split(':')[1]);
    if (!person || person.inactive || !person.seat || person.method !== '電子チケット') return toast('対象のお客様と交付方法を確認してください');
    if (action.startsWith('completePdf:')) { S.modal = null; return toast('PDFを出力しました（モックのため実ファイルは作成されません）'); }
    return openModal('電子チケットPDFを出力', `<p>対象：${esc(person.name)}／${esc(person.seat)}。1枚のPDFを出力します。</p><p class="small muted">このモックではファイルを作成せず、券発行済み・券送付済みのチェックも変更しません。</p>`, [
      { label: 'PDF出力を試す', action: `completePdf:${person.id}`, style: 'primary' }, { label: 'キャンセル', action: 'modalClose' }
    ]);
  }
  if (action === 'previewPaperExcel' || action === 'completePaperExcel') {
    if (!['主担当', '代理管理者'].includes(S.role)) return toast('出力は管理者が行います');
    const count = outputPeople('紙チケット').length;
    if (!count) return toast('紙チケットの出力対象はありません');
    if (action === 'completePaperExcel') { S.modal = null; return toast('Excel一覧を出力しました（モックのため実ファイルは作成されません）'); }
    return openModal('印刷業者向けExcelを出力', `<p>紙チケット ${count}件を席番号順の一覧にまとめます。</p><p class="small muted">このモックではファイルを作成せず、券発行済み・券送付済みのチェックも変更しません。</p>`, [
      { label: 'Excel出力を試す', action: 'completePaperExcel', style: 'primary' }, { label: 'キャンセル', action: 'modalClose' }
    ]);
  }
  if (action.startsWith('showBuyer:')) {
    const buyer = S.people.find(p => p.id === +action.slice(10));
    if (buyer) {
      const number = S.people.indexOf(buyer) + 1;
      const details = [
        ['番号', number],
        ['購入者名', buyer.name],
        ['来場予定', buyer.inactive ? '不参加' : '来場予定'],
        ['座席表示名', buyer.label],
        ['席番号', buyer.seat || '席未設定'],
        ...(buyer.previousAssignment ? [['不参加前の席・発行状態（モック）', `${buyer.previousAssignment.seat}・${buyer.previousAssignment.issued ? checkLabels.issued : '未発行'}・${buyer.previousAssignment.delivered ? checkLabels.delivered : '未送付'}`]] : []),
        ['案内', buyer.note || '－']
      ];
      const body = `<dl class="person-details">${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
      return openModal('お客様情報の詳細', body, [
        { label: '閉じる', action: 'modalClose' },
        { label: '購入者名を変更', action: `editBuyerName:${buyer.id}` },
        { label: '案内を編集', action: `editNote:${buyer.id}` },
        { label: buyer.inactive ? '来場予定に戻す' : '不参加にする', action: `toggleInactive:${buyer.id}` }
      ]);
    }
    return;
  }
  if (action.startsWith('editNote:')) {
    const person = S.people.find(p => p.id === +action.split(':')[1]);
    if (!person) return;
    return openModal('案内を編集', `<p>${esc(person.name)}</p><label class="field">受付時の案内・特別対応（200文字以内）<textarea id="person-note" rows="5" maxlength="200">${esc(person.note)}</textarea></label><p class="small muted">変更を反映した後、お客様情報の「保存」で保存してください。空欄にすると案内を解除します。</p>`, [
      { label: '変更を反映', action: `applyNote:${person.id}`, style: 'primary' },
      { label: 'キャンセル', action: 'modalClose' }
    ]);
  }
  if (action.startsWith('applyNote:')) {
    const person = S.people.find(p => p.id === +action.split(':')[1]);
    const input = $('person-note');
    if (!person || !input) return;
    const value = input.value.trim();
    if (value.length > 200) {
      input.setCustomValidity('案内は200文字以内で入力してください');
      input.reportValidity();
      return;
    }
    if (person.note !== value) { person.note = value; S.dirty = true; }
    return closeModal();
  }
  if (action.startsWith('showTicketPerson:')) {
    const person = S.people.find(p => p.id === +action.slice(17));
    if (!person) return;
    const details = [
      ['購入者名', person.name],
      ['来場予定', person.inactive ? '不参加' : '来場予定'],
      ['席番号', person.seat || '席未設定'],
      ['交付方法', person.method],
      ...Object.entries(checkLabels).map(([key, label]) => [label, person[key] ? '済み' : '未済み']),
      ['案内・例外情報', person.note || 'なし']
    ];
    const body = `<dl class="person-details">${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
    return openModal('お客様対応状況の詳細', body, [{ label: '閉じる', action: 'modalClose' }]);
  }
  if (action === 'addPerson') {
    if (S.screen !== 'people' || !['主担当', '代理管理者'].includes(S.role)) return;
    return openModal('お客様を追加', '<label class="field">購入者名（必須・50文字以内）<input id="new-person-name" maxlength="50" autocomplete="off"></label><label class="field">座席表示名（任意・6文字以内）<input id="new-person-label" maxlength="6" autocomplete="off"></label><p class="small muted">席未設定・各チェック未済で追加します。追加後に「保存」を押してください。</p><p id="add-person-error" class="notice warn" role="alert" hidden></p>', [
      { label: 'キャンセル', action: 'modalClose' },
      { label: '追加する', action: 'addPersonDo', style: 'primary' }
    ]);
  }
  if (action === 'addPersonDo') {
    if (S.screen !== 'people' || !['主担当', '代理管理者'].includes(S.role) || S.modal?.title !== 'お客様を追加') return;
    const name = $('new-person-name')?.value.trim() || '';
    const label = $('new-person-label')?.value.trim() || '';
    if (!name || name.length > 50 || label.length > 6) {
      const error = $('add-person-error');
      if (error) { error.textContent = '購入者名は1～50文字、座席表示名は6文字以内にしてください'; error.hidden = false; }
      return;
    }
    const id = Math.max(0, ...S.people.map(p => p.id)) + 1;
    const person = { id, name, label, seat: '', cellId: '', note: '', method: '未選択', inactive: false };
    for (const key of Object.keys(checkLabels)) person[key] = false;
    S.people.push(person);
    S.peoplePage = Math.ceil(S.people.length / S.peoplePageSize);
    S.dirty = true;
    S.modal = null;
    return render();
  }
  if (action.startsWith('editBuyerName:')) {
    const person = S.people.find(p => p.id === +action.slice(14));
    if (!person) return;
    return openModal('購入者名を変更', `<label class="field">購入者名<input id="buyer-name-edit" value="${esc(person.name)}" maxlength="50"></label><p class="small muted">前後の空白を除いた1～50文字。変更後は保存してください。</p>`, [
      { label: '詳細へ戻る', action: `showBuyer:${person.id}` },
      { label: '変更する', action: `applyBuyerName:${person.id}`, style: 'primary' }
    ]);
  }
  if (action.startsWith('applyBuyerName:')) {
    const person = S.people.find(p => p.id === +action.slice(15));
    const name = $('buyer-name-edit')?.value.trim() || '';
    if (!person || !name || name.length > 50) return toast('購入者名は前後の空白を除いた1～50文字にしてください');
    if (person.name !== name) {
      person.name = name;
      S.dirty = true;
    }
    return handle(`showBuyer:${person.id}`);
  }
  if (action.startsWith('toggleInactive:')) {
    const person = S.people.find(p => p.id === +action.slice(15));
    if (!person) return;
    const next = person.inactive ? '来場予定に戻す' : '不参加にする';
    const impact = person.inactive ? '席や発行状態は自動では戻りません。' : person.seat ? `既に${esc(person.seat)}へ席設定済みです。よろしいですか？席設定を解除します。${person.issued || person.delivered ? '券発行済み・券送付済みの表示も解除します。' : ''}` : 'お客様対応状況の一覧から除外します。';
    return openModal('来場予定を変更', `<p>${esc(person.name)}を「${next}」にします。${impact}</p>`, [
      { label: '詳細へ戻る', action: `showBuyer:${person.id}` },
      { label: next, action: `applyInactive:${person.id}`, style: person.seat ? 'dangerbtn' : 'primary' }
    ]);
  }
  if (action.startsWith('applyInactive:')) {
    const person = S.people.find(p => p.id === +action.slice(14));
    if (!person) return;
    if (!person.inactive && person.seat) {
      // 発行済みの席は実運用ではQRの無効化が必要。モックでは確認を重ねて状態だけ試す。
      if (person.issued || person.delivered) {
        return openModal('発行済みチケットの扱いを確認', `<p>${esc(person.name)}の${esc(person.seat)}を解除し、券発行済み・券送付済みの表示を未済みに戻します。実際のQR無効化や履歴保存は行いません。</p>`, [
          { label: '戻る', action: `toggleInactive:${person.id}` },
          { label: '解除して不参加にする', action: `confirmInactive:${person.id}`, style: 'dangerbtn' }
        ]);
      }
      return handle(`confirmInactive:${person.id}`);
    }
    person.inactive = !person.inactive;
    if (person.inactive) S.selectedIds.delete(person.id);
    S.modal = null;
    S.dirty = true;
    return render();
  }
  if (action.startsWith('confirmInactive:')) {
    const person = S.people.find(p => p.id === +action.slice(16));
    if (!person || person.inactive) return;
    person.previousAssignment = { seat: person.seat, issued: person.issued, delivered: person.delivered };
    person.seat = '';
    person.issued = false;
    person.delivered = false;
    person.inactive = true;
    S.selectedIds.delete(person.id);
    S.modal = null;
    S.dirty = true;
    return render();
  }
  if (action.startsWith('scan:')) {
    if (S.noticeOpen) return toast('連絡を閉じてから読取りを再開してください');
    S.result = action.split(':')[1];
    S.unsent += !S.online && S.result === 'success' ? 1 : 0;
    return go('result');
  }
  if (action.startsWith('leaveSave:')) {
    let target = action.slice(10);
    S.modal = null;
    if (save()) go(target, true);
    return;
  }
  if (action.startsWith('leaveDiscard:')) {
    let target = action.slice(13);
    resetDraft();
    return go(target, true);
  }
  if (action.startsWith('checkConfirm:')) {
    let [id, k] = action.slice(13).split(':');
    let p = S.people.find(x => x.id === +id);
    if (!p || !Object.hasOwn(checkLabels, k)) return;
    p[k] = !p[k];
    const saved = S.savedPeople.find(person => person.id === +id);
    if (saved) saved[k] = p[k];
    S.modal = null;
    return toast(`${checkLabels[k]}を${p[k] ? '済み' : '未済み'}にしました`);
  }
  if (action.startsWith('saveCustomRename:')) {
    const id = action.slice(17);
    if (!S.customCheckIds.includes(id)) return;
    const label = $('custom-check-rename')?.value.trim() || '';
    if (!label || label.length > 20) return toast('項目名は1～20文字にしてください');
    if (Object.entries(checkLabels).some(([key, value]) => key !== id && value === label)) return toast('同じ名前の項目があります');
    checkLabels[id] = label;
    S.customChecksOpen = true;
    S.modal = null;
    return render();
  }
  if (action.startsWith('renameCustom:')) {
    const id = action.slice(13);
    if (!S.customCheckIds.includes(id)) return;
    S.customChecksOpen = true;
    return openModal('確認用項目の名前を変更', `<label class="field">項目名<input id="custom-check-rename" value="${esc(checkLabels[id])}" maxlength="20"></label>`, [{ label: '変更する', action: `saveCustomRename:${id}`, style: 'primary' }, { label: '戻る', action: 'modalClose' }]);
  }
  if (action.startsWith('removeCustom:')) {
    const id = action.slice(13);
    if (!S.customCheckIds.includes(id)) return;
    S.customChecksOpen = true;
    return confirmAction('確認用項目を削除', `「${esc(checkLabels[id])}」を一覧から外します。この画面からは戻せません。`, `removeCustomDo:${id}`);
  }
  if (action.startsWith('removeCustomDo:')) {
    const id = action.slice(15);
    if (!S.customCheckIds.includes(id)) return;
    S.customCheckIds = S.customCheckIds.filter(key => key !== id);
    delete checkLabels[id];
    if (S.sort === id) S.sort = 'seat';
    S.customChecksOpen = true;
    S.modal = null;
    return render();
  }
  if (action.startsWith('bulkDo:')) {
    const key = action.slice(7);
    if (!Object.hasOwn(checkLabels, key)) return;
    S.selectedIds.forEach(id => {
      const person = S.people.find(p => p.id === id);
      if (!person || person.inactive) return;
      person[key] = true;
      const saved = S.savedPeople.find(p => p.id === id);
      if (saved) saved[key] = true;
    });
    S.modal = null;
    return toast(`${checkLabels[key]}を更新しました`);
  }
  switch (action) {
    case 'menuOpen':
      S.drawerOpen = true;
      return render();

    case 'menuClose':
      S.drawerOpen = false;
      render();
      return document.querySelector('.menu-toggle')?.focus();

    case 'addCustomCheck': {
      const label = $('custom-check-name')?.value.trim() || '';
      if (!label || label.length > 20) return toast('項目名は1～20文字にしてください');
      if (Object.values(checkLabels).includes(label)) return toast('同じ名前の項目があります');
      const id = `custom${S.nextCustomCheckId++}`;
      checkLabels[id] = label;
      S.customCheckIds.push(id);
      S.people.forEach(person => person[id] = false);
      S.savedPeople.forEach(person => person[id] = false);
      S.customChecksOpen = true;
      return render();
    }

    case 'sample500': {
      const nextId = Math.max(...S.people.map(p => p.id)) + 1;
      const missing = 500 - S.people.length;
      if (missing <= 0) return;
      S.people.push(...Array.from({ length: missing }, (_, i) => ({
        id: nextId + i,
        name: i === 0 ? '架空見本 長い購入者名の省略表示を確認するための架空の名前' : `架空購入者 ${String(nextId + i).padStart(3, '0')}`,
        label: `見本${i + 1}`,
        seat: '',
        note: '',
        method: '未選択',
        contact: false,
        inactive: false,
        payment: false,
        issued: false,
        delivered: false
      })));
      S.peoplePage = 1;
      S.dirty = true;
      return render();
    }

    case 'peoplePrev':
      S.peoplePage = Math.max(1, S.peoplePage - 1);
      return render();

    case 'peopleNext':
      S.peoplePage = Math.min(Math.max(1, Math.ceil(S.people.length / S.peoplePageSize)), S.peoplePage + 1);
      return render();

    case 'modalClose':
      return closeModal();

    case 'back':
      {
        const target = backTarget();
        S.history.pop();
        return go(target, false, false, false);
      }

    case 'connection':
      return openModal('通信状態', `<p>${S.online ? '◉ オンライン' : '⊘ オフライン'}</p><p>未送信 ${S.unsent}件。${S.online ? '共有先へ接続中' : '受付記録はこの端末に保存する想定です。'}</p><p>表示確認用：実際の通信・保存はありません。</p>`, [{
        label: '閉じる',
        action: 'modalClose'
      }]);

    case 'toggleOnline':
      S.online = !S.online;
      return render();

    case 'messages':
      if (S.screen === 'camera') {
        S.noticeOpen = true;
        return openModal('スタッフ連絡', `<p>読取りを一時停止しています。</p><p>重要：架空の集合場所連絡です。</p>${S.online ? '' : '<p>オフライン中は新しい連絡を受信できない場合があります。</p>'}`, [{
          label: '閉じて読取り再開',
          action: 'resumeCamera',
          style: 'primary'
        }, {
          label: '連絡画面へ',
          action: 'openMessages'
        }]);
      }
      return go('messages');

    case 'resumeCamera':
      S.noticeOpen = false;
      return closeModal();

    case 'openMessages':
      S.noticeOpen = false;
      return go('messages');

    case 'messagesBack':
      S.unread = 0;
      return go(S.history.pop() || 'prep');

    case 'save':
      return save();

    case 'saveDraft':
      return save();

    case 'confirmFinalize':
      return confirmAction('編集内容を確定', `対象公演：${esc(S.form.title)}。下書きの内容を確定します。`, 'finalize');

    case 'finalize':
      S.version++;
      S.dirty = false;
      S.conflict = false;
      S.savedPeople = structuredClone(S.people);
      S.modal = null;
      return toast(`確定しました。データ版 ${S.version}`);

    case 'simulateConflict':
      S.conflict = true;
      S.dirty = true;
      return toast('他の人が先に保存した状態にしました。「下書きを保存」でエラーを確認できます');

    case 'resolveConflict':
      S.version++;
      S.conflict = false;
      S.modal = null;
      return toast('保存エラーの再現を解除しました。編集内容を見直して保存してください');

    case 'switchShow':
      return confirmAction('公演を切り替える', `現在：${esc(S.form.title)}（未送信 ${S.unsent}件）／切替先：秋のコンサート 2日目（未送信 0件）。現在公演の記録は保持します。`, `switchDo`);

    case 'switchDo':
      S.modal = null;
      return toast('切替先の確認を再現しました。表示公演は変更していません');

    case 'toggleStart':
      return confirmAction(S.started ? '受付を停止して準備に戻す' : '受付を開始', `${esc(S.form.title)}：${S.started ? '当日運用中 → 準備中' : '準備中 → 当日運用中'}。既存の記録と未送信件数は保持します。`, 'startDo');

    case 'startDo':
      S.started = !S.started;
      S.modal = null;
      return toast(`公演状態：${S.started ? '当日運用中' : '準備中'}`);

    case 'zoomIn':
      S.zoom = Math.min(1.6, S.zoom + .2);
      return render();

    case 'zoomOut':
      S.zoom = Math.max(.6, S.zoom - .2);
      return render();

    case 'resetCanvas':
      S.zoom = 1;
      render();
      return $('canvas')?.scrollTo({ left: 0, top: 0 });

    case 'focusSeat':
      return focusSelectedSeat();

    case 'panelPosition':
      if (S.screen === 'placement') S.placementPanelBottom = !S.placementPanelBottom;
      else S.panelBottom = !S.panelBottom;
      return render();

    case 'panelCollapse':
      S.panelCollapsed = !S.panelCollapsed;
      return render();

    case 'makeSeat':
    case 'makeGap':
    case 'makeSpace':
      if (action !== 'makeSeat' && S.people.some(p => p.seat === S.seat)) return toast('席設定済みの席は空間や欠番にできません');
      if (action === 'makeSeat' && !S.gapSeats.has(S.seat) && !S.spaceSeats.has(S.seat)) return toast('すでに席です');
      S.gapSeats.delete(S.seat);
      S.spaceSeats.delete(S.seat);
      if (action === 'makeGap') S.gapSeats.add(S.seat);
      if (action === 'makeSpace') S.spaceSeats.add(S.seat);
      S.dirty = true;
      return toast(`${S.seat}を${action === 'makeGap' ? '欠番' : action === 'makeSpace' ? '空間' : '席'}にしました`);

    case 'place':
      {
        let id = +$('person-to-place')?.value,
          p = S.people.find(x => x.id === id);
        if (!p) return;
        if (S.gapSeats.has(S.seat) || S.spaceSeats.has(S.seat)) return toast('設定できる席を選択してください');
        if (S.people.some(x => x.seat === S.seat)) return toast('この席には既に席が設定されています');
        p.seat = S.seat;
        S.dirty = true;
        return toast(`${p.name}を${S.seat}へ席を仮設定しました`);
      }

    case 'sortReverse':
      S.sortReverse = !S.sortReverse;
      return render();

    case 'bulk':
      {
        let k = $('bulk-field').value;
        if (!Object.hasOwn(checkLabels, k)) return;
        const selected = S.people.filter(p => !p.inactive && S.selectedIds.has(p.id));
        if (!selected.length) return toast('対象を選択してください');
        if (k === 'issued' && selected.some(p => !p.seat)) return toast('席未設定の方には発行できません');
        return confirmAction('一斉チェック', `対象 ${selected.length}件の「${esc(checkLabels[k])}」を済みにします。`, `bulkDo:${k}`);
      }

    case 'invite':
      S.invited = true;
      return toast('招待を作成しました（メール送信なし）');

    case 'approve':
      S.approved = true;
      return toast('端末を承認しました（模擬）');

    case 'prepare':
      if (!S.invited || !S.approved) return toast('招待と端末承認を先に確認してください');
      S.prepared = true;
      return toast('端末事前準備が完了しました（模擬）');

    case 'practice':
      return go('camera');

    case 'light':
      S.light = !S.light;
      return render();

    case 'next':
      return go('camera');

    case 'reason':
      return confirmAction('再読取りの理由', '再入場・誤読取りなど、理由を選んで確認します。', 'reasonDo');

    case 'reasonDo':
      S.modal = null;
      return toast('理由を記録しました（模擬）');

    case 'exception':
      return confirmAction('例外を仮登録', '管理者確認が必要な仮登録です。', 'exceptionDo');

    case 'exceptionDo':
      S.modal = null;
      return toast('仮登録しました（模擬）');

    case 'mapView':
      S.view = 'map';
      return render();

    case 'listView':
      S.view = 'list';
      return render();

    case 'prevImage':
      S.imageIndex = S.imageIndex === 1 ? 2 : 1;
      return render();

    case 'nextImage':
      S.imageIndex = S.imageIndex === 2 ? 1 : 2;
      return render();

    case 'imageIn':
      S.imageZoom = Math.min(2, S.imageZoom + .25);
      return render();

    case 'imageOut':
      S.imageZoom = Math.max(.75, S.imageZoom - .25);
      return render();

    case 'changeLabel':
      return openModal('座席表示名を変更', `<p>選択席 ${esc(S.seat)}。購入者名と購入状態は変更されません。</p><label class="field">新しい表示名<input id="new-label" maxlength="6" value="${esc(S.people.find(x => x.seat === S.seat)?.label || '')}"></label>`, [{
        label: '変更を確認',
        action: 'changeLabelDo',
        style: 'primary'
      }, {
        label: '戻る',
        action: 'modalClose'
      }]);

    case 'changeLabelDo':
      {
        let p = S.people.find(x => x.seat === S.seat),
          v = $('new-label')?.value.trim();
        if (!p || !v) return toast('対象席と表示名を確認してください');
        p.label = v;
        S.modal = null;
        return toast('座席表示名を変更しました（模擬）');
      }

    case 'manual':
      {
        const person = S.people.find(p => p.seat === S.seat && !p.inactive);
        if (S.screen !== 'venue' || S.role === '一般受付担当者' || !person) return toast('お客様が設定されている席を選んでください');
        S.manualTarget = { id: person.id, seat: person.seat, arrived: isArrived(person) };
        return openModal(S.manualTarget.arrived ? '来場状態の訂正' : '手動受付', `<p>対象席：${esc(person.seat)}／${esc(person.label)}</p>${S.manualTarget.arrived ? '<label class="field">訂正理由<input id="correction-reason"></label>' : ''}`, [{
          label: '確認して記録',
          action: 'manualDo',
          style: 'primary'
        }, {
          label: '戻る',
          action: 'modalClose'
        }]);
      }

    case 'manualDo':
      {
        const target = S.manualTarget;
        const person = S.people.find(p => p.id === target?.id);
        if (!S.modal || !target || S.screen !== 'venue' || S.role === '一般受付担当者' || !person || person.inactive || person.seat !== target.seat || S.seat !== target.seat || isArrived(person) !== target.arrived) {
          S.modal = null;
          S.manualTarget = null;
          return toast('対象や来場状態が変わりました。確認し直してください');
        }
        if (target.arrived && !$('correction-reason')?.value.trim()) return toast('訂正理由を入力してください');
        if (target.arrived) S.arrivedIds.delete(person.id);
        else S.arrivedIds.add(person.id);
      }
      S.modal = null;
      S.manualTarget = null;
      return toast('来場状態を更新しました（模擬）');

    case 'stopDevice':
      return confirmAction('端末を停止', '見本端末 02 を停止します。端末内データは暗号化状態で保持され、削除されません。完全オフライン端末には停止を即時通知できません。', 'stopDo', true);

    case 'stopDo':
      S.stopped = true;
      S.receivedAfterStop = true;
      S.modal = null;
      return toast('端末を停止しました（模擬）');

    case 'stoppedRecords':
      return openModal('停止中の受付記録', `<p>停止後に到着した記録：${S.receivedAfterStop ? '1件' : '0件'}。紙記録等と照合し、採否を判断します。自動では通常受付へ反映しません。</p>`, [{
        label: '確認を閉じる',
        action: 'modalClose'
      }]);

    case 'deleteNotice':
      return openModal('過去データの確認', '<p>過去の詳細履歴が残っています。保存期限と未送信記録を確認し、権限のある管理者が削除手順へ進んでください。</p><p>このモックで実データ削除は行いません。</p>', [{
        label: '閉じる',
        action: 'modalClose'
      }]);

    case 'exceptionClose':
      return confirmAction('例外締めの確認', '未同期端末と未確認記録を確認します。締め後も記録の照合が必要です。', 'closeDo', true);

    case 'closeDo':
      S.modal = null;
      return toast('例外締め画面を確認しました（模擬）');

    case 'relogin':
      return openModal('公演後の再ログイン表示', `<p>再ログイン後の役割：${esc(S.role)}。</p><p>公演後の管理画面へ進める役割か確認します。実際の認証は行いません。</p>`, [{
        label: '閉じる',
        action: 'modalClose'
      }]);

    default:
      return;
  }
}

// 再描画で作り直されるボタンも受け付けられるよう、クリックをまとめて処理する。
document.addEventListener('click', e => {
  let seat = e.target.closest('[data-seat]');
  if (seat) {
    S.seat = seat.dataset.seat;
    return render();
  }

  let screen = e.target.closest('[data-screen]');
  if (screen) return go(screen.dataset.screen);

  let check = e.target.closest('[data-check]');
  if (check) {
    let [id, k] = check.dataset.check.split(':'),
      p = S.people.find(x => x.id === +id);
    if (!p || p.inactive || !Object.hasOwn(checkLabels, k)) return;
    if (k === 'issued' && !p.seat && !p.issued) return toast('席未設定の方には発行できません');
    return confirmAction(`${checkLabels[k]}を変更`, `${esc(p.name)} · ${p.seat ? esc(p.seat) : '席未設定'}：${p[k] ? '済み → 未済み' : '未済み → 済み'}。他のチェック項目は変更しません。`, `checkConfirm:${id}:${k}`);
  }

  let act = e.target.closest('[data-action]');
  if (act) handle(act.dataset.action);
});

// 入力中は画面全体を再描画せず、S と未保存表示だけを更新して入力位置を保つ。
document.addEventListener('input', e => {
  if (e.target.id === 'person-note') {
    e.target.setCustomValidity('');
    return;
  }
  if (e.target.dataset.form) {
    S.form[e.target.dataset.form] = e.target.value;
    S.dirty = true;
  } else if (e.target.dataset.label) {
    let p = S.people.find(x => x.id === +e.target.dataset.label);
    p.label = e.target.value;
    S.dirty = true;
  } else return;

  let el = $('state-status');
  if (el && !el.textContent.includes('未保存')) el.insertAdjacentHTML('beforeend', '<span class="pill warn">未保存</span>');
});

document.addEventListener('change', e => {
  if (e.target.dataset.placementFilter !== undefined) {
    S.placementFilter = e.target.value;
    const candidates = S.people.filter(p => !p.seat && !p.inactive && (S.placementFilter === 'all' || p.payment === (S.placementFilter === 'confirmed')));
    if (!candidates.some(p => p.id === S.personToPlace)) S.personToPlace = candidates[0]?.id ?? null;
    return render();
  }
  if (e.target.dataset.peopleSize !== undefined) {
    S.peoplePageSize = +e.target.value;
    S.peoplePage = 1;
    return render();
  }
  if (e.target.id === 'person-to-place') {
    S.personToPlace = +e.target.value;
    $('selected-person-name').textContent = S.people.find(p => p.id === S.personToPlace)?.name || '対象なし';
  }
  if (e.target.dataset.role !== undefined) {
    const device = S.devices.find(d => d.id === +e.target.value);
    if (!device) return;
    S.devices.forEach(d => { d.current = d.id === device.id; });
    S.role = device.role;
    render();
  }
  if (e.target.dataset.unread !== undefined) {
    S.unread = +e.target.value;
    render();
  }
  if (e.target.dataset.sort !== undefined) {
    S.sort = e.target.value;
    S.sortReverse = false;
    render();
  }
  if (e.target.dataset.method) {
    const id = +e.target.dataset.method;
    S.people.find(p => p.id === id).method = e.target.value;
    const saved = S.savedPeople.find(p => p.id === id);
    if (saved) saved.method = e.target.value;
    toast('交付方法を変更しました（模擬）');
  }
  if (e.target.dataset.select) {
    let id = +e.target.dataset.select;
    e.target.checked ? S.selectedIds.add(id) : S.selectedIds.delete(id);
    render();
  }
});

document.addEventListener('toggle', e => {
  if (e.target.matches('.custom-checks')) S.customChecksOpen = e.target.open;
}, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.drawerOpen) handle('menuClose');
});

window.addEventListener('resize', () => {
  if (S.drawerOpen && window.innerWidth > 900) {
    S.drawerOpen = false;
    render();
  }
});

window.addEventListener('beforeunload', e => {
  if (S.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ブラウザーの戻る操作も go() に通し、未保存確認を共通化する。
window.addEventListener('popstate', e => {
  let target = e.state?.screen || 'day';
  if (S.dirty && editable.has(S.screen)) {
    window.history.pushState({
      screen: S.screen
    }, '', `#${S.screen}`);
    return go(target);
  }
  go(target, true, true);
});

// 起動時に履歴の起点を登録する。scenarios.js の初期化後に初回表示する。
window.history.replaceState({
  screen: 'home'
}, '', '#home');
