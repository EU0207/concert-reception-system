# GD91-80 外部認可確認の接続準備

| 項目 | 内容 |
|---|---|
| 状態 | Draft |
| 読者 | 開発者、設計担当者、テスト担当者 |
| 目的 | TECH-DD91-079のAに従い、課金なしの外部認可確認を準備する |
| 承認 | 2026-10-13、開発者がAを選択。検証範囲の承認であり、本番採用・#167完了の承認ではない |
| 現在地 | 新規の隔離プロジェクトとFirestoreを準備済み。Authentication初期化はコンソールの読込みエラーで中断。認可試験は未実施 |

## アカウントとGitの境界

| 対象 | 扱い |
|---|---|
| 環境所有者のGoogleアカウント | Firebase環境の管理用。公式ログインで認証し、パスワード・確認コードをコードやチャットへ渡さない |
| 試験用Firebase Authentication利用者 | 環境所有者とは別の架空利用者。最初は2利用者、実在する来場者・スタッフの情報は使わない |
| 環境固有の接続設定 | `firebase-client-config.local.json`または環境変数。Git管理外。追跡する設定例は架空値だけにする |
| トークン・ブラウザー認証状態 | メモリーまたはGit管理外の認証領域。ログと公開用結果へ出さず、サービスアカウント秘密鍵を新規発行しない |
| 生の外部応答 | `artifacts/raw/`へ分離しGit管理外。プロジェクトID・UIDと認証情報を公開用結果から除去する |
| 正式結果 | 件数・HTTP状態と合否を匿名集計し、対応するソース版を記録する。実際のアカウント名やメールは記録しない |

FirebaseのWeb設定は認証資格そのものではないが、本プロジェクトでは環境分離のためGitへ固定しない。データのアクセス制御はSecurity Rulesで検証し、設定を隠すことだけを防御としない。

## 接続前の確認

1. 所有者アカウントと、実データのない検証専用プロジェクトを確認する。既存環境のRulesを上書きしない。
2. Spark・請求先未登録を読み取り確認する。支払方法の登録とBlazeへの変更は行わない。
3. ローカル設定のGit除外と追跡対象を確認する。接続先が未指定・不一致なら外部要求を開始しない。
4. [TECH-DD91-079の範囲](../../docs/development/technical-validation/seat-capacity-validation.md#外部での認可確認案tech-dd91-079)内で要求上限と停止条件を設定する。試験コードは準備中であり、外部実行前に接続準備とローカル検査を完了する。

## 接続準備の結果（2026-10-13）

| 対象 | 結果 |
|---|---|
| プロジェクト | 開発者の新規作成許可に従い隔離環境を作成。既存CLIアカウントのOwner権限と請求先未登録を確認 |
| Firestore | 東京リージョンに最初のStandardデータベースを作成。PITRは無効。試験文書は未作成 |
| Webアプリ | 接続設定をGit管理外へ保存。Hostingは未使用 |
| Authentication | 初期化前。Identity Platform向けの初期化APIは課金前提のため失敗し、再使用しない。無料Firebase Authenticationのコンソール操作へ切り替える |
| コンソール | 開発者のログイン完了後、プロジェクト一覧とSpark表示を確認。Authentication画面では利用規約の同意状態の取得エラーが再発したため、通常ブラウザーでの初期化待ち |

利用規約への同意を自動処理しない。課金を有効にして初期化エラーを回避しない。[プロジェクト準備結果](artifacts/setup-summary.json)と[サービス準備の初回結果](artifacts/service-summary.json)は環境識別子を除いた記録である。後者は修正前のソースに対応する過去の失敗記録であり、現在のコードの検証成功を示さない。

`generate-rules.mjs`は既存PoCの認可関数から読取り専用Rulesを生成する。`probe.mjs --dry-run`は外部接続なしで契約を確認する。`--run-approved`は専用環境の準備完了後だけ実行する。架空の2利用者で認可を比較し、終了時に全拒否Rulesへ戻す。試験用データを回収し、認証方式の設定を元へ戻す。

現在は試験用Auth利用者・試験文書とも未作成である。600人・1,000人の無料成立と本番方式の採用は未判定のままとする。

GitHub Pages・Hostingの公開とリポジトリ公開は行わない。600人・1,000人の人数試験と本番アプリケーション実装も本検証へ含めない。

公式資料：[Sparkプラン](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)、[設定と秘密鍵の区別](https://firebase.google.com/support/guides/security-checklist)、[Firebase規約の確認方法](https://firebase.google.com/support/faq#firebase-terms)、[Identity Platform初期化APIの制約](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.identityPlatform/initializeAuth)。
