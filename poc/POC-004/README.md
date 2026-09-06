# POC-004

個別認証、役割別Security Rules、任意項目の暗号化・非配布、完全オフライン開始、回線復旧後の権限停止、締め処理後の端末削除を架空データで確認するための限定PoCです。本番アプリケーションではありません。

## 安全条件

- 実在する氏名、メール、連絡先、受付情報を使用しない。
- `.env`、`.firebaserc`、パスワード、トークン、共有パスフレーズ、鍵をGitへ保存しない。
- ローカル単体・E2E・Emulator試験が成功するまで実Firebaseへ接続しない。
- 実FirebaseではPOC-004専用`runId`、架空利用者5件以内、専用Rulesだけを扱う。
- TTL、Cloud Functions、Hosting、Storage、Analytics、App Check、Blaze、カード登録を使用しない。
- 終了時は開始承認依頼書の限定削除と設定復元を実施する。

## ローカル確認

```powershell
npm ci
npm test
npm run build
npm run test:e2e
npm run emulators:test
npm audit --audit-level=high
```

`npm run emulators:test`にはJavaが必要です。Firebase Emulatorだけを使用し、実プロジェクトへ接続しません。

## 実Firebase接続前ゲート

1. `poc-004-approval-request.md`がApprovedであることを確認する。
2. プロジェクトID、Sparkプラン、請求先未接続、使用量を確認する。
3. 現在配信中のFirestore Rulesを取得して開始前状態を照合する。
4. `.env`と`.firebaserc`をローカルに作り、Git管理外であることを確認する。
5. ローカル全試験、依存関係監査、秘密情報検査が成功していることを確認する。

実Firebase用の操作値や認証情報をREADME、Issue、PR、ログへ貼り付けないでください。
