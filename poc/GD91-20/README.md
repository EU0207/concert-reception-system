# GD91-20: 共通版と履歴を含むスライド保存境界

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-20-共通版と履歴を含むスライド保存境界)へ結果・残作業を集約する。本番Rulesとして使用しない。

## 実行

PowerShell 7、既存Node.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。9191・8181・9150・4401・4501番ポートを使用する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-20-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-20/firebase.json --project demo-concert-seat-gd91-20 --only auth,firestore "node poc/GD91-20/tests/emulator.mjs"
```

GD91-19の計画処理をGD91-18由来の移動量検査へ接続する。head・共通版・履歴の3件を相互に必要とし、共通版に保持した7版の期待値を照合する。元構成・集計と本人証跡は前提投入で、初期作成や本人認証の実フローとの合同試験ではない。

78シナリオが対象。930セル・900席と500人の架空参照でも保存本体は1要求・3書込み。投入・確認読取りは計測外。権限条件は従来の簡略契約であり、正式認可全体・QR有効性検証と他操作の版発行は未完了。SDK・端末保存と実機は未実施。保存方式の本番採用は別判断とする。
