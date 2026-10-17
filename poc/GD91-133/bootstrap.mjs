import assert from 'node:assert/strict';
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9391');process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8281');process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8181';
const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(String(input));if(url.hostname==='127.0.0.1'&&url.port==='9191')url.port='9391';if(url.hostname==='127.0.0.1'&&url.port==='8181')url.port='8281';
assert(['127.0.0.1','localhost'].includes(url.hostname),'local-emulators-only');return original(url,init);};
await import('./local.mjs');
