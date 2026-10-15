import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createSnapshotReader} from './snapshot.mjs';

// 元のケースを保持し、取得境界と途中結果の通知だけを差し替える。
const original = new URL('../GD91-105/cases.mjs', import.meta.url);
let source = fs.readFileSync(original, 'utf8');
source = source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g, (_, quote, path) => 'from '+JSON.stringify(new URL(path, original).href));
function replace(before, after) {
  assert.equal(source.split(before).length, 2, 'case-adaptation-target');
  source = source.replace(before, after);
}
replace('const reports=[];', 'const snapshot=io.snapshot;const reports=[];');
replace('reports.push({id,...facts});', 'reports.push({id,...facts});io.onReport?.({id,...facts,maxJsonNodes,maxRootJsonBytes});');
replace('const current=()=>snapshot(read,async()=>({rows:{}})),readStaff=()=>snapshot(p=>io.sdkRead(a,p),async()=>({rows:{}}));', 'const staffRead=p=>io.sdkRead(a,p),current=()=>snapshot(read,async()=>({rows:{}})),readStaff=()=>snapshot(staffRead,async()=>({rows:{}}));');
const adapted = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export const runCases = (io,m,a,options={}) => adapted.runCases({...io,snapshot:createSnapshotReader({enabled:options.cache!==false})},m,a,options);
