# GD91-136 Firestore履歴候補の隔離検証

状態：In Review。公演状態でDBを分担する候補の限定PoC。本番実装ではない。

```text
node poc/GD91-136/run-local.mjs
node poc/GD91-136/audit.mjs
```

既存POC-004のFirebase CLIとJavaを利用する。専用demoプロジェクトのAuth 9491・Firestore 8381・RTDB 9300へだけ接続し、外部URLを拒否する。全データは架空。セッションはGoogle本人から通常発行し、役割・端末登録と閉じた2人の原本はowner前提投入である。

最終11群はFirestore側の直接API停止・失効と、限定原本の移動・訂正・手動削除を確認する。X01は片側失効の未反映、X02は自己申告ハッシュ受理という反例であり、採用条件の合格ではない。全領域移動・全履歴削除と原本のサーバー側照合は未完了。初回は終了時のAuth一覧確認のlimit指定が501となり、記録を残して修正・再実行した。

終了時に全拒否・試行データ回収とAuth 0件を確認する。途中状態の保存済み本文は再送せず、カーソルから再開する。RTDB元データの通常回収と本番App Check、実SDK・実機は未確認。

詳細と未確認は[検証記録](../../docs/development/technical-validation/seat-capacity-validation.md#gd91-136-firestore履歴候補の認可と移動訂正削除)を参照する。
