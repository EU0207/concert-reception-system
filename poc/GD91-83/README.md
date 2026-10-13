# GD91-83 分割間の確定境界と再評価計画

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | GD91-82後の保存契約を具体化し、分割間の一体保存をローカルで診断する |
| 前提 | #167を継続。既存依存とdemo Emulator、架空2利用者のみ。外部接続・本番実装は含めない |
| 結論 | 2席交換の骨組みは成立。全業務・無料条件の成立と本番採用は未判定 |

## 診断モデルと結果

[generate.mjs](generate.mjs)は、共通祖先の`.validate`から更新後の複数片を照合する。書込み権限は個別の末端へ限定し、親全体のPUTを許可しない。削除時は`.validate`が省略されるため、書込み許可側でもnullを拒否する。

[local.mjs](local.mjs)は通常の匿名AuthでPATCHする。ownerは初期状態の投入と試験後の全状態照合に限る。Auth UIDは端末の試験主体であり、本人確認・セッション発行は未接続。単一の利用許可フラグを正式認可の合格へ流用しない。

2席を別片`fragments/f0001`・`f0002`へ置く。席→人と人→席、受付用対応と共通版を同じ操作履歴へ結ぶ。券参照は読取り専用の前提投入であり、実際の資格生成・QR無効化を試したものではない。

| 試験ID | 確認したこと | 結果 |
|---|---|---|
| P01 | 8更新先の空集合と全体を除く全254部分集合 | すべて401、正本全体が変更前のまま |
| P02 | 全8更新先を一つのPATCHで交換 | 200、版を一度進め、券参照を保持 |
| P03 | 成功応答を使わず同じ操作IDを照会 | 通常権限で履歴の内容一致を確認し、2回目の確定を送らない |
| P04・12 | 同じIDの再送、同じIDで別内容 | 401、二重確定なし |
| P05～11 | 履歴改変、券便乗、削除、投影不一致、未許可片、履歴削除、二重割当 | 401、正本全体が変更前のまま |
| P13 | 2利用者が同じ基準版から同時に交換 | 200が1件、401が1件。版・履歴を二重更新しない |
| P14・15 | 送信前に許可を失効 | 当該利用者を拒否し、別の有効利用者は確定可能 |
| P16 | 親全体のPUT | 401、末端の権限から親全体の書込みへ昇格しない |

原データは[local-summary.json](artifacts/local-summary.json)。16試験群の内部に254部分集合を含め、270件などと合算しない。559 REST要求は試験の投入・照合と回収を含み、製品の要求数・通信量ではない。終了時に全拒否Rulesと試行ルートのnullを再取得した。Authはメモリー上のEmulatorデータで、終了時に破棄する。

## 限界と次の検証単位

固定2席・2人だけの診断であり、一般化した片割当・一意性検査は未実装。`expectedRevision`は診断用の1版であり、製品の領域別版群を置換しない。受付用対応はIDだけで、氏名配布の権限分離や一般受付の取得試験ではない。

P03は、確定後の応答を使わない試験手順による再開の模擬。実パケット喪失と暗号化IndexedDBへの送信案保存は未試験。受付イベントの並行追記・保持回収も未接続である。GD91-82の外部認可結果は保持するが、この書込みRulesを外部へ反映していない。

今回の成果は、Aで承認された「最小比較後の再評価計画」を[保存契約](../../docs/development/detailed-design/seat-management-detail-design.md#realtime-database候補の保存契約と再評価計画gd91-83)まで具体化したもの。以後は同じ#167の4条件を一つの合同検証単位として進め、個別の計算・回帰結果ごとにレビューを求めない。Firestore225シナリオを新候補の合格に数えない。

候補比較と切戻しは[ADR-007](../../docs/development/decisions/ADR-007-seat-edit-commit-boundary.md#realtime-databaseの保存境界と移行条件gd91-83)、結果の現在地は[容量・費用の検証記録](../../docs/development/technical-validation/seat-capacity-validation.md#gd91-83-分割間の確定診断と再評価計画)へ追跡する。

## 再現

PowerShell 7で、既存のFirebase CLIとJavaを使う。EmulatorのログはGit管理外である。demoプロジェクト以外へ接続する設定・外部実行モードを持たない。

```powershell
node poc/GD91-83/generate.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-83/firebase.json --project demo-concert-seat-gd91-83 --only auth,database
```

起動後、別ターミナルで実行する。

```powershell
node poc/GD91-83/local.mjs
node poc/GD91-83/audit.mjs
```

公式資料：[複数パス更新とトランザクション](https://firebase.google.com/docs/database/web/read-and-write)、[更新後状態・削除時のRules](https://firebase.google.com/docs/database/security/rules-conditions)、[条件付きREST](https://firebase.google.com/docs/database/rest/save-data)。
