// 会場画像をモックの折畳み・下部操作で表示し、端末確認用の登録と区画の対応付けを扱う。

import { el, button, showDialog } from './dom.ts';
import { createVenueImageStore } from '../storage/venue-images.ts';
import type { DeviceKeyScope } from '../storage/device-vault.ts';
import { IMAGE_MAX_BYTES, IMAGE_SLOTS, prepareVenueImage } from '../domain/seats/venue-image.ts';
import type { ImageSlot, VenueImageHead } from '../domain/seats/venue-image.ts';

interface Context {
  scope: DeviceKeyScope;
  assertAuthorized(): void;
  isActive(): boolean;
  section(): string | undefined;
  sections(): readonly { id: string; name: string }[];
  bindings(): Readonly<Record<string, ImageSlot>>;
  bind(sectionId: string, slot: ImageSlot | undefined): void;
  navigate(sectionId: string): Promise<void>;
}

type ImageValue = Awaited<ReturnType<ReturnType<typeof createVenueImageStore>['readImage']>>;

/** 座席の処理と画像読込みを分離し、検証・保存済み画像だけを表示する部品を作る。 */
export function createVenueImageViewer(context: Context) {
  const store = createVenueImageStore(context.scope, context.assertAuthorized);
  const root = el('details', 'venue-images');
  const summary = el('summary', '', '会場画像を表示／隠す');
  const viewport = el('div', 'venue-image-viewport');
  const stage = el('div', 'venue-image-stage');
  const image = el('img');
  const fallback = el('p', 'muted', '会場画像は未設定です。座席表で確認できます。');
  const status = el('p', 'muted');
  const error = el('p', 'field-error');
  const controls = el('div', 'venue-image-controls');
  const pageLabel = el('span', '', '0/0');
  const zoomLabel = el('span', '', '100%');
  const bindingLabel = el('label', 'seat-field', 'この区画の画像');
  const choice = el('select');
  const file = el('input');
  const images = new Map<ImageSlot, ImageValue>();
  const failed = new Set<ImageSlot>();
  let previewSlot: ImageSlot | undefined;
  let url: string | undefined;
  let shownIdentity = '';
  let zoom = 1;
  let loading = true;
  let writing = false;
  let replacing = false;
  let gesture: { x: number; y: number; left: number; top: number; mouse: boolean } | undefined;

  image.alt = '会場画像';
  image.draggable = false;
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', '会場画像の表示領域');
  error.setAttribute('role', 'alert');
  status.setAttribute('role', 'status');
  choice.setAttribute('aria-label', 'この区画の画像');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,.png,.jpg,.jpeg';
  file.hidden = true;
  bindingLabel.append(choice);
  stage.append(image);
  viewport.append(stage);

  /** 現在の区画に対応する枠を使い、別区画の画像へ勝手に代替しない。 */
  function currentSlot(): ImageSlot | undefined {
    const section = context.section();

    return section ? context.bindings()[section] : previewSlot;
  }

  /** 区画に対応する画像だけを前後操作の対象にする。区画未作成時は単独確認を許可する。 */
  function navigableSlots(): ImageSlot[] {
    const referenced = new Set(Object.values(context.bindings()));

    return IMAGE_SLOTS.filter((slot) => images.get(slot)?.blob && (!context.section() || referenced.has(slot)));
  }

  /** 表示領域へ収めた100%を基準にし、小さい画像も中央へ配置する。 */
  function sizeImage(center = false) {
    if (!image.naturalWidth || !viewport.clientWidth || viewport.hidden) return;
    // スクロールバーの出入りで100%の基準が揺れないよう、表示枠の内側を基準にする。
    const frame = viewport.getBoundingClientRect();
    const baseWidth = frame.width - viewport.clientLeft * 2, baseHeight = frame.height - viewport.clientTop * 2;
    const base = Math.min(baseWidth / image.naturalWidth, baseHeight / image.naturalHeight);
    const width = image.naturalWidth * base * zoom, height = image.naturalHeight * base * zoom;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    stage.style.width = `${Math.max(viewport.clientWidth, width)}px`;
    stage.style.height = `${Math.max(viewport.clientHeight, height)}px`;
    viewport.style.touchAction = zoom <= 1 ? 'pan-y' : 'pan-x pan-y';
    if (center) {
      viewport.scrollLeft = (stage.clientWidth - viewport.clientWidth) / 2;
      viewport.scrollTop = (stage.clientHeight - viewport.clientHeight) / 2;
    }
  }

  /** 指定した関連画像へ移動し、その画像が対応する区画も同じ手順で切り替える。 */
  async function navigate(direction: -1 | 1) {
    const slots = navigableSlots(), slot = currentSlot();
    if (slots.length < 2 || !slot) return;
    const target = slots[(slots.indexOf(slot) + direction + slots.length) % slots.length]!;
    const section = context.sections().find((item) => context.bindings()[item.id] === target);
    if (section) await context.navigate(section.id);
    else previewSlot = target;
    refresh();
  }

  /** 拡大率だけを変更し、席の設定・下書き・画像本文には書き込まない。 */
  function changeZoom(amount: number) {
    zoom = Math.max(0.5, Math.min(2, Math.round((zoom + amount) * 100) / 100));
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    sizeImage(true);
  }

  const previous = button('←', () => { void navigate(-1); }, 'button secondary');
  const next = button('→', () => { void navigate(1); }, 'button secondary');
  const smaller = button('－', () => changeZoom(-0.25), 'button secondary');
  const larger = button('＋', () => changeZoom(0.25), 'button secondary');
  const add = button('画像を追加', () => { replacing = false; file.click(); }, 'button secondary');
  const replace = button('画像を差し替え', () => { replacing = true; file.click(); }, 'button secondary');
  previous.setAttribute('aria-label', '前の会場画像');
  next.setAttribute('aria-label', '次の会場画像');
  smaller.setAttribute('aria-label', '会場画像を縮小');
  larger.setAttribute('aria-label', '会場画像を拡大');
  const pages = el('div', 'venue-image-page-controls'), scale = el('div', 'venue-image-zoom-controls');
  pages.append(previous, pageLabel, next);
  scale.append(smaller, zoomLabel, larger);
  controls.append(pages, scale);
  const manage = el('div', 'venue-image-manage');
  manage.append(bindingLabel, add, replace, file);
  root.append(summary, fallback, viewport, controls, manage, error, status);

  /** 確認済みのキャッシュを表示し、欠損時は座席表を使える案内を維持する。 */
  function refresh() {
    if (!context.isActive()) return;
    const slot = currentSlot(), value = slot ? images.get(slot) : null;
    const options = [el('option', '', '指定なし')];
    options[0]!.value = '';
    for (const candidate of IMAGE_SLOTS) {
      if (!images.get(candidate)?.blob && candidate !== slot) continue;
      const option = el('option', '', `画像${Number(candidate) + 1}${images.get(candidate)?.blob ? '' : '（未取得）'}`);
      option.value = candidate;
      options.push(option);
    }
    choice.replaceChildren(...options);
    choice.value = slot ?? '';
    choice.disabled = !context.section() || loading || writing;
    add.disabled = loading || writing;
    replace.disabled = loading || writing || !value?.blob;
    const slots = navigableSlots();
    pageLabel.textContent = `${slot && slots.includes(slot) ? slots.indexOf(slot) + 1 : 0}/${slots.length}`;
    previous.disabled = next.disabled = slots.length < 2 || writing || !value?.blob;
    viewport.hidden = controls.hidden = !value?.blob;
    fallback.hidden = !!value?.blob;
    fallback.textContent = loading ? '会場画像を端末で確認しています。座席表はそのまま操作できます。' :
      slot ? 'この区画の画像を取得できません。座席表で確認してください。' : '会場画像は未設定です。座席表で確認できます。';
    if (!value?.blob) {
      if (url) URL.revokeObjectURL(url);
      url = undefined;
      shownIdentity = '';
      image.removeAttribute('src');
      return;
    }
    const identity = `${slot}/${value.head.revision}/${value.head.sha256}`;
    if (identity !== shownIdentity) {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(value.blob);
      shownIdentity = identity;
      zoom = 1;
      zoomLabel.textContent = '100%';
      image.alt = `会場画像${Number(slot) + 1}`;
      image.src = url;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        image.animate([{ opacity: 0.6, transform: 'translateX(8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 140 });
      }
    }
    sizeImage();
  }

  /** ファイルの検証後に確認を求め、暗号化保存が完了した画像だけを反映する。 */
  async function chooseFile() {
    const selected = file.files?.[0];
    file.value = '';
    if (!selected || writing) return;
    error.textContent = '';
    const sectionId = context.section();
    const slot = replacing ? currentSlot() : IMAGE_SLOTS.find((item) => !images.get(item)?.blob && !failed.has(item));
    if (!slot) { error.textContent = '画像は5枚までです。表示中の画像を差し替えてください。'; return; }
    const prior = images.get(slot);
    try {
      context.assertAuthorized();
      if (selected.size > IMAGE_MAX_BYTES) throw Error('IMAGE_SIZE_EXCEEDED');
      const payload = await prepareVenueImage(context.scope, new Uint8Array(await selected.arrayBuffer()), selected.type,
        prior?.head.revision ?? 0, crypto.randomUUID());
      context.assertAuthorized();
      if (context.section() !== sectionId) throw Error('IMAGE_SECTION_CHANGED');
      const body = el('div');
      body.append(el('p', '', replacing ? 'この端末の確認用画像を差し替えて保存します。共有は行いません。' :
        'この端末に確認用画像を保存します。共有は行いません。'));
      body.append(el('p', '', '「この区画の画像」の設定は「下書き保存」で保存します。'));
      const affected = context.sections().filter((section) => context.bindings()[section.id] === slot).length;
      if (replacing && affected > 1) body.append(el('p', '', `この画像を使用中の${affected}区画に反映されます。`));
      const message = el('p');
      message.setAttribute('role', 'alert');
      body.append(message);
      const confirm = button('端末に保存する', async () => {
        if (writing) return;
        writing = true;
        confirm.disabled = true;
        let savedToDevice = false;
        try {
          context.assertAuthorized();
          const head: VenueImageHead = { environmentId: context.scope.environmentId, performanceId: context.scope.performanceId,
            schemaVersion: 1, revision: payload.revision, active: true, bank: prior?.head.bank === 'a' ? 'b' : 'a',
            operationId: payload.operationId, sha256: payload.sha256 };
          const saved = await store.saveImage(slot, head, payload, prior?.localRevision ?? 0);
          savedToDevice = true;
          context.assertAuthorized();
          images.set(slot, saved);
          if (sectionId) context.bind(sectionId, slot);
          else previewSlot = slot;
          status.textContent = '確認用画像をこの端末に保存しました。';
          dialog.close();
        } catch {
          message.textContent = savedToDevice ? '画像は端末に保存しました。区画との対応を選び直してください。' :
            '保存できませんでした。元の画像を保持しています。別タブの変更や保存容量を確認してください。';
        } finally {
          writing = false;
          confirm.disabled = false;
          refresh();
        }
      });
      const dialog = showDialog(replacing ? '会場画像を差し替え' : '会場画像を追加', body, [confirm]);
    } catch {
      error.textContent = '画像を読み込めません。PNG・JPEGで1枚1MB以下の画像を選び、区画を変えずに確認してください。';
    }
  }

  // 操作・表示イベント：画像の拡大・切替は席データを変更せず、対応付けだけを下書きへ通知する。
  file.addEventListener('change', () => { void chooseFile(); });
  choice.addEventListener('change', () => {
    const section = context.section();
    if (section) context.bind(section, choice.value ? choice.value as ImageSlot : undefined);
    refresh();
  });
  root.addEventListener('toggle', () => sizeImage(true));
  image.addEventListener('load', () => sizeImage(true));
  image.addEventListener('error', () => {
    if (!url || !image.getAttribute('src')) return;
    error.textContent = '画像を表示できません。座席表で確認してください。';
    viewport.hidden = controls.hidden = true;
    fallback.hidden = false;
  });
  viewport.addEventListener('pointerdown', (event) => {
    gesture = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, mouse: event.pointerType === 'mouse' };
    if (gesture.mouse && zoom > 1) viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!gesture?.mouse || zoom <= 1) return;
    viewport.scrollLeft = gesture.left - (event.clientX - gesture.x);
    viewport.scrollTop = gesture.top - (event.clientY - gesture.y);
  });
  viewport.addEventListener('pointerup', (event) => {
    const start = gesture;
    gesture = undefined;
    if (!start || zoom > 1) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) void navigate(dx < 0 ? 1 : -1);
  });
  viewport.addEventListener('pointercancel', () => { gesture = undefined; });
  const resize = new ResizeObserver(() => sizeImage());
  resize.observe(viewport);
  const observer = new MutationObserver(() => {
    if (context.isActive()) return;
    if (url) URL.revokeObjectURL(url);
    url = undefined;
    image.removeAttribute('src');
    images.clear();
    resize.disconnect();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  /** 復号・実体検査は1画像ずつ背景で行い、大きい画像の同時復号を避ける。 */
  async function restoreImages() {
    for (const slot of IMAGE_SLOTS) {
      if (!context.isActive()) return;
      try { images.set(slot, await store.readImage(slot)); }
      catch { failed.add(slot); }
    }
    loading = false;
    refresh();
  }

  // 初回読込み：席の表示・操作を待たずに、画像の復元を開始する。
  void restoreImages();

  return { element: root, refresh, isSaving: () => writing };
}
