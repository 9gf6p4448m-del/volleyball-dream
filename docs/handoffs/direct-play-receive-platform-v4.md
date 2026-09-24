# 直接操作接球平台：direct-v4（2026-09-24）

## 接手順序

先讀 `docs/DIRECT_PLAY_BLUEPRINT.md` 的「滑動調整接球平台（direct-v4）」段、凍結的驗收條件 `docs/kickoffs/direct-v4-receive-swipe-acceptance.md`，再看本檔與 [direct-v3 交接](direct-play-receive-assist-v3.md)。前一個可玩版是 direct-v3（commit `c328629`，分支 `feat/direct-v3-receive-assist`）。

## 為什麼要改物理

direct-v3 的墊球把兩條前臂當成兩根獨立圓柱，出球方向由「球擦到圓柱哪一側」決定。實測站偏 30 公分，側向出球就高達 6.5 m/s，而且常往自己背後飛；平台角度幾乎不起作用。這很可能也是玩家覺得「接球很難控制方向」的主因。使用者裁定走「平台面法線」。

## 這輪可玩的改動

- **平台面法線**（`src/sim/directPhysics.js` 的 `platformNormal`、`collideBody`）：墊球時，球打到主動前臂或手的上側（膠囊法線與平台面法線夾角 < 60°，`platformFaceCos`），衝量改用兩臂併攏構成的平面法線；打到側面或下側時仍用膠囊法線，擦邊的歪球照樣會歪。碰撞偵測與位置投影仍用原本的膠囊，觸球範圍沒有放大。
- **中性平台姿勢**（`src/sim/directPose.js`）：手放低，前臂約下傾 40°，出手期手與手肘同速上抬（每 phase 0.11 倍身高），觸球窗口內平台角度不變，球往前上方送。
- **滑動選平台**：`passType` 可選 `HIGH`（手抬高 0.07h）、`LOW`（手放低 0.07h）、`LEFT`／`RIGHT`（前臂繞肩線水平轉 ±20°）、`NEUTRAL`。只在「同 tick 開始墊球」或墊球準備期採用；角度以每秒 15 單位過渡，只在準備期移動，觸球窗口起鎖定，所以平台轉動永遠不會變成衝量。晚選只會轉到部分角度。
- **輸入**（`src/input/directControls.js`、`directInput.js`）：墊球時按住出手鈕滑動，以主要方向判定（死區 12px）：上＝高球、下＝低球、左右＝偏向。左右滑仍保留原本的改朝向行為。鍵盤墊球一律 `NEUTRAL`。注意墊球準備期只有 8 tick（約 133 ms），手勢必須在按下後很快甩出。
- **提示**（`src/app/directPractice.js`，入門／標準顯示，進階不顯示；只畫面）：金色平台朝向線（由共享姿勢算平台法線）；來球可接時出手鈕外圈收縮，接近最佳時機時轉金色。
- **接球方向練習**：餵球選單「接球方向練習」使用正式墊球餵球（模擬核心沒有新分支），地上橘色目標區依序在網前中、左、右（z = 1.6 m，半徑 1 m）；球結束後顯示命中，或偏左／偏右／偏網前／偏短的公尺數。
- **版本**：模擬版本升為 `direct-v4`，`direct-v3` 錄影明確拒絕。

## 實測數字（預設站位 z = 5、第 29 tick 按下、正式墊球餵球）

| x = 0 | 出球速度 (vx, vy, vz) | 觸球後弧頂 |
|---|---|---|
| 不滑 | (0, 5.8, −5.1)，往球網 | 2.83 m |
| 高 | (0, 7.8, −1.8)，短高球 | 4.24 m |
| 低 | (0, 3.7, −6.7)，低平快 | 1.70 m |
| 左／右 | vx −3.4／+3.4 | 2.7 m |

方向練習的瀏覽器治具中，高球命中中央目標區，離中心 0.5 m。

## 經使用者同意修改的既有判準（2026-09-24）

這些都寫死了 direct-v3 的幾何，v4 改了平台姿勢與法線後失效；每條都附改後的突變驗紅：

1. 回放測試版本字串 `direct-v3` → `direct-v4`，另加 `direct-v3` 必須拒絕（加嚴）。
2. CCD 曲線路徑測試的端點間隙前提 1 cm → 5 mm（v4 出手窗口內端點間隙固定 9.8 mm）；子步數改成 1 的突變仍會紅。
3. 時機／朝向測試的球，從寫死的 y = 1.1 改成由姿勢算出「對準那一刻手的位置」；三個斷言不變。
4. v3「轉身不加衝量」遊戲層測試：原本是單一情境 |dv| < 1 m/s，改為 466 個觸球時仍在轉身的情境與「轉身已完成」對照組差異中位數 < 0.15 m/s（現行 0.041；拿掉排除轉身的突變為 0.35）。
5. 瀏覽器治具：`--assist` 觀察窗口 `tick < 42` → `< 43`；預設模式接球後推進 `step(12)` → `step(14)`（v4 平台觸球比 v3 晚 1～2 tick）。

## 驗證方式

```powershell
node --test tests/direct-physics.test.js tests/direct-input.test.js tests/direct-shot.test.js tests/direct-pass.test.js
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
# 另開 PowerShell，設定 PLAYWRIGHT_MODULE 與 DIRECT_BASE_URL 後：
node tools/direct-play-browser.mjs --pass
node tools/direct-play-browser.mjs --assist
node tools/direct-play-browser.mjs
node tools/direct-play-browser.mjs --motion
```

## 已知限制與待裁定

- **迎球轉身讓站偏的球往側邊偏**：v3 的自動迎球讓身體面向「球當下的位置」。在平台面法線下，站偏 30 公分時，不滑的墊球 vx 約 ±3.9 m/s。可考慮改成「面向來球路線」，但會改到 v3 已定案的行為，等真機試玩後由使用者裁定。
- 墊球準備期只有 133 ms，滑動手勢在手機上來不來得及，要真機試玩確認。
- 目標區顏色偏淡，截圖上不明顯。
- 證據都來自桌面 Chromium 模擬手機尺寸，不是實體手機。
