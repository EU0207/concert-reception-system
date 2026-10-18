import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
for(const port of [8281,9200,9391,4184])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
execFileSync(process.execPath,['poc/GD91-133/generate.mjs'],{windowsHide:true,stdio:'pipe'});
const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-60',
 '--config','poc/GD91-133/firebase.json','--only','auth,firestore,database','node poc/GD91-133/bootstrap.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
const[code]=await once(cli,'exit');process.exitCode=code;
