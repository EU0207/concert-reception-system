# GD91-82 Realtime Databaseの最小認可比較

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #167で停止後の取得・受信拒否を比較し、本番移行の前提を切り分ける |
| 承認 | 2026-10-13、開発者がADR-007のAを選択。ローカルと少量のSpark外部比較に限定し、本番採用・移行とPR #191統合は別判定 |
| 現在地 | 同じ最小Rulesと比較手順でローカル4条件・外部4条件が成立。少量の認可比較に限り、本番方式は未採用 |

## データと認可の境界

同じ[最小Rules](database.rules.json)と[test-cases.mjs](test-cases.mjs)をローカル・外部で使う。本人役割・端末承認・セッション・公演状態を最小のフラグへ縮約する。本人識別子と端末Auth UIDを分け、端末Authの匿名UIDで取得する。本人ログイン・本人確認済み属性とセッション発行はowner投入の前提で、未検証である。

検証ルートは試行固有の`checks/<run>`に限定する。最大2架空Auth、対象データはピーク27 JSONノード。公演停止時は同じ公演の全員を拒否し、別公演の有効利用者を継続させる。他の3条件では同じ公演の別利用者が継続する。

通常利用者の書込みはすべて拒否する。ownerの前提投入と停止を、業務上のセッション発行・編集の合格へ流用しない。取得した時点指定等のパラメーターは改変要求の比較であり、Firestoreの過去時点APIと等価とは主張しない。

## ローカル結果

[local-summary.json](artifacts/local-summary.json)で本人役割・端末・セッションと公演制御の4条件を確認した。停止後の通常REST4経路と改変パラメーター4種は拒否。SDK・REST継続受信は認可変更だけで観測期限10秒以内に停止し、停止後イベントを取り込まない。新しいSDK要求と自己復帰要求も拒否。別の有効利用者は2件受信した。

localhostのdemoプロジェクトだけに接続した。Realtime Databaseの管理要求にはEmulator専用ownerヘッダーを使い、外部用の資格として使わない。初期の管理要求形式とlocalhost実行権限の調整を経て、同一の最小Rulesで比較した。

終了時は全拒否Rulesへ戻し、試行固有ルートを削除して空を再取得確認した。Authを含むEmulatorの終了でメモリー上の利用者を破棄する。実機・600人・1,000人の無料成立と業務整合性は未検証。

正式判断は[ADR-007](../../docs/development/decisions/ADR-007-seat-edit-commit-boundary.md#過去時点取得の対策比較と次の調査gd91-81)へ追跡する。環境識別子・設定とトークンはGit管理外とし、本番実装・3,000人試験と公開は行わない。

## 外部結果

[remote-summary.json](artifacts/remote-summary.json)は、Spark隔離環境でローカルと同一のRules・試験手順を使った結果である。通常要求はFirebase IDトークン、前提投入と回収は既存CLIアカウントのOAuth資格を使い、両者の結果を区別した。秘密鍵を発行していない。

| 比較対象 | ローカル／外部の結果 |
|---|---|
| 停止後の通常REST | 単一ノード・集合・並び順付きクエリー・shallowの4経路を、4条件とも401・0件で拒否 |
| 改変REST | readTime・transaction・newTransactionと別端末UIDを付けても、4条件とも401・0件。停止前は各要求200であり、不正形式の拒否だけを認可成功と数えていない |
| 既存SDK／REST受信 | 認可変更だけで観測期限内に停止。保存済み1件を保持し、停止後の追加を取り込まない |
| 新しいSDK要求・自己復帰 | 拒否。自己復帰は本試験の全クライアント書込み禁止による結果で、業務書込みRulesの証拠ではない |
| 別の有効利用者 | 同じ公演で継続。公演制御の停止時だけは別公演で継続し、2件受信 |

**結論：試した改変要求で現在の認可を迂回せず、停止後の拒否を最小構成で確認できた。Firestoreの既存候補が直った結果ではなく、Realtime Databaseの業務成立・本番移行を認める結果でもない。** RESTで時点指定を付けたことを、正式な過去時点APIの実行と呼ばない。

外部試行は153アプリケーション呼出し。準備7管理要求は[setup-summary.json](artifacts/setup-summary.json)へ分けた。SDK内部通信と再試行、転送量・保存容量の請求実数は未計測。無料600人必須・1,000人目標の人数試験には流用しない。

終了後に全拒否Rulesを再取得して一致を確認し、8試験ルートとDB全体が空であることを確認した。架空Auth 2利用者の削除と残数0、匿名認証設定の復元、請求先未登録も再取得確認した。データベースは残し、自動削除しない。

Sparkの最初のデータベースは公式コンソールからシンガポールへロックモードで作成した。公式の作成APIにBlaze限定の記載があるため、そのAPIは使用しなかった。初回のOAuth更新は失敗し、要求範囲を既存CLIと揃えると成功した。アカウントの再登録・権限追加はしていない。

## 確認手順と残条件

```powershell
node poc/GD91-82/audit.mjs
```

ローカルは`firebase.json`のdemoプロジェクトでAuth・Database Emulatorを起動し、`local.mjs`を実行する。外部の再実行はGit管理外の専用接続設定を読み、`setup-remote.mjs`で空データ・全拒否・請求先未登録を確認後、`remote.mjs --run-approved`を実行する。未回収の試行が残れば新しい試行を拒否する。ログとコンソール画像は`node_modules/.cache/`へ置き、Gitへ含めない。

本番候補の比較へ進む前に、次の残条件を計画する。Firestoreの225業務シナリオや容量・費用の証拠をRealtime Databaseへ流用しない。

- 本人・端末の結合、セッション発行、役割ごとの読書きとApp Check。
- 座席配置・交換と発券保護の一体確定、操作ID照会、競合と応答喪失。
- 暗号化IndexedDBとの復元、保持回収、無料600人・1,000人の通信量と接続数。
- アダプター契約・物理形式の変更、移行・切戻し条件、本番方式の採否。

公式資料：[Rules](https://firebase.google.com/docs/database/security/core-syntax)、[REST](https://firebase.google.com/docs/reference/rest/database)、[最初のデータベース作成](https://firebase.google.com/docs/database/web/start)、[作成APIの制約](https://firebase.google.com/docs/reference/rest/database/database-management/rest/v1beta/projects.locations.instances/create)。
