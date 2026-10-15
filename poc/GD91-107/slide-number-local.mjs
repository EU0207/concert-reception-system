import fs from 'node:fs';import assert from 'node:assert/strict';
const original=new URL('cases.mjs',import.meta.url);let cases=fs.readFileSync(original,'utf8');
cases=cases.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,quote,path)=>'from '+JSON.stringify(new URL(path,original).href));
function replace(a,b){assert.equal(cases.split(a).length,2,'slide-adaptation-target');cases=cases.replace(a,b);}
cases='import {command as slide} from '+JSON.stringify(new URL('../GD91-104/slide.mjs',import.meta.url).href)+';\n'+cases;
replace('const model=numberInitial','let model=numberInitial');replace('rows:2,columns:3,axis','rows:4,columns:5,axis');replace("length:axis==='horizontal'?2:3","length:axis==='horizontal'?4:5");
replace('  return{model,control,head,ticket:',`  const slideHead=await read('head'),slideBody=slide(m,state,slideHead,model,null,'right'),slideEvent=Object.fromEntries(Object.entries(slideBody).filter(([key])=>key.startsWith('event/')).map(([key,value])=>[key.slice(6),value])),slidePending=prepare(m,slideEvent);reference=await refs.reserveKnown(m,slidePending,reference);await send('','PATCH',slideBody);applyModel(state,slideEvent);reference=await refs.clearAcknowledged(m,slidePending,reference,{status:200,body:{['operations/'+slidePending.operationId]:await read('event/operations/'+slidePending.operationId)}});model=(await snapshot(read,async()=>({rows:{}}))).models[0];
  return{model,control,head:await read('head'),ticket:`);
replace("for(const axis of['horizontal','vertical'])for(const seatOrder of['forward','reverse'])for(const dimension of['rows','columns'])for(const stagePosition of['left','top'])", "for(const axis of['horizontal'])for(const seatOrder of['forward'])for(const dimension of['columns'])for(const stagePosition of['left'])");
replace("await report('N01-terminal-numbering-profiles'","await report('N15-slide-then-terminal-numbering'");
cases=cases.replace('if(!minimal)await runNegatives','if(false)await runNegatives');
const caseUrl='data:text/javascript;base64,'+Buffer.from(cases).toString('base64');let runner=fs.readFileSync(new URL('validate.mjs',import.meta.url),'utf8');
runner=runner.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,quote,path)=>'from '+JSON.stringify(path==='./cases.mjs'?caseUrl:new URL(path,original).href));
runner=runner.replace("['validate.mjs'","['slide-number-local.mjs','run-extra.mjs','validate.mjs'").replace("'artifacts/validate-summary.json'","'artifacts/slide-number-summary.json'").replaceAll('import.meta.url',JSON.stringify(new URL('validate.mjs',import.meta.url).href));
await import('data:text/javascript;base64,'+Buffer.from(runner).toString('base64'));
