# 静的UIモックのGitHub Pages公開手順

| 項目 | 内容 |
|---|---|
| 状態 | In Review |
| 読者・目的 | 開発者が、製品環境と分離した操作モックを公開・更新する |
| 前提 | 架空データのみ。製品のFirebase Hosting配備とは別の工程 |
| 更新日・関連 | 2026-11-17、[#298](https://github.com/EU0207/concert-reception-system/issues/298) |

## 結論と現在の状態

2026-11-17の確認時点ではリポジトリはPrivate、Pagesは未設定。今回のPRはREADMEの整理と配信構成の準備を行う。公開済みとは扱わない。

公開予定URLは [https://eu0207.github.io/concert-reception-system/](https://eu0207.github.io/concert-reception-system/)。カスタムドメインは使用しない。

## 配信するもの

[配信ワークフロー](../../.github/workflows/deploy-mock-pages.yml)は、次の4ファイルだけを成果物の直下へコピーする。

| 元ファイル | 配信先 |
|---|---|
| `mock/index.html` | `/index.html` |
| `mock/styles.css` | `/styles.css` |
| `mock/app.js` | `/app.js` |
| `mock/scenarios.js` | `/scenarios.js` |

相対URLを使う既存モックのため、リポジトリ名を含むURLでも動作する。製品アプリのビルド、Firebase設定、文書と試験サーバーは配信しない。新規パッケージや有料サービスは追加しない。

GitHub Actionsで配信対象だけを組み立てる方式を使う。ブランチのルートや `docs/` を公開元にすると不要なファイルまで公開対象となるため、採用しない。製品全体のCIは別Issue #259で扱う。

## 公開前の確認

[BD-05-09の公開前ゲート](basic-design/security-privacy-design.md#bd-05-09-リポジトリpr公開物のゲート)を適用する。

- 現在のファイルだけでなく、過去のコミットと公開されるブランチを確認する。
- Issue・PRの本文とコメントを確認する。添付物や外部リンクの内容は本文と別に確認する。
- Actionsの履歴・ログ、Releaseと成果物を確認する。
- 実在する利用者情報と秘密情報を含めない。公開用モックに本番設定を追加しない。
- 第三者資産のライセンスを確認する。公開ライセンスの新規採用は今回の変更に含めない。

既知の文字列パターンが検出されないことだけでは、秘密情報や個人情報がない保証にはならない。本文内のリンク先、画像、添付ファイルは人による確認を残す。

**開発者が確認してください**

- PRのREADMEと公開前検査結果を確認する。公開対象はモックだけでなくリポジトリ全体である。
- Git履歴・Issue・PRの公開を了承する。公開後に取得されたコピーやforkは非公開へ戻しても回収できない。

**決めてください**（判断主体：開発者）

- このリポジトリをPublicへ変更するか。確認後にPublicへ変更し、モックをPages配信する案を推奨する。未確認の添付物などが残る場合はPrivateを維持し、確認後に実施する。

**依頼者に確認してください**

- なし。開発者が公開権を持つという現在の説明を前提とし、実データや依頼者環境は公開しない。

## 初回公開

1. 対象PRを確認してmainへ統合する。非公開リポジトリではワークフローの配信ジョブは実行しない。
2. 公開前確認を終え、開発者の判断でリポジトリのSettingsからVisibilityをPublicへ変更する。
3. Settings → Pages → Build and deploymentでSourceを **GitHub Actions** にする。`github-pages` 環境の配備対象はmainに限定する。
4. Actions → **Deploy UI mock to GitHub Pages** → Run workflowで **main** を選ぶ。
5. シナリオ試験、成果物のアップロード、Pages配備の成功を確認する。
6. 未ログインのブラウザーで公開URLを開き、PC・スマートフォン幅でREADMEの3操作を確認する。再読み込みで初期化されることも確認する。
7. 外部Firebaseや認証への通信が発生しないことを確認する。READMEの「公開準備中」を「公開中」へ変更し、「現時点では利用できない」という記述を取り除く。

GitHub FreeではPublicリポジトリのPagesを使用する。Privateのまま利用するためのプラン変更や支払方法登録は行わない。

## 更新と停止

- mainでモックの実行ファイルまたはワークフローを変更すると再配信する。手動配信もmainだけを許可する。
- READMEや設計文書だけの変更では再配信しない。配信前にはモックの既存回帰試験を実行する。
- 非公開への戻しや障害時はPagesの公開状態も再取得する。必要に応じてSettings → Pagesから公開を停止し、公開URLで停止を確認する。リポジトリのコピーが回収できるとは扱わない。

## READMEの更新条件

| 変化 | 更新箇所 |
|---|---|
| PRの統合・主要機能の完了 | 開発状況の更新日、状態と残作業。IssueのCloseだけで製品全体を完成扱いしない |
| デモの公開・停止・URL変更 | デモの公開状態、リンクと注意書き |
| 技術の正式採用・変更 | 技術構成と対応するADRへのリンク |
| 製品完成と実機操作動画の公開 | 実機操作動画欄に、架空データのYouTube動画リンクを追加 |

## 今回の準備段階の確認結果

2026-11-17に実施。公開URLでの確認とActions上の配備は未実施。

| 確認範囲 | 結果と限界 |
|---|---|
| モックの既存回帰試験 | 24件合格 |
| Pagesと同じURL構成でのブラウザー確認 | EdgeでPC幅1,440px・スマートフォン幅390pxを確認。会場例の切替、席設定画面への移動、QRの初回受付から「次へ」と再読み込みによる初期化が成功。画面エラーと外部通信なし。実スマートフォンの確認ではない |
| 更新したMarkdownの相対リンク | READMEの階層・資料案内の見直し後、152件の参照先が存在することを確認 |
| READMEのGitHub Markdown描画 | 大見出し7個・小見出し11個と表8個のHTML化を確認。Mermaidの実際の図表示はPRで確認する |
| Git履歴のファイル版 | ローカルの全参照から6,067個のblobを検査。GitHubトークン、Google APIキー、AWSアクセスキー、秘密鍵とサービスアカウントの既知パターンの検出なし。禁止ディレクトリと代表的な秘密ファイル名の検出なし |
| GitHub本文 | Issue・PR合計298件、会話コメント93件、レビューコメント0件を取得。トークン・秘密鍵の代表パターン、私用メモ参照と個人目的の代表語の検出なし。全ての秘密情報形式や個人情報を判定する検査ではない |
| PRレビュー・添付物 | PR194件のレビュー本文は0件。Issue・PR本文のMarkdown画像とGitHub添付物URLの代表記法は検出なし。任意の外部リンク先や会話コメント内の添付物の実体確認は含まない |
| 公開される生成物 | Actions実行0件、Actions成果物0件、Release0件 |
| 配信対象 | HTMLの参照先は残り3ファイルで完結。4ファイルに外部URL、通信・カメラと永続保存APIの代表記法がないことを確認 |

検査時点以降の追加内容は、公開直前に差分を再確認する。高エントロピー値を含む網羅的な秘密情報検査と人による意味の確認は、既知パターン検査の結果で代用しない。

## 参考資料

- [GitHub Pagesの公開元設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [リポジトリ公開範囲の変更と影響](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
