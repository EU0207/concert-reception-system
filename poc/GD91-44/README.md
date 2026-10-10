# GD91-44 区画公開境界の一体性検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。

準備済みの区画を公開する境界だけをAuth・Firestore Emulatorで確認する隔離検証。本番アプリケーションではない。
[GD91-43の論理契約](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-43-区画追加差替えの公開接続契約)へ接続する。

## 対象と前提

- 共通版と公開区画一覧をversions/currentへ同居させる。公演全体の割当表と管理履歴を、同じcommitの3文書で確定する。
- 席集合が同じ場合もpublicationOperationIdを更新する。割当値・割当版と割当操作IDは保持し、公開時の検査を割当文書へ分担する。マーカー単独で許可せず、共通版・履歴との照合を要求する。
- [Rules](firestore.rules)の認可処理はGD91-42の保存用処理を維持する。役割・端末は初期投入し、本人Authからのセッション発行と匿名端末の保存を通常要求で行う。

公開境界の形式1はこのプロトコル専用。業務形式10の移行・上書きや、新しい本番保存形式の採用を意味しない。
完成した候補manifestと業務初期状態は、管理権限で前提投入する。候補へのクライアント書込みは拒否する。
manifestの完成判定・変更席IDの算出を既存の構成片検査から発行する接続は未実装。この前提を本番でクライアント自己申告へ置き換えない。

## 再実行と証拠

既存POC-004のNode.js・Firebase CLIとJavaを使う。依存追加・実Firebase接続はない。ローカル8181・9191番ポートが空いていることを確認し、pwsh 7で実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-44-config'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-44/tests/budgets.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-44/firebase.json --project demo-concert-seat-gd91-44 --only auth,firestore 'node poc/GD91-44/tests/emulator.mjs'
```

[結合試験](tests/emulator.mjs)はG01～20。部分送信・競合と再送、準備済み変更対象の保護と500人保持を確認する。
[結果JSON](artifacts/emulator-summary.json)へ実行前後9ソースハッシュと参照予算を保存する。GD91_CASEによる個別実行を全件合格へ数えない。
[予算コード](tests/budgets.mjs)はキャッシュ削減を見込まず、公開3書込みは19参照、準備期間のキー固定プローブは15参照を算定する。請求量・式評価数の実測ではない。

## 未検証範囲

assignmentProbeは準備期間のキー固定を確認する専用操作。既存の席交換・発券と不参加の再実装ではない。
既存63件の業務回帰は再実行しない。構成片の作成からの完成証明、全編集と複数区画の通常業務への接続は残る。
同居目録・退役ID台帳の容量と保持期限、回収・SDKとIndexedDB、実キュー・実機も未確認。
主要試験はDD91-T69、結果と残作業は[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-44-区画公開境界の一体性検証)へ追跡する。
