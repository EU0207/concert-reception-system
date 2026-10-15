import fs from 'node:fs';import assert from 'node:assert/strict';import {sourceHashes} from '../GD91-105/source-audit.mjs';import {createReauthentication} from './reauth.mjs';
import {createEmulatorMaintenance} from './emulator-maintenance.mjs';
const original=new URL('../GD91-101/capacity.mjs',import.meta.url),result=new URL('artifacts/capacity-'+(process.env.GD101_PEOPLE??'600')+'-summary.json',import.meta.url);
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['capacity.mjs','setup.mjs','run.mjs','../GD91-101/capacity.mjs','../GD91-107/database.rules.json','../GD91-107/check-generation.mjs','../GD91-105/snapshot.mjs']);const before=hashes();
const reauthentication=createReauthentication({afterMs:Number(process.env.GD108_REAUTH_AFTER_MS??600000)});
globalThis.__gd108Reauthentication=reauthentication;
const maintenance=createEmulatorMaintenance(process.env.GD108_EMULATOR_MAINTENANCE==='true');globalThis.__gd108Maintenance=maintenance;
let source=fs.readFileSync(original,'utf8');
source=source.replace('import {setup,cleanup,trial,owner,ok,metrics}', 'import {cleanup,trial,owner,ok,metrics}');
source=source.replace("import {bulk,command,applyModel} from '../GD91-92/model.mjs';", "import {bulk} from '../GD91-92/model.mjs';import {command,applyModel} from '../GD91-103/model.mjs';");
source=source.replace('console.error(e.stack);',"console.error(JSON.stringify({phase,code:e.code??e.name,message:e.message}));");
source=source.replace('async function commit(body){','async function commit(body){await globalThis.__gd108Reauthentication.ensure(m);');
source=source.replace('let clean,failure,phase=', 'let clean,failure,phase=');
source=source.replace("import {user,request} from '../GD91-99/support.mjs';", "import {user as ordinaryUser,request} from '../GD91-99/support.mjs';let normalGetRetries=0;async function user(p,d,method='GET',body){for(let attempt=0;;attempt++){try{return await ordinaryUser(p,d,method,body);}catch(e){if(method!=='GET'||e.name!=='TimeoutError'||attempt>=7)throw e;normalGetRetries++;}}}");
source=source.replace('clean=await cleanup();',"for(let attempt=0;;attempt++){try{clean=await cleanup();break;}catch(e){if(e.name!=='TimeoutError'||attempt>=3){clean={rulesClosed:false,trialRootEmpty:false,cleanupFailure:{code:e.code??e.name}};break;}}}");
source=source.replace('reports.push({people,','reports.push({normalGetRetries,reauthentication:{...globalThis.__gd108Reauthentication.stats},people,');
assert(source.includes('phase=kind;const begin='));source=source.replace('phase=kind;const begin=',"phase=kind;await globalThis.__gd108Maintenance.boundary(kind,{activeClients:clients.length});const begin=");
assert(source.includes("phase='leased-sdk-snapshot';"));source=source.replace("phase='leased-sdk-snapshot';","phase='leased-sdk-snapshot';await globalThis.__gd108Maintenance.boundary('before-sdk',{activeClients:clients.length});");
source=source.replace('reports.push({normalGetRetries,','globalThis.__gd108Maintenance.observe(\'after-reception\');reports.push({normalGetRetries,');
source='import {setup} from '+JSON.stringify(new URL('setup.mjs',import.meta.url).href)+';\nimport {clockFetch as fetch} from '+JSON.stringify(new URL('../GD91-99/clock-transport.mjs',import.meta.url).href)+';\n'+source;
source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,original).href))
 .replace("from '../GD91-96/snapshot.mjs'",'from '+JSON.stringify(new URL('../GD91-105/snapshot.mjs',import.meta.url).href));
// 取得側にも同じ正式形式を使い、旧形式のセルIDを席IDとして扱わない。
source=source.replace(JSON.stringify(new URL('../GD91-96/snapshot.mjs',original).href),JSON.stringify(new URL('../GD91-105/snapshot.mjs',import.meta.url).href))
 .replace("new URL('../GD91-100/database.rules.json',import.meta.url)",`new URL(${JSON.stringify(new URL('../GD91-107/database.rules.json',import.meta.url).href)})`)
 .replace("['person-'+i,'cell-'+i]","['person-'+i,f.seatIds[i]]")
 .replace("row.seatId,'cell-'+j","row.seatId,f.seatIds[j]")
 .replace("new URL('artifacts/capacity-'+people+'-summary.json',import.meta.url)",`new URL(${JSON.stringify(result.href)})`)
 .replaceAll('import.meta.url',JSON.stringify(original.href)).replace('process.exit(process.exitCode??0);','');
assert(!source.includes("new URL('artifacts/"),'unredirected-result');
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const r=JSON.parse(fs.readFileSync(result));
// 古い試験のソース証拠と、実際に接続した形式・Rulesを区別して保持する。
const rebase=e=>Object.fromEntries(Object.entries(e).map(([f,h])=>['../GD91-101/'+f,h]));
r.sourceHashes={...rebase(r.sourceHashes),...before};r.endSourceHashes={...rebase(r.endSourceHashes),...hashes()};assert.deepEqual(r.sourceHashes,r.endSourceHashes);
r.executedRulesSource='../GD91-107/database.rules.json';r.layoutSchemaVersion=2;r.businessSchemaVersion=3;r.adaptedFrom='../GD91-101/capacity.mjs';
r.emulatorMaintenance=maintenance.stats;
fs.writeFileSync(result,JSON.stringify(r,null,2)+'\n');assert(!r.failure,JSON.stringify(r.failure));process.exit(process.exitCode??0);
