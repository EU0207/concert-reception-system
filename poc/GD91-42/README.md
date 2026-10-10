# GD91-42 正本分割後の業務保存回帰

状態：In Review。読者：開発者、設計担当者、テスト担当者。

GD91-36の業務保存を、GD91-41の公開表示名分離へ接続する隔離検証。本番アプリケーションではない。認可形式2を維持し、業務形式は10とする。

## 対象と証拠

- [自動結合試験](tests/emulator.mjs)は認可A01～09、既存保存Q01～48、追加接続F01～06の63シナリオ。Qの試験本体はGD91-36と文字列比較する。保存アダプターとRulesは変更しており、旧コード全体が無変更という意味ではない。
- [結果JSON](artifacts/emulator-summary.json)へ実行前後22ソースハッシュ、参照予算と各結果を記録する。GD91-41のE01～09を無変更で再実行した結果には数えない。
- 詳細設計DD91-T68・69と[検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-42-正本分割後の業務保存回帰)へ追跡する。主要試験を別文書へ複製しない。

## 接続方法

管理正本attendeesから表示名を除き、attendeeLabelsへ分ける。登録は両正本と索引・共通版・管理履歴を5文書で一体保存する。表示名変更は管理正本を更新せず、索引のID集合も保持する。当日は本人履歴を加えた5文書となる。

旧業務保存のgeneration・eligibleAttendeeIdsを維持し、共通版と索引にlabelOperationIdを加える。形式9とは構造が異なるため業務形式10を割り当て、旧形式を移行・上書きしない。当日準備は形式10と受付配布版を照合する。同じ数値の形式9準備を許可しない。

labelOperationIdは表示名経路を選ぶための項目であり、許可根拠ではない。共通版・表示名と索引、管理履歴・本人履歴の相互照合を要求する。独立した許可条件に分け、旧経路はこのマーカーが現在操作と異なる場合だけ評価する。表示名変更後の通常保存も確認する。

受付配布版は名前・配置と割当、QR資格・不参加等の公開対象が変わるときに進める。入金のみ・券チェックのみでは据え置く。操作名だけに頼らず、各子文書で変更項目を検査する。

発券後の表示名変更理由は、公演日前もBD-04-04に従う。中央でticketStateを1参照し、手動チェックを解除しただけで理由を省略できないようにする。公演当日は未発券でも理由を必須とする。

## 再実行

既存POC-004のNode.js・Firebase CLIとJavaを使用する。依存追加や実Firebase接続は不要。ローカル9191・8181番ポートが空いていることを確認し、pwsh 7で実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-42-config'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-42/tests/budgets.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-42/firebase.json --project demo-concert-seat-gd91-42 --only auth,firestore 'node poc/GD91-42/tests/emulator.mjs'
```

GD91_CASEは個別診断用。設定した実行を全63件の証拠にしない。実行中は対象ソースを変更しない。ハッシュの改行はLFへ正規化する。

## 参照予算と限界

[算定コード](tests/budgets.mjs)は同一文書の再参照も数え、キャッシュ削減を見込まない。通常登録は20、入金のみは16、当日表示名変更は20、公演日前変更は15参照。旧QR・不参加等10経路の予算は維持する。要求上限20・文書上限10に対し、上限ちょうどの経路が残る。請求量・式評価数の実測ではない。

公演・本人と端末の初期値、当日状態と準備版は管理権限で前提投入する。通常のAuth発行・セッション、業務初期公開と登録、割当・券・不参加は通常の認可要求を使う。仮のfixtureや管理投入を本番の公演作成・配布目録発行の合格へ読み替えない。

単一区画の既存48保存の限定回帰である。全構成編集・複数区画と差替え回収は未接続。購入者全体参照・初期表示名解決、配布目録と端末保存の完全性も残る。SDKの再試行・IndexedDB・実キュー、Google実認証と実機は未実施。方式採用・本番開始を含まない。
