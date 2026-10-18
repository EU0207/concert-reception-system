import fs from 'node:fs';import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';import {buildRules} from '../GD91-139/generate.mjs';
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),buildRules());
for(const n of(process.argv.includes('--smoke')?[4]:[600,1000])){
 for(const port of [8385,9495,4490,4590,4892,9150])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
 const child=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-center-gd91-141','--config','poc/GD91-141/firebase.json','--only','auth,firestore','node poc/GD91-141/local.mjs --people='+n],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
 const[code]=await once(child,'exit');if(code!==0){process.exitCode=code;break;}
}
