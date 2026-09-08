import { createFakeSeats, validateImages, type ImageCandidate, type VenueImage } from "./domain";
import { PocRepository, type PreparationState } from "./repository";

export const IMAGE_CACHE_PREFIX = "concert-reception-poc-005-images-";
const CAPACITY_MARGIN = 1.2;

export interface PreparationProgress {
  phase: "容量確認" | "取得中" | "検証中" | "保存中" | "完了";
  completed: number;
  total: number;
}

export interface PreparationDependencies {
  fetcher?: typeof fetch;
  cacheStorage?: CacheStorage;
  storageManager?: Pick<StorageManager, "estimate" | "persist">;
  now?: () => Date;
  onProgress?: (progress: PreparationProgress) => void;
}

export async function prepareOfflineData(repository: PocRepository, dependencies: PreparationDependencies = {}): Promise<PreparationState> {
  const fetcher = dependencies.fetcher ?? fetch;
  const cacheStorage = dependencies.cacheStorage ?? caches;
  const storageManager = dependencies.storageManager ?? navigator.storage;
  const now = dependencies.now ?? (() => new Date());
  const manifestResponse = await fetcher("/venue-images/manifest.json", { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("画像一覧を取得できませんでした。");
  const manifest = (await manifestResponse.json()) as VenueImage[];
  validateManifest(manifest);

  dependencies.onProgress?.({ phase: "容量確認", completed: 0, total: manifest.length });
  const requiredBytes = manifest.reduce((sum, image) => sum + image.byteLength, 0);
  const estimate = await storageManager.estimate();
  if (estimate.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < requiredBytes * CAPACITY_MARGIN) {
    throw new Error("端末の概算空き容量が不足しています。画像なしの代替一覧を使用してください。");
  }
  let persisted: boolean | null = null;
  try {
    persisted = await storageManager.persist();
  } catch {
    persisted = null;
  }

  const cacheName = `${IMAGE_CACHE_PREFIX}${now().getTime()}`;
  const temporaryCache = await cacheStorage.open(cacheName);
  const candidates: ImageCandidate[] = [];
  try {
    for (const [index, image] of manifest.entries()) {
      dependencies.onProgress?.({ phase: "取得中", completed: index, total: manifest.length });
      const response = await fetcher(image.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${image.label}を取得できませんでした。`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      candidates.push({ name: image.url.split("/").pop() ?? image.id, declaredMimeType: image.mimeType, bytes });
      dependencies.onProgress?.({ phase: "検証中", completed: index + 1, total: manifest.length });
      if (bytes.byteLength !== image.byteLength) throw new Error(`${image.label}のサイズが画像一覧と一致しません。`);
      if ((await sha256(bytes)) !== image.sha256) throw new Error(`${image.label}の内容が画像一覧と一致しません。`);
      await temporaryCache.put(image.url, new Response(bytes, { headers: { "Content-Type": image.mimeType, "Content-Length": String(bytes.byteLength) } }));
    }
    const validation = validateImages(candidates);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    dependencies.onProgress?.({ phase: "保存中", completed: manifest.length, total: manifest.length });
    const previous = await repository.getPreparation();
    const state: PreparationState = {
      eventId: "FAKE-EVENT-P005",
      cacheName,
      images: manifest,
      imageBytes: validation.totalBytes,
      seatCount: 500,
      completedAt: now().toISOString(),
      persisted
    };
    await repository.replacePreparation(createFakeSeats(), state);
    if (previous?.cacheName && previous.cacheName !== cacheName) await cacheStorage.delete(previous.cacheName);
    dependencies.onProgress?.({ phase: "完了", completed: manifest.length, total: manifest.length });
    return state;
  } catch (error) {
    await cacheStorage.delete(cacheName);
    throw error;
  }
}

export async function deletePocCaches(cacheStorage: CacheStorage = caches): Promise<void> {
  for (const name of await cacheStorage.keys()) {
    if (name.startsWith(IMAGE_CACHE_PREFIX) || name.includes("concert-reception-poc-005-shell")) await cacheStorage.delete(name);
  }
}

function validateManifest(manifest: readonly VenueImage[]): void {
  if (manifest.length === 0 || manifest.length > 5) throw new Error("画像一覧は1～5件である必要があります。");
  const total = manifest.reduce((sum, image) => sum + image.byteLength, 0);
  if (total > 25_000_000) throw new Error("画像一覧の合計が25,000,000バイトを超えています。");
  for (const image of manifest) {
    if (!image.url.startsWith("/venue-images/") || image.url.includes("..")) throw new Error("画像URLが許可範囲外です。");
    if (image.byteLength > 5_000_000) throw new Error(`${image.label}が5,000,000バイトを超えています。`);
    if (!/^[a-f0-9]{64}$/.test(image.sha256)) throw new Error(`${image.label}のハッシュが不正です。`);
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
