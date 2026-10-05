# POC-004 実施結果報告書

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | 個別認証、役割別権限制御、任意項目保護、権限停止、端末データ削除の検証結果と制約を記録する |
| 主な読者 | 開発者、設計担当者、テスト担当者 |
| 実施日 | 2026-09-04 |
| 関連文書 | [技術検証計画書](technical-validation-plan.md)、[開始承認依頼書](poc-004-approval-request.md) |
| 関連Issue | [#6](https://github.com/EU0207/concert-reception-system/issues/6) |
| 状態 | Approved |
| 承認情報 | POC-004の開始は2026-09-04に対象限定で承認済み。2026-09-06に依頼者確認として任意項目の無人自動削除を必須とせず削除案内方式とする判断、およびPOC-004完了・main統合の承認を受領。技術採用、POC-005、本番実装は未承認 |

## 結論

`POC-004`は、個別認証、役割制御、暗号化、期限後の読取り拒否、回線復旧後の権限停止、明示的な端末削除について**合格**と判定する。

- Firebase Authenticationのメール・パスワード認証で、架空の5利用者を個別に識別できた。
- Firestore Security Rulesで、主担当、代理管理者、受付担当、一時管理者の許可範囲をサーバー側でも分離できた。
- 任意項目はPBKDF2-HMAC-SHA-256とAES-GCM-256で暗号化し、受付担当・一時管理者による取得を拒否できた。
- 一時権限の期限切れと、紛失想定利用者の`active=false`反映後のアクセス拒否を確認した。
- 準備済み端末だけが完全オフライン開始でき、明示的な締め処理でPOC管理下の端末保存を削除できた。
- 期限後の読取り拒否と、次回オンライン管理操作での削除候補処理は実現できる。
- Firebase TTL削除は無料使用を含まず、Cloud Functionsの利用にはBlazeプランが必要なため採用しない。依頼者判断に基づき、期限経過後に管理画面で件数・理由・削除ボタンを示し、主担当・代理管理者へ削除させる方式を要件とする。

`REQ-NF-012`と`AC-023`は、1か月後の無人自動削除を必須とせず、期限後の読取りを拒否したうえで次回オンライン管理操作時に削除を案内する内容へ調整した。詳細履歴を扱う`REQ-F-025`と`AC-013`は別要件であり、今回の判断では変更していない。

## 実施構成

| 区分 | 使用内容 |
|---|---|
| Webアプリ | Vanilla TypeScript 7.0.2、Vite 8.2.2、PWA構成 |
| Firebase SDK | `firebase` 12.18.0 |
| 端末保存 | IndexedDB、`idb` 8.0.3、Cache Storage、Firebase Auth・Firestore永続領域 |
| 暗号化 | Web Crypto API、PBKDF2-HMAC-SHA-256 600,000回、16バイトsalt、AES-GCM-256、12バイトIV |
| ローカルFirebase | Authentication Emulator、Firestore Emulator、Firebase CLI 15.28.2 |
| Java | Temurin JDK 21。開発用エミュレーターだけに使用し、本番利用者端末には不要 |
| 実Firebase | 既存の検証専用Sparkプロジェクト。AuthenticationとFirestoreだけを一時使用 |

新しいnpmパッケージは追加せず、POC-001の固定依存関係を再利用した。実在するメール、来場者情報、パスワード、共有秘密、個人情報は使用していない。

## 確認結果

| 確認項目 | 結果 | 確認方法 |
|---|---|---|
| 個別メール・パスワード認証 | 合格 | 正しい資格情報で成功し、誤ったパスワードを拒否 |
| 役割別の一般データ取得 | 合格 | 有効な受付担当に許可 |
| 任意項目の取得制限 | 合格 | 主担当・代理だけ許可し、受付担当・一時管理者をRulesで拒否 |
| 一時管理者 | 合格 | 一般業務を許可し、メンバー変更と任意項目取得を拒否 |
| 期限切れ | 合格 | Rulesで読取り拒否し、管理画面から次回操作時に削除する処理を確認。無人自動削除は改訂後要件の対象外 |
| 紛失端末の停止 | 合格 | オンラインで`active=false`反映後、対象利用者の要求を拒否 |
| 完全オフライン開始 | 合格 | 未準備は拒否し、500件準備済み状態は再読込み・通信切断後も開始可能 |
| 任意項目の形式 | 合格 | 最大10項目、各200文字を許可し、11項目目と201文字を拒否 |
| 暗号化・復号 | 合格 | 暗号文への平文混入なし、正しい共有パスフレーズだけで復号、誤入力を拒否 |
| 通常CSVと選択CSV | 合格 | 受付担当の通常列だけを許可し、任意項目を含む出力を拒否 |
| 監査イベント | 合格 | 追加を許可し、既存イベントの更新を拒否 |
| 締め処理条件 | 合格 | 公演終了、未送信0件、管理者確認の全条件を必須化 |
| 端末内削除 | 合格 | IndexedDB、対象Cache Storage、Service Workerの削除処理と再読込み後の準備状態不在を確認 |

完全オフライン中の端末へ権限変更を即時配信することはできない。今回の合格は、回線復旧後のサーバー要求拒否と端末側削除を前提とする。

## 自動確認

| 確認 | 結果 |
|---|---|
| 単体テスト | 4ファイル、8件合格 |
| TypeScript型検査・本番ビルド | 合格 |
| Chromium E2E | 1件合格。未準備拒否、準備状態保持、完全オフライン開始、役割外非配布、600,000回PBKDF2暗号化、期限切れ削除、端末削除を確認 |
| Authentication・Firestore Emulator | 1ファイル、6件合格。実プロジェクトへ接続不能な`demo-`プロジェクトIDを使用 |
| 実Firebase限定試験 | 1ファイル、4件合格。架空利用者5件、POC-004専用`runId`だけを一時使用 |
| 依存関係監査 | High 0件、Critical 0件。Moderate 5件は開発用Firebase CLI等の間接依存 |

## 実Firebaseの変更と復元

| 対象 | 開始前 | 一時変更 | 終了確認 |
|---|---|---|---|
| 料金プラン | Spark、アップグレードなし | 変更なし | Sparkを維持 |
| メール・パスワード認証 | 無効 | 試験中だけ有効 | 無効へ復元 |
| 匿名認証 | 有効 | 変更なし | 有効を維持 |
| Authentication利用者 | 0件 | 架空利用者5件 | 0件をコンソールで確認 |
| Firestore Rules | POC-001版 | POC-004専用Rules | POC-001版へ再配信し、コンソール表示で一致確認 |
| Firestoreデータ | コレクションなし | `poc004Runs/{runId}`だけ | コレクションなしをコンソールで確認 |
| Hosting・Storage・Functions・Analytics・App Check・TTL | POC-004では未使用 | 変更なし | 変更なし |
| Firebaseプロジェクト本体 | 検証専用として保持 | 変更なし | POC-005終了確認まで保持 |

Rulesの開始前コピー、Firebase Web設定、`.env`、`.firebaserc`はGit管理外に置いた。パスワード、OAuthトークン、共有パスフレーズ、暗号鍵をIssue、PR、Git、結果文書へ保存していない。

## 費用

- カード登録、請求先接続、Blaze変更、有料契約、自動更新を行っていない。
- 架空利用者5件と少数の読取り・書込み・削除だけで、承認時の停止上限を大幅に下回った。
- Hosting、Storage、Cloud Functions、TTLを使用していない。
- JDKは無償の開発用ツールであり、Firebaseの利用料金や本番利用者の管理対象を増やさない。

## 残るリスクと判断事項

- 期限切れ値を残さないため、主担当・代理管理者が管理画面を開いた時に期限切れ件数、削除理由、削除ボタンを明確に示し、削除完了まで案内を継続する必要がある。
- 完全オフライン中の紛失端末は即時停止できない。端末の画面ロック、信頼済み端末限定、紛失連絡、回線復旧後の停止を運用へ含める必要がある。
- 共有パスフレーズ方式はサーバーへ復号鍵を保存しない一方、主担当・代理間の安全な共有と忘失時の扱いが必要である。
- POC-004で確認したのは締め処理後の明示的な削除手段、暗号化、権限停止である。2026-09-08の`CONF-024`により、本番では全スタッフの記憶に依存した個別削除を採用せず、締め処理を起点とする次回オンライン・起動時の自動削除、端末別完了追跡、削除完了までの次公演開始制御を追加する。この連携はPOC-004の合格範囲外であり、AC-028で確認する。
- 2026-09-18の`CONF-038`により、上記のうち削除完了まで次公演を開始させない条件は本番設計で採用しない。POC-004の検証結果は変更せず、前公演の未処理保持と次公演利用の両立をAC-038で確認する。
- Webアプリが削除を確認できる範囲は対象origin内の論理保存領域であり、端末ストレージの物理消去までは保証できない。
- POCは限定実装であり、本番向けのアカウント発行・再設定・引継ぎUI、確認画面、監査表示、障害時手順は別途設計が必要である。
- `POC-005`、Firebase方式の採用、本番実装は未承認である。

## 依頼者の確認結果

- 2026-09-06に、任意項目値の1か月後の無人自動削除は必須とせず、管理画面で削除を案内して主担当・代理管理者に削除させる判断を確認した。
- POC-004の完了とmain統合が承認された。
- FirebaseプロジェクトとTemurin JDK 21はPOC-005まで保持する。

## 公式資料

- [Firebase: Password-based authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase: Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase: Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase: Delete Firestore data](https://firebase.google.com/docs/firestore/manage-data/delete-data)
- [Firebase: Firestore pricing](https://firebase.google.com/docs/firestore/pricing)
- [Firebase: Cloud Functions quotas and pricing](https://firebase.google.com/docs/functions/quotas)
- [W3C: Web Cryptography API](https://www.w3.org/TR/webcrypto/)
