# GD91-30: 券資格の初回生成と発券後保護

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-30-券資格の初回生成と発券後保護)に結果と残作業を集約する。本番Rulesとして使わない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-30-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-30/firebase.json --project demo-concert-seat-gd91-30 --only auth,firestore "node poc/GD91-30/tests/emulator.mjs"
```

## データと処理

GD91-28の共通初期化と通常登録・割当を接続する。共通版と索引は保存形式3を保持し、券・資格・コード予約は形式4を追加する。必要な人の券だけを初回作成し、チェックと資格は独立させる。QRは16バイトの乱数、確認コードは別の8文字乱数で作る。資格とコードを操作履歴やログへコピーしない。

共通版が最新認可と管理版を検査する。券は保護索引の対象者へ固定し、他者の券を同じ要求へ混ぜられない。資格の初回生成は6、固定チェックは4文書を一体確定する。QR生成では割当正本を照合し、通常登録と割当更新で検査した来場予定の不変条件へつなぐ。

## 証拠と制限

[最終証拠](artifacts/emulator-summary.json)は14シナリオ。部分送信、便乗更新、旧版と認可を直接要求で試す。900席・930セルと500人の通常生成を確認し、全資格・コードの対応を照合する。資格生成だけで発行・送付チェックを変えず、交換とスライドで資格を保持する。

初回資格の静的参照予算は20、券チェックは14。キャッシュ削減を見込まず各文書最大5と算定する。認可追加と旧資格無効化を加える前に再算定する。

本人セッションは通常発行するが、端末登録・役割付与と初期controlは前提投入する。単一区画・currentCycle=1の検証。再発行、不参加・復帰とcycle再開は未実装。QR画像と実ファイル生成、正式認可全体、SDK・IndexedDB・画面と実機も未実施。

架空データとdemoプロジェクト、loopback接続だけを使う。診断時はGD91_CASEで一つのケースだけを選べるが、最終証拠は未指定で全件を実行する。既存PoCは変更しない。
