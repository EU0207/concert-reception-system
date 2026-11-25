// 端末台帳と確認ダイアログを表示し、固定入力の保全・結果照会と明示操作を接続する。

import { button, el, showDialog } from './dom.ts';
import type { DeviceManagementUiPort, DeviceManagementView } from './device-management-types.ts';
import type { DeviceGrant, StaffRole } from '../domain/authorization/types.ts';
import { createDeviceChangePlan } from '../domain/authorization/device-safety.ts';
import type { DeviceChangeInput } from '../domain/authorization/device-safety.ts';

const roles: Record<StaffRole, string> = { owner: '主担当', deputy: '代理管理者', temporary: '臨時管理者', receptionist: '一般受付担当者' };
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
    return '廃止後も使える、準備済みの管理端末を確認してください。主担当には同じ主担当の別端末が必要です。';
  if (code === 'OWNER_DEVICE_PAIRING_REQUIRED') return '主担当の追加端末は、専用の関連付け手順で登録してください。';
  return '操作を完了できませんでした。接続・権限と最新の端末状態を確認してください。';
}

/** 正常は印だけを表示し、対応が必要な状態には説明を添える。読み上げ用の意味は常に残す。 */
function statusMark(field: string, title: string, tone: 'ok' | 'attention' | 'blocked', description: string) {
  const item = el('div', `device-status-item device-status-${tone}`);
  item.dataset.deviceStatus = field;
  const value = el('dd'), mark = el('span', 'device-status-mark', tone === 'ok' ? '○' : tone === 'attention' ? '△' : '×');
  mark.setAttribute('aria-hidden', 'true');
  item.title = `${title}：${description}`;
  value.append(mark, el('span', tone === 'ok' ? 'device-status-hidden' : 'device-status-description', description));
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

  /** 確定した操作だけを待ち一覧から除き、他の変更には改めて最新確認を要求する。 */
  function confirmed(id: string) {
    pending = pending.filter(item => item.operationId !== id);
    notice = '端末の変更が確定しました。最新の状態を確認してください。';
    view = undefined; locked = true;
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
      if (!disposed && current === version) confirmed(input.operationId);
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
      if (done) confirmed(input.operationId);
      else notice = '確定結果はまだ確認できません。最新状態の確認、または同じ操作の再試行ができます。';
    } catch { if (!disposed && current === version) error = '結果を確認できませんでした。接続を確認して、もう一度お試しください。'; }
    finally { if (!disposed && current === version) { busy = false; render(); } }
  }

  /** 変更前後と廃止時の代替端末を確認し、取消しでは何も保存しない。 */
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
      const empty = el('option', '', '選択してください'); empty.value = ''; select.append(empty);
      for (const candidate of basis.inventory.devices.filter(item => item.deviceUid !== device.deviceUid && item.active && item.approved && !item.retired)) {
        const role = basis.inventory.roles.find(item => item.humanUid === candidate.humanUid);
        if (!role || !['owner', 'deputy'].includes(role.role) || !role.active || role.startsAt > basis.serverNow ||
          role.endsAt <= basis.serverNow || candidate.preparedRole !== role.role || candidate.preparedRoleRevision !== role.revision ||
          (targetRole === 'owner' && (role.role !== 'owner' || role.humanUid !== device.humanUid))) continue;
        const option = el('option', '', label(candidate, basis)); option.value = candidate.deviceUid; select.append(option);
      }
      wrapper.append(select); body.append(wrapper);
    }
    const validation = el('p', 'device-error'); validation.setAttribute('role', 'alert'); body.append(validation);
    const input: DeviceChangeInput = { operationId: crypto.randomUUID(), targetDeviceUid: device.deviceUid,
      expectedRevision: device.revision ?? 1, kind, replacementDeviceUid: '' };
    dialog = showDialog(`端末の${operations[kind]}`, body, [button(`${operations[kind]}する`, () => {
      if (locked || disposed) return;
      input.replacementDeviceUid = select.value;
      try { createDeviceChangePlan(basis.snapshot, basis.inventory, input, basis.serverNow); }
      catch (cause) { validation.textContent = errorMessage(cause); return; }
      dialog?.close(); void perform(input);
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
        el('span', 'device-legend-attention', '△ 要対応'), el('span', 'device-legend-blocked', '× 停止・廃止'));
      root.append(legend, el('p', 'muted', '公演データの準備状況：未確認'));
      if (view.obsolete.length) {
        const previous = el('details', 'notice');
        previous.append(el('summary', '', `以前の未確定操作${view.obsolete.length}件は端末の版が変わったため再送しません。`),
          el('p', '', '保存済み入力は保持しています。現在の状態で確認し直してください。'));
        for (const item of view.obsolete) previous.append(el('p', '', `以前の操作：${operations[item.kind]} ／ 端末 ${item.targetDeviceUid.slice(-8)}`));
        root.append(previous);
      }
      const cards = el('div', 'device-cards');
      for (const device of view.inventory.devices) {
        const role = view.inventory.roles.find(item => item.humanUid === device.humanUid);
        const prepared = role?.active === true && role.startsAt <= view.serverNow && view.serverNow < role.endsAt &&
          device.preparedRole === role.role && device.preparedRoleRevision === role.revision;
        const card = el('section', 'panel device-card');
        const indicators = el('dl', 'device-status-grid');
        indicators.append(statusMark('approval', '承認', device.approved ? 'ok' : 'attention', device.approved ? '承認済み' : '承認待ち'),
          statusMark('preparation', '役割準備', prepared ? 'ok' : 'attention', prepared ? '現在役割の準備済み' : '未準備・再準備が必要'),
          statusMark('state', '端末状態', device.retired || (device.approved && !device.active) ? 'blocked' : !device.approved ? 'attention' : 'ok',
            device.retired ? '廃止済み' : !device.approved ? '承認待ち' : device.active ? '有効' : '停止中'));
        card.append(el('h3', '', label(device, view) + (device.deviceUid === view.snapshot.deviceAuthUid ? ' この端末' : '')),
          indicators,
          el('p', 'muted', '端末内データ・未送信件数：未取得。停止・廃止では削除しません。'));
        const controls = el('div', 'authentication-actions');
        if (!device.retired && !pending.length) {
          if (!device.approved && role?.role !== 'owner') controls.append(button('承認', () => choose(device, 'approve')));
          if (device.approved) controls.append(button(device.active ? '停止' : '停止解除', () => choose(device, device.active ? 'stop' : 'resume'), 'button secondary'));
          controls.append(button('廃止', () => choose(device, 'retire'), 'button secondary'));
        }
        card.append(controls); cards.append(card);
      }
      root.append(cards);
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
