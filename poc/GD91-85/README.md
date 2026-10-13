# GD91-85 配布経路と期限対策の接続

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #167の合同検証の中間結果として、GD91-84の期限対策を既存配布経路へ接続する |
| 前提 | PR #193のレビュー承認・main統合後。既存依存とローカルEmulator、架空データのみ |
| 結論 | 13読取り許可箇所へ依存を追加し、20経路の親・子購読で受信前拒否。全業務と本番採用は未判定 |

## 変更と流れ

[generate.mjs](generate.mjs)はGD91-84のRulesを複製して変更する。過去証拠のソースを編集しない。公開根・共有根と世代metaは版、片は不変のindex、区画は不変の名前を認可の依存へ加える。結果はresultRevision、基準参照は一方向のactive変更を追う。無意味な定期書込みを増やさない。

未作成の片・操作結果はnullの取得を許可する。その依存値が作成時に変わるため、期限後に作成されたデータも確認する。不変片・結果を通常要求で変更できないことと、可変ノードの版を省略できないことを組み合わせる。

本人が自身の役割・端末・セッション状態を取得する3箇所は状態照会として区別する。これらは業務データの配布入口ではない。保存契約へ未接続だった旧診断のview・private・sharedは閉じた。[読取り契約一覧](artifacts/read-contract.json)を監査でRules全体と照合し、未分類の許可を残さない。

## 確認結果

| 対象 | 結果 |
|---|---|
| [既存合同試験](artifacts/local-summary.json) | 同じRulesで32試験群を実行。600人・1,000人×2・16区画の準備とREST取得を含む |
| [配布試験](artifacts/delivery-summary.json) | 明示停止3条件・時刻失効2条件。それぞれ20経路の新規RESTを拒否し、既存SDK・独立RESTも新データを受信前拒否。別の有効利用者は継続 |
| 更新境界 | 版の省略・削除と不変データの改変10要求を拒否し、前後状態が一致。旧診断3入口も拒否 |
| 後処理 | 各試行の全拒否Rulesと空の試行ルートを再取得。ソース21ハッシュを照合 |

20経路は公開根、制御、共有根と基準参照を含む。未作成の構成片・区画と名簿片、操作結果も親・子の両方で購読した。期限だけで切断する証拠ではない。役割期限の試験はセッション期限も同時に経過する。

試験は通常に発行した管理端末セッションを使う。役割・端末登録とcontrolはownerの前提投入。Google本人認証はEmulatorの架空属性であり、実際のログイン・招待の合格ではない。外部で確認済みなのはGD91-84の診断ノードで、本Rules全体の外部結果ではない。

## 再現と残条件

PowerShell 7で次を実行する。EmulatorはGD91-84のdemo namespaceを再利用し、過去結果を上書きしない。

```powershell
node poc/GD91-85/generate.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-85/firebase.json --project demo-concert-seat-gd91-84 --only auth,database
```

別ターミナルで順番に実行する。両試験は同時実行しない。

```powershell
node poc/GD91-85/local.mjs
node poc/GD91-85/delivery.mjs
node poc/GD91-85/audit.mjs
```

本結果は#167内の中間記録である。席設定・券保護と受付差分の合同接続、端末再開と全業務の無料予算を継続する。GD91-73の225シナリオを移植済みとして加算しない。本番実装・外部追加試行と3,000人試験は行っていない。

公式資料：[Rulesの値と子ノード参照](https://firebase.google.com/docs/reference/security/database)、[親の許可と子の直接取得](https://firebase.google.com/docs/database/security/core-syntax)。
