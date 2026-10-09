# GD91-12: 初期保存のID重複拒否検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-12-初期保存のid重複拒否検証)へ集約する。本番Rules・投影として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-12-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-12/firebase.json --project demo-concert-seat-gd91-12 --only auth,firestore "node poc/GD91-12/tests/emulator.mjs"
```


元セル片・行列集計とID台帳を一括保存する。台帳はセルIDと座席IDを同じ集合へ登録し、区画IDも予約する。過去のID再利用と片内の座席ID重複を拒否する。スライドでは台帳を取得・更新しない。
初期集計・元セル片と台帳は管理経路で投入しない。本人証跡・制御版と採番列・架空参照は前提投入。5セルと100×100は試験用の制限。採番列ID・正式なSeatと割当の初期生成、全編集・拡張と複数区画は未検証。
集計完了は業務全体の初期確定ではない。SDK・IndexedDB、正式な受信・帳票と実機、本番Firebaseは対象外。
I35では一意なseatIdと正式な席レコードの対応が未検査であることを再現する。countReadyを業務全体の確定状態へ流用しない。
