import fs from 'node:fs';import assert from 'node:assert/strict';
const original=new URL('../GD91-72/tests/regression.mjs',import.meta.url);
let source=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n');
source="import './transport-hook.mjs';\n"+source.replace("'distribution.rules'","'index.rules'").replace("'tests/initial-support.mjs','node_modules", "'tests/initial-support.mjs','tests/transport-hook.mjs','projection.mjs','node_modules").replace(".map(p=>'../../GD91-72/'+p)",".map(p=>'../../GD91-73/'+p)");
fs.writeFileSync(new URL('tests/regression.mjs',import.meta.url),source);
let final=source.replace('const extra=current.concat','const extra=current.concat([\'../../GD91-73/tests/regression-final.mjs\']).concat')
 .replace(' const original=new URL'," if(process.env.GD91_RESUME==='1'&&gd>=68)continue;\n const original=new URL")
 .replace(' source=source.replace(/sources'," if(gd===67)source=source.replace(\"import {preserved,budgets} from '\"+new URL('budgets.mjs',import.meta.url).href+\"';\",\"import {preserved} from '\"+new URL('../../GD91-72/tests/budgets.mjs',import.meta.url).href+\"'; import {budgets} from '\"+new URL('budgets.mjs',import.meta.url).href+\"';\");\n source=source.replace(/sources");
fs.writeFileSync(new URL('tests/regression-final.mjs',import.meta.url),final);
const partialTransport=fs.readFileSync(new URL('tests/transport-hook.mjs',import.meta.url),'utf8').replace('   const previous=await original','   assignments??={};\n   const previous=await original');
fs.writeFileSync(new URL('tests/transport-partials.mjs',import.meta.url),partialTransport);
const remaining=source.replace("import './transport-hook.mjs';","import './transport-partials.mjs';").replace('const extra=current.concat',"const extra=current.concat(['../../GD91-73/tests/regression-remaining.mjs','../../GD91-73/tests/budget-compat.mjs','../../GD91-73/tests/transport-partials.mjs']).concat")
 .replace(' const original=new URL'," if(process.env.GD91_RESUME==='1'&&gd>=67)continue;\n const original=new URL")
 .replace("new URL('budgets.mjs',import.meta.url).href","new URL('budget-compat.mjs',import.meta.url).href");
fs.writeFileSync(new URL('tests/regression-remaining.mjs',import.meta.url),remaining);
// 認可回帰は既存ケース本体を保持し、送信時の索引を同じ候補へ接続する。
source=fs.readFileSync(new URL('../GD91-72/tests/access-regression.mjs',import.meta.url),'utf8');
source="import './transport-hook.mjs';\n"+source.replace("'distribution.rules'","'index.rules'").replace("'tests/access-regression.mjs'","'tests/access-regression.mjs','tests/transport-hook.mjs'").replace(".map(p=>'../../GD91-72/'+p)",".map(p=>'../../GD91-73/'+p)");
fs.writeFileSync(new URL('tests/access-regression.mjs',import.meta.url),source);
assert(source.includes('cases'));
source=fs.readFileSync(new URL('../GD91-72/tests/sdk.mjs',import.meta.url),'utf8');
source="import './transport-hook.mjs';\n"+source.replace('client,plan,send,inspect','client,preparePlan as plan,send,inspect');
source=source.replace("const role=await t.stored(geometry,'roles/'+geometry.person.uid)","const deniedPlan=await plan(geometry,denied.writes,denied.id);const role=await t.stored(geometry,'roles/'+geometry.person.uid)")
 .replace('send(gc,plan(geometry,denied.writes,denied.id))','send(gc,deniedPlan)');
source=source.replace(/(?<!await )\bplan\(/g,'await plan(');
source=source.replace("const sources=['sdk.mjs'","const sources=['transport-hook.mjs','../../GD91-72/sdk-adapter.mjs','sdk.mjs'");
source=source.replace('writes:o.writes.length','writes:p.writes.length,sourceProposalWrites:o.writes.length');
source=source.replace("await t.prepareFirst(f);await save(f,c,await t.firstPlan(f));","await t.prepareFirst(f);f.models[0].section.name='桟敷・親子エリア';f.models[0].section.stagePosition='left';await save(f,c,await t.firstPlan(f));const initialDisplay=await t.stored(f,'sectionDisplay/'+(await t.version(f)).sections[f.section]);assert.equal(initialDisplay.name,'桟敷・親子エリア');assert.equal(initialDisplay.stagePosition,'left');")
 .replace("const ext=await t.extension(geometry);","const priorDisplay=await t.stored(geometry,'sectionDisplay/'+(await t.version(geometry)).sections[geometry.section]);const ext=await t.extension(geometry);")
 .replace("geometry.models=[ext.model];","geometry.models=[ext.model];const nextDisplay=await t.stored(geometry,'sectionDisplay/'+(await t.version(geometry)).sections[geometry.section]);assert.equal(nextDisplay.name,priorDisplay.name);assert.equal(nextDisplay.stagePosition,priorDisplay.stagePosition);");
fs.writeFileSync(new URL('tests/sdk.mjs',import.meta.url),source);
source=fs.readFileSync(new URL('../GD91-72/tests/browser.mjs',import.meta.url),'utf8');
source="import './transport-hook.mjs';\n"+source.replace('client,plan,send,inspect','client,preparePlan as plan,send,inspect').replaceAll('GD91-72','GD91-73').replace(/\bplan\(/g,'await plan(');
source=source.replace("const sources=['browser.mjs'","const sources=['transport-hook.mjs','../../GD91-72/sdk-adapter.mjs','browser.mjs'");
fs.writeFileSync(new URL('tests/browser.mjs',import.meta.url),source);
for(const name of ['local-draft.mjs','browser.html','vite.config.mjs'])fs.writeFileSync(new URL(name,import.meta.url),fs.readFileSync(new URL('../GD91-72/'+name,import.meta.url),'utf8').replaceAll('GD91-72','GD91-73').replaceAll('gd91-72','gd91-73'));
