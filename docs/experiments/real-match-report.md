# 寫實球員卷 2A「進賽場」驗收報告

> 驗收條件＝`docs/kickoffs/real-player-stage2-match.md` 第三節 B1–B12（凍結，未改動任何條文）。
> 分支起點：`ac41969`；本輪 commit：`284b5e5`、`b993c5a`、`2a8464f`（詳見文末 commit SHA 清單）。

## 結論

TODO：填入 B1–B10、B12 全過／哪幾條沒過。

## 方法

- 量測走**生涯比賽**（非快速比賽）：快速比賽 `game.bench` 恆空，B2 的 SUBSTITUTION 測不到。
  治具（`tools/real-match-browser.mjs`）直接呼叫 `resolveMatchConfig`→`buildMatchStage`→
  `startMatchLoop`（`main.js` `runMatch` 的同一組函式），跳過「新生涯精靈」與「出戰」按鈕的
  選單導航——換人仍走 `stage.handlers.requestSub` 唯一正式路徑（sim 端 `applySubstitution`），
  跳過的只是「怎麼點到這場比賽」的 UI 層。開賽的入場運鏡／情蒐帶／學招字幕（純表現層演出）
  以既有的 `hide()`/null 出場方式提前收掉，讓 sim 立刻開始 tick——處理方式與外觀無關，兩模式
  一視同仁。
- 牆鐘：Playwright `page.clock.install({time:0})` + `pauseAt(0)`（見下方「踩坑」）取得真正凍結
  的虛擬時鐘，`runFor(20000)` 分段推進；渲染呼叫在量測期間 no-op（CPU 側量測直讀
  `mesh.getVertexPosition`／`skeleton`，不依賴 `render()` 真的跑過），B12 截圖時才恢復真實渲染。
- 取樣：每 10 sim tick 一次（`SAMPLE_EVERY=10`），對當下所有可見球員量測；`?autopilot=1` 決定論
  代打；seed 清單 1、2、3（依序全部計入，未挑掉任何一卷）；合計每 seed ≥ 3 分鐘 sim 時間
  （TARGET_TICKS=10800）。
- SUBSTITUTION／LIBERO_SWAP：LIBERO_SWAP 在自動對戰中自然發生（每個 rotation 循環都會觸發）；
  SUBSTITUTION 由治具在 sim 迴圈內部（`matchView.sync` 的同一個 hook，非治具端牆鐘 polling——
  理由見下方踩坑）判斷「tick ≥ SUB_AT_TICK(3000) 且 phase==='serve'」時呼叫
  `stage.handlers.requestSub(outId, inId)`，兩模式必落在同一個 tick。

## 踩坑記錄（過程中發現並修正的治具缺陷）

這兩項不是產品缺陷，是**治具**（`tools/real-match-browser.mjs`）本身的邏輯錯誤，記錄在此供覆核：

1. **`page.clock.install()` 不會凍結時間**：沒有額外呼叫 `pauseAt()`，時鐘仍以真實速度在背景跑
   （只是起點改到 0），`runFor()` 是在那個背景基準上再疊加推進量。寫實模式每次 `page.evaluate`
   往返較慢，背景漂移量與幾何模式不同，會讓兩模式在「治具沒呼叫 `runFor` 期間」（例如
   `checkColors`／`pullFinalState` 等多次 `page.evaluate` 往返之間）各自多跑掉不同數量的 tick。
   實測：60 秒虛擬時間內，僅呼叫一次 `runFor` 後再靜置，`game.tick` 仍持續前進。修法：
   `install({time:0})` 後立即 `pauseAt(0)`，之後任何時間推進只能靠明確呼叫 `runFor`/`fastForward`。
2. **B2 檢查誤抓觀眾席**：`checkGeoPoolEmpty` 原本比對場上「任何 `InstancedMesh` 且
   `count>0`」，抓到了 `arena.js` 的觀眾席（`createArena` 建的單一 `InstancedMesh`，
   `count=712`，從開機就在、與球員外觀完全無關）。改成只比對 `capacity` 恰為
   `playerCount×1` 或 `×2` 的池（對應 `geoCharacter.js` 的 12 種 `PART_SLOTS`），並斷言
   candidate 池數＝12。
3. **B6 比對點不對齊**：兩模式各自 `runUntilTick` 粗推進（20 秒虛擬時間一個分段），
   在「≥3 分鐘」的長跑下，geo／real 兩邊落地的最終 tick 可能差 1–2 tick（實測 seed1 差 2
   tick）。在「各自的最終 tick」比對完整 `game` 序列化，比出的只是「兩個不同時間點的狀態
   自然不同」，跟渲染有沒有影響 sim 無關——第一輪全量跑因此誤報 B6 紅燈。修法：每個取樣點
   （每 10 tick）順手算一個輕量狀態簽章（分數＋球位置＋全員 `x`/`z`/`divedUntil`/`blockUntil`），
   比對「兩邊取樣都採到的最後一個共同 tick」；events 也裁到該 tick 再比。完整 `game` 序列化
   只在兩邊剛好落在同一個最終 tick 時才當額外佐證（此時 `null`＝不適用，不算失敗）。

以上兩項在加入**突變驗紅**後才被抓到：B2/B6 的突變測試本應「只讓對應那一條變紅」，第一輪
卻在「乾淨（未突變）副本」上就先紅了——這正是 `02-dispatch-rules.md §6.1` 第 1 條要求的「反面
也要驗」（健康狀態下這個證據會不會變綠）。修正後重新驗證：乾淨副本上 B2/B6 皆綠，四個突變
（B2/B3/B5/B6）各自只讓對應那一條變紅、其餘不受影響（見下方各條與 `mutation-b*.json`）。

## 基準

- 基準 commit：`ac41969`（分支起點，工作區乾淨）。
- 基準 `npm test`：`docs/experiments/npm-test-baseline-ac41969.log`
  ```
  ℹ tests 2603
  ℹ pass 2601
  ℹ fail 2
  ✖ A23a 真人追球（全部案例當分母）：舉球區 ≥ 34%、空接 ≤ 25%、碰網 ≤ 5%
  ✖ A23b 正前（1035）：舉球區 ≥ 38%、空接 ≤ 26.8%
  ```
  （兩項既有失敗皆在 `tests/direct-receive-assist.test.js`，與本卷無關，第一階段修正紀錄已載明。）

## 逐條驗收

### B1 開關與預設

TODO

### B2 替換完整

TODO（含突變驗紅：`mutation-b2.json`）

### B3 蒙皮跟隨與接地

TODO（含突變驗紅：`mutation-b3.json`）

### B4 身高

TODO

### B5 配色與背號

TODO（含突變驗紅：`mutation-b5.json`）

### B6 sim 不受影響

TODO（含突變驗紅：`mutation-b6.json`）

### B7 其他畫面不動

TODO

### B8 不自我降級

- (a) 單元測試：`tests/player-appearance.test.mjs`（決定函式輸入只有 storage/params，同輸入不同
  `performance.now` 替身輸出逐值相同）。指令：`node --test tests/player-appearance.test.mjs`。
- (b) CPU 6x 降速：TODO

### B9 載入失敗（邊界）

TODO

### B10 建置與測試

TODO

### B11 手機 FPS 閘門（使用者量）

本卷只負責摘要計算與其單元測試，**不宣稱已過**（需使用者手機實測）：

- `src/ui/fpsSummary.js`（平均／最低摘要，含「發球前」與「`document.hidden`」整格排除）
- 單元測試：`tests/fps-summary.test.mjs`（合成時間序列，含一段發球前、一段 hidden）
- 指令：`node --test tests/fps-summary.test.mjs`

### B12 截圖證據

TODO

## PWA 預快取

TODO

## npm test：基準 vs 最終

TODO

## git diff --stat

TODO

## commit SHA 清單

- `284b5e5` feat(real-match): 2A 外觀開關與寫實球員接入比賽畫面
- `b993c5a` test(real-match): 2A 驗收治具 tools/real-match-browser.mjs
- `2a8464f` fix(real-match): 治具 B2/B6 false-positive／false-negative 修正＋突變驗紅
- TODO：最終一筆（報告與收尾）

## git status

TODO

## 背景程序

TODO：dev server／mutation dev server 已關閉證據（netstat）
