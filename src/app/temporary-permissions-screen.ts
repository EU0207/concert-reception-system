// 臨時管理者の固定9項目と有効期間を表示し、確認・暗号化保存・結果回収へ接続する。

import { actionGroup, button, el, formError, showDialog } from './dom.ts';
import { watchDialogValidity } from './dialog-validation.ts';
import { RECENT_AUTH_WINDOW } from '../domain/authorization/policy.ts';
import { temporaryPermissionLabels as labels } from './temporary-permission-labels.ts';
import { TEMPORARY_PERMISSIONS } from '../domain/authorization/types.ts';
import type { RoleGrant, TemporaryProfile, TemporaryPermission } from '../domain/authorization/types.ts';
import { changeTemporaryPermissions } from '../domain/authorization/role-management.ts';
import { SeatDomainError } from '../domain/seats/validation.ts';
import type { PermissionView, PendingPermission, PermissionOutcome, TemporaryPermissionsUiPort } from './temporary-permissions-types.ts';

/** 設定値を色付きの記号だけで示し、読み上げ用の意味を保持する。 */
function permissionMark(enabled: boolean) {
  const mark = el('span', `permission-mark ${enabled ? 'permission-mark-on' : 'permission-mark-off'}`, enabled ? '○' : '×');
  mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', enabled ? 'ON' : 'OFF');
  return mark;
}

/** 保存値が固定9項目の現在版に一致するか判定し、欠損を全ONで補わない。 */
function validProfile(role: RoleGrant, profile: TemporaryProfile | null): profile is TemporaryProfile {
  return role.role === 'temporary' && !!profile && profile.schemaVersion === 1 && profile.humanUid === role.humanUid && profile.roleVersion === role.revision &&
    ['active', 'revoked'].includes(profile.status) && Number.isSafeInteger(profile.validFrom) && Number.isSafeInteger(profile.validUntil) &&
    role.startsAt <= profile.validFrom && profile.validFrom < profile.validUntil && profile.validUntil <= role.endsAt &&
    !!profile.permissions && Object.keys(profile.permissions).length === 9 && TEMPORARY_PERMISSIONS.every(key => typeof profile.permissions[key] === 'boolean') &&
    (profile.status !== 'revoked' || TEMPORARY_PERMISSIONS.every(key => profile.permissions[key] === false));
}

/** 端末のタイムゾーンで、秒単位の日時入力値を作る。保存時は元のミリ秒を維持する。 */
function localDate(value: number): string {
  const date = new Date(value), parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}T${String(parts[3]).padStart(2, '0')}:${String(parts[4]).padStart(2, '0')}:${String(parts[5]).padStart(2, '0')}`;
}

/** 内部のエラーや識別情報を出さず、利用者が再確認できる案内へ変換する。 */
function message(cause: unknown): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  if (code === 'RECENT_AUTH_REQUIRED') return '本人確認の更新が必要です。再認証してから開き直してください。';
  if (code === 'INVALID_PROFILE_PERIOD') return '有効期間は、臨時管理者の役割の期間内で、終了を開始より後にしてください。期限切れの期間は保存できません。';
  if (code === 'STALE_OR_INACTIVE_TARGET') return '設定や対象の役割が更新されています。最新の設定を確認してください。';
  return '設定を変更できませんでした。接続・権限と最新の設定を確認してください。';
}

/** 設定の一覧・編集確認と、応答不明時の同一ID回収を表示する。 */
export function createTemporaryPermissionsScreen(port: TemporaryPermissionsUiPort, preview = false) {
  const root = el('section', 'temporary-permissions-screen');
  let view: PermissionView | undefined, pending: PendingPermission[] = [], busy = false, locked = true, disposed = false, version = 0;
  let error = '', notice = '', dialog: HTMLDialogElement | undefined;

  /** 最新の認可・設定を取得し、失敗や古い応答では一覧を表示しない。 */
  async function load() {
    if (disposed || busy) return;
    const current = ++version; busy = true; locked = true; error = ''; render();
    try {
      const result = await port.load();
      if (disposed || current !== version) return;
      view = result; pending = result.pending; locked = false;
    } catch (cause) { if (!disposed && current === version) { view = undefined; error = message(cause); } }
    finally { if (!disposed && current === version) { busy = false; render(); } }
  }

  /** 確定・取消しの結果を案内し、最新設定の取得失敗とは区別する。 */
  async function completed(id: string, outcome: PermissionOutcome, current: number) {
    pending = pending.filter(item => item.input.operationId !== id); locked = true; view = undefined;
    notice = outcome === 'committed' ? '権限設定の変更が確定しました。' : '未確定の変更案を取り消しました。現在の設定は変更していません。';
    try {
      const result = await port.load();
      if (disposed || current !== version) return;
      view = result; pending = result.pending; locked = false;
    } catch { if (!disposed && current === version) error = '結果は確定しましたが、最新設定を取得できません。接続・権限を確認して再取得してください。'; }
    if (disposed || current !== version) return;
    const body = el('div'); body.append(el('p', '', notice), el('p', '', error || '最新の設定を表示します。'));
    dialog = showDialog('結果を確認しました', body);
  }

  /** 固定入力を保存してから確定し、再試行・照会・取消しでも新しいIDを作らない。 */
  async function act(change: PendingPermission, action: 'save' | 'retry' | 'query' | 'cancel') {
    if (busy || disposed || (locked && action !== 'query')) return;
    const current = ++version, id = change.input.operationId;
    let prepared = action !== 'save';
    busy = true; error = notice = ''; render();
    try {
      if (action === 'save') {
        await port.prepare(change); prepared = true;
        if (disposed) return;
        if (!pending.some(item => item.input.operationId === id)) pending.push(change);
      }
      if (disposed || current !== version || (locked && action !== 'query')) return;
      let outcome: PermissionOutcome | null = null;
      if (action !== 'save') outcome = await port.receipt(id);
      if (!outcome && action !== 'query') outcome = action === 'cancel' ? await port.cancel(id) : await port.commit(id);
      if (disposed || current !== version) return;
      if (outcome) await completed(id, outcome, current);
      else notice = '確定結果はまだ確認できません。同じ操作の再試行、または未確定案の取消しができます。';
    } catch (cause) {
      if (!disposed && current === version) error = prepared ? '結果を確認できません。「結果を確認」してください。自動再送は行いません。' : message(cause);
    } finally { if (!disposed && current === version) { busy = false; render(); } }
  }

  /** 9項目と期間を編集し、変更前後を確認してから固定入力へ渡す。 */
  function edit(role: RoleGrant, profile: TemporaryProfile) {
    if (busy || locked || !view || pending.length) return;
    const basis = structuredClone(view), basisAt = performance.now(), values = structuredClone(profile.permissions), body = el('div', 'permission-edit-body');
    const checks = new Map<TemporaryPermission, HTMLInputElement>();
    const allLabel = el('label', 'permission-all'), all = el('input'); all.type = 'checkbox';
    allLabel.append(all, el('span', '', 'すべて選択／解除'));

    /** 全選択・未選択・一部選択を、個別項目の現在値へ揃える。 */
    function updateSelection() {
      const count = TEMPORARY_PERMISSIONS.filter(key => values[key]).length;
      all.checked = count === TEMPORARY_PERMISSIONS.length;
      all.indeterminate = count > 0 && count < TEMPORARY_PERMISSIONS.length;
    }

    body.append(el('p', '', `対象：臨時管理者（${role.humanUid.slice(-8)}）`),
      el('p', 'muted', '受付開始・停止、端末管理、役割変更などの禁止操作は、この設定では許可できません。'), allLabel);
    for (const key of TEMPORARY_PERMISSIONS) {
      const label = el('label', 'permission-option'), input = el('input'); input.type = 'checkbox'; input.checked = values[key];
      input.addEventListener('change', () => { values[key] = input.checked; updateSelection(); }); checks.set(key, input); label.append(input, el('span', '', labels[key])); body.append(label);
    }
    // 一括変更は編集中の値だけに反映し、確認・保存までは送信しない。
    all.addEventListener('change', () => {
      for (const key of TEMPORARY_PERMISSIONS) { values[key] = all.checked; checks.get(key)!.checked = all.checked; }
      updateSelection();
    });
    updateSelection();
    const start = el('input'), end = el('input');
    for (const input of [start, end]) { input.type = 'datetime-local'; input.step = '1'; }
    start.value = localDate(profile.validFrom); end.value = localDate(profile.validUntil);
    // datetime-localは00秒を省略するため、代入前の文字列ではなく正規化後の値と比較する。
    const initialStart = start.value, initialEnd = end.value;
    const startLabel = el('label', 'seat-field', '有効開始'), endLabel = el('label', 'seat-field', '有効終了');
    const period = el('div', 'permission-period');
    startLabel.append(start); endLabel.append(end); period.append(startLabel, endLabel); body.append(period,
      el('p', 'muted', `日時はこの端末の時刻（${Intl.DateTimeFormat().resolvedOptions().timeZone}）で入力します。`),
      el('p', 'muted', `設定できる期間：${new Date(role.startsAt).toLocaleString('ja-JP')} ～ ${new Date(Math.min(role.endsAt, basis.snapshot.staffDeadline)).toLocaleString('ja-JP')}`));
    const validation = formError('権限設定を確認してください');
    const operationId = crypto.randomUUID();

    /** 選択中の項目と日時を、固定する入力へコピーする。 */
    function changeInput(): PendingPermission {
      const from = start.value === initialStart ? profile.validFrom : Date.parse(start.value);
      const until = end.value === initialEnd ? profile.validUntil : Date.parse(end.value);
      return { targetUid: role.humanUid, input: { operationId, expectedRevision: role.revision,
        revoke: false, validFrom: from, validUntil: until, permissions: structuredClone(values) } };
    }

    /** 入力時点で検査し、不正な期間の確認操作を無効にする。 */
    function validate() {
      if (preview && Date.now() > basis.serverNow + RECENT_AUTH_WINDOW) return { reason: 'この見本の確認期限が過ぎています。ページを再読み込みして開き直してください。' };
      const { input } = changeInput();
      const now = basis.serverNow + Math.max(0, Math.floor(performance.now() - basisAt));
      try { changeTemporaryPermissions(basis.snapshot, role, input, now); return { reason: '' }; }
      catch (cause) { return { reason: message(cause), fields: cause instanceof SeatDomainError && cause.code === 'INVALID_PROFILE_PERIOD' ? [start, end] : [] }; }
    }

    /** 編集値を検証し、変更前後の確認を開く。取消しでは保存しない。 */
    function confirm() {
      if (locked || disposed || !refresh()) return;
      const change = changeInput(), from = change.input.validFrom, until = change.input.validUntil;
      const summary = el('div'); summary.append(el('p', '', `対象：臨時管理者（${role.humanUid.slice(-8)}）`));
      for (const key of TEMPORARY_PERMISSIONS) {
        const row = el('p', 'permission-row');
        row.append(el('span', '', `${labels[key]}：`), permissionMark(profile.permissions[key]), el('span', '', ' → '), permissionMark(values[key]));
        summary.append(row);
      }
      summary.append(el('p', '', `有効期間：${new Date(from).toLocaleString('ja-JP')} ～ ${new Date(until).toLocaleString('ja-JP')}`),
        el('p', '', TEMPORARY_PERMISSIONS.every(key => !values[key]) ? '全項目×の新しい版として保存します。一般受付の共通操作と保存済みの記録は保持します。' : '変更後は端末ごとの追加準備が必要です。準備前に新しい管理権限は使えません。'));
      dialog?.close(); dialog = showDialog('権限設定の確認', summary, [button('この内容で保存', () => { dialog?.close(); void act(change, 'save'); })], 'キャンセル');
    }

    const action = button('変更内容を確認', confirm);
    dialog = showDialog('臨時管理者の権限設定', body, [action], 'キャンセル');
    dialog.classList.add('permission-edit-dialog');
    // 9項目の下へエラーを隠さず、確認ボタンの直前へ固定する。
    dialog.querySelector('.dialog-actions')!.before(validation.element);
    const refresh = watchDialogValidity(dialog, [start, end], action, validation, validate);
  }

  /** 現在の設定と未確認結果を分離し、未取得を既定の全ONで表示しない。 */
  function render() {
    if (disposed) return;
    root.replaceChildren(el('h2', '', '臨時管理者の権限設定'));
    if (preview) root.append(el('p', 'notice', '画面確認用の見本です。実際の権限やスタッフ登録は変更しません。'));
    const alert = el('p', 'device-error', error), status = el('p', 'muted', busy ? '確認しています…' : notice);
    alert.setAttribute('role', 'alert'); status.setAttribute('role', 'status');
    const toolbar = actionGroup(button('最新の設定を確認', () => { void load(); }, 'button secondary'));
    toolbar.classList.add('management-toolbar'); root.append(alert, status, toolbar);
    if (locked) root.append(el('p', 'notice', '権限設定は最新の認可確認が必要です。'));
    for (const change of pending) {
      const box = el('div', 'notice'), actions = actionGroup(button('結果を確認', () => { void act(change, 'query'); }, 'button secondary'));
      box.append(el('p', '', `結果未確認：臨時管理者（${change.targetUid.slice(-8)}）`), actions);
      if (!locked) actions.append(button('同じ操作を再試行', () => { void act(change, 'retry'); }, 'button secondary'), button('未確定案を取り消す', () => { void act(change, 'cancel'); }, 'button secondary'));
      root.append(box);
    }
    if (view && !locked) {
      if (view.obsolete.length) root.append(el('p', 'notice', `版が変わった未確定入力${view.obsolete.length}件は保持しています。再送せず、現在の設定を確認してください。`));
      if (!view.targets.length) root.append(el('p', '', '臨時管理者は登録されていません。役割の任命は別の操作です。'));
      for (const { role, profile } of view.targets) {
        const card = el('section', 'panel permission-card'); card.append(el('h3', '', `臨時管理者（${role.humanUid.slice(-8)}）`));
        if (!validProfile(role, profile)) card.append(el('p', 'device-error', '現在の権限設定を確認できません。既定値は自動適用しません。'));
        else {
          const active = profile.status === 'active' && profile.validFrom <= view.serverNow && view.serverNow < profile.validUntil;
          const count = TEMPORARY_PERMISSIONS.filter(key => profile.permissions[key]).length;
          card.append(el('p', '', profile.status === 'revoked' ? '設定取消済み（全項目×）' : active ? `許可する項目：${count}／9` : '有効期間外'),
            el('p', 'muted', `有効期間：${new Date(profile.validFrom).toLocaleString('ja-JP')} ～ ${new Date(profile.validUntil).toLocaleString('ja-JP')}`));
          for (const key of TEMPORARY_PERMISSIONS) {
            const row = el('p', 'permission-row'); row.append(el('span', '', `${labels[key]}：`), permissionMark(profile.permissions[key])); card.append(row);
          }
          card.append(el('p', 'muted', 'この設定だけで業務は許可されません。現在の本人・端末と追加準備も確認されます。'));
          if (count === 0) card.append(el('p', 'notice', '管理操作はすべて×です。一般受付の共通操作と保存済みの記録は保持します。'));
          if (!pending.length && role.active && role.startsAt <= view.serverNow && view.serverNow < Math.min(role.endsAt, view.snapshot.staffDeadline)) card.append(button('権限を設定', () => edit(role, profile)));
        }
        root.append(card);
      }
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('button')) control.disabled = busy;
  }

  // 失効通知で表示中の設定とダイアログを閉じ、保存済み入力は保持する。
  const unsubscribe = port.onInvalidate(() => { version++; locked = true; busy = false; view = undefined; dialog?.close(); render(); });

  /** 表示と購読だけを終了し、保存済み入力・鍵を削除しない。 */
  function dispose() { disposed = true; version++; dialog?.close(); unsubscribe(); port.dispose(); view = undefined; pending = []; root.replaceChildren(); }

  render(); void load();
  return { element: root, dispose };
}
