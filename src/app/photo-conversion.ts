// 写真変換を専用Workerへ委譲し、取消し・時間超過で処理と一時データを破棄する。

import { PHOTO_INPUT_MAX_BYTES } from './photo-policy.ts';
import type { ConvertedPhoto } from './photo-policy.ts';

/** 保存上限とは別の入力上限を検査し、端末内の変換結果だけを受け取る。 */
export function convertPhoto(file: File, signal: AbortSignal): Promise<ConvertedPhoto> {
  if (!file.size || file.size > PHOTO_INPUT_MAX_BYTES) return Promise.reject(Error('PHOTO_INPUT_SIZE'));
  if (signal.aborted) return Promise.reject(Error('PHOTO_CANCELLED'));

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
    worker.postMessage(file);
  });
}
