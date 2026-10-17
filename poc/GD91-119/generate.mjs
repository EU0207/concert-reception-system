import fs from 'node:fs';import assert from 'node:assert/strict';
// 同じ業務ケースをローカルと承認後の外部試行へ接続する。
let local=fs.readFileSync(new URL('../GD91-111/common-local.mjs',import.meta.url),'utf8');
function replace(source,a,b){assert.equal(source.split(a).length,2,'adaptation-target:'+a);return source.replace(a,b);}
local=replace(local,"from './common-cases.mjs'","from './cases.mjs'");
local=replace(local,"sourceHashes(new URL('./',import.meta.url),['common-local.mjs','generate.mjs','database.rules.json'])","({...sourceHashes(new URL('./',import.meta.url),['local.mjs','cases.mjs','../GD91-116/generate.mjs']),'generate.mjs':createHash('sha256').update(fs.readFileSync(new URL('generate.mjs',import.meta.url),'utf8').replace(/\\r\\n/g,'\\n')).digest('hex')})");
local=replace(local,"JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url)))",'generated()');
local=replace(local,"'artifacts/common-local-summary.json'","'artifacts/local-summary.json'");
local=replace(local,'const hashes=()=>',"fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});const hashes=()=>");
local=replace(local,'provision,issue,ok}', 'provision,issue,ok,metrics}');
local=replace(local,'const io={','const startMetrics=structuredClone(metrics);let normalIoCalls=0,issueIoCalls=0,ownerIoCalls=0;const io={');
local=replace(local,"normal:(s,p,method='GET',body)=>{calls++;", "normal:(s,p,method='GET',body)=>{calls++;normalIoCalls++;");
local=replace(local,"owner:(p,method='GET',body)=>{calls++;", "owner:(p,method='GET',body)=>{calls++;ownerIoCalls++;");
local=replace(local,"issue:async s=>{calls++;", "issue:async s=>{calls++;issueIoCalls++;");
local=replace(local,"assert(calls+24+80<=600,'external-call-model-over-budget');", "const protocolExtraCalls=Math.max(0,metrics.userRequests-startMetrics.userRequests-normalIoCalls-issueIoCalls)+Math.max(0,metrics.ownerRequests-startMetrics.ownerRequests-ownerIoCalls);result.protocolExtraCallModel=protocolExtraCalls;calls+=protocolExtraCalls;assert(calls+24+80<=600,'external-call-model-over-budget');");
local="import {createHash} from 'node:crypto';import {generated} from '../GD91-116/generate.mjs';\n"+local;
fs.writeFileSync(new URL('local.mjs',import.meta.url),local);
let remote=fs.readFileSync(new URL('../GD91-111/remote-closing.mjs',import.meta.url),'utf8');
remote=replace(remote,"from './failure-diagnostic.mjs'","from '../GD91-111/failure-diagnostic.mjs'");
remote=replace(remote,"from './common-cases.mjs'","from './cases.mjs'");
remote=remote.replaceAll('TECH-DD91-103','TECH-DD91-109').replaceAll('TECH-DD91-104','TECH-DD91-109-DIAGNOSTIC-NOT-AUTHORIZED');
remote=replace(remote,'"fixtureMaxCellsPerGeneration":5','"fixtureMaxCellsPerGeneration":256');
remote=replace(remote,'"maxJsonNodes":4000','"maxJsonNodes":20000');
remote=replace(remote,'"exceptional-close-with-unknown-loss"]','"exceptional-close-with-unknown-loss","sixteen-sections-and-horizontal-vertical-256-lines","overflow-preserves-current-head"]');
remote=replace(remote,"purpose:'GD91-111-closing'","purpose:'GD91-119-upper-bound-and-closing'");
remote=replace(remote,"new URL('check-generation.mjs',import.meta.url)","new URL('../GD91-116/audit.mjs',import.meta.url)");
remote=replace(remote,"['remote-closing.mjs','common-cases.mjs','generate.mjs','check-generation.mjs','database.rules.json','deny.rules.json'","['remote.mjs','cases.mjs','../GD91-116/generate.mjs','../GD91-111/deny.rules.json'");
remote=replace(remote,"const before=hashes();", "const graphHashes=hashes;hashes=()=>({...graphHashes(),'generate.mjs':createHash('sha256').update(fs.readFileSync(new URL('generate.mjs',import.meta.url),'utf8').replace(/\\r\\n/g,'\\n')).digest('hex')});const before=hashes();");
remote=replace(remote,'const hashes=()=>','let hashes=()=>');
remote=replace(remote,"new URL('deny.rules.json',import.meta.url)","new URL('../GD91-111/deny.rules.json',import.meta.url)");
remote=replace(remote,"JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'))",'generated()');
remote=remote.replaceAll('artifacts/remote-closing-summary.json','artifacts/remote-summary.json');
remote="import {generated} from '../GD91-116/generate.mjs';\n"+remote;
// 新しい承認後の1試行だけを許可し、診断再試行の旧分岐を利用できないようにする。
remote=replace(remote,"const diagnostic=['--plan-diagnostic','--run-approved-closing-diagnostic'].includes(process.argv[2]);", "assert(!String(process.argv[2]??'').includes('diagnostic'),'diagnostic-retry-not-authorized');const diagnostic=false;");
remote=remote.replaceAll('--run-approved-closing','--run-approved-upper-bound-and-closing');
fs.writeFileSync(new URL('remote.mjs',import.meta.url),remote);
