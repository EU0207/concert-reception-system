import fs from 'node:fs';
import {accessRules,authorized,manager,recentManager,temporary,activeRead,editing} from './auth-rules.mjs';
import {generationRules,publicationRules} from './generation-rules.mjs';
import {sharedRules} from './shared-rules.mjs';

const rules={rules:{'.read':false,'.write':false,checks:{$run:{...accessRules(),...publicationRules(),generations:generationRules(),
  probes:{general:{'.read':activeRead},management:{'.read':manager},sensitive:{'.read':recentManager},temporary:{'.read':temporary},
    edit:{'.write':`${editing} && newData.isString()`}},
  view:{'.read':activeRead},private:{'.read':manager},shared:{'.read':manager},...sharedRules()}}}};
fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
fs.writeFileSync(new URL('deny.rules.json',import.meta.url),JSON.stringify({rules:{'.read':false,'.write':false}},null,2)+'\n');
console.log(JSON.stringify({generated:true,authBinding:true,externalConnection:false}));
