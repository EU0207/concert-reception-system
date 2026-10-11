# GD91-58 完成候補と確定版の一体保存

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #165の通常発行した候補を、確定版・割当状態と履歴へ一体反映する |
| 前提 | 準備期間の隔離候補。旧確定構成・業務初期値と認証関連文書は試験用投入 |
| 結論 | [完成検証記録](../../docs/development/technical-validation/seat-completion-validation.md)へ集約。操作別の業務許可・方式採用は未完了 |

## 処理と確認範囲

1. GD91-57の発行処理を維持し、全体・新旧比較の証跡から変更不可の完成候補を作る。候補の版と席ID一覧を自己申告だけで決めない。
2. GD91-47の公開境界へ同じ候補を渡す。確定版・割当状態と操作履歴を、3件の同時書込みで保存する。生セル・検査証跡を再保存しない。
3. 公開直前に8業務版を再照合し、現在の準備状態と作業中世代を確認する。最新の割当・券保護に抵触する旧席変更を拒否する。
4. 部分送信・競合と失効を試し、拒否前後の3文書が同じことを再取得で確認する。同じ操作IDの履歴から成功を照会する。

Q01～19は一体反映・最新版と保護境界。Q14の他区画は前提投入、Q19は2つの通常発行候補を順に公開する。旧区画の初期値は前提投入する。Q04・05は保護そのものを切り分けるため、同じ版で保護対象だけを試験投入する。Q18は通常要求の割当プローブで候補を古くする。既存業務全体の代わりにはしない。

比較S07は500席の準備から同じ候補を公開し、割当500件を保持する。`artifacts/business-handoff.json`へその候補と確定結果を出力し、#166で照合する入力を固定する。架空データのみ。#166の試験完了を意味しない。

## 予算と残条件

公開の静的参照は、確定版8・割当6・履歴6、合計20。`publication-budgets.mjs`は関数呼出しを数え、GD91-47の既存検査とGD91-57の候補発行が保持されたことも確認する。キャッシュ減算なし。実際の式評価の成否と費用は別に記録する。

500席の候補まで5,270書込み・5,020要求に、公開3書込み・1要求を加える。旧データ・認可と保護の初期投入、検査用再取得は含めない。最大構成・非席の多い構成と料金上限、保持回収は#167。無料条件の成立を意味しない。

専用拡張・個別編集の業務許可は未接続。当日操作・全体スライドと通常業務の合同回帰は今回の成立範囲に含めない。全体スライドの移動量保存と理由不要は維持する。SDK・IndexedDBと実機は未実施。方式採否は#168。

## 再実行

既存Node.js 24・JavaとPOC-004のFirebase CLIを使用。依存追加なし。ポート8181・9191・4401・4501・9150が使用中なら、既存プロセスを止めず中断する。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-58-config'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-58/firebase.json --project demo-concert-seat-gd91-58 --only auth,firestore 'node poc/GD91-58/tests/publication-emulator.mjs && node poc/GD91-58/tests/candidate-emulator.mjs && node poc/GD91-58/tests/history-emulator.mjs && node poc/GD91-58/tests/comparison-emulator.mjs && node poc/GD91-58/tests/global-emulator.mjs && node poc/GD91-58/tests/local-regression.mjs'
```

6種類の試験結果は`artifacts/`へ保存し、実行前後のソースハッシュを照合する。各結果の`scope`は試験群単独の確認範囲を示す。候補群は候補だけ、比較S07と公開群が公開接続を確認する。

事前の静的比較で、検証ファイル生成時の文字列置換が正規表現末尾を変えていたことを検出した。置換関数へ変更し、既存Rules関数との完全一致を確認してからEmulator試験を開始した。
