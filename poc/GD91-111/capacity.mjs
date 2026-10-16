import fs from 'node:fs';import assert from 'node:assert/strict';import {sourceHashes} from '../GD91-105/source-audit.mjs';import {createReauthentication} from '../GD91-108/reauth.mjs';
import {createEmulatorMaintenance} from './emulator-maintenance.mjs';
const original=new URL('../GD91-101/capacity.mjs',import.meta.url),result=new URL('artifacts/capacity-'+(process.env.GD101_PEOPLE??'600')+'-summary.json',import.meta.url);
const hashes=()=>sourceHashes(new URL('./',import.meta.url),['capacity.mjs','setup.mjs','sdk-client.mjs','execute.mjs','run-capacity.mjs','generate.mjs','database.rules.json','emulator-maintenance.mjs','../GD91-101/capacity.mjs','../GD91-108/reauth.mjs','../GD91-105/snapshot.mjs']);const before=hashes();
const reauthentication=createReauthentication({afterMs:Number(process.env.GD108_REAUTH_AFTER_MS??600000)});
globalThis.__gd108Reauthentication=reauthentication;
const maintenance=createEmulatorMaintenance(process.env.GD108_EMULATOR_MAINTENANCE==='true');globalThis.__gd108Maintenance=maintenance;
let source=fs.readFileSync(original,'utf8');
source=source.replace('import {setup,cleanup,trial,owner,ok,metrics}', 'import {cleanup,trial,owner,ok,metrics}');
source=source.replace("import {bulk,command,applyModel} from '../GD91-92/model.mjs';", "import {bulk} from '../GD91-92/model.mjs';import {command,applyModel} from '../GD91-103/model.mjs';");
source=source.replace('console.error(e.stack);',"console.error(JSON.stringify({phase,code:e.code??e.name,message:e.message}));");
source=source.replace('async function commit(body){','async function commit(body){await globalThis.__gd108Reauthentication.ensure(m);');
source=source.replace('let clean,failure,phase=', 'let clean,failure,phase=');
source=source.replace("import {user,request} from '../GD91-99/support.mjs';", "import {user as ordinaryUser,request} from '../GD91-99/support.mjs';let normalGetRetries=0;async function user(p,d,method='GET',body){for(let attempt=0;;attempt++){try{return await ordinaryUser(p,d,method,body);}catch(e){if(method!=='GET'||e.name!=='TimeoutError'||attempt>=7)throw e;normalGetRetries++;}}}");
source=source.replace('clean=await cleanup();',"for(let attempt=0;;attempt++){try{clean=await cleanup();break;}catch(e){if(e.name!=='TimeoutError'||attempt>=3){clean={rulesClosed:false,trialRootEmpty:false,cleanupFailure:{code:e.code??e.name}};break;}}}");
source=source.replace('reports.push({people,','reports.push({normalGetRetries,reauthentication:{...globalThis.__gd108Reauthentication.stats},people,');
assert(source.includes('phase=kind;const begin='));source=source.replace('phase=kind;const begin=',"phase=kind;await globalThis.__gd108Maintenance.boundary(kind,{activeClients:clients.length});const begin=");
assert(source.includes("phase='leased-sdk-snapshot';"));source=source.replace("phase='leased-sdk-snapshot';","phase='leased-sdk-snapshot';await globalThis.__gd108Maintenance.boundary('before-sdk',{activeClients:clients.length});");

// 元の通常登録・6SDK受付に、台帳付きの端末登録と通常締めを接続する。
source=source.replace("import {client,wait} from '../GD91-89/sdk-client.mjs';","import {wait} from '../GD91-89/sdk-client.mjs';import {client as registeredClient} from "+JSON.stringify(new URL('sdk-client.mjs',import.meta.url).href)+";import {appendDevice} from "+JSON.stringify(new URL('registry.mjs',import.meta.url).href)+";import {executeClosing} from "+JSON.stringify(new URL('execute.mjs',import.meta.url).href)+";");
source=source.replace("const people=Number(selected),sections=people===1000?16:2","const people=Number(selected),sections=people===4?2:16");
source=source.replace("phase='leased-sdk-snapshot';", "const client=human=>registeredClient(human,async record=>{await globalThis.__gd108Reauthentication.ensure(m);const h=(await user('deviceRoster/meta',m.device)).body;ok(await user('',m.device,'PATCH',appendDevice(h,record)));});phase='leased-sdk-snapshot';");
source=source.replaceAll('people*2','f.cells.length').replace('nonSeatCells:people','nonSeatCells:f.cells.length-people');
source=source.replace('record=await refs.clearAcknowledged(m,p,record,ack);',"record=await refs.clearAcknowledged(m,p,record,ack);globalThis.__gd111PreparationCount=(globalThis.__gd111PreparationCount??0)+1;if(globalThis.__gd111PreparationCount%100===0)await globalThis.__gd108Maintenance.boundary('preparation-batch',{activeClients:clients.length});");
const closeCode=`
 phase='normal-closing';const closingSubjects=[m,f.staff,...clients],localQueues=new Map(clients.map((c,i)=>[c.device.uid,stores[i]]));for(const c of clients)await c.close();clients.length=0;
 const registered=await owner(trial+'/devices');assert.equal(Object.keys(registered).length,closingSubjects.length);assert.equal((await owner(trial+'/deviceRoster/meta')).count,closingSubjects.length);
 const oldControl=(await user('control',m.device)).body,stopped={...oldControl,state:'stopped',revision:oldControl.revision+1,endedAt:Date.now()};await owner(trial+'/control','PUT',stopped);await owner(trial+'/performanceFacts','PUT',{performanceName:'架'.repeat(100),venueName:'会'.repeat(100),venueAddress:'所'.repeat(200)});
 const closingStart=structuredClone(metrics),closedResult=await executeClosing({manager:m,subjects:closingSubjects,confirmations:{conflicts:true,paper:true,absences:true,devices:true},read:async p=>{const r=await user(p,m.device);ok(r);return r.body;},send:async body=>{await globalThis.__gd108Reauthentication.ensure(m);const r=await user('',m.device,'PATCH',body);ok(r);return r.body;},normal:(subject,p,method='GET',body)=>user(p,subject.device,method,body),assertLocalEmpty:async subject=>{const local=localQueues.get(subject.device.uid);if(local)assert.equal(local.state().queue.length,0);else if(subject===m)assert.equal((await owner(trial+'/references/'+m.referenceId)).pendingOperationId,'');},afterBoundary:async name=>{await globalThis.__gd108Reauthentication.ensure(m);await globalThis.__gd108Maintenance.boundary(name,{activeClients:0});}});
 assert.equal(closedResult.result.peopleCount,people);assert.equal(closedResult.result.arrived,people);assert.equal(closedResult.result.seatCount,people);assert.equal(closedResult.result.deviceCount,closingSubjects.length);assert.equal(closedResult.result.activeUnarrived,0);assert.equal((await owner(trial+'/control')).state,'closed');
 for(let i=0;i<people;i++){const fact=await owner(trial+'/actuals/person-'+i);assert.equal(fact.name,'架'.repeat(50));assert.equal(fact.arrived,true);assert.equal(fact.closeOperationId,closedResult.result.operationId);}
 let partitionTotal=0,partitionArrived=0;const totals=await owner(trial+'/actualTotals');for(const total of Object.values(totals)){partitionTotal+=total.total;partitionArrived+=total.arrived;}assert.equal(partitionTotal,people);assert.equal(partitionArrived,people);
 for(let i=0;i<queues.length;i++)await queues[i].release(closingSubjects[i+2]);
 const closingMeasurements=delta(closingStart,metrics),closing={people,registeredDevices:closingSubjects.length,normalRuntimeDeviceRegistration:true,bootstrapDevicesAndEndedControlSeeded:true,closedAndActualsNotSeeded:true,sourceEvents:people,geometryCells:f.cells.length,sections:f.models.length,partitions:Object.keys(totals).length,allNamesAndArrivalsPreserved:true,normalSdkReferencesReleased:true,result:closedResult.result,trace:closedResult.trace,requests:closingMeasurements,localStore:'RAM',fullBusinessFreeTierVerified:false};
 globalThis.__gd111Closing=closing;
`;
assert(source.includes('reports.push({normalGetRetries,'));source=source.replace('reports.push({normalGetRetries,',closeCode+'reports.push({closing:globalThis.__gd111Closing,normalGetRetries,');
source=source.replace('reports.push({normalGetRetries,','globalThis.__gd108Maintenance.observe(\'after-reception\');reports.push({normalGetRetries,');
source='import {setup} from '+JSON.stringify(new URL('setup.mjs',import.meta.url).href)+';\nimport {clockFetch as fetch} from '+JSON.stringify(new URL('../GD91-99/clock-transport.mjs',import.meta.url).href)+';\n'+source;
source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,original).href))
 .replace("from '../GD91-96/snapshot.mjs'",'from '+JSON.stringify(new URL('../GD91-110/layout.mjs',import.meta.url).href));
// 取得側にも同じ正式形式を使い、旧形式のセルIDを席IDとして扱わない。
source=source.replace(JSON.stringify(new URL('../GD91-96/snapshot.mjs',original).href),JSON.stringify(new URL('../GD91-105/snapshot.mjs',import.meta.url).href))
 .replace("new URL('../GD91-100/database.rules.json',import.meta.url)",`new URL(${JSON.stringify(new URL('./database.rules.json',import.meta.url).href)})`)
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
r.executedRulesSource='database.rules.json';r.layoutSchemaVersion=2;r.businessSchemaVersion=3;r.adaptedFrom='../GD91-101/capacity.mjs';
r.emulatorMaintenance=maintenance.stats;
fs.writeFileSync(result,JSON.stringify(r,null,2)+'\n');assert(!r.failure,JSON.stringify(r.failure));process.exit(process.exitCode??0);
