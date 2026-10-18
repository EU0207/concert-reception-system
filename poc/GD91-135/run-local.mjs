import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
execFileSync(process.execPath,['poc/GD91-135/generate.mjs'],{windowsHide:true,stdio:'pipe'});
for(const port of[4181,9100,9291])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
const vite=spawn(process.execPath,['poc/POC-004/node_modules/vite/bin/vite.js','--config','poc/GD91-86/vite.config.mjs','--port','4181'],{windowsHide:true,stdio:'ignore'});
try{let ready=false;for(let i=0;i<80&&!ready;i++){try{ready=(await fetch('http://127.0.0.1:4181/poc/GD91-76/browser.html')).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,250));}assert(ready);
 const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-84','--config','poc/GD91-135/firebase.json','--only','auth,database','node poc/GD91-135/bootstrap.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});const[code]=await once(cli,'exit');process.exitCode=code;
}finally{execFileSync('taskkill',['/PID',String(vite.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
