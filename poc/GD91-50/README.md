# GD91-50 手入力席の一括検査上限

## 結論と範囲

状態はIn Review。読者は開発者、設計担当者、テスト担当者。

GD91-49の物理形式をRulesへ接続する隔離検証。正常入力でも一括検査が式評価上限へ達するため、この候補で完成候補を発行しない。本番の保存形式・Rulesは変更しない。

| 候補 | 6正常入力の結果 |
|---|---|
| 3セル一括 | 5例が式評価上限、単純な自動席1セルだけ受理 |
| 2セル一括・重複評価整理 | 5例が式評価上限、単純な自動席1セルだけ受理 |
| 2セル・検査の分担 | 4例が式評価上限。末尾1セルの手入力と自動席1セルは受理 |

18件は診断試行であり、業務試験18件合格ではない。先行した業務試験は最初の正常保存で中断し、500席・後続の異常系へ進んでいない。

## 処理と前提

[support.mjs](tests/support.mjs)が親・列設定と旧構成を試験前提として作る。端末・権限と本人確認セッションも管理用fixtureで用意する。セッション発行や親の完成証明を実施した扱いにしない。

匿名認証の試験端末が、構成片と属性片を2書込みの同じリクエストで送る。構成側は既存GD91-47と同じ認可関数を使い、最新管理状態を照合する。手入力へ変える場合も旧セルIDと消費番号を保持する。

分担案ではセル・番号を構成側、属性を属性側で検査する。属性側は構成片が保存前に存在せず、同時保存後に存在することを要求する。構成片の新規作成に認可を必須とするため、属性側だけで保存できる経路を作らない。全異常系は未確認であり、この論理条件だけで安全性全体を合格扱いにしない。

番号の前後空白比較には[Firebase公式のString.trim](https://firebase.google.com/docs/reference/rules/rules.String#trim)を使用する。保存する手入力番号は元の文字列を保持する。単位数は候補内だけの条件で、製品上限を決定しない。

## 再現

既存のNode.js・Firebase CLIとJavaを使う。リポジトリのルートでpwshを実行する。実Firebaseへ接続しない。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:GD91_FRAGMENT_WIDTH='3'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-50/three-cell.firebase.json --project demo-concert-seat-gd91-50 --only auth,firestore 'node poc/GD91-50/tests/emulator.mjs'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-50/firebase.json --project demo-concert-seat-gd91-50 --only auth,firestore 'node poc/GD91-50/tests/emulator.mjs'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-50/staged.firebase.json --project demo-concert-seat-gd91-50 --only auth,firestore 'node poc/GD91-50/tests/staged.mjs'
```

結果は[3セル](artifacts/three-cell-summary.json)・[2セル](artifacts/two-cell-summary.json)・[分担案](artifacts/staged-summary.json)。スクリプトの終了成功は、上限到達の再現と保存状態の照合ができた意味。候補の成立を表さない。拒否時は両文書が残らず、受理時は保存内容を再取得して照合する。各結果に実行前後のソースハッシュを記録する。

## 残条件

全席のID・表示番号一意性、採番カーソルと完成候補発行は未接続。公演中の操作と保護対象席の旧新比較も対象外。参照予算の静的上限は、3セル一括が8＋4＝12、2セル案が8＋2＝10で、キャッシュによる減算をしない。参照数内でも式評価が成立するとは限らない。

500席の新方式の総費用は未測定。GD91-47の実測1,209書込みを新方式へ流用しない。次は検査を別リクエストへ段階化し、版と進捗を固定した証跡を完成判定へ接続する。認可・公開境界は維持する。

正式な結果は[検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-50-手入力席の一括検査上限)を参照。方式未採用・本番未着手。過去44件と63件の再実行、SDK・実機試験は実施していない。
