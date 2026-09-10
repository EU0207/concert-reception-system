# ADR案内

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | 重要な技術上・設計上の判断を一貫した方法で記録する |
| 主な読者 | 開発担当者、将来の保守担当者 |
| 作成・更新時期 | 重要な判断の発生時、ADR運用の変更時 |
| 記載する内容 | ADRの作成対象、番号、状態、一覧、運用方法 |
| 記載しない内容 | 日常的な小さな実装判断、私用の調査メモ |
| 関連文書 | [ADRテンプレート](ADR-000-template.md) |
| 関連Issue | [#1](https://github.com/EU0207/concert-reception-system/issues/1) |
| 状態 | Draft |
| 承認情報 | 未承認 |

## ADRとは

ADRは、重要な判断について「なぜその方法を選んだか」を将来確認できるようにする文書です。単に採用結果を書くのではなく、背景、候補、比較、影響を記録します。

## ADRを作成する判断

- システム全体の構成
- フレームワークやデータベースなど主要技術の採用
- QRコードに保持する情報と保護方法
- 認証、権限、個人情報の管理方法
- ホスティング、バックアップ、監視、CI/CDの方式
- 後から変更するために大きな費用や影響が生じる判断

## ファイル名と番号

`ADR-001-short-title.md` の形式で連番を付けます。タイトル部分は短い英語を使用します。

## 状態

| 状態 | 意味 |
|---|---|
| Proposed | 提案中であり、まだ採用されていない |
| Accepted | 比較と確認を経て採用された |
| Rejected | 検討したが採用されなかった |
| Superseded | 後続のADRによって置き換えられた |

## ADR一覧

| ADR | 判断対象 | 状態 | 関連Issue |
|---|---|---|---|
| [ADR-001](ADR-001-product-platform.md) | 製品基盤、外部サービス、オフライン同期、環境分離 | Accepted | [#25](https://github.com/EU0207/concert-reception-system/issues/25) |
| [ADR-002](ADR-002-quota-emergency-response.md) | Firebase上限時の紙運用・手動課金・復旧方式 | Accepted | [#32](https://github.com/EU0207/concert-reception-system/issues/32) |
