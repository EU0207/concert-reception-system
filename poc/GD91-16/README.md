# GD91-16: 列設定の初期作成と採番順の検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-16-列設定の初期作成と採番順の検証)へ集約する。本番Rules・保存形式として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-16-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-16/firebase.json --project demo-concert-seat-gd91-16 --only auth,firestore "node poc/GD91-16/tests/emulator.mjs"
```

列設定は通常経路でID予約と一体作成する。セル・席属性を準備し、numberProofsを2位置ずつ検査する。全位置の証拠が揃うまで集計へ取込まない。head・selectionと履歴の中断境界はGD91-15から維持する。

46シナリオのうちV30・46は検査幅の比較。countReadyは業務全体の確定状態ではない。列設定・元セルとID台帳は管理経路で投入しない。本人証跡と架空の割当等は前提投入する。

手入力席・全編集、正式認可と共通受信は未完了。物理回収、SDK・端末保存と実機も未実施。幅2・4と100×100は試験値であり製品上限ではない。本番Firebaseへ接続しない。
