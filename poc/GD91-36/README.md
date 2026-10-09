# GD91-36: 本人証跡と役割変更後の端末準備

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101、GD91-35の段階Aの隔離候補。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-36-本人証跡と役割変更後の端末準備)を結果の正本とする。本番Rulesとして使わない。

## 実行

既存Node.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存なし。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-36-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-36/firebase.json --project demo-concert-seat-gd91-36 --only auth,firestore "node poc/GD91-36/tests/emulator.mjs"
```

## 範囲と前提

- 業務形式8を維持し、認可形式2を別候補にする。本人証跡と役割準備9ケース、既存保存48ケースを実行する。旧PoCは変更しない。
- 最初の主担当・役割・端末と初期controlは検査用管理経路で投入する。昇降格と端末準備の確認書込みは通常認可と監査を使う。案作成・結果検査の読取りは検査用管理経路であり、画面からの一連の管理操作ではない。
- 準備は役割版の確認記録であり、IndexedDBへ必要データが保存された証明ではない。臨時操作の可否は試験専用authorizationProbesで確認し、臨時管理者の業務処理は実装しない。
- 通常発行はAuth EmulatorのGoogle・passwordを使用する。時刻境界では署名のないEmulatorトークンのauth_timeだけを固定する。実Googleの署名検証・再認証操作を代替しない。
- 15分ちょうどは計算とrecentHumanAtへ固定時計を渡すRules試験で確認する。通常認可は同じ関数へrequest.timeを渡す。実時刻では880秒・920秒を確認し、15分ちょうどでの実操作は未確認。

架空データ・demoプロジェクトとloopbackだけを使う。保存の回帰は単一区画のREST commitであり、全編集・複数区画と差替え・回収は対象外。公演状態・取得範囲の段階B、SDK・IndexedDBと画面、受付同期と実機は未確認。

## コードと証拠

| 箇所 | 役割 |
|---|---|
| firestore.rulesのissueSession | 本人Authの認証時刻と対象端末を結び、形式を発行時に検査 |
| authorizedLevel、roleChange、prepareDevice | 3正本の最新照合。役割変更・準備確認を監査と一体保存 |
| tests/authorization.mjs | 通常発行、昇降格と端末A・B、再認証と偽装の確認 |
| tests/authorization-budgets.mjs、budgets.mjs | 旧全関数の参照数不変と既存10保存分岐、新規認可経路の予算 |
| artifacts/emulator-summary.json | 実行結果、開始・終了時のLF正規化ソースハッシュと前提 |

参照予算は式評価回数や請求額ではない。全形式検査を毎回繰り返す初案は初期保存で1000式の上限に達した。発行・更新を厳密に制限し、利用時は最新の認可条件を検査する候補を回帰する。測定結果は技術検証記録で追跡する。
