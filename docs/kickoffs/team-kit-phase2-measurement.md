# 隊伍配色卷 階段二 — 題 2 量測結果（步驟 0＋步驟 1）

> 依 `docs/kickoffs/team-kit-phase2-ruling.md` §三「三步量測工單」執行。
> 本檔只交事實（量測結果＋證據），不做裁定、不動色票、不改任何既有源碼檔。
> 量測時 HEAD＝`ed48d34`，工作樹乾淨。
> **本檔不 commit**（工單明文交代）。

---

## (a) 步驟 0 — 分母封閉確認：對手池是否封閉於 9 校

**結論：T0 不觸發——大學章賽程的對手池封閉於 9 所大學，沒有任何跨池對戰路徑。**

逐條證據：

1. **大學章聯賽賽程的對手來源只有 9 校**：`src/career/uniSchedule.js:62-77` `uniRounds()` 用
   circle method 產生單循環對戰表，參賽 id 集合在第 63 行由
   `UNIVERSITIES.map((u) => u.id)`（`src/career/universities.js` 匯出的 9 校陣列）
   ＋一個虛擬 `BYE` 佔位湊成偶數（第 63、67 行）組成，除此之外沒有第二個 id 來源。
   `buildUniSchedule()`（`src/career/uniSchedule.js:86-110`）的 `opponentId` 全部取自
   這張表（第 93、106 行），不會混入其他來源。

2. **進大學章時 `season.schedule` 是整份覆蓋，不是附加**：`src/career/careerStore.js:357-364`
   （`enterUniversity()` 內）把 `season.schedule` 直接寫成
   `buildUniSchedule({ schoolId: school, seed: ... })` 的回傳值，同時
   `results: []`、`events: []` 一併清空（第 361-363 行）。這是同一次 RMW 的整份取代，
   不是把大學賽程「加進」舊的高中賽程陣列。用 `grep -n "schedule" src/career/careerStore.js`
   核對，整個檔案只有這一處寫入 `schedule` 鍵，沒有第二個附加點。

3. **對手 def 解析只有一個入口，且大學優先於高中查表**：`src/career/careerState.js:407-421`
   `matchOpponentDef(opponentId, ...)`——檔頭註解（407 行前的區塊，`careerState.js:395-402`）
   明講這支函式是把「比賽路徑 4 處 `opponentById(`」收斂成的單一入口，其餘 13 處
   （`schedule.js`／`recruitment.js`／`events.js`／招募面板／`main.js` 的
   `RIVAL_TEAM_ID`）刻意不動，因為那些路徑在大學章「根本不該有對手可查，查不到回 null
   才是對的」。函式本體第 411-412 行先查 `universityById(opponentId)`，查到就直接回傳
   （不落到 16 隊高中池）；只有查不到大學才會去查 `opponentById`（第 413 行）。
   所有比賽路徑的呼叫點（`src/app/matchCareer.js:227`、`src/career/careerState.js:644`、
   `src/ui/careerScreen.js:717`）餵進來的 `opponentId` 全部來自 `career.schedule`
   的項目——而第 1、2 點已證明大學章的 `career.schedule` 只含 9 校 id。

4. **練習賽（紅白對抗）不涉及對手池**：`src/career/practiceMatch.js:1-2`
   檔頭明講這是「紅白拆隊」——屆間練習賽是把玩家自己的名冊拆成兩隊內部對打，
   不從 `OPPONENTS`／`UNIVERSITIES` 任一池挑選對手 def。全檔（897+行）沒有任何
   `opponentById`／`universityById`／`OPPONENTS`／`UNIVERSITIES` 的引用
   （`grep -n "opponentById\|universityById\|OPPONENTS\|UNIVERSITIES" src/career/practiceMatch.js`
   零命中）。

5. **快速比賽（quick match）用寫死的預設隊伍，不吃任何池**：`src/app/matchConfig.js:17-45`
   `buildQuickSetup()` 呼叫 `createDefaultTeams()`（`sim/game.js`）組隊，全函式沒有
   `opponentById`／`universityById` 呼叫。同檔第 197 行註解直接寫明
   「各側球衣 kit（careerMatchSetup 供給；快速比賽/練習賽＝null＝預設藍紅）」——
   快速比賽走的是與生涯賽程完全獨立的預設藍紅隊，不會在大學章冒出高中對手。

6. **「友誼賽」在本 repo 不是既有機制**：`grep -rn "友誼" --include="*.js" src` 與
   `grep -rln "exhibition\|invitational" --include="*.js" src` 均零命中——這個詞只出現在
   裁定稿本身當作「要檢查的假想跨池路徑」，程式碼裡沒有對應的實作，因此它不構成一條
   真實存在的污染路徑。

7. **16 隊高中池不會單獨滲入大學章**：`opponentById`（`src/career/opponents.js` 的
   16 隊高中對手表）在大學章唯一可能被 `matchOpponentDef` 呼到的情況，是
   `universityById(opponentId)` 查無此 id（第 4 點）。而第 1–2 點已證明大學章的
   `career.schedule` 項目的 `opponentId` 全部是 9 校 id，`universityById` 恆查得到，
   不會落到這個回退分支。唯一會用到 `opponentById` 回退分支的是**高中章**本身的比賽
   （`src/career/devSeed.js:44-52` 的治具 `END_MATCH` 用 `opponentId: 'iron-mist'`
   即為一例，但該治具明文保持 `career.chapter` 為高中——見 `devSeed.js:65` 附近註解
   「章節維持高中（尚未升學）」），不是大學章的污染。

**判定**：分母＝9 校（`UNIVERSITIES`），無任何練習賽／快速比賽／友誼賽／16 隊池的
跨池對戰路徑會混進大學章賽程。T0 不觸發，可依 §三步驟 1 直接量測 9 校色票，
不需擴大分母、不需回 Claude.ai 補裁定。

---

## (b) 距離公式出處與「同一把尺」證明

- **距離函式**：`colorDistance(a, b)`，定義於 `src/career/teamKit.js:32-38`（redmean 加權
  RGB 距離）。批 1 建立、`checkKitPalette()` 內部（同檔 42-77 行）直接呼叫的就是這一支，
  零第二份實作。
- **取值欄位同源**：`checkKitPalette()` 的「敵我可分（identity）」比對
  （`src/career/teamKit.js:66-74`）只取兩隊 `kit.jersey` 欄位互比
  （第 68 行：`entries[i].kit?.jersey` vs `entries[k].kit?.jersey`），門檻為
  `IDENTITY_MIN`（100）。本量測比照同一種取值方式（`kit.jersey` 對 `kit.jersey`），
  但依裁定稿 §三步驟 2 的門檻改用 `READABILITY_MIN`（150）——這是裁定樹要驗的門檻，
  不是另立比較欄位。
- **量測腳本的真實 import 語句**（腳本放在 repo 外的 scratchpad，未落 repo）：

  ```js
  import { pathToFileURL } from 'node:url';
  const REPO = 'C:/Users/shung/OneDrive/桌面/排球夢';
  const { colorDistance } = await import(pathToFileURL(`${REPO}/src/career/teamKit.js`).href);
  const { UNIVERSITIES } = await import(pathToFileURL(`${REPO}/src/career/universities.js`).href);
  ```

  執行期確認：`console.error` 印出 `colorDistance = function`、`UNIVERSITIES.length = 9`，
  證明兩個 import 都拿到真實模組匯出，不是重抄的替代品。

---

## (c) 完整 9×9 距離矩陣（redmean，`kit.jersey` 對 `kit.jersey`，單位＝色距值）

| id＼id | north-ridge | hanchi-sport | chiyang | haiyan | chengguang | luze-tech | songhe | daiban | meixi |
|---|---|---|---|---|---|---|---|---|---|
| north-ridge | 0.00 | 218.37 | 324.40 | 102.44 | 348.87 | 260.51 | 274.30 | 123.98 | 213.39 |
| hanchi-sport | 218.37 | 0.00 | 213.79 | 214.58 | 389.20 | 206.56 | 306.50 | 250.68 | 233.65 |
| chiyang | 324.40 | 213.79 | 0.00 | 317.38 | 245.96 | 131.92 | 189.07 | 260.72 | 176.58 |
| haiyan | 102.44 | 214.58 | 317.38 | 0.00 | 368.52 | 220.03 | 271.03 | 148.97 | 254.59 |
| chengguang | 348.87 | 389.20 | 245.96 | 368.52 | 0.00 | 253.80 | 113.01 | 231.24 | 175.08 |
| luze-tech | 260.51 | 206.56 | 131.92 | 220.03 | 253.80 | 0.00 | 149.47 | 193.40 | 191.29 |
| songhe | 274.30 | 306.50 | 189.07 | 271.03 | 113.01 | 149.47 | 0.00 | 156.69 | 140.79 |
| daiban | 123.98 | 250.68 | 260.72 | 148.97 | 231.24 | 193.40 | 156.69 | 0.00 | 137.51 |
| meixi | 213.39 | 233.65 | 176.58 | 254.59 | 175.08 | 191.29 | 140.79 | 137.51 | 0.00 |

（id 對照校名：north-ridge＝北陵大學／hanchi-sport＝瀚崎體育大學／chiyang＝麒陽大學／
haiyan＝海硯大學／chengguang＝承光大學／luze-tech＝鹿澤科技大學／songhe＝松河大學／
daiban＝岱坂技術學院／meixi＝梅溪大學）

---

## (d) 最小對排序清單（由小到大，36 對全列）

| # | 校 A | 校 B | 色距 |
|---|---|---|---|
| 1 | 北陵大學 | 海硯大學 | 102.44 |
| 2 | 承光大學 | 松河大學 | 113.01 |
| 3 | 北陵大學 | 岱坂技術學院 | 123.98 |
| 4 | 麒陽大學 | 鹿澤科技大學 | 131.92 |
| 5 | 岱坂技術學院 | 梅溪大學 | 137.51 |
| 6 | 松河大學 | 梅溪大學 | 140.79 |
| 7 | 海硯大學 | 岱坂技術學院 | 148.97 |
| 8 | 鹿澤科技大學 | 松河大學 | 149.47 |
| 9 | 松河大學 | 岱坂技術學院 | 156.69 |
| 10 | 承光大學 | 梅溪大學 | 175.08 |
| 11 | 麒陽大學 | 梅溪大學 | 176.58 |
| 12 | 麒陽大學 | 松河大學 | 189.07 |
| 13 | 鹿澤科技大學 | 梅溪大學 | 191.29 |
| 14 | 鹿澤科技大學 | 岱坂技術學院 | 193.40 |
| 15 | 瀚崎體育大學 | 鹿澤科技大學 | 206.56 |
| 16 | 北陵大學 | 梅溪大學 | 213.39 |
| 17 | 瀚崎體育大學 | 麒陽大學 | 213.79 |
| 18 | 瀚崎體育大學 | 海硯大學 | 214.58 |
| 19 | 北陵大學 | 瀚崎體育大學 | 218.37 |
| 20 | 海硯大學 | 鹿澤科技大學 | 220.03 |
| 21 | 承光大學 | 岱坂技術學院 | 231.24 |
| 22 | 瀚崎體育大學 | 梅溪大學 | 233.65 |
| 23 | 麒陽大學 | 承光大學 | 245.96 |
| 24 | 瀚崎體育大學 | 岱坂技術學院 | 250.68 |
| 25 | 承光大學 | 鹿澤科技大學 | 253.80 |
| 26 | 海硯大學 | 梅溪大學 | 254.59 |
| 27 | 北陵大學 | 鹿澤科技大學 | 260.51 |
| 28 | 麒陽大學 | 岱坂技術學院 | 260.72 |
| 29 | 海硯大學 | 松河大學 | 271.03 |
| 30 | 北陵大學 | 松河大學 | 274.30 |
| 31 | 瀚崎體育大學 | 松河大學 | 306.50 |
| 32 | 麒陽大學 | 海硯大學 | 317.38 |
| 33 | 北陵大學 | 麒陽大學 | 324.40 |
| 34 | 北陵大學 | 承光大學 | 348.87 |
| 35 | 海硯大學 | 承光大學 | 368.52 |
| 36 | 瀚崎體育大學 | 承光大學 | 389.20 |

---

## (e) 對照門檻 150：<150 的對與各差多少

門檻＝`READABILITY_MIN`＝150（`src/career/teamKit.js:19`）。共 **8 對**（36 對中的
22.2%）低於門檻：

| 校 A | 校 B | 實測色距 | 差多少（150 − 實測） |
|---|---|---|---|
| 北陵大學 | 海硯大學 | 102.44 | 47.56 |
| 承光大學 | 松河大學 | 113.01 | 36.99 |
| 北陵大學 | 岱坂技術學院 | 123.98 | 26.02 |
| 麒陽大學 | 鹿澤科技大學 | 131.92 | 18.08 |
| 岱坂技術學院 | 梅溪大學 | 137.51 | 12.49 |
| 松河大學 | 梅溪大學 | 140.79 | 9.21 |
| 海硯大學 | 岱坂技術學院 | 148.97 | 1.04 |
| 鹿澤科技大學 | 松河大學 | 149.47 | 0.53 |

---

## 附註（僅陳述事實，不作裁定）

- 最小對＝北陵大學×海硯大學＝102.44，距門檻 150 差 47.56，也低於
  `IDENTITY_MIN`（100）以上一點點（102.44 > 100，identity 門檻本身沒被跌破，
  但這不是本量測要驗的門檻——步驟 2 裁定樹用的是 150）。
- 8 對不足，超過裁定樹「少數對（≤3 對）」分支的範圍，落在哪個分支由 Claude.ai 依
  §三步驟 2 的裁定樹判定，本檔不代為下結論。
