// スタッフの任期終了表示と更新時刻を扱う。表示名を保存役割や認可判定には使用しない。

import type { RoleGrant, StaffRole } from '../domain/authorization/types.ts';

const names: Record<StaffRole, string> = { owner: '管理者', deputy: '代理管理者', temporary: '臨時管理者', receptionist: '一般受付担当者' };

/** 公演全体の期限前に、臨時任期だけが終了しているか判定する。 */
export function temporaryTermEnded(role: RoleGrant, now: number, staffDeadline: number): boolean {
  return role.active && role.role === 'temporary' && role.startsAt <= now && role.endsAt <= now && now < staffDeadline;
}

/** 臨時任期終了後は一般受付の表示へ戻し、保存役割を変更しない。 */
export function staffRoleDisplayName(role: RoleGrant, now: number, staffDeadline: number): string {
  return names[temporaryTermEnded(role, now, staffDeadline) ? 'receptionist' : role.role];
}

/** サーバー時刻を起点に、次の任期境界だけで表示更新を通知する時計を作る。 */
export function createRoleDisplayClock(roles: RoleGrant[], staffDeadline: number, serverNow: number, onBoundary: () => void) {
  const started = performance.now(), boundaries = [...roles.flatMap(role => [role.startsAt, role.endsAt]), staffDeadline];
  let timer: ReturnType<typeof setTimeout> | undefined, disposed = false;

  /** 端末の壁時計を使わず、取得したサーバー時刻からの経過時間を返す。 */
  function now() { return serverNow + Math.max(0, Math.floor(performance.now() - started)); }

  /** 将来の最も近い境界を予約し、長い任期でタイマーがあふれることを避ける。 */
  function schedule() {
    if (disposed) return;
    const current = now(), next = Math.min(...boundaries.filter(value => Number.isFinite(value) && value > current));
    if (!Number.isFinite(next)) return;
    timer = setTimeout(() => { if (!disposed) { onBoundary(); schedule(); } }, Math.min(next - current + 1, 2_147_483_647));
  }

  schedule();
  return { now, dispose: () => { disposed = true; clearTimeout(timer); } };
}
