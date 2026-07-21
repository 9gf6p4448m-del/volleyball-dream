# 排球夢 — Phase 0 基準測試

玩法擬真、畫面寫實比例風格化的 3D 排球生涯遊戲（PC＋手機 PWA，Three.js）。
本階段目的：**在真機上判斷「寫實比例美術」是否可行**。設計背景見 `docs/design-brief.md`，路線圖見 `docs/ROADMAP.md`。

## 快速開始

```bash
npm install
npm run dev      # 開發伺服器（手機同網段可用 --host 開放）
npm test         # 模擬核心測試（決定論、物理行為）
npm run build    # 正式建置（含 PWA service worker）
npm run preview  # 本機預覽正式建置
```

## 真機測試步驟

1. `npm run build && npm run preview -- --host`，手機連同一 Wi-Fi 開 `http://<電腦IP>:4173/`。
   （或部署到任何 HTTPS 靜態主機；**加到主畫面需要 HTTPS**，本機 IP 測 FPS 不受影響）
2. 看左上角 HUD：
   - **大數字 = FPS**（不鎖幀；120Hz 裝置會顯示 >60 的真實數值）
   - `render X ms/幀`＝畫面每幀耗時；`sim 60 Hz（固定60）`＝模擬固定步長，恆為 60
   - `三角形/draw calls`＝目前場景負載
3. 驗收標準（ROADMAP）：**穩定 60 FPS 為硬底線**；120Hz 裝置另記錄不鎖幀數值。

## 逐項降規找上限（URL 參數）

預設就是最高規格（**禁止程式自我降級**，數字是真實的）。降規全部用網址參數手動控制：

| 參數 | 值 | 說明 |
|------|-----|------|
| `?quality=` | `high`（預設）/ `med` / `low` | 一鍵預設檔 |
| `?dpr=` | `1`、`1.5`、`2`… | 渲染解析度倍率（最影響手機 GPU） |
| `?shadows=` | `off`、`512`、`1024`、`2048`、`4096` | 即時陰影貼圖尺寸；`off` 全關 |
| `?aa=` | `0` / `1` | 抗鋸齒開關 |
| `?players=` | `1`–`60` | 球員數量（測蒙皮動畫負載上限；>12 排場邊） |
| `?model=` | `xxx.glb` | 換用 `public/models/` 下其他模型 |

範例：`?quality=med&players=12`、`?shadows=off&dpr=1`、`?players=24`。

### 換模型面數/材質等級

把新的 GLB（需含蒙皮動畫，Mixamo 匯出即可）丟進 `public/models/`，用 `?model=檔名.glb` 載入。
程式會自動依 12 名球員的身高表（1.70–2.02m）縮放模型、循環指派 Idle/Walk/Run 動畫。
現用模型：three.js 官方範例 `Soldier.glb`（Mixamo 動捕，約 13.8 萬三角形 ×12 人）。

## 專案分層（架構鐵律，Phase 1 以後不得破壞）

```
src/
├── sim/      模擬核心：純 JS、零 three.js 依賴、固定步長 60Hz
│             （constants.js 場地/物理常數 · ball.js 球物理 · world.js 世界狀態）
├── render/   畫面層：three.js 場景、球場、球員、球的插值呈現、畫質設定
├── input/    輸入層：鏡頭操作（OrbitControls，滑鼠＋觸控共用）
├── ui/       HUD（FPS/效能面板）
└── main.js   組裝：rAF 不鎖幀 + 固定步長累積器，模擬與畫面完全脫鉤
```

- **模擬核心與畫面/輸入分離**:`src/sim/` 只吃固定 `SIM_DT`，任何幀率下逐位元一致
  （`tests/determinism.test.mjs` 驗證）。未來單機餵 AI 指令、連線餵網路指令，核心不動。
- **可包殼**：純靜態 PWA 產出（`dist/`），Google Play 走 TWA、App Store 走 Capacitor 均可直接包。

## 部署

任何靜態主機皆可（`base: './'` 相對路徑）。GitHub Pages：

```bash
npm run deploy:pages   # 建置並推 dist/ 到 gh-pages 分支（需先設好 git remote）
```

## Phase 0 邊界

只有基準測試場景：球場、12 名動畫球員、物理排球（重力/彈跳/觸網）、FPS 顯示、PWA。
**沒有**操作、規則、AI、劇情——那些是 Phase 1 以後的事。真機 FPS 測完才繼續。
