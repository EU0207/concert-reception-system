# POC-003 実機QR・電子チケット

## 位置づけ

Issue #6で2026-09-03に明示承認された`POC-003`専用の技術検証である。本番アプリケーションではなく、すべて架空データを使用する。範囲、依存関係、外部資源、保存・削除、費用は[POC-003開始承認依頼書](../../docs/development/poc-003-approval-request.md)に従う。

## 確認対象

- SafariとChromeの実機カメラによるQR読取り
- 「次へ」前の連続読取り防止と、オフラインIndexedDB保存
- iPhone 17、iPhone 13 mini、Galaxy Z Fold8外側・内側画面
- A6縦1ページPDF、紙・別端末画面からの読取り
- 確認コード、座席変更時のQR維持、紛失再発行時の旧QR拒否
- 主担当・代理だけの500人分ZIP生成

認証強度、実際の権限制御、Firestore同期、暗号化、本番利用は対象外である。

## 固定した直接依存関係

| パッケージ | 版 | 用途 | ライセンス |
|---|---:|---|---|
| `@zxing/browser` | 0.2.1 | 実機カメラ入力 | MIT |
| `@zxing/library` | 0.23.0 | QR解析 | Apache-2.0 |
| `idb` | 8.0.3 | IndexedDB操作 | ISC |
| `jszip` | 3.10.1 | 500件PDFのZIP化 | MIT OR GPL-3.0-or-later |
| `pdf-lib` | 1.17.1 | A6 PDF生成 | MIT |
| `qrcode` | 1.5.4 | 架空QR生成 | MIT |

完全な依存関係は`package-lock.json`で固定する。Firebase SDKは実行時依存へ追加せず、`firebase-tools`は期限付きHosting配信にだけ使う。直接依存のライセンスはローカルに導入された各`package.json`で確認済みである。

2026-09-03に依頼者の明示許可を得て`npm audit --audit-level=high`を実行し、High 0件、Critical 0件を確認した。Moderateは8件で、いずれも配信用の開発依存`firebase-tools`またはその間接依存に関係する。監査が示す強制修正は`firebase-tools`の版を巻き戻すため適用せず、CLIをアプリへ同梱しないこと、期限付きプレビューの配信時だけ使用することで分離する。

## ローカル確認

```powershell
npm install
npm test
npm run build
npm run test:e2e
```

実Firebase設定はアプリへ含めない。Hosting配信にはローカルFirebase CLIの認証状態と明示的な`--project`指定だけを使う。

## 外部配信

ローカル確認後、liveではなく1日期限のプレビューチャネルだけへ配信する。実施日を含む正確なチャネルIDを記録する。

```powershell
firebase hosting:channel:deploy poc-003-YYYYMMDD --expires 1d --project PROJECT_ID
```

試験終了後、同じチャネルIDだけを照合して削除する。プレビューURLは公開URLなので、架空データ以外を入力・表示しない。

### 2026-09-03 配信記録

| 項目 | 記録 |
|---|---|
| Firebaseプロジェクト | `crs-poc-001-20260902-01` |
| Hostingサイト | `crs-poc-001-20260902-01`（既存の既定サイト） |
| プレビューチャネル | `poc-003-20260903` |
| 配信回数 | 4回（初回、入口のキャッシュ制御修正、ブラウザー情報の自動表示、保存済み受付記録数の表示） |
| 有効期限 | 2026-09-05 20:41:32（JST） |
| 外部確認 | HTTP 200、想定タイトル、JavaScript入口、`Cache-Control: no-store, no-cache`を確認 |
| 追加承認 | 2026-09-03、保存済み受付記録数の表示修正に限り4回目の配信を承認。費用、外部サービス、保存データは変更しない |

プレビューURLは実機確認担当者へ直接共有する。期限終了または試験終了時に、このチャネルだけを照合して削除する。

## 実機結果

各実機は画面内の確認票を完了し、`FAKE-P003-device-result-...json`を保存して開発担当者へ渡す。操作順は[POC-003実機確認手順書](../../docs/development/poc-003-device-test-guide.md)に従う。

## 終了処理

実機結果受領後、プレビューチャネルを削除してURLのHTTP 404を確認し、`artifacts/raw/`内の集計済み3ファイルを限定削除して残存0件を確認した。各端末のPOC-003サイトデータ・カメラ許可と、`FAKE-P003-`で始まるダウンロードは依頼者の削除確認待ちである。Firebaseプロジェクトと既定HostingサイトはPOC-005終了確認まで保持する。
