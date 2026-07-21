# CLAUDE.md — 排球夢（3D 排球生涯遊戲）

> 進度與驗收見 `docs/ROADMAP.md`；設計定案見 `docs/design-brief.md`——**已定案決策清單不重開討論**。
> 回覆一律繁體中文。

## 現況

- **Phase 0 已完成**（基準測試場景），等 Sawmah 真機 FPS 實測結果才進 Phase 1。
- 通過 → 寫實美術定案；未通過 → 用 README 的 URL 參數逐項降規找上限。

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

- 每階段先產 kickoff 文件到 `docs/kickoffs/` → Claude.ai 專案討論 → 結論回填 → 實作 → 檢查點試玩。
- 地基級任務（回合 AI 狀態機、動作/物理模擬核心、資料層設計）用 Fable；日常實作 sonnet。
- 新架構級點子：Claude 主動提出 → Sawmah 拍板 → 當次寫入 design-brief。

## 真機偵錯

頁面掛有 `window.__phase0`（world/renderer/scene/camera/quality），供 console 檢視執行期狀態。
