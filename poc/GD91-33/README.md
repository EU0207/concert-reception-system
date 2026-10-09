# GD91-33: 券未作成の不参加と席の有無

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-33-券未作成の不参加と席の有無)を結果と費用の正本とし、[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#券未作成の不参加候補gd91-33)に契約と主要試験を置く。本番Rulesとして使わない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-33-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-33/firebase.json --project demo-concert-seat-gd91-33 --only auth,firestore "node poc/GD91-33/tests/emulator.mjs"
```

## 範囲

形式7で既存30・追加8ケースを確認する。券未作成の不参加は席あり5・席なし4文書だけを更新し、変更しない版を保持する。席配置が未作成でも空の割当表を作らない。通常のお客様更新の迂回と既存券の混入を拒否する。

本人セッションは通常発行する。役割・端末登録と初期control、受付事実は前提投入。検査用読取りは管理経路で、書込みは通常の認可を使う。REST commitによる単一区画の限定検証であり、SDK・IndexedDBと画面、正式認可全体と通常受付同期は未接続。

QRなしの既存券の不参加と実機運用は未確認。有効QR無効化のBD-03-07の運用条件は維持する。架空データ・demoプロジェクトとloopbackだけを使い、旧PoCと依存は変更しない。
