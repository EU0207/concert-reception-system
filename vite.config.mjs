// 開発サーバーと製品ビルドの設定。対象ブラウザーとローカル接続先を指定する。

import { defineConfig } from 'vite';

// # 本文：開発サーバーとビルドの設定

export default defineConfig({
  build: { target: ['es2023', 'safari17'], sourcemap: false, modulePreload: { polyfill: false } },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
});
