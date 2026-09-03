import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { PocApplication } from "./application";
import type { RereadReason } from "./domain";

registerSW({ immediate: true });

const parameters = new URLSearchParams(location.search);
const deviceId = parameters.get("device") ?? "device-01";
const actorId = parameters.get("actor") ?? `actor-${deviceId}`;
const runId = parameters.get("run") ?? "POC-002-RUN-LOCAL";
const performanceId = "FAKE-PERFORMANCE-002";
const application = new PocApplication({ runId, performanceId, deviceId, actorId });

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#appが見つかりません。");

root.innerHTML = `
  <header>
    <p class="eyebrow">Issue #6 / POC-002</p>
    <h1>受付性能・同期・通信量</h1>
    <p>架空データ専用の技術検証画面です。本番利用はできません。</p>
  </header>
  <section class="status-grid" aria-label="状態">
    <div><span>端末</span><strong id="device-id"></strong></div>
    <div><span>通信</span><strong id="network-status"></strong></div>
    <div><span>未送信</span><strong id="pending-count">0</strong></div>
    <div><span>競合</span><strong id="conflict-count">0</strong></div>
  </section>
  <section class="actions">
    <h2>事前準備・同期</h2>
    <div class="button-row">
      <button id="prepare-local">架空QR 500件を準備</button>
      <button id="connect">Firebaseへ接続</button>
      <button id="sync" class="primary">手動同期</button>
    </div>
  </section>
  <section class="forms">
    <form id="reception-form">
      <h2>受付</h2>
      <label>架空QR<input name="qrId" value="FAKE-P002-QR-0001" required /></label>
      <button class="primary">初回受付を記録</button>
    </form>
    <form id="reread-form">
      <h2>再読取り</h2>
      <label>架空QR<input name="qrId" value="FAKE-P002-QR-0001" required /></label>
      <label>理由<select name="reason">
        <option value="legitimate-reentry">正当な再入場</option>
        <option value="consecutive-or-misread">連続・誤読取り</option>
        <option value="administrator-review">管理者確認</option>
        <option value="other">その他</option>
      </select></label>
      <label>架空メモ<input name="memo" maxlength="200" value="架空の確認メモ" /></label>
      <button>再読取りを追記</button>
    </form>
    <form id="message-form">
      <h2>スタッフ連絡</h2>
      <label>タイトル<input name="title" maxlength="50" value="架空の連絡" required /></label>
      <label>本文<textarea name="body" maxlength="500" required>架空データによるPOC連絡です。</textarea></label>
      <label>優先度<select name="priority"><option value="normal">通常</option><option value="important">重要</option></select></label>
      <button>連絡を追記</button>
    </form>
    <form id="acknowledgement-form">
      <h2>重要連絡の確認</h2>
      <label>連絡eventId<input name="targetEventId" required /></label>
      <button>利用者別確認を追記</button>
    </form>
  </section>
  <section>
    <h2>導出結果</h2>
    <pre id="projection-output">準備前</pre>
  </section>
  <section>
    <h2>操作記録</h2>
    <ol id="activity-log" aria-live="polite"></ol>
  </section>
`;

setText("device-id", deviceId);
updateNetworkStatus();
window.addEventListener("online", () => {
  updateNetworkStatus();
  void execute("回線復旧後の自動同期", () => application.sync());
});
window.addEventListener("offline", updateNetworkStatus);

byId("prepare-local").addEventListener("click", () =>
  void execute("架空QR 500件を準備", () => application.prepareLocal())
);
byId("connect").addEventListener("click", () =>
  void execute("Firebaseへ接続", () => application.connect())
);
byId("sync").addEventListener("click", () =>
  void execute("手動同期", () => application.sync())
);

byForm("reception-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;
  const data = new FormData(form);
  void execute("初回受付を記録", () => application.recordReception(String(data.get("qrId"))));
});

byForm("reread-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;
  const data = new FormData(form);
  void execute("再読取りを追記", () =>
    application.recordReread(
      String(data.get("qrId")),
      String(data.get("reason")) as RereadReason,
      String(data.get("memo"))
    )
  );
});

byForm("message-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;
  const data = new FormData(form);
  void execute("スタッフ連絡を追記", () =>
    application.postMessage(
      String(data.get("title")),
      String(data.get("body")),
      String(data.get("priority")) as "normal" | "important"
    )
  );
});

byForm("acknowledgement-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;
  const data = new FormData(form);
  void execute("重要連絡の確認を追記", () =>
    application.acknowledgeMessage(String(data.get("targetEventId")))
  );
});

async function execute(label: string, action: () => Promise<unknown>): Promise<void> {
  try {
    const result = await action();
    appendLog(`${label}: 成功${result === undefined ? "" : ` ${JSON.stringify(result)}`}`);
  } catch (error) {
    appendLog(`${label}: 失敗 ${error instanceof Error ? error.message : String(error)}`, true);
  }
  await refreshProjection();
}

async function refreshProjection(): Promise<void> {
  const projection = await application.projection();
  setText("pending-count", String(projection.pendingCount));
  setText("conflict-count", String(projection.conflicts.length));
  setText("projection-output", JSON.stringify(projection, null, 2));
}

function appendLog(message: string, isError = false): void {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("ja-JP")} ${message}`;
  if (isError) item.className = "error";
  byId("activity-log").prepend(item);
}

function updateNetworkStatus(): void {
  setText("network-status", navigator.onLine ? "オンライン" : "オフライン");
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id}が見つかりません。`);
  return element;
}

function byForm(id: string): HTMLFormElement {
  const element = byId(id);
  if (!(element instanceof HTMLFormElement)) throw new Error(`#${id}はformではありません。`);
  return element;
}

function setText(id: string, value: string): void {
  byId(id).textContent = value;
}

void refreshProjection();

declare global {
  interface Window {
    pocTest: {
      prepareLocal: () => Promise<void>;
      connect: () => Promise<void>;
      recordReception: (qrId: string) => Promise<string>;
      recordReceptionTimed: (qrId: string) => ReturnType<PocApplication["recordReceptionTimed"]>;
      recordReread: (qrId: string, reason: RereadReason, memo: string) => Promise<string>;
      postMessage: (title: string, body: string, priority: "normal" | "important") => Promise<string>;
      acknowledgeMessage: (targetEventId: string) => Promise<string>;
      sync: () => ReturnType<PocApplication["sync"]>;
      pushPending: () => ReturnType<PocApplication["pushPending"]>;
      projection: () => ReturnType<PocApplication["projection"]>;
      eventCount: () => Promise<number>;
      authIdentity: () => string;
      remoteChangeCount: () => number;
    };
  }
}

window.pocTest = {
  prepareLocal: () => application.prepareLocal(),
  connect: () => application.connect(),
  recordReception: (qrId) => application.recordReception(qrId),
  recordReceptionTimed: (qrId) => application.recordReceptionTimed(qrId),
  recordReread: (qrId, reason, memo) => application.recordReread(qrId, reason, memo),
  postMessage: (title, body, priority) => application.postMessage(title, body, priority),
  acknowledgeMessage: (targetEventId) => application.acknowledgeMessage(targetEventId),
  sync: () => application.sync(),
  pushPending: () => application.pushPending(),
  projection: () => application.projection(),
  eventCount: () => application.eventCount(),
  authIdentity: () => application.authIdentity(),
  remoteChangeCount: () => application.remoteChangeCount()
};
