import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createSection, numberInitial} from '../GD91-07/planner.mjs';
import {request, user, owner, trial, provision, issue, ok, metrics} from '../GD91-84/transport.mjs';
import {cleanup} from '../GD91-89/support.mjs';
import {encode, initialMeta, sectionPlan, partPlan, build, decode} from './layout-model.mjs';
import {publish} from '../GD91-84/generation-tests.mjs';
import {snapshot} from './snapshot.mjs';

const files = ['validate.mjs','layout-model.mjs','layout-rules.mjs','generate.mjs','snapshot.mjs','database.rules.json','../GD91-100/database.rules.json','../GD91-07/planner.mjs','../GD91-84/transport.mjs','../GD91-84/generation-tests.mjs','../GD91-89/support.mjs','../GD91-96/snapshot.mjs'];
const hashes = () => Object.fromEntries(files.map(f=>[f, createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const before = hashes(), reports = []; let stage = 'setup', clean, failure;
async function check(id, fn) {stage=id; reports.push({id,...await fn()}); console.log(JSON.stringify({id,passed:true}));}
const context = {maxCells: 100000};
function fixture(rows=2, columns=5) {
  const base = createSection({name:'区'.repeat(100), rows, columns, axis:'horizontal', seatOrder:'reverse', stagePosition:'top', lines:Array.from({length:rows},(_,i)=>({name:'列'+i,prefix:'A.'+i+'-',startNumber:1}))},context);
  const selected = {};for (const c of base.section.cells) if(c.column<2)selected[c.row+','+c.column]=c.column===0?'seat':'gap';
  const m = numberInitial(base,selected,context);
  if(columns>2){const c=m.section.cells.find(c=>c.row===0&&c.column===1);c.kind='seat';c.seatId=randomUUID();m.seats.push({seatId:c.seatId,sectionId:m.section.sectionId,lineId:m.section.lineSettings[0].lineId,numberingMode:'manual',manualNumber:'補助/1',category:'reserved',usable:true,reservedLabel:'架'.repeat(100),emergencyChange:{kind:'add',reason:'補'.repeat(200)}});}
  return m;
}

try {
  ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url)))}));
  await owner(trial+'/control','PUT',{state:'preparing',revision:1,layoutSchemaVersion:2});
  const manager=await provision('owner'), staff=await provision('receptionist');ok(await issue(manager));ok(await issue(staff));
  const send=async(p,method,body)=>{const r=await user(p,manager.device,method,body);ok(r);return r.body;};
  const m=fixture();let first;
  await check('F01-full-layout-normal-save-and-roundtrip',async()=>{first=await build(send,'full-first',[m]);ok(await user('',manager.device,'PATCH',publish('full-first',1)));const result=decode(first.sections,first.items,{});assert.deepEqual(result[0].section.cells,m.section.cells);assert.deepEqual(result[0].section.lineSettings,m.section.lineSettings);assert.equal(result[0].section.stagePosition,'top');for(const seat of m.seats){const actual=result[0].seats.find(s=>s.seatId===seat.seatId);for(const[k,v]of Object.entries(seat))assert.deepEqual(actual[k],v);}return{cells:m.section.cells.length,distinctCellAndSeatIds:true,allSeatFieldsRoundtripped:true};});
  await owner(trial+'/control','PUT',{state:'operating',revision:2,layoutSchemaVersion:2});
  await check('F02-reception-reads-full-model-without-private-person-data',async()=>{let reads=0;const read=async p=>{reads++;const r=await user(p,staff.device);ok(r);return r.body;};const a=await snapshot(read,async()=>({rows:{}}));assert.equal(Object.keys(a.cellsById).length,10);assert.equal(Object.keys(a.seatsById).length,3);assert.equal(a.models[0].seats.find(s=>s.numberingMode==='manual').emergencyChange.reason,'補'.repeat(200));const n=reads;const b=await snapshot(read,async()=>({rows:{}}),{cached:a});assert(b.cachedGeometryUsed);assert.equal(reads-n,2);assert.equal((await user('event/profiles',staff.device)).status,401);return{geometryReused:true,secondReadCalls:2,privateProfilesDenied:true};});
  async function prepared(id,model=m){const e=encode([model]);let meta=initialMeta(1,1);await send('generations/'+id+'/meta','PUT',meta);const [key,s]=Object.entries(e.sections)[0],p=sectionPlan(id,meta,key,s);await send('','PATCH',p);meta=p['generations/'+id+'/meta'];return{meta,items:e.items};}
  await check('F03-partial-index-and-coordinate-writes-rejected',async()=>{const f=await prepared('invalid-index'),body=partPlan('invalid-index',f.meta,f.items);let rejected=0;for(const k of Object.keys(body).filter(k=>/\/(cells|coordinates|numbers)\//.test(k))){const p={...body};delete p[k];assert.equal((await user('',manager.device,'PATCH',p)).status,401);rejected++;}return{omittedIndexesRejected:rejected};});
  await check('F04-out-of-range-and-conflicting-coordinate-rejected',async()=>{const f=await prepared('invalid-coordinate');for(const changed of [[{...f.items[0],row:2},...f.items.slice(1)],[f.items[0],{...f.items[1],row:f.items[0].row,column:f.items[0].column},...f.items.slice(2)]])assert.equal((await user('',manager.device,'PATCH',partPlan('invalid-coordinate',f.meta,changed))).status,401);return{rangeAndDuplicateCoordinatesRejected:true};});
  await check('F05-missing-cell-cannot-be-sealed',async()=>{const f=await prepared('incomplete'),p=partPlan('incomplete',f.meta,f.items.slice(0,-1));await send('','PATCH',p);const meta=p['generations/incomplete/meta'];assert.equal((await user('generations/incomplete/meta',manager.device,'PUT',{...meta,phase:'ready',revision:meta.revision+1})).status,401);return{incompleteGridRejected:true};});
  await check('F06-legacy-schema-bypass-rejected',async()=>{const legacy={kind:'layout',phase:'building',revision:1,cursor:0,expectedParts:1,lastPart:''};assert.equal((await user('generations/legacy-bypass/meta',manager.device,'PUT',legacy)).status,401);return{versionRequiredByControl:true};});
  await check('F07-numbering-and-emergency-contracts-rejected-when-invalid',async()=>{const f=await prepared('invalid-fields');for(const change of [{number:0},{prefix:'別の接頭部'},{emergencyChange:{kind:'add',reason:''}},{usable:'yes'},{cellId:'invalid'},{seatId:randomUUID()}]){const p=partPlan('invalid-fields',f.meta,[{...f.items[0],...change},...f.items.slice(1)]);assert.equal((await user('',manager.device,'PATCH',p)).status,401);}return{invalidFieldGroups:6};});
} catch(e) {failure={stage,code:e.code??'trial-failed'};console.error(e.stack);process.exitCode=1;}
finally {clean=await cleanup();}
assert.deepEqual(before,hashes());
fs.writeFileSync(new URL('artifacts/validate-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),reports,cleanup:clean,...(failure?{failure}:{}),metrics,formalLayoutSchemaConnected:true,publicationProtectionVerified:false,groupContractVerified:false,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,cleanup:clean,failure:failure??null}));process.exit(process.exitCode??0);
