# 配色卷階段二 — 重裁拍板稿 v2（2026-08-24，Sawmah 拍板）

> 本稿回應 `team-kit-phase2-gate-report.md` 兩道停報，取代原
> `team-kit-phase2-ruling.md` §三步驟 2 之後的施工路線；原稿其餘條文
>（§四停報條件、§五 Do-not-touch 等）除本稿明文修訂處外繼續有效。
> 量測基準＝`team-kit-phase2-measurement.md`（HEAD ed48d34）；
> T1/T2 證據＝`team-kit-phase2-t2-t1-inventory.md`。
> Fable 收到本稿即為開工授權；與凍結稿有出入時以凍結稿為準、停報回 Claude.ai。

---

## 裁定一：題 2 主裁定 — 走 B 案（UI 語意通道），色票一個都不動

### 裁定內容

1. **可讀性（READABILITY_MIN=150）不再作為 9 校色票的通過門檻。**
   量測顯示 8/36 對不足且牽動 9 校中 8 校，屬調色盤密度問題而非個別選色失手；
   逐對修色等於重解 9 色 packing，連鎖風險與敘事成本不成比例。
2. **色距只守 identity 門檻（IDENTITY_MIN=100，jersey 對 jersey，redmean）。**
   現況 36 對全數通過（最小 102.44），**零色票改動**。
3. **可讀性由語意通道承擔。** 排球專屬理由：兩隊永不混場，球網本身是永久的
   空間語意通道；加上既有的球員標籤（S/OH/MB/OPP／你）、對陣抬頭、記分板固定側，
   150 門檻所防範的「混戰中認錯人」場景在本作結構上不存在。
4. **薄餘裕對登記**：北陵大學 × 海硯大學＝102.44，距 identity 底線僅 2.44。
   本卷不動色；但**未來任何一校色票變動時，此對必須重量測**，本條寫入凍結稿
   作為永久註記。
5. **原題 3（8 對候選色值逐項核可）隨 B 案生效而失效**，不再執行。

### B 案的驗收改寫（取代原步驟 2 之後的色距驗收）

- `checkKitPalette()` 的 identity 檢查（門檻 100）維持現狀、必須恆過——
  這是唯一保留的色距硬門檻。
- READABILITY_MIN=150 的常數與檢查邏輯**保留在 teamKit.js 不刪**
  （單一事實來源，未來若重啟色距路線不需重建），但其檢查結果自本稿起
  **降級為資訊性輸出，不構成 gate**。若現行程式把 150 檢查接成硬性失敗
  （擋建置／擋測試），把該處降為警告即可；除此之外一行不動。
- 不新增任何 UI 元件。既有語意通道（標籤、抬頭、記分板）即為 B 案的全部內容；
  若 Fable 認為既有通道不足以承擔可讀性，**停報陳述理由，不得自行加 UI**。

---

## 裁定二：T1 十處消費端歸類

### 前提：動態隊名單一來源（A-9）

以下所有「掛動態隊名」的改動，一律接**同一個**隊名來源函式
（E4 原五點所用的 `currentTeamName()` 或等價的既有單一入口）。
**禁止**在 render 層或任何呼叫端自建第二份「章節→隊名」查表。
若 repo 內尚無此單一入口，先建一個（放在 career 層，讀章節狀態回隊名），
E4 全部消費端統一改接它。

### 組一：場景道具 — 併入 E4，掛動態隊名

| 位置 | 改法 |
|---|---|
| `src/render/arena.js:29`（看板「遊隼高中 ★ 主場之夜」） | 隊名段改為動態隊名，「★ 主場之夜」字樣保留 |
| `src/render/huddleProps.js:81`（戰術板角落隊名） | 改為動態隊名 |

**附帶裁定（主客場語意）**：大學章客場比賽時，看板首版**一律仍印我方隊名**
（與現行行為對稱、改動最小）。「主客場看板該印誰」登記為未來卷，本卷不展開。
**停報條件 S1**：若 Fable 發現 arena.js 看板已存在主客場判斷邏輯與本裁定衝突，
停報，不得自行擇一。

### 組二：情蒐文案 — 併入 E4

| 位置 | 改法 |
|---|---|
| `src/ui/careerScreen.js:929`（「現在穿著遊隼的球衣」） | 改為「現在穿著{動態隊名}的球衣」 |

理由：此句指涉**現在的隊伍**而非高中歷史，大學章硬編必錯。

### 組三：章節敘事文本 — 比照排除，各帶保險

| 位置 | 裁定 | 保險條款 |
|---|---|---|
| `src/career/n2Arc.js:65` | 補進排除清單（性質同 events.js 故事文本，「這裡是遊隼」指涉高中章那個地方） | **停報條件 S2**：須確認此劇情線只在高中章有觸發路徑；若發現大學章可觸發，該處停報，不得自行改字 |
| `src/career/positionEvents.js:151` | 同上，補進排除清單 | 同 S2 |
| `src/ui/careerScreen.js:2259`（「遊隼高中三年」） | 比照 §五-3 排除（此即謝幕類文字，僅同名異檔；語意是「高中三年這段歷史」，掛動態隊名反而錯） | 原地加 `// TODO(uni-finale)` grep 標籤，登記「大學章結算接線時 showCareerFinale() 必查此行」 |

### E4 分母最終定版（10 處全數歸位）

- 掛動態隊名（7 處）：careerScreen.js:864 / 1803 / 1897 / 2608（原四點）
  ＋ careerScreen.js:929 ＋ arena.js:29 ＋ huddleProps.js:81
- 排除（3 處）：n2Arc.js:65、positionEvents.js:151（新增進排除清單）、
  careerScreen.js:2259（比照 §五-3，加 TODO 標籤）
- 原排除清單（events.js／rivalArc.js／careerFinale.js／roster.js 定義與 persona／
  graduation.js 註解）維持不變。

---

## 裁定三：E5 收束判定採雙源讀法（固化 T2 盤點結論）

1. archive 陣列（`career.seasons`）內的季**一律視為已收束**——能進陣列本身
   即等於已收束，不需也沒有 `eliminated` 欄位可查。
2. 陣列外的即時季（目前被 push 的那筆）以 `careerStage(career)` 是否回傳
   `'eliminated'` / `'champion'` 判斷，**禁止硬寫 `current: true`**。
3. **禁止只認 archive 單一來源**——章節最後一屆（如高中第 3 屆）永不進 archive，
   只認 archive 必違反驗收 P6（第 3 屆完結後不再標示進行中）。

---

## Do-not-touch（本卷）

1. 9 校色票（`universities.js` 的 kit 值）一個位元組不改。
2. `colorDistance()` / `IDENTITY_MIN` / `READABILITY_MIN` 的定義與數值不改
   （150 檢查只降級為資訊性，常數與函式本體保留）。
3. events.js / rivalArc.js / careerFinale.js / roster.js / graduation.js 的
   既有排除項不動。
4. 高中 16 隊池（opponents.js）、賽程產生器（uniSchedule.js）不動——
   T0 已確認封閉，本卷無此範圍。
5. 主客場看板語意不實作（僅登記未來卷）。

## 停報條件

- **S1**：arena.js 已有主客場判斷邏輯與「一律印我方隊名」衝突。
- **S2**：n2Arc.js:65 或 positionEvents.js:151 的劇情線在大學章存在觸發路徑。
- **S3**：repo 內找不到可用的動態隊名單一入口，且建立新入口需要動到
  Do-not-touch 範圍。
- **S4**：READABILITY_MIN 檢查的降級牽動任何測試以外的行為
  （例如有程式邏輯讀取該檢查結果做分支）。
- 任何發現與本稿前提矛盾：停報，不自行修正（通則，照舊）。

## 驗收清單（Sawmah 自行可跑）

1. `npm test` 全過；identity 檢查（100）恆過。
2. 高中章：對陣畫面／主畫面戰績列／名次板／隊友卡片／情蒐行／球場看板／
   戰術板，隊名全部顯示「遊隼高中」（行為不變）。
3. 大學章（devSeed 或真實升學路徑）：上述 7 處全部顯示所選大學校名，
   零處殘留「遊隼」。
4. `grep -rn "遊隼" src/` 命中處只剩排除清單（events.js／rivalArc.js／
   careerFinale.js／roster.js／graduation.js 註解／n2Arc.js:65／
   positionEvents.js:151／careerScreen.js:2259）。
5. careerScreen.js:2259 帶有 `// TODO(uni-finale)` 標籤。
6. 歷屆清單：archive 內各屆不標「進行中」；即時季收束後
   （champion/eliminated）不再標「進行中」；高中第 3 屆完結後不標「進行中」。
7. 凍結稿含「北陵×海硯＝薄餘裕對，任一校變色必重量測」永久註記。

## 回填事項（Sawmah 對照凍結稿）

- 本稿 B 案範圍是在無 `team-kit-phase2-ruling.md` 原文的情況下重建的；
  回填時若原稿對 B 案的凍結定義（UI 通道清單、驗收寫法）與本稿有出入，
  **以凍結稿為準**，差異處回 Claude.ai 修訂本稿。
