import fs from 'node:fs';import {generated} from './generate.mjs';
import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
const people=process.argv.slice(2);assert(people.length&&people.every(x=>['4','600','1000'].includes(x)));
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url))),generated());
for(const port of[4181,9000,9191])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
const vite=spawn(process.execPath,['poc/POC-004/node_modules/vite/bin/vite.js','--config','poc/GD91-86/vite.config.mjs','--port','4181'],{windowsHide:true,stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<80&&!ready;i++){try{ready=(await fetch('http://127.0.0.1:4181/poc/GD91-76/browser.html')).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,250));}assert(ready);
 for(const count of people){const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-84','--config','poc/GD91-111/firebase.json','--only','auth,database','node poc/GD91-111/capacity.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,GD101_PEOPLE:count,GD108_EMULATOR_MAINTENANCE:'true',JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});const[code]=await once(cli,'exit');if(code){process.exitCode=code;break;}}
}finally{execFileSync('taskkill',['/PID',String(vite.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
