# Phase 3 W5 — 賽季輪迴 ＋ 逐出機制（狀態快照）

> 2026-07-23 執行。基準：W4 結案（245 測）＋ `docs/phase3-w4-status.md`。
> 任務書：`docs/kickoffs/w5implementationprompt`（Sawmah 於 Claude.ai 逐題拍板的最終決議，
> 已回填 `docs/kickoffs/w5-kickoff.md` 頂部「✅ 已拍板」段）。
> 交付：**Part A 賽季輪迴**（草稿取用＋A4 開場劇情＋A6 離開確認）＋
> **Part B 逐出機制**（applyExpel／二次點擊 UI／EXPEL_LINES／schema expelled）＋名冊上限 10→12。
> 明確不做（留 W6+）：賽中換人、擴池、跨屆平衡調整、persona 差分。

## 驗收閘總覽

| 閘 | 結果 |
|----|------|
| 1 sim 純度 | ✅ `src/sim` **零改動**（本輪 git diff 無任何 sim 檔）；純度測試綠。輪迴與逐出全屬生涯層。 |
| 2 測試 | ✅ **266 全綠**（W4 260 ＋ 新增 `tests/expel.test.mjs` 6；更新 schema-v2／recruitment 各一斷言＝反映 cap12/expelled 預期變更） |
| 3 建置 | ✅ `npm run build` 成功（UI 層 careerScreen／matchStage 改動編譯無誤；three chunk 大小警告為既有、無關） |
| 4 Part A 草稿取用 | ✅ `advanceSeason` 純函式＋store＋titles 投影＋careerScreen 兩顆按鈕＋7 測（沿用草稿，季迴圈重置 results 不清 recruitment 已測） |
| 5 逐出原子性 | ✅ `applyExpel` 單次 RMW 三處同完成（名冊移除＋trust 全體−5 夾限≥0＋expelled 記錄），無中間態（測試 1） |
| 6 招募連動核心閘 | ✅ 人工滿編→額滿→逐出騰位→§9 鉤子自動入隊；連動入隊 trust=10 不吃−5、被逐隊不重入、**R id 不回收**（測試 4） |
| 7 存檔相容 | ✅ expelled roundtrip；舊檔（無 expelled 鍵）deserialize 冪等不 brick；未逐出存檔 serialize 冪等、canExpel 純讀不改檔（測試 5、6） |

## 1. Part A 賽季輪迴（草稿取用＋本輪補完）

- **草稿直接取用**（分支 `w5-season-loop`）：`advanceSeason(career)`（careerState.js）純函式＋
  `store.advanceSeason()`（careerStore.js）＋`titles` 投影（schema seasonFromCareer/careerViewOf）＋
  careerScreen 冠軍/止步兩顆「進入下一屆」按鈕＋`tests/season.test.mjs` 7 測。已隨 merge 併入。
- **A4 最小劇情**（本輪補）：`SEASON_OPENERS = { defend, comeback }`（events.js），隊長各一段佔位台詞
  （標 TODO(naming)）。`nextSeasonBtn(label, openerKey)`：`advanceSeason` 成功後先播對應開場
  （衛冕 defend／止步捲土重來 comeback），播完 `renderCareer`。以按鈕點擊觸發＝每次進屆播一次
  （不靠 career.events 標記，故不受「已播事件跨屆保留」影響）。
- **A6 離開確認**（本輪補；Sawmah 07-23 二次拍板加雙保險）：`matchStage.js` 生涯賽才建左上
  「✕ 離開」按鈕＋自訂確認彈窗「中途離開球場將記棄賽敗（0:25）——確定離開？」（確定離開／
  繼續比賽）。確認＝走既有 `careerReturnUrl` 導航回生涯畫面，pending 未清→`resolveForfeit`
  記 0:25 敗——**棄賽機制不變**。**beforeunload 雙保險**：比賽未完賽（phase≠set_over）時
  reload／關頁跳瀏覽器通用確認框（文字瀏覽器內建不可自訂——安全限制，寫不了「離開球場」）；
  完賽或已按離開鈕確認＝先卸監聽不攔（局終正常返回不被通用框擋）。

## 2. Part B 逐出機制

- **資料層**：`save.recruitment.expelled: []`（schema createSaveV2 預設；deserialize 對舊檔缺鍵容錯）。
  條目 `{ member(完整成員快照), seasonIndex, titlesAtExpel }`（Phase 4 轉學回歸素材鏈）。
- **`store.applyExpel({ memberId })`**（careerStore.js）：`applyRecruit` 的鏡像，單次 `writeSave`
  原子完成三處——① `roster.members` 移除 ② `lineup.trust` 全體 −5（夾限≥0）並移除被逐者自身 key
  ③ `recruitment.expelled` push 條目。邊界最後防線：`canExpel(prev)` 不 ok＝原樣 no-op。
- **`canExpel(save, memberId)`**（recruitment.js，純函式，UI 閘門與 store 共用）：僅招募生
  （origin≠'starter'）、不在現役先發或自由人位、每屆上限 1（`expelCountThisSeason`）。回傳
  `{ ok, reason }`，reason ∈ {not-found, starter-origin, in-lineup, season-limit}。
- **逐出 UI**（careerScreen.js `showMemberCard`）：招募生成員卡底部逐出區。二次點擊確認（同「開始
  生涯覆蓋」範式）：第一按變紅「將永久失去 {名}——再點一次確認」＋後果一行全揭露（全隊信任 −5・
  本屆不可再逐・{來源隊}不可再招）；第二按 `applyExpel`→播 `EXPEL_LINES`→重繪（§9 鉤子順勢自動入隊）。
  不可逐時顯示對應提示（在先發/自由人位／本屆額度用完）。
- **招募列「已離隊」**：`recruited` 含該隊但名冊查無成員＝已逐出，顯示「✗ {名} 已離隊」（凍結、防重招）。
- **`EXPEL_LINES`**（events.js）：被逐者＋隊長各一行佔位台詞（平靜克制），標 TODO(naming)。

## 3. 偏差表（與任務書字面的落差＋理由）

| # | 項目 | 任務書字面 | 實作 | 理由 |
|---|------|-----------|------|------|
| D1 | `nextRecruitId` 回收防護 | 未明講實作 | 改 count-based → **max(members ∪ expelled 之 R 號)+1** | 原 count-based 在逐出移除成員後會**回收 R id 並與現存成員撞號**（既是真 bug、又違測試 4「R id 不回收」）。無 expelled 時與原 count+1 等價 → 回歸 byte-identical 成立（測試 6 佐證）。 |
| D2 | 名冊上限「一行」 | 「roster.js 上限常數，一行」 | 改 **兩處**：`schema.js:23`（createSaveV2 預設，真正生效處）＋`roster.js:90`（openSlots `?? 12` 回退） | 只改 roster.js 回退**不生效**——新存檔容量由 createSaveV2 寫死，openSlots 讀 roster.capacity 而非回退。要達成「上限 12」目標必須改 schema.js:23。 |
| D3 | 先發保護範圍 | 「`lineup.starters` 內不可逐」 | 一併擋 **現役自由人**（`lineup.libero === id`）——**Sawmah 07-23 確認保留** | 白浪招募生（小浪）是 libero 角色，若設為現役自由人又被逐會孤兒化 `lineup.libero`（下次 ensureLineup 靜默重置陣容）。同類防護、防 latent bug；UI 提示併作「先發／自由人位」。 |
| D4 | A6 確認彈窗載體 | 「離開前確認彈窗」（實測痛點＝reload/誤觸記敗） | 「離開」按鈕＋自訂彈窗，**加 beforeunload 雙保險**（Sawmah 07-23 二次拍板選定） | 自訂文案只能掛自家按鈕；reload/關頁層由 beforeunload 補（通用框文字瀏覽器內建不可自訂）。完賽/已確認＝卸監聽不重複攔。**殘餘限制**：手機 PWA（standalone）對 beforeunload 支援不一；「上一頁」手勢在部分瀏覽器不觸發。 |
| D5 | `applyExpel` 回傳語意 | 未明講 | 回傳 `writeSave` 的寫入布林（鏡像 applyRecruit）；不符資格＝no-op 但仍回寫入結果 | UI 已用 `canExpel` 先擋，no-op 僅競態/防線。測試以「狀態不變」而非回傳值驗證邊界擋下。 |
| D6 | A6 自動化測試 | — | 無（DOM 層） | 比照專案慣例（matchStage/matchLoop 為 three.js/DOM，靠試玩；測試涵蓋 sim＋生涯純邏輯）。 |

## 4. 招募池鐵律與 W6 預告

- **招募池鐵律（已定案設計原則）**：可招募池 > 空位數（上限−7）。全收集必然要逐；逐出定位＝
  「為想要的人騰位」的戰略選擇，非空位管理。
- **W5 現況（數字尚未咬）**：cap 12 → 空位 5（現員 7）；招募池＝5 隊（`RECRUIT_DEFS`）＝**恰好容納**。
  故 W5 逐出是**選擇性戰略**（例：換掉弱轉學生），非強制。**鐵律要 W6 擴池後（pool > 5）才真正咬**。
- **W6 預告（本輪明確不做）**：
  - **擴池雙路並用**：新隊伍帶招牌球員 2-3 支＋既有隊伍第二人 → pool 破 5、鐵律咬、逐出成剛需。
  - **賽中換人**：`cancelFaultPoints` 接線點現維持純註解（A3）；W6+ 上線。
  - 被逐者轉學新隊、下屆回歸對戰（Phase 4 素材鏈；本輪 expelled 條目欄位已存齊備料）。

## 5. 命名工程待辦（續列，勿遺漏——全案已補 `// TODO(naming)` 錨點）

命名工程 Phase 3 收尾統一潤稿；以下佔位點皆已標 `// TODO(naming)`：

| 位置 | 內容 |
|------|------|
| `roster.js` STARTER_DEFS | 創隊六人 name/persona（阿哲/大山/阿烈/小飛/阿岩/小守） |
| `recruitment.js` RECRUIT_DEFS | 五名招牌轉學生 name/persona（阿澄/小浪/阿曜/阿鐵/阿鷹） |
| `careerState.js` buildOpponentTeam | 對手球員名「隊名＋N號」動態組法 |
| `opponents.js` OPPONENTS | 五隊 name/trait（北原工商/白浪高中/曜石體中/鐵霧工業/天鷹學園） |
| `events.js` EVENT_DEFS | 全部 speaker 角色代號（隊長（MB）、二傳（S）、各校角色…）與台詞 |
| **`events.js` EXPEL_LINES**（本輪新增） | 逐出兩行台詞（被逐者＋隊長） |
| **`events.js` SEASON_OPENERS**（本輪新增 A4） | 衛冕（defend）／捲土重來（comeback）兩段開場隊長台詞 |

## 6. 跨屆 balance 治具待補（註記）

- 平衡治具 `tools/balance-sim.mjs` **現只跑單屆**（W4 招募臂數據亦單屆）。W5 引入跨屆難度
  綁定（衛冕屆對手 +3×titles）與逐出後名冊變動，**尚無跨屆平衡治具**。
- 待補：跨屆迴圈治具（連跑多屆、統計「衛冕難度爬升 vs 名冊成長」是否收斂），供 W6 擴池/換人
  的平衡調整用。本輪僅確保機制正確與決定論，平衡數據不設門檻（同 W4 慣例）。

## 7. 測試

- **新增 `tests/expel.test.mjs`（6，B6 全清單）**：① 原子性（RMW 三處同完成＋完整快照）
  ② trust 夾限（全體−5≥0、主角不受影響）③ 邊界擋下（創隊班底/先發中/每屆限 1）
  ④ 招募連動（額滿→逐出→自動入隊 trust=10、被逐隊不重入、R id 不回收）
  ⑤ schema expelled roundtrip＋舊檔冪等不 brick ⑥ 未逐出存檔 deserialize 冪等、canExpel 純讀。
- **更新既有斷言**（反映 W5 預期變更，非遷就實作）：`schema-v2.test.mjs`（cap 10→12、
  recruitment 預設加 expelled:[]）、`recruitment.test.mjs`（同上預設形狀）。
- **`tests/season.test.mjs` 7 測**（草稿沿用）：季迴圈重置 results 不清 recruitment、
  衛冕對手升級/止步原強度、matchSeed 跨屆不同、titles 投影 roundtrip 等。
- 合計 **266 全綠**；`src/sim` 零改動。
