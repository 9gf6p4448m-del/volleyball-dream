# 職業章批 2 驗收凍結（2026-08-26）——入章接線

依據＝`pro-chapter-kickoff.md` 批 2。零 sim/ 檔改動。

- **B1 enterPro RMW**：store 層單一 RMW——名冊（企業名冊封存，比照既有章節封存慣例）＋
  球權/信任（corpRank 加成表）＋賽程（buildProSchedule）＋屆數＋章節，**同一次寫齊**，
  不留「已是職業章、賽程還空」的中間態；`corpFinaleSettled` 守衛（未結算拒絕）；冪等
  （已入章再呼叫不覆寫）；寫入失敗誠實回報不假成功（企業章批 4 HIGH 教訓）。
- **B2 收尾卡入口**：企業章 `seasonConcluded && corpFinaleSettled` 才顯示
  「▶ 前往下一個舞台」；首次進入且結算失敗→擋下明示（uni-finale 批 2 MEDIUM 教訓），
  不靜默照播。
- **B3 挖角/測試會演出**：球團來談卡（2–3 張，文案屬提案）→ 邀約集合
  （proOffersFor(corpRank)）內自選 → 入隊。dialogPlay 的 line 一律 {speaker,text}
  物件（探針卷抓過批 4 出廠 bug）；wiring 測試斷言**字出現在對的容器**
  （對話泡泡 vs 卡片），不只斷言字有出現。
- **B4 多表 fallback 鏈一次補齊**（企業章教訓：當時漏 6 處等覆審逐批抓）：
  動手前先 `grep` 數出「三表 fallback」在 repo 的**全部**入口（分母 N 寫進回報），
  逐一補第四表 proTeamById——已知至少：`matchOpponentDef`、`opponentName`、
  存檔驗證（讀回驗證的表清單）、`ourSchoolKit`/kit 消費端、章節標籤/色塊。
  沒補的入口要在回報寫明為什麼不需要。
- **B5 治具**：`?devpro=<隊id>` 走正式鏈（devSeed 範式：真實 enter* 鏈、僅戰績合成），
  非法隊 id 誠實拒絕。
- **B6 全套**：npm test 全綠（基準 1811＋新增）；sim-hash＝`34772c06e02243fd` 不動；
  零 src/sim/ 檔改動。
- **B7 改前紅**：行為級（B1 守衛/冪等、B2 入口 gating、B3 容器斷言）在改前 worktree 紅；
  import 旁枝紅以壞版自證補行為級（大二卷慣例）。
