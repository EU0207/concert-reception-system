import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {generated} from './generate.mjs';

assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url))),generated());
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
for(const port of [9000,9191])await new Promise(resolve=>{
 const s=net.connect({host:'127.0.0.1',port});
 s.on('connect',()=>{s.destroy();assert.fail('port-in-use:'+port);});s.on('error',resolve);
});
const scripts=process.argv.slice(2);if(!scripts.length)scripts.push('retention-suite.mjs','collection-local.mjs');
assert(scripts.every(x=>['retention-suite.mjs','collection-local.mjs'].includes(x)));
const cli=spawn(process.execPath,['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-concert-seat-gd91-84','--config','poc/GD91-114/firebase.json','--only','auth,database',scripts.map(s=>'node poc/GD91-114/'+s).join(' && ')],{
 windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xmx8g',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}
});
const [code]=await once(cli,'exit');process.exitCode=code;
