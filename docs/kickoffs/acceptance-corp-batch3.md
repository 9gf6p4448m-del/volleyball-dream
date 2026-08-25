# 驗收凍結 — 成人/企業章 批 3（賽季迴圈：季收束＋名次＋收尾卡＋球衣端到端）

> 凍結時點：2026-08-25，落點 main@ab9c2dc（批 2 含覆審修復已入）。改動照 02 §2.1。
> 卷宗＝`docs/kickoffs/corporate-chapter-kickoff.md` §三-3（含批 2 修補送審兩追蹤項）。

## A3-1 季收束單一定義擴充（seasonConcluded）
- corp 賽程 7/7 全有結果 → true；6/7 → false（比照 league 的「全有結果」判準）。
- 既有行為零改變：高中（careerStage 收束）與大學（league 判準）的既有測試全綠。

## A3-2 賽季迴圈 UI（fake DOM 真路徑，比照 A2-3）
- 企業存檔 7/7 打完：生涯頁顯示聯賽名次（corpTable playerRank，冠軍另有字樣）＋
  「章末收尾卡」入口；點開＝佔位收尾卡（★文案屬提案★「企業元年」＋續約敬請期待），
  出口回生涯頁——**不是死路**。
- 6/7 未打完：照舊落到「▶ 出戰」；名次結算區塊不得出現。

## A3-3 球衣與隊名端到端（批 2 修補送審追蹤項①）
- `careerMatchSetup` 對企業存檔（第 8 參數 corp）回 `kits.A` deepEqual 該公司
  `corporations.js` 的 kit 表值；大學/高中路徑 kits.A 行為不變（既有測試綠）。
- `matchConfig` 的 `teamName` 對企業存檔＝公司名（currentTeamName 第三參數接線）。

## A3-4 大學殘留文案分流（追蹤項②）
- 企業章生涯頁不得出現「回看三年的數據」與「🎓 謝幕」字樣（wiring 斷言 doesNotMatch），
  即使未來 `CHAPTER_SEASONS.corporate` 被調大也不得出現（分流判準綁章節，不綁年限）。
- 大學章兩者照舊出現（對照組，既有測試不紅）。

## A3-5 scoutRead 裁定記檔
- 企業對手沿大學先例**不吃情蒐**（universities.js 同樣無此欄、大學章接戰鬥時未開此題）；
  `corporations.js` 檔頭明寫這是裁定不是漏欄；kickoff §三-3 該行回填「已裁定」。

## A3-6 全套與基準
- `npm test` 全綠、只增不減；sim-hash `34772c06e02243fd` 不動。

## 改前紅
- 新測試在 ab9c2dc worktree 上跑須紅；行為級＝A3-1 的「corp 7/7 → true」在改前版本
  必紅（seasonConcluded 尚不認得 corp）＝真行為紅，非 import 旁枝。
