# GD91-32: 不参加・復帰と来場cycleの結合

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-32-不参加復帰と来場cycleの結合)に結果と残作業を集約する。本番Rulesとして使わない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-32-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-32/firebase.json --project demo-concert-seat-gd91-32 --only auth,firestore "node poc/GD91-32/tests/emulator.mjs"
```

## 処理と証拠

形式6の共通業務文書へ、有効QRと席のある人の不参加9文書を接続する。券と各正本を期待版・結果版に結び、古い操作IDと別人の便乗更新を拒否する。復帰は4文書だけで、旧席と旧資格を戻さない。再割当後だけ新cycleを開始し、旧QRを再有効化しない。

[最終証拠](artifacts/emulator-summary.json)は30シナリオ。旧21ケースの回帰、既存操作IDの券単独更新、不参加510部分集合と競合を確認する。500人のうち一人だけ不参加にして、他499人の席と券を保持する。静的参照予算は不参加20・復帰19で、キャッシュ削減は見込まない。

受付事実・役割と端末登録、初期controlは前提投入。停止確認も申告入力であり、全端末の実際の停止・更新受信を証明しない。BD-03-07の全体保留と紙対応を維持する。

券未作成・QRなしの不参加分岐は未実装。正式認可全体と受付同期、SDK・IndexedDBと画面は未接続。出力ファイルと実機も未実施。架空データとdemoプロジェクト、loopbackだけを使い、旧PoCは変更しない。診断用GD91_CASEは最終実行で未指定とする。
