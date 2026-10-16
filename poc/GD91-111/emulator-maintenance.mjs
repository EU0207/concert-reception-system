import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {namespace,trial} from '../GD91-84/transport.mjs';import {owner,request,ok,metrics} from '../GD91-99/support.mjs';

// demo Emulatorの計測用。業務データを消さず、接続前の工程境界で評価系を再初期化する。
export function createEmulatorMaintenance(enabled){
 const stats={enabled,boundaries:[],observations:[],metrics:{requests:0,ownerRequests:0,userRequests:0,requestBodyBytes:0,responseBodyBytes:0}};
 if(!enabled)return{stats,boundary:async()=>{},observe:()=>{}};
 assert(namespace.startsWith('demo-'));assert(trial.startsWith('checks/'));
 const pwsh='C:\\Program Files\\PowerShell\\7\\pwsh.exe',powershell=command=>execFileSync(pwsh,['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true});
 const found=JSON.parse(powershell('Get-NetTCPConnection -LocalPort 9000 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ConvertTo-Json -Compress')),ids=Array.isArray(found)?found:[found];assert.equal(ids.length,1);const pid=String(ids[0]);assert(/^\d+$/.test(pid));assert.equal(powershell('(Get-Process -Id '+pid+').ProcessName').trim(),'java');
 const toolEnvironment={...process.env};delete toolEnvironment.JAVA_TOOL_OPTIONS;
 const jcmd=(...args)=>execFileSync('jcmd',[pid,...args],{encoding:'utf8',windowsHide:true,timeout:60000,stdio:['ignore','pipe','pipe'],env:toolEnvironment});
 const flags=/MaxHeapSize=(\d+)/.exec(jcmd('VM.flags'));assert(flags);stats.measuredMaxHeapBytes=Number(flags[1]);assert.equal(stats.measuredMaxHeapBytes,8589934592);
 const rules=JSON.parse(fs.readFileSync(new URL('./database.rules.json',import.meta.url))),deny=JSON.parse(fs.readFileSync(new URL('./deny.rules.json',import.meta.url)));
 stats.rulesHash=createHash('sha256').update(JSON.stringify(rules)).digest('hex');
 const heap=()=>{const m=/heap\s+total\s+(\d+)K,\s+used\s+(\d+)K/.exec(jcmd('GC.heap_info'));assert(m);return{usedBytes:Number(m[2])*1024,committedBytes:Number(m[1])*1024};};
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 async function boundary(stage,{activeClients}){
  assert(['register','bulkAssign','qrCreate','ticketCheck','before-sdk','preparation-batch','closing-prepare','closing-sources','closing-geometry','closing-facts'].includes(stage));assert.equal(activeClients,0,'live-sdk-maintenance-forbidden');
  const start={...metrics},began=Date.now(),data=await owner(trial);
  for(const ref of Object.values(data.references??{}))if('pendingOperationId'in ref)assert.equal(ref.pendingOperationId,'','unresolved-operation-maintenance-forbidden');
  const beforeHash=hash(data),prior=heap();assert.deepEqual((await request('.settings/rules',{token:'owner'})).body,rules);
  ok(await request('.settings/rules',{token:'owner',method:'PUT',body:deny}));ok(await request('.settings/rules',{token:'owner',method:'PUT',body:rules}));
  assert.deepEqual((await request('.settings/rules',{token:'owner'})).body,rules);assert.equal(hash(await owner(trial)),beforeHash,'maintenance-data-changed');jcmd('GC.run');const after=heap();
  for(const k of Object.keys(stats.metrics))stats.metrics[k]+=metrics[k]-start[k];assert.equal(metrics.userRequests,start.userRequests);
  const result={stage,applicationDataHashUnchanged:true,exactRulesRestored:true,usedBeforeGc:prior.usedBytes,usedAfterGc:after.usedBytes,elapsedMs:Date.now()-began};stats.boundaries.push(result);console.log(JSON.stringify({stage,emulatorMaintenance:true,usedAfterGc:after.usedBytes}));
 }
 function observe(stage){stats.observations.push({stage,...heap()});}
 return{stats,boundary,observe};
}

