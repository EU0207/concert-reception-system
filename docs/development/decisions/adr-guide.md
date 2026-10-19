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
| [ADR-003](ADR-003-role-based-auth-providers.md) | 管理者と公演限定スタッフの認証プロバイダー | Accepted | [#44](https://github.com/EU0207/concert-reception-system/issues/44) |
| [ADR-004](ADR-004-retention-and-exceptional-close.md) | 詳細履歴の削除案内と紛失端末がある公演の例外締め | Accepted（CONF-051） | [#70](https://github.com/EU0207/concert-reception-system/issues/70)、[#72](https://github.com/EU0207/concert-reception-system/issues/72) |
| [ADR-005](ADR-005-device-principal-authorization.md) | 端末別認証主体と本人認証の結合 | Accepted（CONF-051） | [#71](https://github.com/EU0207/concert-reception-system/issues/71) |
| [ADR-006](ADR-006-firestore-image-storage.md) | 会場画像のFirestore固定枠・1画像1文書保存 | Superseded（初期画像方式はADR-007、上限CONF-053を維持） | [#73](https://github.com/EU0207/concert-reception-system/issues/73) |
| [ADR-007](ADR-007-seat-edit-commit-boundary.md) | 席編集の原子的確定、版比較と大量操作の保存候補 | Accepted。122-A・PR #228でRTDBを初期採用 | [#91](https://github.com/EU0207/concert-reception-system/issues/91) |
| [ADR-008](ADR-008-customer-identity-and-check-items.md) | 購入者名のID正本と確認用項目の保存単位、登録への適用 | Accepted（#229・PR #231、#97・PR #238） | [#229](https://github.com/EU0207/concert-reception-system/issues/229)、[#97](https://github.com/EU0207/concert-reception-system/issues/97) |
| [ADR-009](ADR-009-notice-user-version-state.md) | 連絡の内容版と本人別の読了・重要確認 | Accepted（PR #240） | [#90](https://github.com/EU0207/concert-reception-system/issues/90) |
| [ADR-010](ADR-010-reception-atomic-storage-and-ownership.md) | 受付のIndexedDB一体保存とWeb Locksによる所有タブ | Proposed | [#92](https://github.com/EU0207/concert-reception-system/issues/92) |
