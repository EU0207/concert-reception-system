# GD91-37 公演状態と役割別取得範囲

状態：In Review。読者：開発者、設計担当者、テスト担当者。

Issue #101、GD91-35の段階Bの一部を確認する隔離PoC。正式な契約と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#公演状態取得範囲の候補gd91-37)、結果は[検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-37-公演状態と役割別取得範囲)を参照する。本番コードと実Firebaseへの接続は含まない。

## 構成と範囲

- [Rules](firestore.rules)：GD91-36の認可形式2を共用。状態管理と表示用文書は隔離形式1で、業務形式8の移行ではない。
- [試験](tests/emulator.mjs)：4役割・4状態、getと一覧、部分送信と競合を確認。operationChecksは許可表の試験専用要求であり、実際の受付更新ではない。
- [参照予算](tests/budgets.mjs)：同一パスの再参照も数え、キャッシュ削減を見込まない。請求量・内部容量と式評価数の測定ではない。

最初の主担当等の役割・端末と初期control、配布文書は検査用管理経路で投入する。本人セッションの発行と開始・準備戻し・終了は通常認可。案作成と結果検査には検査用管理経路も用いる。旧認証時刻と失効、準備データ版は管理経路で条件を投入して試す。

表示用文書は管理情報から分け、一般受付へ現在の席・受付状態と緊急変更の用途を渡す。公開入口で管理項目の混入を拒否するが、業務正本からの投影の正しさと一体公開は未接続。任意項目は暗号鍵準備が未接続のため全役割へ拒否する。臨時管理者自身の当日操作記録の取得も未接続。

## 実行

既存POC-004のFirebase CLIを使用する。依存追加は不要。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-37-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-37/firebase.json --project demo-concert-seat-gd91-37 --only auth,firestore 'node poc/GD91-37/tests/emulator.mjs'
```

Authは127.0.0.1:9191、Firestoreは127.0.0.1:8181に限定する。実行前後のソースハッシュを[証拠](artifacts/emulator-summary.json)へ記録する。架空データだけを使用し、署名なしAuth Emulatorトークンを本番認証の確認と扱わない。

## 未確認

締め処理の業務前提、正式な端末登録・停止、準備完了の通常更新とIndexedDBの完全性は未確認。停止後の保全・隔離受領とSDK・実機も含まない。deviceStatusは投入した最小表示の取得許可だけを試し、停止元からの更新を証明しない。

既存の初期公開・券・不参加等をこの新しいRulesで回帰していない。GD91-36の57シナリオは当時の証拠として保持する。全編集と複数区画、差替え・回収を含む合同検証と物理方式の採用は後続ゲートで判断する。
