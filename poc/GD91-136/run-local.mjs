import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import assert from 'node:assert/strict';
for(const port of [8381,9300,9491,4486,4586])await new Promise(resolve=>{
 const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);
});
const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-archive-gd91-136','--config','poc/GD91-136/firebase.json','--only','auth,firestore,database','node poc/GD91-136/local.mjs'],{
 windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx4g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}
});
const [code]=await once(cli,'exit');process.exitCode=code;
