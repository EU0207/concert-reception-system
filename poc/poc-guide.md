# 技術検証（PoC）の案内

このフォルダには、技術の実現可能性や設計上の不明点を確認したコードと記録を保存しています。**製品コードは [src/](../src/)、製品試験は [tests/](../tests/) にあります。**

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者・目的 | 開発者・評価者が、検証の目的と設計判断の根拠を探す |
| 更新日・関連 | 2026-11-18、[#300](https://github.com/EU0207/concert-reception-system/issues/300) |

## 最初に読む資料

| 確認する内容 | 参照先 |
|---|---|
| 現在の保存仕様 | [RTDBの正式保存・復旧契約](../docs/development/detailed-design/rtdb-storage-contract.md) |
| 保存方式を選んだ理由 | [ADR-007](../docs/development/decisions/ADR-007-seat-edit-commit-boundary.md) |
| 座席保存方式の比較と検証の経緯 | [座席保存の技術検証記録](../docs/development/technical-validation/seat-save-validation.md) |
| 人数・通信量と無料運用の評価 | [容量・無料運用の検証記録](../docs/development/technical-validation/seat-capacity-validation.md) |
| コードを目的から探す | **[目的別の全検証索引](catalog.md)** |

## フォルダの区分

163個の検証フォルダを、次の2種類に分けて案内しています。フォルダ名は既存の文書・スクリプトから参照されるため維持しています。

| 区分 | 内容 | 参照先 |
|---|---|---|
| `POC-001`〜`POC-006`（6件） | 初期の実現可能性と基本設計レビューの限定確認 | [初期PoCの一覧](#初期pocの一覧) |
| `GD91-*`（157件） | 詳細設計中の保存方式・容量と復旧境界の比較検証 | [目的別索引](catalog.md#詳細設計中の検証) |

### 初期PoCの一覧

| ID | 確認したテーマ | コード・手順 | 結果と限界 |
|---|---|---|---|
| POC-001 | 完全オフライン受付と復旧後の統合 | [検証案内](POC-001/README.md) | [実施結果](../docs/development/technical-validation/poc-001-result.md) |
| POC-002 | 受付性能・同期と通信量 | [検証案内](POC-002/README.md) | [実施結果](../docs/development/technical-validation/poc-002-result.md) |
| POC-003 | 実機QR読取りと電子チケット | [検証案内](POC-003/README.md) | [実施結果](../docs/development/technical-validation/poc-003-result.md) |
| POC-004 | 個別認証・役割制御と暗号化・削除 | [検証案内](POC-004/README.md) | [実施結果](../docs/development/technical-validation/poc-004-result.md) |
| POC-005 | 会場席・画像のオフライン表示 | [検証案内](POC-005/README.md) | [実施結果](../docs/development/technical-validation/poc-005-result.md) |
| POC-006 | 端末ごとの拒否と画像保存の比較 | [検証案内](POC-006/README.md) | [実施結果](../docs/development/technical-validation/poc-006-result.md) |

### 詳細設計中の代表例

| テーマ | コード・条件・記録 |
|---|---|
| 本人認可・公演状態と保存処理の結合 | [GD91-60](GD91-60/README.md) |
| FirestoreからRTDBを比較する際の最小認可確認 | [GD91-82](GD91-82/README.md) |
| 通常業務の通信量と無料運用予算 | [GD91-121](GD91-121/README.md) |
| 削除後の訂正を含む実績復旧の限定モデル | [GD91-163](GD91-163/README.md) |

他の検証も[全件索引](catalog.md)から参照できます。各検証の合否や残条件は、個別の案内文書と正式な検証記録で確認してください。

## 読み方と適用範囲

- 過去の候補にはFirestore方式も含みます。検証時点の方式と、現在の採用仕様を区別してください。
- PoCの合格は、製品の受入合格や無料運用の保証を意味しません。人数・入力・環境など、確認した条件の範囲で評価します。
- 過去の移行検証が存在することを、製品の互換要件とは扱いません。現在の要件と採用判断を優先します。
- `artifacts/` は各検証の測定・試験結果です。結果の解釈と未確認事項は、対応するREADME・検証記録と合わせて確認します。

## 再実行する場合

2026-11-18の[公開前検査](../docs/development/publication-review.md#依存関係)で、旧PoCの固定依存にHigh・Criticalの既知脆弱性を確認した。依存と実行環境への対応を確認するまで、既存手順のまま再実行しない。検証記録の参照と、実行環境の安全性は区別する。

各案内文書の前提とコマンドを確認してください。外部接続や環境変更を含む検証があります。過去の試行の承認を、新しい試行への承認として扱わず、必要な範囲と影響を確認します。

この整理では既存コード・成果物を変更しておらず、追加の技術検証も実施していません。
