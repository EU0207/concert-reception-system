import fs from 'node:fs';import assert from 'node:assert/strict';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const original=new URL('../GD91-101/capacity.mjs',import.meta.url),result=new URL('artifacts/capacity-'+(process.env.GD101_PEOPLE??'600')+'-summary.json',import.meta.url);
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['capacity.mjs','setup.mjs','run.mjs','../GD91-101/capacity.mjs','../GD91-107/database.rules.json','../GD91-107/check-generation.mjs']);const before=hashes();
let source=fs.readFileSync(original,'utf8');
source=source.replace('import {setup,cleanup,trial,owner,ok,metrics}', 'import {cleanup,trial,owner,ok,metrics}');
source=source.replace("import {bulk,command,applyModel} from '../GD91-92/model.mjs';", "import {bulk} from '../GD91-92/model.mjs';import {command,applyModel} from '../GD91-103/model.mjs';");
source=source.replace('console.error(e.stack);',"console.error(JSON.stringify({phase,code:e.code??e.name,message:e.message}));");
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
fs.writeFileSync(result,JSON.stringify(r,null,2)+'\n');assert(!r.failure,JSON.stringify(r.failure));process.exit(process.exitCode??0);
