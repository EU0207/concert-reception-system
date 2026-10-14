import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {slotsPerPart} from './layout-model.mjs';

// 相互排他の項目も同時に載せ、JSONエスケープを含む保守的な上界を作る。
const escaped=n=>'\u0000'.repeat(n), id='f'.repeat(64), number=Number.MAX_SAFE_INTEGER;
const item={id,cellId:id,seatId:id,sectionId:id,lineId:id,kind:'space',row:number,column:number,
  label:escaped(64),consumedNumber:number,numberingMode:'automatic',prefix:escaped(64),number,
  manualNumber:escaped(64),displayOrder:number,category:'reserved',usable:false,
  reservedLabel:escaped(100),emergencyChange:{kind:'position',reason:escaped(200)}};
const part={index:number,count:slotsPerPart,slots:Object.fromEntries(Array.from({length:slotsPerPart},(_,i)=>['s'+String(i).padStart(2,'0'),item]))};
const conservativePartJsonBytes=Buffer.byteLength(JSON.stringify(part));
assert(conservativePartJsonBytes<=65536,'full-layout-part-upper-bound');
const sourceHashes=Object.fromEntries(['bounds.mjs','layout-model.mjs','layout-rules.mjs','../GD91-84/generation-rules.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const report={sourceHashes,slotsPerPart,conservativePartJsonBytes,limitBytes:65536,optionalFieldsSimultaneouslyCounted:true,
  jsonEscapesCounted:true,source:'layout-rules.mjs field bounds; legacy label bound 64',
  productCellLimitApproved:false,fullBusinessFreeTierVerified:false};
fs.writeFileSync(new URL('artifacts/part-bound.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
