import { registerSW } from "virtual:pwa-register";
import QRCode from "qrcode";
import {
  ScanGate,
  canExportZip,
  changeSeat,
  findByConfirmationCode,
  reissueTicket,
  type FakeTicket,
  type QrResolution,
  type StaffRole
} from "./domain";
import { validateDeviceResult, type DeviceResult } from "./device-result";
import { PocRepository } from "./repository";
import { CameraQrScanner } from "./scanner";
import {
  downloadBlob,
  generateTicketPdf,
  generateTicketZip,
  inspectPdf,
  renderTicketCanvas
} from "./ticket-renderer";
import "./style.css";

const repository = new PocRepository();
const scanner = new CameraQrScanner();
const gate = new ScanGate();
let scanStartedAt = performance.now();
const scanDurations: number[] = [];
let currentTicket: FakeTicket | undefined;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="hero">
    <p class="eyebrow">Issue #6 / POC-003</p>
    <h1>実機QR・電子チケット確認</h1>
    <p>すべて架空データです。カメラ映像とPDFは外部へ送信しません。</p>
  </header>
  <main>
    <section class="card status-card">
      <h2>1. 開催前準備</h2>
      <p id="prepare-status">架空チケットを準備しています…</p>
      <p id="offline-status">オフライン準備を確認中です…</p>
      <button id="prepare">架空データを再確認</button>
    </section>

    <section class="card scanner-card">
      <h2>2. カメラ読取り</h2>
      <p class="hint">背面カメラを許可し、架空QRを枠内へ入れてください。判定後は「次へ」まで別のQRを読みません。</p>
      <video id="camera" playsinline muted></video>
      <div class="actions">
        <button id="start-camera" class="primary">カメラ開始</button>
        <button id="stop-camera">カメラ停止</button>
        <button id="next-scan" disabled>次へ</button>
      </div>
      <div id="scan-result" class="result neutral" role="status" aria-live="polite">未読取り</div>
      <p id="scan-metrics">今回の読取り標本: 0件</p>
      <p id="reception-count">端末に保存済みの受付記録: 確認中…</p>
      <details>
        <summary>カメラが使えない場合の確認コード</summary>
        <label>確認コード <input id="confirmation-code" value="P30001" maxlength="6" /></label>
        <button id="lookup-code">検索</button>
        <p id="code-result"></p>
      </details>
    </section>

    <section class="card ticket-card">
      <h2>3. 架空電子チケット</h2>
      <div id="ticket-preview" class="ticket-preview"></div>
      <div class="actions">
        <button id="show-ticket">見本を表示</button>
        <button id="download-pdf">A6 PDFを保存</button>
      </div>
      <div class="split">
        <label>出力役割
          <select id="role">
            <option value="lead">主担当</option>
            <option value="delegate">代理管理者</option>
            <option value="reception">受付担当</option>
            <option value="temporary-admin">一時管理者</option>
          </select>
        </label>
        <button id="download-zip">架空500件ZIPを生成</button>
      </div>
      <progress id="zip-progress" max="500" value="0"></progress>
      <p id="zip-status">未生成</p>
      <div class="actions">
        <button id="change-seat">座席変更（QR維持）</button>
        <button id="reissue">紛失再発行（旧QR無効）</button>
      </div>
      <pre id="ticket-history"></pre>
    </section>

    <section class="card checklist-card">
      <h2>4. 実機確認票</h2>
      <div class="form-grid">
        <label>機種<select id="device-model"><option>iPhone 17</option><option>iPhone 13 mini</option><option>Galaxy Z Fold8</option></select></label>
        <label>OS版<input id="os-version" placeholder="例: iOS 26.6.1" /></label>
        <label>ブラウザー情報（自動）<input id="browser-version" readonly /></label>
        <label>紙の成功回数<input id="paper-scans" type="number" min="0" value="0" /></label>
        <label>別画面の成功回数<input id="screen-scans" type="number" min="0" value="0" /></label>
        <label>最大読取り時間(ms)<input id="maximum-scan-ms" type="number" min="0" value="0" /></label>
      </div>
      <div class="checks">
        <label><input id="camera-permission" type="checkbox" /> カメラ許可後に起動した</label>
        <label><input id="continuous-lock" type="checkbox" /> 「次へ」前の連続読取りを防止した</label>
        <label><input id="offline-reception" type="checkbox" /> 完全オフラインで受付記録が残った</label>
        <label class="fold-only"><input id="fold-outer" type="checkbox" /> Fold8外側画面を確認した</label>
        <label class="fold-only"><input id="fold-inner" type="checkbox" /> Fold8内側画面を確認した</label>
        <label class="fold-only"><input id="fold-state" type="checkbox" /> Fold8開閉後も状態が残った</label>
      </div>
      <label>備考<textarea id="notes" maxlength="500"></textarea></label>
      <button id="export-result" class="primary">確認結果JSONを保存</button>
      <p id="result-status"></p>
    </section>

    <section class="card cleanup-card">
      <h2>5. 終了時の端末内削除</h2>
      <p>結果提出後に実施します。このサイトの架空データとキャッシュだけを削除します。保存したPDF・ZIPとカメラ許可は端末の画面から別途削除してください。</p>
      <button id="delete-local" class="danger">POC-003端末データを削除</button>
      <p id="delete-status"></p>
    </section>
  </main>
`;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`要素がありません: ${id}`);
  return element as T;
};

const prepareStatus = byId<HTMLParagraphElement>("prepare-status");
const offlineStatus = byId<HTMLParagraphElement>("offline-status");
const scanResult = byId<HTMLDivElement>("scan-result");
const nextButton = byId<HTMLButtonElement>("next-scan");
const ticketPreview = byId<HTMLDivElement>("ticket-preview");
const deviceModel = byId<HTMLSelectElement>("device-model");
const browserVersion = byId<HTMLInputElement>("browser-version");

function detectedBrowserInfo(model: DeviceResult["deviceModel"]): string {
  if (model.startsWith("iPhone")) return "Safari（iOS標準・OS版に準拠）";
  const chromeVersion = navigator.userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/)?.[1];
  return chromeVersion
    ? `Chrome ${chromeVersion}（自動取得）`
    : "Chrome（Android標準・詳細版は自動取得不可）";
}

function updateBrowserInfo(): void {
  browserVersion.value = detectedBrowserInfo(deviceModel.value as DeviceResult["deviceModel"]);
}

deviceModel.addEventListener("change", updateBrowserInfo);
updateBrowserInfo();

registerSW({
  immediate: true,
  onRegisteredSW: () => {
    void navigator.serviceWorker.ready.then(() => {
      offlineStatus.textContent = "PWA資産を取得しました。オフライン再読込みを確認できます。";
    });
  },
  onRegisterError: (error) => {
    offlineStatus.textContent = `オフライン準備エラー: ${String(error)}`;
  }
});

async function prepare(): Promise<void> {
  await repository.seedFakeTickets();
  const tickets = await repository.listTickets();
  currentTicket = tickets[0];
  prepareStatus.textContent = `架空チケット ${tickets.length}件を端末へ準備済みです。`;
  await refreshReceptionCount();
}

async function refreshReceptionCount(): Promise<void> {
  const count = await repository.receptionCount();
  byId<HTMLParagraphElement>("reception-count").textContent = `端末に保存済みの受付記録: ${count}件`;
}

async function showTicket(ticket = currentTicket): Promise<void> {
  if (!ticket) throw new Error("架空チケットが未準備です。");
  currentTicket = ticket;
  ticketPreview.replaceChildren(await renderTicketCanvas(ticket));
  byId<HTMLPreElement>("ticket-history").textContent = JSON.stringify(
    { ticketId: ticket.ticketId, qrToken: ticket.qrToken, seat: ticket.seat, history: ticket.history },
    null,
    2
  );
}

async function acceptDecoded(qrToken: string): Promise<ReturnType<ScanGate["decide"]>> {
  const tickets = await repository.listTickets();
  const decision = gate.decide(tickets, qrToken);
  if (decision.status === "locked") return decision;
  await repository.recordReception(qrToken, decision.status as QrResolution["status"]);
  await refreshReceptionCount();
  const duration = performance.now() - scanStartedAt;
  scanDurations.push(duration);
  nextButton.disabled = false;
  scanResult.className = `result ${decision.status}`;
  if (decision.status === "accepted" && decision.ticket) {
    scanResult.textContent = `○ 受付可能 / ${decision.ticket.seat.floorSection} ${decision.ticket.seat.row} ${decision.ticket.seat.number} / ${duration.toFixed(0)}ms`;
  } else if (decision.status === "invalidated") {
    scanResult.textContent = `× 旧QRは無効です / ${duration.toFixed(0)}ms`;
  } else {
    scanResult.textContent = `× 登録のないQRです / ${duration.toFixed(0)}ms`;
  }
  const maximum = Math.max(...scanDurations);
  byId<HTMLParagraphElement>("scan-metrics").textContent = `今回の読取り標本: ${scanDurations.length}件 / 最大 ${maximum.toFixed(0)}ms`;
  return decision;
}

byId("prepare").addEventListener("click", () => void prepare());
byId("show-ticket").addEventListener("click", () => void showTicket());
byId("start-camera").addEventListener("click", async () => {
  try {
    scanStartedAt = performance.now();
    await scanner.start(byId<HTMLVideoElement>("camera"), (text) => void acceptDecoded(text));
    scanResult.className = "result neutral";
    scanResult.textContent = "カメラ起動中。架空QRを提示してください。";
  } catch (error) {
    scanResult.className = "result invalidated";
    scanResult.textContent = `カメラを開始できません: ${error instanceof Error ? error.message : String(error)}。ブラウザーのサイト設定でカメラを許可してください。`;
  }
});
byId("stop-camera").addEventListener("click", () => scanner.stop());
nextButton.addEventListener("click", () => {
  gate.next();
  scanStartedAt = performance.now();
  nextButton.disabled = true;
  scanResult.className = "result neutral";
  scanResult.textContent = "次の架空QRを提示してください。";
});

byId("lookup-code").addEventListener("click", async () => {
  const ticket = findByConfirmationCode(
    await repository.listTickets(),
    byId<HTMLInputElement>("confirmation-code").value
  );
  byId<HTMLParagraphElement>("code-result").textContent = ticket
    ? `一致: ${ticket.ticketId} / ${ticket.seat.floorSection} ${ticket.seat.row} ${ticket.seat.number}`
    : "一致する架空チケットはありません。";
});

byId("download-pdf").addEventListener("click", async () => {
  if (!currentTicket) return;
  const bytes = await generateTicketPdf(currentTicket);
  downloadBlob(new Blob([bytes.slice().buffer], { type: "application/pdf" }), `${currentTicket.ticketId}.pdf`);
});

byId("download-zip").addEventListener("click", async () => {
  const role = byId<HTMLSelectElement>("role").value as StaffRole;
  const status = byId<HTMLParagraphElement>("zip-status");
  if (!canExportZip(role)) {
    status.textContent = "この架空役割にはZIP出力権限がありません。";
    return;
  }
  const progress = byId<HTMLProgressElement>("zip-progress");
  status.textContent = "架空PDFを生成中です。画面を閉じないでください。";
  const generated = await generateTicketZip(await repository.listTickets(), (completed) => {
    progress.value = completed;
    status.textContent = `生成中 ${completed}/500`;
  });
  downloadBlob(generated.blob, "FAKE-P003-tickets-0500.zip");
  status.textContent = `${generated.fileCount}件、${(generated.blob.size / 1024 / 1024).toFixed(1)}MiBを生成しました。`;
});

byId("change-seat").addEventListener("click", async () => {
  if (!currentTicket) return;
  currentTicket = changeSeat(
    currentTicket,
    { floorSection: "1階 C区画", row: "3列", number: "12番" },
    "POC-003架空座席変更"
  );
  await repository.saveTicket(currentTicket);
  await showTicket(currentTicket);
});

byId("reissue").addEventListener("click", async () => {
  if (!currentTicket) return;
  currentTicket = reissueTicket(currentTicket, "POC-003架空紛失再発行");
  await repository.saveTicket(currentTicket);
  await showTicket(currentTicket);
});

byId("export-result").addEventListener("click", () => {
  const result = readDeviceResult();
  const errors = validateDeviceResult(result);
  const status = byId<HTMLParagraphElement>("result-status");
  if (errors.length > 0) {
    status.textContent = errors.join(" ");
    return;
  }
  downloadBlob(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    `FAKE-P003-device-result-${result.deviceModel.replaceAll(" ", "-")}.json`
  );
  status.textContent = "確認結果を保存しました。このJSONだけを開発担当者へ渡してください。";
});

byId("delete-local").addEventListener("click", async () => {
  scanner.stop();
  await repository.deleteLocalData();
  const cacheKeys = await caches.keys();
  await Promise.all(cacheKeys.filter((key) => key.includes("poc-003")).map((key) => caches.delete(key)));
  const registrations = await navigator.serviceWorker?.getRegistrations();
  await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
  byId<HTMLParagraphElement>("reception-count").textContent = "端末に保存済みの受付記録: 0件";
  byId<HTMLParagraphElement>("delete-status").textContent = "POC-003のIndexedDB、該当キャッシュ、Service Workerを削除しました。";
});

function readDeviceResult(): DeviceResult {
  const value = (id: string) => byId<HTMLInputElement>(id).value;
  const checked = (id: string) => byId<HTMLInputElement>(id).checked;
  return {
    deviceModel: deviceModel.value as DeviceResult["deviceModel"],
    osVersion: value("os-version"),
    browserVersion: value("browser-version"),
    paperScans: Number(value("paper-scans")),
    screenScans: Number(value("screen-scans")),
    maximumScanMs: Number(value("maximum-scan-ms")),
    cameraPermission: checked("camera-permission"),
    continuousReadLock: checked("continuous-lock"),
    offlineReception: checked("offline-reception"),
    foldOuter: checked("fold-outer"),
    foldInner: checked("fold-inner"),
    foldStateRetained: checked("fold-state"),
    notes: byId<HTMLTextAreaElement>("notes").value,
    recordedAt: new Date().toISOString()
  };
}

export const testApi = {
  prepare,
  listTickets: () => repository.listTickets(),
  receptionCount: () => repository.receptionCount(),
  acceptDecoded,
  next: () => gate.next(),
  isLocked: () => gate.isLocked(),
  showTicket,
  generatePdf: async (index = 0) => {
    const ticket = (await repository.listTickets())[index];
    if (!ticket) throw new Error("架空チケットがありません。");
    const bytes = await generateTicketPdf(ticket);
    return { bytes: Array.from(bytes), inspection: await inspectPdf(bytes) };
  },
  generateZip: async (count = 500) => {
    const generated = await generateTicketZip((await repository.listTickets()).slice(0, count));
    return { fileCount: generated.fileCount, fileNames: generated.fileNames, size: generated.blob.size };
  },
  decodeGeneratedQr: async (index = 0) => {
    const ticket = (await repository.listTickets())[index];
    if (!ticket) throw new Error("架空チケットがありません。");
    const dataUrl = await QRCode.toDataURL(ticket.qrToken, { margin: 4, width: 400 });
    return scanner.decodeImageUrl(dataUrl);
  },
  changeFirstSeat: async () => {
    const ticket = (await repository.listTickets())[0];
    if (!ticket) throw new Error("架空チケットがありません。");
    const changed = changeSeat(ticket, { floorSection: "1階 C区画", row: "3列", number: "12番" }, "E2E架空変更");
    await repository.saveTicket(changed);
    return changed;
  },
  reissueFirst: async () => {
    const ticket = (await repository.listTickets())[0];
    if (!ticket) throw new Error("架空チケットがありません。");
    const changed = reissueTicket(ticket, "E2E架空再発行");
    await repository.saveTicket(changed);
    return changed;
  }
};

declare global {
  interface Window {
    __poc003: typeof testApi;
  }
}
window.__poc003 = testApi;

void prepare().then(() => showTicket());
