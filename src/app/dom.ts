// 共通の画面部品を作る。文字列はHTMLとして解釈させず、textContentで設定する。

// # 本文：画面部品の生成

/** 指定したHTML要素を作り、必要に応じてクラスと表示文字列を設定する。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text) node.textContent = text;

  return node;
}

/** フォーム送信を起こさないボタンを作り、クリック時の処理を登録する。 */
export function button(
  label: string,
  onClick: () => void,
  className = 'button',
): HTMLButtonElement {
  const node = el('button', className, label);

  node.type = 'button';
  node.addEventListener('click', onClick);

  return node;
}

/** 確認用のダイアログを開く。閉じた後は部品を片付け、元の要素へフォーカスを戻す。 */
export function showDialog(
  title: string,
  body: HTMLElement,
  actions: HTMLElement[] = [],
): HTMLDialogElement {
  const previous = document.activeElement;
  const dialog = el('dialog', 'dialog'),
    heading = el('h2', '', title);

  heading.id = 'dialog-title';
  dialog.setAttribute('aria-labelledby', heading.id);

  const close = button('閉じる', () => dialog.close(), 'button secondary');
  const footer = el('div', 'dialog-actions');

  footer.append(...actions, close);
  dialog.append(heading, body, footer);
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();

      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    },
    { once: true },
  );

  return dialog;
}
