# 多年職業生涯卷 — 開卷卷宗（2026-08-27）

> ★★ 拍板紀錄（2026-08-27 Sawmah，一輪四題＋補一題＋三小題）★★
>
> 題 1 年限 ＝ **開放式自選退休**：每年季末續約時可選「再戰一年」或「退休」；
>   補題拍板＝**退休謝幕總結卡＋硬上限 10 年**（第 10 年強制謝幕當存檔守衛；
>   後段年份若試玩回報單調，里程碑事件另卷加）。
> 題 2 續約 ＝ **薪水入檔＋簡單選單**：合約卡顯示年薪與年限，數值由名次＋個人
>   表現定檔，存進 career 逐年累積成生涯紀錄（薪水曲線）；選單只有續留/轉隊/退休
>   三路，不做多輪討價還價。
> 題 3 轉隊 ＝ **每年季末可轉**：續約窗給 offer 集合自選（含留隊），公式重用
>   proOffersFor 以本季隊伍名次定檔——「成績→邀約集合自選」第四次重用。
> 題 4 成長 ＝ **新招逐年解鎖、不衰退**：ATTR 封頂 100 即封頂，成長轉向職業技術槽
>   （每年屆間可解 1 招；★具體招式與代價照硬規則 3 屆時逐案拍板，本卷只鋪通道★）。
> 三小題（未反對照建議）＝ 宿敵線維持終身一次（多年只加輕量年度重逢句，新變體另批
>   拍板）；NPC 八隊靜態不換血（uniTurnover 慣例不搬）；賽制沿用 7 場單循環＋四強 bo3。

## 一、現況地基（2026-08-27 盤點，HEAD=181ea94）

職業章＝單年終章，多年化要動的全在 career 層，sim 零改動：

- 年限寫死：`chapter.js:141` CHAPTER_SEASONS.pro=1；`chapterCompleted`（:164-166）
  ＝年限封頂 SSOT，pro 第一年即恆真。
- 季末結算：`careerStore.js:779-808` settleProFinale——守衛鏈含 `chapterCompleted`
  （:784），年限改 10 後第 1–9 年會被它擋死 ⇒ **必須逐季化**（守衛降為
  isPro→!proFinaleSettled→seasonConcluded→proTeamById）。
- `proFinaleSettled` 一次性旗標（:804）⇒ 多年化＝推進下一年時同一 RMW 清掉。
- 推進：`careerStore.js:226-320` advanceSeason 只有高中/大學分支，**無 pro 分支**；
  大學分支（:237-320）＝唯一多年迴圈範本（nextSeed 決定論鏈、封存、schedule 重建、
  trust 跟人）；pro 版不含換血（三小題）。
- 合約：career 裡**零薪水/合約結構**（`career.pro` 只是隊 id 字串）。
- 收尾卡：`careerScreen.js:3413-3451` showProSeasonClosing＝佔位「續約談判・敬請期待」，
  點擊回 renderCareer 無下一步入口。
- 轉隊素材：`proTeams.js:239-244` proOffersFor(rank)＋OFFER_TIERS_BY_RANK 已在；
  現行消費端 `careerStore.js:716` proOffers() 吃 archivedCorpRank——續約窗要吃
  **本季 proRank**，另開入口不覆用（招募替代路徑卷教訓：UI 不得自帶 rank 呼叫）。
- 宿敵線：`proEvents.js:33-64` 同隊變體寫死 matchEntry.id!=='pro-r1'（:39）、敵隊變體
  career.events 一生一次（:53）——多年重跑守衛不變（終身一次），轉隊翻面要驗不重炸。
- 賽程：`proSchedule.js` PRO_ROUNDS=7、growProSchedule 動態長季後賽（:302-351）——
  新一季 buildProSchedule 重建後照常長。
- chapterCompleted 消費點分母（2026-08-27 grep，N=5 執行期）：careerStore 233
  （advanceSeason 擋線，pro 分支要排在它前面或納入其守衛語意）、447、494（settleUni/
  settleCorp，不受影響）、784（settleProFinale，本卷移除）、careerScreen 3415（收尾卡，
  批 2 改語意）。退休另立旗標不汙染 chapterCompleted（各章 SSOT 語意不動）。

## 二、範圍＝五批

1. **批 1 年迴圈地基（資料層，零 UI）**：CHAPTER_SEASONS.pro 1→10；settleProFinale
   逐季化（封存加 salary 欄）；advanceSeason pro 分支（結算先於推進、決定論 seed 鏈、
   proFinaleSettled 清旗標、roster/trust/contract 保留）；career.contract 結構＋
   enterPro 首約（隊階底薪，數值屬提案）；retirePro()＋proCareerOver SSOT。
2. **批 2 續約選單＋薪水公式（UI 接線）**：收尾卡→續約談判卡（續留/轉隊/退休三路）；
   續約薪水公式（本季 proRank＋個人表現定檔，屬提案）；合約卡顯示年薪年限。
3. **批 3 轉隊接線**：續約窗 offer 集合（proOffersFor 吃本季 proRank）；轉隊 RMW
   （換隊、名冊重建、trust 起點、宿敵線翻面驗證、schedule 重建）。
4. **批 4 屆間成長通道**：職業技術槽逐年解鎖（★招式與代價 Sawmah 拍板才實作★）。
5. **批 5 退休謝幕**：生涯總結卡（歷年隊伍/名次/冠軍數/薪水曲線，資料吃
   career.seasons）；第 10 年強制謝幕；宿敵年度重逢輕量句。

## 三、工程地雷（承職業章教訓）

- dialogPlay line 契約＝{speaker,text} 物件；wiring 測試斷言字在對的容器。
- 修完 findings 先 commit 再送審（批 2 checkout 誤還原事故）。
- 守衛放分支是打地鼠——效果的唯一入口優先（批 3 頭道閘教訓）；本卷「季末唯一
  匯合點」語意不得旁生分支。
- 鍵名不得撞名（uniRank/corpRank/proRank 教訓）；封存逐年追加不覆寫。

## 掛帳（承職業章照舊）

國外強權可玩化；布置槽①真情報化；攔網線承諾機制；zonePanel 標題串接 LOW；
多人連線前置；宿敵多年新變體事件；後段年份里程碑事件（試玩回報單調才開）。

## 批 1 覆審交辦（2026-08-27，fresh opus 覆審 1H3M2L 的處置紀錄）

- HIGH 冠軍封存＝批 1 已補（proFinish 四態，拍板「現在補」）；MEDIUM proCareerOver
  時點＝批 1 已修（拍板甲：結算後才算收束）；MEDIUM A7 紀錄＝凍結檔已更正。
- **批 2 必辦**：①舊職業存檔 contract 一次性回填（隊階底薪＋入章屆數；否則續約
  公式吃 undefined 傳染）②UI 單年文案全清（「職業元年・完」「續約談判・敬請期待」
  careerScreen 2584/2586/3436/3446 與 3407-3412 註解——文案說謊同型事故）③「進入
  下一年」鈕用 chapterCompleted 擋末季死按鈕（2464/2666 同型事故已兩次）④生涯數據
  頁 🏆 判準補 proFinish==='champion'（3683/3698-3699 現只認高中 champion 與 uniRank）。
- LOW 備忘：writeSave 回「寫入成功」非「有變動」，跨分頁同槽的內層 no-op 仍回
  true（enterPro/settleUniFinale 同款既有慣例）——批 2 UI 判式別拿回值當「有推進」。
