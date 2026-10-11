# GD91-64 券未作成・席なしの不参加と復帰

状態：In Review。読者：開発者、設計担当者、テスト担当者。

#166の同じ正本・共通版へ、券未作成とQRなしの不参加分岐を接続する隔離PoC。[合同検証記録](../../docs/development/technical-validation/seat-business-integration-validation.md)を結果の正本とする。本番アプリケーションではない。

## 処理とデータ

| 状態 | 不参加の一体保存 | 増やさない版・作らない正本 |
|---|---|---|
| 券なし・席あり | 共通版、管理正本と参加索引、履歴と割当の5件 | ticket版、券と資格・コード |
| 券なし・席なし／構成未作成 | 同じ集合から割当を除く4件 | assignment・ticket版、空の割当表と券 |
| QRなし既存券・席あり | 券なしの5件に券・保護索引を加えた7件 | 空の資格・コード |
| QRなし既存券・席なし／構成未作成 | 同じ集合から割当を除く6件 | assignment版、空の割当表と資格・コード |

1. `noTicketPlan`は最新の版と割当を取得して、席の有無に応じた案を作る。`branchVersion`は券の不在を保存前後で検査し、席を持つ人が席なしを装う要求も拒否する。
2. `branchProfile`・`branchPeople`は同じ共通版・履歴に結び付ける。席ありは`branchAssignment`へ相互照合し、割当だけを省く要求を拒否する。対象マーカーだけでは許可しない。
3. QRなし既存券はGD91-63の券を閉じる経路を使う。席なしなら`branchNoSeatPeople`で券と参加索引を結び、割当表への書込みを省く。
4. 復帰は4件。券未作成なら券を作らず、既存券なら閉じたままにする。旧席・QRを戻さない。既存券の次cycleは再割当後だけ開始する。

発行履歴・送付時刻があれば追加確認を維持する。チェック解除でも履歴を消さず、QRなしでは停止申告を必須にしない。操作IDと案の端末保存は契約のままであり、このREST試験へ接続していない。

### 席未設定での券保護

`ticketProtection/current`に`protectedAttendeeIds`を加える。発行履歴または有効QRによる保護対象者を、保護対象席と同じ保存境界で更新する。送付チェックだけでは発券済みの席保護へ読み替えない。

後から席を設定すると、その人が保護対象なら席も保護対象へ追加する。割当と索引を含む4件を一括保存し、券・QRを書き換えない。人と席の保護を同じ索引で扱うため、席設定のRulesに個別券の再取得を追加しない。

空の旧索引で欠ける一覧は空として扱う。前提投入は空索引だけ。過去PoCの非空索引や本番データの移行を検証した結果ではない。隔離形式1での候補比較を維持する。

## 自動試験と再実行

M01～24は新しい分岐と競合・失効の試験。L01～32はGD91-63のケース本体を変更せず、新しいRulesとヘルパーで回帰する。`regression.mjs`はケース本体の一致を検査し、実行用の合成ファイルをGit管理外へ生成する。旧結果ファイルは変更しない。

```powershell
node poc/GD91-64/generate.mjs
node poc/GD91-64/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-64-config'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-64/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-64/tests/emulator.mjs && node poc/GD91-64/tests/regression.mjs'
```

pwsh 7、既存Node.js・JavaとFirebase CLIを使う。依存追加なし。demoプロジェクトと127.0.0.1の9191・8181だけに限定し、実行中は対象ソースを変更しない。GD91_CASEは診断用であり、全件結果へ混ぜない。

## 証拠と限界

- [新分岐の結果](artifacts/branches-summary.json)と[32件の回帰結果](artifacts/regression-summary.json)に実行前後のハッシュを記録する。各試験内の部分集合数をシナリオ数へ加算しない。
- 認可・完成証明と公演状態の22関数を静的照合する。参照予算は[算定コード](tests/budgets.mjs)に記録。キャッシュ減算なしの机上算定で、式評価数・請求量は未測定。
- 構成ありは通常本人セッション・公開と登録を経由する。構成未作成は同じ認可による通常セッションを使うが、版0と空の業務索引は前提投入。通常初期化・初回公開との接続を代替しない。
- 4席・単一区画。500人更新と複数区画、通常受付の生成・配布は未接続。受付実績の保持試験は前提投入記録の不変だけ。
- 自動のREST・Emulator結合試験。確認画面・SDKと暗号化IndexedDB、実機と全端末停止は未実施。結果照会は実際の応答喪失ではない。
- 通信復旧だけで共有・確定しない契約を維持。費用と回収は#167、方式採否は#168へ残す。
