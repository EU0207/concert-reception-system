# GD91-77 受付イベントの追記と差分取得

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #167で座席情報の再利用と、BD-03-05の受付差分取得を接続する |
| 前提 | 既存依存・ローカルdemo Emulator・架空データだけを使用。本番方式は未採用 |

## 結果と制約

[receipt-summary.json](artifacts/receipt-summary.json)の21ケースが合格。600人・1,000人の受付追記を通常の端末認可で行い、6利用者・6端末のRESTクライアントが同じイベント集合へ収束した。既存PoCの合格数へ加算しない。

来場者・座席と券の基礎情報はownerによる前提投入。通常登録・発券からの全業務、QRの実読取りと本番の資格照合を証明しない。保存はRAMの試験用journalで、GD91-76の暗号化ブラウザー保存との合同試験ではない。実機・プロセス再起動と共有時間も未確認。3,000人は試験しない。

| 人数 | 通常の受付追記 | 6クライアントが受信した件数 | 再利用後の座席情報取得（1クライアント） |
|---|---:|---|---|
| 600 | 600書込み・204要求 | 各600件 | 4要求・6文書 |
| 1,000 | 1,000書込み・336要求 | 各1,000件 | 4要求・6文書 |

再取得時の個人別受付状態取得は0件。差分から導出した状態を座席投影へ渡す。最後まで取得済みの範囲をもう一度同期した時、過去イベントの反復取得は6クライアントとも0件だった。

## 処理と確認

- `receipt.rules`：通常稼働中の追記専用経路。現在の本人・端末認可と公演状態を検査し、券の資格版を照合する。更新・削除を拒否する。既存GD91-73のRules本文は変更しない。
- `receipt-client.mjs`：UUIDの同一IDで送信・結果照会する。応答喪失後に別IDを作らず、照会では受領時刻以外の全内容を比較する。初回受付と理由付き再読取りが対象で、訂正・取消し等は未接続。
- 差分取得は受信時刻と文書名でページを進める。最初の応答の時刻を上限フィルターにし、各ページは現在状態で読む。受信イベントとカーソルを一緒に保存してから先へ進む。完了時に上限時刻を保存し、次回はその時刻を含めて重複排除する。
- ページ間の失効・保存失敗と取得中の新着を試験する。同じ人の並行初回受付を両方保持し、到着順で上書きせず競合へ導出する。同じ端末連番の別イベントも異常として検出する。

追記は1文書あたりキャッシュ減算なしで6参照、最大3文書の要求で18参照。差分クエリーの稼働中認可は4参照。他の業務書込みの20参照保証、式評価回数と本番索引の成立には流用しない。停止後到着は既存の管理者確認経路へ渡す必要があり、今回その合同試験は行っていない。

## 過去時点の読取りに関する未解決事項

固定`readTime`による試作は、失効後の読取りを拒否する試験で失敗した。[失敗記録](artifacts/failed-1791812515726.json)を保持する。[独立診断](artifacts/read-time-diagnostic.json)では、失効端末の現在読取りは403、失効前の`readTime`を指定した読取りは200で1文書を返した。未認証ではいずれも403だった。

現候補のアプリ取得は過去時点を指定しない。これは直接APIの問題を解決したという意味ではない。本番での再現・仕様解釈は未確認であり、#110・168の認可ゲートへ残す。クライアント側の禁止だけでサーバー防御が成立したと扱わない。外部Firebase接続や課金設定の変更は行っていない。

## 費用の比較

[budget-estimate.json](artifacts/budget-estimate.json)は、6クライアント・30分・5秒ごとの取得を仮定した机上値。ポーリング方式は未採用で、5秒目標・10秒上限を実測した結果ではない。

空クエリーの最低1読取り、Rules依存と追加ページを含める。明示した2つの並び順は索引読取りも評価対象となるため、1問い合わせにつき索引読取り1件を仮置きする。索引走査を計測しておらず、上限保証ではない。

| 人数 | 安全係数2の読取りモデル | 各問い合わせで境界1件を再受信する場合 |
|---|---:|---:|
| 600 | 40,992 | 45,312 |
| 1,000 | 50,832 | 55,152 |

準備・急な変更と再試行は含まない。600人の全業務無料成立は未判定、1,000人はこの仮定だけでも日次50,000読取りを超える。保存量・通信量とブラウザー結合を含む全体判定は[容量検証記録](../../docs/development/technical-validation/seat-capacity-validation.md#gd91-77-受付イベントの差分取得)へ集約する。

公式根拠：[カーソル](https://firebase.google.com/docs/firestore/query-data/query-cursors)、[runQuery](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery)、[依存・空クエリー・索引の課金](https://firebase.google.com/docs/firestore/pricing)、[Emulatorの制約](https://firebase.google.com/docs/emulator-suite/connect_firestore)。Emulator合格を本番の上限・請求測定に置き換えない。

## 再現

PowerShell 7で実行し、追加の依存は導入しない。[GD91-73](../GD91-73/README.md)の生成済みRulesを利用する。未生成の環境では同文書の手順で生成してから実行する。

```powershell
node poc/GD91-77/generate.mjs
$env:JAVA_TOOL_OPTIONS=($env:JAVA_TOOL_OPTIONS+' -Xmx4096m').Trim()
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-77/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore
```

別ターミナルで次を実行する。

```powershell
$env:GCLOUD_PROJECT='demo-concert-seat-gd91-60'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8181'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191'
node poc/GD91-77/validate.mjs
node poc/GD91-77/read-time-diagnostic.mjs
node poc/GD91-77/budget-estimate.mjs
node poc/GD91-77/audit.mjs
```
