# GD91-24: 席ID集合と初回割当表の一体発行

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-24-席id集合と初回割当表の一体発行)に結果と残作業を集約する。本番Rulesとして使用しない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。PowerShell 7で実行する。ポートは9191・8181・9150・4401・4501を使用する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-24-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-24/firebase.json --project demo-concert-seat-gd91-24 --only auth,firestore "node poc/GD91-24/tests/emulator.mjs"
```

本人Authがセッションを発行し、端末Authが構成と席ID集合を作成する。初回はhead・履歴・公開先と、共通版・空の割当正本を一体発行する。差分送信のキーは元の台帳と更新案から計算し、席IDを含む全変更を送信する。成功・拒否の件数は実行証拠を参照する。

お客様と券の業務スナップショット、端末登録・役割付与は管理経路で前提投入する。900席の初回割当は全席が空であり、500人の実割当を行った試験ではない。既存の割当を持つ公演の差替えと複数区画、全編集・回収は対象外。業務スナップショットの通常発行とQR有効性、正式認可全体とSDK・IndexedDB・実機は未完了。

入力は架空データのみ。Google認証もEmulatorの架空資格で模擬する。demoプロジェクトとloopback接続を実行時に検査する。証拠のハッシュはLFへ正規化し、実行前後と現在ソースを照合する。countReadyは隔離モデルの公開状態であり、本番の業務確定完了ではない。
