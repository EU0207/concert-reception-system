# GD91-79 SDK購読の環境差と失効時の認可

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #167でGD91-78の未達を切り分け、本番認可の確認が必要な境界を示す |
| 前提 | 既存SDK 12.18.0・localhostのdemo Emulator。架空データのみ。本番実装・外部Firebase接続なし |
| 結論 | Edgeで600人・1,000人の受信が収束。Nodeの継続受信は未達。失効と過去時点取得は最小Rulesでも再現し、本番原因は未確定 |

## 受信の比較

同じGD91-78のRules・固定クエリーを使用する。書込みは最大3件ずつ、通常端末の認可を通す。基礎データはowner投入であり、登録・発券からの全業務試験ではない。

| 条件 | 原データ | 結果 |
|---|---|---|
| Node、書込みと購読を同じSDKで実行、1,000人 | [1000-mixed.json](artifacts/1000-mixed.json) | 1,000書込み完了後も購読に未確定情報が残る。現在RESTは1,000 ID一致、新しいSDK接続は1,000件取得 |
| Node、書込みSDKと受信SDKを分離、1,000人 | [1000-separate.json](artifacts/1000-separate.json) | 受信専用側も未収束。現在RESTは1,000 ID一致。受信側の未確定フラグだけでは説明できない |
| REST送信・Node購読、SDK標準／強制長時間ポーリング | [標準](artifacts/node-rest-default.json)／[長時間ポーリング](artifacts/node-rest-longpoll.json) | 両条件とも6クライアントが未収束。送信方式と長時間ポーリング設定だけでは説明できない |
| REST送信・Edge購読、600人、SDK標準設定 | [600人](artifacts/browser-600-default.json) | 独立した認可6組・ブラウザー6コンテキストが全件受信 |
| REST送信・Edge購読、1,000人、SDK標準／強制長時間ポーリング | [標準](artifacts/browser-1000-default.json)／[長時間ポーリング](artifacts/browser-1000-longpoll.json) | 両条件とも6組が全件受信 |

Node・EdgeのREST送信比較は同じ生成手順・同じRulesを使う別データで、順次実行した。端末性能・負荷の同一性まで保証する比較ではない。Node・SDK・Emulatorのどこが原因かは未確定。Nodeだけの未達を製品の1,000人上限へ読み替えず、Edgeの限定収束を本番合格へ読み替えない。

Edgeは1台のPC上のheadless自動試験。6台の実機ではない。ブラウザーは受信専用で、同じブラウザーからのSDK書込みを含まない。受信は件数比較であり、全内容の業務投影・暗号化保存は接続していない。書込み後の観測期限10秒は、各イベントの5秒目標・10秒上限を計測した結果ではない。費用・転送量の実測も行っていない。

## 認可の切り分け

[authorization.json](artifacts/authorization.json)は10人の前提データで、本人役割・端末・セッションと公演制御を別々に失効する。状態の変更はowner投入による診断で、業務上の失効操作自体の合格ではない。

4条件すべてで、変更だけでは10秒以内の購読停止が通知されなかった。現在RESTと新しいSDK購読は拒否された。次の受付イベントでは既存購読も拒否され、保存済み1件を保持し、新しい1件は取り込まなかった。公演停止だけは通常受付も拒否されるため、次のイベントをowner投入して通知再評価を分離した。

失効前の`readTime`を指定するRESTは4条件とも200応答・1件取得だった。[最小再現](artifacts/minimal-authorization.json)でも同じ挙動を確認した。最小Rulesは、対象UIDに限定した認可文書1件を参照するだけで、座席の業務Rulesを含まない。現在取得と新規SDK取得は拒否され、次のイベントで既存購読も拒否された。

この結果は本番での漏えい確認でも、本番安全性の確認でもない。クライアントで購読を解除する対策だけでは、直接RESTの拒否を証明できない。[外部確認案と判断事項](../../docs/development/technical-validation/seat-capacity-validation.md#外部での認可確認案tech-dd91-079)へ追跡する。

## 保存境界と証拠

[regression.json](artifacts/regression.json)の3件は合格。RAM保存を意図的に失敗させ、直前データの保持と成功表示の抑止を確認した。明示再開で復旧する。同時刻3 IDの保持と公演混在の拒否も確認した。実IndexedDB・鍵供給の合格ではない。

前回GD91-78の失敗は変更しない。初回の計測不足は[preliminary-1000-mixed.json](artifacts/preliminary-1000-mixed.json)と[ソース写し](artifacts/preliminary-diagnose.mjs)で保持する。受信SDK分離試験は[当時のソース](artifacts/intermediate-diagnose.mjs)と照合し、後から追加した新規SDK取得の確認を遡って加算しない。ソース写しは証拠用で、実行入口ではない。

`audit.mjs`は記録とソースハッシュを照合し、未達と未確認を維持する。検査成功を無料成立・本番採用の合格とは扱わない。

## 再現

既存依存だけを使用する。PowerShell 7の第1ターミナルでGD91-78用Emulatorを起動する。

```powershell
node poc/GD91-78/generate.mjs
$env:JAVA_TOOL_OPTIONS=($env:JAVA_TOOL_OPTIONS+' -Xmx4096m').Trim()
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-78/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore
```

第2ターミナルでlocalhost配信を開始する。

```powershell
node poc/POC-004/node_modules/vite/bin/vite.js --config poc/GD91-79/vite.config.mjs
```

第3ターミナルで環境変数を設定し、比較を順次実行する。`1000-separate`の既存証拠はソース写しの版であり、現在の入口による再実行は新しい比較結果になる。

```powershell
$env:GCLOUD_PROJECT='demo-concert-seat-gd91-60'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8181'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191'
node poc/GD91-79/diagnose.mjs 1000 mixed
node poc/GD91-79/node-rest-diagnostic.mjs longpoll
node poc/GD91-79/node-rest-diagnostic.mjs default
node poc/GD91-79/browser-diagnostic.mjs 600 default
node poc/GD91-79/browser-diagnostic.mjs 1000 default
node poc/GD91-79/browser-diagnostic.mjs 1000 longpoll
node poc/GD91-79/authorization.mjs
node poc/GD91-79/regression.mjs
```

第1ターミナルでEmulatorを停止し、同じdemo ID・同じポートで最小Rulesへ切り替える。既存試験用の構成ファイルやRulesは書き換えない。停止で消えるのはEmulator内の架空データのみ。

```powershell
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-79/minimal.firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore
```

第3ターミナルで実行する。

```powershell
node poc/GD91-79/minimal-authorization.mjs
node poc/GD91-79/audit.mjs
node poc/GD91-78/audit.mjs
```

GD91-79では外部確認は未実行。2026-10-13、開発者がTECH-DD91-079のAを承認した。[GD91-80の接続準備](../GD91-80/README.md)へ引き継ぐ。無料600人必須・1,000人目標は維持し、3,000人は検証しない。外部Firebaseと課金設定はまだ変更していない。

公式根拠：[SDK通知と未確定情報](https://firebase.google.com/docs/firestore/query-data/listen)、[RESTの認証主体](https://firebase.google.com/docs/firestore/use-rest-api)、[readTime](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery)、[Emulatorと本番の差](https://firebase.google.com/docs/emulator-suite/connect_firestore)。これらの資料だけで、今回の現象の原因を公式に確認済みとは扱わない。
