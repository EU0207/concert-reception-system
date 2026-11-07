// 認可ルールの生成だけを行う。Firebaseへの配備は行わない。

import { readFile, writeFile } from 'node:fs/promises';
import { generateDatabaseRules } from '../firebase/authorization-rules.mjs';

// # 本文：Rulesの生成と一致確認

const target = new URL('../firebase/database.rules.json', import.meta.url);
const generated = JSON.stringify(generateDatabaseRules(), null, 2) + '\n';

if (process.argv.includes('--check')) {
  // 生成元だけ直して古いRulesを配る事故を防ぐため、ビルド時は内容の一致を確認する。
  if ((await readFile(target, 'utf8')) !== generated) throw Error('PRODUCT_RULES_OUT_OF_DATE');

  console.log('Product rules match their sources.');
} else {
  await writeFile(target, generated);
  console.log('Generated product authorization rules. No deployment performed.');
}
