import fs from 'node:fs';import net from 'node:net';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';
for(const port of [8181,9100,9291])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-60','--config','poc/GD91-144/firebase.json','--only','auth,firestore,database','node poc/GD91-144/bootstrap.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx4g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
const [code]=await once(cli,'exit');process.exitCode=code;
