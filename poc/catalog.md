# PoC・詳細設計検証の目的別索引

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者・目的 | 開発者・評価者が検証の目的からコード・記録を探す |
| 更新日・関連 | 2026-11-18、[#300](https://github.com/EU0207/concert-reception-system/issues/300) |

[PoCの入口](README.md)で代表例と現在の採用方式を確認してから、本索引で詳細を探す。分類は閲覧のための案内であり、採用・承認・完了状態を示さない。

現存する163フォルダ（初期PoC 6件、GD91検証157件）を対象とする。IDの欠番は埋めず、実在するフォルダだけを掲載する。

## 初期PoC

| ID | 検証の目的 | 詳細 |
|---|---|---|
| POC-001 | 完全オフライン受付と復旧後の統合 | [README](POC-001/README.md) |
| POC-002 | 受付性能・同期と通信量 | [README](POC-002/README.md) |
| POC-003 | 実機QR読取りと電子チケット | [README](POC-003/README.md) |
| POC-004 | 個別認証・役割制御と暗号化・削除 | [README](POC-004/README.md) |
| POC-005 | 会場席・画像のオフライン表示 | [README](POC-005/README.md) |
| POC-006 | 端末ごとの拒否と画像保存の比較 | [README](POC-006/README.md) |

## 詳細設計中の検証

保存方式の比較と設計上の境界を確認した記録である。過去の候補と現在の仕様は、[ADR-007](../docs/development/decisions/ADR-007-seat-edit-commit-boundary.md)と[正式保存・復旧契約](../docs/development/detailed-design/rtdb-storage-contract.md)で区別する。

| 分類 | IDの範囲 | 件数 |
|---|---|---|
| [座席構成・採番と保存の基礎](#座席構成採番と保存の基礎) | GD91-01〜24 | 23 |
| [名簿・チケットと公演・端末の認可](#名簿チケットと公演端末の認可) | GD91-26〜42 | 14 |
| [区画分割・構成検査と確定版の発行](#区画分割構成検査と確定版の発行) | GD91-43〜59 | 16 |
| [業務操作・共有下書きと端末復旧の結合](#業務操作共有下書きと端末復旧の結合) | GD91-60〜73 | 14 |
| [取得量・暗号化保存とFirestoreの受信制御](#取得量暗号化保存とfirestoreの受信制御) | GD91-74〜81 | 8 |
| [RTDB候補・受付イベントと共有・締めの境界](#rtdb候補受付イベントと共有締めの境界) | GD91-82〜101 | 20 |
| [正式保存形式・入力上限と無料運用予算](#正式保存形式入力上限と無料運用予算) | GD91-102〜121 | 20 |
| [画像・認可・方式比較と切替候補](#画像認可方式比較と切替候補) | GD91-122〜142 | 21 |
| [移行・削除と実績・台帳の復旧](#移行削除と実績台帳の復旧) | GD91-143〜163 | 21 |

### 座席構成・採番と保存の基礎

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-01 | 席保存の隔離検証 | [README](GD91-01/README.md) |
| GD91-02 | 割当表集約の隔離検証 | [README](GD91-02/README.md) |
| GD91-03 | 個別構成編集の隔離検証 | [README](GD91-03/README.md) |
| GD91-04 | 構成分割の隔離検証 | [README](GD91-04/README.md) |
| GD91-05 | 軽量版と構成差分受信の隔離検証 | [README](GD91-05/README.md) |
| GD91-06 | 席構成と席設定の合同Rules検証 | [README](GD91-06/README.md) |
| GD91-07 | 座席表の初期作成と行列拡張 | [README](GD91-07/README.md) |
| GD91-08 | 座席表全体のスライド計算 | [README](GD91-08/README.md) |
| GD91-09 | 全体スライドの世代保存検証 | [README](GD91-09/README.md) |
| GD91-10 | 区画の移動量によるスライド保存検証 | [README](GD91-10/README.md) |
| GD91-11 | 行列集計の初期保存検証 | [README](GD91-11/README.md) |
| GD91-12 | 初期保存のID重複拒否検証 | [README](GD91-12/README.md) |
| GD91-13 | Seat同居と採番列照合の検証 | [README](GD91-13/README.md) |
| GD91-14 | セル片と席属性片の分離検証 | [README](GD91-14/README.md) |
| GD91-15 | 初期準備の中断破棄と再作成 | [README](GD91-15/README.md) |
| GD91-16 | 列設定の初期作成と採番順の検証 | [README](GD91-16/README.md) |
| GD91-17 | 初期開始の参照余裕の検証 | [README](GD91-17/README.md) |
| GD91-18 | 公開対象を保持する準備・中断の検証 | [README](GD91-18/README.md) |
| GD91-19 | 反映前検査と操作別の保存経路 | [README](GD91-19/README.md) |
| GD91-20 | 共通版と履歴を含むスライド保存境界 | [README](GD91-20/README.md) |
| GD91-21 | 初期完了と共通版の一体発行 | [README](GD91-21/README.md) |
| GD91-22 | 本人セッション発行と保存時の認可 | [README](GD91-22/README.md) |
| GD91-24 | 席ID集合と初回割当表の一体発行 | [README](GD91-24/README.md) |

### 名簿・チケットと公演・端末の認可

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-26 | 来場者の通常登録と500人席割当の接続 | [README](GD91-26/README.md) |
| GD91-28 | 名簿と座席表の両準備順を接続する検証 | [README](GD91-28/README.md) |
| GD91-30 | 券資格の初回生成と発券後保護 | [README](GD91-30/README.md) |
| GD91-31 | 旧資格の無効化と再発行 | [README](GD91-31/README.md) |
| GD91-32 | 不参加・復帰と来場cycleの結合 | [README](GD91-32/README.md) |
| GD91-33 | 券未作成の不参加と席の有無 | [README](GD91-33/README.md) |
| GD91-34 | QRなしの既存券の不参加と席の有無 | [README](GD91-34/README.md) |
| GD91-36 | 本人証跡と役割変更後の端末準備 | [README](GD91-36/README.md) |
| GD91-37 | 公演状態と役割別取得範囲 | [README](GD91-37/README.md) |
| GD91-38 | 準備確認と隔離受領 | [README](GD91-38/README.md) |
| GD91-39 | 配布正本と本人当日履歴 | [README](GD91-39/README.md) |
| GD91-40 | 業務正本との配布接続設計 | [README](GD91-40/README.md) |
| GD91-41 | 正本分割後の登録・表示名変更 | [README](GD91-41/README.md) |
| GD91-42 | 正本分割後の業務保存回帰 | [README](GD91-42/README.md) |

### 区画分割・構成検査と確定版の発行

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-43 | 区画追加・差替えの接続検証 | [README](GD91-43/README.md) |
| GD91-44 | 区画公開境界の一体性検証 | [README](GD91-44/README.md) |
| GD91-45 | 初回構成から完成候補の発行 | [README](GD91-45/README.md) |
| GD91-46 | 複数区画の構成準備と公開 | [README](GD91-46/README.md) |
| GD91-47 | 同じ形の区画差替えと変更席の証明 | [README](GD91-47/README.md) |
| GD91-48 | 形・列設定と手入力席の比較契約 | [README](GD91-48/README.md) |
| GD91-49 | 保存形式の比較候補 | [README](GD91-49/README.md) |
| GD91-50 | 手入力席の一括検査上限 | [README](GD91-50/README.md) |
| GD91-51 | 段階的な小片検査 | [README](GD91-51/README.md) |
| GD91-52 | 小片検査の段階集約 | [README](GD91-52/README.md) |
| GD91-54 | 区画全体のID・採番検査 | [README](GD91-54/README.md) |
| GD91-55 | 列目録と席IDによる新旧比較 | [README](GD91-55/README.md) |
| GD91-56 | 旧全セル目録と非席履歴の検査 | [README](GD91-56/README.md) |
| GD91-57 | 全体検査から完成候補の発行 | [README](GD91-57/README.md) |
| GD91-58 | 完成候補と確定版の一体保存 | [README](GD91-58/README.md) |
| GD91-59 | 構成完成証明の完了確認 | [README](GD91-59/README.md) |

### 業務操作・共有下書きと端末復旧の結合

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-60 | 本人認可・公演状態と完成候補の接続 | [README](GD91-60/README.md) |
| GD91-61 | SDKの競合・エラーと明示再操作 | [README](GD91-61/README.md) |
| GD91-62 | 通常登録と未発券の手動席設定 | [README](GD91-62/README.md) |
| GD91-63 | 席あり券・QRと不参加の合同接続 | [README](GD91-63/README.md) |
| GD91-64 | 券未作成・席なしの不参加と復帰 | [README](GD91-64/README.md) |
| GD91-65 | 通常初期化と初回公開の合同検証 | [README](GD91-65/README.md) |
| GD91-66 | 自動配置とグループ固定の計算検証 | [README](GD91-66/README.md) |
| GD91-67 | 通常名簿の配置参照 | [README](GD91-67/README.md) |
| GD91-68 | 配置と固定状態の合同保存候補 | [README](GD91-68/README.md) |
| GD91-69 | 複数区画・全体スライドと配置保存の合同検証 | [README](GD91-69/README.md) |
| GD91-70 | 行列拡張と移動量の引継ぎ | [README](GD91-70/README.md) |
| GD91-71 | 未割当席の編集と非席からの追加 | [README](GD91-71/README.md) |
| GD91-72 | 受付配布・共有下書きと端末復旧の合同検証 | [README](GD91-72/README.md) |
| GD91-73 | 差分公開と共有版の合同比較 | [README](GD91-73/README.md) |

### 取得量・暗号化保存とFirestoreの受信制御

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-74 | 容量・要求量と回収境界の評価 | [README](GD91-74/README.md) |
| GD91-75 | 公開座席表のまとめ取得と再利用 | [README](GD91-75/README.md) |
| GD91-76 | 取得データの暗号化保存と再起動 | [README](GD91-76/README.md) |
| GD91-77 | 受付イベントの追記と差分取得 | [README](GD91-77/README.md) |
| GD91-78 | SDK購読の収束と費用比較 | [README](GD91-78/README.md) |
| GD91-79 | SDK購読の環境差と失効時の認可 | [README](GD91-79/README.md) |
| GD91-80 | 外部認可確認の接続準備 | [README](GD91-80/README.md) |
| GD91-81 | 過去時点取得の対策候補比較 | [README](GD91-81/README.md) |

### RTDB候補・受付イベントと共有・締めの境界

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-82 | Realtime Databaseの最小認可比較 | [README](GD91-82/README.md) |
| GD91-83 | 分割間の確定境界と再評価計画 | [README](GD91-83/README.md) |
| GD91-84 | RTDB合同検証と期限後受信の比較 | [README](GD91-84/README.md) |
| GD91-85 | 配布経路と期限対策の接続 | [README](GD91-85/README.md) |
| GD91-86 | 席操作・配布と端末再開の接続 | [README](GD91-86/README.md) |
| GD91-87 | 受付追記・差分購読の接続 | [README](GD91-87/README.md) |
| GD91-88 | 登録・券・受付資格の接続 | [README](GD91-88/README.md) |
| GD91-89 | 受付用データの取得と通常発券の合同検証 | [README](GD91-89/README.md) |
| GD91-90 | 一括割当と構成版の照合 | [README](GD91-90/README.md) |
| GD91-91 | 受付用行を含む保存結果の照会 | [README](GD91-91/README.md) |
| GD91-92 | 基準世代と未解決操作の参照保護 | [README](GD91-92/README.md) |
| GD91-93 | 共有下書きの基準世代保持 | [README](GD91-93/README.md) |
| GD91-94 | 共有送信中の候補・基準保持 | [README](GD91-94/README.md) |
| GD91-95 | 共有予約の暗号化再開 | [README](GD91-95/README.md) |
| GD91-96 | 受付キュー・基準世代と人数別合同検証 | [README](GD91-96/README.md) |
| GD91-97 | 一般受付の参照と現行目録の外部比較案 | [README](GD91-97/README.md) |
| GD91-98 | 停止端末の受付記録を隔離受領する候補 | [README](GD91-98/README.md) |
| GD91-99 | 受付の共通連番と照合完了の保持契約 | [README](GD91-99/README.md) |
| GD91-100 | 締め後回収と実績訂正の保全 | [README](GD91-100/README.md) |
| GD91-101 | 最新候補の人数別取得・受付と容量再接続 | [README](GD91-101/README.md) |

### 正式保存形式・入力上限と無料運用予算

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-102 | 正式な座席契約と公開保護の接続 | [README](GD91-102/README.md) |
| GD91-103 | グループ所属・固定と席操作理由の保存接続 | [README](GD91-103/README.md) |
| GD91-104 | 構造編集と余白スライドの保存接続 | [README](GD91-104/README.md) |
| GD91-105 | 区画操作の保存接続 | [README](GD91-105/README.md) |
| GD91-106 | 区画取得の再利用と試行予算 | [README](GD91-106/README.md) |
| GD91-107 | 追加部分の自動採番の保存接続 | [README](GD91-107/README.md) |
| GD91-108 | 正式保存形式の人数別統合容量 | [README](GD91-108/README.md) |
| GD91-109 | 最大入力と保存・再開の境界 | [README](GD91-109/README.md) |
| GD91-110 | 保存・取得の共通容量予算 | [README](GD91-110/README.md) |
| GD91-111 | 全登録端末の締めと初回実績生成 | [README](GD91-111/README.md) |
| GD91-112 | 受付保存の時刻差と送信待ち時間 | [README](GD91-112/README.md) |
| GD91-113 | 観測時刻と受付認可の分離 | [README](GD91-113/README.md) |
| GD91-114 | 保持・回収条件の統合確認 | [README](GD91-114/README.md) |
| GD91-115 | 工程別の通信計測と製品上限 | [README](GD91-115/README.md) |
| GD91-116 | 区画数と採番列の初期上限 | [README](GD91-116/README.md) |
| GD91-117 | 最大構成の結合と追加境界 | [README](GD91-117/README.md) |
| GD91-118 | 席交換の異常系と通常通信 | [README](GD91-118/README.md) |
| GD91-119 | 上限と締めの代表経路を一括確認 | [README](GD91-119/README.md) |
| GD91-120 | 暗号化通信のローカル計測 | [README](GD91-120/README.md) |
| GD91-121 | 通常業務のTLS通信と総無料予算 | [README](GD91-121/README.md) |

### 画像・認可・方式比較と切替候補

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-122 | V4の証拠照合と採用前の残条件 | [README](GD91-122/README.md) |
| GD91-123 | RTDB画像候補と共通認可の隔離検証 | [README](GD91-123/README.md) |
| GD91-124 | 移行形式と切戻しのローカル安全条件 | [README](GD91-124/README.md) |
| GD91-125 | App Check交換の修正案と追加試行ゲート | [README](GD91-125/README.md) |
| GD91-126 | QR資格・確認コードの形式整合 | [README](GD91-126/README.md) |
| GD91-127 | 承認済みQR形式による通常業務と締め | [README](GD91-127/README.md) |
| GD91-128 | 隔離FirestoreからRTDBへの保存と切戻し | [README](GD91-128/README.md) |
| GD91-129 | 暗号化IndexedDB下書きと接続先選択の原子性 | [README](GD91-129/README.md) |
| GD91-130 | 同じブラウザでの実SDKと暗号化下書きの切替 | [README](GD91-130/README.md) |
| GD91-131 | 現行Rulesによる業務回帰 | [README](GD91-131/README.md) |
| GD91-132 | バックアップ用の暗号化JSON形式候補 | [README](GD91-132/README.md) |
| GD91-133 | バックアップ形式候補と旧共有案を含むSDK切替 | [README](GD91-133/README.md) |
| GD91-134 | QR形式修正後の画像込み設計予算 | [README](GD91-134/README.md) |
| GD91-135 | 現行Rulesによる採番回帰 | [README](GD91-135/README.md) |
| GD91-136 | Firestore履歴候補の隔離検証 | [README](GD91-136/README.md) |
| GD91-137 | 3案の長期蓄積と共通条件 | [README](GD91-137/README.md) |
| GD91-138 | Firestore中心候補の一体更新と参照予算 | [README](GD91-138/README.md) |
| GD91-139 | Firestore中心候補の通常登録と6SDK取得 | [README](GD91-139/README.md) |
| GD91-140 | SDK期限境界の最小診断 | [README](GD91-140/README.md) |
| GD91-141 | 短いREST取得と版照合の診断 | [README](GD91-141/README.md) |
| GD91-142 | 現候補の過去時点取得と採用ゲート | [README](GD91-142/README.md) |

### 移行・削除と実績・台帳の復旧

| ID | 検証のテーマ | 詳細 |
|---|---|---|
| GD91-143 | 移行領域の対応範囲と有効化前検査 | [README](GD91-143/README.md) |
| GD91-144 | 旧Bytes画像からRTDB画像への限定変換 | [README](GD91-144/README.md) |
| GD91-145 | 通常締め後のRTDB形式の移行と再承認 | [README](GD91-145/README.md) |
| GD91-146 | 主担当の移行専用Rulesとブラウザー取込 | [README](GD91-146/README.md) |
| GD91-147 | 正式候補パスでの移行Rules | [README](GD91-147/README.md) |
| GD91-148 | 移行後訂正の履歴参照 | [README](GD91-148/README.md) |
| GD91-149 | 移行前後の受付履歴再計算 | [README](GD91-149/README.md) |
| GD91-150 | 削除前の登録端末・受領履歴確認 | [README](GD91-150/README.md) |
| GD91-151 | 採用以外の照合結果の再計算 | [README](GD91-151/README.md) |
| GD91-152 | 受付詳細の明示削除と途中再開 | [README](GD91-152/README.md) |
| GD91-153 | 管理者の認可条件とRules容量 | [README](GD91-153/README.md) |
| GD91-154 | 履歴削除後の実績訂正 | [README](GD91-154/README.md) |
| GD91-155 | 取込から削除後訂正までの接続準備 | [README](GD91-155/README.md) |
| GD91-156 | CLI認証更新と計測の接続 | [README](GD91-156/README.md) |
| GD91-157 | 現在形式の再移行と来歴継承 | [README](GD91-157/README.md) |
| GD91-158 | 現行削除台帳と旧バックアップの照合モデル | [README](GD91-158/README.md) |
| GD91-159 | 同じDB内の削除台帳と正本移管 | [README](GD91-159/README.md) |
| GD91-160 | 別DBと誤った台帳初期化の境界 | [README](GD91-160/README.md) |
| GD91-161 | 台帳に限定した復旧手順 | [README](GD91-161/README.md) |
| GD91-162 | 独立保全台帳と復旧許可の消費 | [README](GD91-162/README.md) |
| GD91-163 | 削除後訂正を含む実績の復旧 | [README](GD91-163/README.md) |

## 更新時の確認

- 検証フォルダを追加したら、既存IDを保ち、この索引と目的の説明を更新する。
- 結果と限界は各README・正式な検証記録へ記載し、本索引に合否の判定を複写しない。
- 新しい検証の実施は、確認事項と終了条件を定める。索引の更新だけを理由に、確認済みの検証を再実行しない。
