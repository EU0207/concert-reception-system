# GD91-46 複数区画の構成準備と公開

状態：In Review。読者：開発者、設計担当者、テスト担当者。

新規区画を別々に準備し、既存区画を保持して公開する隔離検証。本番アプリケーションではない。
[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-46-区画ごとの準備と新規追加)と[結果・残作業](../../docs/development/technical-validation/seat-save-validation.md#gd91-46-複数区画の構成準備と公開)を参照する。

## 処理と前提

1. `preparedSeatShows/{performanceId}/sections/{sectionId}`へ構成準備を分離する。headの区画IDと保存先を一致させる。構成は3セル・採番検査は2セルずつ行う。
2. 認可は公演共通の役割・端末・本人セッションを参照する。区画ごとに認可記録を複製しない。構成側の公演管理初期値と補助業務状態は隔離検証用で、本番の保存形式ではない。
3. 完了head・ID台帳と候補の集合を照合する。公開一覧に存在しない区画だけ候補発行を許可し、既存の共通版・割当・履歴を3文書で一体公開する。

候補発行と公開では最新の公演共通管理状態も検査する。準備領域の管理初期値を共通管理へ統合する経路は未確認。役割・端末の登録と公演管理、公開側の空の業務正本は前提投入する。構成の業務初期化・準備と完了、候補発行と公開は通常要求で行う。候補は管理権限で投入しない。

[静的照合](tests/budgets.mjs)でGD91-45の構成165関数の移設を確認する。保存先と認可参照先を変更し、初期headへ区画IDの照合を追加した。GD91-44の公開39関数は維持する。

## 再実行

既存POC-004のNode.js・Firebase CLIとJavaを使う。依存追加・実Firebase接続はない。8181・9191番ポートが空いていることを確認し、pwsh 7で実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-46-config'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-46/tests/budgets.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-46/firebase.json --project demo-concert-seat-gd91-46 --only auth,firestore 'node poc/GD91-46/tests/emulator.mjs'
```

[初回回帰](tests/emulator.mjs)C01～18と[複数区画](tests/multiple.mjs)M01～10の28ケースを実行する。[結果JSON](artifacts/emulator-summary.json)へ実行前後23ソースハッシュを記録する。GD91_CASEによる診断を全件合格へ数えない。500席の構成準備費用はC13で計数する。M06・07ではその公開済み状態に500人を割り当てて追加を検証する。

## 範囲外

既存区画の差替えと変更席の証明、公開後スライドとの合同接続は未実装。空の変更一覧を差替えへ流用しない。保護対象の試験用一覧と準備期間の割当プローブは、既存の券・不参加等63件の業務試験を代替しない。

全編集の業務回帰、容量・保持期限と回収は残る。SDK・IndexedDBと配布目録、実機も未確認。方式未採用・本番未着手。
