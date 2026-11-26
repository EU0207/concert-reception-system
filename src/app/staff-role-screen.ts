// 一般受付と臨時管理者の任命・解除を表示し、固定入力の保存と結果回収へ接続する。

import { button, el, showDialog } from './dom.ts';
import { TEMPORARY_PERMISSIONS } from '../domain/authorization/types.ts';
import { temporaryPermissionLabels as labels } from './temporary-permission-labels.ts';
import type { RoleGrant } from '../domain/authorization/types.ts';
import { createRoleChangeRequest } from '../domain/authorization/role-management.ts';
import { RECENT_AUTH_WINDOW } from '../domain/authorization/policy.ts';
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
  async function completed(id: string, outcome: StaffRoleOutcome, current: number) {
    pending = pending.filter(item => item.input.operationId !== id); locked = true; view = undefined;
    notice = outcome === 'committed' ? '役割の変更が確定しました。' : '未確定の変更案を取り消しました。現在の役割は変更していません。';
    try {
      const result = await port.load();
      if (disposed || current !== version) return;
      view = result; pending = result.pending; locked = false;
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

  /** 変更後の役割と期間を指定し、同じ本人の全端末への影響を確認する。 */
  function edit(role: RoleGrant) {
    if (busy || locked || !view || pending.length) return;
    const basis = structuredClone(view), body = el('div', 'permission-edit-body');
    const nextRole = role.role === 'receptionist' ? 'temporary' : 'receptionist';
    const name = nextRole === 'temporary' ? '臨時管理者' : '一般受付';
    body.append(el('p', '', '対象：' + role.humanUid.slice(-8)), el('p', '', (role.role === 'temporary' ? '臨時管理者' : '一般受付') + ' → ' + name));
    const originalStart = basis.serverNow, originalEnd = Math.min(role.endsAt, basis.snapshot.staffDeadline);
    const start = el('input'), end = el('input');
    for (const input of [start, end]) { input.type = 'datetime-local'; input.step = '1'; }
    start.value = localDate(originalStart); end.value = localDate(originalEnd);
    const initialStart = start.value, initialEnd = end.value;
    const startLabel = el('label', 'seat-field', '有効開始'), endLabel = el('label', 'seat-field', '有効終了');
    startLabel.append(start); endLabel.append(end);
    const period = el('div', 'permission-period'); period.append(startLabel, endLabel); body.append(period,
      el('p', 'muted', '日時はこの端末の時刻（' + Intl.DateTimeFormat().resolvedOptions().timeZone + '）で入力します。'),
      el('p', 'muted', 'スタッフ利用期限：' + new Date(basis.snapshot.staffDeadline).toLocaleString('ja-JP')));
    if (nextRole === 'temporary') {
      body.append(el('p', '', '任命時は次の9項目すべて○で保存します。個別の変更は任命後の「臨時管理者の権限設定」で行えます。'));
      const list = el('ul'); for (const key of TEMPORARY_PERMISSIONS) list.append(el('li', '', labels[key])); body.append(list);
    } else body.append(el('p', '', '臨時管理者の管理権限を解除します。本人のアカウントや端末、保存済みの受付記録は削除しません。'));
    const validation = el('p', 'device-error'); validation.setAttribute('role', 'alert');

    /** 入力を業務条件で検証し、確認が済んだ同じ内容だけを保存へ渡す。 */
    function confirm() {
      if (locked || disposed) return;
      if (preview && Date.now() > basis.serverNow + RECENT_AUTH_WINDOW) {
        validation.textContent = 'この見本の確認期限が過ぎています。ページを再読み込みして、開き直してください。';
        return;
      }
      const change: PendingStaffRole = { targetUid: role.humanUid, input: { operationId: crypto.randomUUID(), expectedRevision: role.revision, nextRole,
        startsAt: start.value === initialStart ? originalStart : Date.parse(start.value),
        endsAt: end.value === initialEnd ? originalEnd : Date.parse(end.value) } };
      try { createRoleChangeRequest(basis.snapshot, role, change.input, basis.serverNow); }
      catch (cause) {
        const invalidPeriod = cause && typeof cause === 'object' && 'code' in cause && cause.code === 'INVALID_ROLE_PERIOD';
        validation.textContent = invalidPeriod && change.input.startsAt >= change.input.endsAt
          ? '有効終了は、有効開始より後の日時にしてください。'
          : invalidPeriod && change.input.endsAt > basis.snapshot.staffDeadline
            ? `有効終了がスタッフ利用期限（${new Date(basis.snapshot.staffDeadline).toLocaleString('ja-JP')}）を超えています。期限以内の日時にしてください。`
            : message(cause);
        return;
      }
      const summary = el('div'); summary.append(el('p', '', '対象：' + role.humanUid.slice(-8)),
        el('p', '', (role.role === 'temporary' ? '臨時管理者' : '一般受付') + ' → ' + name),
        el('p', '', '有効期間：' + new Date(change.input.startsAt).toLocaleString('ja-JP') + ' ～ ' + new Date(change.input.endsAt).toLocaleString('ja-JP')),
        el('p', '', '同じ本人のすべての端末に反映します。変更後は端末ごとの追加準備が必要です。準備前に新しい管理権限は使えません。'),
        el('p', '', nextRole === 'temporary' ? '初期設定：9項目すべて○。役割と権限設定をまとめて保存します。' : '臨時管理者の管理権限は確定時に失効します。一般受付の利用には現在の本人・端末と準備確認が必要です。'));
      dialog?.close(); dialog = showDialog('役割変更の確認', summary, [button('この内容で保存', () => { dialog?.close(); void act(change, 'save'); })], 'キャンセル');
    }

    dialog = showDialog(nextRole === 'temporary' ? '臨時管理者に任命' : '臨時管理者を解除', body, [button('変更内容を確認', confirm)], 'キャンセル');
    dialog.classList.add('permission-edit-dialog');
    // 入力本文をスクロールしていても、操作を拒否した理由をボタンの直前に表示する。
    dialog.querySelector('.dialog-actions')!.before(validation);
  }

  /** 現在役割と結果未確認の案を分離し、新規変更の重ね送りを防ぐ。 */
  function render() {
    if (disposed) return;
    root.replaceChildren(el('h2', '', 'スタッフの役割変更'));
    if (preview) root.append(el('p', 'notice', '画面確認用の見本です。実際の権限やスタッフ登録は変更しません。'));
    const alert = el('p', 'device-error', error), status = el('p', 'muted', busy ? '確認しています…' : notice);
    alert.setAttribute('role', 'alert'); status.setAttribute('role', 'status');
    root.append(alert, status, button('最新の役割を確認', () => { void load(); }, 'button secondary'));
    if (locked) root.append(el('p', 'notice', '役割変更には最新の認可確認が必要です。'));
    for (const change of pending) {
      const box = el('div', 'notice');
      box.append(el('p', '', `結果未確認：スタッフ（${change.targetUid.slice(-8)}）`), button('結果を確認', () => { void act(change, 'query'); }, 'button secondary'));
      if (!locked) box.append(button('同じ操作を再試行', () => { void act(change, 'retry'); }, 'button secondary'), button('未確定案を取り消す', () => { void act(change, 'cancel'); }, 'button secondary'));
      root.append(box);
    }
    if (view && !locked) {
      if (view.obsolete.length) root.append(el('p', 'notice', `版が変わった未確定入力${view.obsolete.length}件は保持しています。再送せず、現在の役割を確認してください。`));
      if (!view.targets.length) root.append(el('p', '', '変更できる一般受付・臨時管理者は登録されていません。'));
      for (const { role } of view.targets) {
        const card = el('section', 'panel staff-role-card');
        card.append(el('h3', '', (role.role === 'temporary' ? '臨時管理者' : '一般受付') + '（' + role.humanUid.slice(-8) + '）'),
          el('p', 'muted', '有効期間：' + new Date(role.startsAt).toLocaleString('ja-JP') + ' ～ ' + new Date(role.endsAt).toLocaleString('ja-JP')));
        if (!role.active || role.startsAt > view.serverNow || role.endsAt <= view.serverNow) card.append(el('p', 'notice', '現在は変更できない役割です。停止解除・再招待は別の手続きです。'));
        else if (!pending.length) card.append(button(role.role === 'temporary' ? '臨時管理者を解除' : '臨時管理者に任命', () => edit(role)));
        root.append(card);
      }
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('button')) control.disabled = busy;
  }

  // 失効通知では編集中のダイアログも閉じ、保存済み入力と鍵は保持する。
  const unsubscribe = port.onInvalidate(() => { version++; locked = true; busy = false; view = undefined; dialog?.close(); render(); });

  /** 表示と購読を終了し、保存済みの固定入力・鍵を削除しない。 */
  function dispose() { disposed = true; version++; dialog?.close(); unsubscribe(); port.dispose(); view = undefined; pending = []; root.replaceChildren(); }

  render(); void load();
  return { element: root, dispose };
}
