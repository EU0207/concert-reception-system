// 写真を端末内で復号し、文字の輪郭を優先したPNGまたは高品質JPEGへ調整する。

import { heicTo } from 'heic-to/csp';
import { IMAGE_MAX_BYTES } from '../domain/seats/venue-image.ts';
import { PHOTO_INPUT_MAX_BYTES } from './photo-policy.ts';
import type { ConvertedPhoto } from './photo-policy.ts';

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

/** 指定の向きで描画し、無劣化PNGまたは高品質JPEGを段階的な寸法で選ぶ。 */
async function convert(file: File, quarterTurns: number): Promise<ConvertedPhoto> {
  if (!file.size || file.size > PHOTO_INPUT_MAX_BYTES) throw Error('PHOTO_INPUT_SIZE');
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) throw Error('PHOTO_ROTATION');
  const bitmap = await decode(file);
  const canvas = new OffscreenCanvas(1, 1);
  try {
    const { width, height } = bitmap;
    if (!width || !height || width * height > 50_000_000 || Math.max(width, height) > 12_000) throw Error('PHOTO_DIMENSIONS');
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
      let blob = await canvas.convertToBlob({ type: 'image/png' });
      if (blob.size > IMAGE_MAX_BYTES) {
        for (const quality of [0.94, 0.9, 0.85]) {
          blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
          if (blob.size <= IMAGE_MAX_BYTES) break;
        }
      }
      if (blob.size <= IMAGE_MAX_BYTES && ['image/png', 'image/jpeg'].includes(blob.type)) {
        return { blob, width: canvas.width, height: canvas.height, originalWidth: width, originalHeight: height };
      }
    }
    throw Error('PHOTO_CANNOT_FIT');
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 1;
  }
}

// 変換要求ごとに作られるWorker。結果は親画面へ返し、保存や通信は行わない。
self.onmessage = async (event: MessageEvent<{ file: File; quarterTurns: number }>) => {
  try { self.postMessage({ value: await convert(event.data.file, event.data.quarterTurns) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'PHOTO_DECODE' }); }
};
