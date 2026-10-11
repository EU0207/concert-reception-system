# 開発計画書

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | 開発工程、成果物、進捗管理、承認方法を定める |
| 主な読者 | 依頼者、開発担当者 |
| 作成・更新時期 | プロジェクト開始時、計画変更時 |
| 記載する内容 | 工程、成果物、管理方法、承認ゲート、変更管理 |
| 記載しない内容 | 個別機能の仕様、未決定の技術構成 |
| 関連文書 | [ドキュメント案内](../document-guide.md)、[技術検証計画書](technical-validation/technical-validation-plan.md)、[ADR案内](decisions/adr-guide.md) |
| 関連Issue | [#1](https://github.com/EU0207/concert-reception-system/issues/1)、[#5](https://github.com/EU0207/concert-reception-system/issues/5)、[#6](https://github.com/EU0207/concert-reception-system/issues/6)、[#10](https://github.com/EU0207/concert-reception-system/issues/10)、[#23](https://github.com/EU0207/concert-reception-system/issues/23)、[#25](https://github.com/EU0207/concert-reception-system/issues/25)、[#31](https://github.com/EU0207/concert-reception-system/issues/31) |
| 状態 | Draft |
| 承認情報 | 未承認 |

## 開発工程

初回本番利用は2027年以降を想定する。要件・技術検証・実装・事前練習を完了する前に利用日を確約せず、具体的な公演日が決まった時点で工程を更新する。

| 工程 | 主な目的 | 主な成果物 | 次工程へ進む条件 |
|---|---|---|---|
| 暫定要件整理 | ヒアリング結果から業務要件、制約、対象外、未決定事項を整理し、検証可能な受入条件案を作る | プロジェクト概要書、暫定要件定義書、受入条件案、トレーサビリティ表 | 暫定要件と技術的リスクがレビューされ、調査・PoCの対象と合格基準が承認されている |
| 技術的実現可能性確認 | 要件確定前に、実現方式の影響が大きい条件を調査・PoCで確認する | 調査記録、PoC結果、技術候補比較、ADR案またはADR、要件への影響一覧 | 検証結果、制約、費用、要件への影響が記録され、要件確定へ進めると判断されている |
| 要件確定 | 技術検証結果を反映し、必要な機能、品質、制約、受入条件を合意する | 確定要件定義書、受入条件書、トレーサビリティ表 | 依頼者による承認情報が記録されている |
| 設計 | 要件を満たす構成と方法を決める | ADR、基本設計、セキュリティ設計、権限表、データフロー、主要画面の操作見本、テスト方針 | 依頼者および開発担当者による確認 |
| UIモック | 重要画面を操作し、使いやすさとレスポンシブ表示を本番実装前に確認する | 架空データによる操作可能なUIモック、確認記録、文書への反映結果 | 開発者と依頼者が確認し、必要な設計・受入条件・詳細設計の更新が完了している |
| 実装 | 承認済み設計に基づいて構築する | アプリケーションコード、単体テスト | 実装内容と自動テストの確認 |
| テスト | 要件と受入条件を満たすか確認する | テスト仕様書、テスト結果 | 不具合対応と受入条件の確認 |
| リリース | 利用可能な状態で提供する | リリース記録、運用手順、外部サービス初期設定・引継ぎチェックリスト | 依頼者による最終確認、依頼者の本番環境所有と開発者の一時権限削除の確認 |

## 要件確定後の設計ゲート

- セキュリティは設計工程だけに先送りせず、承認済み要件をセキュリティ設計、実装、試験、運用手順まで追跡する。
- 技術方式を採用する時は、認証、セッション、権限、暗号化、鍵、秘密情報、データ出力・復旧、監視、費用への影響を比較してADRへ記録する。
- 基本設計では、必要な情報と操作順を文字ワイヤーフレームで確認する。画面状態と権限制御も確認し、見た目の詳細は固定しない。
- 基本設計承認後、本番コードの実装前に、重要画面の操作可能なUIモックを作成する。架空データを使用し、Firebase接続、実データ保存、本番の認証・同期は実装しない。
- UIモックでは、画面遷移、入力・選択、確認ダイアログを確認する。PC表示とスマートフォン表示も対象にする。
- 当日画面はスマートフォン優先、準備・管理画面はPC操作も考慮し、実装中にPCと対象3実機で画面単位のレビューを行う。
- 見た目だけの微調整はまとめて管理する。業務手順に影響する変更は、変更Issueを作成する。権限・データ・安全性に影響する変更も、関連文書と試験条件を更新する。

## GitHubでの管理

- 正式な仕様と設計は `docs/` で管理します。
- 作業と議論はGitHub Issueで管理します。
- 進捗はGitHub Projectsで管理します。
- 変更はIssue単位のブランチとPull Requestで確認します。
- 重要な判断はADRで記録します。
- 依頼者への確認・承認が必要な場合は、`**依頼者に確認してください**`の直後に箇条書きで内容、理由、推奨案を記載します。開発者が判断・操作する事項は別欄に分けます。
- Issueは独立した目的と確認可能な完了条件を持つ作業単位で作成し、数分で終わる付随作業は親Issueに含めます。
- 直近で確実な作業だけを具体化し、技術や要件が未決定の遠い工程は推測で細分化しません。
- Web画面では `.github/ISSUE_TEMPLATE/task.yml` の作業フォームを使用し、Project「コンサート受付システム開発」へ自動登録します。
- GitHub CLIでIssueを作成する場合は、`gh issue create --project "コンサート受付システム開発"` のようにProjectを明示します。
- Issue作成後と状態変更時は、`scripts/set-project-status.ps1`を使用してProjectへの登録、状態変更、再取得確認を一度に行います。
- ProjectではIssueを作業カードとして管理し、Pull Requestを重複登録しません。変更状況はIssueの `Linked pull requests` から確認します。

## GitHub Projectsの状態

| 状態 | 移動条件 |
|---|---|
| Todo | 目的と完了条件が記載され、着手可能である |
| 進行中 | 担当者が作業を開始している |
| レビュー | 文書確認、Pull Requestレビュー、または依頼者確認を待っている |
| 完了 | 完了条件を満たし、必要な文書更新と統合が完了している |

Issue作成時は `Todo`、ブランチで作業を始めた時は `進行中`、Pull Requestまたは依頼者確認を待つ時は `レビュー` へ更新します。Pull Requestがmainへ統合され、Issueの完了条件を満たしたことを確認してから `完了` とします。IssueをCloseしただけでProject更新を省略しません。完了報告前にIssue、Pull Request、Projectを再取得し、状態の一致を確認します。

## 工程承認

暫定要件と受入条件案はIssue #5でレビューし、技術調査・PoCの対象、評価方法、合格基準、実施可否を確認します。Issue #6の調査段階と`POC-001`～`POC-005`は個別承認済みです。`POC-001`～`POC-005`は実施と結果確認を完了し、`POC-005`は2026-09-08に検証範囲を合格と判定しました。同日、検証用の端末データ、結果JSON、プレビューチャネル、ローカル生成物の削除と、Firebaseプロジェクトへの削除要求までの終了操作も完了しました。PoCは、外部サービス、依存関係、作成資源、保存データ、削除方法、費用0円である根拠を提示し、依頼者が明示的に承認した後だけ実施します。

Issue #6の完了後、Issue #23とPR #24で要件定義書と受入条件書を確定し、2026-09-09に承認記録を残してmainへ統合しました。Issue #25とPR #26では製品基盤をADR-001として承認・統合しました。Issue #31で基本設計の成果物、依存関係、承認順序を定めました。基本設計の初回承認はPR #67、是正変更の承認はPR #84で記録しました。UIモックの操作確認と本番引継ぎはPR #88でmainへ統合しました。詳細設計と本番実装・試験の残作業は別Issueで継続します。リリース前にも対象工程の承認用Issueを作成します。

### 工程の状態と承認地点

2026-10-12時点の一覧です。承認日とmain統合日は区別します。表のタグは、承認対象と記録が揃ったmainのコミットを指す説明付きタグです。タグ作成日は過去の承認日を変更しません。

| 工程・区分 | 状態・範囲 | 承認日・確認日 | 承認・記録PR | タグ | 根拠 |
|---|---|---|---|---|---|
| 暫定要件整理・初期技術検証 | 初期調査とPOC-001～005の実施・結果確認を終了 | 個別開始承認。最終結果確認は2026-09-08 | #12～#22（段階別） | なし（今回のタグ対象外） | [技術検証計画](technical-validation/technical-validation-plan.md)、本節冒頭 |
| 要件定義・初回承認 | Approved。要件・受入条件と未決定事項・残るリスクの扱い | 2026-09-09 | [#24](https://github.com/EU0207/concert-reception-system/pull/24) | [approval/requirements-initial-2026-09-09](https://github.com/EU0207/concert-reception-system/tree/approval/requirements-initial-2026-09-09) | [最終承認記録](requirements-review/requirements-final-review.md#承認対象) |
| 基本設計・初回承認 | Approved。BD-01～10と主要操作見本。CONF-047と技術ゲートを確認 | 2026-09-24 | [#67](https://github.com/EU0207/concert-reception-system/pull/67) | [approval/basic-design-initial-2026-09-24](https://github.com/EU0207/concert-reception-system/tree/approval/basic-design-initial-2026-09-24) | [BD-10-06](basic-design/basic-design-final-review.md#bd-10-06-回答と承認の記録) |
| 要件・基本設計変更（CONF-048） | 業務回答は承認済み。PR #69時点の変更設計はIn Review | 2026-09-24 | [#69](https://github.com/EU0207/concert-reception-system/pull/69) | なし（設計一式の再承認とは扱わない） | [Issue #68の回答](https://github.com/EU0207/concert-reception-system/issues/68#issuecomment-5814934756)、[基本設計の変更経緯](basic-design/basic-design-final-review.md#結論) |
| 要件・基本設計変更（第三者レビュー是正） | Approved。11件の是正、CONF-049～054、ADR-004～006 | 2026-09-26 | [#84](https://github.com/EU0207/concert-reception-system/pull/84) | [approval/basic-design-change-2026-09-26](https://github.com/EU0207/concert-reception-system/tree/approval/basic-design-change-2026-09-26) | [変更承認記録](basic-design/basic-design-remediation-approval.md#承認の範囲) |
| UIモック・変更承認（CONF-060） | Approved。対象コミットまでのモック変更とFB-01～33の書面上の変更 | 2026-09-28 | [#88](https://github.com/EU0207/concert-reception-system/pull/88) | [approval/ui-mock-change-2026-09-28](https://github.com/EU0207/concert-reception-system/tree/approval/ui-mock-change-2026-09-28) | [包括承認の対象](ui-mock/ui-mock-client-response.md#conf-060-追加修正変更の包括承認) |
| UIモック・操作確認と引継ぎ | #85終了。CONF-061～069の個別回答も記録。版を固定した全体最終承認とは区別 | 2026-10-02に評価伝達、2026-10-03に統合・引継ぎ | [#88](https://github.com/EU0207/concert-reception-system/pull/88) | [milestone/ui-mock-handoff-2026-10-03](https://github.com/EU0207/concert-reception-system/tree/milestone/ui-mock-handoff-2026-10-03) | [確認記録](ui-mock/ui-mock-review.md#結論)、[Issue #85終了記録](https://github.com/EU0207/concert-reception-system/issues/85#issuecomment-5967824344) |
| 詳細設計 | In Review。業務回答の承認と技術方式全体の承認を分離 | 工程全体は未承認 | [#109](https://github.com/EU0207/concert-reception-system/pull/109)以降の設計・検証PR | なし（進行中） | [詳細設計](detailed-design/seat-management-detail-design.md)、[保存成立性の検証](technical-validation/seat-save-validation.md) |
| 本番実装 | 未着手。関連Issueを登録済み | 未承認 | なし | なし | [本番引継ぎ台帳](ui-mock/ui-mock-production-handoff.md#実装受入へのゲート) |
| 本番テスト・リリース | 未実施 | 未承認 | なし | なし | [本番引継ぎ台帳](ui-mock/ui-mock-production-handoff.md#実装受入へのゲート)、[受入条件書](../client/acceptance-criteria.md) |

初回承認タグは当時の基準版です。その後の変更を含む最新版の承認を意味しません。CONF-033～046などの個別回答は各承認記録で追跡し、今回すべてに個別タグを付けるものではありません。UIモック統合後のCONF-070～075は[依頼者回答記録](ui-mock/ui-mock-client-response.md)で追跡し、今回のUIモックタグには含めません。

### タグの対象と見方

| タグの区分 | タグ先のmainコミット | 元の承認対象・根拠 |
|---|---|---|
| 要件定義・初回 | `beab82b925a08b814fe85a35272ba81c8a96c483`（PR #24統合） | 内容`4a0e32b8e450a95fa1ce4560ebce1137e46aeccb`と承認記録`d0a66d5` |
| 基本設計・初回 | `8790f24fbf691fac7eaa2fd550916ca965626ce2`（PR #67統合） | 内容`0f455cc50a2de34310c8507861665063afcf2074`と同PRの承認記録 |
| 基本設計・是正変更 | `944d517349bed595b3c8b05ac497d4b828c87f82`（PR #84統合） | 内容`c52b22706759af92f3a9a9646d6ec39df0616cfc`と承認記録`5d0be99`（CONF-054） |
| UIモック・CONF-060変更 | `67312c9ed7f915cb01e48336e30f8a98c27fa3fd`（PR #88統合） | 内容`52a912ffe162dca606a90dca0b207a131b8aad7e`までと承認・引継ぎ記録`52f4fa3`。後続変更も含む統合コミット全体の承認ではない |
| UIモック・引継ぎ | `67312c9ed7f915cb01e48336e30f8a98c27fa3fd`（PR #88統合） | 2026-10-02の評価伝達とCONF-069までの回答、2026-10-03の#85終了。版を固定した全体最終承認は未確認 |

GitHubでは表のタグから当時のファイルを開けます。手元では次のコマンドで一覧と説明を確認します。`git show`の出力では、タグに記載した承認範囲・根拠と、その後に表示されるコミットを区別して読みます。

```console
git fetch origin --tags
git tag --list 'approval/*' 'milestone/*'
git show --no-patch approval/requirements-initial-2026-09-09
git rev-parse 'approval/requirements-initial-2026-09-09^{commit}'
```

`approval/`は説明に記載した範囲の承認、`milestone/`は作業上の到達点です。タグの作成・pushはReleases作成やWeb公開とは別の操作です。既存タグを移動・上書きせず、将来の変更承認には新しいタグを追加します。

## 技術調査・PoC

- 技術調査・PoCは本番アプリケーションの実装ではなく、要件の実現可能性と制約を確認する限定的な作業とします。
- 検証対象、評価方法、合格基準、成果物の保存・廃棄方法を先に定め、依頼者の明示的な承認後に開始します。
- コードを作成する場合は、本番コードへの流用を前提とせず、架空データだけを使用します。
- 外部サービスや依存関係を追加する前に、必要性、費用、契約、データ取扱いへの影響を説明し、承認を得ます。
- PoC、導入、本番運用で新しいシステム・サービスの初期費用、継続費用、従量費用を発生させず、カード登録、有料契約、自動更新を行いません。無料条件で要件を満たせない場合は不適合として報告します。
- 開発用外部サービスと本番環境を分離し、本番環境は依頼者が所有します。依頼者だけに技術設定を求めず、初回設定手順、画面共有による支援、環境確認、権限削除までを引継ぎに含めます。
- 通常運用は可能な限りアプリの管理画面で完結させ、外部サービスの管理画面は初回設定、使用量・重要通知確認、障害対応等に限定します。
- 結果は成功・不成功を問わず記録し、要件の維持、変更、保留と技術選定の判断材料にします。

## 変更管理

承認済み要件を変更する場合は、影響する設計、テスト、運用、日程を確認し、IssueとPull Requestに記録します。

依頼者の判断が必要な変更は、Issue、Pull Request、対象文書に次の形式で記載します。

**依頼者に確認してください**

- 確認内容、確認が必要な理由、推奨案を記載する。

依頼者確認が不要な場合は`なし`と記載し、開発者のレビュー事項と混在させません。

## CI/CD

要件定義と設計の初期段階では導入しません。

次の条件がそろった時点で、開発担当者はCIの導入を依頼者へ提案し、必要性と構成を評価します。

- 実装技術が決まっている。
- 最初のアプリケーションコードと自動テストが作成されている。
- ビルド、型チェック、Lint、自動テスト等のうち、繰り返し実行する確認コマンドが用意されている。

CIでは、Pull Requestごとに同じ確認を自動実行できることを目的とします。GitHub中心の運用に適合する場合は、GitHub Actionsを第一候補として比較します。

CDは、公開先、リリース方法、権限管理、秘密情報の管理方法が決まった後に検討します。公開先が未決定の間は導入しません。
