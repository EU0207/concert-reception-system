import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import assert from 'node:assert/strict';
for(const port of [9000,9191])await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.on('connect',()=>{socket.destroy();assert.fail('port-in-use:'+port);});socket.on('error',resolve);});
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-84',
  '--config','poc/GD91-116/firebase.json','--only','auth,database','node poc/GD91-126/local.mjs'],{
  windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
const[code]=await once(cli,'exit');process.exitCode=code;
