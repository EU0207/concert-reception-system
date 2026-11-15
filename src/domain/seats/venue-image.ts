// 会場画像の固定5枠・容量・実体とハッシュを検証し、表示前に同じ公開版を照合する。

import type { Scope } from './types.ts';
import { checkScope, isId, nonnegative, positive, requireValue } from './validation.ts';
import { validUid } from '../authorization/policy.ts';

export const IMAGE_SLOTS = ['0', '1', '2', '3', '4'] as const;
export const IMAGE_MAX_BYTES = 1_000_000;
export type ImageSlot = typeof IMAGE_SLOTS[number];
export type ImageBank = 'a' | 'b';

export interface VenueImageHead extends Scope {
  schemaVersion: 1;
  revision: number;
  active: boolean;
  bank: ImageBank | '';
  operationId: string;
  sha256: string;
}

export interface VenueImagePayload extends Scope {
  schemaVersion: 1;
  expectedRevision: number;
  revision: number;
  operationId: string;
  mime: 'image/png' | 'image/jpeg';
  rawBytes: number;
  base64: string;
  sha256: string;
}

export interface VenueImageOperation extends Scope {
  schemaVersion: 1;
  kind: 'publish' | 'remove';
  slot: ImageSlot;
  revision: number;
  bank: ImageBank | '';
  sha256: string;
  committedAt: number;
  controlRevision: number;
  humanUid: string;
  deviceUid: string;
}

/** 固定された画像枠以外への要求を拒否する。 */
export function validateImageSlot(slot: string): asserts slot is ImageSlot {
  requireValue((IMAGE_SLOTS as readonly string[]).includes(slot), 'INVALID_IMAGE_SLOT');
}

/** ハッシュの形式と公開先を照合し、別公演や不完全な版を拒否する。 */
export function validateImageHead(head: VenueImageHead, scope: Scope): void {
  requireValue(head?.schemaVersion === 1, 'INVALID_IMAGE_HEAD');
  checkScope(head, scope);
  requireValue(positive(head.revision) && typeof head.active === 'boolean' && isId(head.operationId) &&
    (head.active ? (head.bank === 'a' || head.bank === 'b') && /^[a-f0-9]{64}$/.test(head.sha256)
      : head.bank === '' && head.sha256 === ''), 'INVALID_IMAGE_HEAD');
}

/** 大きい配列を一度に引数へ展開せず、画像を標準Base64へ変換する。 */
function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }

  return btoa(binary);
}

/** 画像の生バイトに対応するSHA-256を作る。 */
async function imageDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 宣言した形式だけを信頼せず、PNG/JPEGの識別子とブラウザーでの復号を確認する。 */
async function inspectImage(bytes: Uint8Array<ArrayBuffer>, declaredMime: string): Promise<'image/png' | 'image/jpeg'> {
  requireValue(bytes.length > 0 && bytes.length <= IMAGE_MAX_BYTES, 'IMAGE_SIZE_EXCEEDED');
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const mime = png ? 'image/png' : jpeg ? 'image/jpeg' : null;
  requireValue(mime && (!declaredMime || declaredMime === mime), 'INVALID_IMAGE_FORMAT');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  } catch {
    throw new Error('IMAGE_DECODE_FAILED');
  }
  try {
    requireValue(bitmap.width > 0 && bitmap.height > 0, 'IMAGE_DECODE_FAILED');
  } finally {
    bitmap.close();
  }

  return mime;
}

/** 公開前の固定画像本文を作る。範囲外・形式不正では通信前に停止する。 */
export async function prepareVenueImage(scope: Scope, bytes: Uint8Array, mime: string, expectedRevision: number, operationId: string): Promise<VenueImagePayload> {
  requireValue(isId(scope.environmentId) && isId(scope.performanceId) && isId(operationId) &&
    nonnegative(expectedRevision) && positive(expectedRevision + 1), 'INVALID_IMAGE_OPERATION');
  requireValue(bytes.length > 0 && bytes.length <= IMAGE_MAX_BYTES, 'IMAGE_SIZE_EXCEEDED');
  const copy = new Uint8Array(bytes);
  const actualMime = await inspectImage(copy, mime);

  return { environmentId: scope.environmentId, performanceId: scope.performanceId,
    schemaVersion: 1, expectedRevision, revision: expectedRevision + 1, operationId,
    mime: actualMime, rawBytes: copy.length, base64: encodeBase64(copy), sha256: await imageDigest(copy) };
}

/** 取得した本文の容量と実体・ハッシュを確認し、同じ公開版のBlobだけを返す。 */
export async function verifyVenueImage(payload: VenueImagePayload, head: VenueImageHead, scope: Scope): Promise<Blob> {
  validateImageHead(head, scope);
  requireValue(payload?.schemaVersion === 1 && head.active, 'IMAGE_NOT_AVAILABLE');
  checkScope(payload, scope);
  requireValue(payload.revision === head.revision && payload.operationId === head.operationId && payload.sha256 === head.sha256 &&
    nonnegative(payload.expectedRevision) && payload.expectedRevision + 1 === payload.revision && positive(payload.rawBytes) &&
    payload.rawBytes <= IMAGE_MAX_BYTES && typeof payload.base64 === 'string' && payload.base64.length <= 1_333_336 &&
    payload.base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(payload.base64), 'INVALID_IMAGE_PAYLOAD');
  const bytes = Uint8Array.from(atob(payload.base64), (character) => character.charCodeAt(0));
  requireValue(bytes.length === payload.rawBytes && encodeBase64(bytes) === payload.base64, 'INVALID_IMAGE_PAYLOAD');
  requireValue(await imageDigest(bytes) === head.sha256, 'IMAGE_HASH_MISMATCH');
  await inspectImage(bytes, payload.mime);

  return new Blob([bytes], { type: payload.mime });
}

/** 固定画像と不変操作結果を照合し、応答不明を別の公開成功と取り違えない。 */
export function verifyImageOperation(result: VenueImageOperation, slot: ImageSlot, payload: VenueImagePayload, bank: ImageBank): void {
  requireValue(result?.schemaVersion === 1 && result.kind === 'publish' && result.slot === slot && result.bank === bank &&
    result.revision === payload.revision && result.sha256 === payload.sha256 && positive(result.committedAt) &&
    positive(result.controlRevision) && validUid(result.humanUid) && validUid(result.deviceUid), 'IMAGE_OPERATION_MISMATCH');
  checkScope(result, payload);
}
