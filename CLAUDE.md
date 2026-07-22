# CLAUDE.md — 排球夢（3D 排球生涯遊戲）

> 進度與驗收見 `docs/ROADMAP.md`；設計定案見 `docs/design-brief.md`——**已定案決策清單不重開討論**。
> 回覆一律繁體中文。

## 現況

- **Phase 0 已完成並通過真機實測**（2026-07-21）。**美術路線 2026-07-22 轉向**（Sawmah 裁定）：
  寫實蒙皮模型 → vow3d 式幾何關節球員（`geoCharacter.js`＋`geoAnimator.js`，零模型檔）＋
  夜賽聚光燈氛圍；姿勢/比例調參直接改該兩檔常數。
- **Phase 1 已結案**（2026-07-22，快照見 `docs/phase1-final-status.md`）；可調參數集中在
  `game.js TUNING`、`cameraRig.js CAMERA_TUNING`、`ai.js` 頂部常數；`?mode=bench` 保留
  Phase 0 基準場景、`?classic=1` 全手動操作。
- **Phase 2 生涯模式進行中**（九題＋新機制全定案：`docs/kickoffs/phase2-decisions-RESOLVED.md`；
  結論回填版 `docs/kickoffs/phase2-kickoff.md`）。**stage 1 存檔層＋生涯外框已上線**：
  預設入口＝生涯選單（`?quick=1` 直達單場、`?career=resume` 開機直入賽程視圖）；
  存檔 `vd-career-v1`／`vd-career-player-v1` 分 key＋JSON 匯出匯入；生涯層在
  `src/career/`（careerState 純函式＋careerStore 可注入介面卡）、UI 在
  `src/ui/careerScreen.js`；局終先落檔再返回生涯。**stage 2 已上線**：對手參數檔
  `src/career/opponents.js`（level/attrBias/roleBias/trustBias/ai 風格/識別特徵）＋
  錦標賽流程（小組 3 場保底→全國賽單淘汰：八強鐵霧/準決賽再遇曜石/決賽天鷹；
  落敗＝止步、全勝＝冠軍）；AI 風格經 `createGame({aiProfiles})` 注入
  （`ai.js aiProfileOf`：tipRate/dumpRate/powerServeRate）；存檔自動遷移（現為 v3）。
  **stage 3 已上線**：成長雙層——`src/career/growth.js`（事件歸因→點數、屬性 +1 上限 90、
  技術解鎖：吊球/假動作/強力發球/後排 pipe；生涯新人全鎖、快速比賽全開）；假動作熟練度
  →sim 騙敵乘子（`player.js feintMasteryMul`）；讀攔網提示綁 reaction 三檔。
  **stage 4 已上線**：場內動態信任（`state.trustDyn` 連得＋/連失−、effectiveTrust 即時反映
  分配）＋trust 地板（`Player.trust.floorShare` 生涯主角 0.27 保底球權）＋資料驅動事件表
  （`src/career/events.js` 宣告式 when 條件；updateTrust＝劇情層專用、sim 內禁呼叫）。
  後續：stage 5 Scouting AI＋情蒐錄影帶＋宿敵種子。

## 架構鐵律（違反即停）

1. `src/sim/` 是純模擬核心：**零 three.js 依賴、固定步長 60Hz、決定論**。
   畫面/輸入絕不寫進 sim；sim 的改動必跑 `npm test`（決定論測試在 `tests/`）。
2. 不鎖幀：rAF 跟隨裝置更新率；**禁止自我降級特效**——降規只走 URL 參數（手動）。
3. 可包殼：產出必須是乾淨靜態 PWA（TWA / Capacitor 皆可包）。

## 常用指令

```bash
npm run dev / build / preview / test
npm run deploy:pages   # gh-pages 部署（需 git remote）
```

## 工作流程約定（承 design-brief）

- **需要試玩時直接更新上傳，不必先問**（2026-07-21 Sawmah 授權）：commit → `npm run deploy:pages`。

- 每階段先產 kickoff 文件到 `docs/kickoffs/` → Claude.ai 專案討論 → 結論回填 → 實作 → 檢查點試玩。
- 地基級任務（回合 AI 狀態機、動作/物理模擬核心、資料層設計）用 Fable；日常實作 sonnet。
- 新架構級點子：Claude 主動提出 → Sawmah 拍板 → 當次寫入 design-brief。

## 真機偵錯

頁面掛有 `window.__phase0`（world/renderer/scene/camera/quality），供 console 檢視執行期狀態。
