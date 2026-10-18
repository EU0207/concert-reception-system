# GD91-140 SDK期限境界の最小診断

状態：In Review。#168の設計検証。GD91-139の期限反例を、業務スキーマから切り離して調べる。本番コードではない。

```text
node poc/GD91-140/run-local.mjs
node poc/GD91-140/sdk-inspection.mjs
node poc/GD91-140/audit.mjs
```

POC-004にあるFirebase 12.18.0・CLI 15.28.2とPlaywright・Viteを使う。Node 24、Javaとインストール済みEdgeが必要。依存関係を追加しない。demoプロジェクトのFirestore 8384・Auth 9494へ接続し、ブラウザ用配信は127.0.0.1:4891に限定する。外部要求はブラウザ側でも拒否する。NodeとEdgeを別のEmulatorプロセスで実行する。

匿名本人1件と試験用文書を前提投入する。業務上の役割発行・端末準備の合格ではない。管理用ownerで時刻・停止条件を変更し、同じ匿名IDのSDK・REST GETとbatchGetで結果を比較する。SDKが受理した場合は、直前に更新したカウンター値を照合する。昔の本文をメモリーから返すだけの反例と区別する。

両モードで8群、計16群を記録した。停止フラグfalseはすべて拒否した。接続後の開始時刻、期限の書換えと自然な期限到達で、既存SDKと短いRESTの結果が異なった。依存文書のgetがない直接文書の時刻条件でも再現した。新規接続では現在の期限に従う結果だった。

受信後・呼出し元へ返す前に停止を注入する最小例では、後段RESTの拒否により本文を返さなかった。GD91-139の全取得経路や画面で同じ保証を確認した結果ではない。

[Node結果](artifacts/node-summary.json)と[Edge結果](artifacts/browser-summary.json)に前後のソースハッシュ・後処理を保存した。[監査](artifacts/audit-summary.json)は各10ソースを照合する。先行Node単独8群は最終16群へ加算しない。`local-summary.json`と`first-node-summary.json`はその先行実行の同一記録である。

[SDK構成の照合](artifacts/sdk-inspection.json)では、Node入口がgRPC、ブラウザ側の生成物がWebChannelを使う構成を確認した。Nodeの`getDocFromServer`はsnapshot listener経由である。GD91-139の6SDKはNode向け入口であり、Edge6接続・600／1,000人の合同結果は未確認。

現象はこのローカルEmulatorでの観測である。request.timeの内部処理・SDKとEmulatorのどちらの要因かは未確定。実サービスの挙動も未確認。期限検査を省いたり、接続の作り直しをサーバー側保証の代替にしたりしない。方式採用・無料成立と全業務の合格は宣言しない。

終了時にSDK・ブラウザと配信サーバーを閉じ、全拒否Rules・空試行データとAuth 0件を確認した。外部試行・本番実装と配備は0件。詳細は[検証記録](../../docs/development/technical-validation/seat-capacity-validation.md#gd91-140-sdk期限境界のnodeedge比較)を参照する。
