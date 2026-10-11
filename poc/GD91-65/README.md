# GD91-65 通常初期化と初回公開の合同検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。#166第2・4条件の限定接続。架空データとローカルEmulatorだけを使う。本番方式の採用と実装開始は含まない。

## 対象と流れ

GD91-64の同じ正本へ、公演業務の初期化→名簿先行／座席表先行→初回公開→手動割当・QRを接続する。

| 入口 | 処理・保存境界 |
|---|---|
| `tests/support.mjs: fixture` | 役割・端末とcontrolを前提投入し、本人Authからセッションを通常発行。共通版・業務索引と割当表は投入しない |
| `initPlan / initWrites` | 共通版と空の参加索引・券保護索引、履歴の4文書を一体作成。構成3版は0、controlは最新実版 |
| 既存の`register / paidPlan` | 正本・表示名と索引を通常保存する。名簿先行でも空の割当表を作らない |
| `prepareFirst` | 構成入力head・準備controlだけを投入。片とID・番号証明、空の旧構成に対する完了検査と変更不能の構成候補は通常要求で作る |
| `firstPlan / firstWrites` | 最新共通版を照合し、共通版・全席空の割当表と履歴の3文書を一体保存。既存名簿・券を複製しない |
| 既存の`assignment / ticketPlan` | 同じ正本・共通版で席設定・QR生成。構成前の発行履歴も後の席設定で保護する |

初回公開はGD91-27・28の旧5文書案から3文書へ変わる。構成headと公開先の個別書換えを、変更不能候補と共通版内の区画参照へ統合する。意味は同じでも保存形式が異なるため、旧結果を新候補の合格へ加算しない。

## 実行

既存の`poc/POC-004/node_modules`を使用する。依存追加・本番Firebaseへの接続はない。PowerShell 7で実行する。

```powershell
node poc/GD91-65/generate.mjs
node poc/GD91-65/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-65-config'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-65/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-65/tests/emulator.mjs && node poc/GD91-65/tests/regression.mjs'
```

`GD91_CASE=N19`等の絞込みは診断専用。全件結果へ加算しない。

## 証拠と限界

- [新経路](artifacts/initial-summary.json)と[券なし等の回帰](artifacts/branches-regression.json)、[券・QRの回帰](artifacts/lifecycle-regression.json)に実行前後のハッシュを記録する。回帰は旧24件・32件のケース本体を変更せず、同じ新Rulesで再実行する。
- 初期化4件の部分集合14通り、初回公開3件の6通りを全て拒否する。回帰内の1,190通りも別シナリオへ加算しない。
- [予算](tests/budgets.mjs)は初期化18／最大9、初回公開16／最大8。キャッシュ減算なしの机上参照数。式評価の数値・余裕と請求量は未測定。
- 初期化・業務索引・登録と初回公開は通常要求。役割付与・端末登録とcontrol作成、構成入力headの通常生成は前提。破損拒否試験だけは故障状態を投入する。
- 4席・単一区画。500人配置と複数区画、自動配置・専用編集とスライドの合同接続は未完了。
- REST・Auth/Firestore Emulatorによる自動結合試験。SDK・IndexedDBと画面、実機は未実施。操作ID照会は実際の通信遮断を注入した結果ではない。
- 正式な判定と残条件は[合同検証記録](../../docs/development/technical-validation/seat-business-integration-validation.md#今回の判定とissueの残条件)を参照。共有下書きの隔離と回線復旧だけで送信しない契約を維持し、#167・168の開始条件を変更しない。
