// 写真の変換・回転を専用Workerへ委譲し、取消し・時間超過で一時データを破棄する。

import { PHOTO_INPUT_MAX_BYTES } from './photo-policy.ts';
import type { ConvertedPhoto, PhotoRequest, PhotoResponse } from './photo-policy.ts';

/** 確認画面の間だけWorkerと最大4方向の結果を保持し、元写真を送り直さず回転する。 */
export function createPhotoSession(file: File, signal: AbortSignal) {
  if (!file.size || file.size > PHOTO_INPUT_MAX_BYTES) throw Error('PHOTO_INPUT_SIZE');
  if (signal.aborted) throw Error('PHOTO_CANCELLED');
  const worker = new Worker(new URL('./photo-conversion-worker.ts', import.meta.url), { type: 'module' });
  const cache = new Map<number, ConvertedPhoto>();
  const inflight = new Map<number, Promise<ConvertedPhoto>>();
  const pending = new Map<number, { turn: number; resolve(value: ConvertedPhoto): void; reject(error: Error): void; timer: number }>();
  let sequence = 0, stopped = false;

  /** 確認画面の終了・失効・時間超過ではWorkerと一時キャッシュを全て破棄する。 */
  function close(error = Error('PHOTO_CANCELLED')) {
    if (stopped) return;
    stopped = true;
    signal.removeEventListener('abort', cancel);
    worker.terminate();
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
    inflight.clear();
    cache.clear();
  }

  /** 元のAbortSignalから、全ての未完了処理を中止する。 */
  function cancel() { close(); }

  /** 同じ向きの処理を共有し、各要求の応答と時間上限を対応付ける。 */
  function request(turn: number, message: PhotoRequest): Promise<ConvertedPhoto> {
    const promise = new Promise<ConvertedPhoto>((resolve, reject) => {
      const timer = setTimeout(() => close(Error('PHOTO_TIMEOUT')), 90_000);
      pending.set(message.id, { turn, resolve, reject, timer });
      try { worker.postMessage(message); }
      catch { close(Error('PHOTO_DECODE')); }
    });
    if (!stopped) inflight.set(turn, promise);
    return promise;
  }

  // 応答イベント：成功した向きだけを最大4件のキャッシュへ登録する。
  signal.addEventListener('abort', cancel, { once: true });
  worker.onerror = () => close(Error('PHOTO_DECODE'));
  worker.onmessage = (event: MessageEvent<PhotoResponse>) => {
    const item = pending.get(event.data.id);
    if (!item || stopped) return;
    pending.delete(event.data.id);
    inflight.delete(item.turn);
    clearTimeout(item.timer);
    if (event.data.error || !event.data.value) {
      const error = Error(event.data.error ?? 'PHOTO_DECODE');
      item.reject(error);
      if (event.data.id === 0) close(error);
      return;
    }
    cache.set(item.turn, event.data.value);
    item.resolve(event.data.value);
  };
  const original = request(0, { id: sequence++, kind: 'initialize', file });

  /** 初回の画素から回転し、一度作った向きはWorkerを呼ばずに返す。 */
  async function rotate(quarterTurns: number): Promise<ConvertedPhoto> {
    if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) throw Error('PHOTO_ROTATION');
    await original;
    if (stopped) throw Error('PHOTO_CANCELLED');
    const hit = cache.get(quarterTurns);
    if (hit) return hit;
    return inflight.get(quarterTurns) ?? request(quarterTurns, { id: sequence++, kind: 'rotate', quarterTurns });
  }

  return { original, rotate, close };
}

/** 単発利用では結果取得後に閉じ、画面外へWorkerを残さない。 */
export async function convertPhoto(file: File, signal: AbortSignal, quarterTurns = 0): Promise<ConvertedPhoto> {
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) throw Error('PHOTO_ROTATION');
  const session = createPhotoSession(file, signal);
  try { return await session.rotate(quarterTurns); }
  finally { session.close(); }
}
