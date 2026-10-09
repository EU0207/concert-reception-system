# GD91-14: セル片と席属性片の分離検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-14-セル片と席属性片の分離検証)へ集約する。本番Rules・保存形式として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-14-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-14/firebase.json --project demo-concert-seat-gd91-14 --only auth,firestore "node poc/GD91-14/tests/emulator.mjs"
```

セル片と席属性片を別々に検査する。両方の変更を禁止し、headとID／消費番号台帳への取込みを一体更新する。元セル・席属性と台帳は管理経路で投入しない。列設定・本人証跡と架空の割当等は前提投入する。codecは論理契約の自動Seatを復元し、手入力席は明示拒否する。

30シナリオのうちV29は未保証の採番順、V30は保存幅の比較。4セルと100×100は試験用で、製品上限ではない。countReadyは業務全体の確定状態ではない。

準備片の破棄・再作成と回収、列設定の初期生成と全編集は未完了。SDK・端末保存、正式認可・受信と券QR、画面・帳票と実機は対象外。本番Firebaseへ接続しない。
