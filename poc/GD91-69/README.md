# 複数区画・全体スライドと配置保存の合同検証

状態：In Review。#166の中間結果。GD91-68へ余白検査とスライドを接続する隔離PoCで、本番コードではない。正式な判定は[合同検証記録](../../docs/development/technical-validation/seat-business-integration-validation.md)へ集約する。

## データと処理

1. 通常の構成検査で、未セル以外が占める最小・最大の行列を集計する。候補のgeometryへ保存し、席だけでなく通路・空間・欠番も境界へ含める。既存のセル走査へ組み込み、追加の検査書込みは作らない。
2. 新規区画の公開は、その区画が未登録であることを確認する。公演全体が空である条件と区別し、他区画の割当と券を維持する。
3. sectionViewsへ移動量を保存する。全体の版・操作履歴と合わせて3文書で確定する。範囲外へ非未セルが出る移動は拒否する。席・番号とQRの正本は書き換えず、理由の項目も作らない。
4. 配置はGD91-68の検査を維持し、区画をまたぐ入力を同じ版へ接続する。検査中は受付正本を変更せず、全員の検査完了後に版・割当・履歴の3文書を確定する。

構成入力headとsource側制御、初期端末登録は前提投入。名簿登録・所属索引と割当、構成片・完成証明と候補、公開とスライドは認可付き通常要求。架空データだけを使い、localhost以外へ接続しない。

## 試験範囲

V01～11は4方向スライド、発券済み席・QR保持、部分送信と範囲外拒否を確認する。通常の開始・停止と新規区画、旧版・偽装と同一ID照会も対象とする。V08は通常登録500人・50組を2区画500席へ保存する。検査元の既存108件は同じ候補で再実行し、試験本体の同一性を生成時に照合する。

結果JSONのfilterがnullで、前後のsourceHashesが一致した実行だけを全件結果とする。部分実行はdiagnosticへ分ける。計測時間はローカルEmulatorであり、本番速度・課金量・端末耐久性の結果ではない。

### 不採用の試行

検査1回で2席・3席を進める案は、式評価1000上限で拒否された。試行ファイルprogress.rulesは不採用の記録で、generate.mjsは読み込まない。採用候補はGD91-68の1席ずつの検査をそのまま使う。安全性を落とす条件削除で対応しない。

500人の配置検査には500回の進捗更新が必要になる。準備開始2要求と最終確定1要求を合わせて503要求・505書込みである。名簿登録・構成準備の費用は含まない。最終確定が3文書であることを、操作全体が3書込みで済む意味へ読み替えない。

初期試行では、新規区画を初回公開へ振り分ける条件と試験の期待回数に不備があった。失敗結果をartifacts/failed-*.jsonへ保持し、修正後の全件結果と区別する。

## 残作業

行列拡張と未割当席の番号・位置編集は未接続。スライド後の構成差替えで移動量を継承する処理も未接続で、異なる世代の移動量を流用しない。共有下書きと受付用データの通常発行、全業務SDK・IndexedDBと実機も未確認。#166全体を完了とはしない。処理量を含む本番方式の採否は#168のゲートを維持する。

## 再実行

PowerShell 7で実行する。依存関係の追加はない。

```powershell
node poc/GD91-69/generate.mjs
node poc/GD91-69/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-69-config'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-69/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-69/tests/emulator.mjs && node poc/GD91-69/tests/regression.mjs'
```

今回の結果はgeometry-summary.jsonとbulk・roster・initial・branches・lifecycle-regression.jsonに分ける。旧候補での合格を今回の実行件数へ加算しない。
