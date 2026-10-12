import fs from 'node:fs';import assert from 'node:assert/strict';import {digest} from './meter.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('artifacts/'+n+'.json',import.meta.url)));
const m=read('measurement'),r=read('retention'),a=read('analysis');let hashes=0;
for(const x of [m,r]){assert.deepEqual(x.sourceHashes,x.endSourceHashes);for(const[p,h]of Object.entries(x.sourceHashes)){assert.equal(digest(new URL(p,import.meta.url)),h);hashes++;}}
for(const[p,h]of Object.entries(a.sources)){assert.equal(digest(new URL(p,import.meta.url)),h);hashes++;}
assert.equal(m.reports.length,2);assert.deepEqual(m.reports.map(x=>x.people),[10,500]);assert(m.reports.every(x=>x.status==='passed'));
assert.equal(r.reports.length,7);assert(r.reports.every(x=>x.status==='passed'));assert.equal(r.positiveDeletionImplemented,false);
assert.equal(a.ruleHash,m.sourceHashes['../GD91-73/node_modules/.cache/firestore.rules']);assert.equal(a.ruleHash,r.sourceHashes['../GD91-73/node_modules/.cache/firestore.rules']);
const totals={};for(const n of [10,500]){const phases=Object.entries(m.phases).filter(([k])=>k.startsWith(n+'/'));totals[n]=Object.fromEntries(['requests','reads','writes'].map(k=>[k,phases.reduce((s,[,p])=>s+p.normal[k],0)]));}
assert.equal(totals[500].writes,6799);assert.equal(m.phases['500/public-download'].normal.reads,2006);assert.equal(m.phases['500/allocation-confirm'].normal.writes,4);
assert.equal(a.capacity.find(x=>x.cells===10000&&x.seats===500).constructionMinimumWrites,55500);
console.log(JSON.stringify({scenarios:9,sourceHashesVerified:hashes,sameApprovedV2Rules:true,totals,staticGatePassed:false,reclamationImplemented:false}));
