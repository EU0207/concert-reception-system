import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';
const env={...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'};
async function run(args,extra={}){const child=spawn(process.execPath,args,{windowsHide:true,stdio:'inherit',env:{...env,...extra}}),[code]=await once(child,'exit');if(code)process.exit(code);}
await run(['poc/GD91-109/run-local.mjs','4','600','1000']);
const cli=['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-84','--config','poc/GD91-107/firebase.json','--only','auth,database'];
for(const script of['shape-local.mjs','read-boundary.mjs','retention-local.mjs'])await run([...cli,'node poc/GD91-109/'+script]);
for(const people of['4','1000'])await run([...cli,'node poc/GD91-109/late-edits.mjs'],{GD109_PEOPLE:people});
await run(['poc/GD91-109/draft-local.mjs']);execFileSync(process.execPath,['poc/GD91-109/audit.mjs'],{windowsHide:true,stdio:'inherit'});
