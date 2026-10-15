import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
const modes=process.argv.slice(2);assert(modes.length&&modes.every(x=>['full-history','compact-history','rules-control'].includes(x)));
assert(['4','1000'].includes(process.env.GD108_DIAGNOSTIC_PEOPLE??'1000'));
execFileSync(process.execPath,['poc/GD91-107/check-generation.mjs'],{stdio:'inherit',windowsHide:true});
for(const port of[9000,9191])await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);});
for(const mode of modes){
 const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-84','--config','poc/GD91-107/firebase.json','--only','auth,database','node poc/GD91-108/memory.mjs '+mode],{windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});
 const[code]=await once(cli,'exit');if(code){process.exitCode=code;break;}
}
