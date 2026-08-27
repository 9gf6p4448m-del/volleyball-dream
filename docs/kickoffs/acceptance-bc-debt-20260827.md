# 驗收凍結 — B/C 債清批（2026-08-27 夜）

> 落點基準：main `6c1a7cc`（凍結本檔時的 HEAD）、`npm test` 2216 全綠。
> 範圍鐵律：`src/sim/` 零改動（含 game.js）；本批全落在 render/ui/app/career 層。
> 每條驗收都寫明「什麼實作會讓它變紅」。

## A 重播視角抬高（使用者回報：touch out／關鍵得分重播視角太低）

- A1 `buildDirectorScript` 的決定性一拍鏡位（sig oh/mb/opp）與落點收尾鏡位（sig line）
  各宣告 `lift`（正數；提案值：決定性一拍 0.9、落點收尾 1.1）；其餘鏡位不帶 lift。
  **變紅**：任一慢動作鏡位缺 lift 欄位，或非慢動作鏡位帶了 lift。
- A2 兩個重播消費端（`matchLoop.js` runHighlightFrame 的 pullback 段、
  `replayStage.js` 的 pullback 段）套用 lift＝攝影機 position.y 加上 lift 後重新
  lookAt 原 target；現場（非重播）的 sig 招牌演出構圖**零改動**（cameraRig.js
  sig 分支的座標常數一行不動）。
  **變紅**：刪掉任一消費端的 lift 套用（突變測試）；或 cameraRig.js sig 段 diff 非空。
- A3 新測試：director 腳本對治具卷斷言「決定性一拍 shot 的 cam.lift>0、line shot 的
  cam.lift>0、發球/中段 shot 無 lift」；消費端套用測試對 lift 做刪除突變實測必紅。

## B4 重播音效接線（兩條回放路徑都是默片）

- B1 `runHighlightFrame` 與 `runReplayFrame`（含情蒐帶路徑）把該幀 frameEvents 餵給
  既有 sfx（沿 `replayStage.js:137` 的 `!jumped` 慣例：跳轉/快進大步時不餵，防事件連珠炮）。
  **變紅**：刪掉任一路徑的 onEvents 呼叫（突變測試）。
- B2 跳過重播（點擊/鍵盤/🎬）時，剩餘未播事件不得一次性全部發聲。
  **變紅**：跳過路徑把剩餘 frameEvents 餵進 sfx（測試斷言跳過後 sfx 呼叫數不暴增）。
- B3 新音效不新增音色資產——重用既有 `sfx.onEvents` 的事件→音色映射，零新合成器。

## C 小債

- C1 `heightGrowth.js` 第 4 屆起 no-op 改為**明文設計**：guard 處註解寫明
  「身高曲線只涵蓋高中三屆＝成長期結束，第 4 屆起 reveal:null 是設計不是漏做」
  ＋新測試斷言 `revealHeightForSeason(第4屆)` 回 `reveal:null` 且不 throw。
  **變紅**：把測試的屆數改回 1–3 會斷言失敗（no-op 只對 4+ 成立）。
- C2 數據頁「（進行中）」恆標：**驗證即可**（記載 08-25 已修）——指出守住該行為的
  既有測試檔:行號；若查無測試，補一條「最後一屆已結算時不帶（進行中）」。
- C3 續約與轉隊按鈕在 `advanceSeason`/`transferPro` 回 false 時，UI 必須出現可見的
  失敗訊息（文案含「寫入失敗」四字），不得靜默。新測試：store stub 回 false，
  斷言訊息出現在 DOM；stub 回 true 時訊息不出現。
  **變紅**：拿掉 else 分支（現況）測試即紅；反向（成功也顯示錯誤）亦紅。
- C4 `retireConfirmOpen` 補防呆：生涯畫面整頁重繪（renderCareer 級重入）時旗標歸位，
  重繪後能再次打開退休確認。新測試：開啟→模擬重繪→斷言可再開。
  **變紅**：拿掉歸位邏輯測試即紅。
- C5 賽前布置「押線」全數改名「賭線」（src 與 tests 的使用者可見字串＋相鄰註解；
  歷史 docs 不改）。動手前先 `grep -rn 押線 src tests` 數出分母 N 並記在回報裡。
  「壓手」零改動。
  **變紅**：改名後 `grep 押線 src/` 仍命中使用者可見字串；或 `grep 壓手` 的命中集合有 diff。
- C6 餵線量化說明：在「對手眼中的你」面板與 howToPlay 餵線條目補量化文案——
  數字**必須由常數插值**（樣本門檻 6、熱線 0.35、冷線 0.15），不得手寫字面數字；
  樣本門檻在 career 層立名（比照 SCOUT_HOT_SHARE 有意複製慣例）＋釘同步測試
  （與 `game.js` scoutBlockMul 的字面 6 對表）。
  **變紅**：文案手寫死數字（測試改常數值斷言文案跟著變）；或同步測試對不上 game.js。
- C7 `proEvents.js:99` 過時註解（「國外強權…不可玩」）改為反映現況
  （已可玩，入口＝transferPro，foreign-league 卷）。
  **變紅**：grep 該檔仍含「不可玩」字樣。

## 全域

- G1 `npm test` 全綠且總數 ≥ 2216＋本批新增數；G2 `git diff --stat` 不含 `src/sim/`；
  G3 不動任何既有測試的門檻/預期值——C5 改名連動的字串斷言更新除外（逐檔列明）。
