# GD91-21: 初期完了と共通版の一体発行

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-21-初期完了と共通版の一体発行)に結果・残作業を集約する。本番Rulesとして使用しない。

## 実行

PowerShell 7、既存Node.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。9191・8181・9150・4401・4501番ポートを使用する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-21-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-21/firebase.json --project demo-concert-seat-gd91-21 --only auth,firestore "node poc/GD91-21/tests/emulator.mjs"
```

GD91-18の初期作成とGD91-20の共通版を接続する。検査済みの元構成・集計と共通版を前提投入せず、通常の作成要求で生成する。初回完了はhead・履歴・公開先・共通版の4書込み。GD91-19の計画処理から、その後のスライド3書込みへ接続する。

69シナリオのうちV30・46は検査幅の比較。権限・本人証跡と業務参照の版は前提投入。業務参照と席IDの照合、他業務の版発行と正式認可全体は未完了。QR有効性検証も別対象とする。countReadyは隔離モデルの選択状態であり、共有下書き・業務確定の実装完了ではない。全編集と差替え・回収、SDK・端末保存と実機も未実施。100×100と片幅は試験値であり、製品上限へ変更しない。
