// Issue #85: browser-only review mock. All values and actions are fictional and remain in memory.
const initialPeople = [{
  id: 1,
  name: '架空 太郎',
  label: '架空A',
  seat: 'A-12',
  method: '電子チケット',
  purchase: true,
  payment: false,
  issued: true,
  delivered: false
}, {
  id: 2,
  name: '見本 花子',
  label: '見本B',
  seat: '',
  method: '未選択',
  purchase: true,
  payment: false,
  issued: false,
  delivered: false
}, {
  id: 3,
  name: '例示 三郎',
  label: '例示C',
  seat: 'A-14',
  method: '紙チケット',
  purchase: true,
  payment: true,
  issued: true,
  delivered: true
}, {
  id: 4,
  name: '架空 四郎',
  label: '架空D',
  seat: '',
  method: '電子チケット',
  purchase: false,
  payment: false,
  issued: false,
  delivered: false
}];

// 画面の仮データと表示状態をここに集める。再読み込みすると初期値に戻る。
const S = {
  screen: 'home',
  history: [],
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
  seat: 'A-12',
  personToPlace: 2,
  zoom: 1,
  imageZoom: 1,
  imageIndex: 1,
  view: 'map',
  sort: 'seat',
  sortReverse: false,
  panelBottom: false,
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
S.savedSpaceSeats = new Set();

const screens = {
  home: '公演一覧',
  prep: '公演準備',
  info: '公演基本情報',
  people: '来場者管理',
  seats: '会場席の編集',
  placement: 'お客様を席に配置',
  tickets: 'チケット準備',
  staff: 'スタッフ・端末',
  device: '端末事前準備',
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
  let day = dayScreens.has(S.screen),
    back = day && S.screen !== 'day';
  return `<header class="top"><div class="top-left">${back ? `<button class="iconbtn" data-action="back" aria-label="前の画面へ戻る">←</button>` : ''}<div class="identity"><strong>${esc(S.form.title)}</strong>2027/10/10 · ${esc(S.role)}</div></div><div class="top-right">${day && S.screen !== 'result' ? `<button class="iconbtn" data-action="messages" aria-label="スタッフ連絡、未読${S.unread}件">♧${S.unread ? `<span class="badge">${S.unread > 9 ? '9+' : S.unread}</span>` : ''}</button>` : ''}<button class="iconbtn" data-action="connection" aria-label="通信状態を確認">${S.online ? '◉' : '⊘'}</button></div></header>`;
}

function nav() {
  let admin = ['主担当', '代理管理者'].includes(S.role);
  let groups = admin ? [['公演準備', ['home', 'prep', 'people', 'seats', 'placement', 'tickets']], ['当日・端末', ['staff', 'device', 'day', 'venue', 'management']]] : [['担当公演', ['home', 'device', 'day', 'venue', ...(S.role === '臨時管理者' ? ['management'] : [])]]];
  return `<aside class="side"><div class="brand">受付システム <small>操作確認用 UIモック</small></div><nav>${groups.map(([g, ids]) => `<span class="group">${g}</span>${ids.map(id => `<button data-screen="${id}" class="${S.screen === id ? 'active' : ''}" ${S.screen === id ? 'aria-current="page"' : ''}>${screens[id]}</button>`).join('')}`).join('')}</nav></aside>`;
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

function home() {
  let admin = ['主担当', '代理管理者'].includes(S.role);
  return page('公演一覧', `<div class="grid two"><section class="card"><div class="eyebrow">現在の公演</div><h2>${esc(S.form.title)}</h2><p>2027年10月10日 · ${esc(S.form.venue)}</p>${status()}<p style="margin-top:18px">${btn(admin ? '現在の公演を開く' : '担当公演を開く', admin ? 'prep' : 'day', 'primary')}</p></section><section class="card"><div class="eyebrow">切替候補</div><h2>秋のコンサート 2日目</h2><p>2027年10月11日 · 架空市民ホール</p><span class="pill neutral">未送信 0件</span><p style="margin-top:18px">${btn('内容を確認して切り替える', 'switchShow')}</p></section></div><div class="card stack" style="margin-top:16px"><h3>操作確認用の条件</h3><div class="row"><label class="field">役割<select data-role>${['主担当', '代理管理者', '臨時管理者', '一般受付担当者'].map(r => `<option ${S.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label><label class="field">未読連絡数<select data-unread>${[0, 3, 9, 10].map(n => `<option ${S.unread === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${btn(S.online ? 'オフラインにする' : 'オンラインにする', 'toggleOnline')}</div><p class="small muted">役割と通信状態は画面表示の確認用です。認証・同期は実行しません。</p></div><div class="notice" style="margin-top:17px">このモックの操作はブラウザー内だけで再現されます。再読み込みで初期状態に戻ります。</div>`, '公演単位の切替と、現在公演の区別を確認します。');
}

function prep() {
  let items = [['1 公演情報と会場', 'info', '公演名・会場情報を入力'], ['2 お客様情報', 'people', '架空名簿を確認'], ['3 会場席', 'seats', '席と空間を編集'], ['4 座席配置', 'placement', '未配置客を席へ配置'], ['5 チケット準備', 'tickets', '独立した4項目を確認'], ['6 スタッフ・端末', 'staff', '招待・準備を確認']];
  return page('公演準備', `<div class="grid">${items.map(([n, id, d]) => `<section class="card action"><div class="eyebrow">準備手順</div><h3>${n}</h3><p>${d}</p>${btn('開く', id, 'secondary')}</section>`).join('')}</div><div class="card" style="margin-top:16px"><h3>当日の開始</h3><p>公演状態：<strong>${S.started ? '当日運用中' : '準備中'}</strong>。開催時刻だけでは受付を開始しません。</p>${btn(S.started ? '受付を停止して準備に戻す' : '受付を開始', 'toggleStart', 'primary')} ${btn('スタッフ連絡を見る', 'messages')}</div>`, '準備の順番と各画面への導線を確認します。');
}

function info() {
  return page('公演基本情報', `<div class="card stack"><div class="formgrid"><label class="field">公演名<input data-form="title" value="${esc(S.form.title)}"></label><label class="field">開催日時<input value="2027-10-10 18:00" readonly></label><label class="field">会場名<input data-form="venue" value="${esc(S.form.venue)}"></label><label class="field">住所<input data-form="address" value="${esc(S.form.address)}"><small>会場の所在地です。来場者の住所ではありません。</small></label></div>${status()}<div class="row">${btn('保存', 'save', 'primary')}${btn('公演準備へ戻る', 'prep')}</div></div>`, '編集内容は明示的に保存します。');
}

function people() {
  return page('来場者管理', `<div class="card stack"><div class="notice">初回取込では席番号が空欄でも登録できます。未配置の方にはチケットとQRを発行できません。</div><div class="tablewrap"><table class="table"><thead><tr><th>購入者名</th><th>座席表示名</th><th>席番号</th><th>案内</th></tr></thead><tbody>${S.people.map(p => `<tr><td>${esc(p.name)}</td><td><input aria-label="${esc(p.name)}の座席表示名" data-label="${p.id}" value="${esc(p.label)}" maxlength="6"></td><td>${p.seat || '<span class="pill warn">未配置</span>'}</td><td>${p.id === 1 ? '要確認' : '－'}</td></tr>`).join('')}</tbody></table></div>${status()}<div class="row">${btn('保存', 'save', 'primary')}${btn('席に配置する', 'placement')}</div></div>`, '購入者名と座席表示名を分けて確認します。');
}

function seatTiles() {
  let tiles = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      let n = 10 + r * 8 + c,
        key = `A-${n}`;
      if (r === 1 && c === 3 || r === 3 && c === 5 || S.spaceSeats.has(key)) {
        tiles.push('<div class="gapcell">空間</div>');
        continue;
      }
      let p = S.people.find(x => x.seat === key);
      let selected = S.seat === key;
      tiles.push(`<button class="seat ${selected ? 'selected' : ''} ${p ? '' : 'empty'} ${S.arrived === key ? 'arrived' : ''}" data-seat="${key}" aria-label="席 ${key}${p ? ', ' + p.label : ''}"><strong>${key}</strong><span>${S.gapSeats.has(key) ? '欠番' : p ? esc(p.label) : '空席'}</span>${S.arrived === key ? '<span>✓ 来場済み</span>' : ''}</button>`);
    }
  }
  return `<div class="seatmap" style="transform:scale(${S.zoom})"><div class="stage-label">舞台</div>${tiles.join('')}</div>`;
}

function canvas() {
  return `<div class="canvas-outer" id="canvas"><div class="seatmap-extent">${seatTiles()}</div></div><div class="row" style="margin-top:9px">${btn('－', 'zoomOut')}${btn('＋', 'zoomIn')}${btn('標準倍率で左上へ', 'resetCanvas')}${btn('選択席へ戻る', 'focusSeat')}</div>`;
}

function seats() {
  return page('会場席の編集', `<div class="stage ${S.panelBottom ? 'panel-bottom' : ''}"><div class="selection-strip"><span>選択中の席 <strong>${esc(S.seat)}</strong></span>${editStatus()}</div><section class="card stack settings-card"><div class="paneltop"><strong>席の設定</strong>${btn(S.panelCollapsed ? '開く' : '最小化', 'panelCollapse', 'textbtn')}</div>${S.panelCollapsed ? '' : `<label class="field">区画<select><option>1階 A列</option></select></label><div class="row">${btn('欠番にする', 'makeGap')}${btn('空間を追加', 'makeSpace')}</div><div class="row">${btn('下書きを保存', 'saveDraft', 'primary')}${btn('編集内容を確定', 'confirmFinalize')}</div><details><summary>保存エラーを試す（モック専用）</summary><p class="small muted">他の人が先に保存した状態を作ります。その後「下書きを保存」を押すと、保存できない場合の案内を確認できます。実際の共有先は変更しません。</p>${btn('他の人が先に保存した状態にする', 'simulateConflict')}</details><div class="small muted">スマートフォンでは設定パネルの位置を比較できます。</div>${btn(S.panelBottom ? 'パネルを上に' : 'パネルを下に', 'panelPosition')}`}</section><section class="card canvas-card"><h3>座席キャンバス</h3>${canvas()}</section></div>`, 'キャンバスを縦横に動かし、席を選択してください。');
}

function placement() {
  let unplaced = S.people.filter(p => !p.seat);
  let selectedPerson = unplaced.find(p => p.id === S.personToPlace) || unplaced[0];
  return page('お客様を席に配置', `<div class="stage"><div class="selection-strip"><span>選択中の席 <strong>${esc(S.seat)}</strong></span><span>お客様 <strong id="selected-person-name">${selectedPerson ? esc(selectedPerson.name) : '対象なし'}</strong></span>${editStatus()}</div><section class="card stack settings-card"><h3>席未割当 ${unplaced.length}件</h3>${unplaced.length ? `<label class="field">配置する方<select id="person-to-place">${unplaced.map(p => `<option value="${p.id}" ${p.id === selectedPerson.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><p>空席を選び「選択席に配置」を押します。</p>${btn('選択席に配置', 'place', 'primary')}` : '<p>すべて配置済みです。</p>'}<div class="row">${btn('下書きを保存', 'saveDraft')}${btn('配置を決定', 'confirmFinalize', 'primary')}</div></section><section class="card canvas-card"><h3>座席キャンバス</h3>${canvas()}</section></div>`, '未配置客から発券までの操作を確認します。');
}

const checkLabels = {
  purchase: '購入確定',
  payment: '入金確認',
  issued: '発行済み',
  delivered: '交付済み'
};

function tickets() {
  let a = [...S.people];
  if (S.sort === 'seat') a.sort((x, y) => (x.seat || 'ZZ').localeCompare(y.seat || 'ZZ'));else a.sort((x, y) => Number(x[S.sort]) - Number(y[S.sort]) || (x.seat || 'ZZ').localeCompare(y.seat || 'ZZ'));
  if (S.sortReverse) a.reverse();
  return page('チケット準備', `<div class="card stack"><div class="row"><label class="field">並べ替え<select data-sort>${Object.entries({
    seat: '席番号',
    ...checkLabels
  }).map(([k, v]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>${btn(S.sortReverse ? '降順' : '昇順', 'sortReverse')}</div><div class="tablewrap"><table class="table"><thead><tr><th>選択</th><th>購入者名</th><th>席</th><th>交付方法</th>${Object.values(checkLabels).map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${a.map(p => `<tr><td><input type="checkbox" data-select="${p.id}" ${S.selectedIds.has(p.id) ? 'checked' : ''} aria-label="${esc(p.name)}を選択"></td><td>${esc(p.name)}</td><td>${p.seat || '<span class="pill warn">未配置</span>'}</td><td><select data-method="${p.id}">${['未選択', '電子チケット', '紙チケット'].map(m => `<option ${p.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></td>${Object.keys(checkLabels).map(k => `<td><button class="${p[k] ? 'pill' : 'secondary'}" data-check="${p.id}:${k}">${p[k] ? '✓ 済' : '□ 未'}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="row">選択 ${S.selectedIds.size}件 <select id="bulk-field">${Object.entries(checkLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>${btn('選択行をチェック', 'bulk', 'primary')}</div><div class="notice">4項目は独立しています。チェック操作で決済、発送、メール送信は行いません。</div></div>`, '未入金のまま発行・交付した状態も確認できます。');
}

function staff() {
  return page('スタッフ・端末', `<div class="grid two"><section class="card stack"><h3>スタッフ招待</h3><p>架空の招待先：staff@example.com</p><span class="pill ${S.invited ? '' : 'warn'}">${S.invited ? '招待済み' : '未招待'}</span>${btn('招待を作成', 'invite', 'primary')}</section><section class="card stack"><h3>端末の承認</h3><p>見本端末 01 · 一般受付担当者</p><span class="pill ${S.approved ? '' : 'warn'}">${S.approved ? '承認済み' : '承認待ち'}</span>${btn('端末を承認', 'approve', 'primary')}</section></div><div class="card" style="margin-top:16px"><h3>事前準備</h3><p>本人・役割・端末、アプリ・データ、カメラ・練習、オフライン準備を確認します。</p>${btn('端末事前準備へ', 'device', 'primary')}</div>`, '招待、端末承認、準備を順に確認します。');
}

function device() {
  let steps = [['本人・役割・端末', S.invited && S.approved], ['アプリ・データ', S.prepared], ['カメラ・練習', S.prepared], ['オフライン準備', S.prepared]];
  return page('端末事前準備', `<div class="card stack"><div class="notice ${S.prepared ? '' : 'warn'}">${S.prepared ? '準備完了 · データ版 ' + S.version + ' · オフライン利用期限 2027/10/11' : '事前準備が完了していません。通信可能な場所で実行してください。'}</div>${steps.map(([n, ok]) => `<div class="row between"><strong>${n}</strong><span class="pill ${ok ? '' : 'warn'}">${ok ? '✓ 完了' : '未完了'}</span></div>`).join('')}<div class="row">${btn('事前準備を開始', 'prepare', 'primary')}${btn('架空データで練習', 'practice')}</div></div>`, '確認項目ごとの結果を表示します。');
}

function day() {
  return page('当日受付', `<div class="grid"><section class="card action"><h3>QR受付</h3><p>読取り後は結果を全面表示し、「次へ」まで追加読取りを止めます。</p>${btn('カメラを開く', 'camera', 'primary')}</section><section class="card action"><h3>会場席</h3><p>役割によって閲覧と管理操作を分けます。</p>${btn('会場席を見る', 'venue')}</section><section class="card action"><h3>例外・連絡</h3><p>未読連絡と確認が必要な記録を確認します。</p>${btn('スタッフ連絡を見る', 'messages')}</section></div><div class="card" style="margin-top:16px">${status()}<p style="margin-top:12px">${S.started ? '当日運用中' : '準備中：本番受付の開始前です。操作確認用の架空QRは試せます。'}</p>${S.role !== '一般受付担当者' ? btn('当日管理へ', 'management') : ''}</div>`, '画面上の受付操作は架空データによる模擬動作です。');
}

function camera() {
  return page('QR受付', `<div class="camera"><div class="camera-inner"><h2>QRを枠内へ</h2><p>${S.noticeOpen ? '連絡を表示中：読取り停止' : '架空QRの判定を選んで試してください'}</p></div></div><div class="camera-actions">${btn(S.light ? 'ライトを消す' : 'ライトを点ける', 'light')}${['success', 'duplicate', 'invalid', 'special', 'failure'].map((v, i) => btn(['初回受付', '受付済み', '受付不可', '要確認', '保存失敗'][i], `scan:${v}`)).join('')}</div><p class="small muted" style="margin-top:14px">実カメラは起動しません。ライト表示は対応端末を想定した操作見本です。</p>`, '追加読取りの停止、連絡表示、戻る操作を確認します。');
}

function result() {
  let data = {
    success: ['✓', '受付しました', '1階 A列 A-12', ''],
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
  let p = S.people.find(x => x.seat === S.seat),
    admin = S.role !== '一般受付担当者';
  return page('会場席管理', `<div class="card stack"><div class="row between"><strong>未受付 42 / 来場済み 258</strong><div class="row">${btn('座席表', 'mapView', S.view === 'map' ? 'primary' : 'secondary')}${btn('一覧', 'listView', S.view === 'list' ? 'primary' : 'secondary')}</div></div><details open><summary>会場画像を表示／隠す</summary><div class="venue"><div style="width:100%;height:100%;transform:scale(${S.imageZoom})">${venueSvg()}</div></div><div class="venue-controls">${btn('前の画像', 'prevImage')}${btn('次の画像', 'nextImage')}<span>${S.imageIndex}/2</span>${btn('縮小', 'imageOut')}${btn('拡大', 'imageIn')}</div><small>図解用の架空画像。実画像の取得は行いません。</small></details>${S.view === 'map' ? canvas() : `<div class="tablewrap"><table class="table"><thead><tr><th>席番号</th><th>座席表示名</th><th>状態</th></tr></thead><tbody>${S.people.filter(x => x.seat).map(x => `<tr><td><button data-seat="${x.seat}" class="textbtn">${x.seat}</button></td><td>${esc(x.label)}</td><td>${S.arrived === x.seat ? '来場済み' : '未受付'}</td></tr>`).join('')}</tbody></table></div>`}<div class="preview"><strong>選択中：${esc(S.seat)}</strong><p>状態：${S.arrived === S.seat ? '来場済み' : '未受付'} · 座席表示名：${p ? esc(p.label) : '未割当'}</p>${admin ? `<p>購入者名：${p ? esc(p.name) : '－'}</p><div class="row">${btn('座席表示名を変更', 'changeLabel')}${btn(S.arrived === S.seat ? '未受付へ訂正' : '手動受付', 'manual', 'primary')}</div>` : ''}</div></div>`, '一般受付担当者では直接編集操作と購入者名を表示しません。');
}

function messages() {
  return page('スタッフ連絡', `<div class="card stack"><div class="notice ${S.online ? '' : 'warn'}">${S.online ? '取得済みのスタッフ連絡を表示しています。' : 'オフライン中は新しい連絡を受信できない場合があります。'}</div><div class="preview"><strong>重要 · 集合場所の確認</strong><p>架空の運営連絡です。受付担当者は開始前に内容を確認してください。</p></div><div class="preview"><strong>通常 · 座席案内</strong><p>案内板は会場入口の右側にあります。</p></div>${btn('確認して戻る', 'messagesBack', 'primary')}</div>`, '準備画面からも連絡へ進めます。');
}

function management() {
  return page('当日管理', `<div class="grid two"><section class="card stack"><h3>紛失端末・例外締め</h3><p>端末：見本端末 02 · 最終同期 18:10</p><span class="pill ${S.stopped ? 'danger' : 'warn'}">${S.stopped ? '停止済み・未同期あり' : '稼働中'}</span>${btn('端末を停止', 'stopDevice', 'dangerbtn')}${btn('停止中の受付記録を確認', 'stoppedRecords')}</section><section class="card stack"><h3>期限切れと削除案内</h3><p>過去の詳細履歴が残る場合、次回管理画面起動時に削除が必要な理由を案内します。</p>${btn('削除案内を表示', 'deleteNotice')}</section></div><div class="card" style="margin-top:16px"><h3>公演終了</h3>${btn('締め画面へ', 'close')} ${btn('公演後の再ログイン表示', 'relogin')}</div>`, '停止後の記録を自動採用しないことを確認します。');
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
    staff,
    device,
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
  const seat = canvas?.querySelector('.seat.selected');
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
  document.title = `${screens[S.screen]} · UIモック`;
  $('app').innerHTML = `<div class="shell">${nav()}<main class="main">${header()}<div class="content">${body()}</div></main></div>${modal()}${S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : ''}`;
  sizeCanvas();
  if (S.modal) document.querySelector('.modal button')?.focus();
}

function openModal(title, body, buttons) {
  S.modal = {
    title,
    body,
    buttons
  };
  render();
}

function closeModal() {
  S.modal = null;
  render();
}

// 画面移動の入口。未保存の編集があれば、移動前に扱いを選んでもらう。
function go(target, force = false, fromBrowser = false) {
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
    S.history.push(S.screen);
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
    p[k] = !p[k];
    S.modal = null;
    return toast(`${checkLabels[k]}を${p[k] ? '済み' : '未済み'}にしました`);
  }
  switch (action) {
    case 'modalClose':
      return closeModal();

    case 'back':
      return go(S.history.pop() || 'day');

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
      S.panelBottom = !S.panelBottom;
      return render();

    case 'panelCollapse':
      S.panelCollapsed = !S.panelCollapsed;
      return render();

    case 'makeGap':
    case 'makeSpace':
      if (S.people.some(p => p.seat === S.seat)) return toast('配置済みの席は空間や欠番にできません');
      S.gapSeats.delete(S.seat);
      S.spaceSeats.delete(S.seat);
      (action === 'makeGap' ? S.gapSeats : S.spaceSeats).add(S.seat);
      S.dirty = true;
      return toast(`${S.seat}を${action === 'makeGap' ? '欠番' : '空間'}にしました`);

    case 'place':
      {
        let id = +$('person-to-place')?.value,
          p = S.people.find(x => x.id === id);
        if (!p) return;
        if (S.people.some(x => x.seat === S.seat)) return toast('この席には既に配置されています');
        p.seat = S.seat;
        S.dirty = true;
        return toast(`${p.name}を${S.seat}へ仮配置しました`);
      }

    case 'sortReverse':
      S.sortReverse = !S.sortReverse;
      return render();

    case 'bulk':
      {
        let k = $('bulk-field').value;
        if (!S.selectedIds.size) return toast('対象を選択してください');
        if (k === 'issued' && [...S.selectedIds].some(id => !S.people.find(p => p.id === id).seat)) return toast('席未割当の方には発行できません');
        return confirmAction('一斉チェック', `対象 ${S.selectedIds.size}件の「${checkLabels[k]}」を済みにします。`, `bulkDo:${k}`);
      }

    case 'bulkDo:purchase':
    case 'bulkDo:payment':
    case 'bulkDo:issued':
    case 'bulkDo:delivered':
      {
        let k = action.slice(7);
        S.selectedIds.forEach(id => S.people.find(p => p.id === id)[k] = true);
        S.modal = null;
        return toast(`${checkLabels[k]}を更新しました`);
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
      return openModal(S.arrived === S.seat ? '来場状態の訂正' : '手動受付', `<p>対象席：${esc(S.seat)}</p>${S.arrived === S.seat ? '<label class="field">訂正理由<input id="correction-reason"></label>' : ''}`, [{
        label: '確認して記録',
        action: 'manualDo',
        style: 'primary'
      }, {
        label: '戻る',
        action: 'modalClose'
      }]);

    case 'manualDo':
      if (S.arrived === S.seat && !$('correction-reason')?.value.trim()) return toast('訂正理由を入力してください');
      S.arrived = S.arrived === S.seat ? null : S.seat;
      S.modal = null;
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
    const canvas = $('canvas');
    const scrollLeft = canvas?.scrollLeft ?? 0;
    const scrollTop = canvas?.scrollTop ?? 0;
    S.seat = seat.dataset.seat;
    render();
    return $('canvas')?.scrollTo({ left: scrollLeft, top: scrollTop });
  }

  let screen = e.target.closest('[data-screen]');
  if (screen) return go(screen.dataset.screen);

  let check = e.target.closest('[data-check]');
  if (check) {
    let [id, k] = check.dataset.check.split(':'),
      p = S.people.find(x => x.id === +id);
    if (k === 'issued' && !p.seat && !p.issued) return toast('席未割当の方には発行できません');
    return confirmAction(`${checkLabels[k]}を変更`, `${esc(p.name)} · ${p.seat || '席未割当'}：${p[k] ? '済み → 未済み' : '未済み → 済み'}。他のチェック項目は変更しません。`, `checkConfirm:${id}:${k}`);
  }

  let act = e.target.closest('[data-action]');
  if (act) handle(act.dataset.action);
});

// 入力中は画面全体を再描画せず、S と未保存表示だけを更新して入力位置を保つ。
document.addEventListener('input', e => {
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
  if (e.target.id === 'person-to-place') {
    S.personToPlace = +e.target.value;
    $('selected-person-name').textContent = S.people.find(p => p.id === S.personToPlace)?.name || '対象なし';
  }
  if (e.target.dataset.role !== undefined) {
    S.role = e.target.value;
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
    S.people.find(p => p.id === +e.target.dataset.method).method = e.target.value;
    toast('交付方法を変更しました（模擬）');
  }
  if (e.target.dataset.select) {
    let id = +e.target.dataset.select;
    e.target.checked ? S.selectedIds.add(id) : S.selectedIds.delete(id);
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

// 起動時に履歴の起点を登録し、初期状態の S で最初の画面を表示する。
window.history.replaceState({
  screen: 'home'
}, '', '#home');

render();
