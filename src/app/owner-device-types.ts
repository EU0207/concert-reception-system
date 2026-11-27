// 管理者の追加端末リンク画面と、発行元・新端末の操作窓口の契約を定める。

import type { OwnerDeviceLink } from '../domain/authorization/device-registration.ts';
import type { Scope } from '../domain/seats/types.ts';

export interface OwnerDeviceIssue { operationId: string; targetDeviceUid: string; expiresAt: number; status: 'pending' | 'consumed' | 'cancelled' | 'not-issued' | 'unknown' }
export interface OwnerDeviceView extends Scope {
  mode: 'issuer' | 'receiver';
  deviceUid: string;
  serverNow: number;
  validUntil: number;
  targets: string[];
  issues: OwnerDeviceIssue[];
  readers: { operationId: string; approved: boolean }[];
}
export interface OwnerDeviceUiPort {
  load(): Promise<OwnerDeviceView>;
  issue(target: string, operationId: string): Promise<{ token: string; link: OwnerDeviceLink }>;
  cancel(operationId: string): Promise<void>;
  read(token: string): Promise<void>;
  approve(operationId: string): Promise<void>;
  onInvalidate(listener: () => void): () => void;
  dispose(): void;
}
