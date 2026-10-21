// 架空データ専用の設定を作る。既存設定は上書きせず、Git管理外のpublicへ配置する。

import { copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'public'), { recursive: true });
try {
  await copyFile(
    resolve(root, 'config/app-config.local.example.json'),
    resolve(root, 'public/app-config.json'),
    constants.COPYFILE_EXCL
  );
  console.log('架空データ専用のローカル設定を作成しました。外部サービスへは接続しません。');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('設定ファイルは既にあります。上書きせず保持しました。');
}
