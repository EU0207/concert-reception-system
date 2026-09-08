import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { prepareOfflineData } from "../../src/preparation";
import { PocRepository } from "../../src/repository";

class MemoryCacheStorage {
  readonly stores = new Map<string, Map<string, Response>>();

  async open(name: string): Promise<Cache> {
    const entries = this.stores.get(name) ?? new Map<string, Response>();
    this.stores.set(name, entries);
    return {
      put: async (request: RequestInfo | URL, response: Response) => { entries.set(String(request), response.clone()); },
      match: async (request: RequestInfo | URL) => entries.get(String(request))?.clone()
    } as Cache;
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
}

const repositories: PocRepository[] = [];
afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.deleteLocalData();
});

async function fixture(imageCount = 1) {
  const images = await Promise.all(Array.from({ length: imageCount }, async (_, index) => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, index]);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      bytes,
      item: {
        id: `venue-${index}`,
        label: `画像${index}`,
        url: `/venue-images/image-${index}.png`,
        mimeType: "image/png" as const,
        byteLength: bytes.byteLength,
        sha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
      }
    };
  }));
  return images;
}

describe("安全な事前取得", () => {
  it("全画像を検証してから500席と準備完了を保存する", async () => {
    const images = await fixture(2);
    const repository = new PocRepository(`poc-005-success-${crypto.randomUUID()}`);
    repositories.push(repository);
    const storage = new MemoryCacheStorage();
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("manifest.json")) return Response.json(images.map(({ item }) => item));
      const image = images.find(({ item }) => item.url === url);
      return image ? new Response(image.bytes) : new Response(null, { status: 404 });
    };
    const state = await prepareOfflineData(repository, {
      fetcher: fetcher as typeof fetch,
      cacheStorage: storage as unknown as CacheStorage,
      storageManager: { estimate: async () => ({ quota: 100_000, usage: 0 }), persist: async () => true },
      now: () => new Date("2026-09-07T00:00:00.000Z")
    });
    expect(state.seatCount).toBe(500);
    expect(state.images).toHaveLength(2);
    expect(await repository.listSeats()).toHaveLength(500);
    expect(await repository.getPreparation()).toEqual(state);
  });

  it("概算容量不足なら画像取得前に停止し準備完了を保存しない", async () => {
    const images = await fixture();
    const repository = new PocRepository(`poc-005-capacity-${crypto.randomUUID()}`);
    repositories.push(repository);
    let imageFetches = 0;
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      if (String(input).endsWith("manifest.json")) return Response.json(images.map(({ item }) => item));
      imageFetches += 1;
      return new Response(images[0]?.bytes);
    };
    await expect(prepareOfflineData(repository, {
      fetcher: fetcher as typeof fetch,
      cacheStorage: new MemoryCacheStorage() as unknown as CacheStorage,
      storageManager: { estimate: async () => ({ quota: 10, usage: 9 }), persist: async () => false }
    })).rejects.toThrow("空き容量");
    expect(imageFetches).toBe(0);
    expect(await repository.getPreparation()).toBeUndefined();
  });

  it("途中取得失敗なら一時キャッシュを削除し準備完了にしない", async () => {
    const images = await fixture(2);
    const repository = new PocRepository(`poc-005-interrupt-${crypto.randomUUID()}`);
    repositories.push(repository);
    const storage = new MemoryCacheStorage();
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("manifest.json")) return Response.json(images.map(({ item }) => item));
      if (url === images[0]?.item.url) return new Response(images[0].bytes);
      return new Response(null, { status: 503 });
    };
    await expect(prepareOfflineData(repository, {
      fetcher: fetcher as typeof fetch,
      cacheStorage: storage as unknown as CacheStorage,
      storageManager: { estimate: async () => ({ quota: 100_000, usage: 0 }), persist: async () => false }
    })).rejects.toThrow("取得できません");
    expect(await storage.keys()).toEqual([]);
    expect(await repository.getPreparation()).toBeUndefined();
  });
});
