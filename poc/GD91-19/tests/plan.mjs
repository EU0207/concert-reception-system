import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend } from '../../GD91-07/planner.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project, initialHead } from '../../GD91-10/projection.mjs';
import { planSlide, PlanError } from '../plan.mjs';
const context={maxCells:10000},reports=[],sources=['../plan.mjs','plan.mjs','../../GD91-07/planner.mjs','../../GD91-08/slide.mjs','../../GD91-10/projection.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),clone=structuredClone;
function fixture({axis='horizontal',order='forward',direction='right',large=false,empty=false,manual=false}={}){
 let m=createSection({name:'架空区画',rows:large?30:4,columns:large?30:4,axis,seatOrder:order,lines:Array.from({length:large?30:4},(_,i)=>({name:`L${i}`}))},context);
 const selected=Object.fromEntries(m.section.cells.map(c=>[`${c.row},${c.column}`,empty||(!large&&(direction==='right'?c.column===3:direction==='left'?c.column===0:direction==='up'?c.row===0:c.row===3))?'unset':'seat']));
 m=numberInitial(m,selected,context);if(large)m=extend(m,{dimension:'columns',count:1},context).after;
 m.assignments=m.seats.slice(0,large?500:2).map((s,i)=>({seatId:s.seatId,attendeeId:`FAKE-person-${i}`,fixed:true}));
 m.ticketRefs=m.assignments.map((a,i)=>({attendeeId:a.attendeeId,ticketId:`FAKE-ticket-${i}`,credentialId:`FAKE-credential-${i}`}));
 m.receptionRefs=m.assignments.map((a,i)=>({attendeeId:a.attendeeId,receptionId:`FAKE-reception-${i}`}));
 if(m.seats.length)m.seats[0].emergencyChange={kind:'add',reason:'架空の補助席用途'};
 if(manual){Object.assign(m.seats[0],{numberingMode:'manual',manualNumber:'補助-1'});delete m.seats[0].number;delete m.seats[0].prefix;}
 const snapshot={schemaVersion:1,environmentId:'FAKE-test',performanceId:'FAKE-show',generation:randomUUID(),versions:{commit:1,layout:1,source:1,assignment:1,attendee:1,ticket:1,control:1},source:m,head:initialHead(m)};
 const command={operationId:randomUUID(),kind:'slide',environmentId:snapshot.environmentId,performanceId:snapshot.performanceId,expectedGeneration:snapshot.generation,expectedVersions:clone(snapshot.versions),direction,amount:1};
 return {snapshot,command,after:slide(m,command,context).after};
}
function check(id,description,action){action();reports.push({id,description,status:'passed'});}
function reject(f,code){const before=clone(f);assert.throws(()=>planSlide(f.snapshot,f.command,f.after,context),e=>e instanceof PlanError&&(!code||e.code===code));assert.deepEqual(f,before);}
let serial=0;for(const axis of ['horizontal','vertical'])for(const order of ['forward','reverse'])for(const direction of ['up','down','left','right'])check(`P${String(++serial).padStart(2,'0')}`,'軸・順序・方向を照合して移動量更新を選ぶ',()=>{const f=fixture({axis,order,direction}),before=clone(f),p=planSlide(f.snapshot,f.command,f.after,context);assert.equal(p.route,'offsetUpdate');assert(!Object.hasOwn(p,'reason'));assert(!Object.hasOwn(p,'cells'));assert.deepEqual(project(f.snapshot.source,{...f.snapshot.head,rowOffset:p.rowOffset,columnOffset:p.columnOffset},context),f.after);assert.deepEqual(f,before);});
for(const key of ['commit','layout','source','assignment','attendee','ticket','control'])check(`P${++serial}`,'期待版が一つでも古ければ拒否：'+key,()=>{const f=fixture();f.command.expectedVersions[key]++;reject(f,'STALE_BASE');});
const cases=[
 ['世代の違い',f=>f.command.expectedGeneration=randomUUID(),'STALE_BASE'],
 ['環境の違い',f=>f.command.environmentId='FAKE-other','WRONG_SCOPE'],
 ['公演の違い',f=>f.command.performanceId='FAKE-other','WRONG_SCOPE'],
 ['未対応の全差替え',f=>f.command.kind='replaceGeneration','UNSUPPORTED_OPERATION'],
 ['理由欄の混入',f=>f.command.reason='不要','INVALID_COMMAND'],
 ['未対応の保存形式',f=>f.snapshot.schemaVersion=2,'UNSUPPORTED_SNAPSHOT'],
 ['版の欠落',f=>delete f.command.expectedVersions.ticket,'INVALID_VERSIONS'],
 ['版の不正な数値',f=>f.command.expectedVersions.ticket=NaN,'INVALID_VERSIONS'],
 ['headと全体版の不一致',f=>f.snapshot.head.revision++,'INCONSISTENT_SNAPSHOT'],
 ['headと元構成版の不一致',f=>f.snapshot.head.sourceRevision++,'INCONSISTENT_SNAPSHOT'],
 ['無効な操作ID',f=>f.command.operationId='bad','INVALID_COMMAND'],
 ['参照データの未取得',f=>delete f.snapshot.source.ticketRefs,'INCOMPLETE_MODEL'],
 ['スライドの方向改変',f=>f.command.direction='diagonal','INVALID_LAYOUT_OR_SLIDE'],
 ['移動量の改変',f=>f.command.amount=2,'INVALID_LAYOUT_OR_SLIDE'],
 ['割当の消去',f=>f.after.assignments=[], 'UNEXPECTED_CHANGE'],
 ['QR参照の改変',f=>f.after.ticketRefs[0].credentialId='FAKE-other','UNEXPECTED_CHANGE'],
 ['来場参照の消去',f=>f.after.receptionRefs=[], 'UNEXPECTED_CHANGE'],
 ['席番号の改変',f=>f.after.seats[0].number++,null],
 ['緊急席の理由改変',f=>f.after.seats[0].emergencyChange.reason='別用途','UNEXPECTED_CHANGE'],
 ['区画名の同時変更',f=>f.after.section.name='別区画名','UNEXPECTED_CHANGE'],
 ['舞台の同時変更',f=>f.after.section.stagePosition='top','UNEXPECTED_CHANGE'],
 ['列の次番号改変',f=>f.after.section.lineSettings[0].nextAutomaticNumber++,'UNEXPECTED_CHANGE'],
 ['余分な更新の混入',f=>f.after.extra={value:true},'UNEXPECTED_CHANGE'],
 ['異なる移動案の混入',f=>f.after=clone(f.snapshot.source),'UNEXPECTED_CHANGE']
];
for(const [label,mutate,code]of cases)check(`P${++serial}`,label,()=>{const f=fixture();mutate(f);reject(f,code);});
check(`P${++serial}`,'外周の非未セルを拒否',()=>{const f=fixture({direction:'right'});f.command.direction='left';reject(f,'INVALID_LAYOUT_OR_SLIDE');});
check(`P${++serial}`,'全未は変更なし',()=>{const f=fixture({empty:true});assert.equal(planSlide(f.snapshot,f.command,f.after,context).route,'noChange');});
check(`P${++serial}`,'手入力席・既存理由と参照を計算上保持',()=>{const f=fixture({manual:true});assert.equal(planSlide(f.snapshot,f.command,f.after,context).route,'offsetUpdate');assert.equal(f.after.seats[0].manualNumber,'補助-1');});
check(`P${++serial}`,'セル・席・参照の配列順だけの違いを許容',()=>{const f=fixture();for(const a of [f.after.section.cells,f.after.section.lineSettings,f.after.seats,f.after.assignments,f.after.ticketRefs,f.after.receptionRefs])a.reverse();f.after.section.lineSettings.sort((a,b)=>a.index-b.index);assert.equal(planSlide(f.snapshot,f.command,f.after,context).route,'offsetUpdate');});
check(`P${++serial}`,'累積した移動量に一度だけ適用',()=>{const f=fixture();f.snapshot.head.columnOffset=1;f.snapshot.head.revision=2;f.snapshot.versions.commit=2;f.snapshot.versions.layout=2;f.command.expectedVersions=clone(f.snapshot.versions);f.command.direction='left';f.after=slide(project(f.snapshot.source,f.snapshot.head,context),f.command,context).after;const p=planSlide(f.snapshot,f.command,f.after,context);assert.equal(p.columnOffset,0);assert.deepEqual(project(f.snapshot.source,{...f.snapshot.head,columnOffset:p.columnOffset},context),f.after);});
check(`P${++serial}`,'930セル・500人の参照を保持し全複写の計画を作らない',()=>{const f=fixture({large:true}),before=clone(f),p=planSlide(f.snapshot,f.command,f.after,context);assert.equal(f.snapshot.source.section.cells.length,930);assert.equal(f.after.assignments.length,500);assert.equal(p.route,'offsetUpdate');assert(!Object.hasOwn(p,'cells'));assert(!Object.hasOwn(p,'generationData'));assert.deepEqual(f,before);});
const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/plan-summary.json',import.meta.url),JSON.stringify({runtime:process.version,executedAt:new Date().toISOString(),hashLineEndings:'LF',sourceHashes,endSourceHashes,scope:'Pure calculation of slide intent against a supplied complete snapshot. No network, authorization, server Rules, generation replacement, commit, QR validation, SDK, local storage or devices.',reports},null,2)+'\n');
console.log(JSON.stringify({scenarios:reports.length,passed:reports.length,serverOrDeviceTests:false}));
