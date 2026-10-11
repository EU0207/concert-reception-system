# GD91-55 列目録と席IDによる新旧比較

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #165の列目録発行と、席IDを使った全旧席の照合・保護を検証する |
| 前提 | 親と旧確定版の席目録・fact、割当・券の保護一覧は試験用投入。準備期間の隔離候補 |
| 結論 | [検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-55-列目録と席idによる新旧比較)へ記載。比較結果を本番の公開資格へ使用しない |

## 処理・データの流れ

1. `lineCatalog/current`を通常要求で作る。1列ずつ親の設定と照合し、列ID・順序と採番範囲を検査する。不完全な目録から局所証跡を作れない。
2. 構成・属性の4段階検査と区画全体の重複・採番検査を行う。既存経路を維持し、`comparisonPlan=seatId`の隔離経路だけ新旧の位置一致条件を外す。その代わり旧席全件を後段で比較する。
3. `seatFacts/{seatId}`を通常要求で作る。Rulesが完成した小片と属性を読み、セル・番号と表示に必要な列情報を復元する。内容の自己申告や上書きを許さない。
4. `seatComparison/current`で旧目録を1席ずつ走査する。席IDから新factを取得し、変更した旧席IDを正確に追記する。欠落・飛越しと変更一覧の偽装は拒否する。
5. 構造証跡と全旧席の比較が完了し、変更席が最新の保護一覧へ含まれない場合だけ`comparisonResult/current`を作る。操作ID・対象版と保護版を結び付け、結果を変更不可にする。

新factは検査用の一時索引であり、正式Seatの恒久複製方式を確定しない。保持・回収と総費用は#167で判断する。

## 範囲・未接続

行・列の末尾追加と席番号の接頭文字変更、任意属性の比較を確認する。旧fact・旧目録の出所はfixtureで、通常発行からの接続は未完了。新規席を含む全席目録の完全性も未証明。非席の旧消費履歴と専用の拡張・個別編集経路、完成候補の公開を残す。任意の形変更や当日業務全体を確認した扱いにしない。

保護一覧は試験用で、通常の割当・発券経路から作る合同回帰は#166。比較後の公開時にも最新保護版・業務版を照合する必要がある。比較結果だけで受付を切り替えない。SDK・IndexedDBと実機は未確認。

## 再実行

既存Node.js 24・JavaとPOC-004のFirebase CLIを使う。依存追加なし。ポート8181・9191・4401・4501・9150の使用を確認し、使用中なら既存プロセスを止めず実行を中断する。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-55-config'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-55/firebase.json --project demo-concert-seat-gd91-55 --only auth,firestore 'node poc/GD91-55/tests/comparison-emulator.mjs && node poc/GD91-55/tests/global-emulator.mjs && node poc/GD91-55/tests/local-regression.mjs'
```

結果は`artifacts/`の比較・全体・局所JSONへ保存し、それぞれ前後のソースハッシュを記録する。初回は行追加時の試験入力に新しい列設定がなく中断した。[失敗記録](artifacts/first-attempt.json)を残して入力を修正し、全件再実行する。失敗記録は実行後のハッシュであり、完走・前後同一性の証明ではない。

成功した送信ループから要求数・書込み数を集計する。通常の列目録作成も含め、旧確定版等のfixtureと試験用再取得・認証を除外する。Emulatorは実Firebaseへ接続しない。無料条件への適合、正確な式評価数と課金額は未評価。
