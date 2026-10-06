# GD91-01 席保存の隔離検証

状態：In Review。読者：開発者・設計担当者・テスト担当者。
目的：Issue #101の保存候補を、架空データとローカルのAuth／Firestoreだけで検証する。

結果と未検証範囲は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-01-隔離検証結果2026-10-06)へ集約する。ここには再実行方法だけを記載する。

## 再実行

リポジトリ直下でPowerShell 7を使用する。Node.js 24、Java 21と、既存の`poc/POC-004/node_modules`を使用した。検証時のFirebase CLIは15.28.2、Firestore Emulatorは1.22.0。追加パッケージはない。

先に9191、8181、9150、4401、4501番ポートが未使用であることを確認する。実プロジェクトの設定ファイルは指定しない。

```powershell
node poc/GD91-01/tests/capacity.mjs
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-01-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-01/firebase.json --project demo-concert-seat-gd91-01 --only auth,firestore "node poc/GD91-01/tests/emulator.mjs"
```

実行先はコード内で`127.0.0.1`とdemoプロジェクトへ固定している。初期値だけはエミュレーター専用の管理経路で投入し、権限確認は匿名Authの端末トークンで行う。トークンは出力・保存しない。エミュレーターはコマンド終了時に停止する。

## 証拠と適用範囲

- `artifacts/capacity-summary.json`：候補の文書容量。入力上限は未承認の評価値で、通信要求全体の実測ではない。
- `artifacts/emulator-summary.json`：直接REST要求の結果。実行時刻と検証コードのSHA-256を含む。ハッシュ計算では改行をLFへ統一する。
- `firestore.rules`：候補Aの参照整合性と、候補Bの固定席集合の世代切替を限定検証するRules。本番の業務条件を網羅していないため転用しない。

ローカルの成功と本番成立性は区別する。再実行後は証拠JSONの差分とコードのハッシュを照合する。本番への配信設定と本番環境の作成を含めない。
