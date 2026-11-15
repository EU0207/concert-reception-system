// ビルド済みの製品画面を確認するローカルサーバー。標準では同じPCからだけ接続できる。

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const args = process.argv.slice(2);

/** 起動引数から指定値を取り出し、省略時は既定値を返す。 */
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
// 同一配布元の資産だけを許可し、この確認サーバーではカメラ等の権限を使わない。
const headers = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** 配布フォルダ内の許可した形式だけを返し、外部のファイル参照を拒否する。 */
const handler = async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, headers).end();

    return;
  }

  try {
    const url = new URL(request.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = resolve(root, '.' + name);

    if (!file.startsWith(root + sep) || !mime[extname(file)]) {
      response.writeHead(404, headers).end();

      return;
    }

    const data = await readFile(file);
    const cache = name.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store';

    response.writeHead(200, {
      ...headers,
      'Content-Type': mime[extname(file)],
      'Cache-Control': cache,
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404, headers).end();
  }
};

/** 配信設定を確認し、製品開発版のHTTPまたはHTTPSサーバーを起動する。 */
async function main() {
  const host = option('--host', '127.0.0.1'),
    port = Number(option('--port', '4173'));
  const cert = process.env.DEV_HTTPS_CERT,
    key = process.env.DEV_HTTPS_KEY;

  if (Boolean(cert) !== Boolean(key)) throw new Error('Set both DEV_HTTPS_CERT and DEV_HTTPS_KEY.');

  // 証明書と秘密鍵が両方指定された場合だけHTTPSを使う。
  const server = cert
    ? createHttpsServer({ cert: await readFile(cert), key: await readFile(key) }, handler)
    : createHttpServer(handler);

  server.listen(port, host, () =>
    console.log(`製品開発版: ${cert ? 'https' : 'http'}://${host}:${port} （Ctrl+Cで終了）`),
  );
}

// # 本文：製品開発版の確認サーバーを起動する

await main();
