import assert from 'node:assert/strict';
const target=new URL(process.env.GD121_DATABASE_URL);
assert.equal(target.protocol,'https:');assert.equal(target.hostname,'localhost');
assert.equal(target.searchParams.get('ns'),'demo-concert-seat-gd91-84-default-rtdb');
assert(['127.0.0.1:9000','localhost:9000'].includes(process.env.FIREBASE_DATABASE_EMULATOR_HOST));
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const nativeFetch=globalThis.fetch,counters={normalRouted:0,ownerBypassed:0};
globalThis.fetch=(input,options={})=>{
 const url=new URL(input instanceof Request?input.url:input);
 if(url.hostname!=='127.0.0.1'||url.port!=='9000')return nativeFetch(input,options);
 assert(!(input instanceof Request),'routing-requires-explicit-options');
 if(new Headers(options.headers).get('authorization')==='Bearer owner'){counters.ownerBypassed++;return nativeFetch(input,options);}
 assert.equal(url.searchParams.get('ns'),target.searchParams.get('ns'));
 counters.normalRouted++;url.protocol=target.protocol;url.hostname=target.hostname;url.port=target.port;
 return nativeFetch(url,options);
};
globalThis.__gd121Routing={stats:()=>({...counters})};
await import('./capacity.mjs');
