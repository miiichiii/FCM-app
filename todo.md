# FCM-app TODO（論文公開レベル到達用）

最終更新: 2026-04-03

## 現在の判定
- [x] `git pull --ff-only origin main` 実施
- [x] テスト通過確認 (`npm test`: 31/31 PASS)
- [x] compensation の preview / full apply / single-stain review を同じ行列変換に統一
- [x] critic/builder 反復で P0/P1 を解消
  - 参照: `criticAI_round1_report.md` → `builderAI_round1_revise.md` → `criticAI_round2_report.md` → `builderAI_round2_revise.md` → `criticAI_round3_report.md`
- [x] 造血幹細胞研究の manuscript workflow で使える最低ライン
  - 条件1: exact table は `Apply-to-all` 後の Gate Stats を使う
  - 条件2: nonlinear scale は publication-sensitive な用途では `Arcsinh` を優先する
  - 条件3: session JSON を保存して追試情報を残す
  - 未了: 他ソフトとのゴールデン比較まではまだ未実施

## 完了済み（今回の loop で解消）
- [x] singular / near-singular compensation 行列の防御
- [x] 解析セッション保存
  - 元データ署名、comp matrix、plots、gates、single-stain 割当を JSON export/import
- [x] exact gate 統計パネル
  - count / %parent / %total
- [x] gate 統計 export
  - CSV
- [x] single-stain restore を `sha256` 優先に修正

## 次に詰める項目
- [ ] 他ソフトとのゴールデン比較
  - 最低比較対象: FlowJo か FACSDiva
  - 比較項目: compensation 後座標、gate pass count、%parent、MFI
- [ ] symlog 近似の扱いをさらに明確化
  - true logicle を実装するか、UI から外すか、arcsinh 専用運用に寄せるか決める
- [ ] gate fluorescence summary
  - median / geometric mean fluorescence / MFI
- [ ] single-stain QC 指標を追加
  - stained channel の分離度
  - 補償前後の傾きまたは残差
  - 異常な逆方向補償や過補償の警告
- [ ] single-stain review の UI 方針整理
  - Y 側の逆方向スライダーを本当に露出するか再検討
  - reviewer が読んで誤解しない説明文にする
- [ ] gate の unit / integration test 拡充
  - scale 切替後の gate 往復
  - 親子 gate の統計一貫性
  - full apply 後も同じ gate 結果になること

## P2: 研究現場での置換性向上
- [ ] polygon gate 実装
- [ ] FCS export あるいは compensated matrix 適用済みデータ出力
- [ ] FCS 2.0 変換支援
- [ ] batch 処理 / 複数サンプル比較
- [ ] figure 出力テンプレート（軸、注記、gate名の統一）

## 検証チェックリスト
- [ ] compensation 数学の仕様書を更新
  - 現在は単純減算ではなく、spill matrix からの全体変換として説明する
- [ ] 旧 `CRITIC_REVIEW.md` を legacy 扱いにし、round report へ参照を切り替える
- [ ] 実データ 3 系統以上で手動 QA
  - 単染色コントロール
  - 骨髄/末梢血の多色 panel
  - 負値を多く含む補償きつめの panel
