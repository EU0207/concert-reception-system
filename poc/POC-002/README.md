# POC-002 受付性能・同期・通信量

## 位置づけ

Issue #6で2026-09-03に明示承認された`POC-002`専用の技術検証である。本番アプリケーションではなく、架空データだけを使用する。対象、合格基準、保存・削除、費用上限は[POC-002開始承認依頼書](../../docs/development/technical-validation/poc-002-approval-request.md)に従う。

## 確認対象

- デコード済み架空QR文字列からIndexedDB保存完了までの通常判定時間500件
- 6つの独立環境による500件全体の処理時間
- 完全オフライン記録の復旧後統合時間と欠落・重複
- オンライン変更30件が他5環境へ届く150標本の共有時間
- 初期500件以後の差分変更数
- 事前取得後にChromium NetLogで観測する環境別外部ソケット通信量

カメラ、QR画像解析、実機固有性能、メール認証、権限制御、暗号化、本番利用は対象外である。

## 前提

- Node.js 24 LTS、npm 12.0.2
- Firestore/AuthエミュレーターにはEclipse Temurin JDK 21 LTS
- POC-001と同じ固定依存関係。新しいパッケージは追加しない
- 外部接続時は、保持中の専用SparkプロジェクトとGit管理外の環境変数を使用する

## コマンド

```powershell
npm install
npm run build
npm test
npm run emulators:test
```

Firebaseエミュレーターでは`demo-concert-reception-poc-002`を使用する。`demo-`プロジェクトはローカル専用であり、実在するFirebase資源へ接続しない。

実Firebase設定値は`.env.local`または実行プロセスの環境変数にだけ設定し、Gitへ保存しない。

## 測定成果物

- `artifacts/raw/latest-measurement.json`：自動試験の生集計。Git管理外
- `artifacts/raw/auth-uids-{runId}.json`：終了時に削除する匿名UID一覧。外部試験時だけ作成、Git管理外
- `artifacts/raw/session-{runId}/`：6プロファイルとNetLog。Git管理外、集計後削除
- `artifacts/poc-002-verification-summary.md`：確認済みの匿名化集計だけをGit管理

NetLogの接続先不明ソケットは、過小評価を避けるため外部通信量へ含める。ループバックと確認できた通信だけを除外する。

## 合格判定

- 通常判定：全500件10秒以内、失敗0。95パーセンタイル2秒以内は目標として別記録
- 500件全体：30分以内
- オンライン共有：150標本すべて10秒以内。95パーセンタイル5秒以内は目標として別記録
- 通信量：各環境20MiB以下
- 差分同期：初期500件後の各変更で全500件を反復取得しない
- 統合：欠落・重複・未表示競合なし

## 終了処理

結果採取後、POC-002専用`runId`のFirestore文書、記録した匿名UID、プロファイル、NetLogを限定削除し、残存0件を確認する。Firebaseプロジェクト本体、Web App、Firestoreデータベース、RulesはPOC-005終了確認まで保持する。

## 実施結果

2026-09-03にローカルエミュレーターと実Firebaseで合格した。実Firebaseでは通常判定500件の最大3.0ミリ秒、オンライン共有150標本の最大273.63ミリ秒、環境別外部通信量の最大23,866 bytesを記録し、全件反復取得がないことを確認した。詳細と測定上の制約は[POC-002実施結果報告書](../../docs/development/technical-validation/poc-002-result.md)を参照する。

実行後、Firestoreの架空イベント530件と親文書、記録した匿名利用者6件、ローカル一時成果物を限定削除し、外部データの残存0件を確認した。検証専用プロジェクト本体は保持している。
