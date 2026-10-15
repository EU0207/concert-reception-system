import fs from 'node:fs';import assert from 'node:assert/strict';
const original=new URL('validate.mjs',import.meta.url);let source=fs.readFileSync(original,'utf8');
source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,quote,path)=>'from '+JSON.stringify(new URL(path==='./cases.mjs'?'./common-cases.mjs':path,original).href));
source='import {createBudget} from '+JSON.stringify(new URL('../GD91-106/budget.mjs',import.meta.url).href)+';\n'+source;
function replace(a,b){assert.equal(source.split(a).length,2,'budget-adaptation-target');source=source.replace(a,b);}
replace("['validate.mjs'","['common-budget.mjs','common-cases.mjs','../GD91-106/budget.mjs','validate.mjs'");
replace(' const io={',' const meter=createBudget({initial:18,limit:300,reserve:60,enforce:true});const io={');
replace(' result=await runCases(io,m,a);',` const counted={...io,onReport:r=>progress.push({...r,applicationCalls:meter.summary().calls})};for(const key of['reset','owner','normal','issue','sdkRead','sdkWrite'])counted[key]=(...args)=>{meter.count(key,typeof args[0]==='string'?args[0]:'');return io[key](...args);};result=await runCases(counted,m,a);result.applicationBudget=meter.summary();`);
replace("'artifacts/validate-summary.json'","'artifacts/common-budget-summary.json'");source=source.replaceAll('import.meta.url',JSON.stringify(original.href));await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
