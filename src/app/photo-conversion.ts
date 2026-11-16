// 写真の変換・回転を専用Workerへ委譲し、取消し・時間超過で一時データを破棄する。

import { PHOTO_INPUT_MAX_BYTES } from './photo-policy.ts';
import type { ConvertedPhoto } from './photo-policy.ts';

/** 入力上限と回転角を検査し、指定した向きの端末内変換結果だけを受け取る。 */
export function convertPhoto(file: File, signal: AbortSignal, quarterTurns = 0): Promise<ConvertedPhoto> {
  if (!file.size || file.size > PHOTO_INPUT_MAX_BYTES) return Promise.reject(Error('PHOTO_INPUT_SIZE'));
  if (signal.aborted) return Promise.reject(Error('PHOTO_CANCELLED'));
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) return Promise.reject(Error('PHOTO_ROTATION'));

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./photo-conversion-worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const timeout = setTimeout(() => finish(Error('PHOTO_TIMEOUT')), 90_000);

    /** 成否によらずWorkerとイベントを終了し、二度目の完了通知を防ぐ。 */
    function finish(error?: Error, value?: ConvertedPhoto) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    }

    /** 画面終了・公演切替・取消しでは変換を中断する。 */
    function cancel() { finish(Error('PHOTO_CANCELLED')); }

    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => finish(Error('PHOTO_DECODE'));
    worker.onmessage = (event: MessageEvent<{ error?: string; value?: ConvertedPhoto }>) => {
      if (event.data.error) finish(Error(event.data.error));
      else finish(undefined, event.data.value);
    };
    worker.postMessage({ file, quarterTurns });
  });
}
