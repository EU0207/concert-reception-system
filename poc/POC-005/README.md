# POC-005

複数階500席、PNG/JPEG 5枚、完全オフライン表示、現在席の強調、画像なし代替を確認する最小PWAです。すべて架空データで、本番アプリではありません。

## 実行

Node.js 24とnpm 12.0.2を使用します。

```text
npm ci
npm run generate:assets
npm test
npm run build
npm run test:e2e
```

生成画像は`generated-assets/`、生の試験結果とアクセス用QRコードは`artifacts/raw/`へ出力され、Git管理されません。

## Firebase Hosting

`.firebaserc.example`を`.firebaserc`へコピーし、`default`だけを承認済み検証プロジェクトIDへ変更します。Spark・請求先未接続を確認してから、POC-005専用プレビューチャネルへ1日期限で配信します。liveチャネルは変更しません。

```text
firebase hosting:channel:deploy poc-005-YYYYMMDD --expires 1d
node scripts/generate-access-qr.mjs https://発行された確認URL/
```

実機手順は`docs/development/technical-validation/poc-005-device-check-guide.md`を参照します。結果確認後にチャネル、端末データ、生成物、生証跡を限定削除します。Firebaseプロジェクト本体は別確認なしに削除しません。
