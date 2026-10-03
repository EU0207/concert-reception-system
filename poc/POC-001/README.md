# POC-001 完全オフライン受付・復旧後統合

## 位置づけ

Issue #6で明示承認された`POC-001`専用の技術検証である。本番アプリケーションではなく、架空データだけを使用する。承認範囲と削除方法は[POC-001開始承認依頼書](../../docs/development/technical-validation/poc-001-approval-request.md)に従う。

2026-09-02にローカルエミュレーターと専用実Firebaseの両方で合格した。結果、制約、次の判断は[POC-001実施結果報告書](../../docs/development/technical-validation/poc-001-result.md)を参照する。

## 確認対象

- 500件の架空QRを事前準備し、通信がない状態でも追記イベントをIndexedDBへ保存できること
- 同じ架空QRを複数環境で初回受付した記録を消さず、復旧後に競合として導出できること
- 再読取り理由・架空メモ、通常・重要連絡、重要連絡の利用者別確認を追記できること
- 送信確認まで未送信イベントを保持し、同じeventIdを再送しても重複しないこと
- 6つの分離環境で復旧後に同じイベント集合を取得できること

QRカメラ読取り、性能合格判定、メール＋パスワード認証、役割制御、任意項目暗号化、本番利用は対象外である。

## 前提

- Node.js 24 LTS
- npm 12.0.2
- Firestore/Authエミュレーターを使う場合はEclipse Temurin JDK 21 LTS
- 外部Firebaseへ接続する場合は、承認依頼書に従う専用Sparkプロジェクトと`.env.local`

## コマンド

```powershell
npm install
npm run build
npm test
npm run emulators
npm run test:e2e
```

Firebaseエミュレーターでは、プロジェクトID`demo-concert-reception-poc-001`を使用する。`demo-`プロジェクトはローカル検証用であり、実在するFirebase資源へ接続しない。

実Firebaseの設定値は`.env.local`または実行プロセスの環境変数にだけ設定し、Gitへ保存しない。依頼者が初期設定でCLI認証を行うことは前提にせず、本番候補では[Firebase初期設定・引継ぎ手順書](../../docs/client/firebase-initial-setup-guide.md)に従って所有権と技術作業を分離する。

## 保存場所

- Cache Storage：静的なHTML、JavaScript、CSS、アイコンだけ
- IndexedDB `concert-reception-poc-001`：架空QR、追記イベント、送信状態、最終同期情報
- Firestore `pocRuns/{runId}/events/{eventId}`：同期済みの架空イベント
- `artifacts/raw/`：一時的なPlaywright結果。Git管理外
- `artifacts/`直下：確認済みの集計結果だけをGit管理

## 検証結果

- 単体テスト：4ファイル、12件合格
- 本番ビルド：合格
- ローカルエミュレーターE2E：1件合格（1分24秒）
- 実Firebase E2E：1件合格（23.3秒）

E2Eはいずれも、6環境、架空QR 500件、508イベントの復旧後統合、競合1件、再読取り、重要連絡、5利用者の確認、1環境停止後の継続を確認する。実行時間は`POC-002`の性能結果ではない。

## 現在の依存関係監査

2026-09-02の初回`npm audit --audit-level=high`ではHigh/Criticalは0件、`firebase-tools`の推移依存にModerateが5件あった。強制修正は`firebase-tools`のメジャー相当変更を伴うため行わず、外部接続前にも再確認する。

## 外部資源の終了状態

2026-09-03に実FirebaseのPOC-001実行パスと匿名利用者12件を削除し、Firestoreイベント0件、匿名利用者0件を確認した。検証専用プロジェクト本体、Web App、Firestoreデータベース、RulesはPOC-005終了確認まで保持する。POC-002以降はそれぞれ別途明示承認を得るまで使用しない。
