import fs from 'node:fs';import assert from 'node:assert/strict';
import {generated} from '../GD91-116/generate.mjs';
const root=new URL('./',import.meta.url);
function replace(source,old,next){assert(source.includes(old),'adaptation-target-missing');return source.replaceAll(old,next);}
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
let capacity=fs.readFileSync(new URL('../GD91-115/capacity.mjs',root),'utf8');
capacity=replace(capacity,"from '"+"./meter.mjs'","from '../GD91-115/meter.mjs'");
capacity=replace(capacity,"'../GD91-111/sdk-client.mjs'","'./sdk-client.mjs'");
capacity=replace(capacity,'../GD91-113/database.rules.json','./database.rules.json');
capacity=replace(capacity,"['capacity.mjs','meter.mjs','generate.mjs','emulator-maintenance.mjs'","['capacity.mjs','bootstrap.mjs','sdk-client.mjs','../GD91-115/meter.mjs','generate.mjs','emulator-maintenance.mjs'");
// 関数の静的依存だけでなく、実行時に組み込む元試験も証拠へ保持する。
capacity=replace(capacity,"r.adaptedFrom='../GD91-101/capacity.mjs';","r.adaptedFrom='../GD91-101/capacity.mjs';r.transportAdaptedFrom='../GD91-115/capacity.mjs';r.httpsRouting=globalThis.__gd121Routing.stats();");
fs.writeFileSync(new URL('capacity.mjs',root),capacity);
let sdk=fs.readFileSync(new URL('../GD91-111/sdk-client.mjs',root),'utf8');
sdk=replace(sdk,'databaseURL:`https://${namespace}.firebaseio.com`','databaseURL:process.env.GD121_DATABASE_URL');
sdk=replace(sdk,"const db=getDatabase(app);connectDatabaseEmulator(db,'127.0.0.1',9000);","const db=getDatabase(app,process.env.GD121_DATABASE_URL);");
fs.writeFileSync(new URL('sdk-client.mjs',root),sdk);
fs.writeFileSync(new URL('emulator-maintenance.mjs',root),fs.readFileSync(new URL('../GD91-115/emulator-maintenance.mjs',root),'utf8').replaceAll('../GD91-113/database.rules.json','./database.rules.json'));
fs.writeFileSync(new URL('database.rules.json',root),JSON.stringify(generated(),null,2)+'\n');
console.log(JSON.stringify({adaptedFrom:'GD91-115',rules:'GD91-116',businessOperationsChanged:false,externalFirebaseConnected:false}));
