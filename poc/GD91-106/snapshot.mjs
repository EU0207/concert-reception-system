import {snapshot as readSnapshot} from '../GD91-105/snapshot.mjs';

export function createSnapshotReader({enabled=true}={}) {
  const successful = new WeakMap();
  return async function snapshot(read, readReception, options={}) {
    const cached = options.cached ?? (enabled ? successful.get(read) : undefined);
    const result = await readSnapshot(read, readReception, {...options, cached});
    if (enabled) successful.set(read, result);
    return result;
  };
}
