// 管理者の追加端末リンクを発行・確認し、本人の新端末の承認へ接続する。

import { actionGroup, button, el, formError, showDialog } from './dom.ts';
import { ownerDeviceUrl, parseOwnerDeviceUrl } from './owner-device-url.ts';
import type { OwnerDeviceIssue, OwnerDeviceUiPort, OwnerDeviceView } from './owner-device-types.ts';

/** 例外から画面表示に使う固定コードだけを取得する。 */
function errorCode(cause: unknown): string {
  return cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
}

/** リンクを差し替える方法を、確認に失敗した理由に応じて案内する。 */
function linkRecoveryMessage(cause: unknown): string | undefined {
  const code = errorCode(cause);
  if (code === 'INVALID_OWNER_DEVICE_TOKEN') return '有効な追加端末リンクを貼り付けてください。';
  if (code === 'OWNER_LINK_BINDING_MISMATCH') return 'この端末・公演で使えるリンクを貼り付けてください。';
  if (code === 'OWNER_LINK_UNAVAILABLE') return '既存の管理者端末で新しいリンクを発行し、ここに貼り付けてください。';
}

/** 内部情報やリンクをエラーへ含めず、再確認する方法を短く案内する。 */
function message(cause: unknown): string {
  const code = errorCode(cause);
  if (code === 'RECENT_AUTH_REQUIRED' || code === 'GOOGLE_AUTH_REQUIRED') return 'Googleで本人確認をやり直してください。';
  const recovery = linkRecoveryMessage(cause);
  return recovery ? `このリンクは使えません。${recovery}` : '操作結果を確認できませんでした。最新の状態を確認してください。';
}

/** 既存端末と新端末を分け、同じ操作IDの照会と明示操作だけを行う画面を作る。 */
export function createOwnerDeviceScreen(port: OwnerDeviceUiPort, preview = false, receivedToken?: string) {
  const root = el('section', 'owner-device-screen');
  let view: OwnerDeviceView | undefined, busy = false, disposed = false, approving = false, error = '', notice = '', version = 0;
  let linkError = '';
  let dialog: HTMLDialogElement | undefined, token = receivedToken;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  /** 平文リンクのダイアログを片付け、閉じた後に再表示できる値を残さない。 */
  function closeShare() { clearTimeout(timeout); dialog?.close(); dialog = undefined; }

  /** 最新の状態を取得し、承認・発行を自動で実行しない。 */
  async function load() {
    if (busy || disposed) return;
    const operation = ++version; busy = true; error = linkError = ''; closeShare(); render();
    try { const result = await port.load(); if (operation === version && !disposed) view = result; }
    catch (cause) { if (operation === version && !disposed) { view = undefined; error = message(cause); } }
    finally { if (operation === version && !disposed) { busy = false; render(); } }
  }

  /** 明示操作を一度だけ実行し、失敗時は再送せず結果の再確認を案内する。 */
  async function act(work: () => Promise<void>, success: string, action?: 'check-link') {
    if (busy || disposed) return;
    const operation = ++version; busy = true; error = linkError = notice = ''; render();
    try {
      await work();
      if (disposed || operation !== version) return;
      notice = success;
    } catch (cause) {
      if (disposed || operation !== version) return;
      if (action === 'check-link') linkError = linkRecoveryMessage(cause) ?? '';
      if (!linkError) error = message(cause);
    } finally {
      if (!disposed && operation === version) { busy = false; render(); }
    }
  }

  /** 必要なら旧リンクを取り消し、新しいリンクをその場だけ表示する。 */
  async function issue(target: string, previousId?: string) {
    const basis = view!;
    await act(async () => {
      const requestVersion = version;
      // 結果が不明になった場合は、次の操作の前に同じ発行記録を照会する。
      view = undefined;
      if (previousId) {
        await port.cancel(previousId);
        if (disposed || requestVersion !== version) return;
      }

      const started = performance.now();
      const issued = await port.issue(target, crypto.randomUUID());
      if (disposed || requestVersion !== version) return;
      const body = el('div'), input = el('textarea', 'owner-device-link');
      input.readOnly = true; input.setAttribute('aria-label', '追加端末リンク');
      input.value = ownerDeviceUrl(location.href, basis, issued.token);
      body.append(el('p', '', '新しい端末で、このリンクを開いてください。'),
        el('p', 'muted', '閉じると、このURLは再表示できません。'),
        el('p', 'muted', '有効期限：' + new Date(issued.link.expiresAt).toLocaleString()), input);
      const copy = button('リンクをコピー', () => {
        void navigator.clipboard.writeText(input.value).then(() => { copy.textContent = 'コピーしました'; },
          () => { input.focus(); input.select(); copy.textContent = 'リンクを選択しました'; });
      });
      dialog = showDialog('追加端末リンク', body, [copy]);
      dialog.addEventListener('close', () => { input.value = ''; clearTimeout(timeout); }, { once: true });
      timeout = setTimeout(() => { closeShare(); notice = 'リンクの有効期限を過ぎました。'; render(); },
        Math.max(0, issued.link.expiresAt - issued.link.issuedAt - Math.floor(performance.now() - started)));
      // 発行後の一覧取得で平文リンクを閉じないよう、ここでは窓口だけを再照会する。
      const result = await port.load();
      if (!disposed && requestVersion === version) view = result;
    }, previousId ? 'リンクを再発行しました。' : 'リンクを発行しました。');
  }

  /** 新端末の承認を確認し、成功後もデータ準備と区別する。 */
  function approve(id: string) {
    const body = el('p', '', 'この端末を管理者本人の端末として関連付けます。');
    dialog = showDialog('この端末を関連付けますか？', body, [button('関連付ける', () => {
      closeShare(); void completeApproval(id);
    })], 'キャンセル');
  }

  /** 自端末の承認による旧認可の失効後も、専用の読取り証跡・結果だけを取り直す。 */
  async function completeApproval(id: string) {
    if (busy || disposed) return;
    approving = busy = true; error = linkError = notice = ''; render();
    try {
      await port.approve(id);
      const result = await port.load();
      if (disposed) return;
      view = result; notice = '関連付けました。データ準備へ進めます。'; error = '';
    } catch (cause) { if (!disposed) { view = undefined; error = message(cause); } }
    finally { approving = false; if (!disposed) { busy = false; render(); } }
  }

  /** 端末ごとに現在の状態と操作を一つのカードへ出す。 */
  function renderIssuer({ targets, issues, serverNow }: OwnerDeviceView) {
    root.append(el('p', '', '新しい端末でログイン・端末登録を済ませてから選んでください。'));
    const waiting = new Set(targets);
    const byDevice = new Map<string, OwnerDeviceIssue[]>(targets.map(target => [target, []]));

    for (const link of issues) {
      // 取消し済みの記録だけで、新規発行できない端末のカードを作らない。
      if (link.status === 'cancelled' && !waiting.has(link.targetDeviceUid)) continue;
      const links = byDevice.get(link.targetDeviceUid) ?? [];
      links.push(link);
      byDevice.set(link.targetDeviceUid, links);
    }

    for (const target of [...byDevice.keys()].sort()) {
      const links = byDevice.get(target)!;
      const active = links.filter(link => link.status === 'pending' && serverNow < link.expiresAt);
      const unknown = links.some(link => link.status === 'unknown');
      const approved = links.some(link => link.status === 'consumed');
      const latest = links.reduce<OwnerDeviceIssue | undefined>((newest, link) =>
        !newest || link.expiresAt > newest.expiresAt ? link : newest, undefined);
      const label = active.length ? '発行済み' : unknown ? '発行結果の確認が必要' : approved ? '関連付け済み' :
        latest?.status === 'not-issued' ? '未発行' : latest?.status === 'pending' ? '期限切れ' : '承認待ち端末';
      const panel = el('section', 'panel owner-device-card');
      panel.append(el('h3', '', label + '：' + target));

      if (waiting.has(target) && !active.length && !unknown) {
        panel.append(actionGroup(button('リンクを発行', () => { void issue(target); })));
      }

      for (const [index, link] of active.entries()) {
        const actions = actionGroup();
        if (waiting.has(target) && active.length === 1 && !unknown) {
          actions.append(button('リンクを再発行', () => {
            dialog = showDialog('リンクを再発行しますか？', el('p', '', '前のリンクは使えなくなります。'),
              [button('再発行する', () => { closeShare(); void issue(target, link.operationId); })], 'キャンセル');
          }));
        }

        const cancelLabel = active.length > 1 ? `リンク${index + 1}を取り消す` : 'リンクを取り消す';
        actions.append(button(cancelLabel, () => {
          dialog = showDialog('リンクを取り消しますか？', el('p', '', 'このリンクは使えなくなります。'),
            [button('取り消す', () => { closeShare(); void act(async () => { await port.cancel(link.operationId); view = await port.load(); }, '取り消しました。'); })], 'キャンセル');
        }, 'button secondary'));
        panel.append(actions);
      }
      root.append(panel);
    }

    if (!targets.length) root.append(el('p', 'muted', '追加する承認待ち端末はありません。'));
  }

  /** 入力と回収状態を表示し、結果不明の発行を自動で作り直さない。 */
  function render() {
    root.replaceChildren(el('h2', '', '管理者の追加端末'));
    if (preview) root.append(el('p', 'notice', '架空データの見本です。実際の端末は承認されません。'));
    const alert = el('p', 'device-error', error); alert.setAttribute('role', 'alert');
    const status = el('p', 'muted', busy ? '確認中…' : notice); status.setAttribute('role', 'status');
    const toolbar = actionGroup(button('最新の状態を確認', () => { void load(); }, 'button secondary'));
    toolbar.classList.add('management-toolbar'); root.append(alert, status, toolbar);
    if (view?.mode === 'issuer') {
      renderIssuer(view);
    } else if (view?.mode === 'receiver') {
      const approved = view.readers.some(reader => reader.approved);
      if (!approved) {
        root.append(el('p', '', '既存の管理者端末で発行したリンクを確認してください。'));
        const input = el('textarea', 'owner-device-link'); input.setAttribute('aria-label', '受け取った追加端末リンク');
        const read = button(token ? '受け取ったリンクを確認' : 'リンクを確認', () => {
          let secret = token;
          try { secret ??= parseOwnerDeviceUrl(input.value.trim(), location.href, view!); }
          catch (cause) {
            input.value = ''; error = notice = '';
            linkError = linkRecoveryMessage(cause) ?? '有効な追加端末リンクを貼り付けてください。';
            render();
            return;
          }
          input.value = ''; token = undefined;
          void act(async () => {
            const requestVersion = version;
            const id = await port.read(secret!);
            if (disposed || requestVersion !== version) return;

            const result = await port.load();
            if (disposed || requestVersion !== version) return;

            view = result;
            if (result.readers.some(reader => reader.operationId === id && !reader.approved)) approve(id);
          }, 'リンクを確認しました。', 'check-link');
        });
        read.disabled = !token;
        const inlineAlert = formError('このリンクは使えません');
        inlineAlert.show(linkError, token ? [] : [input]);
        input.addEventListener('input', () => {
          read.disabled = busy || !input.value.trim();
          linkError = '';
          inlineAlert.show('');
        });
        if (!token) root.append(input);
        root.append(inlineAlert.element, actionGroup(read));
      }
      for (const reader of view.readers.filter(item => !approved || item.approved)) {
        const panel = el('section', 'panel owner-device-card');
        panel.append(el('h3', '', reader.approved ? '関連付け済み' : 'この端末へのリンクを確認済み'));
        if (reader.approved) panel.append(el('p', 'muted', '受付の前に、この端末のデータ準備が必要です。'));
        else panel.append(actionGroup(button('この端末を関連付ける', () => approve(reader.operationId))));
        root.append(panel);
      }
    }
    if (busy) for (const control of root.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>('button, textarea')) control.disabled = true;
  }

  const unsubscribe = port.onInvalidate(() => { version++; busy = approving; view = undefined; token = undefined; closeShare(); linkError = ''; error = '現在の本人・端末を確認し直してください。'; render(); });

  /** 古い応答と平文リンクの表示を破棄し、保存済みの操作結果は保持する。 */
  function dispose() { disposed = true; version++; token = undefined; closeShare(); unsubscribe(); port.dispose(); view = undefined; root.replaceChildren(); }

  render(); void load();
  return { element: root, dispose };
}
