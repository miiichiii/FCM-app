# CRITIC_REVIEW (Iteration 1)

## 重大バグ（P0）
1. **Apply-to-all（全量適用）非実装**
   - 再現: UI上で補償はプレビューのみ可能。全量適用ボタン/進捗がない。
   - 原因仮説: MVPでpreview pathのみ実装。
   - 修正案: Web Worker実装（チャネル行列×comp適用）+ progress bar + cancel。

## 仕様未達（P1）
1. **1Mイベント向け density mode / scatter警告 未実装**
   - 再現: 点描画中心で高イベント対策が未整備。
   - 修正案: plot modeにdensity追加。1M時はdensityを既定化しscatterは警告表示。

2. **Worst pairs パネル未実装**
   - 再現: 補償後残差傾きのランキング表示がない。
   - 修正案: ペアごとに回帰傾き/相関を計算し上位N表示、クリックで該当ペアを開く。

3. **親子ゲートの明示性不足**
   - 再現: 単一ゲート運用は可能だが階層が明示されない。
   - 修正案: Gate stack（root > gate1）表示、最低1階層対応。

## UX改善（最小）（P2）
1. comp i→j変更時に影響ペアをハイライト
2. Undo一段（誤調整対策）
3. 軸レンジのプリセット（auto / robust quantile）

## 性能
- 現状10kプレビューは良好。
- 今後はWorker化しないと全量適用でUI停止リスクあり。

## 今回スコープ外
- クラウド共有、レポート出力、高度統計。

---

# CRITIC_REVIEW (Single-Stain Compensation Pass)

## 重大バグ（P0）
- なし

## 仕様未達（P1）
- なし

## UX改善（最小）（P2）
1. **ファイル名推定に依存するサンプルは将来の命名揺れに弱い**
   - 再現: `GFP1.fcs`, `CD45.1_APC.fcs`, `dapi.fcs` では正しく推定できたが、命名規則が崩れると手動選択に落ちる。
   - 原因仮説: 推定ロジックはファイル名とチャネル別名の一致ベース。
   - 修正案: 次回は推定済み候補を2件まで表示し、ユーザーが1クリックで切り替えられるようにする。

2. **単染色一覧が増えるとサイドバーで縦に長くなる**
   - 再現: 単染色ファイル数が多いパネルでは、補償スライダーまでの距離が伸びる。
   - 原因仮説: 一覧と手動補償UIを同じパネルに入れている。
   - 修正案: 次回は単染色一覧を折りたたみ、アクティブファイルだけ上部固定表示にする。

## 性能
- 実ファイルで `WT.fcs + 3 single-stain files` を headless browser で確認し、console error は 0。
- レビュー面は preview ベースで描画しており、現在のサンプル数では操作遅延は実用範囲。

## 今回スコープ外
- 単染色からの自動コンペ係数推定
- 命名辞書のユーザー保存

---

# CRITIC_REVIEW (Light Theme + Matrix Pass)

## 重大バグ（P0）
- なし

## 仕様未達（P1）
- なし

## UX改善（最小）（P2）
1. **single-stain slider は広い係数範囲だと微調整がやや難しい**
   - 再現: 現在は `-10 .. 10` のレンジを1本の slider で扱うため、0.01 未満の追い込みは外部 matrix 編集か manual slider の方が安定する。
   - 原因仮説: CSV import/export との整合性を優先し、slider 範囲を広めに固定した。
   - 修正案: 次回は `fine/coarse` 切替か、slider 横に数値入力欄を追加する。

2. **matrix は閲覧中心で、表内直接編集はまだできない**
   - 再現: 現状は slider 操作結果の確認と CSV import/export はできるが、表セルをその場で編集する機能はない。
   - 原因仮説: まずは single-stain review を主操作面に寄せ、matrix は確認用に止めた。
   - 修正案: 次回は active cell だけ inline edit を許可し、manual pair と双方向同期させる。

## 検証
- `npm test` は 15/15 pass。
- headless browser で `WT.fcs + CD45.1_APC.fcs + gr1-PE.fcs + dapi.fcs` を読み込み、以下を確認:
  - テーマ切替が `body[data-theme]` に反映される
  - main sample 読み込み後に plot 2枚が表示される
  - single-stain slider が 8 本表示される
  - slider 変更が manual compensation 値に同期する
  - matrix CSV の export / import が動作する
  - console error は 0
