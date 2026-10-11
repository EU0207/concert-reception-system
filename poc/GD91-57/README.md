# GD91-57 全体検査から完成候補の発行

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #165の全体・新旧比較証跡と対象版を、通常発行の完成候補へ結合する |
| 前提 | 親・旧確定構成と旧候補、保護一覧と業務版は試験用投入。準備期間の隔離候補 |
| 結論 | [完成検証記録](../../docs/development/technical-validation/seat-completion-validation.md#gd91-57-全体検査から完成候補の発行)へ集約。方式採用・公開の完了を意味しない |

## 処理・データの流れ

1. GD91-56の旧全セル目録・履歴と全体検査を引き継ぎ、構造・新旧比較を完了する。局所証跡だけを候補の根拠にしない。
2. `candidateSeats/current`を空から開始し、新構成の全セルを順に走査する。完成小片と発行済み席情報を照合し、席IDだけを正確に一覧へ追加する。
3. `publicationShows/{p}/candidates/{g}`を通常要求で作る。Rulesは全体ID一覧・比較結果と全席一覧を読み、候補の内容と対象版を照合する。世代IDも全ID一覧へ加える。
4. 準備開始時の8業務版と現在の確定版を照合する。旧候補のID以外で他区画・使用済みIDを再使用する要求を拒否する。最新の本人・端末認可も確認する。
5. 候補は変更不可とし、同一操作IDで再取得する。候補発行では確定版・受付を更新しない。更新失敗時に再作成を繰り返さず、同じ候補の結果を照会する。

## 範囲・残条件

候補は既存公開契約の席・全IDと変更席一覧を持つ。`ready`はこの隔離候補の検査完了を示し、操作別の業務許可や一体公開の完了ではない。候補発行と公開は別の境界である。

拡張・個別編集の専用許可と、一体公開へのサーバー接続は残る。全体スライドは既存の移動量保存を優先し、今回の全件準備へ置き換えない。公開時にも最新の割当・券保護を再照合する必要がある。通常業務の合同回帰は#166、総費用・保持回収は#167、採否は#168で判断する。

C09～15の業務版と旧候補は試験用投入で、通常の業務更新を代替しない。C16は同時要求と結果照会であり、実通信断の注入は行わない。SDK・IndexedDBと実機は未実施。

## 再実行

既存Node.js 24・JavaとPOC-004のFirebase CLIを使用する。依存追加なし。ポート8181・9191・4401・4501・9150が使用中なら、既存プロセスを止めず中断する。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-57-config'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-57/firebase.json --project demo-concert-seat-gd91-57 --only auth,firestore 'node poc/GD91-57/tests/candidate-emulator.mjs && node poc/GD91-57/tests/history-emulator.mjs && node poc/GD91-57/tests/comparison-emulator.mjs && node poc/GD91-57/tests/global-emulator.mjs && node poc/GD91-57/tests/local-regression.mjs'
```

結果は`artifacts/`の候補・履歴と比較、全体・局所JSONへ保存し、各実行前後のソースハッシュを照合する。500席の比較S07で、同じ構成から席一覧・完成候補も発行する。候補発行用に別の500席の準備を繰り返さない。

書込み数・要求数は通常要求の成功ループから集計する。前提投入と試験用再取得・認証は除外する。全500セルが席の場合、比較結果4,768書込みに候補用席一覧501＋候補1を加える。非席を含む構成の総費用、公開までの費用と無料条件は未評価。ローカルEmulator以外へ接続しない。
