# GD91-34: QRなしの既存券の不参加と席の有無

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-34-qrなしの既存券の不参加と席の有無)を結果と費用の正本とし、[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#qrなしの既存券の不参加候補gd91-34)に契約と主要試験を置く。本番Rulesとして使わない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-34-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-34/firebase.json --project demo-concert-seat-gd91-34 --only auth,firestore "node poc/GD91-34/tests/emulator.mjs"
```

## 範囲

形式8で既存38・追加10ケースを確認する。QRなしの既存券は席あり7・席なし6文書を一体更新する。発行・送付履歴の追加確認を残し、QR無効化用の停止確認は不要。入金・初回受付を保持し、復帰で旧席・券を復元しない。券未作成と有効QRの既存経路も回帰する。

本人セッションは通常発行。役割・端末登録と初期control、受付事実は前提投入。検査用読取りは管理経路で、書込みは通常の認可を使う。単一区画のREST commitによる限定検証であり、正式認可全体と受付同期、SDK・IndexedDBと画面は未接続。全編集・複数区画と差替え・回収、出力ファイルと実機も未確認。

有効QR無効化のBD-03-07の運用条件は維持する。架空データ・demoプロジェクトとloopbackだけを使い、旧PoCと依存は変更しない。
