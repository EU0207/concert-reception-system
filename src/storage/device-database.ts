// 鍵と操作記録を同じ版管理へ置き、DB更新で片方だけ失われることを防ぐ。

export const DEVICE_DATABASE = 'concert-reception-device';
export const DEVICE_DATABASE_VERSION = 4;

/** 端末の鍵と固定操作記録を保存するIndexedDBを開く。 */
export function openDeviceDatabase(): Promise<IDBDatabase> {
  // 保存不能を準備完了にしないため、作成・接続の失敗を呼出元へ返す。

  return new Promise((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(DEVICE_DATABASE, DEVICE_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      for (const store of ['deviceKeys', 'authorizationOperations', 'seatDrafts', 'seatOperations', 'venueImages']) {
        if (!request.result.objectStoreNames.contains(store))
          request.result.createObjectStore(store);
      }
    };
    request.onsuccess = () => {
      const database = request.result;

      // blockedで既に失敗を返した後に開けても、接続を残して次の更新を妨げない。
      if (failed) {
        database.close();

        return;
      }

      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(new Error('DEVICE_STORAGE_UNAVAILABLE'));
    request.onblocked = () => {
      failed = true;
      reject(new Error('DEVICE_STORAGE_BLOCKED'));
    };
  });
}
