# POC-004 開始承認依頼書

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | POC-004の実装・Firebase接続を開始する前に、対象、依存関係、外部資源、保存データ、削除方法、費用0円の根拠、既知の制約を提示する |
| 主な読者 | 依頼者、開発担当者、確認担当者 |
| 前提 | [技術検証計画書](technical-validation-plan.md)、[技術実現可能性調査報告書](technical-feasibility-research.md)、[受入条件書](../client/acceptance-criteria.md) |
| 関連Issue | [#6](https://github.com/EU0207/concert-reception-system/issues/6) |
| 関連ID | POC-004、TBD-003、TBD-004、REQ-F-023～REQ-F-025、REQ-F-028、REQ-F-031、REQ-F-033、REQ-NF-005、REQ-NF-006、REQ-NF-008、REQ-NF-012、AC-009、AC-013、AC-014、AC-016、AC-023、CONF-016、CONF-020 |
| 調査日 | 2026-09-04 |
| 状態 | Draft |
| 承認情報 | 2026-09-04に依頼者からPOC-004を進める意思表示あり。本書の具体的な対象と制約は未確認のため、実装・外部接続の開始承認は未完了 |

## 結論

POC-004では、保持中の検証専用FirebaseプロジェクトとPOC-001で固定した構成を再利用し、個別メール・パスワード認証、役割別のFirestore Security Rules、開催前準備後の完全オフライン開始、任意項目の暗号化・配布制限、回線復旧後の権限停止、締め処理後の端末削除を架空データで検証する。

新しい外部サービス、有料機能、実在メールアドレス、実在する個人情報は使用しない。Firebase Hostingへの配信も行わず、ローカルで起動した検証画面からAuthenticationとFirestoreへ接続する。

ただし、FirestoreのTTL削除とCloud Functionsは請求設定を必要とするため使用できない。費用0円を守る構成では、期限経過後の任意項目をSecurity Rulesで読取り拒否し、次に主担当または代理管理者がオンラインで管理画面を開いた時に対象値を削除する方式までを検証する。誰も操作しなくても期限から一定時間内に物理削除されることは保証できず、`REQ-NF-012`の厳密な「1か月で自動削除」は不適合候補として結果へ記録する。

## 承認を依頼する範囲

本書の明示承認後、次の作業だけを`POC-004`として行う。

1. Issue #6用ブランチの`poc/POC-004/`へ、本番利用を前提としない最小Webアプリを作成する。
2. POC-001の固定依存関係を再利用し、Web Crypto APIによる暗号化処理を追加する。新しいnpmパッケージは追加しない。
3. Authentication EmulatorとFirestore Emulatorで、架空アカウント、役割、Security Rules、暗号化、期限、削除を自動試験する。
4. ローカル試験合格後だけ、保持中の検証専用Firebaseプロジェクトでメール・パスワード認証を一時的に有効化し、架空アカウント5件以内を作る。
5. POC-004専用Security Rulesを一時配信し、主担当、代理管理者、受付担当、一時管理者、権限停止対象の役割を確認する。
6. FirestoreへPOC-004専用`runId`配下の架空データだけを保存し、オンライン・オフライン・再接続を確認する。
7. 終了時にPOC-004のFirestore文書、架空Authentication利用者、端末保存、ローカル生証跡を限定削除し、Security Rulesと認証設定を開始前状態へ戻す。
8. 結果、制約、削除確認を文書化し、技術採用とは分けてレビューを依頼する。

`POC-005`、Firebase方式の採用、本番実装、本番アカウント、実在データ、TTL、Cloud Functions、Admin SDK、サービスアカウント鍵、Hosting配信、Storage、Analytics、App Check、Blaze変更、カード登録は承認対象外とする。

## 対象機能と合格基準

| 対象 | 評価方法 | 合格基準 |
|---|---|---|
| 個別認証 | 架空メール・パスワードで5利用者以内を作成し、正誤パスワードと未認証状態を試す | 正しい利用者だけがログインでき、パスワードやトークンをログ・Git・Firestoreへ保存しない |
| 開催前準備 | オンラインでログイン、公演・役割データ取得、端末保存確認を行う | 完了状態と対象公演を画面で確認でき、未準備端末は完全オフライン開始できない |
| 完全オフライン開始 | 準備済みと未準備の独立ブラウザー環境を通信切断後に再起動する | 準備済みだけが対象公演を開始でき、未準備は拒否される |
| 役割制御 | 主担当、代理、受付、一時管理者、未認証で許可・禁止操作を試す | UIだけでなくSecurity Rulesでも役割外の読取り・書込みを拒否する |
| 一時権限 | 公演中と終了後の一時管理者を試す | 公演終了後はオンライン要求を拒否し、再接続後に端末側も停止状態となる |
| 紛失端末の停止 | 権限停止対象をオフラインにした後、管理者がメンバー状態を無効化し、対象を再接続する | オフライン中は即時停止できない制約を表示し、再接続後のサーバー要求を拒否して端末データを削除する |
| 任意項目 | 10項目・各200文字、未入力、11項目目、通常CSV、選択CSVを試す | 上限とCSV条件を満たし、受付・一時管理者へ値または暗号文を配布しない |
| 暗号化 | 主担当・代理が共有パスフレーズを入力して任意項目を事前取得し、保存内容と復号可否を調べる | 保存先にはAES-GCM暗号文だけがあり、復号鍵とパスフレーズを恒久保存しない。主担当・代理だけが復号できる |
| 期限 | 期限前後をエミュレーター時計・架空時刻で再現する | 期限後はSecurity Rulesで値を読めず、次のオンライン管理操作で値を削除できる。無人の厳密な自動削除は別判定する |
| 締め処理 | 全送信・管理者確認の前後で締め操作を試す | 前提未完了では削除せず、完了後は認証状態、Firestoreキャッシュ、IndexedDB、Cache Storageから対象データを削除する |
| 完全削除 | 未使用誤登録と履歴付きデータを期限前後・役割別に削除する | 確認画面と管理者制限があり、履歴付きは期限前に削除できない |

## 実施シナリオ

### P004-01 認証と事前準備

- 架空の主担当、代理管理者、受付担当、一時管理者、停止対象受付担当を作成する。
- Firebase Authは`browserLocalPersistence`を明示し、ブラウザー再起動後の開催前認証状態を確認する。
- 認証だけでは開始を許可せず、対象公演、現在の役割、事前取得完了、共有パスフレーズ確認が揃った場合だけ開始する。
- 未準備環境、別公演、無効利用者を拒否する。

### P004-02 Security Rulesと権限停止

- `poc004Runs/{runId}`以外をすべて拒否する専用Rulesをエミュレーターで先に試験する。
- メンバー文書の`role`、`active`、`expiresAt`をRulesから確認し、許可する文書経路と操作を役割ごとに限定する。
- 一時管理者の期限切れと受付担当の停止を行い、既存画面のクライアント側非表示だけに依存せず、直接SDK操作も拒否されることを確認する。
- 完全オフライン中はサーバー変更を受信できないため即時停止できないことを明示し、再接続後の拒否とローカル削除を確認する。

### P004-03 任意項目の暗号化と非配布

- Web Crypto APIのPBKDF2-HMAC-SHA-256（600,000回、16バイトのランダムsalt）で、開催ごとの共有パスフレーズからAES-GCM-256鍵を導出する。
- レコードごとに12バイトのランダムIVを生成し、暗号文、salt、IV、方式、版だけを保存する。鍵とパスフレーズはメモリー上だけで扱う。
- 制限文書の取得を主担当・代理だけに許可する。受付・一時管理者ではクエリーと直接文書参照の両方を拒否し、ローカル保存にも暗号文を含めない。
- 通常CSVには任意項目を含めず、主担当・代理が対象を明示選択した時だけ復号後の架空値を端末内でCSV化する。外部へ自動送信しない。

### P004-04 期限と締め処理

- 期限前、期限直後、期限後の架空時刻を使い、読取り拒否と管理画面起動時の削除候補を確認する。
- TTLとCloud Functionsは使わない。無人削除ができない事実を合否と要件影響へ記録する。
- 公演終了、未送信0件、管理者確認の3条件が揃う前は締め処理を拒否する。
- 条件成立後にsign out、Firestore終了・永続キャッシュ削除、アプリIndexedDB・Cache Storage・Service Worker削除を行い、再読取りできないことを確認する。

## 依存関係

POC-001で導入・固定済みの次だけを再利用し、追加インストールは行わない。

| 種別 | 名称・版 | 用途 |
|---|---|---|
| 実行環境 | Node.js 24 LTS、npm 12.0.2 | ビルド、テスト、エミュレーター実行 |
| 実行依存 | `firebase` 12.18.0 | Authentication、Firestore、永続キャッシュ、エミュレーター接続 |
| 実行依存 | `idb` 8.0.3 | POC固有の端末状態と削除確認 |
| ブラウザー標準 | Web Crypto API | PBKDF2による鍵導出、AES-GCM暗号化・復号、乱数生成 |
| 開発依存 | `typescript` 7.0.2、`vite` 8.2.2、`vite-plugin-pwa` 1.3.0 | 型検査、ローカル配信、オフライン資産 |
| 開発依存 | `firebase-tools` 15.28.2 | Auth・Firestore Emulator、Security Rulesの限定配信・復元 |
| 開発依存 | `vitest` 4.1.11、`fake-indexeddb` 6.2.5、`@playwright/test` 1.62.1 | 単体試験、ブラウザー分離、E2E試験 |

固定済み`package-lock.json`を基礎とし、`npm audit --audit-level=high`を確認する。HighまたはCriticalがあれば実Firebase接続前に停止し、強制更新や新規依存追加は別途説明する。

## 外部サービスと設定変更

| 資源・設定 | POC-004での扱い | 終了時 |
|---|---|---|
| Firebaseプロジェクト `crs-poc-001-20260902-01` | POC-005終了確認まで保持する検証専用資源を再利用 | プロジェクト本体を削除しない |
| Sparkプラン・請求設定 | Spark、請求先未接続を開始前に再確認 | Blazeへ変更せず維持 |
| Authentication匿名認証 | 既存設定を変更せず、POC-004では使用しない | 開始前状態を維持 |
| Authenticationメール・パスワード | 一時的に有効化し、架空利用者5件以内を作成 | 全架空利用者を削除し、開始前に無効なら再び無効化 |
| Firestore既定データベース | POC-004専用`runId`配下だけを使用 | 対象文書を子孫から削除し、0件を確認 |
| Firestore Security Rules | 現行Rulesを照合・退避後、POC-004経路だけのRulesを一時配信 | 照合した開始前Rulesを再配信して復元 |
| Hosting・Storage・Functions・Analytics・App Check・TTL | 使用しない | 作成・設定変更なし |

Rulesの退避内容を取得・照合できない場合は実FirebaseへのRules配信を開始しない。配信はPOC-004用Rulesだけに限定し、Firestoreデータベースや他Firebase製品の設定を同時変更しない。

## 保存データ

### Firebase

| 保存先 | 保存項目 | 保持期間・扱い |
|---|---|---|
| Authentication | 架空メール、Firebase UID、パスワードハッシュ等のFirebase管理情報、作成・最終ログイン時刻 | POC-004終了まで。実在メール不使用。利用者一覧で0件を確認 |
| `poc004Runs/{runId}` | 架空公演ID、作成時刻、`syntheticDataOnly=true` | 終了処理まで |
| `members/{uid}` | 架空利用者ID、役割、有効状態、一時期限 | 終了処理まで。パスワード・トークンなし |
| `publicRecords/{id}` | 架空のQR識別子、席、状態等の最小項目 | 終了処理まで。住所、電話、実在メールなし |
| `restrictedFields/{id}` | 任意項目の暗号文、salt、IV、方式、版、失効時刻 | 終了処理まで。平文・鍵・パスフレーズなし |
| `auditEvents/{id}` | 架空の権限変更・削除操作、担当UID、時刻、結果 | 終了処理まで |
| Firebase運用メタデータ | 認証・Firestore利用状況、Rulesリリース等 | Firebase所定の保持。架空データだけを扱う |

### 端末・ローカル環境

| 保存先 | 保存項目 | 保持期間・扱い |
|---|---|---|
| Firebase Auth永続領域 | 架空利用者の認証状態・トークン | 完全オフライン開始の検証まで。締め処理でsign out後に削除確認 |
| Firestore IndexedDB | 許可されたFirestore文書のキャッシュと保留書込み | 検証終了まで。受付・一時管理者へ制限文書を取得させない |
| IndexedDB `concert-reception-poc-004` | 準備状態、架空公演、暗号化任意項目、未送信状態 | 締め処理または終了時にDB削除 |
| Cache Storage・Service Worker | HTML、JavaScript、CSS等の静的資産 | 終了時にPOC-004 originの対象だけ削除 |
| メモリー | 入力中パスワード、共有パスフレーズ、非抽出AES鍵、復号済み架空値 | 画面終了・再読込みで破棄。ログ・ファイルへ出力しない |
| `poc/POC-004/artifacts/raw/` | 自動試験結果、ブラウザー保存状態、診断ログ | Git管理外。匿名化集計後に限定削除 |

FirebaseのWeb設定値は秘密鍵ではないが環境固有情報として`.env`だけに置き、実値をGitへ保存しない。パスワード、OAuthトークン、共有パスフレーズ、復号鍵、ブラウザー認証状態はGit、Issue、PR、結果報告書へ記載しない。

## 削除方法と確認

1. `runId`、FirebaseプロジェクトID、開始前Rulesの照合記録、作成した架空UID一覧を確認する。
2. 全ブラウザー環境でPOC-004の締め処理または終了処理を実行し、sign out、Firestore終了、永続キャッシュ、アプリIndexedDB、Cache Storage、Service Workerを対象origin内で削除する。
3. `poc004Runs/{runId}`のサブコレクションを先に削除し、親文書を最後に削除する。親削除だけではサブコレクションが消えないため、各経路0件を確認する。
4. 各架空利用者を直近認証状態から`deleteUser`で削除する。失敗時だけFirebase Consoleで対象UID・架空メールを照合して削除し、他利用者へ触れない。
5. Authentication利用者一覧でPOC-004接頭辞の架空利用者が0件であることを確認する。
6. 開始前にメール・パスワード認証が無効なら無効へ戻し、匿名認証等の他設定は変更しない。
7. POC-004用Rulesを、実施前に照合したRulesへ復元し、許可・拒否の代表ケースを再確認する。
8. `poc/POC-004/artifacts/raw/`の絶対パスを確認し、集計済み生証跡だけを削除する。
9. Firebaseプロジェクト本体はPOC-005終了確認まで保持する。

削除・復元が一部失敗した場合は対象を広げず、残存状態を報告する。Authentication全利用者削除、Firestore全体削除、Firebaseプロジェクト削除、ブラウザー全履歴削除は行わない。

## 費用0円の根拠と停止上限

2026-09-04時点のFirebase公式情報では、Sparkプランは支払方法なしで利用でき、メール・パスワード認証は無償対象である。Firestoreの無料枠は保存1GiB、読取り50,000件/日、書込み20,000件/日、削除20,000件/日、送信10GiB/月である。

| 指標 | POC-004停止上限 | 無料枠との比較 |
|---|---:|---|
| Authentication架空利用者 | 5件 | 無償Authenticationの想定規模を大幅に下回る |
| Firestore保存 | 5MiB | 1GiBの1%未満 |
| Firestore読取り | 2,000件/日 | 50,000件/日の4%以下 |
| Firestore書込み | 1,000件/日 | 20,000件/日の5%以下 |
| Firestore削除 | 1,000件/日 | 20,000件/日の5%以下 |
| 外部送信 | 20MiB/月 | 10GiB/月の1%未満 |
| Hosting・Storage・Functions・TTL | 0 | 使用しない |

TTL削除は無料使用を含まず請求設定が必要であり、Cloud FunctionsもBlazeプランが必要なため対象外とする。Spark・請求未設定を実接続前に再確認し、使用量が停止上限へ達する見込み、請求先接続要求、Blaze変更要求、有料API要求のいずれかがあれば停止する。

## `.gitignore`追加予定

POC-004ファイル生成前に、既存ルールを維持して次を追加し、架空ファイルで除外を確認する。

```gitignore
poc/POC-004/.firebaserc
!poc/POC-004/.firebaserc.example
poc/POC-004/artifacts/raw/
poc/POC-004/profiles/
poc/POC-004/firebase-export/
```

既存の`.env`、`.env.*`、`node_modules/`、`dist/`、`coverage/`、Firebaseログ・ローカル状態、Playwright認証状態も除外する。共有可能な`.env.example`、`.firebaserc.example`、ソース、固定ロック、架空サンプル、匿名化結果は追跡対象とする。

## 主なリスクと停止条件

| リスク | 対応・停止条件 |
|---|---|
| オフライン中の権限停止は届かない | 即時停止可能とは判定せず、復旧後停止と端末紛失時の運用リスクを記録する |
| Firebase IDトークンは約1時間有効 | メンバー文書の`active`とRulesを併用し、トークン失効だけへ依存しない |
| Auth永続状態とFirestoreキャッシュが端末へ残る | 信頼済み端末確認、明示締め処理、終了時の保存領域検査を行う |
| 共有パスフレーズが漏れる | Git・ログ・サーバーへ保存せず、主担当・代理だけが入力する。PoCは鍵管理の完全性を保証しない |
| Webアプリから端末ストレージの完全消去を証明できない | アプリが管理できるorigin内保存の不在を確認し、OS・ブラウザー内部の物理消去は保証外と明記する |
| Rules配信が既存設定を上書きする | 現行Rulesを照合できない場合は配信せず、終了時に同一内容へ復元する |
| TTL・Functionsが費用0円条件に反する | 有効化せず、厳密な無人自動削除を不適合候補として報告する |
| PBKDF2処理が低性能端末で遅い | 600,000回の所要時間を記録し、操作不能または10秒超なら方式を不適合候補とする |
| 架空利用者やデータが残る | 接頭辞・runId・UID一覧で限定削除し、0件確認まで結果を完了扱いにしない |
| 重大脆弱性 | High/Critical検出時は実Firebase接続前に停止し、更新・代替を再提案する |

## 承認後の実施順序

1. 本書の承認日時とIssue #6コメントURLを記録する。
2. `.gitignore`へPOC-004用ルールを追加し、除外・追跡対象を架空ファイルで確認する。
3. `poc/POC-004/`を作成し、固定依存関係、ライセンス、監査結果を確認する。
4. Emulatorで機能、Security Rules、暗号化、期限、削除の自動試験を完了する。
5. 実Firebaseのプロジェクト、Spark、請求未設定、利用量、Auth設定、現行Rulesを確認する。
6. メール・パスワード認証とPOC-004用Rulesだけを一時設定し、架空データで限定試験する。
7. 結果を集計し、Firebaseデータ・架空利用者・端末保存・生証跡を限定削除し、設定を復元する。
8. 結果報告書を作成してレビューを依頼する。

## 承認依頼

依頼者には、特に次を確認いただく。

- POC-004では架空メール・パスワードによる個別認証と一時的なSecurity Rules配信を行うこと。
- パスワード、トークン、共有パスフレーズ、鍵、実在する個人情報をGitや文書へ保存しないこと。
- オフライン中の権限停止はできず、回線復旧後の停止を検証すること。
- TTLとCloud Functionsを使わないため、厳密な1か月後の無人自動削除は0円条件では未達候補となること。
- 終了時にPOC-004の架空データと利用者だけを削除し、Firebaseプロジェクト本体はPOC-005終了確認まで保持すること。
- 承認対象は`POC-004`だけで、`POC-005`、技術採用、本番実装を含まないこと。

内容に問題がなければ、Issue #6または本PRのレビュー後に「`poc-004-approval-request.md`の内容を確認し、POC-004に限って開始を承認します」と明示する。この承認を得るまで、`.gitignore`変更、依存関係配置、POC-004コード作成、Firebase設定変更・接続、架空利用者・データ作成を開始しない。

## 公式資料

- [Firebase: Password-based authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase: Authentication state persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- [Firebase: Manage user sessions](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [Firebase: Manage users](https://firebase.google.com/docs/auth/web/manage-users)
- [Firebase: Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase: Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase: Delete Firestore data](https://firebase.google.com/docs/firestore/manage-data/delete-data)
- [Firebase: Firestore pricing](https://firebase.google.com/docs/firestore/pricing)
- [Firebase: Cloud Functions quotas and pricing](https://firebase.google.com/docs/functions/quotas)
- [W3C: Web Cryptography API](https://www.w3.org/TR/webcrypto/)
