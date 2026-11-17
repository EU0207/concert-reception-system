# 開発状況

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者・目的 | 開発者・評価者が、READMEで要約した内容の詳細と根拠を確認する |
| 更新日・関連 | 2026-11-17、[#298](https://github.com/EU0207/concert-reception-system/issues/298) |

## 現在の開発フェーズ

**製品の実装と、実装済み部品の結合・テストを進めています。** 要件定義と予定した設計は承認済みですが、製品全体のテストと受入はこれからです。本番利用はできません。

更新日：2026年11月17日。mainへの統合状況を基準とし、レビュー中の変更は区別しています。

## 工程別の進捗

| 工程 | 状況 | 成果・残作業 |
|---|---|---|
| 要件定義 | 承認済み | 要件定義書と受入条件書を作成 |
| 基本設計 | 承認済み | システム構成、画面と運用方式を設計 |
| UIモック | 作成・確認済み | 架空データで操作確認し、結果を[引継ぎ台帳](development/ui-mock/ui-mock-production-handoff.md)へ記録 |
| 詳細設計 | 予定した設計は承認済み | 実装中に生じた変更・追補は個別に管理 |
| 実装・単体テスト | 進行中 | 共通計算と保存基盤から順次実装・検証 |
| 結合・システムテスト | 部品間の結合テストは一部実施 | 製品全体の結合・システム試験は未実施 |
| 受入テスト | 未実施 | 完成版の運用検証と依頼者による最終判定が残る |

## 機能別の実装状況

| 範囲 | 状況 | 確認できる成果・残作業 |
|---|---|---|
| 座席・配置の共通計算 | 実装済み | [座席計算](development/technical-validation/seat-domain-unit-test-results.md)と[配置計算](development/technical-validation/assignment-domain-handoff.md)の単体試験 |
| 共通画面・PWA・座席編集 | 実装途中 | ローカルで会場席を編集可能。製品全体との結合と実機確認が残る（[#258](https://github.com/EU0207/concert-reception-system/issues/258)、[#105](https://github.com/EU0207/concert-reception-system/issues/105)） |
| 端末保存・会場画像 | 一部実装済み | 暗号化した[下書き保存・復元](development/technical-validation/seat-local-storage-results.md)、[画像の追加・回転・拡大表示](development/technical-validation/venue-image-results.md)。確定保存との結合などが残る |
| 認可・共有保存 | 基盤実装済み | 本人・端末認可と[共有保存・別端末復元](development/technical-validation/shared-seat-draft-results.md)をローカルのFirebaseエミュレーターで検証。実認証画面・業務操作との結合が残る |
| 本人認証画面 | レビュー中 | ログイン・メール確認・再認証を実装した[PR #297](https://github.com/EU0207/concert-reception-system/pull/297)。main未統合 |
| QR受付・同期・帳票・運用画面 | 未完了 | 製品としての機能実装と機能間の結合が残る |

## テストの実施状況

**単体テストや部品間の結合テストは、実装と並行して行っています。** 部品の試験合格を、製品全体の合格とは扱いません。

| テストの範囲 | 現在の状況 | 記録・計画 |
|---|---|---|
| 業務計算の単体テスト | 座席計算・配置計算の実装範囲で実施済み | [座席計算](development/technical-validation/seat-domain-unit-test-results.md)・[配置計算](development/technical-validation/assignment-domain-handoff.md) |
| 実装済み画面のブラウザーテスト | 座席編集・画像操作などで実施済み。実スマートフォンの確認とは区別 | [会場画像の試験記録](development/technical-validation/venue-image-results.md) |
| 保存・認可部品の結合テスト | ローカルのFirebaseエミュレーターで一部実施済み | [共有保存・別端末復元](development/technical-validation/shared-seat-draft-results.md) |
| 製品全体の結合・システムテスト | 未実施 | [試験Issue #265](https://github.com/EU0207/concert-reception-system/issues/265) |
| 完成版の運用・受入テスト | 未実施 | [無料運用検証 #220](https://github.com/EU0207/concert-reception-system/issues/220)・[最終受入判定 #266](https://github.com/EU0207/concert-reception-system/issues/266) |

現在の作業は[未完了のIssue一覧](https://github.com/EU0207/concert-reception-system/issues?q=is%3Aissue%20is%3Aopen)、要件との対応は[トレーサビリティ表](development/traceability-matrix.md)で追跡できます。

## 実機操作動画

**未公開です。** 製品の完成後、架空データを使った実機操作動画をYouTubeへ掲載し、ここにリンクを追加する予定です。
