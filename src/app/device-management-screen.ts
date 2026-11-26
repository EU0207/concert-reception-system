// 端末台帳と確認ダイアログを表示し、固定入力の保全・結果照会と明示操作を接続する。

import { button, el, showDialog } from './dom.ts';
import type { DeviceManagementUiPort, DeviceManagementView } from './device-management-types.ts';
import type { DeviceGrant, StaffRole } from '../domain/authorization/types.ts';
import { createDeviceChangePlan } from '../domain/authorization/device-safety.ts';
import type { DeviceChangeInput } from '../domain/authorization/device-safety.ts';

const roles: Record<StaffRole, string> = { owner: '管理者', deputy: '代理管理者', temporary: '臨時管理者', receptionist: '一般受付担当者' };
const operations = { approve: '承認', stop: '停止', resume: '停止解除', retire: '廃止' } as const;

/** 操作対象を取り違えないよう、役割と端末UIDの末尾を併記する。 */
function label(device: DeviceGrant, view: DeviceManagementView): string {
  const role = view.inventory.roles.find(item => item.humanUid === device.humanUid);
  return `${role ? roles[role.role] : '役割未確認'}の端末（${device.deviceUid.slice(-8)}）`;
}

/** 内部値を表示せず、確認や再認証につながるエラー文へ変換する。 */
function errorMessage(cause: unknown): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  if (code === 'RECENT_AUTH_REQUIRED') return '本人確認の更新が必要です。再認証してから開き直してください。';
  if (['REPLACEMENT_OWNER_DEVICE_REQUIRED', 'LAST_MANAGEMENT_DEVICE', 'REPLACEMENT_DEVICE_REQUIRED'].includes(code))
    return '廃止後も使える、準備済みの管理端末を確認してください。管理者には同じ管理者の別端末が必要です。';
  if (code === 'OWNER_DEVICE_PAIRING_REQUIRED') return '管理者の追加端末は、専用の関連付け手順で登録してください。';
  return '操作を完了できませんでした。接続・権限と最新の端末状態を確認してください。';
}

/** 状態を記号と短い説明で示し、未確認を正常・失敗と区別する。 */
function statusMark(field: string, title: string, tone: 'ok' | 'attention' | 'blocked' | 'unknown', description: string) {
  const item = el('div', `device-status-item device-status-${tone}`);
  item.dataset.deviceStatus = field;
  const value = el('dd'), mark = el('span', 'device-status-mark', tone === 'ok' ? '○' : tone === 'attention' ? '△' : tone === 'blocked' ? '×' : '—');
  mark.setAttribute('aria-hidden', 'true');
  item.title = `${title}：${description}`;
  value.append(mark, el('span', 'device-status-description', description));
  item.append(el('dt', '', title), value);
  return item;
}

/** 台帳の表示から端末変更の確定・応答不明後の回収までを扱う。 */
export function createDeviceManagementScreen(port: DeviceManagementUiPort, preview = false) {
  const root = el('section', 'device-management-screen');
  let view: DeviceManagementView | undefined, busy = false, locked = true, disposed = false, version = 0;
  let pending: DeviceChangeInput[] = [], notice = '', error = '', dialog: HTMLDialogElement | undefined;

  /** 最新認可と台帳を読み、未完了操作がある場合は通常変更より結果確認を優先する。 */
  async function load() {
    if (disposed || busy) return;
    const current = ++version;
    busy = true; locked = true; error = ''; render();
    try {
      const result = await port.load();
      if (disposed || current !== version) return;
      view = result; pending = result.pending; locked = false;
    } catch (cause) {
      if (!disposed && current === version) { view = undefined; error = errorMessage(cause); }
    } finally {
      if (!disposed && current === version) { busy = false; render(); }
    }
  }

  /** 確定結果を保持し、最新認可・台帳を再取得して完了を案内する。 */
  async function confirmed(id: string, current: number) {
    pending = pending.filter(item => item.operationId !== id);
    notice = '端末の変更が確定しました。';
    view = undefined; locked = true;
    render();
    try {
      const result = await port.load();
      if (disposed || current !== version) return;
      view = result; pending = result.pending; locked = false;
    } catch {
      if (disposed || current !== version) return;
      error = '変更は確定しましたが、最新の端末一覧を取得できませんでした。接続・権限を確認して「最新の状態を確認」を押してください。';
    }
    if (disposed || current !== version) return;
    const body = el('div');
    body.append(el('p', '', locked ? error : '端末の変更が確定しました。最新の端末一覧を表示します。'));
    dialog = showDialog('変更しました', body);
  }

  /** 保存が完了するまで送信せず、失敗後も同じ固定入力を保持する。 */
  async function perform(input: DeviceChangeInput, retry = false) {
    if (busy || locked || disposed) return;
    const current = ++version;
    busy = true; error = notice = ''; render();
    let prepared = retry;
    try {
      if (!retry) {
        await port.prepare(input);
        prepared = true;
        if (disposed) return;
        if (!pending.some(item => item.operationId === input.operationId)) pending.push(input);
      }
      if (disposed || locked || current !== version) return;
      if (!retry || !(await port.receipt(input.operationId))) await port.commit(input.operationId);
      if (!disposed && current === version) await confirmed(input.operationId, current);
    } catch (cause) {
      if (!disposed && current === version) error = prepared ? '変更の結果を確認できません。「結果を確認」で確認してください。自動再送は行いません。' : errorMessage(cause);
    } finally {
      if (!disposed && current === version) { busy = false; render(); }
    }
  }

  /** 結果照会では書き込まず、未確定なら利用者の明示再試行を待つ。 */
  async function query(input: DeviceChangeInput) {
    if (busy || disposed) return;
    const current = ++version;
    busy = true; error = ''; render();
    try {
      const done = await port.receipt(input.operationId);
      if (disposed || current !== version) return;
      if (done) await confirmed(input.operationId, current);
      else notice = '確定結果はまだ確認できません。最新状態の確認、または同じ操作の再試行ができます。';
    } catch { if (!disposed && current === version) error = '結果を確認できませんでした。接続を確認して、もう一度お試しください。'; }
    finally { if (!disposed && current === version) { busy = false; render(); } }
  }

  /** 変更前後と代替端末を確認する。管理者の停止は最終確認まで保存しない。 */
  function choose(device: DeviceGrant, kind: DeviceChangeInput['kind']) {
    if (busy || locked || !view || pending.length) return;
    const basis = structuredClone(view);
    const body = el('div');
    const beforeState = device.retired ? '廃止済み' : !device.approved ? '承認待ち' : device.active ? '有効' : '停止中';
    const afterState = kind === 'retire' ? '廃止済み' : kind === 'stop' ? '停止中' : '有効';
    body.append(el('p', '', `${label(device, basis)}を${operations[kind]}します。`),
      el('p', '', `承認：${device.approved ? '承認済み' : '承認待ち'} → ${kind === 'approve' || device.approved ? '承認済み' : '承認待ち'}`),
      el('p', '', `状態：${beforeState} → ${afterState}`),
      el('p', '', kind === 'approve' ? '承認しても、端末ごとの事前準備が完了するまで業務には使えません。' :
        kind === 'retire' ? '廃止は元に戻せません。端末内の記録や暗号鍵は、この操作では削除しません。' :
        kind === 'stop' ? '端末の業務操作を止めます。保存済みの記録は保持します。' : '停止を解除します。準備状態と現在の権限は別途確認されます。'));
    const select = el('select');
    const wrapper = el('label', 'seat-field', '代わりに使用する管理端末');
    const targetRole = basis.inventory.roles.find(role => role.humanUid === device.humanUid)?.role;
    const needsReplacement = kind === 'retire' && ['owner', 'deputy'].includes(targetRole ?? '');
    if (needsReplacement) {
      const eligible: DeviceGrant[] = [];
      const empty = el('option', '', '選択してください'); empty.value = ''; select.append(empty);
      for (const candidate of basis.inventory.devices.filter(item => item.deviceUid !== device.deviceUid && item.active && item.approved && !item.retired)) {
        const role = basis.inventory.roles.find(item => item.humanUid === candidate.humanUid);
        if (!role || !['owner', 'deputy'].includes(role.role) || !role.active || role.startsAt > basis.serverNow ||
          role.endsAt <= basis.serverNow || candidate.preparedRole !== role.role || candidate.preparedRoleRevision !== role.revision ||
          (targetRole === 'owner' && (role.role !== 'owner' || role.humanUid !== device.humanUid))) continue;
        eligible.push(candidate);
        const option = el('option', '', label(candidate, basis)); option.value = candidate.deviceUid; select.append(option);
      }
      if (targetRole === 'deputy') {
        // 引継ぎ先の指定ではなく管理端末が残ることの保護なので、手動選択を求めない。
        const replacement = eligible.find(candidate => basis.inventory.roles.some(role => role.humanUid === candidate.humanUid && role.role === 'owner')) ?? eligible[0];
        select.value = replacement?.deviceUid ?? '';
        body.append(el('p', '', replacement ? `廃止後も利用できる管理端末：${label(replacement, basis)}（自動確認）` : '廃止後も利用できる、準備済みの管理端末が確認できません。'));
      } else {
        wrapper.append(select); body.append(wrapper);
      }
    }
    const validation = el('p', 'device-error'); validation.setAttribute('role', 'alert'); body.append(validation);
    const input: DeviceChangeInput = { operationId: crypto.randomUUID(), targetDeviceUid: device.deviceUid,
      expectedRevision: device.revision ?? 1, kind, replacementDeviceUid: '' };
    const needsFinalConfirmation = kind === 'stop' && targetRole === 'owner';
    dialog = showDialog(`端末の${operations[kind]}`, body, [button(needsFinalConfirmation ? '最終確認へ' : `${operations[kind]}する`, () => {
      if (locked || disposed) return;
      input.replacementDeviceUid = select.value;
      try { createDeviceChangePlan(basis.snapshot, basis.inventory, input, basis.serverNow); }
      catch (cause) { validation.textContent = errorMessage(cause); return; }
      dialog?.close();
      if (needsFinalConfirmation) {
        const finalBody = el('div');
        const warning = el('p', 'device-stop-warning');
        const warningIcon = el('span', 'device-stop-warning-icon', '⚠');
        warningIcon.setAttribute('aria-hidden', 'true');
        warning.append(warningIcon, el('span', '', '重要：管理者端末の業務を停止します'));
        finalBody.append(warning,
          el('p', '', `${label(device, basis)}を本当に停止しますか？`),
          el('p', '', '停止すると、この管理者端末では管理操作や受付ができなくなります。対象端末をもう一度確認してください。'),
          el('p', '', '管理者の役割や他の端末は停止しません。保存済みの記録は保持します。'));
        dialog = showDialog('管理者端末の停止・最終確認', finalBody, [button('管理者の端末を停止する', () => {
          if (locked || disposed || busy) return;
          dialog?.close(); void perform(input);
        }, 'button device-stop-confirm')], 'キャンセル');
        dialog.classList.add('device-stop-dialog');
        // 最終確認の初期フォーカスは取消しにし、Enterの連続入力で停止しない。
        dialog.querySelector<HTMLButtonElement>('.dialog-actions button:last-child')?.focus();
      } else void perform(input);
    })], 'キャンセル');
  }

  /** モックのカード配置を参考に、承認・準備・停止・廃止を別々に表示する。 */
  function render() {
    if (disposed) return;
    root.replaceChildren(el('h2', '', 'スタッフ・端末'));
    if (preview) root.append(el('p', 'notice', '画面確認用の見本です。実際の端末登録や権限は変更しません。'));
    const alert = el('p', 'device-error', error), status = el('p', 'muted', busy ? '確認しています…' : notice);
    alert.setAttribute('role', 'alert'); status.setAttribute('role', 'status'); root.append(alert, status);
    root.append(button('最新の状態を確認', () => { void load(); }, 'button secondary'));
    if (locked) root.append(el('p', 'notice', '端末管理は最新の認可確認が必要です。確認が終わるまで変更できません。'));
    for (const item of pending) {
      const box = el('section', 'panel');
      box.append(el('h3', '', `未完了の${operations[item.kind]}（端末 ${item.targetDeviceUid.slice(-8)}）`),
        el('p', '', '保存した入力を保持しています。結果照会では再送しません。'),
        button('結果を確認', () => { void query(item); }, 'button secondary'));
      if (!locked) box.append(button('同じ操作を再試行', () => { void perform(item, true); }, 'button secondary'));
      root.append(box);
    }
    if (view && !locked) {
      const legend = el('p', 'device-status-legend');
      legend.append(el('span', 'device-legend-ok', '○ 確認済み'),
        el('span', 'device-legend-attention', '△ 要対応'), el('span', 'device-legend-blocked', '× 停止・廃止'),
        el('span', '', '— 未確認・対象外'));
      root.append(legend, el('p', 'muted', '「通常」は停止されていない状態です。受付には承認と受付準備が必要です。'));
      if (view.obsolete.length) {
        const previous = el('details', 'notice');
        previous.append(el('summary', '', `以前の未確定操作${view.obsolete.length}件は端末の版が変わったため再送しません。`),
          el('p', '', '保存済み入力は保持しています。現在の状態で確認し直してください。'));
        for (const item of view.obsolete) previous.append(el('p', '', `以前の操作：${operations[item.kind]} ／ 端末 ${item.targetDeviceUid.slice(-8)}`));
        root.append(previous);
      }
      const cards = el('div', 'device-cards');
      const retired = el('details', 'device-retired');
      const retiredCards = el('div', 'device-cards');
      retired.append(el('summary', '', `廃止済み端末一覧（${view.inventory.devices.filter(device => device.retired).length}台）`),
        el('p', 'muted', '廃止済みの端末も、未送信記録の回収確認のため残しています。'), retiredCards);
      for (const device of view.inventory.devices) {
        const role = view.inventory.roles.find(item => item.humanUid === device.humanUid);
        const card = el('section', 'panel device-card');
        const indicators = el('dl', 'device-status-grid');
        indicators.append(statusMark('approval', '承認', device.approved ? 'ok' : 'attention', device.approved ? '承認済み' : '承認待ち'),
          // 役割準備版だけではデータ・カメラ等の準備完了を証明できない。接続までは未確認とする。
          statusMark('preparation', '受付準備', 'unknown', device.retired ? '利用終了' : !device.approved ? '承認後に準備' : '未確認'),
          statusMark('state', '端末の利用設定', device.retired || (device.approved && !device.active) ? 'blocked' : 'ok',
            device.retired ? '廃止済み' : device.approved && !device.active ? '停止中' : '通常'));
        card.append(el('h3', '', label(device, view) + (device.deviceUid === view.snapshot.deviceAuthUid ? ' この端末' : '')),
          indicators,
          el('p', 'muted', '受付記録の送信状況：未確認（未送信件数は未取得）。停止・廃止でも記録は保持します。'));
        const controls = el('div', 'authentication-actions');
        if (!device.retired && !pending.length) {
          if (!device.approved && role?.role !== 'owner') controls.append(button('承認', () => choose(device, 'approve')));
          if (device.approved && device.deviceUid !== view.snapshot.deviceAuthUid) controls.append(button(device.active ? '停止' : '停止解除', () => choose(device, device.active ? 'stop' : 'resume'), 'button secondary'));
          if (device.deviceUid === view.snapshot.deviceAuthUid) card.append(el('p', 'muted', '使用中のこの端末は停止できません。停止は別の管理端末から行ってください。'));
          controls.append(button('廃止', () => choose(device, 'retire'), 'button secondary'));
        }
        card.append(controls); (device.retired ? retiredCards : cards).append(card);
      }
      root.append(cards, retired);
    }
    for (const control of root.querySelectorAll<HTMLButtonElement>('button')) control.disabled = busy;
  }

  // 失効通知では平文の台帳表示を外し、保存済みの未完了入力は削除しない。
  const unsubscribe = port.onInvalidate(() => {
    version++; locked = true; busy = false; view = undefined; dialog?.close(); render();
  });

  /** 画面と購読を終了し、端末内の鍵・記録は保持する。 */
  function dispose() { disposed = true; version++; dialog?.close(); unsubscribe(); port.dispose(); view = undefined; pending = []; root.replaceChildren(); }

  render(); void load();
  return { element: root, dispose };
}
