# GD91-41 正本分割後の登録・表示名変更

状態：In Review。読者：開発者、設計担当者、テスト担当者。

GD91-40の接続契約を、業務形式9の隔離Rulesで確認する。認可形式2を維持し、最新の本人・端末照合を中央の一回へ集約する。本番アプリケーションではない。

## 対象と証拠

- 管理正本と公開表示名を別文書として通常登録する。当日の表示名変更は共通版・表示名・索引と管理履歴・本人履歴を一体保存する。
- [自動結合試験](tests/emulator.mjs)はE01～09。[結果JSON](artifacts/emulator-summary.json)に試験範囲、時間とソースハッシュを記録する。
- [参照算定](tests/budgets.mjs)は通常登録18、当日表示名変更19、公演日前変更14。同一文書の再参照も数え、キャッシュ削減を見込まない。実際の請求量・式評価数の測定ではない。
- 詳細設計のDD91-T68・69と[検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-41-正本分割後の登録表示名変更)へ追跡する。

認可の13補助関数はGD91-36と文字列比較する。authorizedLevelから本人照合だけをidentityへ切り出し、その条件と役割分岐を比較する。全認可コードが無変更という意味ではない。

## 再実行

既存POC-004のNode.js・Firebase CLIとJavaを使用する。依存追加、実Firebaseと実在データは不要。ローカル9191・8181番ポートが空いていることを確認する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-41-config'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-41/tests/budgets.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-41/firebase.json --project demo-concert-seat-gd91-41 --only auth,firestore 'node poc/GD91-41/tests/emulator.mjs'
```

pwsh 7で実行する。GD91_CASEは個別診断用であり、設定した実行を全9件の証拠にしない。実行中は対象ソースを変更しない。ハッシュの改行はLFへ正規化する。

## 前提と限界

公演初期値・権限と端末、公開割当と準備版は管理権限で前提投入する。本人認証とセッション発行はAuth Emulatorの通常経路を使用する。500人の管理正本と表示名はすべて管理端末の通常要求で作成し、直接投入しない。

準備期間の管理編集は受付データ再取得を毎回要求しない。当日の変更はデータ形式9と受付配布版の一致を必須とする。名簿索引の更新マスクを使い、臨時管理者へ購入者情報や全ID集合を読ませない。

表示名は半角・全角空白を除いたUnicodeコードポイント1～6文字を正規表現で検査する。6個の絵文字も試験する。保存値の空白は維持し、改行・タブを拒否する。[Rules文字列の公式資料](https://firebase.google.com/docs/reference/rules/rules.String.html)も参照する。空欄からの初期値解決・購入者参照の全体契約は#93への未接続事項。

公演日判定はcontrolの固定境界とrequest.timeを使う。日付境界の発行と状態遷移は今回実装しない。dateProbesは同じ判定式の境界値試験専用であり、業務保存の時刻入力口ではない。当日の新規登録と終了後訂正も対象外で、拒否を業務仕様の変更と扱わない。

初回取得は500文書を20並列でgetする。以後の1対象変更は1文書だけ取得し、他499件の端末内値を保持する。目録が未接続のため、この試験だけで複数変更の取り逃し回復を証明しない。時間はローカルEmulatorだけの値で、回線性能や課金量の根拠にはしない。

GD91-36の48保存シナリオを同じRulesで回帰した結果ではない。公演状態変更・席編集と券操作、配布目録・端末永続化は未接続。RESTの競合・再送をSDKの応答喪失と読み替えない。IndexedDB、実機とGoogle実認証は未実施。方式採用と本番開始は含まない。
