# GD91-56 旧全セル目録と非席履歴の検査

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #165の旧全セル目録と欠番消費履歴を、比較結果へ接続する |
| 前提 | 親・旧確定構成と保護一覧は試験用投入。準備期間の隔離候補 |
| 結論 | [検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-56-旧全セル目録と非席履歴の検査)へ記載。比較結果は公開資格として使用しない |

## 処理・データの流れ

1. 旧確定版の構成・属性と列設定を読み、`baseCellFacts/{cellId}`を通常要求で作る。Rulesが保存済み内容と一致することを確認し、変更不可にする。
2. `baseSeats/current`を空から開始し、旧構成を1セルずつ走査する。全セルIDと旧席IDを記録し、席IDから旧セルIDへ対応付ける。未走査や偽装した目録を比較へ使用しない。
3. 新構成を4段階で局所検査し、席情報を発行する。全体ID走査と採番走査を行い、採番走査で全新席の情報が正しい小片・位置から発行済みであることも確認する。
4. `cellComparison/current`で全旧セルを走査する。旧非席は新しい同一セルの存在と消費番号の維持を確認し、席へ変更する場合は手入力番号だけを許可する。旧席は別の`seatComparison/current`で席IDから比較する。
5. 両比較と構造検査が完了し、変更席が最新の保護一覧に含まれない場合だけ`comparisonResult/current`を作る。結果は対象版・操作IDと結び付け、取得による再開を可能にする。

新旧のセル・席情報は検査用の一時索引であり、恒久的なSeat複製方式を確定しない。席索引の確認を2席単位の全体ID走査へ追加すると式評価上限に到達したため、既存の1セル単位の採番走査へ移す。追加の通信・書込みは発生しない。

## 範囲・未接続

旧目録と比較用情報は管理権限による試験投入をせず、通常の認証付き要求で発行する。その基になる旧確定構成・列設定と属性、割当・券の保護一覧は試験用投入である。H04は不正な旧正本の投入を含む。H11・12は不正小片から履歴条件だけを検査し、全体採番走査を実行しない。

専用の拡張・個別編集経路と区画間IDの扱い、完成候補の発行は未接続。公開時の最新保護版・業務版の再照合も必要であり、比較結果だけで受付を切り替えない。通常の割当・発券との合同回帰は#166、総費用・保持回収は#167、採否判断は#168に残す。SDK・IndexedDBと実機は未確認。

## 再実行

既存Node.js 24・JavaとPOC-004のFirebase CLIを使用し、依存を追加しない。ポート8181・9191・4401・4501・9150が使用中なら、既存プロセスを止めず中断する。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-56-config'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-56/firebase.json --project demo-concert-seat-gd91-56 --only auth,firestore 'node poc/GD91-56/tests/history-emulator.mjs && node poc/GD91-56/tests/comparison-emulator.mjs && node poc/GD91-56/tests/global-emulator.mjs && node poc/GD91-56/tests/local-regression.mjs'
```

結果は`artifacts/`の履歴・比較・全体・局所JSONへ保存し、各実行前後のソースハッシュを照合する。集合型の記述、式評価上限と既存不正採番試験の前提不足による3回の失敗も保持する。失敗記録のハッシュは実行後に記録し、後続修正の差分から当時のソースを再現するための情報である。完走・前後同一性の証明には使用しない。

書込み数・要求数は通常要求の成功ループから集計し、旧確定構成等の前提投入と試験用再取得・認証を除く。500席の比較結果までの集計は全セルが席の条件で、非席を含む場合には新非席情報の発行も増える。公開までの費用と無料条件、実課金は未評価。ローカルEmulatorだけに接続する。
