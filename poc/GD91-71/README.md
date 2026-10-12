# 未割当席の編集と非席からの追加

状態：In Review。読者：開発者、設計担当者、テスト担当者。#166の隔離PoCで、本番コードではない。

GD91-70の候補へ、理由付き番号変更・位置移動と非席4種からの追加を接続する。通常の版・割当と券保護を使用し、別の割当正本を作らない。

## 処理

1. 確定世代と有効な移動量から論理配置を作る。番号変更は手入力番号へ変換し、位置移動は席ID・表示番号を保持する。移動元はspaceとし、移動先のcellIdを保持する。
2. 新旧全セル・席を比較する。旧列設定と次番号は変更しない。対象以外の変更を拒否し、手入力追加・移動後に初回自動採番の並びを再要求しない。
3. editDetailsで対象前後・理由と種別を検査し、editSealへ比較結果・旧候補と期待版を結合する。進捗だけで受付正本を変更しない。
4. 確定時に最新の認可・8版と割当、券保護を照合する。版・割当・履歴の3文書を一体保存し、最新割当のある対象席は拒否する。

欠番からの手入力追加ではconsumedNumberを保持する。移動では元のセルから番号・参照を外すが、旧世代の履歴と列の次番号は保持する。跨列移動では同じ表示番号を手入力で保持し、移動先の接頭部へ黙って変更しない。

専用の急遽変更を検証し、緊急印はkind・reasonを構成候補へ保持する。操作IDと時刻は確定履歴に記録する。詳細設計の論理emergencyChange全項目の物理形式・出力との結合は、本候補の2項目だけで完了にしない。64文字は隔離評価値で、製品上限の確定ではない。

head・source側制御と保護索引の写像、旧headの公開状態と認可基盤は前提投入。版・割当と券、構成片・新旧目録と完成証明、編集の確定は認可付き通常要求。初期化・通常登録の共通経路も維持する。

## 確認と再実行

I01～09は番号編集、同列・跨列の位置変更、非席4種からの追加を確認する。最新割当・対象外変更と部分送信、理由・操作種別偽装を拒否する。スライド→番号編集→拡張→スライドも対象。回帰130件はケース本体を変更せず、同じ候補へ接続する。

PowerShell 7、既存Node.js・JavaとPOC-004のFirebase CLIを使う。追加依存なし。localhostとdemoプロジェクト以外へ接続しない。

```powershell
node poc/GD91-71/generate.mjs
node poc/GD91-71/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-71/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-71/tests/emulator.mjs && node poc/GD91-71/tests/regression.mjs'
```

individual-summary.jsonと7つの回帰結果を全件結果とし、filter=null・前後ハッシュ一致を確認する。初期配置生成も個別試験のハッシュ対象とする。生成時の置換箇所重複は試験開始前の修正で、Emulatorの失敗件数へ加算しない。SDK・IndexedDBと実機、共有下書き・受付への通常配布は後続へ残す。#166の中間コミットとして継続する。
