# GD91-60 本人認可・公演状態と完成候補の接続

状態：In Review。読者：開発者、設計担当者、テスト担当者。

#166の第1完了条件を対象とする隔離PoC。GD91-59の構成候補へGD91-35のA・Bを接続する。正式な判定と残条件は[合同検証記録](../../docs/development/technical-validation/seat-business-integration-validation.md)に集約する。本番方式の採用・アプリケーション実装は対象外。

## 処理とデータ

1. 本人のAuth Emulator認証から、登録済み端末へセッションを通常発行する。構成検査・候補発行と確定は同じ本人・端末・役割を参照する。
2. 昇格・降格は役割と監査の2件を一括保存する。昇格後の端末準備は目録に対する受領確認、セッション更新は本人認証からの発行として分ける。
3. 開始・停止・終了はcontrol・publicStatusとperformanceEvents、versionsの4件を一括保存する。共通版のcontrol・commit・receptionを進め、開始前の候補を拒否する。
4. 構成公開と開始を同時に送り、最初の成功が最大1件であることを確認する。双方未確定なら結果を照会し、同じIDによる明示再操作後の成功を確認する。V1の500席候補・割当も同じ内容を検査する。

状態アダプターも共通版を先に送る。ただし、順序統一後もEmulatorのロック待ちで双方未確定となる場合を観測した。J04は10回の同時要求を実行する。双方拒否のときは全正本の不変と両操作IDの不存在を照会し、明示再操作を試す。403を一律再送する実装ではなく、対象は試験で観測した409 ABORTEDと403のRules内部参照エラーの組合せに限定する。SDKによる分類と案内は後続確認。

GD91-39の読み取り・準備受領・隔離の条件を同じpublicationShowsへ接続した。受付用表示は試験投入であり、構成・業務正本からの通常発行は未接続。独立したseatFactsと表示名コピーの保存経路は追加していない。

## 自動確認

| 実行 | 範囲 |
|---|---|
| access-emulator：26件 | A01～08、B01～09とC01～09。本人認可・4役割と4状態、準備受領と隔離。Cは試験IDであり、GD91-35の保存全体回帰「段階C」の完了ではない |
| completion-emulator：14件 | GD91-59の構成変更・応答喪失と別プロセス復旧を、新Rulesと通常発行セッションで再実行 |
| joined-emulator：7件 | 通常認可の候補発行、開始との競合と部分送信、同一500席候補と失効の合同確認 |

[全体結果](artifacts/integration-summary.json)に実行前後のソースハッシュを記録する。旧GD91-58の129件とGD91-42の63件を今回の実行数へ加えない。GD91-59からの14件は今回実行した回帰であり、新規47件とは呼ばない。

状態遷移の静的参照は7＋1＋3＋4＝15、構成公開は8＋6＋6＝20。キャッシュ減算なし。[budgets.mjs](tests/budgets.mjs)で元の認可・完成証明22関数を照合する。式評価数・請求量の測定ではない。

## 再実行

既存Node.js・Java・Firebase CLIだけを使用する。pwsh 7で実行する。対象は127.0.0.1の9191・8181番ポートとdemoプロジェクトに限定する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-60-config'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-60/tests/budgets.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-60/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-60/tests/run-all.mjs'
```

実行中は対象ソースを変更しない。部分実行を全件合格の根拠にしない。失敗時は修正後に全件を再実行し、起動・試験修正の記録は[first-attempt.json](artifacts/first-attempt.json)に残す。

## 前提と未確認

- 初期主担当・端末登録と旧構成、業務初期値は試験投入。500席の候補・割当はV1の保存結果を変更せず再投入する。500人の業務保存を今回実行した意味ではない。
- 配布目録の発行・完全性は未接続。準備受領の成功は、IndexedDBへの保存完了の証明ではない。隔離受領は受付への反映を許可しない。
- 席・券・QRと専用編集の全保存回帰は#166の残条件。共有下書きの保存と確定の接続も残る。閉じる操作の遷移は対象外で、締め後の取得拒否は試験投入した状態で確認する。
- SDK・実キューと実機、Googleの実認証は未実施。オフライン端末の即時失効を保証しない。費用・回収と方式採否は#167・168へ引き継ぐ。
