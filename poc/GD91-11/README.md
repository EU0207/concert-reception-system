# GD91-11: 行列集計の初期保存検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-11-行列集計の初期保存検証)へ集約する。本番Rules・投影として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-11-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-11/firebase.json --project demo-concert-seat-gd91-11 --only auth,firestore "node poc/GD91-11/tests/emulator.mjs"
```


初期headの集計は空map・合計0に限定。1行を最大5セルの試験用片に分け、元セル片と検証済み集計を一括保存する。全位置を順に受領した場合だけ集計完了へ切替え、GD91-10の移動量保存に接続する。
集計・元セル片は端末認証で保存し、管理経路で投入しない。本人証跡・制御版と採番列・架空参照は前提投入。集計完了は業務全体の初期確定を意味しない。5セルと100×100の試験制限を製品上限にしない。
席番号・seatIdの全件一意性と正式割当の初期生成、確定後の席編集・行列拡張と合同Rules、正式な受信・帳票と実機は未検証。SDK・IndexedDBと本番Firebaseは対象外。
I28では異なる片のcellId重複を受け付ける既知制約を再現する。この結果を合格要件や本番採用の根拠にしない。
