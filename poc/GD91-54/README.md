# GD91-54 区画全体のID・採番検査

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #165のうち、小片をまたぐID・表示番号の重複と採番の連続性を保存データから検査する |
| 前提 | 同じ行列・列設定の準備期間。親・列目録と旧構成、本人セッションは試験用の前提投入 |
| 結論 | 限定結果は[検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-54-区画全体のid採番検査)へ記載。構造の証跡から公開資格を発行しない |

## 処理と保存境界

1. 2セル以下の構成・属性を一体保存する。GD91-52と同じ4段階で局所検査する。
2. `globalIds/current`を初期化する。区画・列IDを予約し、小片順にセルID・席IDと表示番号を追記する。追加集合が保存データと完全一致し、既存集合と重複しないことをRulesで検査する。
3. `numberScan/current`で1セルずつ消費番号を照合する。縦横・順逆に応じ、列ごとの最終値が`nextAutomaticNumber`へ一致することを確認する。欠番から手入力席への変更でも元の消費番号を保持する。
4. 両進捗が全セルへ到達した場合だけ、変更不可の`structureProof/current`を作る。操作ID・基準版と管理版を固定する。更新ごとに最新認可を再確認する。

これは同一形状・区画内の構造検査である。目録の正規発行、形・列変更と旧席全件比較は未接続。割当・券の保護と公開候補の発行も未接続で、#165を完了にしない。二つの区画を同一公演・同一世代で確認するが、区画間ID一意性の証明とは区別する。

## 実行

既存のNode.js 24・JavaとPOC-004のFirebase CLIを使う。依存追加なし。実Firebaseへ接続しない。ポート8181・9191・4401・4501・9150が使用中なら既存プロセスを停止せず、実行を中断して確認する。

PowerShell 7からリポジトリ直下で実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-54-config'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-54/firebase.json --project demo-concert-seat-gd91-54 --only auth,firestore 'node poc/GD91-54/tests/global-emulator.mjs && node poc/GD91-54/tests/local-regression.mjs'
```

全体検査は[global-emulator.mjs](tests/global-emulator.mjs)、局所回帰は[local-regression.mjs](tests/local-regression.mjs)。各結果JSONに実行前後のソースハッシュを記録する。初回は再作成の409を403と誤認して中断し、[失敗記録](artifacts/first-attempt.json)を保存した。失敗後のハッシュであり、前後同一性の証明ではない。409は作成専用条件の衝突、403はRules拒否として区別する。

500席の要求数は成功した試験ループの送信回数から集計する。各段階の単独要求を前提とし、fixture・再取得と認証要求を除く。静的参照上限はキャッシュによる減算をしない。式評価数の正確な測定や全公開費用、課金額の測定ではない。

実機・SDK再試行とIndexedDBは未確認。応答喪失は成功応答を使用せず同じ操作IDを照会する模擬確認で、通信障害を注入していない。破損済み旧構成・証跡を投入する拒否試験は、その発行経路が安全である証明へ数えない。
