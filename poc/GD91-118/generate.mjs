import fs from 'node:fs';import assert from 'node:assert/strict';
const original=new URL('../GD91-109/late-edits.mjs',import.meta.url);let source=fs.readFileSync(original,'utf8');
function replace(a,b){assert.equal(source.split(a).length,2,'adaptation-target:'+a);source=source.replace(a,b);}
replace("from '../GD91-108/emulator-maintenance.mjs'","from '../GD91-117/emulator-maintenance.mjs'");
replace("JSON.parse(fs.readFileSync(new URL('../GD91-107/database.rules.json',import.meta.url)))",'generated()');
replace("const start=structuredClone(metrics),qrHash=", "globalThis.__gd118Meter.phase('register');const start=structuredClone(metrics),qrHash=");
replace(' let committed=false;'," globalThis.__gd118Meter.phase('bulkAssign');let committed=false;");
replace(" const x=proposal(m,f.state", " globalThis.__gd118Meter.phase('qrCreate');const x=proposal(m,f.state");
replace("finally{if(proxy)","finally{globalThis.__gd118Meter.phase('cleanup');if(proxy)");
replace("new URL('artifacts/late-edits-'+people+'-summary.json',import.meta.url)","new URL('artifacts/late-edits-'+people+'-summary.json',"+JSON.stringify(new URL('./',import.meta.url).href)+')');
source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,original).href));
source="import {generated} from "+JSON.stringify(new URL('../GD91-116/generate.mjs',import.meta.url).href)+";\n"+source;
source=source.replaceAll('import.meta.url',JSON.stringify(original.href));
fs.writeFileSync(new URL('late-edits.mjs',import.meta.url),source);
