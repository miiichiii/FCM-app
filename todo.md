# FCM-app TODO（作業再開用）

最終更新: 2026-03-23

## 現在の状況
- GitHubにpush済み: https://github.com/miiichiii/FCM-app
- ローカルリポジトリ: /Users/michito/Documents/clawd/FCM-app

## 完了済み
- [x] スライダーデフォルトレンジ FlowJo基準（-1〜+1）に変更
- [x] スライダー50msデバウンス追加
- [x] Canvas上X軸・Y軸ラベル描画
- [x] サイドバーをCompensation / Analysisタブに分割
- [x] FCS 2.0検出エラーメッセージ（日本語）
- [x] 1GBファイルサイズ上限チェック
- [x] test/plotCard.test.js 新規作成（6ケース）
- [x] Compensation(manual)カードをcompタブへ移動
- [x] Plot Compensationセクション追加（X・Y軸スライダー）

## 進行中タスク
- [ ] Critic AI レビュー（造血幹細胞研究者レベル）実施中
  - 目標: FlowJoに金を払わなくていいレベルの評価を得る
  - 最低2往復のfeedback-fix サイクル
  - コンペンセーションスライダーの数学的正確性の検証
  - 最終レポート作成

## 次のステップ（Critic AIフィードバックに基づく修正）
- [ ] Round 1 フィードバック対応
- [ ] Round 2 フィードバック対応（満足するまで繰り返し）
- [ ] 最終レポートをoutputsフォルダに保存
- [ ] 全修正をGitHubにpush

## コンペンセーション数学的検証チェックリスト
- [ ] 補正式: corrected[to] = raw[to] - Σ(coeff[from→to] × raw[from]) の正しさ
- [ ] スライダー値とFlowJo %compensation値の対応確認
  - FlowJo: 100% = 係数1.0（Xチャンネルの100%をYから引く）
  - FCM-app: coeff=1.0 → 同等か？
- [ ] 負の補正値の挙動確認
- [ ] 行列の向き（from/to）がFlowJo慣習と一致しているか

## 将来的な改善候補（Critic AIが指摘した場合）
- ポリゴンゲート実装
- FCS 2.0 変換ツール
- 統計表示（%親集団、MFI等）
- エクスポート機能強化
