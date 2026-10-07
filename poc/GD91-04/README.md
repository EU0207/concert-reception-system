# GD91-04: 構成分割の隔離検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の技術検証。結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-04-構成の分割保存)に集約する。本番Rulesとして使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
node poc/GD91-04/tests/capacity.mjs
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-04-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-04/firebase.json --project demo-concert-seat-gd91-04 --only auth,firestore "node poc/GD91-04/tests/emulator.mjs"
```

送信先はlocalhostとdemoプロジェクトへ固定。初期分割・本人証跡と前提版の競合は管理経路で再現し、編集は端末Authで送る。トークンと実データを保存・出力しない。

## 範囲

同じ列の30セル群、共通番号索引と公演全体の割当表を使う。個別追加・未割当席編集は共通版、対象片と割当表、履歴を一体更新する。headで認可・全内容を検証し、他文書は同一要求内のhead更新を必須にする。
30セルは保存単位の評価値。画面の列長や製品上限の承認ではない。番号64文字と理由200文字も容量評価条件である。
初期作成、行列拡張、片を跨ぐ移動、合同Rulesと正式認可、券QRと差分配布は未検証。ハッシュはLFへ正規化する。
