# 墊球「按住預選、放開出手」：驗收條件（2026-09-25 動手前凍結）

使用者裁定（2026-09-25，手感方案甲）：觸控墊球改成先按住出手鈕、滑動選平台方向，**放開**的那一刻才開始墊球。原本按下就開始墊球，左右滑必須擠在 8 tick（約 0.13 秒）的準備期內。

範圍：只改輸入層與畫面（`src/input/directControls.js`、`src/app/`），**模擬核心不動**（`src/sim/` 零改動，`SIMULATION_VERSION` 維持 `direct-v5`）。扣球、舉球、攔網、起跳、餵球、鍵盤都維持按下即出手。

本檔凍結後，任何會讓通過機率上升的修改（降門檻、縮案例、改量測方式）須先寫明原標準錯在哪，並取得使用者對該條的明確同意。

## 輸入（`tests/direct-input.test.js` 同款治具）

- **A19a 按下不出手**：動作為墊球時，出手鈕 `pointerdown`、`pointermove` 都不送出 `receive` 動作（取樣結果只有 `null`）。
- **A19b 放開才出手**：`pointerup` 時送出且只送出一次 `receive`，同一筆指令的 `passType` 等於按住期間最後一次滑動的分類（沿用 `receivePassType`：左滑 `LEFT`、右滑 `RIGHT`、其他 `NEUTRAL`）；放開後再取樣不會重送。
- **A19c 取消不出手**：按住期間發生 `pointercancel`、視窗 `blur`、頁面隱藏，都不送出 `receive`，且之後的 `pointerup` 也不送。
- **A19d 按下時鎖定動作**：按下時動作選單是墊球、按住期間把選單改成扣球，放開時送出的仍是 `receive`；反之按下時是扣球，行為與現行相同（按下即出手）。
- **A19e 按住期間的選擇看得到**：按住時出手鈕帶有 `data-pass-choice` 屬性，值隨滑動改為 `LEFT`／`RIGHT`／`NEUTRAL`；放開或取消後移除。

## 真實指令鏈與瀏覽器

- **A19f**（修改既有 A3b，使用者選甲即同意改輸入規則）：A3b 原本在第 29 tick `pointerdown`＋滑動即出手；改為第 29 tick `pointerdown`＋滑動、同 tick `pointerup`，其餘斷言（主動前臂或手觸球、不轉身、左滑出球 vx ≤ 中性 −0.5、右滑 ≥ 中性 +0.5）一字不改。另加一例：第 20 tick 按下並滑動、第 29 tick 放開，結果須與「第 29 tick 按下並放開」相同方向（左右各一）。
- **A19g 瀏覽器原生觸控**：`--pass` 治具新增：選墊球、用 CDP `touchStart`／`touchMove`（左滑 30 px）／步進數 tick 後 `touchEnd`。斷言：按住期間 `player.action` 為 `null`、出手鈕 `data-pass-choice` 為 `LEFT`；放開後下一個 tick `player.action` 為 `receive`、`passType` 為 `LEFT`。三種尺寸都要跑。
- **A19h 提示文案**：畫面提示與結果訊息中「按墊球」相關描述改為「按住出手鈕、滑動選方向、放開墊球」的語意；金色時機提示代表「現在放開」。

## 整體

- **A19i** `npm test` 全綠（除 A19f 明列的 A3b 修改外，既有測試一行不動）、`npm run build` 成功；瀏覽器治具預設／`--assist`／`--motion`／`--pass` 全部 PASS；`git diff` 中 `src/sim/` 零改動。
- **A19j 鑑別力**：A19a／A19b／A19c／A19e 與 A19f 新增的一例，在修改前的程式碼上必須紅在行為斷言。

## 修訂紀錄

- **2026-09-25 動手前補列（02 §2.1 例外：原條件無論實作對錯都不可能通過）**：A19i「除 A3b 外既有測試一行不動」漏列了 `tests/direct-pass.test.js` 的 A7 測試。它第一段斷言「`pointerdown` 當下取樣即為 `[null, 'receive']`、滑動後 `passType` 在下一次取樣改變」，和 A19a「按下不出手」直接矛盾，任何符合裁定的實作都會讓它紅。修正：A7 第一段改為「按下與滑動期間取樣皆為 `[null]`；`pointerup` 時送出一次 `receive`，`passType` 等於期望分類；滑動不改朝向」，五組手勢（不滑、上、下、左、右）與「上下滑為 NEUTRAL」「不改朝向」「鍵盤墊球為 NEUTRAL」三項斷言全部保留。這個修改不會讓壞掉的實作變成通過：送錯分類、放開不出手、放開重送、滑動轉身，都仍然會紅。
