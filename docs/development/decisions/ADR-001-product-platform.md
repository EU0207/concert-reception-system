# ADR-001: 製品基盤と外部サービス

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | 承認済み要件とPoC結果に基づき、本番アプリケーションの製品基盤候補を比較して採用案を提示する |
| 主な読者 | 依頼者、開発担当者、将来の保守担当者 |
| 関連文書 | [要件定義書](../../client/requirements.md)、[受入条件書](../../client/acceptance-criteria.md)、[技術実現可能性調査報告書](../technical-feasibility-research.md)、[POC-001結果](../poc-001-result.md)、[POC-004結果](../poc-004-result.md) |
| 関連Issue | [#25](https://github.com/EU0207/concert-reception-system/issues/25) |
| 関連ID | TBD-002、TBD-003、TBD-004、TBD-011、TBD-012、REQ-NF-002～REQ-NF-004、REQ-NF-010～REQ-NF-021、AC-011、AC-014、AC-015、AC-020、AC-028、AC-030、AC-031、AC-033 |
| 調査基準日 | 2026-09-09 |
| 状態 | Approved |
| ADR状態 | Accepted |
| 決定日 | 2026-09-09 |
| 承認情報 | 2026-09-09に依頼者が、確認事項1～3について推奨案をすべて承認（CONF-033） |

## 決定

次の構成を採用する。

- スマートフォンとPCのブラウザーで動くPWAとする。
- TypeScriptを使用し、画面、業務処理、端末保存、外部サービス接続を分離する。
- 配信にFirebase Hosting、個別認証にFirebase Authenticationのメール・パスワード認証、オンライン共有にCloud Firestore Standard editionを使用する。
- 端末内ではIndexedDBに変更不能な受付イベントと送信状態を保存し、Service Workerで静的資産を事前保存する。
- オフライン中の受付結果を上書きせず一意なイベントとして追記し、復旧後に全イベントから現在状態と競合を導出する。
- Firebaseは支払方法を登録しないSparkプランに限定し、Cloud Functions、FirestoreのTTL、管理バックアップ、PITR、管理エクスポート等の課金必須機能を使用しない。
- データ返却と復旧用バックアップは、管理画面から暗号化または必要最小限のJSON／CSVを出力・再取込するアプリ機能として設計する。
- 依頼者用、開発用、第三者評価用、将来の各主催者用は、Firebaseプロジェクトと設定を共有せず、それぞれの所有者が専用環境を用意する。
- 設定をリポジトリへ固定せず、未設定・不正設定時は既存環境へ接続せずに停止する。

## 背景

承認済み要件では、最大500人を6台以上で受け付け、通信停止中も処理を続け、復旧後に統合する必要がある。利用者は個別に認証し、役割外操作と別公演へのアクセスをサーバー側で拒否する。新しいシステム・サービスの費用は0円とし、本番環境は依頼者が所有する。また、第三者評価と将来の公開利用では依頼者環境へ接続せず、各利用者の環境とデータを分離しなければならない。

POC-001～POC-004では、PWA、IndexedDB、Firebase Authentication、Cloud Firestoreを組み合わせ、オフライン受付、復旧後統合、競合保持、個別認証、役割制御、権限停止後の拒否、端末内暗号化と削除手段を限定条件で確認した。PoCの合格は本番採用を意味しないため、製品方式としての運用、費用、バックアップ、環境分離を改めて判断する。

## 判断基準

| 優先度 | 基準 | 主な追跡先 |
|---|---|---|
| 必須 | 完全オフラインで受付を継続し、復旧後に欠落なく統合して競合を保持できる | REQ-F-017、REQ-F-030、AC-011、AC-015 |
| 必須 | 個別認証、役割、公演、操作対象によるサーバー側拒否を実現できる | REQ-F-026～REQ-F-028、REQ-NF-016、REQ-NF-017、AC-014、AC-030 |
| 必須 | 新規費用0円、支払方法なしで最大500人・10利用者程度を扱える | REQ-NF-002、REQ-NF-010、AC-018、AC-020 |
| 必須 | 依頼者が本番環境を所有し、他の環境・データと分離できる | REQ-NF-019、REQ-NF-021、AC-031、AC-033 |
| 必須 | データ出力、復旧確認、締め後の端末削除を設計できる | REQ-F-040、REQ-NF-015、REQ-NF-019、AC-028、AC-031 |
| 重視 | 非技術者の日常運用と引継ぎがアプリと手順書で完結する | REQ-NF-009、REQ-NF-019、REQ-NF-021、AC-017、AC-033 |
| 重視 | PoCの証拠を利用でき、独自の同期・認証基盤を小さくできる | POC-001、POC-002、POC-004 |

## 検討した候補

### 候補A: PWA＋Firebase Authentication／Cloud Firestore（推奨）

- 利点:
  - POC-001～POC-004で主要な同期、性能、認証、権限制御を確認済みである。
  - Firestore Web SDKはオフライン永続化と復旧後同期を提供し、Security RulesでWebクライアントからの要求をサーバー側で検査できる。
  - Authentication、データ共有、静的配信を同一の管理画面で扱え、独自サーバーの運用を避けられる。
  - Sparkプランは支払方法なしで開始でき、想定規模は公開されている無料枠より十分小さい見込みである。
- 欠点:
  - 同一文書への変更は最終書込み優先であるため、受付状態を上書きする設計は採用できない。
  - Webの永続キャッシュは端末に残るため、暗号化、端末別削除追跡、信頼済み端末だけでの利用が必要である。
  - 管理エクスポート、TTL削除、PITR、管理バックアップは課金を有効にしないと利用できない。
  - 各環境の所有者はGoogleアカウントとFirebaseプロジェクトを準備する必要がある。
  - 完全オフライン中の権限停止を端末へ即時反映することはできない。
- 対応:
  - 受付は変更不能なイベントを追記し、現在状態と競合を導出する。
  - 任意項目等はアプリケーション層で暗号化し、受付専用端末へ配布しない。
  - 権限はAuthenticationの本人識別に加え、Firestore上の公演メンバー、有効状態、役割、期限をSecurity Rulesで毎回確認する。
  - 課金必須機能を使わず、アプリによる出力・再取込と開催前の復旧練習を設計する。

### 候補B: PWA＋Cloudflare Workers／D1

- 利点:
  - SQL、D1のSQLエクスポート、Freeプランの行読取り・書込み上限を利用できる。
  - サーバーAPI、競合集計、データ構造を細かく制御できる。
  - FreeプランでもD1の7日間のTime Travelが提供される。
- 欠点:
  - ブラウザーのオフラインキュー、再送、リアルタイム共有、認証、セッション、役割制御を個別に設計・実装する範囲が増える。
  - POC-001～POC-004と同等の本番候補検証を追加で行う必要がある。
  - D1は1データベースの処理が直列であり、過負荷時の再試行設計が必要である。
  - Freeプランの日次上限を超えるとUTC日付変更までD1要求が失敗する。
- 判定:
  - Firebaseが料金、提供条件、セキュリティまたは運用要件に適合しなくなった場合の代替候補とする。現時点で優先する根拠はない。

### 候補C: PWA＋端末保存＋手動ファイル統合

- 利点:
  - 外部サービスの契約と継続費用を避けやすい。
- 欠点:
  - オンライン時の5秒目標の共有を満たさない。
  - 6台以上のファイル回収、取違え、欠落、競合確認を当日運用へ移してしまう。
  - 個別認証、権限停止、監査の一貫した実現が難しい。
- 判定:
  - 主方式には不適合。システム停止時の紙運用とデータ復旧の補助手段に限定する。

## 公式条件の再確認

| 項目 | 2026-09-09時点で確認した内容 | 設計への影響 | 公式資料 |
|---|---|---|---|
| Firebase Spark | 支払方法なし。Firestore Standard editionは保存1GiB、1日50,000読取り・20,000書込み・20,000削除、月10GiB送信まで無料枠がある | 500人・10利用者程度でも、全件反復取得を避け使用量を画面で確認する | [Firebase Pricing](https://firebase.google.com/pricing)、[Firestore pricing](https://firebase.google.com/docs/firestore/pricing) |
| Firebase Hosting | 保存10GB、月10GB転送まで無料。Sparkで転送上限を超えると猶予後にサイトが停止し、翌月まで無効になり得る | 静的資産を小さくし、開催前に使用量を確認する。停止時は事前保存済みPWAと紙運用へ切り替える | [Hosting usage, quotas, and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing) |
| Firestoreオフライン | WebではChrome、Safari、Firefoxに対応し、永続化は既定で無効。キャッシュはセッション後も自動削除されず、同一文書の競合は最終書込み優先 | 信頼済み端末だけで明示的に有効化し、独自イベント方式と締め後削除を使用する | [Access data offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline) |
| Firebase認証 | IDトークンは約1時間、更新トークンは長期間有効で、利用者削除・無効化・主要なアカウント変更等で失効する。Webの認証状態は既定でブラウザー終了後も保持される | 認証保持方式、開催前準備期間、ログアウト、回線復旧後の無効化確認をセキュリティ設計で固定する | [Manage user sessions](https://firebase.google.com/docs/auth/admin/manage-sessions)、[Authentication state persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) |
| Firestore権限 | Webクライアントの要求はSecurity Rulesで拒否できる。読取りは文書単位で、同一文書の一部項目だけを隠すことはできない | 公演・役割別Rulesを自動試験し、任意項目を通常受付データと別文書・別配布経路にする | [Security Rules](https://firebase.google.com/docs/firestore/security/get-started)、[Field access](https://firebase.google.com/docs/firestore/security/rules-fields) |
| Firebase出力・復旧 | Firestoreの管理エクスポート／インポートは課金有効化とCloud Storageが必要。TTL、PITR、管理バックアップも無料枠対象外 | Spark限定ではアプリ機能による出力・再取込、端末イベント、紙資料を組み合わせる | [Export and import data](https://firebase.google.com/docs/firestore/manage-data/export-import)、[Firestore pricing](https://firebase.google.com/docs/firestore/pricing) |
| Cloudflare代替 | Workers Freeは1日100,000要求、D1 Freeは1日500万行読取り・100,000行書込み、1DB 500MB、7日Time Travel。上限超過時は当日中の要求が失敗する | 代替採用時は独自認証・同期・再試行の追加検証と運用設計が必要 | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)、[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) |

## 採用結果

候補Aを採用し、候補Bを見直し時の代替、候補Cを緊急時の補助手段とする。

このADRの承認で決めるのは製品基盤の方針までとし、次は含めない。

- Firebaseの本番プロジェクト作成、契約、設定変更、デプロイ
- npm依存関係の追加
- 画面、データ項目、コレクション、Rules、暗号化、鍵、バックアップファイルの詳細仕様
- 本番コード実装
- 公開ライセンスの採用

## 確認済み事項

1. 本番の依頼者と、将来このシステムを利用する各主催者は、それぞれ自分で所有するGoogleアカウントとFirebaseプロジェクトを準備する。
2. 費用0円を優先し、Firestoreの課金必須バックアップ機能を使わず、アプリの出力・再取込と紙資料による復旧を採用する。
3. Spark無料枠や提供条件が要件に合わなくなった場合、無断で有料化せず、運用停止または候補Bへの見直しを行う。

上記3点は2026-09-09に依頼者がすべて推奨案どおり承認した（CONF-033）。

## 影響

### 良い影響

- PoCで確認済みの方式を製品設計へ引き継ぎ、未検証の独自同期・認証サーバーを増やさずに済む。
- 支払方法を登録せず、想定規模で費用0円を維持しやすい。
- 環境ごとのFirebaseプロジェクト分離により、依頼者と第三者の誤接続を防ぐ境界を明確にできる。

### 注意が必要な影響

- Firebaseの提供条件、無料枠、対応ブラウザーに継続的に依存する。
- 管理バックアップを使えないため、アプリ独自の出力・再取込機能と復旧試験が必須になる。
- 完全オフライン中の端末間競合と権限停止には物理的な限界が残る。
- 各環境の所有者がGoogle/Firebaseの初期設定を行う必要があり、非技術者向け手順と設定確認画面が必要になる。

## 見直し条件

- Sparkプランで支払方法なし・費用0円を維持できなくなった場合。
- 無料枠、対応ブラウザー、AuthenticationまたはFirestoreの提供条件が承認済み要件を満たさなくなった場合。
- アプリによる出力・再取込では必要な復旧時間またはデータ保全を満たせないと判明した場合。
- Security Rulesで必要な役割・公演分離・管理操作を安全に表現できないと判明した場合。
- 各主催者によるFirebase環境の準備が、対象利用者にとって実行困難と確認された場合。

見直し時は、自動的に有料化または候補Bへ移行せず、影響、費用、移行方法を新しいADRで提示して承認を得る。
