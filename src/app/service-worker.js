/* ビルド時に固定した汎用シェルだけを保存する。環境設定・認証・業務要求は対象外。 */

const entries = __PRECACHE_ENTRIES__;
const cacheName = 'concert-shell-__CACHE_VERSION__';
const allowed = new Set(entries.map((item) => item.url));

// # 本文：各イベントで動く処理を登録する
// 読込み時は登録だけを行い、実際の保存・取得はイベント発生時に実行する。

// 初回導入・更新時：すべての対象資産を取得できた場合だけ保存を完成させる。
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // 全資産のハッシュ検証・取得成功後だけキャッシュを完成させる。
      const loaded = await Promise.all(
        entries.map(async (entry) => {
          const response = await fetch(
            new Request(entry.url, { cache: 'reload', integrity: entry.integrity }),
          );

          if (!response.ok || response.type !== 'basic') throw new Error('SHELL_INSTALL_FAILED');

          return [entry.url, response];
        }),
      );
      const cache = await caches.open(cacheName);

      await Promise.all(loaded.map(([url, response]) => cache.put(url, response)));
    })(),
  );
});
// 有効化時：旧版の静的キャッシュだけを回収する。
self.addEventListener('activate', (event) => {
  // 古い版の画面は閉じるまで旧Workerを使う。設定・鍵と業務DBには触らない。
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('concert-shell-') && name !== cacheName)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});
// 取得時：同一配布元の固定リストだけをキャッシュから返す。設定や業務通信は扱わない。
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;

  const target = request.mode === 'navigate' && url.pathname === '/' ? '/index.html' : url.pathname;

  if (!allowed.has(target)) return;

  event.respondWith(
    caches
      .open(cacheName)
      .then((cache) => cache.match(target))
      .then((response) => response ?? fetch(request)),
  );
});
