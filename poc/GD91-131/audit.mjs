import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {generated} from '../GD91-126/contract-rules.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),digest=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex'),fileHash=p=>digest(fs.readFileSync(new URL(p,root),'utf8'));
const rules=read('database.rules.json');assert.deepEqual(rules,generated());
const scopes=[['section',18],['section-common',4],['geometry-slide',9],['structural',9],['display-common',4],['groups',19],['groups-common',8],['layout',21],['layout-common',8],['closed',20],['closed-common',12],['quarantine',13],['sharing',14],['manager',12],['queue',12],['general',4],['clock',7],['review',16],['common',6],['read-budget',4]];
const savedHook=fileHash('artifacts/runtime-hook-v1.mjs');let comparisons=0,historicalHookComparisons=0;
for(const[label,count]of scopes){const r=read('artifacts/regression-'+label+'-summary.json');assert(!r.failure,label);assert.equal((r.reports??r.runs).length,count,label);
 assert.deepEqual(r.sourceHashes,r.endSourceHashes);for(const[p,h]of Object.entries(r.sourceHashes)){
  if(p==='runtime-hook.mjs'&&h===savedHook){historicalHookComparisons++;}else assert.equal(fileHash(p),h,p);comparisons++;
 }
 if(r.cleanup)assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty,label);
 for(const run of r.runs??[])assert(run.cleanup.rulesClosed&&run.cleanup.trialRootEmpty,label);
 if(label==='read-budget'){assert.equal(r.runs[1].failure.code,'APPLICATION_BUDGET');assert(!r.runs[0].failure&&!r.runs[2].failure&&!r.runs[3].failure);}
 assert.equal(r.executedRulesSource,'database.rules.json');
}
let loadedModules=0,adaptedCodeFixtures=0;
for(const version of[1,2])for(const item of read('artifacts/execution-sources-v'+version+'.json')){
 if(item.source.startsWith('inline:'))continue;
 const text=fs.readFileSync(new URL('../'+item.source,root),'utf8');assert.equal(digest(text),item.originalHash,item.source);
 let transformed=text.replace(/\b9000\b/g,'9100').replace(/\b9191\b/g,'9291');
 if(version===2&&item.source==='GD91-97/common-cases.mjs'){transformed=transformed.replace("code:'10000000'","code:'ABCD2345'").replace("code:'10000001'","code:'ABCD2346'");adaptedCodeFixtures++;}
 assert.equal(digest(transformed),item.executedHash,item.source);loadedModules++;
}
assert(adaptedCodeFixtures===1);assert(historicalHookComparisons===15);
const v1=read('artifacts/execution-sources-v1.json'),v2=read('artifacts/execution-sources-v2.json');assert(v1.some(x=>x.source==='GD91-131/qr-model.mjs'));assert(v2.some(x=>x.source==='GD91-131/qr-model.mjs'));
const old=read('artifacts/first-general-failure.json');assert(old.failure&&old.cleanup.rulesClosed&&old.cleanup.trialRootEmpty);
const result={sourceComparisons:comparisons,loadedFileModulesCompared:loadedModules,historicalHookComparisons,historicalHookSnapshot:'artifacts/runtime-hook-v1.mjs',
 groups:scopes.reduce((n,[,c])=>n+c,0),previousGroups:183,resumedGroups:37,legacyBusinessGroups:216,readBudgetComparisons:4,positiveCodeFixturesAdapted:2,
 rulesExactlyMatch126:true,earlierFailedScopeExcluded:true,currentSourceEvidenceChecked:true,externalFirebaseConnected:false,productionImplementation:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
