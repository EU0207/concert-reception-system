// 画像内の2本指ズーム・移動と、全体表示時のスワイプを保存処理から独立して扱う。

interface Options {
  scale(): number;
  fit(): number;
  resize(scale: number): void;
  navigate(direction: -1 | 1): void;
}

type Point = { x: number; y: number; mouse: boolean };

/** 指の中心を保ちながら画像だけを拡大し、終了時の誤った画像切替を防ぐ。 */
export function createVenueImageGestures(viewport: HTMLElement, image: HTMLImageElement, options: Options) {
  const pointers = new Map<number, Point>();
  let drag: (Point & { left: number; top: number }) | undefined;
  let pinch: { distance: number; scale: number; x: number; y: number } | undefined;
  let hadPinch = false;
  let frame: number | undefined;

  /** 現在の2点の距離と中心を取得する。 */
  function pair() {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;

    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** 指の配置が変わった時点で、ズームの基準と画像内の注目点を固定する。 */
  function startPinch() {
    const points = pair();
    if (!points?.distance) return;
    const rect = image.getBoundingClientRect(), scale = options.scale();
    pinch = { distance: points.distance, scale, x: (points.x - rect.left) / scale, y: (points.y - rect.top) / scale };
    hadPinch = true;
  }

  /** 1フレームに1回だけ寸法を変更し、2本指の中心が指す画像内の位置を保つ。 */
  function applyPinch() {
    frame = undefined;
    const points = pair();
    if (!pinch || !points) return;
    const scale = Math.max(0.01, Math.min(4, pinch.scale * points.distance / pinch.distance));
    options.resize(scale);
    const rect = image.getBoundingClientRect();
    viewport.scrollLeft += rect.left + pinch.x * scale - points.x;
    viewport.scrollTop += rect.top + pinch.y * scale - points.y;
  }

  /** 操作開始時の位置を記録し、2本目の指からピンチ操作へ切り替える。 */
  function down(event: PointerEvent) {
    if (!image.naturalWidth || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const point = { x: event.clientX, y: event.clientY, mouse: event.pointerType === 'mouse' };
    pointers.set(event.pointerId, point);
    // 合成イベントには実ポインターがないため、実操作だけを表示枠へ捕捉する。
    if (event.isTrusted) viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      hadPinch = false;
      drag = { ...point, left: viewport.scrollLeft, top: viewport.scrollTop };
    } else startPinch();
  }

  /** 拡大中は画像を動かし、全体表示の1本指縦移動ではページを動かす。 */
  function move(event: PointerEvent) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      if (frame === undefined) frame = requestAnimationFrame(applyPinch);
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (options.scale() > options.fit()) {
      viewport.scrollLeft = drag.left - dx;
      viewport.scrollTop = drag.top - dy;
    } else if (!drag.mouse && !hadPinch && Math.abs(dy) > Math.abs(dx)) {
      window.scrollBy(0, previous.y - event.clientY);
    }
  }

  /** 指が離れた時は移動基準を引き直し、ピンチと取消しでは画像を切り替えない。 */
  function up(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    if (frame !== undefined) { cancelAnimationFrame(frame); applyPinch(); }
    pointers.delete(event.pointerId);
    pinch = undefined;
    if (pointers.size >= 2) { startPinch(); return; }
    const remaining = [...pointers.values()][0];
    if (remaining) {
      drag = { ...remaining, left: viewport.scrollLeft, top: viewport.scrollTop };
      return;
    }
    const start = drag;
    drag = undefined;
    if (!start || hadPinch || event.type !== 'pointerup' || options.scale() > options.fit()) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) options.navigate(dx < 0 ? 1 : -1);
  }

  /** 画像の切替・画面終了では、保留中の描画とポインター情報を破棄する。 */
  function reset() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    for (const id of pointers.keys()) {
      if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    }
    pointers.clear();
    drag = pinch = undefined;
    hadPinch = false;
  }

  /** 画面から外れた後にイベントと画像の参照を残さない。 */
  function dispose() {
    reset();
    viewport.removeEventListener('pointerdown', down);
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', up);
    viewport.removeEventListener('pointercancel', up);
  }

  // イベント登録：実際の拡大・移動は接触開始後に行い、画像本文は変更しない。
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', up);

  return { reset, dispose };
}
