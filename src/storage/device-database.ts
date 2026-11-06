// 公演・端末用の保存基盤。後続の業務ストアも、このDBの版管理へ追加する。

export const DEVICE_DATABASE = "concert-reception-device";
export const DEVICE_DATABASE_VERSION = 1;

/** 保存領域の作成・接続を行い、利用できない場合は呼出元へ失敗を返す。 */
export function openDeviceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_DATABASE, DEVICE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("deviceKeys");
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(new Error("DEVICE_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("DEVICE_STORAGE_BLOCKED"));
  });
}
