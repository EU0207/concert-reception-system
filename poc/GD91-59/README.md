# GD91-59 構成完成証明の完了確認

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | #165の不足証拠を補い、承認済みGD91-53のV1完了条件を判定する |
| 前提 | GD91-58のRulesを内容変更なしで使用。旧確定データ・認可と業務初期値は試験投入 |
| 結論 | [完成検証記録](../../docs/development/technical-validation/seat-completion-validation.md)の完了条件表へ集約 |

## 処理と確認範囲

- F01～06：形・列設定を変えた候補と、非席4種別からの手入力席を通常発行して一体確定する。末尾1セルの小片、欠番消費・次番号と旧席保護も確認する。
- F07・13・14：逆方向拡張の原点移動を一般差替えの例外にしない。当日の許可と専用操作をクライアントの種別申告だけで通さない。専用経路の成立確認は#166に残す。
- F08～12：ローカルHTTP中継で要求転送前、またはEmulatorの確定成功後に接続を切る。成功応答を受け取れない状態から同じ操作IDで照会する。別Nodeプロセスで結果と検査進捗を取得する。

中継の転送先は127.0.0.1のEmulatorに固定。試験終了時に接続を閉じ、認証トークンを出力・保存しない。通信断はローカルHTTPの障害注入であり、実ネットワーク・Firebase SDKの再試行を検証したものではない。別プロセスの照会には試験の操作IDと有効な認証を標準入力で渡す。IndexedDBへの永続保存は#104・105・110で別途確認する。

## 証拠の再利用と工程境界

今回の追加試験は14件。GD91-58の129件を今回の実行件数へ加算しない。Rulesは同一内容で、GD91-58の6結果・64ソースハッシュを再照合する。500席と2区画の既存証拠、[同一候補の引継ぎ入力](../GD91-58/artifacts/business-handoff.json)を保持する。

V1は構造・比較証跡から完成候補を発行する共通境界。V2は同じ候補に、正式認可・公演状態と全操作の業務条件を接続する。#166の既存条件には行列拡張・未割当席編集と全体スライドが含まれる。保護済み席の逆方向拡張は専用の原点移動検査が必要で、一般差替えでは拒否を維持する。V1の完了を当日操作・方式採用の承認へ読み替えない。

## 再実行

既存Node.js 24・JavaとPOC-004のFirebase CLIを使用。依存追加なし。8181・9191・4401・4501・9150が使用中なら中断し、既存プロセスを止めない。PowerShell 7で実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-59-config'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-59/firebase.json --project demo-concert-seat-gd91-59 --only auth,firestore 'node poc/GD91-59/tests/completion-emulator.mjs'
```

`completion-summary.json`へ実行前後15ソースのハッシュを記録する。補助ファイルはGD91-58と内容を照合し、公演用のdemo project IDだけを変更したもの。初回はCLIのプロジェクト外Rules参照制限で、試験開始前に停止した。[起動記録](artifacts/launch-attempt.json)を保持し、Rulesを同一内容で隔離ディレクトリーへ複製して再開した。
