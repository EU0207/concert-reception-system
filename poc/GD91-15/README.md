# GD91-15: 初期準備の中断破棄と再作成

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-15-初期準備の中断破棄と再作成)へ集約する。本番Rules・保存形式として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-15-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-15/firebase.json --project demo-concert-seat-gd91-15 --only auth,firestore "node poc/GD91-15/tests/emulator.mjs"
```

GD91-14の準備片を作業世代で分離する。中断時はhead・selectionと履歴の3件を一体更新し、次は新しいIDを使う。旧片を変更・削除せず、一般受付からの取得と遅れた旧要求を拒否する。完了済み結果の再初期化は対象外として拒否する。

40シナリオのうちV29は未保証の採番順、V30は保存幅の比較。countReadyは業務全体の確定状態ではない。元セル・席属性と台帳、選択情報は管理経路で投入しない。列設定・本人証跡と架空の割当等は前提投入する。

保持期限・物理回収、列設定の初期生成・採番順と全編集は未完了。SDK・端末保存、正式認可・受信と券QR、画面・帳票と実機は対象外。本番Firebaseへ接続しない。
