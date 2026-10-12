# 受付配布・共有下書きと端末復旧の合同検証

状態：In Review。読者：開発者、設計担当者、テスト担当者。#166の隔離PoC。本番方式の採用・アプリ実装ではない。

## 結論

GD91-71へ受付用の読取データと共有下書きを接続した。保存・認可の試験は通ったが、全席複製による配布方式は詳細設計の同時公開を満たさない。採用せず、差分方式との比較・判断へ渡す。#166は完了にしない。

## 処理と前提

- receptionBuildsへ基準8版と対象席を固定する。検査済み構成と移動量からgeometryを作り、現在の割当・表示名と受付状態だけをrowsへ結合する。1席ずつ完成を確認し、最後にreceptionHeadを公開する。
- 一般受付は公開中かつ現在の受付版と一致するrowsだけを取得する。管理正本・途中世代と過去世代を拒否する。取得は100件以下の一覧またはID指定。管理履歴・購入者情報を含めない。
- sharedDraftsは最新の主担当・代理に限定する。暗号文と基準確定版を保存し、版・割当・受付を変更しない。操作IDごとの不変記録で同一IDを照会する。共有の選択版管理・期待共有版のCASは未接続。
- IndexedDBは公演・本人をキーに、既存のPBKDF2-SHA-256/AES-GCM-256で暗号化する。保存形式版・基準版と送信案を同じトランザクションへ保存する。完了時だけ成功とし、中断・旧ローカル版は直前データを保持する。
- SDKは固定した案と操作IDを送る。再起動後は同じ履歴を先に照会する。オフラインは送信関数の入口で拒否し、回線復旧イベントから送らない。入れ子のサーバー時刻とナノ秒精度を保持する。

初期役割・端末登録と構成head、source側の制御・保護写像は既存と同じ前提投入。通常要求の構成・名簿・割当と券、配布と共有を区別する。D11の既存受付記録は前提投入で、受付業務の書込み実装ではない。旧receptionViewsはGD91-60の前提投入試験にだけ残し、新head発行後は拒否する。旧形式からの本番移行は未検証。

暗号鍵の配布と端末の認可コンテキストは前提。ブラウザー試験のパスフレーズ・データは架空で、再起動後に同じ値を試験側から再入力する。鍵をブラウザーへ永続保存しない。共有暗号文の鍵も実行中だけ生成し、結果へ保存しない。512KiBと表示番号64文字は隔離評価値で、製品上限ではない。

## 全件結果

| 結果 | 範囲 |
|---|---|
| distribution-summary.json：12件 | 通常配布・取得制限、未完成・旧版・失効と偽装の拒否、共有の隔離。通常登録500人・50組、2区画500席の配布と取得 |
| 個別編集から券までの8回帰JSON：139件 | ケース本体を変えずGD91-72のRulesで実行。拡張11・スライド11・配置20、名簿12・初期化20、不参加24・券32、個別編集9 |
| access-regression.json：26件 | 既存本人・端末認可と状態のケース本体を変更せず同じRulesで回帰。配布目録等の前提投入は維持 |
| sdk-summary.json：26件 | 初期化・公開から名簿・席・券、拡張・追加・スライドと共有・状態へ接続。旧版・同一IDの異内容と失効を拒否、別本人・端末の競合を照合 |
| browser-summary.json：9件 | 実Edgeの隔離プロファイルで500席保存・再読込・プロセス再起動、所有者分離・中断、オフラインと同一ID復旧 |

計212シナリオ。RESTは177件、SDKは26件、ブラウザーは9件として区別する。各全件結果の前後ハッシュが一致し、filter=nullまたはselectedCase=all。以前の候補・途中実行は加算しない。スマートフォン等での人による実機確認ではない。

## 制約

1. 配布だけで500席に1,503書込み（読取りは別途）。ローカルの発行から500件取得まで44,535msで、本番速度・請求量ではない。名簿登録・配置と構成準備の費用を含まない。
2. 正本確定の後に配布するため、公開完了まで最新データ取得を拒否する。確定と共通投影の同時更新を証明していない。確定保存の成功と配布完了を同じ成功表示にしてはならない。
3. このrowsは席の最小投影。区画名・舞台と非席レイアウト、帳票へのSeatMapProjection全体は未接続。緊急の種別・理由だけを含み、操作者や過去履歴は配布しない。
4. ブラウザー試験は保存トランザクションの中断注入であり、物理的容量不足・電源断の実証ではない。オフライン起動・PWAと実機、鍵配布・失効の完全な運用は未確認。応答喪失は成功応答の破棄で、実パケット喪失ではない。

机上の外部参照はgeometry最大9、row最大10、公開head最大6。確定正本への追加書込みは0。式評価数・最大容量と保管回収は未測定。V3 #167・V4 #168の完了や採用へ読み替えない。

## 再実行

PowerShell 7と既存Node.js・Java、POC-004のFirebase CLI・Vite、POC-001のFirebase SDK・Playwrightを使用する。既存Edgeを使い、依存やブラウザーをダウンロードしない。localhostとdemoプロジェクト以外へ接続しない。

```powershell
node poc/GD91-72/generate.mjs
node poc/GD91-72/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --config poc/GD91-72/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore
```

別のPowerShell 7でViteを起動する。

```powershell
node poc/POC-004/node_modules/vite/bin/vite.js --config poc/GD91-72/vite.config.mjs
```

さらに別のPowerShell 7で順に実行する。試験中に依存ソースを編集しない。

```powershell
$env:GCLOUD_PROJECT='demo-concert-seat-gd91-60'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8181'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9191'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/GD91-72/tests/emulator.mjs
node poc/GD91-72/tests/regression.mjs
node poc/GD91-72/tests/access-regression.mjs
node poc/GD91-72/tests/sdk.mjs
node poc/GD91-72/tests/browser.mjs
```

結果はartifacts、生成Rulesと架空の暗号化ブラウザープロファイルはGit対象外のnode_modules/.cacheへ残す。終了時は起動した2プロセスをCtrl+Cで停止する。過去の失敗JSONは保持する。SDKの入れ子時刻照会、試験の必須理由と失効前後の順序を修正して全件を再実行した。回帰の参照パス誤りはケース開始前に修正し、試験合格へ数えない。
