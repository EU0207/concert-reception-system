// 指定したローカルCLIで、製品Rulesの直接要求を確認する。配備は行わない。
import { readFile, access, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

const project = 'demo-concert-reception-product';
const cli = process.env.FIREBASE_CLI_PATH;
if (!cli || !isAbsolute(cli))
  throw new Error('Set FIREBASE_CLI_PATH to the local firebase-tools 15.28.2 CLI file.');
await access(cli);
const metadata = JSON.parse(await readFile(resolve(dirname(cli), '../../package.json'), 'utf8'));
if (metadata.name !== 'firebase-tools' || metadata.version !== '15.28.2') {
  throw new Error(
    'Expected firebase-tools 15.28.2. Do not silently change the emulator tool version.',
  );
}

for (const port of [9100, 9291]) {
  await new Promise((resolvePromise, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error('Emulator port is already in use: ' + port));
    });
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') resolvePromise();
      else reject(error);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Cannot verify emulator port: ' + port));
    });
  });
}

await import('./build-database-rules.mjs');
// CLIは設定フォルダの外にあるRulesを読めないため、同じ生成物を試験用へ置く。
const artifactDirectory = resolve(import.meta.dirname, '../tests/emulator/artifacts');
await mkdir(artifactDirectory, { recursive: true });
await copyFile(
  resolve(import.meta.dirname, '../firebase/database.rules.json'),
  resolve(artifactDirectory, 'database.rules.json'),
);
const environment = {
  ...process.env,
  CI: 'true',
  FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
  JAVA_TOOL_OPTIONS: '-Xmx1024m',
};
for (const name of [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_PROJECT',
  'FIREBASE_CONFIG',
  'FIREBASE_TOKEN',
])
  delete environment[name];
const selection = process.argv.slice(2);
if (
  selection.length > 1 ||
  selection.some((value) => !['--link-rules-only', '--sdk-only'].includes(value))
) {
  throw Error('UNKNOWN_AUTHORIZATION_TEST_SELECTION');
}
// 確認済みの512設定を局所修正ごとに繰り返さないよう、固定の対象指定を用意する。
const command =
  selection[0] === '--link-rules-only'
    ? 'node --test --test-name-pattern=AUTH110-Q tests/emulator/authorization.test.mjs'
    : selection[0] === '--sdk-only'
      ? 'pnpm exec playwright test --config tests/emulator/playwright.config.mjs'
      : 'node --test tests/emulator/authorization.test.mjs && pnpm exec playwright test --config tests/emulator/playwright.config.mjs';
const child = spawn(
  process.execPath,
  [
    cli,
    'emulators:exec',
    '--project',
    project,
    '--config',
    'tests/emulator/firebase.json',
    '--only',
    'auth,database',
    command,
  ],
  {
    cwd: resolve(import.meta.dirname, '..'),
    windowsHide: true,
    stdio: 'inherit',
    env: environment,
  },
);
child.once('error', (error) => {
  throw error;
});
const [code] = await once(child, 'exit');
process.exitCode = code ?? 1;
