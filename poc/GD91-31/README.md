# GD91-31: 旧資格の無効化と再発行

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-31-旧資格の無効化と再発行)に結果と残作業を集約する。本番Rulesとして使わない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-31-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-31/firebase.json --project demo-concert-seat-gd91-31 --only auth,firestore "node poc/GD91-31/tests/emulator.mjs"
```

## 処理と証拠

GD91-30の通常登録・割当と初回資格に接続し、形式5の券へ共有版印と直前参照を追加する。共通版が最新認可を検査し、券・索引と新旧資格へ整合性検査を分担する。再発行では8文書を一体確定し、チェックと席を変更しない。生のQR・コードを一般履歴へコピーしない。

[最終証拠](artifacts/emulator-summary.json)は21シナリオ。既存14ケースを再実行し、500人の資格生成と席交換を確認する。再発行の部分集合254通り、便乗更新と再有効化を拒否し、競合と応答不明時の結果照会を試す。静的参照予算は初回17・チェック13・再発行20。キャッシュ削減は見込まない。

端末の停止確認は申告入力の前提だけを扱う。実際の全端末停止・更新受信を証明した結果ではなく、BD-03-07の確認と紙対応を維持する。役割・端末登録と初期controlは前提投入。通常セッションとREST commitを使う。

単一区画・currentCycle=1の検証。不参加・復帰とcycle再開は未実装。SDK・IndexedDBと画面、QR画像・出力ファイルと実機も未実施。架空データとdemoプロジェクト、loopback接続だけを使い、旧PoCは変更しない。診断用GD91_CASEは最終実行で未指定とする。
