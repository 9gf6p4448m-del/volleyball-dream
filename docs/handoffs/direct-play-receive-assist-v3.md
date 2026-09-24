# 直接操作接球迎球容錯：direct-v3（2026-09-24）

## 接手順序

先讀 `docs/DIRECT_PLAY_BLUEPRINT.md` 與 [direct-v2 交接](direct-play-motion-v2.md)，再看本檔與 `docs/experiments/direct-play-evidence/assist-browser.json`、`*-receive-assist-approach.png`／`*-receive-assist-contact.png`、`delivery.md`。前一個可玩版是 `0254e59`，回退分支 `checkpoint/direct-play-before-receive-assist-0254e59`。

## 這輪可玩的改動

- **接球小幅迎球（Receive Assist）**：`src/sim/directGame.js` 的 `receiveTurnTarget`。墊球動作的準備期＋出手期內，若球正在接近、位於手動朝向的 60° 錐角內、水平距離 ≤ 1.1 倍身高、球心高度在腳底上方 0～1.3 倍身高之間（以 0.65h 為中心 ±0.65h），且球在身體前方超過 0.2h，身體以 4 rad/s 平滑轉向來球，最多 ±35°。觸球後在該次接觸期間保持角度，收招期回到手動朝向（收招 14 tick × 4/60 rad ≥ 35°，所以動作結束時轉角必為 0，不會瞬跳）。
- **不變的東西**：手動 `aim` 不被改寫；膠囊數量與半徑和「轉角為 0 的同一姿勢」完全相同（測試 `receive assistance uses the same unchanged capsule sizes…` 逐 tick 比對）；輔助只移動渲染與掃掠碰撞共用的同一個姿勢（`src/sim/directPose.js` 只在 `receive` 動作疊加 `receiveTurn`）。
- **不加衝量**：轉身的角速度不會進入觸球衝量。`collideBody`（`src/sim/directPhysics.js`）新增 `surfacePose` 參數，只用來算接觸表面速度；該 substep 有轉身時，遊戲迴圈傳入「轉角維持在 substep 開頭值」的姿勢。掃掠碰撞仍用連續轉動的姿勢，所以不會漏判。
- **參數**：集中在 `src/sim/directConstants.js` 的 `receiveTurnSpeed`／`receiveTurnLimit`／`receiveTrackCone`／`receiveTrackReach`。
- **版本**：模擬版本升為 `direct-v3`，舊 `direct-v2` 回放明確拒絕；舊生涯存檔與 legacy VCR 未改。
- **文案**：`src/app/directPractice.js` 的教練提示改為「走到球路上，提早按墊球；角色會小幅迎球」，閒置時的提示也同步改掉。

## 審查與修正紀錄

Codex 實作並完成瀏覽器驗收後，交由 Claude 接手審查：

1. **fresh opus 對抗審查找到 HIGH**：原實作把輔助轉身的角速度算進觸球衝量，晚按時身體會像揮拍一樣把球打出去。最壞案例（朝向 −17.5°、x = −0.45、第 34 tick 才按墊球）的 |Δv| 是 5.318 m/s；審查員自己的探針（朝向 −50°～50°、x ±0.45、第 18–34 tick 按下）量到 1276 次主動觸球中，有 32% 在觸球當下仍在轉身。這個最壞案例已寫成測試 `receive assistance rotation adds no ball impulse…`。修法就是上面的 `surfacePose`。這條先寫失敗測試，紅在行為斷言 `|dv|=5.318`；修正後 |dv| = 0.296 m/s。
2. **MEDIUM**：錐角、±35° 上限、1.1h 距離三道閘門，原本拿掉任何一道測試都不會紅。已補兩項直接擺球的測試；逐一突變拿掉錐角、距離、上限，都會紅在對應測試。
3. **LOW**：閒置提示每 300 ms 被舊文案覆蓋，已同步修正。
4. 修補後另派 fresh opus 覆審：上面三條都判定「真的修好」，決定論在 455 次逐 tick 還原／重播比對中 0 次不一致。覆審另外找到一條由 `surfacePose` 修法造成的 **MEDIUM（已記錄、未修）**，見「已知限制」。

## 驗證方式

在專案根目錄執行（瀏覽器治具步驟同 [direct-v2 交接](direct-play-motion-v2.md)）：

```powershell
node --test tests/direct-physics.test.js tests/direct-input.test.js tests/direct-shot.test.js
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
# 另開 PowerShell，設定 PLAYWRIGHT_MODULE 與 DIRECT_BASE_URL 後：
node tools/direct-play-browser.mjs --assist
node tools/direct-play-browser.mjs
node tools/direct-play-browser.mjs --motion
```

本輪實跑（`npm test` 輸出）：全套 2562 測通過，建置成功，`--assist`／預設／`--motion` 三種治具在 1280×720、844×390、390×844 三種尺寸都 PASS。`--assist` 在三種尺寸量到的 35° 來球迎球轉角都是 −0.600 rad，觸球 1 次，回放逐值一致。

## 已知限制

- 證據來自桌面 Chromium 模擬手機尺寸，不是實體手機。iPhone 14 Pro 真機的觸控手感與「迎球幅度夠不夠、會不會太多」還沒有真人試玩驗證。
- portrait 的 approach 截圖被開場「SAWMAH GAMES PRESENTS」字卡蓋住一部分；轉角的判定以 `assist-browser.json` 的數值為準。
- **MEDIUM 未修：轉身擦球會吞掉後面的真墊球**。收招期轉回正向時，手臂若擦到球，因為表面速度不含轉動，這次首觸的衝量是 0，但仍開啟 `contactEpisode`；幾 tick 後真正迎到球時落在持續接觸分支，只削掉內向速度、沒有反彈，球被吸住落地。重現：朝向 −40°、x = 0.1、第 20 tick 按墊球（左右對稱：40°、x = −0.1）。覆審員的網格（角度 −60°～60°、x −0.9～0.9、第 18～48 tick 按下，共 14800 局）中，修正前和無輔助時都能回傳、修正後卻回不了的只有這 2 局。另外試過「首觸零衝量時不開啟接觸期，只把球推開」：這兩局變成腿部弱回傳，整體回傳還少了 4 局，所以撤回。下一個可試的方向，是在持續接觸分支中，遇到內向速度明顯偏大的新撞擊時改走首觸分支，並用上述兩局當紅／綠樣本。
- 網格整體（「回傳」定義為球 vz < −1）：無輔助 3951 局、修正前 4845 局、本版 4907 局；本版相對無輔助多回傳約 1318 局、少 362 局，這是輔助改變觸球時機的取捨。
- 其餘未交付範圍同 direct-v2 交接的「尚未交付的大作範圍」。
