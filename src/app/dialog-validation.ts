// 入力と期限を検査し、理由を表示したまま確認操作を有効・無効にする。

/** 入力変更と時間経過を反映し、ダイアログを閉じたら監視を終了する。 */
export function watchDialogValidity(dialog: HTMLDialogElement, fields: HTMLInputElement[], action: HTMLButtonElement,
  status: HTMLElement, validate: () => string): () => boolean {
  /** 拒否理由とボタンの有効状態を同時に更新する。 */
  function refresh() {
    const reason = validate();
    // 同じ理由で読み上げ通知を繰り返さない。
    if (status.textContent !== reason) status.textContent = reason;
    action.disabled = reason.length > 0;
    return !reason;
  }

  for (const field of fields) {
    field.addEventListener('input', refresh); field.addEventListener('change', refresh);
  }
  // 通信は行わず、開いたまま期限が過ぎた場合も操作を無効にする。
  const timer = setInterval(refresh, 1000);
  dialog.addEventListener('close', () => { clearInterval(timer); }, { once: true });
  refresh();
  return refresh;
}
