# 多年職業生涯卷 批 3 驗收凍結（2026-08-27）

> 凍結於實作動手前；要改只有 02 §2.1 一條路。基準＝main 3083d56。
> 範圍＝轉隊（拍板題 3：每年季末可轉，proOffersFor 第四次重用）。零 sim 改動。
> ★薪水/信任數值屬提案；凍結的是性質與接線行為★

## C1 轉隊邀約集合（proTransferOffers，store 層）

- 只在「本季已結算、非末季、未退休」時回非空集合；集合＝proOffersFor(**本季
  proRank**，最後一筆 pro 封存)之隊階集合**排除現隊**；恆非空（新軍保底 3 隊，
  排除現隊後 ≥2）。
- 未結算／末季／已退休／非職業章＝回空陣列。
- 什麼實作會紅：吃 archivedCorpRank（入章那顆）而不是本季 proRank；含現隊；
  末季還給 offer。

## C2 transferPro（store 層，換隊＋推進同一次 RMW）

- 守衛：isPro、本季已結算（proFinaleSettled）、未退休、非末季（chapterCompleted
  擋）、目標隊 ∈ proTransferOffers、目標隊 ≠ 現隊；任一不成立＝false 零寫入。
- 成功＝同一次 RMW：`career.pro`＝新隊；`career.contract`＝{salary: proRenewalSalaryFor
  (新隊, 本季 proRank, 本季 proFinish), sinceSeason: 新季屆數}；roster＝buildProMembers
  (新隊)；lineup 重排（defaultLineup）；玩家 fromSetter＝proStartTrustFor(新隊)＋
  proRankTrustBonus(本季 proRank)（轉隊重置＝新環境代價，數值屬提案）；season：
  index+1、seed 衍生、schedule＝buildProSchedule(新隊)、results=[]、pendingMatch
  清空；proFinaleSettled 清 false。
- 決定論：同存檔同目標隊重演逐值一致。
- 什麼實作會紅：換隊與推進拆兩次寫；名冊還是舊隊；trust 原值帶走（沒有代價）；
  offer 外的隊也能轉。

## C3 宿敵線與事件跨隊安全

- 已播過的王勝翔事件（career.events 旗標）轉隊後不重播；未播的變體在新隊局面
  成立時照常可播（同隊變體限賽程第一戰的既有判準不放寬）。
- 轉隊後 proEvents/餵線/布置面板對新隊 id 不炸（fallback 鏈：對陣卡/名冊/kit）。
- 什麼實作會紅：轉入蒼羽後同隊事件重播；轉隊後對陣卡解不開新隊。

## C4 UI（續約談判卡加第三路）

- 非末季未退休的收尾卡：續約鈕與退休鈕之外加「🔁 測試其他球團」鈕；按下開
  offer 選單（每隊一張卡：隊名＋隊階＋年薪報價），選定→確認→transferPro→
  回生涯畫面（新隊頭部、第 N+1 年、可出戰）。
- 選單有「↩ 回續約談判」返回路；末季/已退休不出現轉隊鈕（同續約鈕防線）。
- 轉隊選單與確認卡沿重入旗標慣例（proClosingOpen 已在收尾卡層擋，選單層不疊卡）。
- wiring 測試斷言字在對的容器；連點轉隊確認只轉一次（advanceSeason 同款冪等）。
- 什麼實作會紅：末季有轉隊鈕；選單卡年薪與寫入值不同；連點雙轉。

## C5 全套與 sim

- 全套既有測試綠（2025 起跳）；sim-hash `34772c06e02243fd` 不動。

## C6 鑑別力

- C2 至少一條在「無 transferPro 實作」（3083d56）上行為紅的斷言；紀錄實跑輸出。

## C6 鑑別力紀錄（2026-08-27 覆審後補正）

- 首版測試檔靜態 import 舊樹沒有的 `proRankTrustBonus` ⇒ 在 3083d56 上死於模組
  載入期 SyntaxError、0 案執行（覆審 HIGH-1 抓到＝§6.1-1 旁枝紅原型）。修正＝
  新符號改動態 import。
- **修正後實跑（3083d56 舊樹＋修訂版測試檔，送審輪 2 核實後二訂）**：9 案全部
  執行、8 紅 1 綠——C4③ 是否定式斷言（「無轉隊鈕」）在無實作樹恆真，綠；8 紅中
  3 筆是行為 AssertionError（含 C6 達標條＝C2「有 offer 可轉」與 C1「全敗仍有
  新軍保底（得 0）」）、5 筆是 TypeError 旁枝紅。**C6 凍結條靠 C2/C1 的行為
  AssertionError 達標**；旁枝紅那 5 筆不計入證據。健康樹 9 綠。
- 覆審突變面已補斷言：offer 外守衛（目標改非現隊豪門）、末季案、schedule 換隊
  （舊隊變對手＋不自戰）、seed 衍生、pendingMatch 清空、lineup 重排（奇異 trust
  值不殘留——位序 id 跨隊共用，roster 隸屬斷言抓不到沿用舊 lineup 的突變）。
