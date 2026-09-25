# ドキュメント案内

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | プロジェクト文書の種類、用途、読む順番を案内する |
| 主な読者 | 依頼者、開発担当者、運用担当者 |
| 作成・更新時期 | 文書の追加、状態変更、構成変更時 |
| 記載する内容 | 文書の目的、対象読者、作成時期、状態、参照先 |
| 記載しない内容 | 個別機能の詳細仕様、私用メモ |
| 関連Issue | [#4](https://github.com/EU0207/concert-reception-system/issues/4) |
| 状態 | Draft |
| 承認情報 | 未承認 |

## 文書の状態

| 状態 | 意味 |
|---|---|
| Draft | 作成中であり、内容が変更される可能性がある |
| In Review | 関係者が内容を確認している |
| Approved | 必要な確認と承認が完了している |
| Superseded | 新しい文書や決定に置き換えられている |

## 依頼者向け文書

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| プロジェクト概要書 | [project-overview.md](client/project-overview.md) | 背景、目的、対象範囲を共有する | 依頼者、開発担当者 | プロジェクト開始時 | 目的や範囲の変更時 | In Review |
| 初回要件ヒアリング質問票 | [initial-interview-questionnaire.md](client/initial-interview-questionnaire.md) | QRコード受付の要件と受入条件に必要な確認事項を整理する | 依頼者、受付担当者、運用担当者、開発担当者 | 初回ヒアリング前 | 質問または確認範囲の変更時 | Draft |
| 初回要件ヒアリング議事録 | [2026-08-30-initial-requirements-interview.md](client/meeting-notes/2026-08-30-initial-requirements-interview.md) | 初回ヒアリングの正式な回答・決定事項を質問ID単位で記録する | 依頼者、受付担当者、運用担当者、開発担当者 | 初回ヒアリング時 | 訂正が承認された時 | Approved |
| 要件定義書 | [requirements.md](client/requirements.md) | 必要な機能と条件を合意する | 依頼者、開発担当者 | 要件定義工程 | 要件の追加・変更時 | Approved |
| 受入条件書 | [acceptance-criteria.md](client/acceptance-criteria.md) | 完成と判断する条件を合意する | 依頼者、開発担当者 | 要件定義工程 | 要件・確認方法の変更時 | Approved |
| Firebase初期設定・引継ぎ手順書 | [firebase-initial-setup-guide.md](client/firebase-initial-setup-guide.md) | 本番環境の所有、初期設定、権限返却を非技術者にも分かる形で案内する | 依頼者、後任管理者、技術担当者 | Firebase候補の検証時 | 採用・本番構成・画面変更時 | Draft |
| 打合せ記録 | [meeting-notes-guide.md](client/meeting-notes/meeting-notes-guide.md) | 確認事項と合意事項を記録する | 依頼者、開発担当者 | 打合せ実施時 | 記録の訂正時 | Draft |

## 開発者向け文書

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| 開発計画書 | [project-plan.md](development/project-plan.md) | 工程、成果物、進捗管理方法を定める | 開発担当者、依頼者 | プロジェクト開始時 | 計画変更時 | Draft |
| 用語集 | [glossary.md](development/glossary.md) | 専門用語の意味を統一する | 全関係者 | 全工程 | 新しい用語の使用時 | Draft |
| トレーサビリティ表 | [traceability-matrix.md](development/traceability-matrix.md) | 質問・要件・受入条件の対応を追跡する | 開発担当者、確認担当者 | 要件定義工程以降 | 関連成果物の変更時 | In Review |
| 技術検証計画書 | [technical-validation-plan.md](development/technical-validation-plan.md) | 技術調査・PoCの範囲、順序、評価方法、合格基準を合意する | 依頼者、開発担当者、確認担当者 | 暫定要件レビュー時 | 検証条件または承認状態の変更時 | Approved |
| 技術実現可能性調査報告書 | [technical-feasibility-research.md](development/technical-feasibility-research.md) | 技術調査の根拠、候補比較、制約、PoC前の判断事項を記録する | 依頼者、開発担当者、確認担当者 | 技術調査時 | 調査結果、候補、承認状態の変更時 | In Review |
| RES-005自動座席配置机上レビュー記録 | [res-005-seat-allocation-desk-review.md](development/res-005-seat-allocation-desk-review.md) | 自動座席配置の架空例と期待結果を確認し、将来テストへ引き継ぐ | 依頼者、開発担当者、確認担当者 | RES-005実施時 | 机上レビュー結果または要件変更時 | Approved |
| POC-001開始承認依頼書 | [poc-001-approval-request.md](development/poc-001-approval-request.md) | PoC開始前に依存関係、外部資源、データ、削除、費用と承認範囲を確認する | 依頼者、開発担当者、確認担当者 | POC-001承認前 | 候補条件または承認状態の変更時 | Approved |
| POC-001実施結果報告書 | [poc-001-result.md](development/poc-001-result.md) | 完全オフライン受付と復旧後統合の検証結果、制約、次の判断材料を記録する | 依頼者、開発担当者、確認担当者 | POC-001完了時 | 結果確認、終了処理、次の判断時 | Approved |
| POC-002開始承認依頼書 | [poc-002-approval-request.md](development/poc-002-approval-request.md) | 性能・通信量PoC開始前に測定方法、再利用、外部資源、削除、費用と承認範囲を確認する | 依頼者、開発担当者、確認担当者 | POC-002承認前 | 測定条件または承認状態の変更時 | Approved |
| POC-002実施結果報告書 | [poc-002-result.md](development/poc-002-result.md) | QR判定後の受付性能、同期、通信量の検証結果、制約、終了処理を記録する | 依頼者、開発担当者、確認担当者 | POC-002完了時 | 結果確認、次の判断時 | Approved |
| POC-003開始承認依頼書 | [poc-003-approval-request.md](development/poc-003-approval-request.md) | 実機・カメラ・電子チケットPoC開始前に依存関係、HTTPS配信、実機協力、保存・削除、費用を確認する | 依頼者、開発担当者、実機確認担当者 | POC-003承認前 | 対象、実機、配信条件または承認状態の変更時 | Approved |
| POC-003実機確認手順書 | [poc-003-device-test-guide.md](development/poc-003-device-test-guide.md) | IT開発経験がない確認担当者が3機種のQR読取り、オフライン動作、結果出力、端末内データ削除を確認する | 依頼者、実機確認担当者 | POC-003実機確認時 | 操作手順、対象機種、確認項目の変更時 | Draft |
| POC-003実施結果報告書 | [poc-003-result.md](development/poc-003-result.md) | 指定実機のQR読取り、電子チケット、オフライン保持、終了処理の結果と制約を記録する | 依頼者、開発担当者、確認担当者 | POC-003終了時 | 版番号、削除確認、結果承認時 | Approved |
| POC-004開始承認依頼書 | [poc-004-approval-request.md](development/poc-004-approval-request.md) | 個別認証、権限制御、暗号化、期限、端末削除PoCの開始前に外部資源、保存・削除、費用と制約を確認する | 依頼者、開発担当者、確認担当者 | POC-004承認前 | 対象、Firebase設定、削除方式または承認状態の変更時 | Approved |
| POC-004実施結果報告書 | [poc-004-result.md](development/poc-004-result.md) | 個別認証、役割制御、暗号化、期限、端末削除の結果と0円条件で残る制約を記録する | 依頼者、開発担当者、確認担当者 | POC-004終了時 | 結果確認、要件調整、次の判断時 | Approved |
| POC-005開始承認依頼書 | [poc-005-approval-request.md](development/poc-005-approval-request.md) | 座席表・会場画像の事前取得、完全オフライン表示、実機確認の開始前に外部資源、保存・削除、費用を確認する | 依頼者、開発担当者、実機確認担当者 | POC-005承認前 | 対象、画像上限、実機、配信・削除条件の変更時 | Approved |
| POC-005実機確認手順 | [poc-005-device-check-guide.md](development/poc-005-device-check-guide.md) | 3機種で事前取得、完全オフライン、現在席、代替一覧、Fold開閉を確認する | 依頼者、実機確認担当者 | POC-005実機確認時 | 確認URL、画面手順、対象端末の変更時 | In Review |
| POC-005実施結果報告書 | [poc-005-result.md](development/poc-005-result.md) | 自動試験、指定3実機、配信、費用、終了処理とAC-025判定を記録する | 依頼者、開発担当者、確認担当者 | POC-005実施中・終了時 | 実機結果、削除確認、最終判定時 | Approved |
| 本番座席表・会場画像UI/UX引継ぎ事項 | [production-seat-map-ui-ux-notes.md](development/production-seat-map-ui-ux-notes.md) | 画像操作、座席構成、購入者名・座席表示名、会場席管理、2種類の印刷用座席表を画面・帳票・テスト設計へ引き継ぐ | 依頼者、画面設計担当者、開発担当者 | POC-005終了前、画面・帳票・テスト設計時 | 本番画面案のレビュー、座席表要件変更時 | In Review |
| 検証用Firebaseプロジェクト削除承認依頼書 | [firebase-test-project-deletion-approval-request.md](development/firebase-test-project-deletion-approval-request.md) | 全PoC終了後の検証用Firebaseプロジェクト本体について、削除対象、影響、復元条件、承認方法を確認する | 依頼者、開発担当者 | プロジェクト本体の削除前 | 資源状態、復元条件、削除結果の変更時 | Approved |
| 本番セキュリティ・UI/UX設計引継ぎ事項 | [production-security-ui-ux-notes.md](development/production-security-ui-ux-notes.md) | 来場状態、チケット準備状態、本番セキュリティ、主要画面のUI/UXを設計・実装・試験・運用へ引き継ぐ | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 要件最終確認前、設計開始時 | 要件承認、技術選定、画面レビュー、試験結果の変更時 | In Review |
| 要件・受入条件 最終レビュー兼承認依頼書 | [requirements-final-review.md](development/requirements-final-review.md) | PoC反映、未決定事項、残るリスク、承認対象と承認範囲をIssue #23で確認する | 依頼者、開発担当者、確認担当者 | 要件最終確認時 | 承認結果、対象コミット、残るリスクの変更時 | Approved |
| ADR案内 | [adr-guide.md](development/decisions/adr-guide.md) | 重要な判断の記録方法を定める | 開発担当者 | 重要な判断の発生時 | 運用変更時 | Draft |
| ADR-001 製品基盤と外部サービス | [ADR-001-product-platform.md](development/decisions/ADR-001-product-platform.md) | 製品基盤候補、外部サービス、費用、同期、環境分離を比較し、採用案を提示する | 依頼者、開発担当者、保守担当者 | 技術選定時 | 採用判断、提供条件、要件の変更時 | Approved |
| ADR-002 Firebase上限時の緊急継続方式 | [ADR-002-quota-emergency-response.md](development/decisions/ADR-002-quota-emergency-response.md) | Firebase上限時の紙運用、手動課金、未送信確認、復旧方式を決める | 依頼者、管理者、設計担当者、開発担当者、運用担当者 | 上限時の運用方針決定時 | 料金、権限、紙運用、復旧方式の変更時 | Approved |
| ADR-003 役割別の本人認証プロバイダー | [ADR-003-role-based-auth-providers.md](development/decisions/ADR-003-role-based-auth-providers.md) | ADR-001の全役割メール・パスワード方式を役割別方式へ置換する | 依頼者、開発者、設計担当者、運用担当者 | BD-10の整合確認時 | 認証方式、費用、アカウント運用の判断時 | Approved |
| C-01 端末単位認可の成立性調査 | [device-authorization-feasibility.md](development/device-authorization-feasibility.md) | 同じUIDの複数端末を個別停止する方式と検証条件を整理する | 依頼者、開発者、設計担当者 | 第三者品質レビュー是正時 | 技術検証、費用条件、認可方式の決定時 | Draft |
| 基本設計計画書 | [basic-design-plan.md](development/basic-design-plan.md) | 基本設計の成果物、対象、依存関係、追跡方法、承認順序を定める | 依頼者、設計担当者、開発担当者、テスト担当者 | 基本設計開始時 | 設計分割、依存関係、承認ゲートの変更時 | Approved |
| システム構成・環境分離設計 | [system-architecture.md](development/system-architecture.md) | PWA、端末保存、Firebase、ファイル、環境、設定、配布の責務と境界を定める | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 構成、環境、接続、外部サービス、配布方式の変更時 | Approved |
| 論理データモデル・データフロー・ライフサイクル設計 | [logical-data-model.md](development/logical-data-model.md) | 公演シリーズと独立した公演を定める。座席、購入者名、座席表示名、チケット準備を含む業務データの意味、関係、正本、生成・共有・出力・削除経路を扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | データ項目、関係、配布範囲、保存・削除方針の変更時 | Approved |
| オフライン同期・競合設計 | [offline-sync-conflict-design.md](development/offline-sync-conflict-design.md) | 端末先行保存、差分同期、再送、冪等性、状態導出を定める。公演前編集の明示保存、版競合、読取り再利用、公演・端末ごとの同期分離、紙照合、締めの境界を扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 同期、競合、編集保存、紙照合、締め境界、外部サービス交換方式の変更時 | Approved |
| 認証・役割・権限設計 | [authentication-authorization-design.md](development/authentication-authorization-design.md) | 初期主担当Google UID、UID・公演単位の役割、複数端末と追加端末関連付け、1回限りの招待、公演限定スタッフの短期パスワード、端末単位の事前準備・オフライン許可、4役割、セッション、端末停止・廃止、隔離送信、Security Rulesへ渡す権限境界を定める | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 認証方式、役割、権限、端末、セッション、外部サービス交換方式の変更時 | Approved |
| セキュリティ・プライバシー設計 | [security-privacy-design.md](development/security-privacy-design.md) | 信頼境界、Security Rules、App Check、公開画面のFirestore非接続を定める。1回限りリンク、端末暗号化と鍵、Web保護を扱う。秘密情報・ログ、公開物、依存関係、インシデント対応も扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 脅威、認可、暗号化、鍵、外部サービス、公開・依存ゲートの変更時 | Approved |
| 画面・画面遷移・操作見本設計 | [screen-flow-wireframe-design.md](development/screen-flow-wireframe-design.md) | 公演準備と当日運用の画面を定める。座席キャンバス、下書き保存・確定、未保存変更の離脱確認、端末・終了処理の情報構造を扱う。主要操作見本と非技術的なエラー案内も定める | 依頼者、画面設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 業務フロー、画面、権限、状態、利用者向け文言の変更時 | Approved |
| Excel・QR・PDF・CSV・帳票設計 | [file-output-report-design.md](development/file-output-report-design.md) | 名簿取込、QR、電子チケット、PDF・Excelの主要出力、CSVの補助出力、当日運営表、座席表の形式を定める。取得済みデータからの端末内生成、安全な入出力、バックアップ・復旧・移行形式の後続設計境界も扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 入出力項目、形式、権限、印刷条件、安全対策の変更時 | Approved |
| 運用・監視・締め・削除・復旧設計 | [operations-recovery-design.md](development/operations-recovery-design.md) | 公演準備、利用量・App Check監視、障害・紙切替、復旧、締め、端末削除、削除希望、暗号化JSONバックアップ、引継ぎを定める | 依頼者、主担当、代理管理者、環境所有者、開発担当者、テスト担当者、運用担当者 | 基本設計時、公演準備時、障害・復旧時 | 運用役割、監視、費用、復旧、削除、外部サービス、引継ぎの変更時 | Approved |
| テスト方針 | [test-strategy.md](development/test-strategy.md) | 受入条件39件の試験レベル、環境、架空データ、証跡、判定、PoC証跡との境界を定める | 依頼者、開発者、テスト担当者、運用担当者 | 基本設計時、個別ケース作成時 | 要件、受入条件、試験環境、判定方法の変更時 | Approved |
| 基本設計一式レビュー・承認依頼書 | [basic-design-final-review.md](development/basic-design-final-review.md) | BD-01～BD-09の整合、操作見本、Firebase交換境界、未決定事項、承認条件を一式で確認する | 依頼者、開発者、設計担当者、テスト担当者、運用担当者 | BD-10の一括レビュー時 | 指摘、依頼者回答、ADR、承認対象コミットの変更時 | Approved |
| 第三者資産・依存関係の候補台帳 | [third-party-dependency-candidates.md](development/third-party-dependency-candidates.md) | PoC由来の候補とTBD-011の採用前確認事項を記録する | 開発者、設計担当者、レビュー担当者 | BD-10と依存採用前 | 候補、版、権利、安全性、費用の確認時 | Approved |
| 基本設計 第三者品質レビュー記録 | [basic-design-independent-review.md](development/basic-design-independent-review.md) | 要件を基準とする独立レビューの指摘、未決事項、詳細設計への移行判定を記録する | 開発者、設計担当者、依頼者 | 基本設計の再レビュー時 | 指摘回答、是正方針の決定、再レビュー時 | Draft |

## テンプレート

| テンプレート | ファイル | 用途 |
|---|---|---|
| 一般文書 | [document-template.md](templates/document-template.md) | 新しい正式文書の共通書式 |
| 承認依頼書 | [approval-request-template.md](templates/approval-request-template.md) | 依頼者への承認対象、理由、影響、対象外、回答方法の提示 |
| 打合せ記録 | [meeting-note-template.md](templates/meeting-note-template.md) | 打合せ内容と合意事項の記録 |
| 要件 | [requirement-template.md](templates/requirement-template.md) | 機能要件・非機能要件の記録 |
| テストケース | [test-case-template.md](templates/test-case-template.md) | 将来のテスト仕様作成時に使用 |

## 読む順番

1. プロジェクト概要書で背景と目的を確認する。
2. 要件定義書で必要な機能と条件を確認する。
3. 受入条件書で完成の判断方法を確認する。
4. 開発計画書で工程と進捗管理方法を確認する。
5. 重要な技術判断が必要になった場合はADRを確認する。
