# GD91-22: 本人セッション発行と保存時の認可

状態：In Review。読者：開発者、設計担当者、テスト担当者。
Issue #101の隔離検証。[詳細設計](../../docs/development/detailed-design/seat-management-detail-design.md#gd91-22-本人セッション発行と保存時の認可)に結果・残作業を集約する。本番Rulesとして使用しない。

## 実行

PowerShell 7、既存Node.js 24・Java 21とPOC-004のFirebase CLIを使う。追加依存はない。9191・8181・9150・4401・4501番ポートを使用する。

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'concert-gd91-22-config'
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_TELEMETRY = '1'
node poc/POC-004/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config poc/GD91-22/firebase.json --project demo-concert-seat-gd91-22 --only auth,firestore "node poc/GD91-22/tests/emulator.mjs"
```

本人Authが端末セッションを発行し、端末Authが座席表を保存する。EmulatorのGoogle本人は架空資格で模擬する。実Googleログインと2段階認証の確認ではない。端末登録・役割付与と業務参照の版は管理経路で投入するが、セッション証跡は通常の本人要求で作成する。

81シナリオのうちV30・46・81は検査幅の比較。認可追加後の4セル片は評価上限で拒否され、3セル片で初期保存を限定確認する。片幅と12時間の証跡期限は試験値であり、製品上限・本番期限を変更しない。証跡発行の要求数と初期構成の保存費用は分ける。

業務参照と席IDの照合、全業務の版発行と全編集、差替え・回収は未完了。端末承認・準備とアカウント失効、高影響操作の再認証と公演締めを含む正式認可全体も未完了。SDK・端末保存と実機、QR有効性検証は別対象とする。countReadyは隔離モデルの選択状態であり、業務確定の実装完了ではない。
