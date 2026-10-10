# GD91-47 同じ形の区画差替えと変更席の証明

状態：In Review。読者：開発者、設計担当者、テスト担当者。

[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-47-同じ形の区画差替え)と[結果・費用](../../docs/development/technical-validation/seat-save-validation.md#gd91-47-同じ形の区画差替えと変更席の証明)へ追跡する。実Firebaseへ接続しない隔離検証で、本番アプリケーションではない。

## 処理と前提

1. 新しいgenerationを通常要求で構成する。公開中のgenerationは変更せず、共通の認可を維持する。
2. `replacementProof/current`を空で作成する。Rulesが新旧head・列設定と公開中の基準を照合し、新headの変更を禁止する。
3. 新旧の構成片・属性を3セルずつ比較する。旧席のセルか属性が異なる場合、その席IDを変更一覧へ追加する。Rulesが順序・進捗と一覧の完全一致を検査する。
4. 全セルの比較後、完成候補と準備ポインターを2文書で一括保存する。候補の変更一覧は検査済み一覧と一致させる。受付に反映する公開は別の3文書の一体保存で行う。

同じ行列数・採番方向と列設定が対象。オフセットは0、構成幅は3セルに限定する。列設定全体を比較するため、席のprefix・lineId等を比較から落とさない。geometry・列設定の異なる差替えと手動採番は許可しない。段階的な検査中のheadはbuildingのままで、完成証明を候補・比較進捗へ分ける。新しい本番形式の採用ではない。

役割・端末登録と共通管理、空の業務正本は前提投入する。保護対象の券一覧も試験用の前提で、実際の発券処理を代替しない。構成準備・比較と候補発行、公開は通常要求を使う。候補・比較結果の管理権限投入はない。

## 再実行

既存POC-004のNode.js・Firebase CLIとJavaを使う。ローカルポートへの接続・待受けが可能な環境で、pwsh 7から実行する。8181・9191・4401・4501・9150番ポートを使用する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-47-config'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-47/tests/budgets.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-47/firebase.json --project demo-concert-seat-gd91-47 --only auth,firestore 'node poc/GD91-47/tests/emulator.mjs'
```

[既存28件](tests/emulator.mjs)と[差替え16件](tests/replacement.mjs)を同じRulesで実行する。[結果JSON](artifacts/emulator-summary.json)に前後25ソースハッシュを記録する。診断用GD91_CASEの単独実行を全件合格へ数えない。[静的照合](tests/budgets.mjs)は既存203関数を保持し、変更した基準head判定・初期headの2関数を区別する。

## 費用と範囲外

500セルは170片で比較し、開始を含め171要求・171書込みが必要。構成準備の費用と分けて数える。候補発行は2書込み・静的13参照、公開は3書込み・静的19参照。参照数はキャッシュ削減を見込まず、実際の課金・式評価数と区別する。

全編集と既存63件の業務回帰、共通管理・公開後スライドとの接続は残る。容量・保持期限と安全な回収、SDK・IndexedDBと実機も未確認。準備領域の補助業務状態は隔離検証用。方式未採用・本番未着手。
