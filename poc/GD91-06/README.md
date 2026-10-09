# GD91-06: 席構成と席設定の合同Rules検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-06-席構成と席設定の合同検証)へ集約する。本番Rules・受信処理として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
node poc/GD91-06/tests/capacity.mjs
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-06-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-06/firebase.json --project demo-concert-seat-gd91-06 --only auth,firestore "node poc/GD91-06/tests/emulator.mjs"
```

localhostとdemoプロジェクトへ固定。本人証跡・初期構成と許可候補は管理経路で投入し、編集・受信は端末Authで行う。トークンと実データを保存・出力しない。

## 範囲

GD91-02の割当正本を、GD91-05の構成分割・軽量版と同じRulesへ結合する。全体確定版と構成版を分離し、席交換で構成を再取得しない。検証用の保存形式版は2とする。
headで認可・操作内容を検査し、割当表で許可候補と軽量版の一致を検査する。軽量版・履歴と構成片も同じ要求内のhead更新を必要とする。
役割準備版を検査するが、本人証跡・追加準備の発行、再認証と臨時管理者の全操作は未検証。許可候補・変更禁止席の業務更新も前提投入だけである。
初期作成・行列拡張、券QRとグループ業務、SDK・暗号化IndexedDBと実機復帰は未検証。容量は評価条件であり製品上限ではない。実行中のソース変更では証拠を作成しない。
