# 職業章 — 開卷卷宗（2026-08-26）

> ★★ 拍板紀錄（2026-08-26 Sawmah，兩輪五題）★★
>
> 題 1 探針閘 ＝ **現在就押「玩家側決策空間」**（不等企業章試玩回饋——探針卷原定
>   「試玩答案定職業卷方向」的閘由 Sawmah 本輪裁定解除；「對手讀你」線見題 5）。
> 題 2 入章 ＝ **職業球團挖角/測試會**：第三次重用「成績定邀約集合、集合內自選」
>   公式（U4→企業＝選秀儀式；企業→職業＝球團主動來談＝職業味），corpRank→隊階集合。
> 題 3 範圍（複選）＝ **季後賽首開＋ATTR_CAP 100 傳奇解鎖＋王勝翔同場宿敵線**；
>   國外強權**不可玩化**——維持敘事點名＋終卡伏筆（可玩化若要做＝另卷）。
> 題 4 決策空間組成 ＝ **職業章專屬技術 2 招**（沿大學卷慣例；具體招式批內出 2–3 案
>   附代價拍板，不預先定）**＋賽前布置面板**（情蒐從被動變主動：賽前用累積對手數據
>   選反制策略；不碰 sim、走 career 層參數通道）。
> 題 5 讀你線 ＝ **沿用企業章 scoutRead 三檔形狀不加深**（數值屬提案可微調）。

## 一、與已定案決策的關係（本卷不修訂決策清單）

`docs/ROADMAP.md` 決策 7 四層金字塔的頂端＝本地頂級職業聯賽，本卷做的正是它，不動金字塔。
企業章遺留給職業章的四筆裁定本卷全數落地或處置：
- 國外強權可玩化 → **不做**（題 3），維持敘事；
- ATTR_CAP 100 → **做**（題 3）；
- scoutRead 整體平衡 → 職業隊沿三檔（題 5）；大學端維持關閉不回頭開（探針歸因原則沿用）；
- 贊助商球衣構想 → 併入隊伍資料表 kit 設計（敘事層批看量，不另立系統）。

## 二、現況地基（2026-08-26 盤點）

企業章模式全部可複製，職業章零檔案。
- 章節狀態機：`chapter.js` CHAPTER 有 highschool/university/corporate；enterCorporate 冪等
  範本（單一 RMW＋finaleSettled 式守衛）＝加一級的抄法。
- ★企業章收尾卡＝佔位（「續約談判・敬請期待」），**無 settle 機制、無入口旗標**——
  職業章批 1 要自建 settleCorpFinale 對應物（比照 settleUniFinale：封存＋旗標＋冪等＋
  章節末年守衛，守衛判準逐字同 advanceSeason 先例）★
- 隊伍資料表範本：`corporations.js` 八隊（kit/tier/style/level/attrBias/roleBias/trustBias/
  heights/squad/ace/ai/scoutRead）；探針卷起企業對手已帶 scoutRead 三檔。
- 賽程範本：`corpSchedule.js` 單循環 bo3 勝點＋名次表；round 標記隔離慣例（'corp'）。
- 名次帶著走：uniRankTrustBonus 形狀（企業版另表）＝職業入章加成的範本。
- 成長：`growth.js ATTR_CAP:90`（「100 留給傳奇」）＝本卷兌現；身高已定型零工程；
  TECH_DEFS 9 項（含大學章專屬 2 招 pressBlock/chaseServe 慣例＝職業章專屬 2 招的先例）。
- 王勝翔：企業章＝擎空航太 ace「制空者」、早玩家四年；亮相 fireEvents 一生一次已上線。
- ⚠ 工程地雷（企業章批 3 覆審留字）：archivedUniRank 讀「最後一筆帶 uniRank」——
  職業章封存企業名次**不得重用 uniRank 鍵名**（用 corpRank），否則抓錯筆。
- ⚠ dialogPlay line 契約＝{speaker,text} 物件（探針卷抓到批 4 出廠 bug）——所有新敘事
  卡的 wiring 測試要斷言「字出現在對的容器」。

## 三、範圍＝一年最小可玩＋題 3 圈選，五批

一條端到端：企業章一季打完 → 收尾卡變真入口 → 挖角/測試會 → 入職業隊 →
循環賽＋季後賽一季 → 章末收尾卡（多年掛帳）。批次原則照企業章：資料與規則先全到位、
UI 接線後行，入章 RMW 一次寫齊。

1. **批 1 純函式與資料層（零 UI）**：chapter.js 加 PRO（enterPro 冪等、年限 1、
   currentTeamName 分支）；settleCorpFinale＋corpFinaleSettled（封存含 corpRank）；
   `proTeams.js` 隊伍表（隊數屬提案：8 隊；王勝翔＝最強隊 ace，同季挖角入職業＝題 3）；
   `proTeam.js` 名冊＋入章信任（corpRank 加成表屬提案）；`proSchedule.js`
   （round 'pro'、單循環 bo3 勝點＋**季後賽四強單淘汰**——形狀屬提案）；
   挖角邀約集合表（corpRank→隊階、單調＋非空）；advanceSeason 守衛擋 'pro'。
2. **批 2 入章接線**：store.enterPro RMW；企業收尾卡消費 corpFinaleSettled →
   「▶ 前往下一個舞台」；挖角/測試會演出（球團來談卡 2–3 張→邀約集合自選）；
   `?devpro=<隊id>` 治具走正式鏈。
3. **批 3 賽季迴圈＋季後賽**：出戰入口/名次表/季後賽 bracket 顯示與推進/章末收尾卡
   （多年佔位）；ATTR_CAP 章節感知 90→100（PRO 期間；漲幅走既有成長管線，數值屬提案）；
   瀏覽器實開截圖。
> ★2026-08-26 批 4 拍板增補（Sawmah）★ 技術三案**全做**（A 餵線＋B 改叫＋C 二段
> 時間差——比草稿建議的二案更大）；B 形狀＝**B2 直接下指令**（盤點：AI S 組合是當下
> 抽籤無顯式叫牌可覆蓋，B2 重用 applyReplanCall 通道）；布置面板照草稿兩槽。
> 批 4 據此拆三批：4a＝A＋面板（acceptance-pro-batch4a.md）、4b＝B2、
> 4c＝C（動 sim 扣球判定＝地基級，另派）。

4. **批 4 玩家側決策空間（本卷靈魂）**：①職業章專屬技術 2 招——批內出 2–3 案
   （各附操作面、代價、與既有 9 技的差異化）拍板後實作；②賽前布置面板——
   賽前用 career.scouting 累積數據選反制策略（形狀提案：對陣卡上 2–3 個布置槽，
   作用走 career 層參數通道餵我方 AI 傾向，sim 零擾動原則不破例）。
   ★本批含策略/玩法設計＝硬規則 3，招式與布置選項要 Sawmah 拍板才實作★
5. **批 5 敘事層**：職業合約卡；王勝翔同場宿敵線（同聯賽首對戰＝資歷差四年的收束，
   fireEvents 一生一次）；國外強權點名＋終卡伏筆（接簡子嵐線，條件句照企業章慣例）；
   design-brief 若有世界觀增補句照慣例回填。

## 四、提案項（★數值與文案屬提案，試玩回饋即改★）

- 職業聯賽 8 隊單循環 bo3 勝點＋四強單淘汰季後賽（bo3）；隊數/賽制可改。
- 挖角集合（提案）：冠軍隊階＝企業冠/亞才邀；中堅＝四強以上；保底＝全名次。
- scoutRead 三檔沿形狀：頂級 0.85／中堅 0.55／保底 0.25（可微調，不加深）。
- ATTR_CAP 100：PRO 章期間天花板 100，其餘章節 90 不動（章節感知，不是全域改）。

## 五、掛帳（本卷不做）

- 多年職業生涯／續約轉隊（收尾卡佔位）；國外強權可玩化；多人連線前置。
- 既有掛帳照舊：企業 level 治具校準；scoutRead 大學端（維持關閉）；
  假 DOM 替身其餘檔未帶參數呼叫（債清批已修壞行為，結構整併不急）。

## 六、結案紀錄（2026-08-26 開卷即關卷，五批）

每批照慣例：凍結驗收（commit 落點）→實作→改前 worktree 紅→全套+sim-hash→
（有動 UI/敘事的批次）對抗覆審→修 findings。sim-hash `34772c06e02243fd` 全卷
不動；職業章批 1-4c 收版（HEAD=7f62cc6）測試基準 1974；批 5（本次）1974→1991（＋17）。

- **批 1**（e17854a）純函式與資料層：chapter PRO／settleCorpFinale＋corpFinaleSettled／
  `proTeams.js` 八隊（含王勝翔挖角錨點：蒼羽泰坦 ace）／`proTeam.js` 名冊＋入章信任／
  `proSchedule.js`（round 'pro'、單循環 bo3＋季後賽四強單淘汰 bracket 純函式）／
  挖角邀約集合（corpRank→隊階，單調＋非空）／advanceSeason 守衛。A1-A9 全過，
  fresh 覆審 APPROVE 0 findings。
- **批 2**（edc77f9）入章接線：store.enterPro RMW／企業收尾卡消費 corpFinaleSettled→
  「前往下一個舞台」／挖角測試會演出（球團開口卡→邀約自選→簽約二次確認）／
  `?devpro=<隊id>` 治具。B1-B7 全過，fallback 鏈 N=9 全查證，覆審 1 MEDIUM
  （甩開句 round 閘鎖死 corp）已修。
- **批 3**（2e9467a）賽季迴圈＋季後賽：出戰入口／名次表／季後賽 bracket 顯示與推進
  （growProSchedule 冪等長場次）／章末收尾卡（多年掛帳佔位）／ATTR_CAP 章節感知
  90→100。C1-C7 全過，覆審 1 HIGH（棄賽分支本地 career 過期）已修，瀏覽器實開截圖。
- **批 4**（拆三批，Sawmah 拍板技術三案全做）：
  - **4a**（e2c0412 修版，凍 acceptance-pro-batch4a.md）餵線技術（案 A）＋賽前布置面板
    （對陣卡兩槽讀 career.scouting，sim 零擾動）。D1-D6 全過。
  - **4b**（3ea0f76）改叫技術（B2 直接下指令，重用 applyReplanCall 通道）。E1-E5 全過，
    覆審 MEDIUM（取重不疊乘）已修。
  - **4c**（4050d89 首版→7f62cc6 拍板丙修）二段時間差（滯空第二段拖曳＝變向，地基級）。
    F1-F5 全過；opus 覆審三修，拍板丙將機率騙牆層整層刪除、變向收益回歸純幾何
    （零機率語意，落點只由真實站位決定）。
- **批 5**（本次，凍 acceptance-pro-batch5.md）敘事層——本卷最後一批：
  - G1 職業合約卡：併入 `showProDone`（同構企業章 A4-1，`src/career/proEvents.js`
    `PRO_CONTRACT_LINES`）。
  - G2 王勝翔同場宿敵線：`proWangRivalPreEvents`——玩家簽他隊→循環賽首次對戰蒼羽
    泰坦的賽前對話（資歷差四年＋高中伏筆「直接挑戰企業聯賽」收束，event id
    `pro-wang-rival`）；玩家簽蒼羽泰坦→隊內首見變體（第一場賽前，`pro-wang-teammate`）。
    兩情境由 teamId 決定，結構互斥；各自 fireEvents 一生一次；round 守衛防高中/大學/
    企業章存檔誤觸發。
  - G3 收尾卡：`proClosingLines`（同構企業章 A4-4）——國外強權恆點名（世界觀存在、
    不可玩，決策 7 敘事層級不變）；條件簡子嵐（`store.loadUniRoster()` 封存判定含
    簡子嵐才播「更大的海」收束句，未同隊零可見）。
  - 覆審：純函式層 9 案＋DOM 接線層 8 案（含互斥/一生一次/高中大學企業零誤觸發的
    負向測試）全綠；改前 worktree（HEAD=7f62cc6）跑同一批測試逐一行為級紅（純函式
    層為新檔案 import 級紅、DOM 層為真實文案/事件缺席的行為級紅）。測試 1974→1991。

### 掛帳（結案時點，承企業章掛帳延續）
- 多年職業生涯／續約轉隊（收尾卡「續約談判・敬請期待」佔位）；國外強權可玩化
  （批 5 定案維持不可玩，世界觀存在）；多人連線前置。
- 企業/職業 level 治具校準（level 數值屬提案，未實測平衡）；scoutRead 大學端
  （維持關閉，先例延續）；archivedUniRank/archivedCorpRank 鍵名不得混用（企業章批 3
  覆審留字，職業章批 1 已避開）。
