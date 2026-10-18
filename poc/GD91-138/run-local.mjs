import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
for(const port of [8382,9492,4487,4587,9150])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
execFileSync(process.execPath,['poc/GD91-138/generate.mjs'],{windowsHide:true,stdio:'pipe'});
const child=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-center-gd91-138','--config','poc/GD91-138/firebase.json','--only','auth,firestore','node poc/GD91-138/local.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx4g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
const [code]=await once(child,'exit');process.exitCode=code;
