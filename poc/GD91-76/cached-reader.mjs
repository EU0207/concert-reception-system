// GD91-75の取得契約を保ち、認可確認後に暗号化保存から再利用する。
const cacheKey = ref => ref.cacheTag ? ref.kind + '/' + ref.path + '@' + ref.cacheTag : null;
const sorted = entries => [...entries].sort(([a], [b]) => a.localeCompare(b));
export function cachedReader(core, store) {
  const scope = {...core.context}, stats = {cacheHits: 0, saves: 0, loadedEntries: 0};
  let cache = new Map(), localVersion = 0;
  async function session(work) {
    const pending = new Map(), used = new Set();
    try {
      return await core.session(async rawMany => {
        // 両方のパスをRulesで検査し、利用者と端末の取り違えを拒否する。
        const [, , authorizedHead] = await rawMany([
          {kind: 'publication', path: 'selfRoles/' + scope.humanUid, optional: true},
          {kind: 'publication', path: 'deviceStatus/' + scope.deviceUid, optional: true},
          {kind: 'publication', path: 'publicIndex/current'},
        ]);
        const restored = await store.load(scope);
        localVersion = restored?.version ?? 0;
        cache = new Map(restored?.entries ?? []); stats.loadedEntries += cache.size;
        const before = JSON.stringify(sorted(cache));
        let headDelivered = false;
        async function many(refs) {
          if (!headDelivered) {
            if (refs.length !== 1 || refs[0].kind !== 'publication' || refs[0].path !== 'publicIndex/current')
              throw new Error('cache-read-protocol');
            headDelivered = true; return [structuredClone(authorizedHead)];
          }
          const result = new Array(refs.length), missing = [];
          for (let i = 0; i < refs.length; i++) {
            const k = cacheKey(refs[i]); if (k) used.add(k);
            if (k && cache.has(k)) { stats.cacheHits++; result[i] = structuredClone(cache.get(k)); }
            else missing.push({ref: refs[i], position: i});
          }
          const values = await rawMany(missing.map(({ref}) => ({...ref, cacheTag: undefined})));
          for (let i = 0; i < missing.length; i++) {
            const {ref, position} = missing[i], k = cacheKey(ref);
            result[position] = values[i]; if (k && values[i] !== null) pending.set(k, structuredClone(values[i]));
          }
          return result;
        }
        const value = await work(many);
        const next = new Map([...cache, ...pending].filter(([k]) => used.has(k))), entries = sorted(next);
        if (JSON.stringify(entries) !== before) {
          const saved = await store.save(scope, entries, {expectedVersion: localVersion});
          localVersion = saved.version; stats.saves++;
        }
        cache = next;
        return value;
      });
    } catch (error) {
      // 停止時も鍵・暗号文は保持し、復号済みデータを使わない。
      cache.clear(); throw error;
    }
  }
  return {session, stats, coreStats: core.stats, cacheSize: () => cache.size, context: scope};
}
