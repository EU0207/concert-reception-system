# 開発文書の案内

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | 開発文書を工程ごとに探せるようにする |
| 主な読者 | 開発担当者、設計担当者、確認担当者 |
| 関連文書 | [ドキュメント案内](../document-guide.md) |
| 関連Issue | [#99](https://github.com/EU0207/concert-reception-system/issues/99) |
| 状態 | Draft |
| 承認情報 | 未承認 |

## フォルダ構成

| 場所 | 主な内容 | 最初に読む文書 |
|---|---|---|
| このフォルダ直下 | 全工程で参照する計画、用語、追跡表 | [開発計画書](project-plan.md) |
| [技術検証](technical-validation/) | 技術調査、PoCの計画・手順・結果 | [技術検証計画書](technical-validation/technical-validation-plan.md) |
| [要件確認](requirements-review/) | 要件の最終レビューと設計への引継ぎ | [要件・受入条件の最終レビュー](requirements-review/requirements-final-review.md) |
| [基本設計](basic-design/) | 設計書、テスト方針、レビュー・是正記録 | [基本設計計画書](basic-design/basic-design-plan.md) |
| [UIモック](ui-mock/) | モックの確認結果と本番への引継ぎ | [UIモック変更の本番引継ぎ台帳](ui-mock/ui-mock-production-handoff.md) |
| [詳細設計](detailed-design/) | 機能別のデータ契約、操作と異常時。同じ文書に主要テストケースを含め、実装分割は親Issueで管理 | [会場席作成・席設定の詳細設計](detailed-design/seat-management-detail-design.md) |
| [技術判断](decisions/) | ADRと記録方法 | [ADR案内](decisions/adr-guide.md) |

個々の文書の目的と状態は[ドキュメント案内](../document-guide.md#開発者向け文書)を参照する。
