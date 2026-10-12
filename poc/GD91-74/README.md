# GD91-74 容量・要求量と回収境界の評価

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #167の無料条件・入力上限と安全な回収の成立性を評価する |
| 前提 | GD91-73のRulesを変更せず、架空データとローカルEmulatorだけを使用する |

## 処理と証拠

- `measure.mjs`：通常初期化→2区画の構成準備・公開→10人／500人登録→自動配置の検査・確定→一般受付の投影取得→共有と結果照会。前提投入とowner読取りを別集計する。
- `meter.mjs`：ローカル要求の成功書込み数、GET回数とREST JSONのバイト数を計測する。認証情報と本文を結果へ出力しない。送信文書の容量計算は[公式の算定規則](https://firebase.google.com/docs/firestore/storage-size)に基づくモデルであり、索引を含む保存容量・課金量ではない。
- `analyze.mjs`：旧分岐別予算へ索引分を加え、減算なしの参照予算を再算定する。差替え時の`baseSeats/current`主要フィールドと構成書込みの下限を計算する。
- `retention.mjs`：現行・退役構成、正本と操作結果の削除拒否を確認する。削除可能な対象を安全に回収できた試験とは区別する。

全体判定と主要数値は[容量・費用と回収の記録](../../docs/development/technical-validation/seat-capacity-validation.md)を参照する。結果は`artifacts/measurement.json`、`analysis.json`と`retention.json`へ保持する。途中で失敗した結果を全件合格へ数えない。

## 測定の限界

通常要求には試験ドライバーの計画組立て・再確認も含む。ownerによる提案組立て代用・前提投入は別集計で、無料枠へ必要な本番読取りの合計を証明しない。通常の端末登録と構成入力headの発行は前提として残る。2番目の構成準備の数値には公開までを含む。

一般受付のGET数は`projection.mjs`の明示取得1回分で、画面再描画の回数ではない。未作成の受付状態と移動量は取得を試みるため、GET回数には404・403も含む。Rulesの依存文書読取りと課金、SDKや実機の本番性能は実測していない。

容量下限は他の必須フィールドを除く。書込み下限は偶数列・幅2の1区画について`2C + 7P + S`。Cはセル数、Pは小片数、Sは席数。列台帳・初期進捗・候補発行と公開は別途必要になる。10,000セルを本番の対応上限としない。

## 再現

既存依存だけを使い、PowerShell 7で実行する。Emulator用のJavaヒープ上限はこのターミナルだけに適用する。

```powershell
$env:JAVA_TOOL_OPTIONS=($env:JAVA_TOOL_OPTIONS+' -Xmx4096m').Trim()
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-73/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore
```

別ターミナルで実行する。

```powershell
$env:GCLOUD_PROJECT='demo-concert-seat-gd91-60'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8181'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/GD91-74/analyze.mjs
node poc/GD91-74/measure.mjs
node poc/GD91-74/retention.mjs
node poc/GD91-74/audit.mjs
```

試験データの初回グループIDをUUID形式へ修正した。499による読取り中断を記録し、計測入口のGETだけ最大2回再試行する。書込みは自動再送しない。その後の500応答はJavaヒープ不足をログで確認した。空のEmulatorを4GiBで再起動し、全範囲を再実行して9件が合格。18件のハッシュを現在ソースと照合した。失敗JSONは保持する。

## 未完了

入力上限を守るサーバー側の容量ガード、参照上限の保証と総費用の上限は未確定。回収ロック・参照追跡と中断再開は未実装。承認済みの手動削除・バックアップ保持条件を変更せず、TTLや有料実行基盤を導入しない。
