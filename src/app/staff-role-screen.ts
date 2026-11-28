// 一般受付と臨時管理者の任命・解除を表示し、固定入力の保存と結果回収へ接続する。

import { actionGroup, button, el, formError, showDialog } from './dom.ts';
import { watchDialogValidity } from './dialog-validation.ts';
import { createRoleDisplayClock, staffRoleDisplayName, temporaryTermEnded } from './staff-role-display.ts';
import { TEMPORARY_PERMISSIONS } from '../domain/authorization/types.ts';
import { temporaryPermissionLabels as labels } from './temporary-permission-labels.ts';
import type { RoleGrant, TemporaryPermission } from '../domain/authorization/types.ts';
import { createRoleChangeRequest } from '../domain/authorization/role-management.ts';
import { RECENT_AUTH_WINDOW } from '../domain/authorization/policy.ts';
import { SeatDomainError } from '../domain/seats/validation.ts';
import type { StaffRoleView, PendingStaffRole, StaffRoleOutcome, StaffRoleUiPort } from './staff-role-types.ts';

/** 端末のタイムゾーンで、秒単位の日時入力値を作る。保存時は元のミリ秒を維持する。 */
function localDate(value: number): string {
  const date = new Date(value), parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}T${String(parts[3]).padStart(2, '0')}:${String(parts[4]).padStart(2, '0')}:${String(parts[5]).padStart(2, '0')}`;
}

/** 内部のエラーや識別情報を出さず、利用者が再確認できる案内へ変換する。 */
function message(cause: unknown): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  if (code === 'RECENT_AUTH_REQUIRED') return '本人確認の更新が必要です。再認証してから開き直してください。';
  if (code === 'INVALID_ROLE_PERIOD') return '有効期間を入力し、終了を開始より後、公演のスタッフ利用期限以内にしてください。期限切れの期間は保存できません。';
  if (code === 'STALE_OR_INACTIVE_TARGET') return '設定や対象の役割が更新されています。最新の役割を確認してください。';
  return '設定を変更できませんでした。接続・権限と最新の役割を確認してください。';
}

/** 設定の一覧・編集確認と、応答不明時の同一ID回収を表示する。 */
export function createStaffRoleScreen(port: StaffRoleUiPort, preview = false) {
  const root = el('section', 'temporary-permissions-screen');
  let view: StaffRoleView | undefined, pending: PendingStaffRole[] = [], busy = false, locked = true, disposed = false, version = 0;
  let displayClock: ReturnType<typeof createRoleDisplayClock> | undefined;
  let error = '', notice = '', dialog: HTMLDialogElement | undefined;

  /** 現在の一覧を採用し、任期境界で表示だけを更新する。 */
  function applyView(result: StaffRoleView) {
    displayClock?.dispose(); view = result; pending = result.pending; locked = false;
    displayClock = createRoleDisplayClock(result.targets.map(item => item.role), result.snapshot.staffDeadline, result.serverNow,
      () => { if (!disposed && !locked && !busy) render(); });
  }

  /** 最新の認可・設定を取得し、失敗や古い応答では一覧を表示しない。 */
  async function load() {
    if (disposed || busy) return;
    displayClock?.dispose(); displayClock = undefined;
    const current = ++version; busy = true; locked = true; error = ''; render();
    try {
      const result = await port.load();
      if (disposed || current !== version) return;
      applyView(result);
    } catch (cause) { if (!disposed && current === version) { view = undefined; error = message(cause); } }
    finally { if (!disposed && current === version) { busy = false; render(); } }
  }

  /** 確定・取消しの結果を案内し、最新設定の取得失敗とは区別する。 */
  async function completed(id: string, outcome: StaffRoleOutcome, current: number) {
    displayClock?.dispose(); displayClock = undefined;
    pending = pending.filter(item => item.input.operationId !== id); locked = true; view = undefined;
    notice = outcome === 'committed' ? '役割の変更が確定しました。' : '未確定の変更案を取り消しました。現在の役割は変更していません。';
    try {
      const result = await port.load();
      if (disposed || current !== version) return;
      applyView(result);
    } catch { if (!disposed && current === version) error = '結果は確定しましたが、最新設定を取得できません。接続・権限を確認して再取得してください。'; }
    if (disposed || current !== version) return;
    const body = el('div'); body.append(el('p', '', notice), el('p', '', error || '最新の役割を表示します。'));
    dialog = showDialog('結果を確認しました', body);
  }

  /** 固定入力を保存してから確定し、再試行・照会・取消しでも新しいIDを作らない。 */
  async function act(change: PendingStaffRole, action: 'save' | 'retry' | 'query' | 'cancel') {
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
      let outcome: StaffRoleOutcome | null = null;
      if (action !== 'save') outcome = await port.receipt(id);
      if (!outcome && action !== 'query') outcome = action === 'cancel' ? await port.cancel(id) : await port.commit(id);
      if (disposed || current !== version) return;
      if (outcome) await completed(id, outcome, current);
      else notice = '確定結果はまだ確認できません。同じ操作の再試行、または未確定案の取消しができます。';
    } catch (cause) {
      if (!disposed && current === version) error = prepared ? '結果を確認できません。「結果を確認」してください。自動再送は行いません。' : message(cause);
    } finally { if (!disposed && current === version) { busy = false; render(); } }
  }

  /** 任命・再任命時の期間と9項目を編集し、選んだ設定だけを一体保存する。 */
  function edit(role: RoleGrant) {
    if (busy || locked || !view || pending.length) return;
    const basis = structuredClone(view), basisAt = performance.now(), body = el('div', 'permission-edit-body');
    basis.serverNow = displayClock?.now() ?? basis.serverNow;
    const operationId = crypto.randomUUID(), originalStart = basis.serverNow, originalEnd = basis.snapshot.staffDeadline;
    const values = Object.fromEntries(TEMPORARY_PERMISSIONS.map(key => [key, true])) as Record<TemporaryPermission, boolean>;
    const reappointment = role.role === 'temporary';
    body.append(el('p', '', `対象：${role.humanUid.slice(-8)}`), el('p', '', reappointment ? '任期終了した臨時管理者を、権限を設定し直して再任命します。' : '一般受付 → 臨時管理者'));
    const start = el('input'), end = el('input');
    for (const input of [start, end]) { input.type = 'datetime-local'; input.step = '1'; }
    start.value = localDate(originalStart); end.value = localDate(originalEnd);
    const initialStart = start.value, initialEnd = end.value;
    const startLabel = el('label', 'seat-field', '有効開始'), endLabel = el('label', 'seat-field', '有効終了');
    startLabel.append(start); endLabel.append(end);
    const period = el('div', 'permission-period'); period.append(startLabel, endLabel); body.append(period,
      el('p', 'muted', `日時はこの端末の時刻（${Intl.DateTimeFormat().resolvedOptions().timeZone}）で入力します。`),
      el('p', 'muted', `スタッフ利用期限：${new Date(basis.snapshot.staffDeadline).toLocaleString('ja-JP')}`),
      el('h3', '', '許可する権限'), el('p', 'muted', 'チェックした権限だけを任命と同時に保存します。保存前には反映しません。'));
    const allLabel = el('label', 'permission-all'), all = el('input'); all.type = 'checkbox'; all.checked = true;
    allLabel.append(all, el('span', '', 'すべて選択／解除')); body.append(allLabel);
    const checks = new Map<TemporaryPermission, HTMLInputElement>();

    /** 個別の選択数を一括チェックの三状態へ反映する。 */
    function selection() {
      const count = TEMPORARY_PERMISSIONS.filter(key => values[key]).length;
      all.checked = count === 9; all.indeterminate = count > 0 && count < 9;
    }

    for (const key of TEMPORARY_PERMISSIONS) {
      const label = el('label', 'permission-option'), input = el('input'); input.type = 'checkbox'; input.checked = true;
      input.addEventListener('change', () => { values[key] = input.checked; selection(); });
      checks.set(key, input); label.append(input, el('span', '', labels[key])); body.append(label);
    }
    all.addEventListener('change', () => {
      for (const key of TEMPORARY_PERMISSIONS) { values[key] = all.checked; checks.get(key)!.checked = all.checked; }
      selection();
    });
    const validation = formError('任命の設定を確認してください');

    /** 現在の入力をコピーし、確認した9項目を固定案へ含める。 */
    function change(): PendingStaffRole {
      return { targetUid: role.humanUid, input: { operationId, expectedRevision: role.revision, nextRole: 'temporary',
        startsAt: start.value === initialStart ? originalStart : Date.parse(start.value),
        endsAt: end.value === initialEnd ? originalEnd : Date.parse(end.value), initialPermissions: structuredClone(values) } };
    }

    /** 不正な日時と期限を入力中に検出し、確認ボタンの隣に理由を示す。 */
    function validate() {
      const now = basis.serverNow + Math.max(0, Math.floor(performance.now() - basisAt)), input = change().input;
      if (preview && Date.now() > basis.snapshot.session.humanAuthTime + RECENT_AUTH_WINDOW) {
        return { reason: 'この見本の確認期限が過ぎています。ページを再読み込みして開き直してください。' };
      }
      const missing = [start, end].filter((_, index) => !Number.isFinite(index === 0 ? input.startsAt : input.endsAt));
      if (missing.length) return { reason: '有効開始と有効終了を入力してください。', fields: missing };
      if (input.startsAt >= input.endsAt) return { reason: '有効終了は、有効開始より後の日時にしてください。', fields: [end] };
      if (input.endsAt <= now) return { reason: '有効終了が過去になっています。現在より後の日時にしてください。', fields: [end] };
      if (input.endsAt > basis.snapshot.staffDeadline) return { reason: `有効終了をスタッフ利用期限（${new Date(basis.snapshot.staffDeadline).toLocaleString('ja-JP')}）までにしてください。`, fields: [end] };
      try { createRoleChangeRequest(basis.snapshot, role, input, now); return { reason: '' }; }
      catch (cause) { return { reason: message(cause), fields: cause instanceof SeatDomainError && cause.code === 'INVALID_ROLE_PERIOD' ? [start, end] : [] }; }
    }

    /** 変更内容を読み直し、期間と選択した権限を確認してから保存へ進む。 */
    function confirm() {
      if (locked || disposed || !refresh()) return;
      const pending = change(), summary = el('div');
      summary.append(el('p', '', `対象：${role.humanUid.slice(-8)}`), el('p', '', reappointment ? '臨時管理者に再任命' : '一般受付 → 臨時管理者'),
        el('p', '', `有効期間：${new Date(pending.input.startsAt).toLocaleString('ja-JP')} ～ ${new Date(pending.input.endsAt).toLocaleString('ja-JP')}`));
      const permissions = el('ul', 'appointment-permission-summary'); permissions.setAttribute('aria-label', '任命する権限');
      for (const key of TEMPORARY_PERMISSIONS) {
        const row = el('li', values[key] ? '' : 'permission-summary-off');
        const mark = el('span', `permission-mark ${values[key] ? 'permission-mark-on' : 'permission-mark-off'}`, values[key] ? '○' : '×');
        mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', values[key] ? 'ON' : 'OFF');
        row.append(mark, el('span', '', labels[key])); permissions.append(row);
      }
      summary.append(permissions);
      summary.append(el('p', '', 'このスタッフの全ての端末に反映します。'));
      dialog?.close(); dialog = showDialog(reappointment ? '再任命の確認' : '任命の確認', summary,
        [button(reappointment ? '再任命する' : '任命する', () => { dialog?.close(); void act(pending, 'save'); })], 'キャンセル');
    }

    const action = button('変更内容を確認', confirm);
    dialog = showDialog(reappointment ? '臨時管理者に再任命' : '臨時管理者に任命', body, [action], 'キャンセル');
    dialog.classList.add('permission-edit-dialog'); dialog.querySelector('.dialog-actions')!.before(validation.element);
    const refresh = watchDialogValidity(dialog, [start, end], action, validation, validate);
  }

  /** 解除は期間編集を出さず、直ちに一般受付へ戻す一つの確認操作とする。 */
  function release(role: RoleGrant) {
    if (busy || locked || !view || pending.length) return;
    const basis = structuredClone(view), basisAt = performance.now(), summary = el('div');
    basis.serverNow = displayClock?.now() ?? basis.serverNow;
    summary.append(el('p', '', `対象：${role.humanUid.slice(-8)}`),
      el('p', '', '臨時管理者を解除し、一般受付に戻します。'),
      el('p', '', `一般受付の利用期限：${new Date(basis.snapshot.staffDeadline).toLocaleString('ja-JP')}`),
      el('p', '', 'このスタッフの全ての端末に反映します。'));
    const id = crypto.randomUUID(), validation = formError('解除の状況を確認してください');

    /** 解除時点の開始時刻を使い、現在の期限・認可を再検査する。 */
    function change(): PendingStaffRole {
      return { targetUid: role.humanUid, input: { operationId: id, expectedRevision: role.revision, nextRole: 'receptionist',
        startsAt: basis.serverNow + Math.max(0, Math.floor(performance.now() - basisAt)), endsAt: basis.snapshot.staffDeadline } };
    }

    /** 解除できない理由を表示し、確定操作も無効にする。 */
    function validate() {
      const pending = change();
      if (preview && Date.now() > basis.snapshot.session.humanAuthTime + RECENT_AUTH_WINDOW) return { reason: 'この見本の確認期限が過ぎています。ページを再読み込みして開き直してください。' };
      if (role.endsAt <= pending.input.startsAt) return { reason: '臨時任期は終了しました。解除は不要です。' };
      try { createRoleChangeRequest(basis.snapshot, role, pending.input, pending.input.startsAt); return { reason: '' }; }
      catch (cause) { return { reason: message(cause) }; }
    }

    const action = button('解除して一般受付へ戻す', () => { if (!refresh()) return; const pending = change(); dialog?.close(); void act(pending, 'save'); });
    dialog = showDialog('臨時管理者の解除', summary, [action], 'キャンセル');
    dialog.querySelector('.dialog-actions')!.before(validation.element);
    const refresh = watchDialogValidity(dialog, [], action, validation, validate);
  }


  /** 現在役割と結果未確認の案を分離し、新規変更の重ね送りを防ぐ。 */
  function render() {
    if (disposed) return;
    root.replaceChildren(el('h2', '', 'スタッフの役割変更'));
    if (preview) root.append(el('p', 'notice', '画面確認用の見本です。実際の権限やスタッフ登録は変更しません。'));
    const alert = el('p', 'device-error', error), status = el('p', 'muted', busy ? '確認しています…' : notice);
    alert.setAttribute('role', 'alert'); status.setAttribute('role', 'status');
    const toolbar = actionGroup(button('最新の役割を確認', () => { void load(); }, 'button secondary'));
    toolbar.classList.add('management-toolbar'); root.append(alert, status, toolbar);
    if (locked) root.append(el('p', 'notice', '役割変更には最新の認可確認が必要です。'));
    for (const change of pending) {
      const box = el('div', 'notice');
      const actions = actionGroup(button('結果を確認', () => { void act(change, 'query'); }, 'button secondary'));
      box.append(el('p', '', `結果未確認：スタッフ（${change.targetUid.slice(-8)}）`), actions);
      if (!locked) actions.append(button('同じ操作を再試行', () => { void act(change, 'retry'); }, 'button secondary'), button('未確定案を取り消す', () => { void act(change, 'cancel'); }, 'button secondary'));
      root.append(box);
    }
    if (view && !locked) {
      const now = displayClock?.now() ?? view.serverNow;
      if (view.obsolete.length) root.append(el('p', 'notice', `再確認が必要な未確定入力${view.obsolete.length}件は保持しています。再送せず、現在の役割を確認してください。`));
      if (!view.targets.length) root.append(el('p', '', '変更できる一般受付・臨時管理者は登録されていません。'));
      for (const { role } of view.targets) {
        const card = el('section', 'panel staff-role-card');
        const actions = actionGroup();
        const expired = temporaryTermEnded(role, now, view.snapshot.staffDeadline);
        card.append(el('h3', '', staffRoleDisplayName(role, now, view.snapshot.staffDeadline) + '（' + role.humanUid.slice(-8) + '）'),
          el('p', 'muted', expired ? '臨時任期は終了しました。' : '有効期間：' + new Date(role.startsAt).toLocaleString('ja-JP') + ' ～ ' + new Date(role.endsAt).toLocaleString('ja-JP')));
        if (!role.active) card.append(el('p', 'notice', 'この本人の役割は無効です。任命で停止解除はできません。'));
        else if (now >= view.snapshot.staffDeadline) card.append(el('p', 'notice', '公演のスタッフ利用期限を過ぎています。この公演では任命できません。'));
        else if (role.startsAt > now) card.append(el('p', 'notice', '役割の有効開始前です。'));
        else if (role.endsAt <= now && !expired) card.append(el('p', 'notice', '一般受付の利用期限が過ぎています。再招待の手続きが必要です。'));
        else if (!pending.length) {
          if (expired) {
            actions.append(button('臨時管理者に再任命', () => edit(role)));
          } else if (role.role === 'receptionist') actions.append(button('臨時管理者に任命', () => edit(role)));
          if (role.role === 'temporary' && !expired) actions.append(button('臨時管理者を解除', () => release(role), 'button secondary'));
        }
        card.append(actions);
        root.append(card);
      }
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('button')) control.disabled = busy;
  }

  // 失効通知では編集中のダイアログも閉じ、保存済み入力と鍵は保持する。
  const unsubscribe = port.onInvalidate(() => { displayClock?.dispose(); displayClock = undefined; version++; locked = true; busy = false; view = undefined; dialog?.close(); render(); });

  /** 表示と購読を終了し、保存済みの固定入力・鍵を削除しない。 */
  function dispose() { disposed = true; displayClock?.dispose(); version++; dialog?.close(); unsubscribe(); port.dispose(); view = undefined; pending = []; root.replaceChildren(); }

  render(); void load();
  return { element: root, dispose };
}
