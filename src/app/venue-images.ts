// 会場画像をモックの折畳み・下部操作で表示し、端末確認用の登録と区画の対応付けを扱う。

import { el, button, showDialog } from './dom.ts';
import { convertPhoto } from './photo-conversion.ts';
import { createVenueImageGestures } from './venue-image-gestures.ts';
import { createVenueImageStore } from '../storage/venue-images.ts';
import type { DeviceKeyScope } from '../storage/device-vault.ts';
import { IMAGE_SLOTS, prepareVenueImage } from '../domain/seats/venue-image.ts';
import type { ImageSlot, VenueImageHead } from '../domain/seats/venue-image.ts';

interface Context {
  scope: DeviceKeyScope;
  assertAuthorized(): void;
  isActive(): boolean;
  section(): string | undefined;
  sections(): readonly { id: string; name: string }[];
  bindings(): Readonly<Record<string, ImageSlot>>;
  bind(sectionId: string, slot: ImageSlot | undefined): void;
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
  const count = el('p', 'muted');
  const error = el('p', 'field-error');
  const controls = el('div', 'venue-image-controls');
  const pageLabel = el('span', '', '0/0');
  const zoomLabel = el('span', '', '100%');
  const bindingName = 'この区画で最初に表示する画像（任意）';
  const bindingLabel = el('label', 'seat-field', bindingName);
  const choice = el('select');
  const file = el('input');
  const images = new Map<ImageSlot, ImageValue>();
  const failed = new Set<ImageSlot>();
  let previewSlot: ImageSlot | undefined;
  let previousSection: string | undefined;
  let previousBinding: ImageSlot | undefined;
  let url: string | undefined;
  let shownIdentity = '';
  // 未指定は全体表示。数値は画像の原寸に対する倍率として保持する。
  let zoom: number | undefined;
  let loading = true;
  let writing = false;
  let converting: AbortController | undefined;
  let photoDialog: HTMLDialogElement | undefined;
  let replacing = false;

  image.alt = '会場画像';
  image.draggable = false;
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', '会場画像の表示領域');
  error.setAttribute('role', 'alert');
  status.setAttribute('role', 'status');
  choice.setAttribute('aria-label', bindingName);
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/webp,image/heic,image/heif,.png,.jpg,.jpeg,.webp,.heic,.heif';
  file.hidden = true;
  bindingLabel.append(choice);
  stage.append(image);
  viewport.append(stage);

  /** 区画切替時だけ任意の優先画像を選び、未設定なら表示中の画像を維持する。 */
  function currentSlot(): ImageSlot | undefined {
    const section = context.section();
    const preferred = section ? context.bindings()[section] : undefined;
    const slots = navigableSlots();
    if ((section !== previousSection || preferred !== previousBinding || !previewSlot) && preferred && slots.includes(preferred)) {
      previewSlot = preferred;
    }
    if (!previewSlot || !slots.includes(previewSlot)) previewSlot = slots[0];
    previousSection = section;
    previousBinding = preferred;

    return previewSlot;
  }

  /** 区画との対応に関係なく、公演全体の検証済み画像を閲覧対象にする。 */
  function navigableSlots(): ImageSlot[] {
    return IMAGE_SLOTS.filter((slot) => images.get(slot)?.blob);
  }

  /** 原寸を超えない範囲で、スクロールバーに影響されない全体表示倍率を計算する。 */
  function fitScale() {
    const frame = viewport.getBoundingClientRect();
    const width = frame.width - viewport.clientLeft * 2, height = frame.height - viewport.clientTop * 2;

    return Math.min(1, width / image.naturalWidth, height / image.naturalHeight);
  }

  /** 原寸基準の倍率を適用し、全体表示の場合だけ表示枠に合わせる。 */
  function sizeImage(center = false) {
    if (!image.naturalWidth || !viewport.clientWidth || viewport.hidden) return;
    const base = fitScale();
    const scale = zoom ?? base;
    const percentage = Math.round(scale * 100);
    zoomLabel.textContent = `${percentage}%`;
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    stage.style.width = `${Math.max(viewport.clientWidth, width)}px`;
    stage.style.height = `${Math.max(viewport.clientHeight, height)}px`;
    // 画像枠内だけでピンチを処理する。ページ全体のタッチ操作は変更しない。
    viewport.style.touchAction = 'none';
    if (center) {
      viewport.scrollLeft = (stage.clientWidth - viewport.clientWidth) / 2;
      viewport.scrollTop = (stage.clientHeight - viewport.clientHeight) / 2;
    }
  }

  /** 公演全体の画像だけを前後へ切り替え、区画と下書きは変更しない。 */
  function navigate(direction: -1 | 1) {
    const slots = navigableSlots(), slot = currentSlot();
    if (slots.length < 2 || !slot) return;
    const target = slots[(slots.indexOf(slot) + direction + slots.length) % slots.length]!;
    previewSlot = target;
    refresh();
  }

  /** 拡大率だけを変更し、席の設定・下書き・画像本文には書き込まない。 */
  function changeZoom(direction: -1 | 1) {
    if (!image.naturalWidth || !viewport.clientWidth) return;
    const steps = [0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
    const current = zoom ?? fitScale();
    zoom = direction === 1 ? steps.find((step) => step > current + 0.000001) ?? 4 :
      steps.findLast((step) => step < current - 0.000001) ?? 0.01;
    sizeImage(true);
  }

  const previous = button('←', () => { void navigate(-1); }, 'button secondary');
  const next = button('→', () => { void navigate(1); }, 'button secondary');
  const smaller = button('－', () => changeZoom(-1), 'button secondary');
  const larger = button('＋', () => changeZoom(1), 'button secondary');
  const actualSize = button('原寸', () => {
    if (!image.naturalWidth || !viewport.clientWidth) return;
    zoom = 1;
    sizeImage(true);
  }, 'button secondary');
  const fit = button('全体表示', () => { zoom = undefined; sizeImage(true); }, 'button secondary');
  const add = button('画像を追加', () => { replacing = false; file.click(); }, 'button secondary');
  const replace = button('画像を差し替え', () => { replacing = true; file.click(); }, 'button secondary');
  const remove = button('画像を削除', () => { void removeImage(); }, 'button secondary venue-image-remove');
  previous.setAttribute('aria-label', '前の会場画像');
  next.setAttribute('aria-label', '次の会場画像');
  smaller.setAttribute('aria-label', '会場画像を縮小');
  larger.setAttribute('aria-label', '会場画像を拡大');
  const pages = el('div', 'venue-image-page-controls'), scale = el('div', 'venue-image-zoom-controls');
  pages.append(previous, pageLabel, next);
  scale.append(smaller, zoomLabel, larger, actualSize, fit);
  controls.append(pages, scale);
  const manage = el('div', 'venue-image-manage');
  manage.append(bindingLabel, add, replace, remove, file);
  root.append(summary, count, fallback, viewport, controls, manage, error, status);
  const gestures = createVenueImageGestures(viewport, image, {
    scale: () => zoom ?? fitScale(), fit: fitScale, navigate,
    resize: (value) => { zoom = value; sizeImage(); },
  });

  /** 確認済みのキャッシュを表示し、欠損時は座席表を使える案内を維持する。 */
  function refresh() {
    if (!context.isActive()) return;
    if (converting) { converting.abort(); photoDialog?.close(); }
    const slot = currentSlot(), value = slot ? images.get(slot) : null;
    const section = context.section(), preferred = section ? context.bindings()[section] : undefined;
    const options = [el('option', '', '指定なし')];
    options[0]!.value = '';
    for (const candidate of IMAGE_SLOTS) {
      if (!images.get(candidate)?.blob && candidate !== preferred) continue;
      const option = el('option', '', `画像${Number(candidate) + 1}${images.get(candidate)?.blob ? '' : '（未取得）'}`);
      option.value = candidate;
      options.push(option);
    }
    choice.replaceChildren(...options);
    choice.value = preferred ?? '';
    choice.disabled = !context.section() || loading || writing;
    add.disabled = loading || writing;
    replace.disabled = loading || writing || !value?.blob;
    remove.disabled = loading || writing || !value?.blob;
    const slots = navigableSlots();
    count.textContent = loading ? '公演全体の画像を確認しています。' : `公演全体の画像：${slots.length}／5枚`;
    pageLabel.textContent = `${slot && slots.includes(slot) ? slots.indexOf(slot) + 1 : 0}/${slots.length}`;
    previous.disabled = next.disabled = slots.length < 2 || writing || !value?.blob;
    viewport.hidden = controls.hidden = !value?.blob;
    fallback.hidden = !!value?.blob;
    fallback.textContent = loading ? '会場画像を端末で確認しています。座席表はそのまま操作できます。' :
      '表示できる会場画像はありません。座席表で確認できます。';
    if (!value?.blob) {
      gestures.reset();
      if (url) URL.revokeObjectURL(url);
      url = undefined;
      shownIdentity = '';
      image.removeAttribute('src');
      return;
    }
    const identity = `${slot}/${value.head.revision}/${value.head.sha256}`;
    if (identity !== shownIdentity) {
      gestures.reset();
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(value.blob);
      shownIdentity = identity;
      zoom = undefined;
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
    if (!selected || writing || converting || photoDialog?.open) return;
    error.textContent = '';
    const sectionId = context.section();
    const slot = replacing ? currentSlot() : IMAGE_SLOTS.find((item) => !images.get(item)?.blob && !failed.has(item));
    if (!slot) { error.textContent = '画像は公演全体で5枚までです。表示中の画像を差し替えてください。'; return; }
    const prior = images.get(slot);
    const isReplacing = replacing;
    const controller = new AbortController();
    converting = controller;
    const progress = el('div');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-busy', 'true');
    progress.append(el('p', '', '写真をこの端末で調整しています。外部へ送信しません。'));
    const pendingDialog = showDialog('会場画像を調整中', progress, [], 'キャンセル');
    const dots = el('span', 'photo-progress-dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.append(el('span', '', '.'), el('span', '', '.'), el('span', '', '.'));
    pendingDialog.querySelector('h2')!.append(dots);
    photoDialog = pendingDialog;
    pendingDialog.addEventListener('close', () => controller.abort(), { once: true });
    try {
      context.assertAuthorized();
      const converted = await convertPhoto(selected, controller.signal);
      if (controller.signal.aborted || !pendingDialog.open || !context.isActive()) throw Error('PHOTO_CANCELLED');
      const payload = await prepareVenueImage(context.scope, new Uint8Array(await converted.blob.arrayBuffer()), converted.blob.type,
        prior?.head.revision ?? 0, crypto.randomUUID());
      context.assertAuthorized();
      if (controller.signal.aborted || !pendingDialog.open || !context.isActive() || context.section() !== sectionId) throw Error('PHOTO_CANCELLED');
      converting = undefined;
      pendingDialog.close();
      const body = el('div');
      body.append(el('p', '', isReplacing ? 'この端末の確認用画像を差し替えて保存します。共有は行いません。' :
        'この端末に確認用画像を保存します。共有は行いません。'));
      body.append(el('p', '', `${converted.blob.type === 'image/png' ? 'PNG' : 'JPEG'}・${(converted.blob.size / 1_000_000).toFixed(2)}MB／1MB・${converted.width}×${converted.height}px（元：${converted.originalWidth}×${converted.originalHeight}px）`));
      body.append(el('p', '', '「原寸で確認」で、席番号と画像の向きを確認してください。'));
      const previewUrl = URL.createObjectURL(converted.blob);
      const preview = el('div', 'photo-preview');
      const previewImage = el('img');
      previewImage.src = previewUrl;
      previewImage.alt = '保存前の調整済み会場画像';
      preview.append(previewImage);
      const zoom = button('原寸で確認', () => {
        const actual = preview.classList.toggle('photo-preview-actual');
        zoom.textContent = actual ? '全体を表示' : '原寸で確認';
        zoom.setAttribute('aria-pressed', String(actual));
      }, 'button secondary');
      zoom.setAttribute('aria-pressed', 'false');
      body.append(preview, zoom);
      body.append(el('p', '', '区画との対応は任意です。設定した場合は「下書き保存」で保存します。'));
      const affected = context.sections().filter((section) => context.bindings()[section.id] === slot).length;
      if (affected > 1) body.append(el('p', '', `この画像を使用中の${affected}区画に反映されます。`));
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
          if (!context.isActive() || context.section() !== sectionId) throw Error('IMAGE_SECTION_CHANGED');
          const head: VenueImageHead = { environmentId: context.scope.environmentId, performanceId: context.scope.performanceId,
            schemaVersion: 1, revision: payload.revision, active: true, bank: prior?.head.bank === 'a' ? 'b' : 'a',
            operationId: payload.operationId, sha256: payload.sha256 };
          const saved = await store.saveImage(slot, head, payload, prior?.localRevision ?? 0);
          savedToDevice = true;
          context.assertAuthorized();
          images.set(slot, saved);
          previewSlot = slot;
          status.textContent = '確認用画像をこの端末に保存しました。';
          dialog.close();
        } catch {
          message.textContent = savedToDevice ? '画像は端末に保存しました。画面を開き直して確認してください。' :
            '保存できませんでした。元の画像を保持しています。別タブの変更や保存容量を確認してください。';
        } finally {
          writing = false;
          confirm.disabled = false;
          refresh();
        }
      });
      const dialog = showDialog(isReplacing ? '会場画像を差し替え' : '会場画像を追加', body, [confirm]);
      photoDialog = dialog;
      dialog.addEventListener('close', () => { URL.revokeObjectURL(previewUrl); if (photoDialog === dialog) photoDialog = undefined; }, { once: true });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : '';
      if (reason !== 'PHOTO_CANCELLED' && context.isActive()) {
        error.textContent = reason === 'PHOTO_INPUT_SIZE' ? '元写真は1枚20MB以下で選んでください。保存後は1枚1MB以下に調整します。' :
          reason === 'PHOTO_CANNOT_FIT' ? '画質を保ったまま1MB以下にできませんでした。必要な範囲を切り取るか、分けて撮影してください。' :
          '画像を調整できませんでした。PNG・JPEG・WebP・HEIC／HEIFの写真を選び直してください。元の画像は保持しています。';
      }
    } finally {
      if (converting === controller) converting = undefined;
      pendingDialog.close();
    }
  }

  /** 対象と影響を確認した後、画像本文を空にした削除済み版へ一体置換する。 */
  async function removeImage() {
    const slot = currentSlot(), prior = slot ? images.get(slot) : null;
    if (!slot || !prior?.blob || loading || writing) return;
    const affected = context.sections().filter((section) => context.bindings()[section.id] === slot).length;
    const body = el('div');
    body.append(el('p', '', `画像${Number(slot) + 1}をこの端末から削除します。元には戻せません。`));
    body.append(el('p', '', '全ての区画で、この画像を表示できなくなります。座席は変更しません。'));
    if (affected) body.append(el('p', '', `最初に表示する画像に設定している区画は${affected}区画です。`));
    body.append(el('p', '', '共有先の画像は削除しません。'));
    const message = el('p');
    message.setAttribute('role', 'alert');
    body.append(message);
    const confirm = button('削除する', async () => {
      if (writing) return;
      writing = true;
      confirm.disabled = true;
      refresh();
      try {
        context.assertAuthorized();
        // 未解決の送信本文は、画面の削除で消したり置き換えたりしない。
        const pending = await store.readUpload(slot);
        if (pending?.status === 'prepared') throw Error('PENDING_IMAGE_OPERATION');
        const head: VenueImageHead = { environmentId: context.scope.environmentId, performanceId: context.scope.performanceId,
          schemaVersion: 1, revision: prior.head.revision + 1, active: false, bank: '',
          operationId: crypto.randomUUID(), sha256: '' };
        const saved = await store.saveImage(slot, head, null, prior.localRevision);
        images.set(slot, saved);
        status.textContent = 'この端末の確認用画像を削除しました。';
        dialog.close();
      } catch {
        message.textContent = '削除できませんでした。元の画像を保持しています。未完了の送信や別タブの変更を確認してください。';
      } finally {
        writing = false;
        confirm.disabled = false;
        refresh();
      }
    }, 'button secondary venue-image-remove');
    const dialog = showDialog('会場画像を削除', body, [confirm]);
    // 破壊的な操作は確認ボタンを初期フォーカスにせず、取消しから選べるようにする。
    dialog.querySelector<HTMLButtonElement>('.dialog-actions button:last-child')?.focus();
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
    gestures.reset();
    error.textContent = '画像を表示できません。座席表で確認してください。';
    viewport.hidden = controls.hidden = true;
    fallback.hidden = false;
  });
  const resize = new ResizeObserver(() => sizeImage());
  resize.observe(viewport);
  const observer = new MutationObserver(() => {
    if (context.isActive()) return;
    converting?.abort();
    gestures.dispose();
    photoDialog?.close();
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
