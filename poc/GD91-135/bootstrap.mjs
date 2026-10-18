import fs from 'node:fs';import assert from 'node:assert/strict';import {executionLog} from '../GD91-131/runtime-hook.mjs';
const raw=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(input);assert(['127.0.0.1','localhost'].includes(u.hostname)&&!['9000','9191'].includes(u.port),'unexpected-local-transport');return raw(input,init);};
try{await import('./numbering-regression.mjs');}finally{fs.writeFileSync(new URL('artifacts/execution-sources.json',import.meta.url),JSON.stringify(executionLog,null,2)+'\n');}
process.exit(process.exitCode??0);
