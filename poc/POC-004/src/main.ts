import "./style.css";
import { clearLocalPocData, mayClosePerformance } from "./cleanup";
import { containsPlaintext, decryptJson, encryptJson } from "./crypto";
import { canStartOffline, may, type PreparationState, type Role } from "./domain";
import { Poc004Repository } from "./repository";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#appが見つかりません。");

app.innerHTML = `
  <header>
    <p class="eyebrow">Issue #6 / POC-004</p>
    <h1>権限・暗号化・端末削除の検証</h1>
    <p>この画面は架空データだけを使う技術検証です。本番運用には使用しません。</p>
  </header>
  <section class="panel">
    <label>検証する役割
      <select id="role">
        <option value="owner">主担当</option>
        <option value="deputy">代理管理者</option>
        <option value="receptionist">受付担当</option>
        <option value="temporaryAdmin">一時管理者</option>
      </select>
    </label>
    <label>検証用共有パスフレーズ
      <input id="passphrase" type="password" autocomplete="off" value="FAKE-POC-004-PASSPHRASE" />
    </label>
    <div class="actions">
      <button id="prepare">開催前準備</button>
      <button id="offline">オフライン開始確認</button>
      <button id="encrypt">任意項目を暗号化保存</button>
      <button id="read">任意項目を復号</button>
      <button id="expire">期限切れ削除</button>
      <button id="cleanup" class="danger">端末データ削除</button>
    </div>
  </section>
  <section class="panel" aria-live="polite">
    <h2>確認結果</h2>
    <dl>
      <div><dt>開催前準備</dt><dd id="prepared">未実施</dd></div>
      <div><dt>オフライン開始</dt><dd id="offline-result">未実施</dd></div>
      <div><dt>保存済み暗号文</dt><dd id="encrypted-count">0件</dd></div>
      <div><dt>平文混入</dt><dd id="plaintext-result">未確認</dd></div>
      <div><dt>復号結果</dt><dd id="decrypted">未実施</dd></div>
      <div><dt>削除結果</dt><dd id="cleanup-result">未実施</dd></div>
    </dl>
    <p id="message" class="message">操作を選んでください。</p>
  </section>
  <aside>
    <strong>制約:</strong> 完全オフライン中の権限停止は受信できません。任意項目の期限後は、主担当・代理の管理画面に期限切れ件数と削除ボタンを表示して削除を案内します。無人自動削除は、この0円構成では行いません。
  </aside>
`;

let repository = new Poc004Repository();
const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id}が見つかりません。`);
  return element as T;
};

const role = (): Role => byId<HTMLSelectElement>("role").value as Role;
const passphrase = (): string => byId<HTMLInputElement>("passphrase").value;
const setText = (id: string, value: string): void => { byId(id).textContent = value; };
const setMessage = (value: string, error = false): void => {
  const element = byId("message");
  element.textContent = value;
  element.classList.toggle("error", error);
};

async function refresh(): Promise<void> {
  const preparation = await repository.getPreparation();
  setText("prepared", preparation ? `${preparation.role} / ${preparation.referenceCount}件` : "未実施");
  setText("encrypted-count", `${await repository.countRestricted()}件`);
}

byId("prepare").addEventListener("click", async () => {
  const currentRole = role();
  const state: PreparationState = {
    eventId: "FAKE-P004-EVENT",
    uid: `FAKE-${currentRole}`,
    role: currentRole,
    preparedAt: new Date().toISOString(),
    referenceCount: 500,
    pendingCount: 0,
    adminSecretReady: currentRole === "owner" || currentRole === "deputy" ? passphrase().length > 0 : true
  };
  await repository.setPreparation(state);
  setMessage("開催前準備を端末へ保存しました。パスフレーズ自体は保存していません。");
  await refresh();
});

byId("offline").addEventListener("click", async () => {
  const allowed = canStartOffline(await repository.getPreparation());
  setText("offline-result", allowed ? "開始可能" : "開始不可");
  setMessage(allowed ? "事前準備済みのためオフライン開始できます。" : "事前準備がないため開始できません。", !allowed);
});

byId("encrypt").addEventListener("click", async () => {
  if (!may(role(), "readRestricted")) {
    setMessage("この役割には任意項目を配布しません。", true);
    return;
  }
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const fakeValue = { contactNote: "架空の連絡メモ", assistance: "架空の案内" };
  const payload = await encryptJson(fakeValue, passphrase(), expiresAt);
  await repository.putRestricted("FAKE-VISITOR-001", payload);
  setText("plaintext-result", containsPlaintext(payload, Object.values(fakeValue)) ? "混入あり" : "混入なし");
  setMessage("任意項目を暗号文として保存しました。");
  await refresh();
});

byId("read").addEventListener("click", async () => {
  if (!may(role(), "readRestricted")) {
    setMessage("この役割には任意項目の閲覧権限がありません。", true);
    return;
  }
  const payload = await repository.getRestricted("FAKE-VISITOR-001");
  if (!payload) {
    setMessage("暗号文がありません。", true);
    return;
  }
  const value = await decryptJson<Record<string, string>>(payload, passphrase());
  setText("decrypted", `${value.contactNote} / ${value.assistance}`);
  setMessage("メモリー上で復号しました。画面再読込み後は再入力が必要です。");
});

byId("expire").addEventListener("click", async () => {
  const removed = await repository.removeExpired(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
  setMessage(`次回オンライン管理操作を想定し、期限切れ${removed}件を削除しました。`);
  await refresh();
});

byId("cleanup").addEventListener("click", async () => {
  const allowed = mayClosePerformance({ performanceEnded: true, pendingWrites: 0, administratorConfirmed: true });
  if (!allowed) return;
  await clearLocalPocData(repository);
  repository = new Poc004Repository();
  setText("offline-result", "未実施");
  setText("plaintext-result", "未確認");
  setText("decrypted", "未実施");
  setText("cleanup-result", "対象保存領域を削除済み");
  setMessage("POC-004が管理する端末データを削除しました。");
  await refresh();
});

void refresh();
