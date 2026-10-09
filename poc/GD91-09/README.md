# GD91-09: 全体スライドの世代保存検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-09-全体スライドの世代保存検証)へ集約する。本番Rulesとして使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-09-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-09/firebase.json --project demo-concert-seat-gd91-09 --only auth,firestore "node poc/GD91-09/tests/emulator.mjs"
```

localhostとdemoプロジェクトへ固定。旧世代の完全性と本人・端末証跡は管理経路で投入する。各レコードの保存と検査進捗を同時更新し、全検査後に公開先・操作状態と履歴を一括確定する。理由フィールドは設けず、旧席の緊急追加理由を保持する。
初期作成・複数区画と行列拡張、GD91-06との合同Rulesと差分配布は対象外。公演日・会場タイムゾーンの実判定、証跡発行と本番QR、SDK・IndexedDBと実機復帰は未検証。評価条件を製品上限や採用済み方式と扱わない。