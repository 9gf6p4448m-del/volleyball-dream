# 職業章批 1 驗收凍結（2026-08-26）——純函式與資料層（零 UI）

依據＝`pro-chapter-kickoff.md` 批 1。零 sim/ 檔改動。

- **A1 章節**：`CHAPTER.PRO` 存在；`enterPro` 純函式冪等（已入章再呼叫回原值不覆寫）；
  `CHAPTER_SEASONS.pro＝1`；`currentTeamName` 職業分支回職業隊名。
- **A2 企業收束**：`settleCorpFinale`＋`corpFinaleSettled`——企業季未打完拒絕；
  封存筆含 **corpRank**（不得用 uniRank 鍵名——批 3 覆審地雷）；冪等；
  非企業章拒絕（守衛判準逐字同章節末年守衛先例）。
- **A3 隊伍表**：`proTeams.js` 8 隊，欄位同構 corporations.js（kit/tier/style/level/
  attrBias/roleBias/trustBias/heights/squad/ace/ai/scoutRead）；scoutRead 全隊非零且
  只取 {0.85, 0.55, 0.25} 三檔；王勝翔＝最強隊階某隊 ace（同季挖角入職業，拍板題 3）。
- **A4 名冊**：`buildProMembers` 走 level+attrBias+roleBias 座標系（範本 buildCorpMembers）；
  入章信任加成表對 corpRank **單調不減且非空**。
- **A5 賽程**：`proSchedule.js` 8 隊單循環 bo3、round 標記 `'pro'`、勝點 3/2/1/0；
  proTable 名次表；**季後賽**：循環前四→四強單淘汰 bo3 的 bracket 產生器（純函式，
  給名次表輸入產出對戰組）。
- **A6 挖角集合**：`proOffersFor(corpRank)` 單調（名次越好集合不縮水）＋全名次非空。
- **A7 守衛**：高中版 `advanceSeason` 遇 `round==='pro'` no-op（比照 'league'/'corp'）。
- **A8 全套**：npm test 全綠（基準 1784＋新增）；sim-hash＝`34772c06e02243fd` 不動；
  `git diff --stat` 無 src/sim/ 檔。
- **A9 改前紅**：純新增功能照大二卷慣例——新測在改前 worktree 紅；紅因若是 import
  旁枝（模組不存在），以壞版自證補行為級（拔關鍵行為→對應測試紅）。
