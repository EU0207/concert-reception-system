// 起動設定の取得・検証と端末内保存を担当する。検証が完了するまで業務画面を開かない。

import { configFingerprint, parseConfig, StartupError } from './config.ts';
import type { AppConfig } from './config.ts';

/** 端末を利用環境へ結び付けるために保存する、設定とその指紋。 */
interface Binding {
  config: AppConfig;
  fingerprint: string;
}

const DATABASE = 'concert-reception-bootstrap';

/** 起動設定用のIndexedDBを開く。初回だけ保存領域を作る。 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);

    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StartupError('STORAGE_UNAVAILABLE'));
    request.onblocked = () => reject(new StartupError('STORAGE_UNAVAILABLE'));
  });
}

/** 通信不能時の起動確認に使う、保存済みの環境設定を読み出す。 */
async function storedBinding(): Promise<Binding | undefined> {
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly'),
        request = tx.objectStore('settings').get('binding');

      tx.oncomplete = () => resolve(request.result as Binding | undefined);
      tx.onabort = () => reject(new StartupError('STORAGE_UNAVAILABLE'));
      tx.onerror = () => reject(new StartupError('STORAGE_UNAVAILABLE'));
    });
  } finally {
    db.close();
  }
}

/** 既存の環境と一致する場合だけ設定を保存する。照合と更新は同じトランザクションで行う。 */
async function bind(config: AppConfig, fingerprint: string): Promise<void> {
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite'),
        store = tx.objectStore('settings');
      const request = store.get('binding');
      let mismatch = false;

      request.onsuccess = () => {
        const prior = request.result as Binding | undefined;

        if (
          prior &&
          (prior.fingerprint !== fingerprint ||
            prior.config?.environmentId !== config.environmentId)
        ) {
          mismatch = true;
          tx.abort();

          return;
        }

        store.put({ config, fingerprint } satisfies Binding, 'binding');
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(new StartupError(mismatch ? 'ENVIRONMENT_MISMATCH' : 'STORAGE_UNAVAILABLE'));
      tx.onerror = () => reject(new StartupError('STORAGE_UNAVAILABLE'));
    });
  } finally {
    db.close();
  }
}

/** 起動確認の結果。設定の取得元は接続状態の表示にも使う。 */
export interface StartupResult {
  config: AppConfig;
  source: 'network' | 'device';
}

/** 設定取得→形式検証→環境照合・保存の順に処理し、起動可能な設定を返す。 */
export async function startApplication(): Promise<StartupResult> {
  if (!isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB)
    throw new StartupError('SECURE_STORAGE_REQUIRED');

  let candidate: unknown,
    source: StartupResult['source'] = 'network';
  let response: Response;

  // 通信不能の場合だけ保存済み設定を使う。サーバーの明示的な拒否は後段で停止する。
  try {
    response = await fetch('/app-config.json', {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    const prior = await storedBinding();

    if (!prior) throw new StartupError('CONFIG_UNAVAILABLE');

    const config = parseConfig(prior.config);

    if ((await configFingerprint(config)) !== prior.fingerprint)
      throw new StartupError('INVALID_STORED_CONFIG');

    candidate = config;
    source = 'device';
  }

  // 取得できた応答は、形式とサイズを確認してから設定として解釈する。
  if (source === 'network') {
    if (!response!.ok) throw new StartupError('CONFIG_UNAVAILABLE');
    if (!response!.headers.get('content-type')?.includes('application/json'))
      throw new StartupError('INVALID_CONFIG');

    const body = await response!.text();

    if (body.length > 16384) throw new StartupError('INVALID_CONFIG');

    try {
      candidate = JSON.parse(body);
    } catch {
      throw new StartupError('INVALID_CONFIG');
    }
  }

  const config = parseConfig(candidate);

  // 現在認可の接続口は#110で実装する。未実装の環境で接続・認証を成功扱いにしない。
  if (config.environmentType !== 'evaluation-local')
    throw new StartupError('AUTH_ADAPTER_REQUIRED');

  // 照合だけでなく保存完了まで待ち、成功した場合だけ画面側へ返す。
  await bind(config, await configFingerprint(config));

  return { config, source };
}
