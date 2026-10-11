# GD91-61 SDKの競合・エラーと明示再操作

状態：In Review。読者：開発者、設計担当者、テスト担当者。

#166第4条件のうち、GD91-60の構成公開と公演開始をFirebase Web SDKへ接続する隔離PoC。正式な結果・残条件は[合同検証記録](../../docs/development/technical-validation/seat-business-integration-validation.md)を正本とする。本番アプリケーション・画面は変更しない。

## 処理とデータ

1. GD91-60の通常要求で完成候補を作る。初期役割・端末と旧正本は同じ前提投入。SDKへ渡す端末トークンも通常Auth Emulator発行であり、管理者トークンではない。
2. `plan`が確定案の操作ID・期待版と送信内容を保持する。`send`は操作履歴を先に読み、同じイベントなら既存結果を返す。未確定なら期待版を照合し、構成3件または状態4件をトランザクションで保存する。
3. SDKの再試行でも操作ID・案を作り直さない。最大3試行に制限し、古い版は再確認へ戻す。権限拒否はアプリケーションで再送しない。
4. `inspect`はサーバーから同じIDの結果を照会する。取得拒否・通信失敗を「存在しない」と解釈しない。再送する場合は利用者の明示操作を必要とする。

`matches`は正式イベントの内容を照合する。送信内容全体の永続ハッシュ・暗号化した端末操作記録との結合は未実施。メモリー内の案や別SDKインスタンスによる照会を、IndexedDB保存・プロセス終了後の復旧へ読み替えない。

## 確認範囲

| ケース | 対象 |
|---|---|
| S01～06 | 通常公開・状態遷移、同一IDと異なるイベント、古い版と権限失効 |
| S07・08 | 対照試験。通信停止APIだけではトランザクション送信を止められず、通常バッチはオフライン待機後に送信されることを確認 |
| S09・10 | 成功応答を採用しない場合の別インスタンス照会と、照会不能を不在扱いにしないこと |
| S11 | 同時要求10回。初回成功は最大1件。双方未確定なら不変・履歴不在を確認して明示再操作。負けた古い案は再計算せず拒否 |
| S12～14 | 部分保存拒否、明示オフライン制御、gRPC UNAVAILABLE注入と回復後の明示再操作 |

SDKの通信停止APIとHTTP遮断は別の試験。`proxy.mjs`は127.0.0.1:8281から8181だけへ中継し、遮断中はgRPC UNAVAILABLEを返す。SDK内部の実行中再試行と、失敗終了後のアプリケーション再送を区別する。回復イベントから保存を開始する処理はない。

## 再実行

既存のNode.js・JavaとFirebase CLI、POC-001のFirebase 12.18.0を使用する。依存追加なし。GD91-60のRules・設定を直接使用し、複製・変更しない。pwsh 7で実行する。

```powershell
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-61-config'
$env:GD91_FRAGMENT_WIDTH='2'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-60/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-61/tests/sdk-emulator.mjs'
```

実行中はソースを変更しない。全件結果とソースハッシュは[実行証拠](artifacts/sdk-summary.json)へ記録する。失敗記録はartifactsに保持し、旧GD91-60の47件を今回の実行数へ加算しない。

## 限界

- Node.js上のWeb SDK・メモリーキャッシュを使用。実ブラウザー・Auth SDK・Google実認証と実機は未確認。
- HTTP/2経由のgRPCエラーはローカル障害注入。実回線断と送信途中の切断、SDKの成功応答そのものの喪失は未確認。S09は成功を待った後に結果を採用しない試験。
- 全業務保存・500人更新と複数区画、共有下書きは未接続。#166全体、第2～4条件の完了や本番方式採用を意味しない。
- ブラウザーでの送信制御と離脱、操作記録の永続化・復旧は#110・111で確認する。拒否後に新IDを発行せず、照会不能時は案を保持する契約を維持する。
