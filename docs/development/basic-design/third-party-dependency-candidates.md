# 第三者資産・依存関係の候補台帳

## この文書について

| 項目 | 内容 |
|---|---|
| 目的 | `TBD-011`の実装開始前確認として、PoCで使った直接依存を候補として把握し、本番採用前に必要な権利・安全性・費用確認を明示する |
| 主な読者 | 開発者、設計担当者、レビュー担当者 |
| 前提 | PoCの依存関係は本番採用済みではない。本書の作成で依存関係を追加しない |
| 関連文書 | [BD-05の依存関係ゲート](security-privacy-design.md#bd-05-10-依存関係と第三者資産)、[BD-10](basic-design-final-review.md)、[基本設計計画書](basic-design-plan.md) |
| 関連Issue | [#44](https://github.com/EU0207/concert-reception-system/issues/44) |
| 関連ID | TBD-011、TBD-012、REQ-NF-019、AC-031、AC-033 |
| 状態 | Approved |
| 確認日 | 2026-09-24 |
| 結論 | 採用予定候補とPoC固定版の非開発用依存について、権利・既知脆弱性・外部送信・0円条件の見込みを確認した。`TBD-011`の実装開始前ゲートは完了。採用版と配信物の確定、依存追加PR、公開前の確認は後続ゲートとする |

## PoC由来の直接依存候補

下表の版は[POC-001](../../../poc/POC-001/package.json)、[POC-003](../../../poc/POC-003/package.json)、[POC-004](../../../poc/POC-004/package.json)、[POC-005](../../../poc/POC-005/package.json)の直接依存から確認したPoC時点の値である。ライセンス欄は各PoCのインストール済み`node_modules`内の`package.json`に記載された識別子であり、ライセンス本文と再配布条件の最終確認ではない。名称と版は実装時の採用案ではない。

| 区分 | 候補とPoC版 | 用途の候補 | 自己申告ライセンス |
|---|---|---|---|
| 配信対象候補 | `firebase@12.18.0` | 認証・Firestore接続 | Apache-2.0 |
| 配信対象候補 | `idb@8.0.3` | IndexedDB操作 | ISC |
| 配信対象候補 | `@zxing/browser@0.2.1`、`@zxing/library@0.23.0` | QR読取り | MIT、Apache-2.0 |
| 配信対象候補 | `jszip@3.10.1` | ZIP出力 | MIT OR GPL-3.0-or-later |
| 配信対象候補 | `pdf-lib@1.17.1` | PDF生成 | MIT |
| 配信対象候補 | `qrcode@1.5.4` | QR生成 | MIT |
| 開発・試験候補 | `typescript@7.0.2`、`vite@8.2.2`、`vite-plugin-pwa@1.3.0` | 型検査、ビルド、PWA | Apache-2.0、MIT、MIT |
| 開発・試験候補 | `@playwright/test@1.62.1`、`vitest@4.1.11` | 自動試験 | Apache-2.0、MIT |
| 開発・試験候補 | `fake-indexeddb@6.2.5`、`firebase-tools@15.28.2`、`@types/qrcode@1.5.6` | 模擬DB、エミュレーター、型定義 | Apache-2.0、MIT、MIT |

2026-09-24に[GitHubの公開アドバイザリーAPI](https://docs.github.com/en/rest/security-advisories/global-advisories)で上表の各直接候補版に影響するGitHub-reviewedのnpmアドバイザリーを照会し、該当0件だった。既知の影響版を使う照会でAPIの絞込みが機能することも確認した。これは直接候補版に対する当日の限定結果であり、推移依存や未掲載の問題がないことを保証しない。[npmの監査手順](https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/)に沿った採用版のロックファイル全体の監査は未実施である。

各PoCのロックファイルには開発・試験用を含めて約1,100件のパッケージ記録がある。直接候補だけの照会では配信される推移依存の安全性を判定できない。実装開始前の見込み確認では、本番候補と開発専用候補を分け、各候補の必要性、ライセンス本文、外部送信と料金を確認する。実際に採用する版とその推移依存は、依存追加PRのロックファイルで監査する。

PoCのインストール済みパッケージでは、`idb`、ZXing、`jszip`、`pdf-lib`、`qrcode`にライセンス本文ファイルがあることを確認した。`jszip@3.10.1`の本文はMITまたはGPLv3を利用者が選べると記載している。`firebase@12.18.0`はインストール済みパッケージ直下にライセンス本文が見当たらないが、[同版の上流ソースのLICENSE](https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.18.0/LICENSE)を確認した。採用時には実際の配信物に必要な本文と表示を含める。

## ライセンス条件の一次判断

2026-09-24に[Apache-2.0原文](https://www.apache.org/licenses/LICENSE-2.0.html)、[ISC原文](https://opensource.org/license/isc)、[MIT原文](https://opensource.org/license/mit)、[GPL-3.0-or-later原文](https://spdx.org/licenses/GPL-3.0-or-later.html)、[JSZip 3.10.1の原文](https://github.com/Stuk/jszip/blob/v3.10.1/LICENSE.markdown)を照合した。下表は候補部品を変更せずに使用し、今回のPWAを配信する場合の一次判断である。ライセンス名だけで個々のパッケージや推移依存の条件を確定しない。

| ライセンス | 今回の利用と配布の見込み | 配布時に残すもの・追加条件 | 作者への個別連絡 |
|---|---|---|---|
| Apache-2.0 | 商用・非商用、改変、再配布が許され、プロジェクト独自コードへ同じライセンスを付ける義務はない | ライセンス全文を受領者へ渡す。元のNOTICEがあれば該当表示を残し、元のファイルを変更した場合は変更を明示する。元の著作権等の表示も条件に従い保持する | 原文上は不要 |
| ISC | 使用、改変、配布が許され、プロジェクト独自コードの公開ライセンス選択を強制しない | 著作権表示と許諾文をコピーに残す | 原文上は不要 |
| MIT | 使用、改変、配布が許され、プロジェクト独自コードの公開ライセンス選択を強制しない | 著作権表示と許諾文をコピーまたは実質的な部分に残す | 原文上は不要 |
| MIT OR GPL-3.0-or-later | JSZip 3.10.1は両条件から選択できる。本システムで採用するならMIT側を選び、MITの表示条件を守る見込み | 採用時の台帳と第三者ライセンス表示に「JSZipはMIT側を選択」と記録する。GPL側は今回の方針では選ばない | MIT側の原文上は不要 |

今回の公開リポジトリには独自の公開ライセンスを付けない方針がある。第三者部品の許諾を守って組み込むことと、プロジェクト独自コードを第三者へ利用許諾することは別である。[GitHubの説明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)でも、リポジトリにライセンスがない場合は独自コードに通常の著作権が適用される。第三者部品の表示がプロジェクト全体の利用許諾と誤解されないよう区別する。

実装時は採用した版と配信される部品を特定し、第三者部品ごとの名称、版、著作権表示、選択したライセンス、許諾文、必要なNOTICEをまとめる。公開リポジトリとFirebase Hostingの配信物の両方で受領者が読める形を用意し、画面からも参照できる設計とする。作者への個別連絡や使用料は、上記ライセンス原文上の一般的な使用・配布条件では要求されない。Firebase等の外部サービスの利用規約と費用はライブラリのライセンスとは別に確認する。現段階で通知文や画面を作成・配信したものとは扱わない。

2026-09-24に開発者は、JSZipを採用する場合にMIT側を選ぶ方針と、第三者ライセンス表示が独自コード全体の公開ライセンスを意味しない説明を確認してOKとした。これは開発者のレビュー結果であり、依頼者の回答ではない。この回答だけで採用版の確定や`TBD-011`の各ゲートの完了を意味しない。

## 実装開始前ゲートの確認結果

2026-09-24に次の候補を本番機能との対応から絞った。版はPoCで検証した固定版であり、採用PRで固定する実際の版を指定したものではない。

| 採用予定候補 | 必要な機能 | 今回の見込み |
|---|---|---|
| `firebase@12.18.0` | Authentication、Cloud Firestore、App Check | 候補に残す。FirebaseのAI、Analytics、Database、Functions、Storage等は現行設計で使わない。ロックファイルに含まれるだけで配信・有効化を決定しない |
| `idb@8.0.3` | IndexedDBの端末内保存 | 候補に残す。Firebase内部の`idb@7.1.1`は別版の推移依存として区別する |
| `@zxing/browser@0.2.1`、`@zxing/library@0.23.0` | カメラのQR読取り | 対で候補に残す。`@zxing/library`はブラウザー層のpeer dependencyでもある |
| `jszip@3.10.1` | 複数チケットのZIP出力 | MIT側を選ぶ条件で候補に残す |
| `pdf-lib@1.17.1` | 端末内PDF生成 | 候補に残す |
| `qrcode@1.5.4` | チケット用QR生成 | 候補に残す |

PoCの開発・試験ツールはブラウザー配信候補から除く。QR、ZIP、PDF、IndexedDBの機能を廃止して部品を減らすことは承認済み要件の変更になるため、この確認では行わない。

5つのPoCロックファイルから、開発専用フラグのない記録を重複版込みで128種類抽出した。これは配信物の構成ではなく、候補版を広めに確認するための集合である。ロックファイルの自己申告ライセンスは、Apache-2.0が54、MITが46、ISCが13、BSD-3-Clauseが10、0BSDが2、複合条件が3種類であり、空欄はなかった。複合条件は次のように扱う。

- `jszip@3.10.1`の`MIT OR GPL-3.0-or-later`は、開発者確認済みのMIT側を選ぶ。
- `@zxing/text-encoding@0.9.0`の`Unlicense OR Apache-2.0`は、配信に含まれる場合はApache-2.0側の条件で確認する。
- `pako@1.0.11`の`MIT AND Zlib`は両方の条件を守る。インストール済みのREADMEは`lib/zlib`をZlib条件とし、当該ソースに表示がある。[Zlib原文](https://spdx.org/licenses/Zlib.html)に従い出所を偽らず、変更したソースを識別し、必要な表示を残す。

[BSD-3-Clause](https://spdx.org/licenses/BSD-3-Clause.html)は著作権・条件・免責の表示と名称による推奨表示の禁止、[0BSD](https://spdx.org/licenses/0BSD.html)は追加の表示保持条件のない利用許諾である。いずれも現在の独自コード非公開ライセンス方針と両立する見込みであり、配信物に実際に含まれる部品の本文・NOTICEは採用時に照合する。

[GitHubの公開アドバイザリーAPI](https://docs.github.com/en/rest/security-advisories/global-advisories)で、上記128種類の`package@version`を25件以下ずつ照会した結果、GitHub-reviewedのnpmアドバイザリーは0件だった。既知の影響版`lodash@4.17.20`を混ぜた照会では6件が返り、複数版の絞込みが機能することを確認した。この結果は2026-09-24時点の掲載済み問題だけを対象とし、未公表の脆弱性や採用時の新しい版を安全と保証しない。

ブラウザー側候補の実装を`fetch`、`XMLHttpRequest`、`sendBeacon`、`WebSocket`の呼出しで静的検索した。`idb`、ZXing、JSZip、pdf-lib、qrcodeに組込みの外部送信処理は見つからず、pdf-libの`fetch`例はコメント内だった。PoCのアプリ側にもこれらの部品から第三者へ送る処理は見つからなかった。これは静的な一次確認であり、採用後のビルド成果物とブラウザーネットワーク記録で再確認する。Firebase SDKは設計したAuthentication、Firestore、App CheckのためにGoogleのサービスへ通信する。GoogleログインとreCAPTCHA評価も必要な外部通信として区別し、Analytics、CDN、未採用の外部APIは加えない。

2026-09-24の[Firebase料金表](https://firebase.google.com/pricing)では、支払方法なしのSparkに通常のAuthentication、Firestore Standard、Hosting、App Checkの無料範囲がある。Firestoreは保存1 GiB、読取り5万件/日、書込み2万件/日、Hosting配信は360 MB/日がSparkの主な上限である。[reCAPTCHAの公式請求条件](https://cloud.google.com/recaptcha/docs/billing-information)では、請求先なしのEssentialsは組織全体で月1万評価まで無料で、超過後の新規評価は失敗する。[App Checkの公式手順](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)では、既定1時間のトークンが約半分の時間で更新される。現行設計は請求先を登録せず、通常操作ごとに評価を強制しない。

[POC-002の限定測定](../technical-validation/poc-002-result.md)では、6環境の架空イベント530件と、環境あたり最大23,866 bytesの外部通信でSpark内に収まった。ただしカメラ、全機能、Hosting、App Check、実公演の月間利用量を測った結果ではない。以上から0円構成で開始できる見込みはあるが、継続運用や対応台数は保証しない。App Checkの組織共通枠、Firestore、Hostingの利用量を開催前・当日に監視し、上限接近時は不要な再取得・再評価を止める。上限で新規オンライン処理が失敗した場合は、承認済みの端末内継続と紙切替へ進み、無断課金しない。

**実装開始前ゲートの判定:** 採用予定候補、権利条件、掲載済み脆弱性、外部通信、無料条件について、現時点で採用を妨げる問題は見つからないため完了とする。実際の版・推移依存・配信物を固定する依存追加PR、および公開前の確認を省略しない。条件変更や新しい問題が見つかった場合はこの判定を見直す。

## #102の開発依存の採用レビュー

2026-10-20、製品の型検査用に`typescript@7.0.2`だけを開発依存として固定した。採用は実装PRのレビュー対象。本番用依存は0件で、Vite・FirebaseとPoCの依存一覧を一括採用しない。TypeScriptはブラウザーへ配信せず、生成される独自コードにコンパイラー本体を含めない。

`pnpm-lock.yaml`は本体1件とOS別の任意依存20件の計21記録を固定する。公式npm配布メタデータを全件照合し、同じ7.0.2・Apache-2.0とinstall／postinstallなしを確認した。Windows x64で使用する2パッケージのLICENSE・NOTICEを確認し、改変せず使用する。NOTICE内の第三者表示を削除しない。他OSは実行未確認。

`pnpm install --frozen-lockfile --ignore-scripts`で再現し、2026-10-20の`pnpm audit --json`は全21記録で既知脆弱性0件。開発依存取得と監査はレジストリーへ接続するが、製品の共通計算はネットワーク通信しない。使用料・有料サービスと課金登録を追加しない。配信物へ開発ツールを含める変更は、別途権利・安全性と公開前ゲートを再確認する。

具体的な単体結果と依存確認の限界は[製品試験記録](../technical-validation/seat-domain-unit-test-results.md)へ記録する。未公表の問題や他OSの動作を保証せず、後続のライブラリ・公開物のゲートは維持する。

## 依存追加PRと公開前に残る確認

1. 実際に採用する直接依存と版を機能ごとに確定し、ロックファイルの推移依存を調べる。PoCの一覧を一括採用しない。
2. 採用版の配布元、ライセンス本文、著作権表示、再配布条件、生成物へ含まれる範囲を再確認する。`jszip`はMIT側の選択と表示を配布物に明記する。
3. 採用時点の既知脆弱性と更新状況を全依存で再照会する。High/Criticalや未解決の問題は採用せず、代替または期限付きの例外判断へ戻す。
4. ビルド成果物とブラウザーネットワーク記録で外部送信先を検証する。Firebase等のサービス料金と無料枠を導入時・公開前・開催前に再確認する。
5. 公開前に第三者表示、秘密情報、環境分離、配信物全体を点検する。

現段階で実際の採用版と配信物は存在しない。上記の実装開始前ゲートを完了としても、依存追加PRと公開前のゲートは未実施である。
