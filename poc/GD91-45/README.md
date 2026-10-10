# GD91-45 初回構成から完成候補の発行

状態：In Review。読者：開発者、設計担当者、テスト担当者。

初回1区画の構成準備から候補発行・公開を接続する隔離検証。本番アプリケーションではない。
[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-45-初回の完成候補発行)と[結果・費用](../../docs/development/technical-validation/seat-save-validation.md#gd91-45-初回構成から完成候補の発行)を参照する。

## 処理と前提

1. [構成検査](tests/staging.mjs)で3セルずつの構成・属性を保存し、採番を2セルずつ検査する。ID台帳を更新し、全体の検査後に完了処理を行う。
2. [候補発行Rules](firestore.rules)は、同じ公演の完了headとID台帳を取得する。席ID・実体IDの集合を照合し、初回の候補だけ作成を許可する。
3. 候補作成後は元headの更新を拒否する。[公開処理](tests/publication.mjs)は、GD91-44の共通版・割当・履歴の3文書を一括更新する。

役割・端末登録と公演管理、公開側の空の業務正本は管理権限で前提投入する。本人Authからのセッション発行、構成側の業務初期化と構成準備・完了、候補発行と公開は通常要求で行う。完成候補を管理権限で書き込まない。

GD91-42の構成検査165関数とGD91-44の公開検査39関数を[静的照合](tests/budgets.mjs)する。構成側の名前を分離し、完了後の元head固定だけ追加した。元のPoCは変更しない。形式10と公開境界の形式1は別領域であり、本番形式統合・移行ではない。

## 再実行

既存POC-004のNode.js・Firebase CLIとJavaを使用する。依存追加・実Firebase接続はない。8181・9191番ポートが空いていることを確認し、pwsh 7で実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-45-config'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-45/tests/budgets.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-45/firebase.json --project demo-concert-seat-gd91-45 --only auth,firestore 'node poc/GD91-45/tests/emulator.mjs'
```

[試験](tests/emulator.mjs)のC01～18を実行し、[結果JSON](artifacts/emulator-summary.json)へ実行前後19ソースハッシュを記録する。GD91_CASEで絞った診断は全件合格へ数えない。C13の構成費用は、構成開始から完了までの通常要求を計数し、役割登録と業務初期化を除く。

## 範囲外

別区画追加・差替えの変更対象証明、公開後スライドとの合同接続は未実装。初回候補の空の変更一覧を差替えへ流用しない。元head固定を業務上のスライド禁止へ適用しない。

過去63件の業務試験は再実行していない。全編集・複数区画の回帰、容量・保持期限と回収も残る。SDK・IndexedDBと配布目録、実機は未確認。方式未採用・本番未着手。
