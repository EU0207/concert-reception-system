# 技術実現可能性調査報告書

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | Issue #6の調査段階 `RES-001`～`RES-005` の結果を記録し、PoC対象を選択できる状態にする |
| 主な読者 | 依頼者、開発担当者、確認担当者 |
| 調査日 | 2026-09-01～2026-09-02 |
| 関連文書 | [要件定義書](../client/requirements.md)、[受入条件書](../client/acceptance-criteria.md)、[技術検証計画書](technical-validation-plan.md)、[RES-005机上レビュー記録](res-005-seat-allocation-desk-review.md)、[POC-001開始承認依頼書](poc-001-approval-request.md)、[POC-001実施結果報告書](poc-001-result.md)、[POC-002開始承認依頼書](poc-002-approval-request.md)、[トレーサビリティ表](traceability-matrix.md) |
| 関連Issue | [#6](https://github.com/EU0207/concert-reception-system/issues/6) |
| 状態 | In Review |
| 承認情報 | 2026-09-01に第一PoC候補、2026-09-02にRES-005とPOC-001開始を依頼者が確認。技術採用、本番実装は未承認 |

## 結論

- 現時点の公開情報では、代表環境をSafari 26系とAndroid版Chrome 152系としたPWA方式は、条件付きでPoCへ進められる。
- iPhone・Safariではブラウザ標準の `BarcodeDetector` を前提にできないため、カメラ映像を取得し、ブラウザ間で動作するQR解析処理を使用する候補をPoCで確認する必要がある。依存ライブラリは未選定であり、追加も行っていない。
- 完全オフライン受付は端末内保存で実現候補がある。ただし、通信がない端末間で同じQRの初回受付をその場で一意に確定することはできない。各端末の受付イベントを変更せず保持し、復旧後に全イベントを統合して競合を表示する方式が必要である。
- 第一のPoC候補は「PWA＋端末内イベント保存＋Firebase Authentication／Cloud Firestore」、比較候補は「PWA＋端末内イベント保存＋Cloudflare Workers／D1」とすることを推奨する。これはPoC対象の推奨であり、採用決定ではない。
- Supabase無料プランは長期間利用しないプロジェクトが一時停止されるため、年1～2回の利用と費用0円の組合せには運用上の不確実性が大きい。ローカル保存と手動統合だけの方式は、オンライン時の迅速な共有を満たさないため主方式の候補にはしない。
- 端末内データはブラウザ保存だけでは機密性を保証できない。保存項目の最小化、アプリケーション層での暗号化候補、認証情報の安全な保持、統合確認後の削除をPoC条件として具体化する必要がある。
- 無料枠は現在想定する1日1公演・1公演500人、6つ以上の独立環境、年1～2回、利用者約10人の規模で成立する可能性が高い。ただし、利用量、料金、無料枠はPoC承認前、採用前、各開催前に再確認する。
- `RQ-001`～`RQ-006` は詳細確認を終え、`REQ-F-032`～`REQ-F-037`、`REQ-NF-012`、`AC-022`～`AC-027` として正式要件化した。これらを反映したPoCは未承認である。
- `RES-005`は架空の12ケースで机上レビューを行い、割当結果または未割当理由を一意に説明できたため合格とし、2026-09-02に依頼者が確認した。
- `POC-001`の依存関係、専用Firebase資源、保存データ、削除手順、無料枠内の停止上限、`.gitignore`更新案を具体化し、2026-09-02に本書記載の範囲だけ開始承認を得た。
- 開発用Firebaseは開発者アカウントの専用プロジェクト、本番は依頼者がOwnerとなる別プロジェクトに分離する。アカウント情報をGitへ保存せず、本番設定は手順書と一時権限による開発者支援で管理負担を抑える。
- `POC-001`は、6分離環境、架空QR 500件、復旧後508イベント統合、競合、再読取り、重要連絡・既読、1環境停止後の継続を、ローカルエミュレーターと実Firebaseの両方で確認し合格した。これはFirebase方式の限定した成立性であり、技術採用や`POC-002`以降の合格ではない。
- POC-001終了時にFirestoreの架空データと匿名利用者を削除して残存0件を確認した。検証専用Firebaseプロジェクト本体は、プロジェクト作成上限への影響を抑えるためPOC-005終了確認まで保持し、全PoC終了後に1回だけ削除する。
- `POC-002`はPOC-001の固定依存関係と既存Firebase資源だけを再利用し、デコード済み架空QR以降の判定、500件処理、共有時間、Chromium外部ソケット通信量を測る案を具体化した。追加パッケージ、追加サービス、課金は不要であり、開始は未承認である。

## 調査結果一覧

「条件付き合格」は、公開情報によりPoC可能な候補を確認できたが、対象実機または具体的な方式での検証が残ることを示す。

| 検証ID | 優先度 | 結果 | 判定理由 | PoCが必要な残課題 | 主な関連ID |
|---|---|---|---|---|---|
| RES-001 | P0 | 条件付き合格 | Safari、Chromeともカメラ、Service Worker、IndexedDBを利用できる。Safariでは標準QR検出に依存できない | iPhone 17、iPhone 13 mini、Galaxy Z Fold8で許可、QR解析、電子チケット、座席資産、完全オフライン保持を確認する | TBD-001、TBD-002、REQ-F-008、REQ-F-030、REQ-F-032、REQ-F-035、AC-004、AC-015、AC-022、AC-025 |
| RES-002 | P0 | 条件付き合格 | 管理サービス方式と独自同期方式の双方にPoC可能な候補がある | 6つ以上の独立環境でイベント統合、競合、再読取りメモ、スタッフ連絡、再送、欠落を確認する | TBD-002、REQ-F-017、REQ-F-030、REQ-F-034、REQ-F-037、REQ-NF-003、REQ-NF-004、AC-011、AC-015、AC-024、AC-027 |
| RES-003 | P1 | 条件付き合格 | 認証、役割制御、失効、暗号化の候補はあるが、オフライン時の失効とブラウザ保存の限界が残る | 個別認証、権限停止、任意項目の端末配布、端末内暗号化、鍵、締め処理後削除を確認する | TBD-003、TBD-004、REQ-F-023～REQ-F-025、REQ-F-028、REQ-F-031、REQ-F-033、REQ-NF-012、AC-009、AC-013、AC-014、AC-023 |
| RES-004 | P1 | 合格 | 費用0円で開始できる候補が複数あり、想定規模は公表無料枠内に収まる可能性が高い | PoC承認前に最新料金と契約条件を再確認し、無料枠超過時の停止手順を決める | TBD-009、TBD-012、REQ-NF-010、REQ-NF-011、AC-020 |
| RES-005 | P1 | 合格 | 最大10人、上限超過、連続席不足、特別席・確保席、並び順、手動操作、発券後変更の12ケースで期待結果を一意に説明できた | 共通の優先規則を最終要件承認時に確認し、入力と期待結果をAC-026の自動テストへ引き継ぐ | REQ-F-036、RQ-005、AC-026、CONF-015 |

## RES-005 自動座席配置

[RES-005自動座席配置机上レビュー記録](res-005-seat-allocation-desk-review.md)に、架空の席・来場者を使った12ケース、共通の優先規則、期待する割当・未割当理由、履歴、AC-026への引継ぎを記録した。PoCコード、依存関係、外部サービスは使用していない。

## RES-001 対応環境とブラウザ機能

### 対象バージョン候補

調査日の安定版を基準にした候補であり、PoC対象の最終決定ではない。実際に使用できる端末型番、OS、ブラウザ版はPoC承認時に確認する。

| 対象 | 調査候補 | 確認できたこと | 制約・注意点 |
|---|---|---|---|
| iPhone | iOS 26系・Safari 26系 | Service Worker、IndexedDB、Storage API、ホーム画面Webアプリを利用できる | `BarcodeDetector` はiOS上で安定した前提にできない。ロックダウンモードではIndexedDBを利用できない場合がある |
| Android | Chrome 152系・ChromeがサポートするAndroid | Service Worker、IndexedDB、Storage API、カメラ、対応端末での標準バーコード検出を利用できる | 標準バーコード検出の対応形式を実行時に確認し、非対応時の代替処理が必要 |

### 調査から確定できる制約

- カメラとService Workerの利用にはHTTPSでの配信が必要である。
- カメラ許可は利用者による操作が必要であり、拒否またはOS設定による制限を事前点検する必要がある。
- IndexedDBのトランザクションは受付記録の端末内保持に使用できる。
- `navigator.storage.persist()` により保存領域の永続化を要求できるが、許可はブラウザ判断であり、利用者によるサイトデータ削除までは防げない。
- iPhone・Safariでは標準QR検出機能だけに依存せず、機能検出と代替QR解析を用意する必要がある。
- SafariではBackground Syncを全対象環境共通の同期手段にできない。アプリを開いている間の再接続検知、明示的再送、未送信件数表示を基本条件とする。
- ロックダウンモード等で必要な保存機能が使えない端末は受付用端末に使用せず、紙の当日運営表へ切り替える。

### 開催前の運用候補

次は研究結果から得られた変更候補であり、業務手順として未承認である。

1. 使用端末とブラウザ版を記録し、対象外環境でないことを確認する。
2. 開催前にオンラインでアプリを開き、ホーム画面追加、カメラ許可、公演データ取得を完了する。
3. 保存機能、必要容量、永続化結果、未送信件数ゼロを画面で確認する。
4. 機内モードで架空QRを読み、再読取りと端末内保持を確認する。
5. 紙の当日運営表と故障・紛失時の照合手順を用意する。

## RES-002 完全オフライン受付と復旧後統合

### 全候補に必要な動作

- 受付結果を来場者の現在状態へ直接上書きせず、端末ごとの一意なIDを持つ変更不能な受付イベントとして保存する。
- 同じQRを複数端末が完全オフラインで初回受付した場合は、どちらかを自動消去せず、復旧後に端末と時刻を付けた競合として表示する。
- 送信済み確認を受けるまで端末内イベントを削除せず、同じイベントを再送しても重複登録しない。
- サーバー時刻だけでなく端末時刻と受信時刻を保持し、端末時計のずれを判定材料として明示する。
- SafariのBackground Syncに依存せず、画面を開いた状態での自動再送と手動再送を用意する。
- 回収不能端末だけに残った未統合記録は復元不能になり得ることを示し、`CONF-005` に従い紙記録と照合する。

### 方式候補の比較

| 候補 | 構成の概要 | 利点 | 欠点・残るリスク | 費用・長期運用 | 判定 |
|---|---|---|---|---|---|
| A | PWA＋端末内イベント保存＋Firebase Authentication／Cloud Firestore | オフラインキャッシュ、再接続後の送信、リアルタイム購読、認証、役割制御を一つの管理サービスで組み合わせやすい | 同一文書の競合は最終書込み優先であり、イベント方式が必須。Webの永続キャッシュは信頼できる端末だけで有効化する必要がある。管理エクスポートには課金プランが必要 | Spark無料枠あり。無料枠超過時はサービス停止の可能性。課金なしでのデータ返却はアプリ側JSON/CSV出力が必要 | 第一PoC候補として推奨。未採用 |
| B | PWA＋IndexedDB＋Cloudflare Workers／D1 | SQLによる競合集計、D1のSQLエクスポート、無料枠の余裕、処理と保存方式の制御がしやすい | オフラインキュー、再送、リアルタイム共有、認証、権限制御を個別に設計・実装する必要があり、開発とセキュリティ確認が増える | 無料枠あり。上限超過日は処理が失敗し翌日UTCまで復旧しない。データは保持される | 比較PoC候補として推奨。未採用 |
| C | PWA＋IndexedDB＋Supabase | PostgreSQL、認証、Realtime、Row Level Securityを組み合わせられる | 公式のWeb向け自動オフラインデータ同期は確認できず、購読の間隙は再照会が必要。ブラウザ認証情報の既定保存も追加検討が必要 | 無料プロジェクトは低活動が7日を超えると一時停止し得る。年1～2回の運用では復旧作業が常態化する | 現時点ではPoC対象に非推奨。未採用 |
| D | PWA＋端末内保存＋手動ファイル統合 | 外部サービスと継続費用を避けやすく、仕組みが局所的 | オンライン時の迅速な共有を満たさず、ファイル回収、取違え、紛失、競合解決の運用負荷が高い | サービス費用は抑えられるが、当日作業と教育の負担が増える | 主方式には不適合。緊急時の補助手段候補 |

### Firebase候補の重要な制約

- Cloud FirestoreのWebオフライン永続化は既定で無効であり、Chrome、Safari、Firefoxに限られる。端末を信頼できることを確認してから有効化する必要がある。
- オフライン中の書込みは再接続後に送信されるが、同一文書への複数変更は最終書込み優先になる。
- トランザクションはオフラインでは失敗する。そのため、QRごとの単一状態をトランザクションで確定する方式を完全オフライン要件へ使用できない。
- 上記制約から、PoCでは一意な受付イベントを追記し、統合後に現在状態と競合を導出する。

## RES-003 認証、権限、端末内データ保護

### 確認できた事項

- ブラウザのIndexedDBはデータ保存手段であり、同じブラウザプロファイルを操作できる者やXSSからの機密性を保証しない。
- 認証トークンを `localStorage` に保存するとXSSで読み取られるため、原則として使用しない。候補サービスの既定動作をそのまま採用せず、保持場所と失効方法をPoC前に決める。
- Web Crypto APIで暗号化と鍵導出はできるが、端末上の鍵の機密性や完全消去は仕様だけでは保証されない。
- Firebase AuthenticationではIDトークンが通常1時間有効で、更新トークンは明示的に失効できる。ただし、端末が完全オフラインの間はサーバー上の失効を受け取れない。
- 完全オフラインで受付を継続する要件と、紛失端末を即時停止する要件は同時に完全達成できない。現行要件どおり、接続復旧後の停止とし、オフライン中の残余リスクを運用で抑える必要がある。

### PoC前に決める保護条件候補

| 項目 | 推奨する評価条件 | 残る判断 |
|---|---|---|
| 保存項目 | QR識別子、受付イベント、業務に必要な最小項目だけを受付端末へ保存する。任意項目値は主担当・代理の許可済み端末だけへ暗号化して事前取得する | REQ-F-033、REQ-F-034、REQ-NF-012の具体的な暗号化方式 |
| 端末内暗号化 | アプリケーション層で暗号化し、暗号文と同じ保存領域へ復号用秘密を恒久保存しない候補を比較する | 共有パスフレーズ、オンライン取得鍵等の運用選択 |
| 認証情報 | `localStorage` を避けられる構成を優先し、有効期限、更新、失効、ログアウト後削除を確認する | Firebaseクライアント認証か、HttpOnly Cookieを使う中継方式か |
| 権限 | 管理者と受付担当者を分け、サーバー側ルールでも操作を制限する | 利用者登録、開催前配布、開催後停止の担当者 |
| Service Worker | 個人情報を含むAPI応答を汎用キャッシュへ保存せず、静的資産と明示した受付データを分離する | キャッシュ対象と更新手順 |
| 削除 | 公演終了、全イベントの送信確認、管理者確認後に、IndexedDB、キャッシュ、認証情報を明示的に削除する | 削除証跡の保存方法 |
| 端末条件 | OSの画面ロックを必須とし、共有端末、脱獄・root化端末、ロックダウンモード等を事前点検する | 私物端末を許可する条件 |

## RES-004 費用と外部サービス条件

### 想定規模での確認

次は500人、6つ以上の独立環境、利用者約10人、年1～2回を前提にした概算評価であり、料金保証ではない。

| サービス候補 | 2026-09-01時点の主な無料条件 | 超過・停止時の影響 | データ返却・削除 | 評価 |
|---|---|---|---|---|
| Firebase Spark | Firestore 1日50,000読取り、20,000書込み、1GiB保存。Hosting 10GB保存、1日360MB転送 | 無料枠を超えた製品は請求ではなく停止する場合がある。読取り設計と監視が必要 | 管理エクスポートは課金プランが必要。アプリ機能によるJSON/CSV出力が必要 | 想定規模では成立可能性が高い |
| Cloudflare Workers／D1 Free | Workers 1日100,000要求、1要求10ms CPU。D1 1日5,000,000行読取り、100,000行書込み | 日次上限超過後はUTC日付変更まで失敗し、保存済みデータは保持される | D1はSQLエクスポート可能。データベース削除手順あり | 想定規模では成立可能性が高い |
| Supabase Free | 500MBデータベース、5GB転送、50,000 MAU | 低活動が7日を超えると一時停止し得る | 無料プランではバックアップのダウンロードに制約がある | 年1～2回の利用には運用上非推奨 |

### 費用に関する判断条件

- 課金プランへの変更、カード登録、外部サービス契約は本調査では行っていない。
- PoCで外部サービスへ接続する場合は、候補、作成する資源、保存データ、削除方法、費用0円である根拠を示して個別承認を得る。カード登録、有料契約、自動更新は行わない。
- 採用時には利用量上限の通知、無料枠超過時の受付継続方法、データ返却方法、プロジェクト削除方法を運用文書へ記載する。
- 料金と無料枠は変更され得るため、PoC承認時、採用時、各開催前に公式情報を再確認する。

## 追加要望の正式要件化による影響

`CONF-007`～`CONF-015` により全要望の方針と詳細が決まり、新しい要件ID・受入条件IDを発行した。次表は更新後の検証先を示す。

| 要望ID | 正式要件化した内容 | 技術検証への影響 | 検証先 |
|---|---|---|---|
| RQ-001 電子チケットPDF | A6縦PDF、個別・一括ZIP、確認コード、通常提示、必要時生成 | PDF生成、500人分出力、対象実機画面からのQR読取りを追加する | REQ-F-032、AC-022、POC-003 |
| RQ-002 任意テキスト項目 | 最大10項目・各200文字、主担当・代理限定、1か月削除 | 管理者端末だけへの暗号化配布、受付端末での不在、削除を追加する | REQ-F-033、REQ-NF-012、AC-023、POC-004 |
| RQ-003 再読取りメモ | 4分類の必須理由、任意メモ、追記型訂正、全スタッフ共有 | オフライン追記と復旧後共有をイベント統合へ追加する | REQ-F-034、AC-024、POC-001 |
| RQ-004 座席表・会場画像 | 簡易座席表、画像5枚・合計25MB、事前取得、代替一覧 | 対象実機でのオフラインキャッシュ容量と表示を追加する | REQ-F-035、AC-025、POC-005 |
| RQ-005 自動座席配置 | 最大10人の連続席、個人の名簿順・ランダム、手動固定・取消し | クラウド方式に依存しないためPoCコードを作らず、架空表の机上レビューで扱う | REQ-F-036、AC-026、RES-005 |
| RQ-006 スタッフ連絡 | 通常・重要、利用者別確認、オフライン未共有、訂正・取消履歴 | オフライン投稿、復旧後共有、既読同期をイベント統合へ追加する | REQ-F-037、AC-027、POC-001 |

## PoC対象の推奨案

### 推奨

1. 第一候補Aを `POC-001`～`POC-005` の対象候補とする。
2. 候補Bは、Aが費用、データ返却、セキュリティ、または同期要件を満たさない場合の比較・代替候補とする。
3. 最初は外部サービスへ接続せず、端末内の一意な受付イベント、競合導出、再送の最小構造を評価する。
4. 外部接続が必要な段階では、別途承認後に無料の検証用プロジェクトと架空データだけを使用する。

### 推奨理由

- 候補Aは認証、端末キャッシュ、再接続後送信、リアルタイム共有を管理サービスで組み合わせられ、要件を確認するためのPoCを小さく保ちやすい。
- 候補Bはデータ返却とサーバー側処理の制御に優れるが、同期と認証を個別に作る範囲が増え、本プロジェクトの現段階では比較候補に適する。
- どちらも無料枠内で検証可能だが、採用後の無料継続や可用性を保証するものではない。

## 依頼者の判断記録と残る事項

推奨案の承認はPoC対象を絞り込む判断であり、技術採用またはPoC開始の承認ではない。

| 判断ID | 対象TBD | 決定・残る事項 | 状態 | 確認ID |
|---|---|---|---|---|
| DEC-006-01 | TBD-002、TBD-012 | 候補Aを先行し、不適合時だけ候補Bへ進む | PoC候補として承認。技術未採用 | CONF-006 |
| DEC-006-02 | TBD-003 | PoCではFirebase Authenticationを先に評価し、保持リスクを満たせない場合にHttpOnly Cookieを使う中継方式を追加する | PoC候補として承認。技術未採用 | CONF-006 |
| DEC-006-03 | TBD-004 | 完全オフライン開始を優先し、開催ごとの共有パスフレーズ候補を先に評価する | PoC候補として承認。技術未採用 | CONF-006 |
| DEC-006-04 | TBD-001 | iPhone 17、iPhone 13 mini、Galaxy Z Fold8を実機対象とし、検証日に最新安定版OS・標準ブラウザの版を記録する | 実機確定・版は検証日に記録 | CONF-006、CONF-013 |
| DEC-006-05 | RQ-001～RQ-006 | 全要望の詳細を確定し、REQ-F-032～REQ-F-037、REQ-NF-012、AC-022～AC-027を発行する | 正式要件化済み・PoC未承認 | CONF-007～CONF-015 |
| DEC-006-06 | TBD-007、TBD-009 | 同期5秒目標・10秒上限、当日通信量1端末20MB以下、新しいシステム・サービス費用0円とする | 合格基準確定・PoC未承認 | CONF-012、CONF-017 |
| DEC-006-07 | TBD-003、TBD-004 | 個別メール＋パスワード、開催前準備、共有パスフレーズ、締め処理後削除をPoC条件とする | 評価条件確定・技術未採用 | CONF-016 |

## 要件・受入条件への反映状況

依頼者が詳細を決定した項目は要件定義書と受入条件書へ反映した。技術方式に依存する項目はPoC結果まで保留する。

| 種別 | 候補内容 | 関連ID |
|---|---|---|
| 維持 | 完全オフライン受付、6つ以上の独立環境、復旧後統合、競合表示、回収不能記録の紙照合は実現可能性がある | REQ-F-017、REQ-F-030、REQ-NF-003、REQ-NF-004、CON-002、CON-004、AC-011、AC-015 |
| 具体化済み | 開催前に個別ログイン、カメラ許可、公演データ取得、保存確認、オフライン動作確認を行う | TBD-001、TBD-003、REQ-F-008、REQ-F-030、AC-004、AC-015、CONF-016 |
| 具体化候補 | 未送信件数、最終同期時刻、手動再送を表示し、Background Syncへ依存しない | TBD-002、REQ-F-017、REQ-F-030、AC-011、AC-015 |
| 具体化候補 | QR受付を変更不能な一意イベントとして保持し、復旧後に現在状態と競合を導出する | TBD-002、REQ-F-017、REQ-F-030、AC-011、AC-015 |
| 具体化済み | 任意項目の端末配布を限定し、公演終了・全送信・管理者確認後の締め処理で端末データを削除する | TBD-003、TBD-004、REQ-NF-005、REQ-NF-012、AC-014、AC-023、CONF-016 |
| 保留 | 検証日時点のOS・ブラウザ版、QR解析ライブラリ、認証、暗号化、外部サービスの採用 | TBD-001～TBD-004、TBD-012 |

## 公式資料

| 資料ID | 対象 | 公式資料 | 調査で用いた事項 |
|---|---|---|---|
| SRC-001 | Safari保存 | [WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/) | Storage API、容量、永続化、削除・追出しの制約 |
| SRC-002 | Safari 26 | [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) | 安定版機能、ホーム画面Webアプリ、機能検出 |
| SRC-003 | Safari制約 | [WebKit Features in Safari 17.0](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/) | ロックダウンモード時のIndexedDB制約 |
| SRC-004 | Safari QR | [WebKit Bug 281848](https://bugs.webkit.org/show_bug.cgi?id=281848) | iOSでのBarcode Detection APIの未解決問題 |
| SRC-005 | Safari同期 | [WebKit Bug 182565](https://bugs.webkit.org/show_bug.cgi?id=182565) | Background Sync未実装の状況 |
| SRC-006 | Chrome | [Chrome 152 release notes](https://developer.chrome.com/release-notes/152) | 調査日時点のChrome安定版候補 |
| SRC-007 | QR検出 | [Chrome: Shape Detection API](https://developer.chrome.com/docs/capabilities/shape-detection) | Android等でのバーコード検出と機能検出 |
| SRC-008 | カメラ | [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) | カメラ許可、secure context |
| SRC-009 | Service Worker | [Chrome: Service worker lifecycle](https://developer.chrome.com/docs/workbox/service-worker-lifecycle) | HTTPS、更新、オフライン配信 |
| SRC-010 | 保存 | [web.dev: Offline data](https://web.dev/learn/pwa/offline-data) | IndexedDB、永続化要求、利用者削除の限界 |
| SRC-011 | 端末DB | [W3C Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB/) | トランザクション、永続保存 |
| SRC-012 | Firestoreオフライン | [Firebase: Access data offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline) | Web対応ブラウザ、永続化、再接続、最終書込み優先 |
| SRC-013 | Firestore競合 | [Firebase: Transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions) | オフライン時のトランザクション制約 |
| SRC-014 | Firestore同期 | [Firebase: Get realtime updates](https://firebase.google.com/docs/firestore/query-data/listen) | リアルタイム購読、保留中書込み |
| SRC-015 | Firebase認証 | [Firebase: Manage user sessions](https://firebase.google.com/docs/auth/admin/manage-sessions) | トークン期間、更新トークン失効 |
| SRC-016 | Firebase権限 | [Firebase: Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims) / [Security Rules basics](https://firebase.google.com/docs/rules/basics) | 役割とサーバー側アクセス制御 |
| SRC-017 | Web保存安全性 | [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) | IndexedDB、localStorage、Service Workerの安全上の制約 |
| SRC-018 | セッション | [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | 認証情報保存の注意点 |
| SRC-019 | 暗号化 | [W3C Web Cryptography API Level 2](https://www.w3.org/TR/WebCryptoAPI/) | 暗号化機能と鍵保護の限界 |
| SRC-020 | Firebase料金 | [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) / [Firestore pricing](https://firebase.google.com/docs/firestore/pricing) / [Firebase Hosting](https://firebase.google.com/products/hosting) | Spark無料枠、超過時挙動、Hosting枠 |
| SRC-021 | Firebase返却 | [Firebase: Export and import data](https://firebase.google.com/docs/firestore/manage-data/export-import) | 管理エクスポートの課金条件 |
| SRC-022 | Cloudflare料金 | [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) | Workers、D1無料枠 |
| SRC-023 | Cloudflare上限 | [Cloudflare: D1 free tier limit enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/) | 日次上限超過時の停止と保持 |
| SRC-024 | Cloudflare返却 | [Cloudflare: Import and export data](https://developers.cloudflare.com/d1/best-practices/import-export-data/) | SQLエクスポート |
| SRC-025 | Supabase料金 | [Supabase Pricing](https://supabase.com/pricing) | 無料枠 |
| SRC-026 | Supabase停止 | [Supabase: Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) | 低活動時の一時停止 |
| SRC-027 | Supabase同期 | [Supabase: Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) / [Realtime troubleshooting](https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting) | 購読、再照会が必要な間隙 |
| SRC-028 | Supabase認証 | [Supabase JavaScript Auth](https://supabase.com/docs/reference/javascript/auth) / [User sessions](https://supabase.com/docs/guides/auth/sessions) | ブラウザでの既定セッション保存 |
| SRC-029 | Firebaseローカル検証 | [Firebase: Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure) | 必要なNode.js・JDK・CLI、エミュレーターデータのexport |
| SRC-030 | Firestore削除 | [Firebase: Delete data](https://firebase.google.com/docs/firestore/manage-data/delete-data) / [Firebase CLI](https://firebase.google.com/docs/cli) | サブコレクションを含む再帰削除、データベース削除 |
| SRC-031 | Firebaseプロジェクト削除 | [Firebase Help: Delete your project](https://support.google.com/firebase/answer/9137886) | 削除の影響と30日以内の復元可能期間 |
| SRC-032 | Node.js LTS | [Node.js Releases](https://nodejs.org/en/about/previous-releases) | Node.js 24のLTS状態 |
| SRC-033 | ブラウザ環境分離 | [Playwright: Isolation](https://playwright.dev/docs/browser-contexts) | BrowserContextごとのStorage等の分離 |
| SRC-034 | IndexedDB補助 | [idb](https://github.com/jakearchibald/idb) | IndexedDBに近いAPI、対応ブラウザ、型付き操作 |
| SRC-035 | Firestore配置先 | [Firebase: Cloud Firestore locations](https://firebase.google.com/docs/firestore/locations) | `asia-northeast1`が東京リージョンであること |
| SRC-036 | Firebase権限 | [Firebase: Owner, Editor, and Viewer roles](https://firebase.google.com/docs/projects/iam/roles-basic) | Ownerの管理責任、Editorの変更権限、Viewerの参照権限 |
| SRC-037 | Firebase APIキー | [Firebase: Manage API keys](https://firebase.google.com/docs/projects/api-keys) | APIキーは識別用で公開前提、認可はSecurity Rules等で行うこと |
| SRC-038 | Firebase CLI認証 | [Firebase CLI reference](https://firebase.google.com/docs/cli) | ローカルGoogleログイン、トークン管理、環境別プロジェクト指定 |

## 未実施事項

- `POC-001`結果の依頼者確認
- `POC-002`～`POC-005`の実行
- 全PoC終了後の検証専用Firebaseプロジェクト本体の削除
- QR解析ライブラリ、フレームワーク、外部サービス、認証方式、暗号化方式の採用
- 本番用外部サービスのアカウント・プロジェクト作成、接続、契約、課金
- 承認範囲外の依存関係追加、POC-002以降のコード、本番アプリケーションの作成
- PoC結果に基づく技術採用、要件・受入条件の最終調整
