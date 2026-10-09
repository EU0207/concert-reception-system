# GD91-38 準備確認と隔離受領

状態：In Review。読者：開発者、設計担当者、テスト担当者。

Issue #101、GD91-35段階Bの一部を確認する隔離PoC。契約と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#準備確認隔離受領の候補gd91-38)、結果は[検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-38-準備確認と隔離受領)を参照する。本番コードと実Firebaseへの接続を含まない。

## 検証対象

- [Rules](firestore.rules)：GD91-36の認可を共用し、GD91-37の状態・取得範囲へ準備確認と隔離送信を追加した候補。認可形式2を維持し、配布目録と隔離記録は隔離形式1とする。旧データの移行ではない。
- [結合試験](tests/emulator.mjs)：Auth・Firestore EmulatorへREST要求を送る。前回の9シナリオと[追加9シナリオ](tests/recovery.mjs)を同じRulesで実行する。本番アプリの単体テストとは区別する。
- [静的参照予算](tests/budgets.mjs)：選択分岐ごとに算定。同一パスの再参照も数え、キャッシュ削減を見込まない。Map.getは文書アクセスから除外する。式評価量・請求額の実測ではない。

役割・端末と初期状態、配布目録を検査用管理経路で投入する。停止指示と失効条件、昇格は管理投入であり、正式な管理操作の完成を意味しない。本人セッションの発行・更新、準備確認と隔離送信は通常認可。案作成と結果検査にも検査用管理経路を使う。

## 経路

準備確認は、本人が最新の役割版と配布目録を照合し、端末の準備済み版と確認記録を2文書で一体保存する。配布目録の件数・ハッシュはサーバー上の目録との一致だけを検証する。実際のダウンロード件数、暗号化とIndexedDB保存を証明するものではない。準備確認記録は有効な本人または管理者だけが照会し、停止後の通常照会は拒否する。

隔離送信は、端末の匿名Authを過去に確認済みの本人証跡へ結合する。停止指示の版・時刻を照合し、記録本体・連番予約・受領票を3文書で一体保存する。通常経路が有効な当日端末の迂回送信は拒否する。停止・期限失効等の経路でも通常受付へ自動反映せず、停止を解除しない。

隔離本体は試験用の最小イベント。生QRや氏名を含めず、観測対象の架空IDと種別だけを持つ。受領票は自端末の個別取得だけを許し、スタッフへ隔離本体を配布しない。元イベントを更新・削除する経路は設けない。

## 実行

既存POC-004のFirebase CLIを使う。依存追加は不要。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-38-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-38/firebase.json --project demo-concert-seat-gd91-38 --only auth,firestore 'node poc/GD91-38/tests/emulator.mjs'
```

Authは127.0.0.1:9191、Firestoreは127.0.0.1:8181に限定する。実行前後のソースハッシュを[証拠](artifacts/emulator-summary.json)へ記録する。署名なしAuth Emulatorトークンを本番の認証確認へ読み替えない。

## 未確認

端末に実際に保存済みだった事実をサーバーの目録や申告時刻だけで証明しない。PWA・画像とカメラ練習、暗号化とIndexedDB、会場期限を含む全準備の成立は未確認。SDK・実キューでの応答喪失と再起動、Google実認証と実機も未実施。

締め済みは自動隔離送信を拒否し、管理者照合を待つ条件を維持する。照合の許可発行と採否判断、正式受付へ反映する別イベントは未接続。隔離記録の受領を全件受領や削除許可へ流用しない。臨時本人の当日履歴取得と配布の正本との一体公開、全保存への合同接続も残る。

GD91-36の保存48シナリオをこのRulesで回帰していない。全編集と複数区画、差替え・回収を含む確認と方式採用は後続ゲートで判断する。
