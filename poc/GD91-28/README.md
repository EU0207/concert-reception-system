# GD91-28: 名簿と座席表の両準備順を接続する検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-28-共通初期化と両準備順の接続検証)に結果と残作業を集約する。本番Rulesとして使用しない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-28-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-28/firebase.json --project demo-concert-seat-gd91-28 --only auth,firestore "node poc/GD91-28/tests/emulator.mjs"
```

## データと処理

本人Authでセッションを発行し、承認端末Authで共通版と空の業務索引、履歴を4件で初期化する。保存形式3を使い、構成未作成では構成3版を0、世代と区画の参照を空文字とする。初回構成の公開は5件を一体保存し、既存共通版の構成3版だけを0→1へ進める。お客様・券・controlの版は保持する。

最小来場者500人を通常登録してから構成を作る経路と、その逆の経路を実行する。両方で同じ版の増加結果を確認し、割当・移動交換とスライドへ接続する。名前と任意項目を索引へ全件複製しない。未発券・単一区画の検証であり、購入者実体と名簿取込みは含まない。

構成未作成の来場者更新は割当表の不存在を検査する。公開済みで欠落している割当表は拒否する。構成なしを受付開始可能と解釈せず、管理用名簿・履歴の閲覧は管理者に限定する。

## 証拠と制限

自動試験の結果と前後のソースハッシュを[証拠](artifacts/emulator-summary.json)へ保存する。初期化・公開の部分送信、既存断片の再利用と古い確認を拒否する。競合で両方未確定の場合は状態・履歴を照会し、ロック中断された同じ操作IDだけを明示再試行する。403の無条件再送はしない。SDKの自動再試行とは区別する。

通常要求はRESTのcommitで送信する。端末登録・役割付与とcontrolの初期状態は前提投入する。controlFenceは管理版だけを変える検証用の操作であり、公演作成と実際の受付開始・停止を実装していない。既存断片と割当表欠落の試験だけは、管理経路でローカルに障害を注入する。

グループ固定・正式認可全体、券QRと不参加の結合は残る。複数区画・全編集と差替え・回収、SDK・IndexedDBと画面、実機も対象外。管理画面の「未作成／未設定」表示をデータ閲覧試験だけで合格にしない。

架空データとdemoプロジェクト、loopback接続だけを使用する。前段のPoCは変更しない。要求回数とJSON容量をFirestore内部容量・請求量の保証へ読み替えない。
