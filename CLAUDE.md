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
  `src/ui/careerScreen.js`；局終先落檔再返回生涯。後續：stage 2 對手參數化＋錦標賽流程。

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
