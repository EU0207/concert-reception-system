# GD91-18: 公開対象を保持する準備・中断の検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-18-公開対象を保持する準備中断の検証)に結果・残作業を集約する。本番Rulesとして使用しない。

## 実行

PowerShell 7、既存Node.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。9191・8181・9150・4401・4501番ポートを使用する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-18-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-18/firebase.json --project demo-concert-seat-gd91-18 --only auth,firestore "node poc/GD91-18/tests/emulator.mjs"
```

GD91-16の変換処理を再利用する。基準世代・版を記録し、公開対象を保持して別世代を準備・中断する。差替えは一律拒否する。全57シナリオのうちV30・46は検査幅の比較。

本人証跡と架空参照は前提投入。本番Firebaseへ接続しない。countReadyは業務確定ではなく、共有下書き実装の完了でもない。差替え・全編集と正式認可の合同化、SDK・端末保存と実機は未実施。物理回収も未実装。検査幅2・セル幅4と100×100は試験値であり製品上限ではない。
