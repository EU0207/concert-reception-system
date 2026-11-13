// 座席表の倍率と表示位置を扱う。席構成と端末下書きのデータは変更しない。

import { button, el } from './dom.ts';

/** 区画ごとに画面内だけで保持する表示状態。 */
export interface SeatCanvasView {
  scale: number;
  left: number;
  top: number;
}

/** 座席キャンバスへ移動・拡大縮小と選択位置への復帰を接続する。 */
export function mountSeatCanvasNavigation(
  canvas: HTMLElement,
  map: HTMLElement,
  view: SeatCanvasView,
  selectedCellId: () => string | undefined,
) {
  const controls = el('div', 'seat-canvas-tools');
  const status = el('p', 'muted');
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined;
  let suppressClick = false;
  status.setAttribute('role', 'status');

  /** ブラウザーが範囲内へ収めた実際の表示位置を保持する。 */
  function rememberPosition() {
    if (!canvas.isConnected) return;
    view.left = canvas.scrollLeft;
    view.top = canvas.scrollTop;
  }

  /** 現在の中央付近を維持しながら倍率を変更する。 */
  function zoom(delta: number) {
    const previous = view.scale;
    const next = Math.max(0.5, Math.min(2, Math.round((previous + delta) * 10) / 10));
    const centerX = canvas.scrollLeft + canvas.clientWidth / 2;
    const centerY = canvas.scrollTop + canvas.clientHeight / 2;
    view.scale = next;
    map.style.zoom = String(next);
    canvas.scrollTo(centerX * next / previous - canvas.clientWidth / 2,
      centerY * next / previous - canvas.clientHeight / 2);
    rememberPosition();
    updateControls();
  }

  /** 標準倍率で座席表の左上を表示する。 */
  function reset() {
    view.scale = 1;
    map.style.zoom = '1';
    canvas.scrollTo(0, 0);
    rememberPosition();
    updateControls();
  }

  /** 同じセルIDが現在の区画にある場合だけ、画面の中央へ表示する。 */
  function focusSelected() {
    const id = selectedCellId();
    const target = id ? map.querySelector<HTMLElement>(`[data-cell-id="${id}"]`) : null;
    if (!target) {
      status.textContent = '先にセルを1つ選択してください。';
      return;
    }

    const area = canvas.getBoundingClientRect();
    const cell = target.getBoundingClientRect();
    canvas.scrollBy(cell.left - area.left - canvas.clientLeft + cell.width / 2 - canvas.clientWidth / 2,
      cell.top - area.top - canvas.clientTop + cell.height / 2 - canvas.clientHeight / 2);
    rememberPosition();
    status.textContent = '選択したセルを表示しました。';
  }

  /** キーボードと方向ボタンで、表示範囲を画面幅の半分ずつ移動する。 */
  function move(x: number, y: number) {
    canvas.scrollBy(x * Math.max(80, canvas.clientWidth / 2), y * Math.max(80, canvas.clientHeight / 2));
    rememberPosition();
  }

  /** 倍率の表示と、上限・下限のボタン状態を更新する。 */
  function updateControls() {
    smaller.disabled = view.scale <= 0.5;
    larger.disabled = view.scale >= 2;
    status.textContent = `表示倍率 ${Math.round(view.scale * 100)}%`;
  }

  /** マウスの移動が一定距離を超えた場合だけ、席選択からパンへ切り替える。 */
  function movePointer(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const x = event.clientX - drag.x, y = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(x, y) < 6) return;

    drag.moved = true;
    suppressClick = true;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-panning');
    canvas.scrollTo(drag.left - x, drag.top - y);
    rememberPosition();
    event.preventDefault();
  }

  /** パン終了時のクリックを席選択へ渡さず、次の操作を受け付ける。 */
  function finishPointer(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    drag = undefined;
    canvas.classList.remove('is-panning');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    setTimeout(() => { suppressClick = false; }, 0);
  }

  const smaller = button('−', () => zoom(-0.1), 'button secondary');
  const larger = button('＋', () => zoom(0.1), 'button secondary');
  smaller.setAttribute('aria-label', '座席表を縮小');
  larger.setAttribute('aria-label', '座席表を拡大');
  controls.append(smaller, larger, button('標準倍率で左上へ', reset, 'button secondary'),
    button('選択席へ戻る', focusSelected, 'button secondary'));
  for (const [label, x, y] of [['左', -1, 0], ['右', 1, 0], ['上', 0, -1], ['下', 0, 1]] as const) {
    const direction = button(`${label}へ`, () => move(x, y), 'button secondary');
    direction.setAttribute('aria-label', `座席表を${label}へ移動`);
    controls.append(direction);
  }
  controls.append(status);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'region');
  canvas.setAttribute('aria-label', '座席表の表示範囲');
  canvas.addEventListener('scroll', rememberPosition);
  canvas.addEventListener('keydown', (event) => {
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;

    event.preventDefault();
    move(...direction);
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      left: canvas.scrollLeft, top: canvas.scrollTop, moved: false };
  });
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);
  canvas.addEventListener('lostpointercapture', finishPointer);
  canvas.addEventListener('dragstart', (event) => event.preventDefault());
  canvas.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  map.style.zoom = String(view.scale);
  canvas.scrollTo(view.left, view.top);
  rememberPosition();
  updateControls();

  return controls;
}
