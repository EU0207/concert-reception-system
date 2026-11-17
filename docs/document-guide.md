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

## 記載の分担

| 場所 | 記載する内容 |
|---|---|
| 詳細設計 | 冒頭に要点と未決定事項。本文に仕様・判断理由と主要試験ケースを集約する |
| 技術検証記録 | 冒頭に現在地と残作業。結果・費用と比較履歴をIDで追跡し、測定データはpoc/を参照する |
| 親Issue | 目的、タスク一覧、依存順。各タスクの完了条件は子Issueを参照する |
| 子Issue | 作るもの、開始条件、完了条件。設計と試験はID・リンクで参照する |
| PR | 冒頭に変更の結論、確認点、残作業。確認点は原則3件以内とし、対象箇所へリンクする |

同じ説明を複数箇所へ転記せず、正本へリンクする。Git管理する設計文書では通常のMarkdown見出しを使い、検証結果と過去の経緯は技術検証記録へ分離し、設計書には現在の契約と主要試験ケースを残す。折りたたみはGitHubのIssue・PR本文で使用する。承認条件と例外は省略せず、未実施の試験を明示する。以後の新規作成と更新対象へ適用する。

PoCの試験用形式は製品の互換性要件にしない。最新の承認済み要件とモック確認結果を設計基準とし、PoCは対象条件が一致する技術的根拠として参照する。旧PoC形式の対象除外は[TECH-DD91-121](development/decisions/ADR-007-seat-edit-commit-boundary.md#旧poc互換移行の対象除外tech-dd91-121)を正本とする。

検証の中間結果は確認範囲ごとに1コミットへまとめ、同じIssueのブランチで作業を続ける。検証単位は着手時のIssueと完了条件で定め、計算・入力接続・回帰試験だけで新たな完了単位を作らない。全検証完了、Issueの完了条件充足、または具体的な開発判断が必要な時点でPRへまとめる。明示的な中間提出の依頼がある場合も、確認済み範囲と残条件を示す。コミット数を区切りの基準にしない。PR冒頭には完了条件との対応を示し、詳細記録へリンクする。重要な制約は途中でも報告する。

### 詳細設計と技術試験の役割分担

詳細設計と技術的な試験資料の読者は、開発者・設計担当者・テスト担当者とする。設計担当者とテスト担当者が技術内容を確認し、開発者が技術上の承認を判断する。試験資料を設計書から分離した場合も同じ分担を適用する。

依頼者には未決定の業務判断だけを平易に説明し、確認事項・理由・推奨案を示す。詳細設計全体の技術レビュー・承認は求めない。承認済みの業務回答は維持し、文書整理を理由に再確認しない。

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
| 初期設定・引渡し・利用開始手順書 | [firebase-initial-setup-guide.md](client/firebase-initial-setup-guide.md) | 自分専用の環境作成から、最初の管理端末・スタッフの準備までを案内する。製品実装待ちと完成時の単独実施確認を明示する | 依頼者、環境所有者、第三者の自主運用者 | 初期設定設計時 | 製品実装・配布・画面変更時 | Draft |
| 打合せ記録 | [meeting-notes-guide.md](client/meeting-notes/meeting-notes-guide.md) | 確認事項と合意事項を記録する | 依頼者、開発担当者 | 打合せ実施時 | 記録の訂正時 | Draft |

## 開発者向け文書

[開発文書のフォルダ案内](development/index.md)から工程ごとに探せます。

工程の状態・承認日・承認PR・タグは、[開発計画書の工程一覧](development/project-plan.md#工程の状態と承認地点)を参照してください。[タグの対象と見方](development/project-plan.md#タグの対象と見方)から、初回承認と変更承認の基準版を確認できます。

### 横断資料

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| 開発計画書 | [project-plan.md](development/project-plan.md) | 工程、成果物、進捗管理方法を定める | 開発担当者、依頼者 | プロジェクト開始時 | 計画変更時 | Draft |
| 用語集 | [glossary.md](development/glossary.md) | 専門用語の意味を統一する | 全関係者 | 全工程 | 新しい用語の使用時 | Draft |
| トレーサビリティ表 | [traceability-matrix.md](development/traceability-matrix.md) | 質問・要件・受入条件を追跡。[実装・試験の担当と順序](development/traceability-matrix.md#実装試験の担当と実装順2026-10-21)から全39ACとIssueへ接続する | 開発担当者、確認担当者 | 要件定義工程以降 | 関連成果物の変更時 | Approved（実装担当の追補はPR #249） |
| 共通アプリ基盤・起動設定とPWA | [app-foundation-detail-design.md](development/detailed-design/app-foundation-detail-design.md) | 承認済みBD-01・05・06の実装具体化と、起動手順・担当試験・実機確認の残条件を記録する | 開発者、実装担当者 | #258の実装 | 起動契約・試験と操作確認時 | In Review |

### 技術検証

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| 技術検証計画書 | [technical-validation-plan.md](development/technical-validation/technical-validation-plan.md) | 技術調査・PoCの範囲、順序、評価方法、合格基準を合意する | 開発者、設計担当者、テスト担当者 | 暫定要件レビュー時 | 検証条件または承認状態の変更時 | Approved |
| PoCの案内・目的別索引 | [PoCの案内](../poc/poc-guide.md)・[全件索引](../poc/catalog.md) | 初期PoCと詳細設計中の検証を区別し、コードと結果の参照先を案内する | 開発者、評価者 | 検証記録の参照時 | 検証フォルダと参照先の追加・変更時 | In Review |
| 座席保存の技術検証記録 | [seat-save-validation.md](development/technical-validation/seat-save-validation.md) | #101の索引と検証分担を追跡。V1完了、V2の合同結果は別記録。容量・採否はV3・V4。122-AでRTDBを初期設計採用 | 開発者、設計担当者、テスト担当者 | 詳細設計の技術検証 | 結果・残作業・承認変更時 | Approved（#101の設計検証） |
| 座席構成の完成検証記録 | [seat-completion-validation.md](development/technical-validation/seat-completion-validation.md) | #165の全体検査・完成候補の証拠。GD91-54～59とV1の4条件は承認・統合済み | 開発者、設計担当者、テスト担当者 | 詳細設計の技術検証 | 結果・残条件・承認変更時 | Approved |
| 席・券・権限の合同検証記録 | [seat-business-integration-validation.md](development/technical-validation/seat-business-integration-validation.md) | #166の4条件と225件をPR #187で承認済み。V2完了、容量・回収は#167、採否は#168 | 開発者、設計担当者、テスト担当者 | 詳細設計の技術検証 | 結果・残条件・承認変更時 | Approved（機能合同検証） |
| 座席保存の容量・回収検証記録 | [seat-capacity-validation.md](development/technical-validation/seat-capacity-validation.md) | #167の設計検証4／4完了。121で旧PoC互換移行を初期・将来の必須対応から除外。122-AでRTDBを初期設計採用。正式契約・設計予算と引渡しをPR #228で承認・統合。通常バックアップ実装は#221、600人無料受入は#220 | 開発者、設計担当者、テスト担当者 | 詳細設計の技術検証 | 測定・判断変更時 | Approved（V3・V4） |
| 技術実現可能性調査報告書 | [technical-feasibility-research.md](development/technical-validation/technical-feasibility-research.md) | 技術調査の根拠、候補比較、制約、PoC前の判断事項を記録する | 開発者、設計担当者、テスト担当者 | 技術調査時 | 調査結果、候補、承認状態の変更時 | In Review |
| RES-005自動座席配置机上レビュー記録 | [res-005-seat-allocation-desk-review.md](development/technical-validation/res-005-seat-allocation-desk-review.md) | 自動座席配置の架空例と期待結果を確認し、将来テストへ引き継ぐ | 開発者、設計担当者、テスト担当者 | RES-005実施時 | 机上レビュー結果または要件変更時 | Approved |
| POC-001開始承認依頼書 | [poc-001-approval-request.md](development/technical-validation/poc-001-approval-request.md) | PoC開始前に依存関係、外部資源、データ、削除、費用と承認範囲を確認する | 依頼者、開発担当者、確認担当者 | POC-001承認前 | 候補条件または承認状態の変更時 | Approved |
| POC-001実施結果報告書 | [poc-001-result.md](development/technical-validation/poc-001-result.md) | 完全オフライン受付と復旧後統合の検証結果、制約、次の判断材料を記録する | 開発者、設計担当者、テスト担当者 | POC-001完了時 | 結果確認、終了処理、次の判断時 | Approved |
| POC-002開始承認依頼書 | [poc-002-approval-request.md](development/technical-validation/poc-002-approval-request.md) | 性能・通信量PoC開始前に測定方法、再利用、外部資源、削除、費用と承認範囲を確認する | 依頼者、開発担当者、確認担当者 | POC-002承認前 | 測定条件または承認状態の変更時 | Approved |
| POC-002実施結果報告書 | [poc-002-result.md](development/technical-validation/poc-002-result.md) | QR判定後の受付性能、同期、通信量の検証結果、制約、終了処理を記録する | 開発者、設計担当者、テスト担当者 | POC-002完了時 | 結果確認、次の判断時 | Approved |
| POC-003開始承認依頼書 | [poc-003-approval-request.md](development/technical-validation/poc-003-approval-request.md) | 実機・カメラ・電子チケットPoC開始前に依存関係、HTTPS配信、実機協力、保存・削除、費用を確認する | 依頼者、開発担当者、実機確認担当者 | POC-003承認前 | 対象、実機、配信条件または承認状態の変更時 | Approved |
| POC-003実機確認手順書 | [poc-003-device-test-guide.md](development/technical-validation/poc-003-device-test-guide.md) | IT開発経験がない確認担当者が3機種のQR読取り、オフライン動作、結果出力、端末内データ削除を確認する | 依頼者、実機確認担当者 | POC-003実機確認時 | 操作手順、対象機種、確認項目の変更時 | Draft |
| POC-003実施結果報告書 | [poc-003-result.md](development/technical-validation/poc-003-result.md) | 指定実機のQR読取り、電子チケット、オフライン保持、終了処理の結果と制約を記録する | 開発者、設計担当者、テスト担当者 | POC-003終了時 | 版番号、削除確認、結果承認時 | Approved |
| POC-004開始承認依頼書 | [poc-004-approval-request.md](development/technical-validation/poc-004-approval-request.md) | 個別認証、権限制御、暗号化、期限、端末削除PoCの開始前に外部資源、保存・削除、費用と制約を確認する | 依頼者、開発担当者、確認担当者 | POC-004承認前 | 対象、Firebase設定、削除方式または承認状態の変更時 | Approved |
| POC-004実施結果報告書 | [poc-004-result.md](development/technical-validation/poc-004-result.md) | 個別認証、役割制御、暗号化、期限、端末削除の結果と0円条件で残る制約を記録する | 開発者、設計担当者、テスト担当者 | POC-004終了時 | 結果確認、要件調整、次の判断時 | Approved |
| POC-005開始承認依頼書 | [poc-005-approval-request.md](development/technical-validation/poc-005-approval-request.md) | 座席表・会場画像の事前取得、完全オフライン表示、実機確認の開始前に外部資源、保存・削除、費用を確認する | 依頼者、開発担当者、実機確認担当者 | POC-005承認前 | 対象、画像上限、実機、配信・削除条件の変更時 | Approved |
| POC-005実機確認手順 | [poc-005-device-check-guide.md](development/technical-validation/poc-005-device-check-guide.md) | 3機種で事前取得、完全オフライン、現在席、代替一覧、Fold開閉を確認する | 依頼者、実機確認担当者 | POC-005実機確認時 | 確認URL、画面手順、対象端末の変更時 | In Review |
| POC-005実施結果報告書 | [poc-005-result.md](development/technical-validation/poc-005-result.md) | 自動試験、指定3実機、配信、費用、終了処理とAC-025判定を記録する | 開発者、設計担当者、テスト担当者 | POC-005実施中・終了時 | 実機結果、削除確認、最終判定時 | Approved |
| 検証用Firebaseプロジェクト削除承認依頼書 | [firebase-test-project-deletion-approval-request.md](development/technical-validation/firebase-test-project-deletion-approval-request.md) | 全PoC終了後の検証用Firebaseプロジェクト本体について、削除対象、影響、復元条件、承認方法を確認する | 依頼者、開発担当者 | プロジェクト本体の削除前 | 資源状態、復元条件、削除結果の変更時 | Approved |
| C-01 端末単位認可の成立性調査 | [device-authorization-feasibility.md](development/technical-validation/device-authorization-feasibility.md) | 同じUIDの複数端末を個別停止する方式と検証条件を整理する | 開発者、設計担当者、テスト担当者 | 第三者品質レビュー是正時 | 技術検証、費用条件、認可方式の決定時 | In Review |
| C-03 会場画像の共有保存方式調査 | [venue-image-storage-feasibility.md](development/technical-validation/venue-image-storage-feasibility.md) | 会場画像の保存、配布、削除と無料条件を比較する | 開発者、設計担当者、テスト担当者 | 第三者品質レビュー是正時 | 方式の技術検証と採用判断時 | In Review |
| C-01・C-03 限定技術検証結果 | [poc-006-result.md](development/technical-validation/poc-006-result.md) | 端末別停止と画像1MB配布の成立範囲・残存リスクを記録する | 開発者、設計担当者、テスト担当者 | 第三者品質レビュー是正時 | 方式選定と実装後試験の分離確認時 | In Review |

### 要件確認

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| 本番座席表・会場画像UI/UX引継ぎ事項 | [production-seat-map-ui-ux-notes.md](development/requirements-review/production-seat-map-ui-ux-notes.md) | 画像操作、座席構成、購入者名・座席表示名、会場席管理、2種類の印刷用座席表を画面・帳票・テスト設計へ引き継ぐ | 依頼者、画面設計担当者、開発担当者 | POC-005終了前、画面・帳票・テスト設計時 | 本番画面案のレビュー、座席表要件変更時 | In Review |
| 本番セキュリティ・UI/UX設計引継ぎ事項 | [production-security-ui-ux-notes.md](development/requirements-review/production-security-ui-ux-notes.md) | 来場状態、チケット準備状態、本番セキュリティ、主要画面のUI/UXを設計・実装・試験・運用へ引き継ぐ | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 要件最終確認前、設計開始時 | 要件承認、技術選定、画面レビュー、試験結果の変更時 | In Review |
| 要件・受入条件 最終レビュー兼承認依頼書 | [requirements-final-review.md](development/requirements-review/requirements-final-review.md) | PoC反映、未決定事項、残るリスク、承認対象と承認範囲をIssue #23で確認する | 依頼者、開発担当者、確認担当者 | 要件最終確認時 | 承認結果、対象コミット、残るリスクの変更時 | Approved |

### 基本設計

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| 第三者品質レビュー再レビュー | [basic-design-remediation-re-review.md](development/basic-design/basic-design-remediation-re-review.md) | 11件の対応、確認結果、残る判断を統合して判定する | 依頼者、開発者、設計担当者 | 是正案の統合時 | 基本設計の変更承認時 | Approved |
| 基本設計 第三者レビュー是正の変更承認記録 | [basic-design-remediation-approval.md](development/basic-design/basic-design-remediation-approval.md) | CONF-054の承認対象と後続試験を従来の承認と区別して記録する | 依頼者、開発者、設計担当者、テスト担当者 | 是正後の変更承認時 | 承認対象または後続条件の変更時 | Approved |
| C-02・M-01・M-06 履歴削除と復旧の是正案 | [retention-backup-remediation.md](development/basic-design/retention-backup-remediation.md) | 詳細履歴削除、確定実績、バックアップ世代を整合させる | 依頼者、開発者、設計担当者、運用担当者 | 第三者品質レビュー是正時 | 依頼者回答、方式採用、再レビュー時 | Draft |
| 基本設計計画書 | [basic-design-plan.md](development/basic-design/basic-design-plan.md) | 基本設計の成果物、対象、依存関係、追跡方法、承認順序を定める | 依頼者、設計担当者、開発担当者、テスト担当者 | 基本設計開始時 | 設計分割、依存関係、承認ゲートの変更時 | Approved |
| 基本設計 第三者レビュー是正の確認依頼書 | [basic-design-remediation-confirmation-request.md](development/basic-design/basic-design-remediation-confirmation-request.md) | 指摘への業務回答と再レビュー条件を依頼者へ確認する | 依頼者、開発者、設計担当者 | 第三者品質レビュー是正時 | 依頼者回答、方式判断、再レビュー時 | Draft |
| 基本設計 第三者レビュー指摘への依頼者回答記録 | [basic-design-remediation-client-response.md](development/basic-design/basic-design-remediation-client-response.md) | CONF-049～CONF-054の回答、設計への反映、残る判断を追跡する | 依頼者、開発者、設計担当者、テスト担当者 | 第三者品質レビュー是正時 | 要件・設計・受入条件の反映と再レビュー時 | Approved |
| システム構成・環境分離設計 | [system-architecture.md](development/basic-design/system-architecture.md) | PWA、端末保存、Firebase、ファイル、環境、設定、配布の責務と境界を定める | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 構成、環境、接続、外部サービス、配布方式の変更時 | Approved |
| 論理データモデル・データフロー・ライフサイクル設計 | [logical-data-model.md](development/basic-design/logical-data-model.md) | 公演シリーズと独立した公演を定める。座席、購入者名、座席表示名、チケット準備を含む業務データの意味、関係、正本、生成・共有・出力・削除経路を扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | データ項目、関係、配布範囲、保存・削除方針の変更時 | Approved |
| オフライン同期・競合設計 | [offline-sync-conflict-design.md](development/basic-design/offline-sync-conflict-design.md) | 端末先行保存、差分同期、再送、冪等性、状態導出を定める。公演前編集の明示保存、版競合、読取り再利用、公演・端末ごとの同期分離、紙照合、締めの境界を扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 同期、競合、編集保存、紙照合、締め境界、外部サービス交換方式の変更時 | Approved |
| 認証・役割・権限設計 | [authentication-authorization-design.md](development/basic-design/authentication-authorization-design.md) | 初期主担当Google UID、UID・公演単位の役割、複数端末と追加端末関連付け、1回限りの招待、公演限定スタッフの短期パスワード、端末単位の事前準備・オフライン許可、4役割、セッション、端末停止・廃止、隔離送信、Security Rulesへ渡す権限境界を定める | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 認証方式、役割、権限、端末、セッション、外部サービス交換方式の変更時 | Approved |
| セキュリティ・プライバシー設計 | [security-privacy-design.md](development/basic-design/security-privacy-design.md) | 信頼境界、Security Rules、App Check、公開画面のFirestore非接続を定める。1回限りリンク、端末暗号化と鍵、Web保護を扱う。秘密情報・ログ、公開物、依存関係、インシデント対応も扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 脅威、認可、暗号化、鍵、外部サービス、公開・依存ゲートの変更時 | Approved |
| 画面・画面遷移・操作見本設計 | [screen-flow-wireframe-design.md](development/basic-design/screen-flow-wireframe-design.md) | 公演準備と当日運用の画面を定める。座席キャンバス、下書き保存・確定、未保存変更の離脱確認、端末・終了処理の情報構造を扱う。主要操作見本と非技術的なエラー案内も定める | 依頼者、画面設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 業務フロー、画面、権限、状態、利用者向け文言の変更時 | Approved |
| Excel・QR・PDF・CSV・帳票設計 | [file-output-report-design.md](development/basic-design/file-output-report-design.md) | 名簿取込、QR、電子チケット、PDF・Excelの主要出力、CSVの補助出力、当日運営表、座席表の形式を定める。取得済みデータからの端末内生成、安全な入出力、バックアップ・復旧・移行形式の後続設計境界も扱う | 依頼者、設計担当者、開発担当者、テスト担当者、運用担当者 | 基本設計時 | 入出力項目、形式、権限、印刷条件、安全対策の変更時 | Approved |
| 運用・監視・締め・削除・復旧設計 | [operations-recovery-design.md](development/basic-design/operations-recovery-design.md) | 公演準備、利用量・App Check監視、障害・紙切替、復旧、締め、端末削除、削除希望、暗号化JSONバックアップ、引継ぎを定める | 依頼者、主担当、代理管理者、環境所有者、開発担当者、テスト担当者、運用担当者 | 基本設計時、公演準備時、障害・復旧時 | 運用役割、監視、費用、復旧、削除、外部サービス、引継ぎの変更時 | Approved |
| テスト方針 | [test-strategy.md](development/basic-design/test-strategy.md) | 受入条件39件の試験レベル、環境、架空データ、証跡、判定、PoC証跡との境界を定める | 依頼者、開発者、テスト担当者、運用担当者 | 基本設計時、個別ケース作成時 | 要件、受入条件、試験環境、判定方法の変更時 | Approved |
| 基本設計一式レビュー・承認依頼書 | [basic-design-final-review.md](development/basic-design/basic-design-final-review.md) | BD-01～BD-09の整合、操作見本、Firebase交換境界、未決定事項、承認条件を一式で確認する | 依頼者、開発者、設計担当者、テスト担当者、運用担当者 | BD-10の一括レビュー時 | 指摘、依頼者回答、ADR、承認対象コミットの変更時 | In Review |
| 第三者資産・依存関係の候補台帳 | [third-party-dependency-candidates.md](development/basic-design/third-party-dependency-candidates.md) | PoC由来の候補とTBD-011の採用前確認事項を記録する | 開発者、設計担当者、レビュー担当者 | BD-10と依存採用前 | 候補、版、権利、安全性、費用の確認時 | Approved |
| 基本設計 第三者品質レビュー記録 | [basic-design-independent-review.md](development/basic-design/basic-design-independent-review.md) | 要件を基準とする独立レビューの指摘、未決事項、詳細設計への移行判定を記録する | 開発者、設計担当者、依頼者 | 基本設計の再レビュー時 | 指摘回答、是正方針の決定、再レビュー時 | Draft |

### UIモック

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| UIモック確認記録 | [ui-mock-review.md](development/ui-mock/ui-mock-review.md) | 主要画面の操作確認手順、初期結果、依頼者確認事項と実装後試験への引継ぎを記録する | 依頼者、開発者、設計担当者 | UIモック工程 | 操作確認結果と設計への反映時 | In Review |
| UIモック依頼者回答 | [ui-mock-client-response.md](development/ui-mock/ui-mock-client-response.md) | モックの指摘と追加回答CONF-060～074を記録する | 依頼者、開発者、設計担当者、テスト担当者 | UIモック工程、詳細設計 | 依頼者回答の伝達時 | Approved |
| UIモック変更の本番引継ぎ台帳 | [ui-mock-production-handoff.md](development/ui-mock/ui-mock-production-handoff.md) | FB-01～33の採用内容、モック有無、設計・受入条件の追補、本番試験と作業Issueを対応付ける | 開発者、設計担当者、テスト担当者、依頼者 | UIモック承認後から本番受入まで | 設計・実装・試験の進捗変更時 | Approved |
| 静的UIモック充実の確認記録 | [ui-mock-static-review.md](development/ui-mock/ui-mock-static-review.md) | 座席編集、個別既読、席替え、端末管理、カメラの操作確認と本番残作業を記録する | 開発者、設計担当者、テスト担当者 | UIモック工程 | 静的モックの対応・確認結果変更時 | In Review |
| QR受付中断・誤更新への対策設計 | [qr-reception-recovery-review.md](development/ui-mock/qr-reception-recovery-review.md) | 受付保存中の中断からの復帰と二重計上防止について、既存設計と追加試験条件を整理する | 依頼者、開発者、設計担当者、テスト担当者 | UIモック工程 | #92の確認・設計反映時 | Approved |

### 詳細設計

詳細設計は機能のまとまりごとに作成し、主要テストケースを同じ文書へ記載する。CONF-074の端末下書き保存・共有・確定とT37～41は、既存の会場席詳細設計に集約する。業務方針の承認と追加技術設計のIn Reviewを区別する。実装タスクの分割、依存順と進捗は親Issueと子Issueで管理する。ケースが大きくなった場合だけ試験仕様書を分離し、文書案内と追跡IDで対応を維持する。

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| RTDBの正式保存・復旧契約 | [rtdb-storage-contract.md](development/detailed-design/rtdb-storage-contract.md) | 採用した物理形式、現在認可・保持と正式バックアップを定め、未実施試験を引き渡す | 開発者、設計担当者、テスト担当者 | #168の方式採用後 | 形式・認可・復旧条件の変更時 | Approved（PR #228・253・254）。#252追補はApproved（PR #255） |
| お客様情報・対応状況と不参加の詳細設計 | [customer-ticket-detail-design.md](development/detailed-design/customer-ticket-detail-design.md) | MHD-05の共同契約と16ケース、#97の名簿追加と15ケースを定める | 開発者、設計担当者、テスト担当者 | 詳細設計 | データ・権限・業務操作の変更時 | Approved（PR #231・238）。#251追補はApproved（PR #253） |
| スタッフ連絡・重大操作確認の詳細設計 | [staff-notice-confirmation-detail-design.md](development/detailed-design/staff-notice-confirmation-detail-design.md) | #90の本人別未読・重要確認、連絡の版と重大操作一覧、14ケースを定める | 開発者、設計担当者、テスト担当者 | 詳細設計 | 連絡・確認条件の変更時 | Approved（PR #240） |
| QR受付画面・会場表示の詳細設計 | [reception-screen-detail-design.md](development/detailed-design/reception-screen-detail-design.md) | #89の画面状態・戻り先と写真・席表表示、12ケースを定める。保存・排他の詳細は#92 | 開発者、画面設計担当者、テスト担当者 | 詳細設計 | 受付導線・画面状態の変更時 | Approved（PR #241） |
| QR受付の端末保存・中断復帰の詳細設計 | [reception-recovery-detail-design.md](development/detailed-design/reception-recovery-detail-design.md) | #92の一体保存、暗号化とタブ所有権、中断復帰と14ケースを定める | 開発者、設計担当者、テスト担当者 | 詳細設計 | 保存・中断復帰の契約変更時 | Approved（PR #242） |
| 帳票・チケット出力の詳細設計 | [file-output-detail-design.md](development/detailed-design/file-output-detail-design.md) | #235の同一版入力、PDF・xlsxと補助出力、TBD-011への選定手順と14ケースを定める | 開発者、設計担当者、テスト担当者 | 詳細設計 | 入力・出力レイアウトと採用部品の変更時 | Approved（PR #243）。#252追補はApproved（PR #255） |
| 会場席作成・席設定の設計全体照合 | [seat-design-final-review.md](development/detailed-design/seat-design-final-review.md) | #91の共同契約・G91-A～E、DD91-T01～103と画像7ケースの担当を最終照合する | 開発者、設計担当者、テスト担当者 | #91の最終レビュー | 承認・受渡しと開始条件の変更時 | Approved（PR #245） |
| スタッフの役割変更・端末再準備の詳細設計 | [staff-role-change-detail-design.md](development/detailed-design/staff-role-change-detail-design.md) | UID対応・現在認可と端末別準備、DD96-T01～18を定義する | 開発者、実装担当者、テスト担当者 | #96の詳細設計 | 役割・本人対応・試験変更時 | Approved（PR #246） |
| 役割変更の設計照合記録 | [role-change-design-review.md](development/technical-validation/role-change-design-review.md) | 権限表・公式仕様と試験担当の照合範囲を記録する | 開発者、テスト担当者 | #96のレビュー | 照合結果・残条件の変更時 | Approved（PR #246） |
| 臨時管理者の公演・利用者別権限設定 | [temporary-admin-permissions-detail-design.md](development/detailed-design/temporary-admin-permissions-detail-design.md) | 固定9項目・禁止12群、共通版と取消し・端末別準備、製品試験21ケースを定義する | 開発者、実装担当者、テスト担当者 | #98の設計 | 権限・期限・準備条件の変更時 | Approved（PR #247） |
| 臨時管理者の権限設定・設計照合記録 | [temporary-permissions-design-review.md](development/technical-validation/temporary-permissions-design-review.md) | 権限表・設定パターンと試験担当を照合した範囲を記録する | 開発者、テスト担当者 | #98のレビュー | 照合・残条件の変更時 | Approved（PR #247） |
| 席設定計算の実装・試験記録 | [assignment-domain-handoff.md](development/technical-validation/assignment-domain-handoff.md) | #103の6完了条件・60単体と所属是正の照合、後続の保存・画面への契約を記録する | 開発者、実装担当者 | #103の実装 | 実装・試験と承認変更時 | In Review |
| 出力監査・中断復帰の設計照合記録 | [export-audit-recovery-review.md](development/technical-validation/export-audit-recovery-review.md) | #252の事前保存・監査再送と追加12ケース、未検証範囲を照合する | 開発者、設計担当者、実装・試験担当者 | 設計是正 | 状態遷移・認可と回収条件の変更時 | Approved（PR #255） |
| バックアップ集合の設計照合記録 | [backup-set-coverage-review.md](development/technical-validation/backup-set-coverage-review.md) | #250の公演集合・世代交代と追加12ケース、長期蓄積の測定条件を照合する | 開発者、設計担当者、実装・試験担当者 | 設計是正 | 目録・復旧範囲と承認変更時 | Approved（PR #254） |
| Excel所属契約の設計照合記録 | [excel-group-contract-review.md](development/technical-validation/excel-group-contract-review.md) | #251の業務条件・是正と追加12ケース、後続への受渡しを照合する | 開発者、設計担当者、実装・試験担当者 | 設計是正 | 所属契約・承認変更時 | Approved（PR #253） |
| 席ドメインの共通型・計算の単体試験結果 | [seat-domain-unit-test-results.md](development/technical-validation/seat-domain-unit-test-results.md) | #102の実装・61単体と型検査、後続保存・画面への受渡しを記録する | 開発者、実装担当者、テスト担当者 | #102の実装 | 型・計算と試験結果の変更時 | Approved（PR #248） |
| 会場席作成・席設定の詳細設計 | [seat-management-detail-design.md](development/detailed-design/seat-management-detail-design.md) | #91の仕様とデータ契約、主要試験DD91-T01～69を追跡する。検証結果は別記録を参照 | 開発者、設計担当者、テスト担当者 | 詳細設計 | 仕様・試験・承認変更時 | Approved（PR #245） |

### 技術判断（ADR）

[ADR-016：共有下書きの編集状態](development/decisions/ADR-016-shared-draft-editor-state.md)はApproved（案A）。#104の共有保存へ接続する前に、初回採番状態と公演全体の画像・任意の優先設定を欠落なく復元する保存契約を比較する。2026-11-16に開発者が構成形式2を維持する案Aを選択した。

[ADR-017：会場写真の端末内変換](development/decisions/ADR-017-venue-photo-conversion.md)はApproved（機能方針）。#294で写真の入力上限と保存後1MBを分け、PNG／JPEGの選択と拡大確認を定める。[試験結果・実機確認手順](development/technical-validation/photo-conversion-results.md)はApproved（PR #295の範囲）。実画像の画質受入は未了。

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| ADR案内 | [adr-guide.md](development/decisions/adr-guide.md) | 重要な判断の記録方法を定める | 開発担当者 | 重要な判断の発生時 | 運用変更時 | Draft |
| ADR-001 製品基盤と外部サービス | [ADR-001-product-platform.md](development/decisions/ADR-001-product-platform.md) | 製品基盤候補、外部サービス、費用、同期、環境分離を比較し、採用案を提示する | 依頼者、開発担当者、保守担当者 | 技術選定時 | 採用判断、提供条件、要件の変更時 | Approved |
| ADR-002 Firebase上限時の緊急継続方式 | [ADR-002-quota-emergency-response.md](development/decisions/ADR-002-quota-emergency-response.md) | Firebase上限時の紙運用、手動課金、未送信確認、復旧方式を決める | 依頼者、管理者、設計担当者、開発担当者、運用担当者 | 上限時の運用方針決定時 | 料金、権限、紙運用、復旧方式の変更時 | Approved |
| ADR-003 役割別の本人認証プロバイダー | [ADR-003-role-based-auth-providers.md](development/decisions/ADR-003-role-based-auth-providers.md) | ADR-001の全役割メール・パスワード方式を役割別方式へ置換する | 依頼者、開発者、設計担当者、運用担当者 | BD-10の整合確認時 | 認証方式、費用、アカウント運用の判断時 | Approved |
| ADR-004 詳細履歴の削除案内と例外締め | [ADR-004-retention-and-exceptional-close.md](development/decisions/ADR-004-retention-and-exceptional-close.md) | C-02・C-04の候補、採用理由、未検証事項を記録する | 依頼者、開発者、設計担当者、運用担当者 | 基本設計の是正時 | 再レビューと方式判断時 | Accepted |
| ADR-005 端末別認証主体と本人認証の結合 | [ADR-005-device-principal-authorization.md](development/decisions/ADR-005-device-principal-authorization.md) | C-01の認可方式と検証条件を記録する | 依頼者、開発者、設計担当者 | 基本設計の是正時 | 認可方式または残存リスクの変更時 | Accepted |
| ADR-006 会場画像のFirestore保存方式 | [ADR-006-firestore-image-storage.md](development/decisions/ADR-006-firestore-image-storage.md) | 旧Firestore画像方式の比較履歴。初期保存方式は122-AでRTDBへ置換し、1MB・最大5枚を維持する | 依頼者、開発者、設計担当者 | 基本設計の是正時 | 保存方式・実画像条件の変更時 | Superseded（初期保存方式） |
| ADR-007 席編集の確定境界 | [ADR-007-seat-edit-commit-boundary.md](development/decisions/ADR-007-seat-edit-commit-boundary.md) | 3案を比較し122-AでRTDBを初期設計採用。詳細契約と未実施試験を分離する | 開発者、設計担当者、テスト担当者 | 詳細設計 | 成立性検証・採否決定時 | Accepted（PR #228） |
| ADR-008 購入者IDと確認用項目の保存単位 | [ADR-008-customer-identity-and-check-items.md](development/decisions/ADR-008-customer-identity-and-check-items.md) | 正本の分離とID参照、#97の登録経路を比較する | 開発者、設計担当者、テスト担当者 | #229・97の共同設計 | 保存・取得の境界変更時 | Accepted（PR #231・238）。#251追補はApproved（PR #253） |
| ADR-009 連絡の内容版と本人別状態の分離 | [ADR-009-notice-user-version-state.md](development/decisions/ADR-009-notice-user-version-state.md) | 本人・内容版ごとの状態を、端末内だけ・全員共通の案と比較する | 開発者、設計担当者、テスト担当者 | #90の設計 | 読了・重要確認の保存境界変更時 | Accepted（PR #240） |
| ADR-010 受付の一体保存とタブ所有権 | [ADR-010-reception-atomic-storage-and-ownership.md](development/decisions/ADR-010-reception-atomic-storage-and-ownership.md) | 一体保存・Web Locksと、順次保存・時刻による所有権の案を比較する | 開発者、設計担当者、テスト担当者 | #92の設計 | 保存・排他方式の判断時 | Accepted（PR #242） |
| ADR-011 役割変更時のGoogle本人確認とUID維持 | [ADR-011-role-change-identity-binding.md](development/decisions/ADR-011-role-change-identity-binding.md) | 同じ本人UIDへの明示連携と変更案専用の本人確認を比較・提案する | 開発者、設計担当者、テスト担当者 | #96の設計 | 本人対応・役割変更方式の判断時 | Accepted（PR #246） |
| ADR-012 臨時管理者の固定権限一覧と共通役割版 | [ADR-012-temporary-admin-permission-profiles.md](development/decisions/ADR-012-temporary-admin-permission-profiles.md) | 固定一覧と自由な設定、共通版と独立版を比較する | 開発者、設計担当者、テスト担当者 | #98の設計 | 権限設定方式の判断時 | Accepted（PR #247） |
| ADR-013 未削除公演を保護するバックアップ集合 | [ADR-013-backup-set-coverage.md](development/decisions/ADR-013-backup-set-coverage.md) | 公演別ファイルと独立目録、全公演一括出力と最新公演限定を比較する | 開発者、設計担当者、実装・試験担当者 | #250の設計是正 | 世代交代・復旧範囲の判断時 | Accepted（PR #254） |
| ADR-014 出力監査の事前保存と中断復帰 | [ADR-014-export-audit-recovery.md](development/decisions/ADR-014-export-audit-recovery.md) | 端末での事前保存とサーバー事前記録、事後保存だけの案を比較する | 開発者、設計担当者、実装・試験担当者 | #252の設計是正 | 出力監査・再開方式の判断時 | Accepted（PR #255） |

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

## 実装中の認可基盤

案Aによる会場構成の共有保存は[共有保存・別端末復元の実装・試験記録](development/technical-validation/shared-seat-draft-results.md)（Approved、PR #293の範囲）を参照する。通常SDKでの保存・照会と全画像の一体取込みを#292で確認し、実認証画面・共有ボタンと確定保存の残条件を親#104・105へ渡す。

会場画像の通常SDK保存基盤と、ローカル評価画面の画像操作は[会場画像の保存・表示　実装・試験記録](development/technical-validation/venue-image-results.md)（Approved、PR #287・295の範囲）を参照する。#244・105・104の確認済み範囲と残条件を分けて記録している。

[本人・端末認可基盤の実装・試験記録](development/technical-validation/authorization-foundation-results.md)に、#110のローカル確認と後続の結合条件を記録する。状態はIn Review。実機の認証寿命と初期主担当の実環境割当は未確認である。

[公演保存基盤の実装・試験記録](development/technical-validation/performance-foundation-results.md)に、#111段階Aの受付状態の計算とRTDB接続に必要な残条件を記録する。

[受付優先の差分同期設計](development/detailed-design/reception-live-sync-design.md)に、#271の業務回答と設計・受入の変更を記録する。状態はApproved。

[席編集の端末保存の実装・試験記録](development/technical-validation/seat-local-storage-results.md)に、#104-Aの保存境界と#105-Aへの受渡しを記録する。状態はApproved。

[席編集の理由条件と簡易操作履歴の変更](development/detailed-design/seat-edit-reason-operation-history-change.md)は、#283・#284の業務回答と後続の取得・表示条件をまとめる。開発者と実装担当者が参照し、理由条件・履歴対象または開始条件の変更時に更新する。業務回答はApproved、確定保存と履歴閲覧の技術追補はIn Review。

[ADR-015：公演日のサーバー判定に使う暦の登録](development/decisions/ADR-015-performance-calendar-authority.md)は、#111・#104・#283の保存側が使う日付境界の登録責任を扱う。2026-11-15に案Aを選択し、登録責任はApproved。初期設定と直接API試験の実装結果は公演保存基盤の記録で確認する。
