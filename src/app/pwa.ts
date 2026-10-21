// 画面のオフライン起動を準備する。更新版は通知だけ行い、作業中の画面を自動更新しない。

/** Service Workerを登録し、起動準備の完了と更新待ちを呼出元へ通知する。 */
export async function registerPwa(onWaiting: () => void, onReady: () => void): Promise<void> {
  if (!('serviceWorker' in navigator) || !isSecureContext) return;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active) onReady();
  if (existing?.waiting) onWaiting();
  // 開発サーバーのソースや環境設定はキャッシュ対象にしない。
  let response: Response;
  try {
    response = await fetch('/sw.js', { cache: 'no-store' });
  } catch (error) {
    if (existing?.active) return;
    throw error;
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('javascript')) return;
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  if (registration.waiting) onWaiting();
  const observe = (worker: ServiceWorker | null) =>
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        if (navigator.serviceWorker.controller) onWaiting();
        else onReady();
      }
    });
  observe(registration.installing);
  registration.addEventListener('updatefound', () => observe(registration.installing));
  if (registration.active) onReady();
  // skipWaiting・自動再読込・IndexedDB回収を行わず、編集・未受領の保全を後続でも維持する。
}
