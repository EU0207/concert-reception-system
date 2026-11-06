import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthorizationController } from "../../src/security/authorization-controller.ts";
import { now, scope, snapshot } from "../domain/authorization/fixtures.mjs";

function fixture() {
  const current = snapshot();
  const human = {
    uid: current.role.humanUid,
    emailVerified: true,
    provider: "google.com",
    authenticatedAt: now - 1000,
  };
  const listeners = new Set();
  const port = {
    fetchCurrent: async () => ({ snapshot: current, serverNow: now }),
    identity: () => ({ human, deviceUid: current.deviceAuthUid }),
    onInvalidate: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  let locks = 0;
  const controller = new AuthorizationController(port, "0.1.0", () => {
    locks++;
  });
  return {
    current,
    human,
    port,
    controller,
    invalidate: () => {
      for (const listener of listeners) listener();
    },
    locks: () => locks,
  };
}

const permit = (current) => ({
  ...scope,
  deviceUid: current.deviceAuthUid,
  humanUid: current.role.humanUid,
  storageEpoch: current.device.storageEpoch,
  roleRevision: 1,
  issuedAt: now - 1000,
  expiresAt: now + 86400000,
  appVersion: "0.1.0",
  dataRevision: 1,
});

test("AUTH110-C01 現在認可の完了前には、通常操作と復号を許可しない", async () => {
  const f = fixture();
  let finish;
  f.port.fetchCurrent = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const checking = f.controller.reconnect();
  assert.equal(f.controller.state, "checking");
  assert.throws(() => f.controller.access("receptionRead"));
  finish({ snapshot: f.current, serverNow: now });
  await checking;
  assert.equal(f.controller.state, "online");
  const access = f.controller.access("receptionRead");
  access();
  f.invalidate();
  assert.throws(access);
  assert.equal(f.controller.state, "locked");
  f.controller.dispose();
});

test("AUTH110-C02 停止を確認した後は、古いオフライン許可へ戻さない", async () => {
  const f = fixture();
  f.current.device.active = false;
  await assert.rejects(f.controller.reconnect());
  assert.equal(f.controller.state, "stopped");
  const old = snapshot();
  assert.throws(() => f.controller.useOffline(old, permit(old), now));
  assert.throws(() => f.controller.access("qrReception"));
  f.controller.dispose();
});

test("AUTH110-C03 古い取得結果と失敗は、新しい確認済み状態を上書きしない", async () => {
  const f = fixture();
  let finish;
  f.port.fetchCurrent = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const old = f.controller.reconnect();
  f.port.fetchCurrent = async () => ({ snapshot: f.current, serverNow: now });
  await f.controller.reconnect();
  finish({
    snapshot: { ...f.current, deviceAuthUid: "old-device" },
    serverNow: now,
  });
  await assert.rejects(old);
  assert.equal(f.controller.state, "online");
  f.controller.access("receptionRead")();
  f.controller.dispose();
});

test("AUTH110-C04 通信不能から自動で業務へ戻らず、有効な許可を明示的に復元する", async (context) => {
  context.mock.method(Date, "now", () => now);
  const f = fixture();
  f.port.fetchCurrent = async () => {
    throw Error("fictional network failure");
  };
  await assert.rejects(f.controller.reconnect());
  assert.equal(f.controller.state, "locked");
  f.controller.useOffline(f.current, permit(f.current));
  assert.equal(f.controller.state, "offline");
  f.controller.access("qrReception")();
  assert.throws(() => f.controller.access("manageRoles"));
  f.controller.dispose();
});

test("AUTH110-C05 本人変更で古い復号許可を失効させ、破棄後は再利用しない", async () => {
  const f = fixture();
  await f.controller.reconnect();
  const access = f.controller.access("receptionRead");
  f.human.uid = "other-human";
  assert.throws(access);
  assert.equal(f.controller.state, "locked");
  f.controller.dispose();
  await assert.rejects(f.controller.reconnect());
  assert.throws(() =>
    f.controller.useOffline(snapshot(), permit(snapshot()), now),
  );
  assert.ok(f.locks() >= 2);
});
