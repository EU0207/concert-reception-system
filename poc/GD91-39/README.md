# GD91-39 配布正本と本人当日履歴

状態：In Review。読者：開発者、設計担当者、テスト担当者。

Issue #101、GD91-35段階Bの一部を確認する隔離PoC。[契約と主要試験](../../docs/development/detailed-design/seat-management-detail-design.md#配布正本本人履歴の候補gd91-39)、[結果と残作業](../../docs/development/technical-validation/seat-save-validation.md#gd91-39-配布正本と本人当日履歴)を参照する。本番コード・実Firebaseへの接続を含まない。

## 対象と流れ

[Rules](firestore.rules)はGD91-38を基に、表示名変更だけを扱う最小のseatFactsを追加する。既存業務形式8の正本へ接続した結果ではない。認可形式2は維持し、レベル4で主担当・代理と準備済み臨時管理者を同じ照合で判定する。既存レベル0～3は静的に比較する。

[namePlan](tests/publication.mjs)は通常権限でreceptionViewsとpublicStatusを読み、更新案を作る。臨時管理者にはseatFactsの取得を許可しない。更新マスクで表示名と版等だけを指定し、管理専用情報を読み戻さず保持する。

正本・受付用投影・本人当日履歴、control・publicStatusの5文書を一体保存する。投影の全項目と正本を照合し、履歴の本人・端末をセッションへ結合する。単独の表示文書更新を許す旧B09は、全役割へ拒否する試験に改訂した。

データ版を進めるため、旧準備データで次の業務更新を許可しない。最新表示と本人履歴の取得は可能。配布目録の発行を未接続とし、古い目録による準備確認を拒否する。端末の保存完了を偽って補完しない。

当日履歴は氏名や認証監査を含まない専用文書。主担当・代理は公演内、臨時管理者は稼働中・終了後の本人分だけ取得できる。一覧は本人別のパスに限定し、最大100件。締め後・一般受付と停止・失効後の臨時取得は拒否する。

## 確認と実行

[自動結合試験](tests/emulator.mjs)はAuth・Firestore EmulatorへREST要求を送る。B01～08とC01～09を保持し、B09を改訂。D01～06を追加した計24シナリオ。[参照予算](tests/budgets.mjs)は5書込みで9＋2＋3＋3＋1＝18、本人履歴取得は最大8。同一パスの再参照も数え、キャッシュ削減を見込まない。

既存POC-004のCLIを使い、依存を追加しない。PowerShell 7でリポジトリ直下から実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-39-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-39/firebase.json --project demo-concert-seat-gd91-39 --only auth,firestore 'node poc/GD91-39/tests/emulator.mjs'
```

127.0.0.1のAuth 9191・Firestore 8181に限定する。役割・端末と初期正本、失効条件は検査用管理経路で投入し、結果検査にも使う。本人セッションと更新案作成・保存は通常認可。[証拠](artifacts/emulator-summary.json)へ実行前後のソースハッシュを記録する。

## 未確認

配布目録発行とIndexedDBへの完全保存、SDK・実キューの応答喪失と再起動、Google実認証・画面と実機は未実施。操作記録の再取得はRESTで確定後に照会した結果で、実キューの中断回復を証明しない。

既存形式8への接続と保存48シナリオの回帰、全編集・複数区画と差替え回収、500人・最大構成は段階Cで確認する。停止操作・締め後照合と採否反映も未接続。18参照の候補を20参照の既存保存へ単純加算せず、参照共用と確定境界を先に設計する。方式採用・本番開始を含まない。
