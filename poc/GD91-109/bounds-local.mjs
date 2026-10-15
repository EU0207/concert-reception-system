import fs from 'node:fs';import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {request,user,owner,trial,provision,issue,ok,metrics} from '../GD91-99/support.mjs';
import {cleanup} from '../GD91-89/support.mjs';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {build,bounds} from '../GD91-104/geometry.mjs';
import {preparePublication} from '../GD91-104/slide.mjs';
import {snapshot} from '../GD91-105/snapshot.mjs';
import {initialMeta,sectionPlan,partPlan,encode} from '../GD91-102/layout-model.mjs';
import {createEmulatorMaintenance} from '../GD91-108/emulator-maintenance.mjs';

const files=['bounds-local.mjs','../GD91-107/database.rules.json','../GD91-108/emulator-maintenance.mjs'],hashes=()=>sourceHashes(new URL('./',import.meta.url),files),before=hashes();
const people=Number(process.env.GD109_PEOPLE??600);assert([4,600,1000].includes(people));
const candidates={sections:16,cells:people===4?64:4096,sectionName:100,lineName:64,prefix:48,displayNumber:64,reservedLabel:100,reason:200};
const reports=[],negative=[];let clean,failure,measurement;
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('../GD91-107/database.rules.json',import.meta.url)))}));
 const manager=await provision('owner');ok(await issue(manager));await owner(trial+'/control','PUT',{state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1});
 const maintenance=createEmulatorMaintenance(true),models=[];let left=people,maxWriteBytes=0;
 const send=async(p,method,body)=>{maxWriteBytes=Math.max(maxWriteBytes,Buffer.byteLength(JSON.stringify(body??null)));const r=await user(p,manager.device,method,body);assert.equal(r.status,200,'normal-request-failed:'+method+':'+p);return r.body;},read=p=>send(p,'GET');
 for(let i=0;i<candidates.sections;i++){
  const axis=i%2?'vertical':'horizontal',rows=people===4?1:8,columns=people===4?4:32,lines=Array.from({length:axis==='horizontal'?rows:columns},()=>({name:'界'.repeat(64),prefix:'界'.repeat(48),startNumber:9007199254740000}));
  const base=createSection({name:'区'.repeat(100),rows,columns,axis,seatOrder:i%4<2?'forward':'reverse',stagePosition:i%2?'left':'top',lines},{maxCells:4096});
  const n=Math.ceil(left/(16-i));left-=n;
  const model=numberInitial(base,Object.fromEntries(base.section.cells.map((c,j)=>[c.row+','+c.column,j<n?'seat':['unset','aisle','space','gap'][j%4]])),{maxCells:4096});
  for(const seat of model.seats){seat.reservedLabel='用'.repeat(100);seat.emergencyChange={kind:'add',reason:'架'.repeat(200)};}
  models.push(model);
 }
 assert.equal(left,0);assert.equal(models.flatMap(m=>m.seats).length,people);
 const start=structuredClone(metrics),layout=await build(send,'maximum',models);assert.equal(layout.meta.expectedParts,Math.ceil(candidates.cells/16));
 await maintenance.boundary('register',{activeClients:0});
 const checked=await preparePublication(read,send,manager,'maximum');await send('','PATCH',checked.publish(1));await send('','PATCH',checked.complete());
 const readStart=structuredClone(metrics),view=await snapshot(read,async()=>({rows:{}}));assert.equal(Object.keys(view.cells).length,candidates.cells);assert.equal(Object.keys(view.seatsById).length,people);assert.equal(view.models.length,16);
 const readEnd=structuredClone(metrics);let cacheReads=0;const cached=await snapshot(async p=>{if(p.startsWith('generations/'))cacheReads++;return read(p);},async()=>({rows:{}}),{cached:view});assert(cached.cachedGeometryUsed);assert.equal(cacheReads,0);
 for(const expected of layout.items)assert.deepEqual(view.cells[expected.id],expected);
 reports.push({id:'M01',cells:candidates.cells,seats:people,sections:16,parts:layout.meta.expectedParts,bothAxes:true,bothOrders:true,longestAutomaticLabel:Math.max(...Object.values(view.cells).map(c=>c.label.length)),allCellFieldsPreserved:true,cachedGenerationReads:cacheReads});
 // 通常管理経路へ上限超過を直接送信し、拒否時に既存公開を保持する。
 // 元の行に合わせた小さな有効モデルを別途作る。
 const small=numberInitial(createSection({name:'区'.repeat(100),rows:1,columns:1,axis:'horizontal',seatOrder:'forward',lines:[{name:'列'.repeat(64),prefix:'A-',startNumber:1}]},{maxCells:1}),{'0,0':'seat'},{maxCells:1});
 const encoded=encode([small]),sectionId=small.section.sectionId;encoded.sections[sectionId].bounds=bounds(small);
 const newMeta=()=>({...initialMeta(1,1),auditVersion:1,geometryCursor:0,lastGeometrySection:''});
 for(const [i,field,value]of[[0,'name','区'.repeat(101)],[1,'lineName','列'.repeat(65)],[2,'prefix','A'.repeat(65)]]){
  const generation='invalid-section-'+i,meta=newMeta();await send('generations/'+generation+'/meta','PUT',meta);const section=structuredClone(encoded.sections[sectionId]);if(field==='name')section.name=value;else section.lines[small.section.lineSettings[0].lineId][field==='lineName'?'name':field]=value;
  const oldHead=await read('head'),response=await user('',manager.device,'PATCH',sectionPlan(generation,meta,sectionId,section));assert.equal(response.status,401);assert.deepEqual(await read('head'),oldHead);assert.equal(await read('generations/'+generation+'/sections/'+sectionId),null);negative.push({field,rejected:true,existingHeadUnchanged:true});
 }
 for(const [i,field,value]of[[0,'label','番'.repeat(65)],[1,'reservedLabel','用'.repeat(101)],[2,'reason','由'.repeat(201)]]){
  const generation='invalid-cell-'+i;let meta=newMeta();await send('generations/'+generation+'/meta','PUT',meta);const body=sectionPlan(generation,meta,sectionId,encoded.sections[sectionId]);await send('','PATCH',body);meta=body['generations/'+generation+'/meta'];const item=structuredClone(encoded.items[0]);if(field==='label'){item.label=value;item.numberingMode='manual';item.manualNumber=value;delete item.prefix;delete item.number;}else if(field==='reason')item.emergencyChange={kind:'add',reason:value};else item[field]=value;
  const oldHead=await read('head'),response=await user('',manager.device,'PATCH',partPlan(generation,meta,[item]));assert.equal(response.status,401);assert.deepEqual(await read('head'),oldHead);assert.equal(await read('generations/'+generation+'/parts/p0'),null);negative.push({field,rejected:true,existingHeadUnchanged:true});
 }
 await maintenance.boundary('before-sdk',{activeClients:0});
 // 読取予算を越える目録はデータ本体を取得する前に止める。
 let partReads=0;await assert.rejects(()=>snapshot(async p=>p==='head'?view.head:p.endsWith('/meta')?{...layout.meta,expectedParts:257}:(partReads++,null),async()=>({rows:{}})),/snapshot-part-limit/);assert.equal(partReads,0);negative.push({field:'257thPart',readerRejectedBeforePartRead:true,serverLimitVerified:false});
 const root=await owner(trial);measurement={maxWriteJsonBytes:maxWriteBytes,rootJsonBytes:Buffer.byteLength(JSON.stringify(root)),generationJsonBytes:Buffer.byteLength(JSON.stringify(root.generations.maximum)),snapshotRequests:readEnd.userRequests-readStart.userRequests,snapshotResponseBodyBytes:readEnd.responseBodyBytes-readStart.responseBodyBytes,normalRequestsIncludingNegativeTests:metrics.userRequests-start.userRequests,maintenance:maintenance.stats};
}catch(e){failure={code:e.code??e.name,message:e.message};console.error(JSON.stringify(failure));process.exitCode=1;}finally{clean=await cleanup();}
assert.deepEqual(before,hashes());fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/bounds-'+people+'-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),people,candidates,reports,negative,measurement,cleanup:clean,...(failure?{failure}:{}),productLimitsApproved:false,realSdkUsed:false,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false},null,2)+'\n');console.log(JSON.stringify({people,groups:reports.length,negative:negative.length,failure:failure??null,cleanup:clean}));
