// 写真を端末内で復号し、文字の輪郭を優先したPNGまたは高品質JPEGへ調整する。

import { heicTo } from 'heic-to/csp';
import { IMAGE_MAX_BYTES } from '../domain/seats/venue-image.ts';
import { PHOTO_INPUT_MAX_BYTES } from './photo-policy.ts';
import type { ConvertedPhoto, PhotoRequest } from './photo-policy.ts';

type Encoding = { type: 'image/png' | 'image/jpeg'; quality?: number };
let source: ImageBitmap | undefined;
let originalWidth = 0, originalHeight = 0;
let preferred: Encoding | undefined;
let queue = Promise.resolve();

/** 申告された拡張子ではなく画像ヘッダーから許可する入力形式を判定する。 */
async function inputKind(file: File): Promise<'native' | 'heic'> {
  const bytes = new Uint8Array(await file.slice(0, 40).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  if ((bytes[0] === 137 && text.slice(1, 4) === 'PNG') || (bytes[0] === 255 && bytes[1] === 216) ||
    (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')) return 'native';
  if (text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8))) return 'heic';
  throw Error('PHOTO_FORMAT');
}

/** 向きを適用して復号し、HEICを標準復号できない端末だけ追加デコーダーを使う。 */
async function decode(file: File): Promise<ImageBitmap> {
  const kind = await inputKind(file);
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    if (kind !== 'heic') throw Error('PHOTO_DECODE');
    return heicTo({ blob: file, type: 'bitmap' });
  }
}

/** 保存条件を満たすBlobだけを、成功した符号化条件と共に返す。 */
async function encode(canvas: OffscreenCanvas, encoding: Encoding) {
  const blob = await canvas.convertToBlob(encoding);
  return blob.size > 0 && blob.size <= IMAGE_MAX_BYTES && ['image/png', 'image/jpeg'].includes(blob.type) ? { blob, encoding } : undefined;
}

/** 初回は形式を比較し、回転時は確認済みの形式・品質を優先して再探索を避ける。 */
async function convert(bitmap: ImageBitmap, quarterTurns: number, retainSource: boolean): Promise<ConvertedPhoto> {
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) throw Error('PHOTO_ROTATION');
  const canvas = new OffscreenCanvas(1, 1);
  try {
    const { width, height } = bitmap;
    const draw = canvas.getContext('2d');
    if (!draw) throw Error('PHOTO_DECODE');
    const longest = Math.max(width, height);
    // 小さい文字を過度に潰さないため、最長辺1600px未満へ自動縮小しない。
    const minimum = Math.min(1, 1600 / longest);
    const scales = [...new Set([1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, minimum].map((scale) => Math.max(minimum, scale)))];
    for (const scale of scales) {
      const targetWidth = Math.max(1, Math.round(width * scale)), targetHeight = Math.max(1, Math.round(height * scale));
      canvas.width = quarterTurns % 2 ? targetHeight : targetWidth;
      canvas.height = quarterTurns % 2 ? targetWidth : targetHeight;
      draw.imageSmoothingEnabled = true;
      draw.imageSmoothingQuality = 'high';
      // JPEGで透過部分が黒くならないよう、両候補を同じ白背景で比較する。
      draw.fillStyle = '#fff';
      draw.fillRect(0, 0, canvas.width, canvas.height);
      draw.save();
      draw.translate(canvas.width / 2, canvas.height / 2);
      draw.rotate(quarterTurns * Math.PI / 2);
      draw.drawImage(bitmap, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
      draw.restore();
      let candidate = scale === 1 && preferred ? await encode(canvas, preferred) : undefined;
      candidate ??= await encode(canvas, { type: 'image/png' });
      if (!candidate) {
        for (const quality of [0.94, 0.9, 0.85]) {
          candidate = await encode(canvas, { type: 'image/jpeg', quality });
          if (candidate) break;
        }
      }
      if (candidate) {
        if (retainSource) {
          // JPEGを復号し直さず、初回縮小後の無圧縮画素だけを確認画面の間保持する。
          source = await createImageBitmap(canvas);
          preferred = candidate.encoding;
        }
        return { blob: candidate.blob, width: canvas.width, height: canvas.height, originalWidth, originalHeight };
      }
    }
    throw Error('PHOTO_CANNOT_FIT');
  } finally {
    canvas.width = canvas.height = 1;
  }
}

/** 元写真は一度だけ復号し、以後は初回調整後の無圧縮画素を使う。 */
async function handle(message: PhotoRequest) {
  try {
    let value: ConvertedPhoto;
    if (message.kind === 'initialize') {
      if (source || !message.file.size || message.file.size > PHOTO_INPUT_MAX_BYTES) throw Error('PHOTO_INPUT_SIZE');
      const bitmap = await decode(message.file);
      try {
        originalWidth = bitmap.width; originalHeight = bitmap.height;
        if (!originalWidth || !originalHeight || originalWidth * originalHeight > 50_000_000 || Math.max(originalWidth, originalHeight) > 12_000) throw Error('PHOTO_DIMENSIONS');
        value = await convert(bitmap, 0, true);
      } finally { bitmap.close(); }
    } else {
      if (!source) throw Error('PHOTO_NOT_READY');
      value = await convert(source, message.quarterTurns, false);
    }
    self.postMessage({ id: message.id, value });
  } catch (error) {
    self.postMessage({ id: message.id, error: error instanceof Error ? error.message : 'PHOTO_DECODE' });
  }
}

// 要求は直列化し、確認画面の終了時は親がWorkerごとキャッシュを破棄する。
self.onmessage = (event: MessageEvent<PhotoRequest>) => {
  queue = queue.then(() => handle(event.data));
};
