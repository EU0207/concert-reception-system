# POC-001 開始承認依頼書

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | POC-001の限定的なコード作成と外部接続を開始する前に、対象、依存関係、外部資源、保存データ、削除方法、費用0円の根拠を提示する |
| 主な読者 | 依頼者、開発担当者、確認担当者 |
| 前提 | [技術検証計画書](technical-validation-plan.md)、[技術実現可能性調査報告書](technical-feasibility-research.md) |
| 関連Issue | [#6](https://github.com/EU0207/concert-reception-system/issues/6) |
| 関連ID | POC-001、TBD-002、REQ-F-017、REQ-F-030、REQ-F-034、REQ-F-037、REQ-NF-003、REQ-NF-004、AC-011、AC-015、AC-024、AC-027 |
| 調査日 | 2026-09-02 |
| 状態 | Approved |
| 承認情報 | 2026-09-02に依頼者が本書を確認し、`POC-001`に限って開始を明示承認。[Issue #6の記録](https://github.com/EU0207/concert-reception-system/issues/6#issuecomment-5507443520) |

## 承認を依頼する範囲

次の作業だけを`POC-001`として承認依頼する。

1. Issue #6用ブランチ内の`poc/POC-001/`に、本番利用を前提としないVanilla TypeScriptの最小PWAを作成する。
2. 500件の架空QRと架空の担当者・端末IDだけを使い、6つの独立ブラウザ環境で受付イベント、競合、再読取りメモ、スタッフ連絡、重要連絡の確認を試す。
3. 端末内IndexedDBに変更不能なイベントと送信状態を保存し、Firebase Local Emulator Suiteで復旧後統合を先に確認する。
4. ローカル検証合格後、Firebase Sparkの専用検証プロジェクトへ同じ架空データを接続し、実サービスで再接続・重複排除・共有を確認する。
5. 結果、限界、再現手順、使用量、削除確認を文書化する。

`POC-002`～`POC-005`、本番実装、技術採用、詳細な画面、QRカメラ読取り、性能合格判定、メール＋パスワード認証、権限制御、暗号化、Firebase Hostingへの公開は承認対象外とする。

## 推奨構成

```text
6つの独立ブラウザ環境
  ├─ Service Worker Cache: HTML、JavaScript、CSS、アイコンだけ
  ├─ IndexedDB: 架空QR参照データ、追記イベント、送信状態
  └─ 同期処理: 未送信イベントをeventId単位で再送
                     │
                     ├─ 第1段階: ローカルFirestore/Authエミュレーター
                     └─ 第2段階: Firebase Spark専用検証プロジェクト
                                      ├─ Anonymous Authentication
                                      └─ Cloud Firestore
```

- 受付結果を現在状態へ直接上書きせず、UUID形式の`eventId`を持つ追記イベントとして扱う。
- サーバー側も`eventId`を文書IDにし、同じイベントを再送しても1文書だけになることを確認する。
- 現在状態、競合、再読取り履歴、連絡、重要確認はイベント集合から導出する。
- Firestore SDKの永続キャッシュには依存せず、PoCの端末保存と削除対象をアプリケーション用IndexedDBへ明示する。Firestoreはメモリーキャッシュで使用する。
- Background Syncには依存せず、画面を開いている間の自動再送と手動再送を確認する。

## 依存関係

承認前にはインストールしない。承認後、2026-09-02に確認した次の安定版を`package.json`と`package-lock.json`へ完全固定して導入する。開始日が後日になった場合は、インストール直前に公式レジストリでセキュリティ修正版の有無を再確認し、表から変更する場合はIssue #6へ差分と理由を示して再承認を得る。`npm install --save-exact`を使い、意図しない自動メジャー更新を避ける。

| 区分 | 名前・候補版 | 用途 | ライセンス | 採用理由 |
|---|---|---|---|---|
| 実行環境 | Node.js 24 LTS（確認時24.20.0） | ビルド、テスト、CLI実行 | MIT | 2026-09-02時点のLTS。候補ツールのNode要件を満たす |
| 実行環境 | npm（Node.js同梱版） | 依存関係とlockfile管理 | Artistic-2.0 | Node.js標準の一般的な導入方法 |
| エミュレーター前提 | Eclipse Temurin JDK 21 LTS | Firestoreエミュレーター実行 | GPL-2.0 with Classpath Exception | Firebase要件のJDK 11以上を満たす無償LTS候補 |
| 実行依存 | `firebase` 12.18.0 | Firestore、匿名認証、オンライン状態確認 | Apache-2.0 | 第一PoC候補の公式Web SDK |
| 実行依存 | `idb` 8.0.3 | IndexedDBの明示的なスキーマ・トランザクション操作 | ISC | Web標準に近い小規模ラッパーで、送信待ち管理を簡潔にする |
| 開発依存 | `typescript` 7.0.2 | イベント型と保存形式の静的検査 | Apache-2.0 | データ形状の誤りを早期検出する |
| 開発依存 | `vite` 8.2.2 | 最小PWAの開発・ビルド | MIT | UIフレームワークを追加せずVanilla TypeScriptを扱える |
| 開発依存 | `vite-plugin-pwa` 1.3.0 | 静的資産だけを事前キャッシュするService Worker生成 | MIT | PWA起動確認に必要な設定を限定できる |
| 開発依存 | `firebase-tools` 15.28.2 | Firestore/Authエミュレーター、検証用プロジェクト操作 | MIT | Firebase公式CLI |
| 開発依存 | `vitest` 4.1.11 | イベント統合・競合導出の単体テスト | MIT | Viteと同じ構成で小さくテストできる |
| 開発依存 | `fake-indexeddb` 6.2.5 | IndexedDB処理の単体テスト | Apache-2.0 | 実ブラウザ前に保存ロジックを再現できる |
| 開発依存 | `@playwright/test` 1.62.1 | 6つの分離ブラウザコンテキストによるシナリオ実行 | Apache-2.0 | Cookie、Storage、IndexedDBを分離した反復可能な環境を作れる |

React、Vue等のUIフレームワーク、QR解析ライブラリ、暗号化ライブラリ、サーバーSDKは追加しない。推移依存関係はlockfileで固定し、導入後に`npm audit`とライセンス一覧を記録する。監査結果にHighまたはCriticalがあれば外部接続へ進まず報告する。

## 作成する外部資源

開発者のGoogleアカウントで、PoC専用と識別できる名称を付ける。正確なプロジェクトIDは作成前にIssue #6へ記録し、既存または本番用プロジェクトを流用しない。PoCプロジェクトを本番へ移行または流用せず、検証終了後に削除する。

| 資源 | 設定 | 保存されるもの | 作成しないもの |
|---|---|---|---|
| Firebaseプロジェクト | Sparkプラン、請求先アカウント未接続、Google Analytics無効 | プロジェクト設定、利用量メタデータ | Blazeプラン、課金予算、自動アップグレード |
| Firebase Web App登録 | POC-001専用の1件 | Web App ID、公開用Firebase設定 | Android/iOS App登録 |
| Cloud Firestore | Standard edition、`(default)`の1データベース、東京リージョン`asia-northeast1`、PITR・バックアップ・TTL無効 | PoC実行情報と架空イベント | Storage、Functions、Data Connect |
| Firebase Authentication | Anonymous providerだけを有効化 | 6環境分以上の匿名UID、作成・最終利用メタデータ | メール、電話番号、実在アカウント |

Firebase Hosting、Cloud Functions、Cloud Storage、Analytics、App Checkは使用しない。ローカル静的サーバーとエミュレーターで不足することが判明した場合、勝手に資源を追加せず理由と影響を提示して再承認を得る。

## Googleアカウントと環境の分離

### 管理主体

| 環境 | Googleアカウント・所有者 | 用途 | 納品時の扱い |
|---|---|---|---|
| ローカルエミュレーター | 開発者のローカル環境 | 外部接続前の検証 | PoC専用データを削除し、共有キャッシュは残す |
| POC-001 Firebaseプロジェクト | 開発者のGoogleアカウントをOwnerとする専用プロジェクト | 架空データによる技術検証だけ | 証跡採取後に削除し、本番へ移行しない |
| 将来の本番Firebaseプロジェクト | 依頼者が指定する管理用GoogleアカウントをOwnerとする別プロジェクト | 承認済みシステムの本番運用 | 依頼者が継続所有し、開発者の一時権限は納品時に削除する |

- 開発者のGoogleアカウント名、メールアドレス、ログイン情報、Firebase CLI認証トークンは、GitHub、ソース、文書、Issue、ログ、スクリーンショットへ保存しない。
- `firebase login`の認証状態は開発者端末のユーザープロファイル内で管理し、リポジトリへコピーしない。CI用の長期トークンとサービスアカウント鍵はPOC-001では作成しない。
- Firebase Web Appの設定値とFirebase用APIキーは、Firebase公式説明ではプロジェクト識別用で公開を前提としており、データ認可には使用されない。ただし、開発・本番の誤接続と公開物への環境情報混入を防ぐため、本プロジェクトでは環境変数で分離し、実値をGitへ保存しない。
- データの保護はAPIキーの秘匿ではなく、Firebase Authentication、Firestore Security Rules、必要に応じて将来評価するApp Checkで行う。

### 本番導入時の役割分担案

本番利用時に依頼者だけでFirebaseの技術設定を行うことは前提にしない。依頼者が所有権を保持し、開発者が一時的な権限で設定を支援する。

| 担当 | 実施内容 |
|---|---|
| 依頼者 | 管理用Googleアカウントの用意、復旧方法と2段階認証の確認、利用条件の確認、本番プロジェクトのOwner保持、開発者の一時招待と納品時の削除、重要通知の受領 |
| 開発者 | 画面共有または手順書による作成支援、承認済みリージョン・無料プラン・Firestore・Authentication・Security Rules・Web Appの設定、接続確認、設定記録、操作説明 |
| 共同確認 | Sparkプランと請求先未接続、使用サービス、権限一覧、データ保存先、バックアップ・削除方法、緊急時の連絡先、開発者権限削除後の動作 |

依頼者が本番プロジェクトを作成してOwnerとなった後、開発者を設定期間だけEditorとして招待する単純な方法を第一案とする。Editorは広い変更権限を持つため、招待先メールアドレスを画面上で照合し、期間を限定し、設定完了後はViewerへ下げて引継ぎ確認を行った後に削除する。設計工程では必要権限を再確認し、より狭い定義済みロールだけで設定できる場合はそちらを優先する。開発者をOwnerにせず、請求設定を変更できる権限も渡さない。

### 依頼者向け案内

- 初回設定は、画面名・押す場所・期待表示をスクリーンショット付きで示す1回限りの手順書とチェックリストを用意する。秘密情報や実在のメールアドレスを画像へ含めない。
- アカウント作成、Owner確認、開発者招待・削除など依頼者本人だけが行う操作は、画面共有で支援できる手順にする。
- 公演作成、利用者管理、事前準備、締め処理など通常運用はアプリの管理画面から行い、日常的にFirebase Consoleを操作しない設計を基本とする。
- 年1回でも実施できる開催前チェック、無料プラン・使用量・重要通知の確認、障害時の連絡先を運用手順へまとめる。
- 本番環境の設定値は環境別テンプレートと検証コマンドで確認できるようにし、手入力項目を最小化する。自動化がOwner権限や秘密情報を過剰に要求する場合は採用しない。
- この役割分担と案内方法は設計・リリース工程の成果物へ引き継ぎ、依頼者による受入確認の対象にする。

## 保存データ

### 端末・ブラウザ

| 保存先 | 保存項目 | 個人情報 | 保持期間 |
|---|---|---|---|
| Cache Storage | HTML、JavaScript、CSS、アイコン、Web App Manifest | なし | PoC終了時まで |
| アプリ用IndexedDB | `runId`、架空の`performanceId`、500件の不透明な架空QR識別子、架空席、イベント、送信状態、最終同期情報 | 実在情報なし | 全送信確認と結果採取後まで |
| Firebase Auth用ブラウザ保存 | 匿名UIDとSDKの認証状態 | 実在情報なし | 匿名利用者削除・サインアウト・サイトデータ削除まで |
| Firestore SDKメモリー | 開いている画面が購読した架空イベント | 実在情報なし | タブを閉じるまで |
| Playwright一時領域 | 分離コンテキスト、スクリーンショット、trace、ログ | 実在情報なし | 結果確認後、必要な要約を残すまで |

アプリ用IndexedDBのイベント共通項目は`eventId`、`runId`、`performanceId`、`eventType`、架空`actorId`、架空`deviceId`、`clientOccurredAt`、`serverReceivedAt`、`syncStatus`とする。種類別データは次に限定する。

| イベント種別 | 種類別データ |
|---|---|
| 初回受付 | 架空QR識別子、判定結果 |
| 再読取り | 架空QR識別子、4分類の理由、200文字以内の架空メモ、訂正元eventId |
| スタッフ連絡 | 通常・重要、50文字以内の架空タイトル、500文字以内の架空本文、訂正・取消元eventIdと架空理由 |
| 重要確認 | 対象連絡eventId、匿名UIDに対応する架空actorId、確認時刻 |

### Firebase・エミュレーター

| 保存先 | パスまたは資源 | 保存項目 |
|---|---|---|
| Firestore | `pocRuns/{runId}` | 実施条件、開始・終了時刻、想定環境数、架空データである旨 |
| Firestore | `pocRuns/{runId}/events/{eventId}` | 端末側と同じ追記イベント。文書IDをeventIdとして重複作成を防ぐ |
| Authentication | 匿名利用者 | UID、作成・最終利用メタデータ。メール、電話番号、表示名は保存しない |
| Local Emulator Suite | メモリーと任意のローカルexport | 上記Firestore文書と匿名利用者の検証用複製 |

実在する氏名、メールアドレス、電話番号、住所、本番QR、API秘密鍵、サービスアカウント鍵は保存しない。Firebase Web設定値は秘密鍵ではないが、環境の誤接続を避けるため`.env.local`で管理しGitへ含めない。共有する`.env.example`は値を空欄または架空プレースホルダーにする。

## 削除方法と確認

削除はPoC専用資源だけを対象とし、実行直前にプロジェクトID、`runId`、ローカル絶対パスを読み取り確認する。削除対象の確認なしに再帰削除を実行しない。

1. 各ブラウザで未送信件数が0であることと結果採取完了を確認する。
2. アプリの締め処理でアプリ用IndexedDBを`indexedDB.deleteDatabase()`により削除し、対象DBが再取得できないことを確認する。
3. Service Workerを解除し、PoC用Cache Storageだけを削除する。ブラウザのサイトデータ画面でも対象オリジンが空であることを確認する。
4. オンライン状態で匿名利用者を削除し、削除できなかったUIDはFirebase Consoleで対象を照合して削除する。サインアウト後、Firebase Auth用ブラウザ保存を含むサイトデータを削除する。
5. Firestoreの`pocRuns/{runId}`以下をFirebase CLIで再帰削除する。親文書削除だけではサブコレクションが残るため、削除後にコレクションが空であることをConsoleと読取り結果で確認する。
6. 検証用データが不要と確認された後、専用Firestoreデータベースを削除する。さらにIssue #6の証跡採取後、依頼者へ専用FirebaseプロジェクトIDと影響を示して削除確認を取り、Firebase Consoleからプロジェクトを削除する。
7. プロジェクト削除直後にサービスへアクセスできないことを確認する。Google Cloudでは30日以内に復元可能で、その後に完全削除されるため、削除日と30日後の確認予定日を記録する。
8. ローカルエミュレーターを停止し、PoC専用export、ログ、Playwright raw artifacts、`node_modules`、`dist`、`coverage`を絶対パス確認後に削除する。共有キャッシュや他プロジェクトの資源は削除しない。
9. 再現手順、集計結果、合否、使用量、削除確認の要約は正式な検証証跡としてGit管理に残す。PoCコードとブランチの廃棄はIssue #6終了時に別途対象と影響を確認する。

## 費用0円の根拠

### 公開無料枠

2026-09-02時点で、Firebase Sparkは支払方法不要の無償プランとして案内されている。Cloud Firestoreの1プロジェクト内の最初のデータベースには、保存1GiB、1日50,000 document reads、20,000 writes、20,000 deletes、月10GiBのoutbound transferが無料枠として示されている。無料枠を超えて追加利用するには請求を有効化する必要がある。

TTL、PITR、backup、restore、cloneは無料利用の対象外なので使用しない。Firebase Hosting等、表にないサービスも有効化しない。Sparkのまま請求先アカウントを接続せず、カード登録、有料契約、自動更新を行わない。

### POC-001の上限見積り

| 指標 | PoC停止上限 | 無料枠 | 根拠 |
|---|---:|---:|---|
| Firestore保存 | 10MiB | 1GiB | 最大5,000イベントを平均2KiB以下として見積もる |
| document writes | 5,000/日 | 20,000/日 | 500受付、競合、再読取り、連絡、確認、再送検証を含む保守的上限 |
| document reads | 40,000/日 | 50,000/日 | 最大5,000イベントを6環境へ配信する30,000件と、検証用10,000件 |
| document deletes | 10,000/日 | 20,000/日 | 全PoC文書と確認用再実行を含む上限 |
| outbound transfer | 200MiB/月 | 10GiB/月 | 1端末20MB×6環境の要件上限120MBに確認用余裕を加える |
| Authentication | 20匿名利用者 | 無料対象 | 6環境と再実行の架空利用者だけを作る |

- ConsoleのUsageでreads、writes、deletes、保存量を開始前・各シナリオ後・削除後に記録する。
- いずれかがPoC停止上限の80%へ達したら、その日の外部接続試験を止めて報告する。
- 上限到達、仕様変更、無料枠縮小、請求先アカウント要求のいずれかが発生した場合は不適合として終了し、Blazeへ変更しない。
- Node.js、Temurin、npm依存パッケージは無償かつ公開ライセンスだが、利用規約とライセンス一覧はPoC結果へ添付する。
- この評価はPoC時点の費用0円を示すもので、本番採用後の永続的な無料提供を保証しない。採用時と各開催前に再確認する。

## `.gitignore`更新案

承認後の最初の変更として、既存の`private-notes/`除外を維持したまま次を追加する。追加後、架空ファイルで除外対象と追跡対象を確認してから依存関係を導入する。

```gitignore
# Secrets and machine-local configuration
.env
.env.*
!.env.example
*.local
poc/POC-001/.firebaserc
!poc/POC-001/.firebaserc.example

# Dependencies and generated output
node_modules/
dist/
coverage/
*.log

# Firebase local state and emulator exports
.firebase/
firebase-debug.log*
firestore-debug.log*
ui-debug.log*
firebase-export/

# Playwright temporary and sensitive state
test-results/
playwright-report/
blob-report/
**/playwright/.auth/
poc/POC-001/artifacts/raw/
```

追跡対象は`package.json`、`package-lock.json`、ソース、テスト、`firebase.json`、`firestore.rules`、空欄の`.env.example`、`.firebaserc.example`、再現手順、集計済み証跡とする。

## 主なリスクと停止条件

| リスク | 対応・停止条件 |
|---|---|
| Firestoreは同一文書の競合で最終書込み優先になる | eventIdごとの追記に限定し、現在状態を上書きしない。イベント欠落があれば不合格 |
| オフライン端末の時刻がずれる | 端末時刻とサーバー受信時刻を両方保持し、自動で正誤を決めない |
| 匿名認証は本番の個別認証を検証しない | POC-001の環境分離用だけに使い、認証・権限の合否はPOC-004へ持ち越す |
| ブラウザ削除や端末喪失で未送信記録が失われる | 損失可能性を結果へ記録し、CONF-005の紙照合手順を示す |
| エミュレーターと実サービスで挙動が異なる | ローカル合格後に同じケースを専用Sparkプロジェクトで限定再実行する |
| 無料枠へ近づく | 停止上限80%で終了し、課金プランへ変更しない |
| 依存関係に重大脆弱性がある | High/Criticalを確認した場合は外部接続前に停止し、更新または代替を再提案する |
| 削除対象を誤る | 専用ID・runId・絶対パスを実行直前に照合し、別プロジェクトや共有キャッシュを削除しない |

## 承認依頼

依頼者には、次をIssue #6で明示的に承認いただく。

- 承認対象は本書の`POC-001`だけであり、`POC-002`～`POC-005`と本番実装を含まないこと。
- 記載した依存関係を承認後に固定導入すること。
- 専用Firebase Sparkプロジェクト、Web App、Firestore、匿名認証を作成し、架空データだけで外部接続すること。
- 記載した保存データ、削除方法、費用上限、停止条件で実施すること。
- 承認後の最初の変更として`.gitignore`を更新し、確認後にPoC作成へ進むこと。

明示承認の記録例は「`poc-001-approval-request.md`の内容を確認し、POC-001に限って開始を承認します」とする。承認日時とIssueコメントURLを本書、技術検証計画書、Issue #6へ記録してから着手する。

## 公式資料

| 資料 | 確認した事項 |
|---|---|
| [Node.js Releases](https://nodejs.org/en/about/previous-releases) | Node.js 24が2026-09-02時点でLTSであること |
| [Firebase pricing](https://firebase.google.com/pricing) | Sparkが支払方法不要の無償プランであること |
| [Cloud Firestore pricing](https://firebase.google.com/docs/firestore/pricing) | 保存、reads、writes、deletes、outbound transferの無料枠と有料機能 |
| [Cloud Firestore locations](https://firebase.google.com/docs/firestore/locations) | `asia-northeast1`が東京リージョンであること |
| [Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure) | Node.js、JDK、Firebase CLIの前提とローカルexportの扱い |
| [Firestore offline data](https://firebase.google.com/docs/firestore/manage-data/enable-offline) | Web永続化、対応ブラウザ、最終書込み優先、機密データへの注意 |
| [Delete Firestore data](https://firebase.google.com/docs/firestore/manage-data/delete-data) | 親文書削除ではサブコレクションが残ること、CLI再帰削除の利用量 |
| [Firebase CLI reference](https://firebase.google.com/docs/cli) | Firestore文書・データベースの削除コマンド |
| [Delete Firebase project](https://support.google.com/firebase/answer/9137886) | プロジェクト削除の影響と30日以内の復元可能期間 |
| [Firebase IAM basic roles](https://firebase.google.com/docs/projects/iam/roles-basic) | Owner、Editor、Viewerの権限差とOwner維持の重要性 |
| [Firebase API keys](https://firebase.google.com/docs/projects/api-keys) | Firebase用APIキーはプロジェクト識別用で公開前提であり、認可はSecurity Rules等で行うこと |
| [Playwright isolation](https://playwright.dev/docs/browser-contexts) | BrowserContextごとにStorage等が分離されること |
| [idb](https://github.com/jakearchibald/idb) | IndexedDBに近いAPI、対応ブラウザ、型付き利用 |

npmパッケージの版、ライセンス、Node要件は2026-09-02にnpm公式レジストリの各`latest`メタデータで確認した。
