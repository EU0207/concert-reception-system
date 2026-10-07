# GD91-13: Seat同居と採番列照合の検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-13-seat同居と採番列照合の検証)へ集約する。本番Rulesとして使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-13-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-13/firebase.json --project demo-concert-seat-gd91-13 --only auth,firestore "node poc/GD91-13/tests/emulator.mjs"
```

セル片へ自動Seatを同居させ、ID・区画と信頼済み列設定を照合する。元セル片・集計とID／消費番号台帳を一体保存する。自動Seat・元セルと台帳は管理経路で投入しない。列設定・本人証跡と架空の割当等は前提投入する。

26シナリオのうちS25は未保証の採番順、S26は計算上限の比較。通常は1セル片を使い、2・3・5セルの上限拒否も同じソースで再現する。小分けの本番採用は非推奨。100×100も試験予算で、製品上限や画面設定ではない。

列設定の初期生成、手入力席と全編集、複数区画は未検証。countReadyは業務の確定状態ではない。SDK・端末保存、正式受信・券QRと実機は対象外。本番Firebaseへ接続しない。
