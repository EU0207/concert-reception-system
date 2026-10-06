# GD91-03: 個別構成編集の隔離検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の技術検証。構成集約文書の容量課題があり、本番採用の根拠や本番Rulesとして使用しない。
正式結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-03-個別構成編集と容量境界)に集約する。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
node poc/GD91-03/tests/capacity.mjs
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-03-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-03/firebase.json --project demo-concert-seat-gd91-03 --only auth,firestore "node poc/GD91-03/tests/emulator.mjs"
```

送信先はlocalhostとdemoプロジェクトに固定。構成と本人証跡の投入、前提版の競合再現だけ管理経路を使用する。検証要求は端末Authで送信する。トークンと実データを保存・出力しない。

## 範囲

既存セルへの手入力席追加、同一列の未割当席の番号・位置変更を検証する。構成・割当表・履歴を一体更新し、番号索引の食い違いを拒否する。
初期構成作成、行列拡張、正式な認可証跡発行、券QR、差分配布と実機試験は対象外。GD91-02と合同の本番Rulesも未検証。
番号64文字と理由200文字は容量評価用の仮条件。製品上限の承認ではない。ハッシュはLFへ正規化する。
