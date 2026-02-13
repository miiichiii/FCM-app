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
