export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
export function button(label: string, onClick: () => void, className = 'button'): HTMLButtonElement {
  const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', onClick); return node;
}
export function showDialog(title: string, body: HTMLElement, actions: HTMLElement[] = []): HTMLDialogElement {
  const previous = document.activeElement;
  const dialog = el('dialog', 'dialog'), heading = el('h2', '', title);
  heading.id = 'dialog-title'; dialog.setAttribute('aria-labelledby', heading.id);
  const close = button('閉じる', () => dialog.close(), 'button secondary');
  const footer = el('div', 'dialog-actions'); footer.append(...actions, close);
  dialog.append(heading, body, footer); document.body.append(dialog); dialog.showModal();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }, { once: true });
  return dialog;
}
