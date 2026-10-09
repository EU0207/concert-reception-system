# GD91-02 割当表集約の隔離検証

状態：In Review。読者：開発者・設計担当者・テスト担当者。
目的：#101の候補Eについて、固定席集合の少数変更と500人配置を同じ正本で保存できるか確認する。
正式な結果と未検証範囲は[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-02-割当表集約の限定検証)へ集約する。

## 実行

PowerShell 7、既存のNode.js 24・Java 21と`poc/POC-004/node_modules`を使う。追加依存はない。
9191・8181・9150・4401・4501番ポートが未使用であることを確認する。

```powershell
node poc/GD91-02/tests/capacity.mjs
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-02-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-02/firebase.json --project demo-concert-seat-gd91-02 --only auth,firestore "node poc/GD91-02/tests/emulator.mjs"
```

送信先は127.0.0.1とdemoプロジェクトへ固定。初期の席・許可候補・本人証跡だけはエミュレーター管理経路で投入する。検証要求は端末の匿名Authトークンを使用し、トークンを保存・出力しない。

## 適用範囲

一つの割当mapから逆引きを導出する。少数変更はフィールドマスクと差分履歴、一括変更はmap全体と前後履歴を同じ一体commitへ送る。現在状態と履歴が揃わない要求は拒否する。

構成追加・番号・グループ固定・券とQRの一体更新は含まない。許可候補一覧の信頼できる更新、正式な本人認可、SDK再試行、端末下書き復元も未検証。書込み2件と参照12回はこの限定モデルの数値であり、本番全操作の値ではない。

`artifacts/`は実行結果と容量評価を保持する。ハッシュはLFへ正規化する。ローカル成功だけで本番採用を確定しない。
