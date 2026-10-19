import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {once} from 'node:events';
for (const port of [9000, 9191]) await new Promise(resolve => {
  const socket = net.connect({host: '127.0.0.1', port});
  socket.on('connect', () => {socket.destroy(); assert.fail('port-in-use:' + port);});
  socket.on('error', resolve);
});
for (const file of ['local.mjs', 'rules.mjs', 'protocol.mjs', 'variables.mjs']) execFileSync(process.execPath, ['--check', 'poc/GD91-159/' + file], {windowsHide: true, stdio: 'pipe'});
const cli = spawn(process.execPath, ['poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js',
  'emulators:exec', '--project', 'demo-concert-seat-gd91-84', '--config', 'poc/GD91-148/firebase.json',
  '--only', 'auth,database', 'node poc/GD91-159/local.mjs'], {windowsHide: true, stdio: 'inherit',
  env: {...process.env, JAVA_TOOL_OPTIONS: '-Xmx8g', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true'}});
const [code] = await once(cli, 'exit'); process.exitCode = code;
