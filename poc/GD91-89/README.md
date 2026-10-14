# GD91-89 受付用データの取得と通常発券の合同検証

| 項目 | 内容 |
|---|---|
| 状態 | Draft |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #167の通常発券・受付用情報の取得・6SDK環境への差分配布を接続する |
| 前提 | PR #196の内容コミット`51e29487202e7f6e65438255b5b72d5f10219dc0`は2026-10-14に開発者がレビュー承認しmainへ統合。業務・Authはdemo Emulatorの架空データのみ |
| 結論 | 整合性・取得競合12群は合格。人数別合同試験と新配布経路の期限試験は継続中。#167の全条件と本番採用は未完了 |

## 方式

[projection.mjs](projection.mjs)は席・券の変更案へ受付用の行を含め、同じPATCHで確定する。購入者名・任意項目と確認コードは含めず、管理履歴も一般受付へ開放しない。[projection-rules.mjs](projection-rules.mjs)は正本との一致と更新対象を検査する。行の削除・別人への便乗と版更新の省略を拒否する。

取得はキー順で最大32行。次ページの先頭1件は境界として再取得し、重複を除く。件数が増えても一回の取得上限を変えない。全ページの前後で確定版を比較し、変化があれば混在した結果を採用せず再取得する。構成の公開世代との一体照合は別の残条件として維持する。

## 証拠と制約

- [validate-summary.json](artifacts/validate-summary.json)：正常登録・発券、32件境界と途中競合、旧資格の切替など12群。部分送信と管理情報混入を拒否した。
- 人数別試験は600人・1,000人を通常要求で作り、6SDK環境で取得後に受付する。同じデータを使い、発券fixtureと受付fixtureを分離しない。結果は完了後に記録する。
- 保存試験のRAMを暗号化IndexedDB・実機の合格にしない。ownerの公演状態投入を全端末停止の証拠にしない。外部試行・課金と公開設定変更は含まない。

初期化も変更先を限定したPATCHとする。親全体へのPUTを許可するために、一般受付へ管理枝の取得や書込みを追加しない。ページ境界には実在キーを使い、キーとして禁止された制御文字をカーソルへ追加しない。

## 再現

PowerShell 7で既存依存のdemo Emulatorを起動し、試験は順番に実行する。各試験は共有Rulesを変更するため同時実行しない。

```powershell
node poc/GD91-89/generate.mjs
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-89/firebase.json --project demo-concert-seat-gd91-84 --only auth,database
```

別ターミナルで実行する。

```powershell
node poc/GD91-89/validate.mjs
node poc/GD91-89/capacity.mjs
node poc/GD91-89/expiry.mjs
```

**依頼者に確認してください**

- なし。承認済みの業務回答と無料600人必須・1,000人目標を維持する。3,000人の試験は行わない。
