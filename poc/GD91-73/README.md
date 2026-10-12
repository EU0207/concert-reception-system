# GD91-73 差分公開と共有版の合同比較

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #166の配布・共有契約を、従来の業務保存と同じ候補へ接続する |
| 前提 | 架空データ、既存依存とローカルEmulatorのみ。本番コード・方式採用・実機手動試験は対象外 |

## 方式とデータの流れ

1. 完成した不変構成を再利用する。区画表示は通常の管理権限で確定前に用意する。
2. 確定の同じ要求で`publicIndex/current`を更新する。現在8版と構成参照先、席と来場者IDの対応だけを保持する。
3. 確定に必須の履歴が索引との一致を検査する。索引側は確定後の正本と割当を照合する。片側だけの更新は拒否する。
4. 明示的なオンライン取得時に`projection.mjs`で共通投影を組み立てる。一般受付は現在世代と割当済み表示名だけを取得する。前後の索引が違えば混在結果を破棄する。

区画名・舞台と非席配置を含む。スライドは移動量を結合し、席ID・表示番号を維持する。購入者情報と管理履歴は取得しない。受領中の版変更による再取得と、確定後の全席再発行待ちは区別する。画面再描画ごとに取得する設計ではない。

共有は`sharedDrafts/{operationId}`と`sharedDraftHead/current`を一体保存する。`expectedSharedVersion`が現在版と一致した場合だけ選択版を1増やす。正本・受付の索引は変更しない。過去記録を再利用したhead変更と、同じ版からの二重更新を拒否する。

`sdk-adapter.mjs`の`preparePlan`は通常管理権限で索引を提案へ含める。その後、提案全体を端末へ保存してから送る。送信時に案を追加・組み替えない。元のSDKの同一ID照会と、暗号化IndexedDBの完了境界を維持する。

## 試験と証拠

| 対象 | 結果ファイル | 件数 |
|---|---|---:|
| 受付投影、500人・2区画、境界拒否 | [projection-summary.json](artifacts/projection-summary.json) | 16 |
| 共有版競合、部分送信、同一ID復旧 | [shared-summary.json](artifacts/shared-summary.json) | 9 |
| 既存保存・券・専用編集 | `*-regression.json`のindividual～lifecycle | 139 |
| 正式認可・公演状態 | [access-regression.json](artifacts/access-regression.json) | 26 |
| 通常Web SDKの接続 | [sdk-summary.json](artifacts/sdk-summary.json) | 26 |
| 実EdgeのIndexedDBと再起動 | [browser-summary.json](artifacts/browser-summary.json) | 9 |

全件の判定は[正式な合同記録](../../docs/development/technical-validation/seat-business-integration-validation.md)と各JSONのfilter・前後ハッシュを確認する。診断実行や過去候補を加算しない。

旧139件はケース本体を保持し、試験専用`transport-hook.mjs`が索引を追加する。旧ケース内の`writes`は元の提案件数であり、追加後の実送信件数ではない。実送信はSDK結果の`writes`と投影P08・P11で記録する。フックのowner読取りは提案組立ての代用。ownerによる初期正本の投入は前提として区別し、通常初期化の試験も維持する。

SDKの提案組立て、区画表示の作成と一般取得は通常権限で確認する。受付済み記録と一部状態・配布目録は前提投入。鍵配布と画面の結合は本番実装の証拠にしない。断片幅2、区画名100文字は隔離評価条件で、製品上限の決定ではない。

## 制約と再現

- 500席の割当・スライドの最終要求は元の3件＋索引1件。確定後の全席複製は0件。構成準備・通常登録の書込みは別に発生する。
- `tests/budgets.mjs`は重複を減算しない算定で、保護付き交換23参照、構成公開25参照。20参照以内の静的保証は未達。Emulator合格を本番上限・請求量の確認として扱わない。#167・168の必須ゲートへ引き渡す。
- 一部参照がキャッシュされ得ることは[公式資料](https://firebase.google.com/docs/firestore/security/rules-conditions#access_call_limits)に記載されるが、この候補の減算回数を保証しない。
- 端末保存は暗号化500席・プロセス再起動を自動確認する。物理的容量不足・電源断、実パケット喪失とPWAオフライン起動は未実施。

PowerShell 7で次を実行する。別ターミナルでEmulatorを起動し、Rules更新完了後に試験する。

```powershell
node poc/GD91-73/generate.mjs
node poc/GD91-73/prepare-tests.mjs
$env:JAVA_TOOL_OPTIONS=($env:JAVA_TOOL_OPTIONS+' -Xmx2048m').Trim()
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-73/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore
```

```powershell
$env:GCLOUD_PROJECT='demo-concert-seat-gd91-60'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8181'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-73/tests/budgets.mjs
node poc/GD91-73/tests/emulator.mjs
node poc/GD91-73/tests/shared.mjs
node poc/GD91-73/tests/regression-remaining.mjs
node poc/GD91-73/tests/access-regression.mjs
node poc/GD91-73/tests/sdk.mjs
```

ブラウザー試験は別ターミナルで`node poc/POC-004/node_modules/vite/bin/vite.js --config poc/GD91-73/vite.config.mjs`を起動後、同じ環境変数で`node poc/GD91-73/tests/browser.mjs`を実行する。既存Edgeの隔離プロファイルを使用し、追加インストールをしない。

修正前の失敗JSONを保持する。正本へ直接フェンスを足す候補は評価量上限へ達したため、従来の業務検査を保ったまま必須履歴へフェンスを置いた。公演状態履歴にはresultVersionsがないため正本の確定後版を照合する。共有競合は403または409を拒否結果として扱う。

既存回帰は最終Rulesで51件、再開後に名簿12件を完了した。旧ケースの名前付きimportの順序違いも共通の`budget-compat.mjs`へ接続し、未実行の初期作成・不参加・券76件を再開する。Rulesとケース本体は変更しない。`regression-remaining.mjs`は通常139件を実行し、`GD91_RESUME=1`の場合だけ残76件を実行する。スイートごとの全件結果と共通Rulesハッシュを照合し、候補間の合格を合算しない。

初回公開の部分送信では、未作成の割当を補助読取りした試験入口がundefinedを符号化して停止した。未完了76件の入口`transport-partials.mjs`では空の案へ正規化し、Rulesまで送って拒否を確認する。正常要求の案と共通Rulesは変えない。完了済み63件の入口はハッシュ照合用に保持する。

[環境障害記録](artifacts/runtime-failure.json)：長時間の試験後、Javaヒープ不足でHTTP 500が発生した。隔離Emulatorをプロセス限定の最大ヒープ2GiBで再起動し、未完了スイートを順次実行する。恒久設定やRulesを変更しない。この現象を本番の容量評価や業務検査の拒否へ数えない。
