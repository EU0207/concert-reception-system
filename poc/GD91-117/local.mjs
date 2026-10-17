import fs from 'node:fs';import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {request,user,owner,trial,provision,issue,ok,metrics} from '../GD91-99/support.mjs';
import {cleanup} from '../GD91-89/support.mjs';
import {preparePublication} from '../GD91-104/slide.mjs';
import {build,snapshot} from '../GD91-116/layout.mjs';
import {generated} from '../GD91-116/generate.mjs';
import {createEmulatorMaintenance} from './emulator-maintenance.mjs';
import {modelsFor} from './models.mjs';
const people=Number(process.env.GD117_PEOPLE);assert([600,1000].includes(people));
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['local.mjs','models.mjs','emulator-maintenance.mjs','generate.mjs']);
const before=hashes();let clean,failure,result,stage='setup',lastRequest=null;
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:generated()}));
 const manager=await provision('owner');ok(await issue(manager));
 await owner(trial+'/control','PUT',{state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1});
 const models=modelsFor(people),maintenance=createEmulatorMaintenance(true);let maxWriteBytes=0,builtParts=0;
 const send=async(p,method,body)=>{
  lastRequest={path:p,method};maxWriteBytes=Math.max(maxWriteBytes,Buffer.byteLength(JSON.stringify(body??null)));
  const r=await user(p,manager.device,method,body);ok(r);
  if(stage==='build'&&method==='PATCH'&&Object.keys(body).some(k=>/^generations\/maximum\/parts\/p\d+$/.test(k))){
   builtParts++;if(builtParts%64===0)await maintenance.boundary('preparation-batch',{activeClients:0});
  }
  return r.body;
 },read=p=>send(p,'GET'),start=structuredClone(metrics);
 stage='build';const layout=await build(send,'maximum',models);assert.equal(builtParts,256);
 await maintenance.boundary('before-sdk',{activeClients:0});
 stage='publish';const checked=await preparePublication(read,send,manager,'maximum');
 await send('','PATCH',checked.publish(1));await send('','PATCH',checked.complete());
 stage='read';const rs=structuredClone(metrics),view=await snapshot(read,async()=>({rows:{}})),re=structuredClone(metrics);
 assert.equal(view.models.length,16);assert.equal(Object.keys(view.cells).length,4096);assert.equal(Object.keys(view.seatsById).length,people);
 for(const m of view.models)assert.equal(m.section.lineSettings.length,256);
 for(const item of layout.items)assert.deepEqual(view.cells[item.id],item);
 const labels=Object.values(view.cells).filter(x=>x.kind==='seat').map(x=>x.label);assert.equal(new Set(labels).size,people);assert(labels.every(x=>x.length===64));
 let cachedGenerationReads=0;const cached=await snapshot(async p=>{if(p.startsWith('generations/'))cachedGenerationReads++;return read(p);},async()=>({rows:{}}),{cached:view});
 assert(cached.cachedGeometryUsed);assert.equal(cachedGenerationReads,0);
 const root=await owner(trial);
 result={people,sections:16,numberingLinesPerSection:256,totalNumberingLines:4096,cells:4096,seatRecords:people,attendeeRecords:0,
  nonSeatCells:4096-people,parts:256,bothAxes:true,bothOrders:true,allCellFieldsPreserved:true,uniqueLabels:true,
  maxWriteJsonBytes:maxWriteBytes,generationJsonBytes:Buffer.byteLength(JSON.stringify(root.generations.maximum)),rootJsonBytes:Buffer.byteLength(JSON.stringify(root)),
  snapshotRequests:re.userRequests-rs.userRequests,snapshotResponseBodyBytes:re.responseBodyBytes-rs.responseBodyBytes,
  normalRequests:metrics.userRequests-start.userRequests,cachedGenerationReads,maintenance:maintenance.stats};
}catch(e){failure={stage,lastRequest,code:e.code??e.name,message:e.message};console.error(JSON.stringify(failure));process.exitCode=1;}finally{clean=await cleanup();}
assert.deepEqual(before,hashes());fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/maximum-'+people+'-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),result,cleanup:clean,...(failure?{failure}:{}),
 limitsApproval:'TECH-DD91-108-A',externalFirebaseConnected:false,realSdkUsed:false,fullBusinessFreeTierVerified:false,productionImplementation:false,tested3000People:false},null,2)+'\n');
console.log(JSON.stringify({people,complete:!failure,failure:failure??null,cleanup:clean}));
