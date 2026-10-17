import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {installMeter} from '../GD91-115/meter.mjs';
import {generated} from '../GD91-116/generate.mjs';
const people=Number(process.env.GD109_PEOPLE);assert([600,1000].includes(people));
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['local.mjs','generate.mjs','late-edits.mjs','../GD91-109/late-edits.mjs','../GD91-117/emulator-maintenance.mjs','../GD91-116/generate.mjs','../GD91-115/meter.mjs']);
const before=hashes(),meter=installMeter();globalThis.__gd118Meter=meter;
try{await import('./late-edits.mjs');}finally{meter.restore();}
const result=new URL('artifacts/late-edits-'+people+'-summary.json',import.meta.url),r=JSON.parse(fs.readFileSync(result));
const rebase=o=>Object.fromEntries(Object.entries(o).map(([p,h])=>['../GD91-109/'+p,h]));
r.sourceHashes={...rebase(r.sourceHashes),...before};r.endSourceHashes={...rebase(r.endSourceHashes),...hashes()};assert.deepEqual(r.sourceHashes,r.endSourceHashes);
r.restMeter=meter.snapshot();r.phaseMapping={register:'E01-invalid-partial-and-duplicate',bulkAssign:'E02-response-loss-and-result-lookup',qrCreate:'E03-concurrent-exchange'};
r.executedRulesSource='../GD91-116/generate.mjs';r.executedRulesHash=createHash('sha256').update(JSON.stringify(generated())).digest('hex');r.productionImplementation=false;
fs.writeFileSync(result,JSON.stringify(r,null,2)+'\n');assert(!r.failure,JSON.stringify(r.failure));
