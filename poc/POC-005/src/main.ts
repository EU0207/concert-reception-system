import { registerSW } from "virtual:pwa-register";
import "./style.css";
import { createFakeSeats, orderSeats, type Seat } from "./domain";
import { validateDeviceResult, downloadDeviceResult } from "./device-result";
import { deletePocCaches, prepareOfflineData } from "./preparation";
import { PocRepository, type DeviceResult, type PreparationState } from "./repository";

const repository = new PocRepository();
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing.");

let preparation: PreparationState | undefined;
let seats: Seat[] = [];
let selectedSeatId = "F1-西-03-01";
let floor: Seat["floor"] = "1階";
let direction: "asc" | "desc" = "asc";
let fallbackOnly = false;
let imageObjectUrls: string[] = [];
let preparedImages: Array<{ label: string; url: string }> = [];
let currentImageIndex = 0;
let imageZoom = 1;
let swipeStart: { x: number; y: number } | undefined;

registerSW({
  immediate: true,
  onNeedRefresh() {
    showMessage("新しい版があります。オンライン時にページを更新してください。", "notice");
  },
  onOfflineReady() {
    showMessage("アプリ本体をオフラインで開く準備ができました。次に座席・画像を事前取得してください。", "success");
  }
});

app.innerHTML = `
  <header class="hero">
    <p class="eyebrow">Issue #6 / POC-005</p>
    <h1>オフライン座席表確認</h1>
    <p>架空の500席と5枚の合成画像だけを使う検証画面です。</p>
    <div class="network"><span id="network-dot" aria-hidden="true"></span><strong id="network-state"></strong></div>
  </header>
  <main>
    <section class="panel" aria-labelledby="prepare-title">
      <div class="section-heading"><div><span class="step">1</span><h2 id="prepare-title">Wi-Fiで事前取得</h2></div><span id="prepare-badge" class="badge">未準備</span></div>
      <p>Wi-Fi接続中に実行してください。5画像を検証し、500席すべてが揃った時だけ完了になります。</p>
      <button id="prepare-button" class="primary">座席と画像を事前取得</button>
      <div id="progress" class="progress" hidden><div id="progress-bar"></div></div>
      <dl id="summary" class="summary"></dl>
      <div id="message" class="message" role="status" aria-live="polite"></div>
    </section>

    <section class="panel" aria-labelledby="map-title">
      <div class="section-heading"><div><span class="step">2</span><h2 id="map-title">座席表と会場画像</h2></div></div>
      <div class="controls">
        <label>階<select id="floor-select"><option>1階</option><option>2階</option></select></label>
        <label>席番号<select id="direction-select"><option value="asc">昇順</option><option value="desc">降順</option></select></label>
        <label>現在席<select id="seat-select"></select></label>
      </div>
      <button id="fallback-button" class="secondary" aria-pressed="false">画像なしの代替一覧を確認</button>
      <div id="offline-warning" class="message notice" hidden>画像を表示できません。受付は下の座席一覧で継続できます。</div>
      <div id="image-viewer" class="image-viewer">
        <button id="previous-image" class="image-arrow" aria-label="前の画像">←</button>
        <div id="image-gallery" class="image-gallery"></div>
        <button id="next-image" class="image-arrow" aria-label="次の画像">→</button>
      </div>
      <div id="image-toolbar" class="image-toolbar">
        <strong id="image-position">0 / 0</strong>
        <button id="zoom-out" class="secondary" aria-label="画像を縮小">−</button>
        <button id="zoom-reset" class="secondary">100%</button>
        <button id="zoom-in" class="secondary" aria-label="画像を拡大">＋</button>
      </div>
      <div class="legend"><span><i class="general"></i>一般</span><span><i class="wheelchair"></i>車椅子</span><span><i class="companion"></i>同伴者</span><span><i class="blocked"></i>使用不可</span><span><i class="held"></i>確保済み</span><span><i class="current"></i>現在席</span></div>
      <div id="seat-map" class="seat-map" aria-label="座席表"></div>
      <div id="fallback-list" class="fallback-list"></div>
    </section>

    <section class="panel" aria-labelledby="check-title">
      <div class="section-heading"><div><span class="step">3</span><h2 id="check-title">実機確認結果</h2></div></div>
      <p>事前取得後に機内モードをオンにし、Wi-Fiも切れていることを確認してから、ページ更新とブラウザー再起動を試します。</p>
      <div class="result-grid">
        <label>端末<select id="device-model"><option>iPhone 17</option><option>iPhone 13 mini</option><option>Galaxy Z Fold8</option></select></label>
        <label>OS版<input id="os-version" autocomplete="off" placeholder="例: 26.6.1" /></label>
      </div>
      <fieldset><legend>確認項目</legend>
        <label><input type="checkbox" id="check-images" /> 5画像と500席の事前取得</label>
        <label><input type="checkbox" id="check-reload" /> 完全オフラインでページ更新</label>
        <label><input type="checkbox" id="check-restart" /> 完全オフラインでブラウザー再起動</label>
        <label><input type="checkbox" id="check-seat" /> 現在席を枠・記号・文字で確認</label>
        <label><input type="checkbox" id="check-fallback" /> 画像なし代替一覧で受付可能</label>
        <label id="small-check" hidden><input type="checkbox" id="check-small" /> iPhone 13 miniの小画面で操作可能</label>
        <span id="fold-checks" hidden><label><input type="checkbox" id="check-outer" /> Fold8外側画面</label><label><input type="checkbox" id="check-inner" /> Fold8内側画面</label><label><input type="checkbox" id="check-retained" /> 開閉後も現在席と準備状態を保持</label></span>
      </fieldset>
      <label>補足（個人情報は入力しない）<textarea id="notes" rows="3"></textarea></label>
      <p class="muted">ブラウザー情報は端末から自動記録します。手入力は不要です。</p>
      <button id="export-button" class="primary">匿名結果JSONを保存</button>
      <div id="result-message" class="message" role="status" aria-live="polite"></div>
    </section>

    <section class="panel danger-zone" aria-labelledby="delete-title">
      <div class="section-heading"><div><span class="step">4</span><h2 id="delete-title">終了後の端末データ削除</h2></div></div>
      <p>結果JSONを渡し、削除案内が出た後だけ実行してください。このサイトのPOC-005データだけを削除します。</p>
      <label>確認のため「削除」と入力<input id="delete-confirmation" autocomplete="off" /></label>
      <button id="delete-button" class="danger" disabled>この端末のPOC-005データを削除</button>
      <div id="delete-message" class="message" role="status" aria-live="polite"></div>
    </section>
  </main>
  <footer>POC-005 / 架空データのみ / Firebase Analytics不使用</footer>
`;

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`${id} is missing.`);
  return found as T;
};

element<HTMLButtonElement>("prepare-button").addEventListener("click", () => void prepare());
element<HTMLSelectElement>("floor-select").addEventListener("change", (event) => {
  floor = (event.currentTarget as HTMLSelectElement).value as Seat["floor"];
  renderSeats();
});
element<HTMLSelectElement>("direction-select").addEventListener("change", (event) => {
  direction = (event.currentTarget as HTMLSelectElement).value as "asc" | "desc";
  renderSeats();
});
element<HTMLSelectElement>("seat-select").addEventListener("change", (event) => {
  selectedSeatId = (event.currentTarget as HTMLSelectElement).value;
  void repository.saveSelectedSeat(selectedSeatId);
  const selected = seats.find((seat) => seat.id === selectedSeatId);
  if (selected) {
    floor = selected.floor;
    element<HTMLSelectElement>("floor-select").value = floor;
  }
  renderSeats();
});
element<HTMLButtonElement>("fallback-button").addEventListener("click", () => {
  fallbackOnly = !fallbackOnly;
  element<HTMLButtonElement>("fallback-button").setAttribute("aria-pressed", String(fallbackOnly));
  element("image-viewer").hidden = fallbackOnly;
  element("image-toolbar").hidden = fallbackOnly;
  element("offline-warning").hidden = !fallbackOnly;
  renderSeats();
});
element<HTMLButtonElement>("previous-image").addEventListener("click", () => changeImage(-1));
element<HTMLButtonElement>("next-image").addEventListener("click", () => changeImage(1));
element<HTMLButtonElement>("zoom-out").addEventListener("click", () => setImageZoom(imageZoom - 0.25));
element<HTMLButtonElement>("zoom-reset").addEventListener("click", () => setImageZoom(1));
element<HTMLButtonElement>("zoom-in").addEventListener("click", () => setImageZoom(imageZoom + 0.25));
element("image-gallery").addEventListener("pointerdown", (event) => {
  if (imageZoom === 1) swipeStart = { x: event.clientX, y: event.clientY };
});
element("image-gallery").addEventListener("pointerup", (event) => {
  if (!swipeStart || imageZoom !== 1) return;
  const horizontal = event.clientX - swipeStart.x;
  const vertical = event.clientY - swipeStart.y;
  swipeStart = undefined;
  if (Math.abs(horizontal) >= 50 && Math.abs(horizontal) > Math.abs(vertical) * 1.2) changeImage(horizontal < 0 ? 1 : -1);
});
element("image-gallery").addEventListener("pointercancel", () => { swipeStart = undefined; });
element<HTMLSelectElement>("device-model").addEventListener("change", renderDeviceSpecificChecks);
element<HTMLButtonElement>("export-button").addEventListener("click", () => void exportResult());
element<HTMLInputElement>("delete-confirmation").addEventListener("input", (event) => {
  element<HTMLButtonElement>("delete-button").disabled = (event.currentTarget as HTMLInputElement).value !== "削除";
});
element<HTMLButtonElement>("delete-button").addEventListener("click", () => void deleteLocalData());
window.addEventListener("online", renderNetworkState);
window.addEventListener("offline", renderNetworkState);

void restore();

async function restore(): Promise<void> {
  renderNetworkState();
  renderDeviceSpecificChecks();
  preparation = await repository.getPreparation();
  seats = preparation ? await repository.listSeats() : createFakeSeats();
  selectedSeatId = (await repository.getSelectedSeat()) ?? selectedSeatId;
  renderSeatSelector();
  renderSeats();
  if (preparation) {
    renderSummary(preparation);
    await renderImages(preparation);
  } else {
    element("summary").innerHTML = "<div><dt>状態</dt><dd>事前取得が必要です</dd></div>";
  }
}

async function prepare(): Promise<void> {
  const button = element<HTMLButtonElement>("prepare-button");
  button.disabled = true;
  showMessage("容量を確認しています…", "notice");
  try {
    preparation = await prepareOfflineData(repository, {
      onProgress(progress) {
        const percent = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
        element("progress").hidden = false;
        element("progress-bar").style.width = `${percent}%`;
        showMessage(`${progress.phase}: ${progress.completed}/${progress.total}`, "notice");
      }
    });
    seats = await repository.listSeats();
    renderSeatSelector();
    renderSeats();
    renderSummary(preparation);
    await renderImages(preparation);
    showMessage("事前取得が完了しました。機内モードの確認へ進めます。", "success");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "事前取得に失敗しました。", "error");
    element("prepare-badge").textContent = "未準備";
  } finally {
    button.disabled = false;
  }
}

function renderSummary(state: PreparationState): void {
  element("prepare-badge").textContent = "準備完了";
  element("prepare-badge").classList.add("complete");
  element("summary").innerHTML = `
    <div><dt>対象</dt><dd>${state.eventId}</dd></div>
    <div><dt>座席</dt><dd>${state.seatCount.toLocaleString("ja-JP")}件</dd></div>
    <div><dt>画像</dt><dd>${state.images.length}枚 / ${state.imageBytes.toLocaleString("ja-JP")}バイト</dd></div>
    <div><dt>完了時刻</dt><dd>${new Date(state.completedAt).toLocaleString("ja-JP")}</dd></div>
    <div><dt>永続化要求</dt><dd>${state.persisted === true ? "許可" : state.persisted === false ? "不許可（当日再確認）" : "判定不可（当日再確認）"}</dd></div>`;
}

function renderSeatSelector(): void {
  const select = element<HTMLSelectElement>("seat-select");
  select.innerHTML = orderSeats(seats, "asc").map((seat) => `<option value="${seat.id}"${seat.id === selectedSeatId ? " selected" : ""}>${seat.floor} ${seat.section} ${seat.row}列 ${seat.number}番（${seat.kind}）</option>`).join("");
}

function renderSeats(): void {
  const visible = orderSeats(seats.filter((seat) => seat.floor === floor), direction);
  const selected = seats.find((seat) => seat.id === selectedSeatId);
  const seatHtml = visible.flatMap((seat, index) => {
    const current = seat.id === selectedSeatId;
    const button = `<button class="seat kind-${seat.kind}${current ? " selected" : ""}" data-seat-id="${seat.id}" aria-current="${current ? "true" : "false"}" title="${seat.floor} ${seat.section} ${seat.row}列 ${seat.number}番 ${seat.kind}"><span>${current ? "★" : seat.number}</span><small>${current ? "現在席" : `${seat.row}列`}</small></button>`;
    return (index + 1) % 20 === 10 ? [button, '<span class="seat-divider" aria-hidden="true"></span>'] : [button];
  }).join("");
  element("seat-map").innerHTML = seatHtml;
  for (const button of element("seat-map").querySelectorAll<HTMLButtonElement>("[data-seat-id]")) {
    button.addEventListener("click", () => {
      selectedSeatId = button.dataset.seatId ?? selectedSeatId;
      element<HTMLSelectElement>("seat-select").value = selectedSeatId;
      void repository.saveSelectedSeat(selectedSeatId);
      renderSeats();
    });
  }
  element("fallback-list").innerHTML = selected
    ? `<strong>現在席 ★</strong><span>${selected.floor}</span><span>${selected.section}区画</span><span>${selected.row}列</span><span>${selected.number}番</span><span>${selected.kind}</span>`
    : "<span>現在席を選択してください。</span>";
}

async function renderImages(state: PreparationState): Promise<void> {
  for (const url of imageObjectUrls) URL.revokeObjectURL(url);
  imageObjectUrls = [];
  preparedImages = [];
  const cache = await caches.open(state.cacheName);
  for (const image of state.images) {
    const response = await cache.match(image.url);
    if (!response) {
      fallbackOnly = true;
      element("offline-warning").hidden = false;
      element("image-viewer").hidden = true;
      element("image-toolbar").hidden = true;
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    imageObjectUrls.push(url);
    preparedImages.push({ label: image.label, url });
  }
  currentImageIndex = Math.min(currentImageIndex, preparedImages.length - 1);
  renderCurrentImage();
}

function changeImage(offset: number): void {
  if (preparedImages.length === 0) return;
  currentImageIndex = (currentImageIndex + offset + preparedImages.length) % preparedImages.length;
  imageZoom = 1;
  renderCurrentImage();
}

function setImageZoom(value: number): void {
  imageZoom = Math.min(2.5, Math.max(0.75, value));
  renderCurrentImage();
}

function renderCurrentImage(): void {
  const image = preparedImages[currentImageIndex];
  if (!image) {
    element("image-gallery").innerHTML = "";
    element("image-position").textContent = "0 / 0";
    return;
  }
  element("image-gallery").innerHTML = `<figure><img src="${image.url}" alt="${image.label}（架空の合成画像）" style="width:${imageZoom * 100}%"/><figcaption>${image.label}</figcaption></figure>`;
  element("image-gallery").classList.toggle("zoomed", imageZoom !== 1);
  element("image-position").textContent = `${currentImageIndex + 1} / ${preparedImages.length}`;
  element<HTMLButtonElement>("zoom-reset").textContent = `${Math.round(imageZoom * 100)}%`;
}

function renderNetworkState(): void {
  const online = navigator.onLine;
  element("network-state").textContent = online ? "オンライン" : "オフライン";
  element("network-dot").className = online ? "online" : "offline";
}

function renderDeviceSpecificChecks(): void {
  const model = element<HTMLSelectElement>("device-model").value;
  element("small-check").hidden = model !== "iPhone 13 mini";
  element("fold-checks").hidden = model !== "Galaxy Z Fold8";
}

async function exportResult(): Promise<void> {
  const checked = (id: string): boolean => element<HTMLInputElement>(id).checked;
  const deviceModel = element<HTMLSelectElement>("device-model").value as DeviceResult["deviceModel"];
  const result: DeviceResult = {
    schemaVersion: 1,
    pocId: "POC-005",
    deviceModel,
    osVersion: element<HTMLInputElement>("os-version").value,
    browserUserAgent: navigator.userAgent,
    preparedImages: checked("check-images"),
    offlineReload: checked("check-reload"),
    browserRestart: checked("check-restart"),
    currentSeatVisible: checked("check-seat"),
    fallbackListVisible: checked("check-fallback"),
    smallScreenUsable: deviceModel === "iPhone 13 mini" ? checked("check-small") : undefined,
    foldOuter: deviceModel === "Galaxy Z Fold8" ? checked("check-outer") : undefined,
    foldInner: deviceModel === "Galaxy Z Fold8" ? checked("check-inner") : undefined,
    foldStateRetained: deviceModel === "Galaxy Z Fold8" ? checked("check-retained") : undefined,
    notes: element<HTMLTextAreaElement>("notes").value,
    recordedAt: new Date().toISOString()
  };
  const errors = validateDeviceResult(result);
  if (errors.length > 0) {
    element("result-message").className = "message error";
    element("result-message").textContent = errors.join(" ");
    return;
  }
  await repository.saveDeviceResult(result);
  downloadDeviceResult(result);
  element("result-message").className = "message success";
  element("result-message").textContent = "匿名結果JSONを保存しました。この会話へ添付してください。";
}

async function deleteLocalData(): Promise<void> {
  const button = element<HTMLButtonElement>("delete-button");
  button.disabled = true;
  try {
    await deletePocCaches();
    await repository.deleteLocalData();
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    preparation = undefined;
    seats = createFakeSeats();
    element("prepare-badge").textContent = "未準備";
    element("prepare-badge").classList.remove("complete");
    preparedImages = [];
    element("image-gallery").innerHTML = "";
    element("summary").innerHTML = "<div><dt>状態</dt><dd>削除済み・再度事前取得が必要です</dd></div>";
    element("delete-message").className = "message success";
    element("delete-message").textContent = "POC-005の端末データを削除しました。ブラウザー設定からこのURLのサイトデータも削除してください。";
  } catch (error) {
    element("delete-message").className = "message error";
    element("delete-message").textContent = error instanceof Error ? error.message : "削除に失敗しました。";
  }
}

function showMessage(message: string, style: "notice" | "success" | "error"): void {
  element("message").className = `message ${style}`;
  element("message").textContent = message;
}
