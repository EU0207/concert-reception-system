// ビルド済みの静的資産から、ハッシュ付きのService Workerを生成する。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve(import.meta.dirname, '../dist');

/** 配布フォルダを再帰的にたどり、ファイルを列挙する。 */
async function collect(folder) {
  const files = [];

  for (const item of await readdir(folder, { withFileTypes: true })) {
    const full = resolve(folder, item.name);

    if (item.isDirectory()) files.push(...(await collect(full)));
    else files.push(full);
  }

  return files;
}

/** 静的資産を収集し、オフライン起動用のService Workerを生成する。 */
async function main() {
  // ビルド済みの自己配信資産だけを列挙する。環境設定・認証・業務データは含めない。
  const files = (await collect(directory)).filter(
    (file) => /\.(?:html|js|css|svg|webmanifest)$/.test(file) && !file.endsWith('sw.js'),
  );
  const entries = [];

  for (const file of files.sort()) {
    const data = await readFile(file);

    entries.push({
      url: '/' + relative(directory, file).replaceAll('\\', '/'),
      integrity: 'sha256-' + createHash('sha256').update(data).digest('base64'),
    });
  }

  // 資産の内容が変わった場合にだけキャッシュ名が変わるよう、一覧から版を作る。
  const version = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 20);
  const template = await readFile(
    resolve(import.meta.dirname, '../src/app/service-worker.js'),
    'utf8',
  );

  await writeFile(
    resolve(directory, 'sw.js'),
    template
      .replace('__PRECACHE_ENTRIES__', JSON.stringify(entries))
      .replaceAll('__CACHE_VERSION__', version),
  );
  console.log(`PWA: ${entries.length} static assets, ${version}. app-config.json is excluded.`);
}

// # 本文：静的資産を収集し、オフライン起動用のService Workerを生成する。

await main();
