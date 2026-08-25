# 驗收凍結 — 成人/企業章 批 2（入章接線：RMW＋入口＋選秀自選＋治具）

> 凍結時點：2026-08-25，落點 main@e63472c（批 1 已入）。改動照 02 §2.1 程序。
> 卷宗＝`docs/kickoffs/corporate-chapter-kickoff.md` §三-2。

## A2-1 store.enterCorporate 同一次 RMW
從「大學章、U4 已 settleUniFinale」的存檔呼叫 `enterCorporate(corpId)` 後，**同一份存檔**同時成立
（缺一即紅——半吊子存檔就是這批要防的事故）：
- `career.chapter` ＝ corporate、`enteredAtSeason` ＝ 呼叫前 `season.index`＋1
- `career.corp` ＝ corpId；`career.school` 與 `finaleSettled` 原值保留
- `career.uniRoster` ＝ 呼叫前的 `roster`（大學名冊封存，比照 highSchoolRoster）
- `roster.members` deepEqual `buildCorpMembers(corpId)`；lineup 含玩家
- `player.trust.fromSetter` ＝ `corpStartTrustFor(隊)` ＋ `uniRankTrustBonus(封存第 4 筆 uniRank)`
  （★加成沿用大學屆間同一張表＝提案，試玩可改；`floorShare` 原值不得被洗掉★）
- `season.index` ＋1；`season.schedule` ＝ 7 場全 `round==='corp'`；`results`/`events` 清空

## A2-2 守衛與冪等
- `finaleSettled` 不為 true（含大學章年中、高中章存檔）→ 回 false、存檔逐位元不動。
- 已在企業章再呼叫（換另一個 corpId）→ 回 false、`career.corp` 不被覆寫。
- 壞 corpId（查無此隊）→ 回 false、存檔不動。

## A2-3 生涯頁入口（fake DOM，走真 UI 路徑）
- finaleSettled 的大學存檔：renderCareer 後存在「前往下一個舞台」按鈕。
- U4 打完但**未**謝幕結算的存檔：不得出現該按鈕（謝幕先於下一章）。

## A2-4 邀約集合的值從哪來（招募替代路徑卷教訓：不得把判準當參數餵）
- 選秀→自選畫面列出的隊集合，必須源自**封存第 4 筆的 uniRank**（真實路徑）：
  測試造「U4 拿第 1」與「U4 拿第 9」兩份存檔，斷言前者列 8 隊、後者列 3 隊，
  且不得透過直接傳 rank 參數繞過存檔讀取。

## A2-5 devcorp 治具走正式鏈
- `?devcorp=<corpId>`：最終存檔 chapter＝corporate、`career.corp`＝指定隊、
  schedule 7 場 corp、`career.seasons` ≥ 4 筆且第 4 筆含 uniRank（＝真的走完
  enterUniversity→逐年 advanceSeason→settleUniFinale→enterCorporate 的正式鏈，
  僅各年戰績為治具合成——比照 devuni 慣例並在註解明寫）。
- 壞 corpId → 治具不動存檔（安全 no-op）。

## A2-6 全套與基準
- `npm test` 全綠、只增不減；sim-hash `34772c06e02243fd` 不動。

## 改前紅
- 新測試在 e63472c worktree 上紅；至少一條行為級壞版自證：拿掉 finaleSettled 守衛
  的版本 → A2-2 第一條紅。
