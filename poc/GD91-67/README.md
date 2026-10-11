# GD91-67 通常名簿の配置参照

状態：In Review。読者：開発者、設計担当者、テスト担当者。#166・#93共通の所属と名簿順を、GD91-65と同じ正本へ接続する隔離PoC。架空データとローカルEmulatorだけを使用する。

## データと処理

| 入口 | 保存・検査 |
|---|---|
| `initPlan / initIndex` | 参加索引eligible/currentへ空のrosterを追加し、従来どおり4文書を一体初期化する |
| `registration / rosterAppend` | 管理正本のgroupId・rosterOrderと索引rosterの参照を同じ操作で作る。既存参照を保持し、新規1人だけ追加。通常登録は5書込みのまま |
| 既存の入金・不参加・復帰 | 所属・名簿順を変更しない。不参加は参加予定IDだけを除き、rosterを残す。後の新規登録で名簿順を再利用しない |
| `rosterProjection` | 同じ公演の共通版・参加索引と券保護を照合し、全名簿を計算入力へ変換。不参加も残し、名前・購入者情報は複製しない |
| GD91-66の`allocate` | 通常索引から得た入力で、不参加・発券保護のあるグループ全体を除外する。割当の保存は行わない |

rosterは管理正本から通常保存時に検証して作る参照索引であり、別の編集入口を持たない。groupIdは任意所属の内部ID、未所属はnull。購入者IDや表示名で統合しない。追加順は0から始め、取込時は元の名簿順に追加する。並替え・所属変更の業務操作と既存形式の移行は未接続であり、入金操作へ混ぜて許可しない。

固定状態と取消し履歴はこの索引へ追加しない。後続で同じ版・確定履歴へ結合する。旧形式の索引を空の名簿として読み替えない。

## 実行

PowerShell 7を使用する。依存追加・本番Firebaseへの接続はない。

```powershell
node poc/GD91-67/generate.mjs
node poc/GD91-67/tests/budgets.mjs
$env:CI='1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY='1'
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) 'poc/POC-004/node_modules/.cache/gd91-67-config'
$env:GD91_FRAGMENT_WIDTH='2'
Remove-Item Env:GD91_CASE -ErrorAction SilentlyContinue
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-67/firebase.json --project demo-concert-seat-gd91-60 --only auth,firestore 'node poc/GD91-67/tests/emulator.mjs && node poc/GD91-67/tests/regression.mjs'
```

## 証拠と限界

- 新12件は[名簿結果](artifacts/roster-summary.json)。登録5件の部分集合30通りを拒否。500人は通常登録・順序と所属参照の生成であり、500席の保存ではない。
- 旧GD91-65の20件・64の24件・63の32件を、同じRulesで再実行する。ケース本体は維持し、入力生成だけ新形式へ合わせる。[初期化](artifacts/initial-regression.json)・[不参加](artifacts/branches-regression.json)・[券](artifacts/lifecycle-regression.json)の結果を参照する。
- 参照予算は登録20・入金17のまま。新検査で外部文書参照を追加せず、認可等36関数の本文を維持する。式評価数・余裕と請求量は未測定。索引のJSONバイト数はFirestoreの保存容量の実測ではない。
- [初回記録](artifacts/first-attempt.json)と失敗実行の前後ハッシュを保持する。不正入力を注入した後にREST要求を再生成し、変更前の正常要求を拒否試験へ使わない。
- 役割・端末とcontrol、構成入力headは前提投入。初期化・名簿と構成証明・公開は通常要求。4席・単一区画の回帰と、構成前の500人登録を区別する。
- REST・Auth/Firestore Emulatorによる自動結合試験。共有下書き・SDKとIndexedDB、画面・実機は未接続。グループ固定・配置の一体保存と専用編集、受付配布は残る。

判定と残条件は[合同検証記録](../../docs/development/technical-validation/seat-business-integration-validation.md#今回の判定とissueの残条件)、契約と主要試験は[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#自動配置固定の計算と保存への引継ぎgd91-66)を参照する。方式全体の採用と本番開始は含まない。
