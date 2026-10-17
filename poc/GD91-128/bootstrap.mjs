import assert from 'node:assert/strict';
// 旧PoCの固定9191を、この試行専用Auth Emulatorへ転送する。
// SDKはlocal.mjsで同じ9291へ明示接続する。既存試行とはポートを共有しない。
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9291');
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191';
const original=globalThis.fetch;
globalThis.fetch=(input,init)=>{
  const url=new URL(String(input));
  if(url.hostname==='127.0.0.1'&&url.port==='9191')url.port='9291';
  assert(url.hostname==='127.0.0.1'||url.hostname==='localhost','local-emulators-only');
  return original(url,init);
};
await import('./local.mjs');
