# 成人/企業章 — 開卷卷宗（2026-08-25）

> ★★ 拍板紀錄（2026-08-25 Sawmah，一輪四題問完）★★
>
> 題 1 金字塔頂端 ＝ **四層照舊＋國外點名**：本章＝企業聯賽；本地職業聯賽＝下一章
>   （職業章）本體，決策 7 原文已含、不需新裁定；**國外強權職業聯賽＝世界觀存在、
>   本章僅敘事點名**（接簡子嵐「更大的海」伏筆），要不要可玩留到職業章再裁。
> 題 2 企業味 ＝ **排球為主＋輕量成人元素**：合約、薪水、隊上是社會人只做敘事與
>   少量選擇點，**不做經濟數值系統**；差異化靠劇情與對手強度。
> 題 3 範圍 ＝ **先做一年最小可玩**（沿大學卷慣例：入章分發→打完一個賽季→
>   續約/轉隊/多年掛帳另批）。
> 題 4 入章 ＝ **混合：選秀儀式演出＋實質邀約集合內自選**（Sawmah：「更有大作的
>   風格」）——包裝成選秀儀式的畫面，實際仍是 U4 成績決定邀約集合、玩家在集合內自選。

---

## 一、與已定案決策的關係（本卷不修訂決策清單）

`docs/ROADMAP.md:43` 決策 7 已是四層：高中→大學→**成人/企業**→頂級職業。本卷做的
正是第三層，**不動金字塔**。唯一的世界觀增補＝「國外強權職業聯賽存在」（題 1），
不改層級、只加一句設定：
- [ ] 實作批 4 時：`design-brief.md` 世界觀段補一句國外強權聯賽（敘事層存在），留紀錄。

## 二、現況地基（2026-08-25 盤點，證據見各行）

**大學章的模式全部可複製，成人章零檔案。**

| 項目 | 現況 |
|---|---|
| 章節狀態機 | `chapter.js:24-27` CHAPTER 只有 highschool/university；`enterUniversity` 純函式冪等（`chapter.js:65-73`）＝加一級的範本 |
| 下一章入口旗標 | `career.finaleSettled` 由 `settleUniFinale` 打上（`careerStore.js:416-419`）；★**目前沒有任何程式碼消費它**★ 終卡點掉直接回生涯頁（`careerScreen.js:2770`） |
| U4 封存 | 第 4 筆 `{...季摘要, uniRank, school}`（`careerStore.js:411-415`）＝入章評定的現成輸入 |
| 分發範本 | `admission.js:124-135` `TIERS_BY_FINISH`＝「成績定候選集合」公式；大學 UI 玩家自選 |
| 隊伍資料表範本 | `universities.js:60-87` 每校欄位（kit/tier/style/level/attrBias/roleBias/trustBias/heights/squad/ace/ai…）與 `opponents.js` 同構；★大學無獨立對手池，一張表身兼學校與對手★ |
| 名冊生成 | `buildUniMembers`（`uniTeam.js:80`）走 level+attrBias+roleBias 座標系＝企業版範本 |
| 賽程範本 | `uniSchedule.js`：九隊單循環 bo3、勝點 3/2/1/0、`round:'league'` 標記；高中 `schedule.js` 一行不動的分離慣例 |
| 章節末年守衛 | `careerState.js:192-197`：高中 advanceSeason 遇 `round==='league'` no-op——企業章要有自己的 round 標記走同一招 |
| 名次帶著走 | `uniRankTrustBonus`（`uniTeam.js:51-57`）：1→+6/2-3→+4/4-6→+2/其餘0，`fromSetter` 原值不歸零（`careerStore.js:210-215,229`） |
| 成長系統 | `ATTR_CAP:90`（`growth.js:14`，註解「100 留給傳奇」→**本章不動**，100 是職業章的事）；TECH_DEFS 9 項七年可傳完；身高 `heightSettled` U4 已定型（`heightGrowth.js:78-82`）＝成人章自然無身高成長，零工程 |
| 王勝翔伏筆 | `events.js:502`「傳聞他要直接挑戰企業聯賽的天空」＋`universities.js:22,33` NOT_ATTENDING 明寫他跳過大學→**比玩家早四年進企業聯賽** |
| 海外伏筆 | `events.js:503` 簡子嵐「更大的海」＋`uniGraduation.js:23`（同隊限定句）＝國外點名的敘事錨點 |
| 治具範本 | `devSeed.js:96-133` `?devuni` 走正式鏈（`store.enterUniversity`+`advanceSeason`）、僅戰績合成 |
| 測試/驗收慣例 | sim-hash 基準 `34772c06e02243fd`（`tools/sim-hash-baseline.json`）本卷全程不動；acceptance 檔放 `docs/kickoffs/`；每批：凍結→實作→改前紅→全套+sim-hash→fresh 覆審→反駁式送審→部署→回填 |

## 三、階段一範圍（一年最小可玩）＝四批

一條端到端路徑：大學謝幕完成 → 選秀儀式（演出）→ 邀約集合內自選企業隊 → 打完企業聯賽一季。

批次原則（抄大學卷教訓 `careerStore.js:453` ⚠）：**資料與規則先全到位、UI 接線後行**
——入章 RMW 一次到位（名冊/球權/賽程/屆數同一次寫），不讓任何批留下「已是企業章、
賽程還是空的」的半吊子存檔。

1. **批 1 純函式與資料層（零 UI 接線）**：`chapter.js` 加 CORPORATE（enterCorporate 純函式
   冪等、`CHAPTER_SEASONS.corporate=1`、currentTeamName 企業分支）；`corporations.js`
   8 隊資料表（同構 universities.js，含 kit；王勝翔＝強豪隊 ace）；`corpTeam.js`
   buildCorpMembers＋入章信任起點；`corpSchedule.js`（round 標記 `'corp'`、8 隊單循環
   bo3 勝點制＋corpTable 名次表）；邀約集合表（U4 封存 uniRank → 隊階集合）；
   `careerState.advanceSeason`（高中版）比照 `'league'` 擋 `'corp'`。舊存檔零遷移。
2. **批 2 入章接線**：store.enterCorporate RMW（換血＋球權＋賽程＋屆數同一次寫、
   大學名冊封存比照 highSchoolRoster）；生涯頁**消費 `finaleSettled`**——謝幕完成的
   存檔長出「▶ 前往下一個舞台」；選秀儀式演出卡（題 4：唱名演出在前）→ 邀約集合內
   自選 → 入隊；`?devcorp=<隊id>` 治具走正式鏈。
3. **批 3 賽季迴圈**：企業賽季的出戰入口/名次表/戰績顯示（careerScreen 章節分支，
   比照 uniSeasonDone 區塊）；一年打完＝章末收尾卡（佔位，續約/多年掛帳）；
   瀏覽器實開截圖。★批 1 覆審 MEDIUM 記檔：corporations.js 無 `scoutRead` 欄
   （careerState.js:680 `?? 0`＝企業對手全不讀球路）——與大學表同一個既有先例
   （universities.js 也沒有，大學章接戰鬥時未開此題），批 3 接戰鬥管線時要嘛補欄、
   要嘛明寫「成人章對手不吃情蒐」的理由，不得靜默沿用★
4. **批 4 敘事層**：入隊合約卡（敘事）；季中薪水/社會人選擇點 1–2 個（敘事＋小加成，
   不做經濟系統）；王勝翔錨點（對戰文案＋亮相）；國外強權點名（電視轉播/傳聞句）；
   （條件）簡子嵐海外傳聞句——僅當存檔曾與他同隊；design-brief 補句。

## 四、提案項（★數值與文案屬提案，試玩回饋即改★）

- 企業聯賽形狀：**8 隊單循環 bo3 勝點制**（沿 uniSchedule 形狀、獨立模組）；季後賽掛帳。
- 邀約集合表（提案）：企業聯賽冠軍隊階＝U4 冠/亞才邀；中堅隊階＝四強以上；保底隊階＝全名次可去。
- 王勝翔＝聯賽現任明星（早四年＝資歷差敘事本體），放最強隊階當 ace。
- 名次加成 analog：企業章入章沿用 `uniRankTrustBonus` 形狀另立數值表（提案再議，批 2 給表）。
- 選秀儀式演出：唱名卡 2–3 張（他隊選走 NPC→輪到玩家→出示邀約集合）。

## 五、掛帳（本卷不做）

- 續約/轉隊/多年生涯（題 3 拍板先做一年）；季後賽；國外強權可玩化（職業章再裁）；
  職業卷構想（贊助商球衣）；ATTR_CAP 100 傳奇解鎖（職業章）。
- 既有掛帳照舊：stands 接線、`careerState.js:335` ROLE_ORDER 收斂、結算失敗文案 1 LOW。
