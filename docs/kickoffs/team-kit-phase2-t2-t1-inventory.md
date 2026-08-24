# T2／T1 唯讀盤點（repo＝排球夢，HEAD=ed48d34，2026-08-24）

## T2 結論：**前提成立**——收束記錄有持久化，第 1、2 屆歷史收束記錄在後面屆數仍查得到

### 現行 `sn.current` 判定邏輯（careerScreen.js:2576 附近）

- `src/ui/careerScreen.js:2535-2538`（`showCareerTotals`）與 `:2231-2234`（`showCareerFinale`）：
  `seasons` 陣列＝`[...store.loadSeasonArchive()]` 再 `push({...archiveSeasonSummary(...), current: true})`。
  即：**目前的「current」不是章節推斷，是對「最後一個被 push 進陣列的即時季」無條件硬寫 `current: true`**——
  不論該季是否已經收束（champion/eliminated），只要它還沒被存進 `loadSeasonArchive()`，就恆顯示「進行中」。
  這正是 E5 要修的 bug：高中第 3 屆完結後仍會顯示「進行中」，因為它永遠不會被 archive（見下）。
- `sn.current` 消費處：`careerScreen.js:2576`（`` `第 ${sn.index} 屆${sn.current ? '（進行中）' : ''}` ``）。

### 收束記錄的資料結構與寫入時機

- 「收束事實」的正式定義來自 `src/career/careerState.js:102-130` 的 `careerStage(career)`：
  純函式，讀 `career.results` + `career.schedule`（**這兩者是「當前這一季」的即時執行期資料**，
  存在 `save.season.results` / `save.season.schedule`，經 `careerViewOf()`
  （`src/career/schema.js:78-93`）攤成 `career` 視圖），回傳 `'eliminated' | 'champion' | 'group' | 'national'`。
- 屆末封存：`src/career/careerStore.js:244-248`（`store.advanceSeason()` 內部）：
  ```
  const seasons = [
    ...(prev.career.seasons ?? []),
    archiveSeasonSummary(prev.season),
  ];
  ```
  寫進 `prev.career.seasons` 陣列（**累加、不覆蓋**），隨同一次 `writeSave` 落 `localStorage`
  （`careerStore.js:109-115`，`SAVE_KEY='vd-save'` at `careerStore.js:33`）。
  `archiveSeasonSummary()`（`careerStore.js:711-744`）把該季壓成
  `{index, wins, losses, champion: boolean, finish, totals}`——**只留 `champion` 布林，沒有獨立的
  `eliminated` 欄位**；但因為只有「已收束的季」才走得到這段程式碼（見下段守門），
  「有無被 archive」本身即等於「有無收束」。
- 讀出：`store.loadSeasonArchive()`（`careerStore.js:559-562`）讀 `save.career.seasons`，
  在 `careerScreen.js:2231, 2378, 2535` 三處被呼叫，用來重建「歷屆」清單。

### 邊界情況（E5 實作要注意，但不推翻 T2 結論）

**章節內最後一季（如高中第 3 屆）永遠不會進 `career.seasons` archive**：
`store.advanceSeason()` 一開頭（`careerStore.js:178`）
`if (chapterCompleted(save.career?.chapter, save.season.index ?? 1)) return false;`——
高中封頂 3 屆（`src/career/chapter.js:82-90` `CHAPTER_SEASONS.HIGH_SCHOOL = 3`），
`chapterCompleted(chapter, 3)` 恆真（`chapter.js:108-110`），所以第 3 屆打完後呼叫
`advanceSeason()` 會在寫入 archive **之前**就 return false——第 3 屆的收束事實**不會**進
`career.seasons`。但它仍然是「持久化」的：`save.season.results`/`schedule` 本身就活在存檔裡，
`careerStage(career)` 隨時可以在該季上重算出 `'eliminated'`/`'champion'`（見下方實證）。
**結論**：E5 若只認「archive 陣列裡有沒有這筆」會漏掉章節最後一屆（違反驗收清單第 6 項
「高中第 3 屆完結後不再標示」）；正確做法是**對陣列裡的歷史季一律視為已收束（因為能進陣列
本身就代表已收束），對陣列外那個目前被 push 進來的「即時季」改用 `careerStage(career)` 是否為
`'eliminated'`/`'champion'` 來判斷**，而不是像現在這樣硬寫 `current: true`。這是實作提醒，
不是「前提不成立」——因為第 3 屆的收束事實本身確實有持久化（`save.season`），只是不在同一個
陣列結構裡，E5 動工前必須知道要讀兩個地方而不是一個。

### 實證（node 真實引擎，非重建模型）

腳本：`scratchpad/t2-probe.mjs`（沿用 `tests/three-seasons.test.mjs` 的既有測試治具——
`createCareerStore` + `fakeStorage`（Map 模擬 localStorage 讀寫介面，同 get/setItem 契約）+
`settleCareerMatch` 真正結算路徑，seed=777，模擬國賽全敗＝止步收束）。
指令：`node t2-probe.mjs`，實際輸出：

```
--- 第 1 屆前 loadSeasonArchive() --- []
第 1 屆打完（未 advance）stage= eliminated archive= []
advance 1->2 ok= true seasonIndex= 2
advance 後 archive（應含第1屆）= [{"index":1,...,"champion":false,"finish":"quarter",...}]
第 2 屆打完 stage= eliminated
advance 2->3 ok= true seasonIndex= 3
advance 後 archive（應含第1、2屆）= [{"index":1,...},{"index":2,...}]
第 3 屆打完 stage= eliminated
advance 3->? ok= false (預期 false，高中三屆封頂)
第 3 屆結束後 archive（第 3 屆是否進archive？）= [{"index":1,...},{"index":2,...}]   ← 仍只有 2 筆
第 3 屆結束後 careerStage(live career)= eliminated   ← 但即時季本身查得到收束
第 3 屆結束後 seasonIndex()= 3
```

驗證重點：
1. 第 1 屆收束（quarter 止步）後 `advanceSeason()` 立刻把它壓進 archive；此後即使推進到第 2、
   第 3 屆，`loadSeasonArchive()` 重新反序列化仍看得到 `index:1` 那筆——**第 1 屆歷史可查＝TRUE**。
2. 第 2 屆同理，推進到第 3 屆後仍看得到 `index:2`——**第 2 屆歷史可查＝TRUE**。
3. 第 3 屆（章節最後一屆）確認**不進**archive（如上分析），但 `careerStage()` 在它身上仍正確
   回傳 `'eliminated'`——證實這是「兩個資料結構、都持久化」而不是「只在記憶體」。

取得路徑：**實證為主**（真實 `careerStore`/`careerState`/`matchCareer` 模組跑三屆），
搭配靜態追蹤交叉核對，兩者一致。

---

## T1 分母盤點：grep 全 repo「遊隼」與 `OUR_TEAM_NAME`（`src/` 範圍，排除 dist/ 建置產物）

grep 指令：
```
grep -rn "遊隼" --include="*.js" --include="*.mjs" src/
grep -rn "OUR_TEAM_NAME" --include="*.js" --include="*.mjs" src/
```

### 排除（依裁定 §四 T1 條文＋§五 Do-not-touch 第 3 項）
- `src/career/events.js`（8 處，遊隼台詞）
- `src/career/rivalArc.js`（4 處，宿敵台詞）
- `src/career/careerFinale.js`（3 處，謝幕台詞資料檔——**注意這是 `career/careerFinale.js`
  這個台詞資料檔，不是 `ui/careerScreen.js` 裡的 `showCareerFinale()` 函式，兩者同名異物**）
- `src/career/roster.js:43`（`export const OUR_TEAM_NAME = '遊隼高中';`——定義本身，純資料）
- `src/career/roster.js:54`（`persona: '...全押在遊隼身上'`——角色 persona 欄位，純資料）
- `src/career/graduation.js:56`（純註解，非字串字面值，不算消費）

### 程式碼消費端清單（逐一標明引用方式）

| # | 檔案:行號 | 引用方式 | 說明 |
|---|---|---|---|
| 1 | `src/ui/careerScreen.js:864` | 引用 `OUR_TEAM_NAME` | 對陣畫面（`showMatchupScreen`）VS 抬頭我方名——E4 5 點之一 |
| 2 | `src/ui/careerScreen.js:1803` | 引用 `OUR_TEAM_NAME` | 生涯主畫面戰績列——E4 5 點之一 |
| 3 | `src/ui/careerScreen.js:1897` | 引用 `OUR_TEAM_NAME` | 循環賽名次板「我方」那一列——E4 5 點之一 |
| 4 | `src/ui/careerScreen.js:2608` | 引用 `OUR_TEAM_NAME` | 生涯數據頁「高中隊友」卡片標題——E4 5 點之一 |
| 5 | `src/ui/careerScreen.js:2259` | **硬編字串**（`` `${career.playerName}・遊隼高中三年` ``） | `showCareerFinale()` 生涯結算頁大標題。**不在 E4 已列的 5 點清單裡，也不引用 `OUR_TEAM_NAME`**——命中 T1 觸發條件「並非引用 OUR_TEAM_NAME」。目前行為剛好正確是因為生涯目前只走得到高中結算（大學章結算尚未接線），但屬於 E4 分母漏記的消費端，應停報。 |
| 6 | `src/ui/careerScreen.js:929` | **硬編字串**（`` `他們的王牌？現在穿著遊隼的球衣。` ``） | `showMatchupScreen()` 內、被挖角對手王牌的敵情情報行（flavor text）。同樣不在 E4 5 點清單、不引用 `OUR_TEAM_NAME`；性質接近故事文本但**檔案本身（careerScreen.js）不在 §五-3 排除的 3 個檔名裡**，依字面規則列入分母。 |
| 7 | `src/career/n2Arc.js:65` | **硬編字串**（`'……但這裡是遊隼，膝蓋也是隊上的。收著點用。'`） | N2（自由人）劇情線台詞。內容性質等同 events.js/rivalArc.js 的故事文本，但**檔名不在排除清單裡**——邊界案例，列入分母請一併裁定要不要補進排除清單。 |
| 8 | `src/career/positionEvents.js:151` | **硬編字串**（`'...遊隼的地板上有三個人的——這裡不會再掉一顆該救的球。'`） | 轉位事件劇情線台詞。同上，性質是故事文本、檔名不在排除清單。 |
| 9 | `src/render/arena.js:29` | **硬編字串**（`adTexts: [..., '遊隼高中 ★ 主場之夜']`） | 3D 球場看板廣告文字陣列，逐屆逐章不變。真消費端（渲染進 3D 場景），非台詞。 |
| 10 | `src/render/huddleProps.js:81` | **硬編字串**（`ctx.fillText('遊隼高中', W - 22, H - 18)`） | 暫停戰術板角落隊名小字（canvas 繪製）。真消費端，非台詞。 |

### T1 判定

**命中 T1（分母盤點有漏）**：# 5、6、9、10 皆為硬編字串、非 `OUR_TEAM_NAME` 引用，且都不在
E4「5 個接線點」清單或 §五 Do-not-touch 第 3 項的 3 檔案排除名單內。
其中 #5（`careerScreen.js:2259`）與 §五-3 的排除意圖最接近但字面上不算——它人在
`ui/careerScreen.js`，不是 `career/careerFinale.js`——若 Sawmah 原意是想排除所有「謝幕/結算類」
文字，這裡出現同名異檔的認知落差，應由 Claude.ai 裁定是否比照排除、或併入 E4 分母補做。
#6/#7/#8 屬敘事/情蒐文案，內容性質貼近故事文本但檔名未被列入排除清單，是否要納入 E4 一併轉
`currentTeamName()`（例如宿敵/劇情永遠指涉「高中」語境，轉了反而語意錯）需要 Claude.ai 裁定。
#9/#10 是最沒有爭議的漏網——場景道具貼字，理論上任何章節都會渲染到，若大學章也共用同一顆
`arena.js`/`huddleProps.js`，需要一併檢查是否要跟 `currentTeamName()` 掛鉤，否則大學章球場看板
永遠印著「遊隼高中」。
