import fs from 'node:fs';import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';import {rules} from './rules.mjs';
for(const mode of ['center','archive']){
 for(const port of [8386,9496,4491,4591,9150])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
 fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules(mode));
 const child=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-authorization-gd91-142','--config','poc/GD91-142/firebase.json','--only','auth,firestore','node poc/GD91-142/local.mjs --mode='+mode],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx4g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
 const[code]=await once(child,'exit');if(code!==0){process.exitCode=code;break;}
}
