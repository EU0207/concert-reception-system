import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
for(const mode of ['node','browser']){
 for(const port of [8384,9494,4489,4589,9150,4891])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
 const child=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-center-gd91-140','--config','poc/GD91-140/firebase.json','--only','auth,firestore','node poc/GD91-140/local.mjs'+(mode==='browser'?' --browser':'')],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx4g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
 const [code]=await once(child,'exit');if(code!==0){process.exitCode=code;break;}
}
