# GD91-68 配置と固定状態の合同保存候補

状態：Draft。読者：開発者、設計担当者、テスト担当者。#166の残条件を同じ候補で検証する作業中の隔離PoC。本番方式の採用と本番実装は含まない。

## 構成

- `generate.mjs`：GD91-67から新Rulesを生成する。旧PoCのソースは変更しない。
- `bulk.rules`：通常登録のグループ参照を検証する。配置案を固定し、席ごとに検査してから割当・共通版・履歴を3文書で確定する。
- `tests/support.mjs`：通常名簿・構成からGD91-66の計算入力を作る。確定履歴を解除・再配置・取消しへ引き継ぐ。

準備途中の案と検査進捗は受付の確定正本を変更しない。各段階で権限と基準版を再検査する。名簿の所属正本は変更せず、所属IDごとの派生索引を同じ5文書の登録へ追加する。

## 現時点の確認

新20件と既存88件の回帰が同じRulesで合格した。自動配置と、手動分割→固定解除→再配置→直前取消しを通常要求で接続する。固定状態・手動理由も元へ戻す。部分送信6通りと偽の検査完了、最新の発券保護と失効、別担当者の競合と同一ID照会を含む。500人の名簿登録は回帰範囲に含むが、500人の配置保存ではない。

検査進捗は現段階で席ごとに1書込み。固定状態をグループ単位で保存し、名簿全員へ複写しない。静的参照予算は案9、確定履歴を参照する案10、進捗9、確定15または16。キャッシュ減算なし。式評価の余裕と請求額を測った値ではない。

初回公開は割当文書の`existsAfter`を必須にし、その新規作成側で内容を検証する。版・履歴だけの部分送信を拒否する。通常の席設定では固定状態と`bulkOperationId`を変更できず、このマーカーで分岐のための余分な履歴参照を避ける。

500人・複数区画と専用編集、配布・共有下書きは作業中。SDK・IndexedDBと画面・実機は未実施。中間結果を#166の完了判定へ使用しない。

失敗実行は`artifacts/failed-*.json`へ保持する。初回公開の重複検査を整理したため、既存の部分送信拒否を含む回帰を再実行する。Rulesで返す計算用map内の条件式はEmulatorで内部エラーとなり、進捗条件を直接比較する形へ整理した。

依存追加・外部基盤の導入はない。localhostのAuth・Firestore Emulatorと架空データだけを使用する。

## 再実行

PowerShell 7で次を実行する。旧PoCの合格件数は加算しない。

```powershell
node poc/GD91-68/generate.mjs
node poc/GD91-68/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-68-config'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-68/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-68/tests/emulator.mjs && node poc/GD91-68/tests/regression.mjs'
```

各結果の`sourceHashes`と`endSourceHashes`を照合する。部分実行は`filter`付きで記録し、全件結果と区別する。接続不備の詳細は[first-attempt.json](artifacts/first-attempt.json)、最新結果は[新20件](artifacts/bulk-summary.json)・[名簿12件](artifacts/roster-regression.json)・[初期化20件](artifacts/initial-regression.json)・[不参加24件](artifacts/branches-regression.json)・[券32件](artifacts/lifecycle-regression.json)を参照する。
