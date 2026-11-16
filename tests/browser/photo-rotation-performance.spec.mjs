// 同じ人工1200万画素写真で、初回調整・初回回転・キャッシュ再利用の時間を測定する。

import { test, expect } from '@playwright/test';

test('PHOTO294-P01 人工写真で回転時間を計測し、キャッシュ時も保存上限と結果を保持する', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('http://127.0.0.1:4181/');
  const result = await page.evaluate(async () => {
    const pipeline = await import('/src/app/photo-conversion.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 4000; canvas.height = 3000;
    const draw = canvas.getContext('2d'), pixels = draw.createImageData(4000, 3000);
    let seed = 12345;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[index] = seed & 255; pixels.data[index + 1] = seed >>> 8 & 255;
      pixels.data[index + 2] = seed >>> 16 & 255; pixels.data[index + 3] = 255;
    }
    draw.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const file = new File([blob], 'fictional-12mp.jpg', { type: blob.type });
    canvas.width = canvas.height = 1;
    const elapsed = [];
    let session, output, firstRotation;
    try {
      for (const turn of [0, 1, 3, 1]) {
        const start = performance.now();
        // 旧実装と比較するときも、同じ入力生成・時刻計測を使う。
        if (pipeline.createPhotoSession) {
          session ??= pipeline.createPhotoSession(file, new AbortController().signal);
          output = turn === 0 ? await session.original : await session.rotate(turn);
        } else output = await pipeline.convertPhoto(file, new AbortController().signal, turn);
        elapsed.push({ turn, ms: Math.round(performance.now() - start) });
        if (turn === 1 && !firstRotation) firstRotation = output;
      }
      return { inputBytes: file.size, width: output.width, height: output.height, outputBytes: output.blob.size,
        cached: !!session, reused: firstRotation === output, elapsed };
    } finally { session?.close(); }
  });
  expect(result.inputBytes).toBeLessThanOrEqual(20_000_000);
  expect(result.outputBytes).toBeLessThanOrEqual(1_000_000);
  if (result.cached) expect(result.reused).toBe(true);
  // 時間の固定しきい値でCIを不安定にせず、同一端末の改善前後を記録して比較する。
  console.log(`PHOTO294-P01 ${JSON.stringify(result)}`);
});
