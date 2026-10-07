# GD91-10: 区画の移動量によるスライド保存検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。結果と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-10-区画の移動量による保存検証)へ集約する。本番Rules・投影として使用しない。

## 実行

PowerShell 7、既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-10-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-10/firebase.json --project demo-concert-seat-gd91-10 --only auth,firestore "node poc/GD91-10/tests/emulator.mjs"
```

localhostとdemoプロジェクトへ固定。初期構成・行列集計と本人証跡は管理経路で投入する。移動量・版と操作履歴の2書込みを一括確定し、元の座標・席と参照を更新しない。投影で移動量を1回適用する。
空き外周は基準座標の行列集計で検査する。集計維持の検証用nonSeatProofは未・空間・通路の3種だけを扱う。集計更新とセル変更を結び付け、席・欠番への適用は拒否する。この試験用操作を本番の業務操作へ追加しない。
sourceRevisionが同じ場合だけ手元の元データを使える。セル編集を見逃した場合は再取得が必要で、最後の操作種別だけで判定しない。
初期集計の保証、席追加・移動と行列拡張、複数区画とGD91-06の合同Rulesは未検証。正式な投影・受信処理、PDF・Excelと実機は未実施。公演日の判定、証跡発行と本番QR、SDK・IndexedDBは対象外。