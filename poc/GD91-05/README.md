# GD91-05: 軽量版と構成差分受信の隔離検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の技術検証。結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-05-軽量版と構成差分受信)へ集約する。本番Rules・受信処理として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
node poc/GD91-05/tests/capacity.mjs
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-05-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-05/firebase.json --project demo-concert-seat-gd91-05 --only auth,firestore "node poc/GD91-05/tests/emulator.mjs"
```

localhostとdemoプロジェクトへ固定。本人証跡と初期構成は管理経路で投入し、編集と受信は端末Authで要求する。トークンと実データを保存・出力しない。

## 範囲

GD91-04の構成編集に軽量な保存片版一覧を加え、5文書を一体確定する。受信側は変わった構成片だけを一時領域へ取得し、前後の版が同じ場合だけまとめて返す。遅れた旧要求の完了も新版を置き換えない。
割当表は版変更時に一文書全体を取得する。構成差分の限定検証であり、受付イベントの同期や席替え方式の完成を示さない。
SDK・IndexedDBの保存と復帰、画面の更新・受付再開、実機性能は未検証。30セル群と長い入力は評価条件。ハッシュはLF正規化し、実行中にソースが変わった場合は証拠を作成しない。
