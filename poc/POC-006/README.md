# POC-006: 第三者レビュー C-01・C-03 の限定検証

## 目的

本番アプリとは分離し、架空データだけで次を確認する。

- C-01：同じ利用者の端末Aを停止後、Aが端末BのIDを指定しても読取り・書込みを拒否する。利用者のログイン状態と、端末ごとの認証主体をRulesで照合する。
- C-03：旧5MB上限案の分割保存と、最新のCONF-053で採用した1MB上限案の1画像1文書保存を比較する。固定枠、版切替、旧版削除、6つの独立した取得元への配布を確認する。

外部サービスへ接続しない。Firebaseエミュレーターは既存の`poc/POC-004/node_modules`にあるCLIを使用し、新しい依存関係は追加しない。

## 実行

リポジトリのルートで次を実行する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-poc006-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/POC-006/firebase.json --project demo-concert-reception-poc-006 --only auth,firestore "node poc/POC-006/tests/emulator.mjs"
node poc/POC-006/tests/device-proof.mjs
```

エミュレーター試験では固定のローカルポート9099、8080を使う。実行前にこれらのポートを使用していないことを確認する。`device-proof.mjs`は別サービスを使う場合の署名方式をNode.jsのWeb Cryptoで模擬し、Cloudflare Workers上のCPU・料金・実サービス連携を証明しない。

## 成立範囲

第一候補は、同じFirebaseプロジェクト内で利用者用Authと端末用匿名Authを別の名前付きFirebase Appへ分ける方式である。管理者が端末Auth UIDと利用者UIDを公演ごとに関連付け、利用者Authだけが対象端末の有効なセッション証跡を書ける。業務要求のRulesは端末Auth UID、端末停止、利用者役割、セッション証跡を照合する。高影響操作は最近の利用者再認証で発行した短時間の証跡を追加で要求する。エミュレーターでは同じ利用者の端末Aだけを停止し、Aの読取り・書込みとBのIDを名乗る作成を拒否してBの継続を確認した。利用者ログアウト時のセッション無効化も確認した。

端末Authの更新トークンを別端末へ複製された場合、複製先を元端末と識別できない。このPoCは物理端末への耐複製性を証明しない。端末停止・紛失時はその資格を停止し、再登録には管理者承認を要求する。高影響操作のRulesを含め、実装後の本番相当受入試験は別に行う。

別サービス候補の業務API模擬では、利用者トークン、端末署名、端末状態、役割、nonceを検査した。Firestore Rulesの`poc006GatewayOnly`はその構成で必要なクライアント直接経路の拒否を確認する。これは比較用であり、サーバー資格を使う本番方式は採用していない。

画像Rulesは検証用の架空メールで管理者と閲覧担当を分ける。実運用ではC-01で確定する認可主体へ置換する。旧案の固定2バンク・各5枠・7分割も比較用に残す。採用案は固定2バンク・各5枠・1バンク1文書で、画像本体の同時保存量を最大10,000,000バイトに制限する。途中失敗時の作業バンク回収、実画像の可読性、実画面と実機の確認、正式な役割認可は後続設計の対象とする。
