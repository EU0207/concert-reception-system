# GD91-52 小片検査の段階集約

## 結論と範囲

状態はIn Review。読者は開発者、設計担当者、テスト担当者。

GD91-51の検査項目を維持して7段階から4段階へまとめる隔離候補。4段階の28ケースが合格し、500席の局所保存は2,250→1,500書込みとなった。3段階案は正常入力でも式評価上限に達したため、次の接続対象から除外する。本番の保存形式・Rulesは変更しない。

## 処理

1. 構成片と属性片を同時に隔離保存する。この時点では内容検査済みとしない。
2. [4段階Rules](four-step.rules)が各段階を検査し、成功時だけproofのstepを1増やす。
3. step=4は小片内の検査完了。区画全体の完成・公開可能を表さない。

| step | サーバーが確認すること |
|---|---|
| 1・2 | 各セルの形式・位置と旧セルID、消費番号と採番項目。旧自動席を保持し、非席からの追加は手入力に限定 |
| 3 | 両セルの席属性と理由。非席の属性はnull |
| 4 | 小片内の席IDと、同じ列の表示番号の一意性 |

末尾1セルも4段階を維持する。全段階で最新認可・管理状態と公開基準を照合する。データは作成後に更新・削除できず、証跡は対象版を固定してstepだけを進める。途中停止後は通常端末が進捗を照会して再開できるが、実機の通信断・復元試験を代替しない。

## 比較と試験結果

| 証拠 | 結果 |
|---|---|
| [基本診断](tests/diagnostic.mjs) | 3・4段階とも正常入力6件を受理。[3段階](artifacts/3-step-diagnostic.json)・[4段階](artifacts/4-step-diagnostic.json)に前後ソースハッシュを記録 |
| [方向・属性診断](tests/boundary-diagnostic.mjs) | [3段階](artifacts/3-step-boundary.json)は2受理・3上限到達。[4段階](artifacts/4-step-boundary.json)は5受理。いずれも前後ハッシュと進捗・データ再取得を記録 |
| [3段階の回帰試行](tests/emulator.mjs) | P01・02後、P03で上限到達して中断。[失敗記録](artifacts/three-step-attempt.json)のハッシュは失敗後の記録。完走結果や前後同一性の証明ではない |
| [4段階回帰](tests/four-step-emulator.mjs) | [28ケース合格](artifacts/four-step-summary.json)。500席と拒否条件、競合・権限失効と進捗再開を確認。GD91-51の25ケースを新段階へ対応させ、全属性・非席属性と最終段階前の失効を追加 |

親・列設定と旧構成、端末認可・本人セッションはfixture。その発行や全体完成を試験した扱いにしない。匿名認証端末から通常の保存・進捗取得を行い、管理用の再取得で保存内容を照合した。

500席・250小片で隔離保存500＋証跡1,000＝1,500書込み。書込み要求は250＋1,000＝1,250回。fixture作成・試験用再取得と認証要求は除外する。公開までの総費用や金額の削減率ではない。

静的参照上限は隔離保存6＋2＝8、証跡更新9、進捗単独取得5。キャッシュによる減算はしない。式評価回数の正確な測定ではなく、今回の対象で上限に達しなかった結果に限定する。

## 再現

既存のNode.js・Firebase CLIとJavaを使う。ルートでpwshを実行する。実Firebaseへ接続しない。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:GD91_FRAGMENT_WIDTH='2'
$env:GD91_PROOF_STEPS='4'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-52/four-step.firebase.json --project demo-concert-seat-gd91-52 --only auth,firestore 'node poc/GD91-52/tests/four-step-emulator.mjs'
```

基本診断は末尾を`node poc/GD91-52/tests/diagnostic.mjs`、方向・属性診断は`node poc/GD91-52/tests/boundary-diagnostic.mjs`に変更する。3段階を再現する場合は`GD91_PROOF_STEPS='3'`と`firebase.json`を使う。[3段階Rules](firestore.rules)を4段階の回帰試験へ組み合わせない。

## 残条件

次は小片をまたぐID・表示番号一意性と採番証明を接続する。全小片の進捗と対象版を全体完成判定へ結び付け、公開までの参照・式評価と総書込み数を確認する。

旧席全件比較・形や列設定の変更と公開境界、当日の編集・全業務回帰は未確認。異なる段階数の証跡を流用せず、方式採用時には検査方式の版・移行を定める。幅2も製品上限ではない。

正式な結果は[検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-52-小片検査の段階集約と費用比較)を参照。方式未採用・本番未着手。過去44件・63件の再実行、安全な回収・端末保存とSDK・実機試験は対象外。
