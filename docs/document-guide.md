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
| 要件定義書 | [requirements.md](client/requirements.md) | 必要な機能と条件を合意する | 依頼者、開発担当者 | 要件定義工程 | 要件の追加・変更時 | In Review |
| 受入条件書 | [acceptance-criteria.md](client/acceptance-criteria.md) | 完成と判断する条件を合意する | 依頼者、開発担当者 | 要件定義工程 | 要件・確認方法の変更時 | In Review |
| 打合せ記録 | [meeting-notes-guide.md](client/meeting-notes/meeting-notes-guide.md) | 確認事項と合意事項を記録する | 依頼者、開発担当者 | 打合せ実施時 | 記録の訂正時 | Draft |

## 開発者向け文書

| 文書名 | ファイル | 目的 | 主な読者 | 作成時期 | 更新時期 | 状態 |
|---|---|---|---|---|---|---|
| 開発計画書 | [project-plan.md](development/project-plan.md) | 工程、成果物、進捗管理方法を定める | 開発担当者、依頼者 | プロジェクト開始時 | 計画変更時 | Draft |
| 用語集 | [glossary.md](development/glossary.md) | 専門用語の意味を統一する | 全関係者 | 全工程 | 新しい用語の使用時 | Draft |
| トレーサビリティ表 | [traceability-matrix.md](development/traceability-matrix.md) | 質問・要件・受入条件の対応を追跡する | 開発担当者、確認担当者 | 要件定義工程以降 | 関連成果物の変更時 | In Review |
| ADR案内 | [adr-guide.md](development/decisions/adr-guide.md) | 重要な判断の記録方法を定める | 開発担当者 | 重要な判断の発生時 | 運用変更時 | Draft |

## テンプレート

| テンプレート | ファイル | 用途 |
|---|---|---|
| 一般文書 | [document-template.md](templates/document-template.md) | 新しい正式文書の共通書式 |
| 打合せ記録 | [meeting-note-template.md](templates/meeting-note-template.md) | 打合せ内容と合意事項の記録 |
| 要件 | [requirement-template.md](templates/requirement-template.md) | 機能要件・非機能要件の記録 |
| テストケース | [test-case-template.md](templates/test-case-template.md) | 将来のテスト仕様作成時に使用 |

## 読む順番

1. プロジェクト概要書で背景と目的を確認する。
2. 要件定義書で必要な機能と条件を確認する。
3. 受入条件書で完成の判断方法を確認する。
4. 開発計画書で工程と進捗管理方法を確認する。
5. 重要な技術判断が必要になった場合はADRを確認する。
