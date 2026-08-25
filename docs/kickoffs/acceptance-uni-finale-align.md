# 驗收凍結——債 C：三份「大學季收束」定義對齊（2026-08-25）

背景：careerScreen.js TODO(uni-finale) 覆審 LOW（08-25）——接大二前，
「大學賽季收束」的判定散在三處且互不相認：
- `careerScreen.js` renderCareer 的 `uniSeasonDone`（league 全有結果，手抄一份）
- `careerScreen.js` `liveSeasonOngoing` 大學分支（同語意再抄一份）
- `careerState.js` `careerStage` 對大學 schema 恆回 `'national'`——屆間推進
  （advanceSeason）目前靠這個**意外死鎖**擋住大學，大二卷升 `CHAPTER_SEASONS`
  後就會變成「聯賽打完也推不動」的卡死
（`chapterCompleted` 是**年限封頂**、`events.js uniLeaguePlayed` 是**進度計數**、
`uniTable` 是**名次表**——語意不同，明確排除在本卷分母之外，不動。）

方案：`careerState.js` 新增單一事實來源 `seasonConcluded(career)`——
schema 偵測（`round==='league'` 只在 uniSchedule 產生，events.js:643 既有不變式）：
有 league 項→全部有結果＝收束；無→高中判準 `careerStage ∈ {eliminated, champion}`。
消費端全部接它；`advanceSeason` 對大學 schema 改成**顯式拒絕**（含 TODO(uni-year2)
指路），取代意外死鎖。**行為逐值不變的重構**，不動任何玩法數值。

## 驗收條件（凍結，改動須依 02 §2.1）

- **C1 單一實作**：「league 全有結果＝收束」的判斷式在 `src/` 只剩
  `careerState.js seasonConcluded` 一份。機械判定：
  `grep -rn "every" src/ | grep "league"` 只命中 careerState.js（events.js 的
  uniLeaguePlayed 用 filter+length 計數、uniTable 名次表不含收束式，不在此列）。
- **C2 三消費端接同一顆**：`liveSeasonOngoing`、renderCareer `uniSeasonDone`、
  `careerState.advanceSeason` 守衛均呼叫 `seasonConcluded`（grep 呼叫點證明）。
- **C3 行為逐值不變**：既有全套測試綠（改前基準＝1684，不得少）；
  `node tools/sim-hash-probe.mjs` 與 `tools/sim-hash-baseline.json` 同基準逐值不動。
- **C4 大學推進顯式拒絕**：新增測試——大學賽程且 league **全打完**的 career 呼叫
  `careerState.advanceSeason` 回原 career（=== 同一參考或逐值同）；此測試在
  **改前的程式碼上也要跑一次**（改前靠死鎖、改後靠顯式守衛，兩版都必須綠——
  這條釘的是不變式，防大二卷接線前誤放行）。
- **C5 鑑別力**：`seasonConcluded` 新增測試至少涵蓋：
  (a) 高中奪冠→true、止步→true、進行中→false；
  (b) 大學 league 全有結果→true、缺一場→false；
  (c) 大學章但 league 空（school 解不開的舊存檔）→false（安全回退＝進行中，
  與 E5 現行為一致）。
  壞版自證：把 seasonConcluded 大學分支暫改恆 true，(b) 缺一場與 (c) 必須變紅
  （驗完還原，紀錄輸出）。
