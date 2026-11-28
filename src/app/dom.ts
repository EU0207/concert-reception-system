// 共通の画面部品を作る。文字列はHTMLとして解釈させず、textContentで設定する。

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

/** ボタンや操作リンクをまとめ、折り返しても共通の間隔を維持する。 */
export function actionGroup(...actions: HTMLElement[]): HTMLDivElement {
  const group = el('div', 'action-group');
  group.append(...actions);
  return group;
}

/** エラー文と該当入力を関連付け、解消時にこの案内だけを外す。 */
export function formError(title: string) {
  const element = el('div', 'form-error');
  element.id = `form-error-${crypto.randomUUID()}`;
  element.setAttribute('role', 'alert');
  let current = '', marked: HTMLElement[] = [];

  /** メッセージと対象が変わったときだけ表示を更新する。 */
  function show(text: string, fields: HTMLElement[] = []) {
    if (!text) fields = [];
    if (text === current && fields.length === marked.length && fields.every((field, index) => field === marked[index])) return;

    for (const field of marked) {
      const descriptions = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== element.id);
      if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
      else field.removeAttribute('aria-describedby');
      field.removeAttribute('aria-invalid');
      field.classList.remove('form-error-field');
    }
    element.replaceChildren();
    current = text;
    marked = fields;
    if (!text) return;

    const icon = el('span', 'form-error-icon', '！'), detail = el('div');
    icon.setAttribute('aria-hidden', 'true');
    detail.append(el('strong', '', title), el('span', '', text));
    element.append(icon, detail);
    for (const field of marked) {
      const descriptions = field.getAttribute('aria-describedby');
      field.setAttribute('aria-describedby', descriptions ? `${descriptions} ${element.id}` : element.id);
      field.setAttribute('aria-invalid', 'true');
      field.classList.add('form-error-field');
    }
  }

  return { element, show };
}

/** 確認用のダイアログを開く。閉じた後は部品を片付け、元の要素へフォーカスを戻す。 */
export function showDialog(
  title: string,
  body: HTMLElement,
  actions: HTMLElement[] = [],
  closeLabel = '閉じる',
): HTMLDialogElement {
  const previous = document.activeElement;
  const dialog = el('dialog', 'dialog'),
    heading = el('h2', '', title);

  heading.id = 'dialog-title';
  dialog.setAttribute('aria-labelledby', heading.id);

  const close = button(closeLabel, () => dialog.close(), 'button secondary');
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
