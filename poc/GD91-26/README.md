# GD91-26: 来場者の通常登録と500人席割当の接続

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[技術検証記録](../../docs/development/technical-validation/seat-save-validation.md#gd91-26-通常登録から500人割当への接続検証)に結果と残作業を集約する。本番Rulesとして使用しない。

## 実行

既存のNode.js 24・Java 21とPOC-004のFirebase CLIを使用する。追加依存はない。PowerShell 7でリポジトリ直下から実行する。ポートは9191・8181・9150・4401・4501を使用する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-26-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-26/firebase.json --project demo-concert-seat-gd91-26 --only auth,firestore "node poc/GD91-26/tests/emulator.mjs"
```

## データと処理

本人Authでセッションを発行し、承認端末Authで空の業務索引を初期化する。GD91-24から引き継ぐ初期構成を検査・公開した後、来場者の最小正本を一人ずつ通常登録する。正本・索引・共通版と履歴を一体保存し、その索引を使って500人を割り当てる。通常要求はRESTのcommitで送信し、SDKの再試行とは区別する。

全体確定版はcommit、構成headのrevisionはlayoutと一致させる。通常の来場者・割当更新では構成headを書かない。planSlideとRulesもこの対応を検査する。履歴は公演配下のoperationsへ置き、固定チェックだけの変更では操作者を記録しない。

割当は実在席IDの集合と一致するmapを正本とする。移動・交換後のスライドでも、全割当と基準の席情報を保持する。名前・入金の変更が席解除にならず、割当済みの来場者を簡略な不参加更新で解除できないことを確認する。不参加の共同処理そのものは未実装。

## 確認範囲

自動試験の19シナリオと前後のソースハッシュを[証拠](artifacts/emulator-summary.json)に保存する。正常・拒否17件、比較2件。C17は発券後保護の索引と初回受付開始を前提投入した比較で、券・QRの通常発行の合格ではない。C19は4席片の式評価上限を再確認する比較で、製品上限を変更しない。

C11の競合20組では、ロック中断と参照エラーにより2組が両方未確定となった。全状態と結果を照会後、中断した要求を同じIDで明示再試行し、各組1件だけ確定した。403応答の無条件再送やSDKの自動再試行を実装・検証したものではない。

通常登録は最小来場者レコードが対象。購入者は架空ID参照だけであり、購入者実体と任意項目、名簿取込みは未接続。初回構成公開より先に名簿を作る経路も未検証で、製品の操作順を制限する根拠にしない。グループ固定と全編集・複数区画、差替え・回収も残る。

空の業務索引と500人の来場者は通常要求で作る。端末登録・役割付与と公演管理の初期状態は管理経路で前提投入する。本人失効・再認証や公演締めを含む正式認可全体、券・QRの発行と無効化、不参加結合は未検証。IndexedDB・画面・実機も対象外。

入力は架空データのみ。Google認証はEmulatorの架空資格で模擬し、demoプロジェクトとloopback接続を実行時に検査する。JSON容量と要求回数を請求量の保証へ読み替えない。前段のPoCは変更しない。
