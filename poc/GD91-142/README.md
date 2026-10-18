# GD91-142 現候補の過去時点取得と採用ゲート

状態：In Review。#168の3案比較を採用ゲートへ照合する隔離試験。本番実装ではない。

```text
node poc/GD91-142/run-local.mjs
node poc/GD91-142/audit.mjs
node poc/GD91-142/gate-audit.mjs
```

Firestore中心はGD91-139、過去公演はGD91-136のRulesを変更せず使う。各候補を別のEmulatorプロセスで実行する。Firebase Auth 9496・Firestore 8386、専用demoプロジェクトだけへ接続する。外部サービスの認証・Rulesと課金設定は変更しない。

役割・端末・対象本文はowner前提で、本人からセッションを通常発行する。正常な現在取得を確認後、過去時点のbatchGetが失効前から同じ本文を返すことも確認する。その後、端末・役割・セッション・公演状態を個別に失効する。端末・役割は通常の本人要求、残りはowner前提である。正常な別公演は継続し、復元もowner前提とする。

両候補6群ずつ、計12群。8つの失効条件で現在のget・mask付きgetとbatchGetは403。失効前時刻を指定したbatchGetと読取り専用トランザクションは各8比較すべて本文を返した。現在取得の成功と拒否だけでサーバー認可全体を合格にしない。

このEmulatorのGET時刻指定は失効前から400となり、`Only timestamps past epoch are supported.`を返した。認可拒否には数えない。先行2失敗を保持し、正常な基準取得が成立したbatchGetと読取り専用トランザクションを評価対象にした。旧GD91-80・81の外部結果と今回の現候補ローカル結果は区別する。現候補の外部再試行はしていない。

[中心案](artifacts/center-summary.json)と[過去公演案](artifacts/archive-summary.json)、[監査](artifacts/audit-summary.json)を参照する。原データの時刻・本文は架空の隔離試験で、Authトークン・取引トークンは保存しない。各候補終了時に全拒否Rules・空データとAuth 0件を確認した。

結果を受け、全員版走査を改善する差分索引の追加より、Firestoreの直接過去時点取得を含む認可境界の再設計を先に判断する。方式全体の採用・移行ゲート変更と本番利用は承認していない。

[3案と#168全完了条件](../../docs/development/technical-validation/seat-capacity-validation.md#issue-168の比較判定と完了条件)に今回と既存の証拠を集約した。[全体ゲート監査](artifacts/gate-summary.json)は13ファイルを対応付け、旧業務・外部試行を再実行した件数へ加算しない。
