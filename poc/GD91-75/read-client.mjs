// 隔離PoCの読取り専用アダプター。既存Rulesを変更しない。
import {base, data} from '../GD91-60/tests/transport.mjs';

const documentRoot = base.slice(base.indexOf('/projects/') + 1);
export class ReadError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function readerClient({performanceId, humanUid, deviceUid, token, groupSize = 3, transport = fetch}) {
  if (!performanceId || !humanUid || !deviceUid || !token || !Number.isInteger(groupSize) || groupSize < 1 || groupSize > 3)
    throw new ReadError('invalid-reader-context');
  const stats = {requests: 0, requestedDocuments: 0, cacheHits: 0, batchSizes: []};
  let cache = new Map();
  const name = ref => documentRoot + '/' + (ref.kind === 'source'
    ? 'sourceProofShows/' + performanceId + '/sections/' + ref.path
    : 'publicationShows/' + performanceId + '/' + ref.path);
  function key(ref) { return ref.cacheTag ? ref.kind + '/' + ref.path + '@' + ref.cacheTag : null; }
  async function network(refs) {
    stats.requests++;
    stats.requestedDocuments += refs.length;
    stats.batchSizes.push(refs.length);
    const names = refs.map(name);
    const response = await transport(base + ':batchGet', {method: 'POST',
      headers: {'content-type': 'application/json', authorization: 'Bearer ' + token},
      body: JSON.stringify({documents: names})});
    if (!response.ok) throw new ReadError(response.status === 403 ? 'permission-denied' : 'read-http-' + response.status);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new ReadError('invalid-batch-response');
    const values = new Map();
    for (const entry of entries) {
      if (entry.error) throw new ReadError(entry.error.code === 7 ? 'permission-denied' : 'batch-item-error');
      const path = entry.found?.name ?? entry.missing;
      if (!names.includes(path) || values.has(path)) throw new ReadError('unexpected-batch-document');
      values.set(path, entry.found ? data({body: entry.found}) : null);
    }
    if (values.size !== names.length) throw new ReadError('incomplete-batch-response');
    return refs.map((ref, i) => {
      const value = values.get(names[i]);
      if (value === null && !ref.optional) throw new ReadError('missing-required-document');
      return value;
    });
  }
  async function session(work) {
    const pending = new Map(), used = new Set();
    async function many(refs) {
      const result = new Array(refs.length), misses = [];
      for (let i = 0; i < refs.length; i++) {
        const k = key(refs[i]);
        if (k) used.add(k);
        if (k && cache.has(k)) { stats.cacheHits++; result[i] = structuredClone(cache.get(k)); }
        else misses.push({ref: refs[i], position: i});
      }
      for (let i = 0; i < misses.length; i += groupSize) {
        const group = misses.slice(i, i + groupSize), values = await network(group.map(x => x.ref));
        for (let j = 0; j < group.length; j++) {
          const {ref, position} = group[j], k = key(ref);
          result[position] = values[j];
          if (k && values[j] !== null) pending.set(k, structuredClone(values[j]));
        }
      }
      return result;
    }
    try {
      const value = await work(many);
      cache = new Map([...cache, ...pending].filter(([k]) => used.has(k)));
      return value;
    } catch (error) {
      // 未完成の取得を採用しない。失効時は同じ利用者の再利用分も破棄する。
      if (error.code === 'permission-denied') cache.clear();
      throw error;
    }
  }
  return {session, stats, clear: () => cache.clear(), cacheSize: () => cache.size,
    context: {performanceId, humanUid, deviceUid}};
}
