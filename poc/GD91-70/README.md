# 行列拡張と移動量の引継ぎ

状態：In Review。読者：開発者、設計担当者、テスト担当者。#166の隔離PoCで、本番実装ではない。

GD91-69と同じ版・割当・券の正本へ、外周を未セルで拡張する経路を接続する。採番方向が逆なら上・左へ追加し、旧セルの座標を一律移動する。席ID・番号と割当、QRを維持する。

## 処理

1. 確定世代と移動量から現在の論理配置を復元し、追加セルを未で作る。
2. 新旧の全セルと席情報を比較する。一律の座標変換以外の変更を拒否する。旧列設定も保持し、新しい行列の外側へ非未セルを混ぜない。
3. 比較結果・旧確定候補と移動量をeditSealへ結合する。完成候補はこの検査済み文書を参照し、自己申告だけで許可しない。
4. 最新の権限・公演状態と8版を再確認し、共通版・割当表と履歴の3文書を確定する。当日と初回受付開始後は理由必須。一般差替えへの種別偽装も拒否する。

拡張後は新世代の実座標へ移動量を反映済みとする。旧世代のsectionViewsを削除・追記せず、新世代での有効値をゼロへ戻す。後のスライドも新世代へ結合する。これにより最終確定へ4文書目を増やさない。

head・source側制御と保護索引の写像、旧headの公開状態は前提投入。正本の版・割当と券は前提投入しない。構成片・新旧目録と完成証明、通常名簿・割当と確定は認可付き要求。前提投入した入力の通常生成・保持回収は未検証。

## 確認範囲

E01～11は逆方向を含む縦横拡張、スライド後の連続拡張、500人配置済みの500席を対象とする。割当・券保持、当日理由と停止後の扱い、部分送信6通り、旧版・権限失効と競合、同一ID照会を確認する。個別席追加・末尾の新規採番と番号位置編集は別経路であり、本PoCの未セル拡張だけで合格にしない。

結果のfilterがnullで、前後ハッシュが一致するものを全件結果とする。部分実行と失敗記録は別ファイルへ保存する。初期試行では逆順モデルの席配列とセル目録の走査順が食い違った。次の試行では専用履歴への振分けが不足した。負の試験がローカル形式検査で先に止まった例も保持する。Rulesでの拒否と区別し、修正後に全件再実行する。

## 再実行

PowerShell 7、既存Node.js・JavaとPOC-004のFirebase CLIを使用する。追加依存なし。localhostとdemoプロジェクトに固定する。

```powershell
node poc/GD91-70/generate.mjs
node poc/GD91-70/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-70/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-70/tests/emulator.mjs && node poc/GD91-70/tests/regression.mjs'
```

extension-summary.jsonと既存119件の6結果を区別する。回帰のケース本体を変更せず、接続先だけを新候補へ変更する。REST・Emulatorの自動結合試験であり、SDK・IndexedDBと実機、本番速度や請求量は未確認。方式の最終採否は#168へ残す。
