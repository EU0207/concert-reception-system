# GD91-75 公開座席表のまとめ取得と再利用

状態：In Review。#167の取得量改善を比較する隔離PoC。本番方式の採用・Issue完了を意味しない。仕様・主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md)、結果の要約は[容量検証記録](../../docs/development/technical-validation/seat-capacity-validation.md#gd91-75-取得量の改善比較)を正本とする。

## 対象と結果

10人・500人と600人・1,000人の架空データで、従来の投影と同じ結果になることを確認する。3,000人の試験は実施しない。GD91-73のRulesを変更せず、通常の受付担当者が発行した端末セッションで取得する。

前提データはownerで投入した**取得専用の試験データ**。600人・1,000人の通常登録・確定ができた証拠ではない。現Rulesの登録上限500人は残る。

| 人数 | 1件ずつの取得要求 | まとめ取得の要求／文書数 | 同じプロセスで再取得の要求／文書数 |
|---|---:|---:|---:|
| 10 | 56 | 24／56 | 8／14 |
| 500 | 2,006 | 673／2,006 | 171／504 |
| 600 | 2,406 | 805／2,406 | 204／604 |
| 1,000 | 4,006 | 1,341／4,006 | 338／1,004 |

取得比較4件とEmulator異常系7件を[read-summary.json](artifacts/read-summary.json)へ記録する。応答順序・欠落と通信失敗等の単体10件は[transport-summary.json](artifacts/transport-summary.json)へ分ける。過去のV2件数へ加算しない。

## 処理と制約

`projection.mjs`は公開索引を取得し、同じ世代の構成片・表示名と最新受付状態を結合する。最後に公開索引を再取得し、不一致なら混在した結果と今回の取得候補を採用しない。

`read-client.mjs`は文書名で応答を対応付ける。[batchGet](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/batchGet)の応答順は保証されない。区画表示は2件まで、その他は3件までの要求とする。稼働中の一般受付担当者の当該読取経路で、区画表示は1文書8参照・要求16参照以内、その他は最大6参照・要求18参照以内を、重複参照の減算なしで算定する。管理者・締め後の全分岐や書込みの上限を保証する証拠ではない。

再利用するのは世代付きの構成と来場者版付きの表示名。公演・利用者と端末ごとのインスタンス内RAMへ保持する。最新認可を伴う公開索引照会を再利用前後に行う。失効時は保持分を破棄する。部分取得・版不一致では新たな保持分を採用せず、429や通信失敗を自動再試行しない。

再起動をまたぐ暗号化保存、SDK・実機のオフライン表示と当日の差分同期は今回の対象外。受付状態は毎回取得しており、受付のたびにこの全体取得を呼ぶ方式を提案しない。取得前後の索引照合だけで受付状態全体の同一時刻性を保証しない。

## 費用モデル

単一端末の観測を6端末分へ乗算した机上値で、6端末同時試験・本番課金の実測ではない。`直接取得文書数＋5×要求数＋人数`を1端末の保守的モデルとする。5件は共通する端末・セッションと役割、公演状態と公開索引。受付状態のexists用に人数分も加算する。[公式課金規則](https://firebase.google.com/docs/firestore/pricing#cloud_firestore_security_rules)の同一要求内の依存文書重複除外を使用する。別要求間は除外しない。

| 人数 | 6端末の初回モデル | 6端末のRAM再利用モデル | 再利用モデル×安全係数2 |
|---|---:|---:|---:|
| 600 | 42,186 | 13,344 | 26,688 |
| 1,000 | 70,266 | 22,164 | 44,328 |

初回は文書数が減らず、要求数だけが減る。再利用時は構成・表示名の文書取得も減る。1,000人の初回6端末モデルは日次無料50,000読取りを超える。RAM再利用だけで前日取得を翌日の再起動後にも維持できるとは扱わない。

この表に当日の受付送信・再入場と差分受信、急な変更・再試行を含めていない。準備の全要求、通信量と保存容量も別途必要であり、無料600人・1,000人の全業務成立は未判定。

## 再現

既存の依存だけを使う。PowerShell 7の1つ目のターミナルでEmulatorを起動する。

```powershell
$env:JAVA_TOOL_OPTIONS=($env:JAVA_TOOL_OPTIONS+' -Xmx4096m').Trim()
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-73/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore
```

2つ目のターミナルで実行する。接続先は既存transportのlocalhost・demo固定ガードで制限する。

```powershell
$env:GCLOUD_PROJECT='demo-concert-seat-gd91-60'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8181'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191'
node poc/GD91-75/transport-tests.mjs
node poc/GD91-75/validate.mjs
node poc/GD91-75/audit.mjs
```
