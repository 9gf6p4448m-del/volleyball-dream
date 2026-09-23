# 排球夢

玩法擬真、畫面寫實比例風格化的 3D 排球生涯遊戲（PC＋手機 PWA，Three.js）。
既有六對六比賽與生涯內容已上線；`?mode=direct` 是正在驗證的一人一球直接操作訓練，尚未接入正式生涯比賽。設計背景見 `docs/design-brief.md`，新方向見 `docs/DIRECT_PLAY_BLUEPRINT.md`。

## 快速開始

直接操作實驗入口：`?mode=direct`（一人一球，尚未接入生涯）。手機左手走位、右側瞄準，起跳與出手分開；扣球上滑吊球、下滑直線、左右滑斜線，球仍須碰到身體才會改變路徑。鍵盤 WASD／Space／J／R。訓練設定可選固定餵球、資訊輔助、身高、回放及鍵位。

新方向與驗收見 [直接操作藍圖](docs/DIRECT_PLAY_BLUEPRINT.md)，目前實作與接手事項見 [動作與四向扣球交接](docs/handoffs/direct-play-motion-v2.md)，原 [階段 1 交接](docs/handoffs/direct-play-stage1.md) 保留當時紀錄。舊 Free Ball 沙盒規格是歷史提案。

```bash
npm install
npm run dev      # 開發伺服器（手機同網段可用 --host 開放）
npm test         # 模擬核心測試（決定論、物理行為）
npm run build    # 正式建置（含 PWA service worker）
npm run preview  # 本機預覽正式建置
```

## 直接操作真機測試

1. 在 iPhone 14 Pro 的 Safari 或主畫面 PWA 開啟[公開直接操作訓練](https://9gf6p4448m-del.github.io/volleyball-dream/?mode=direct)，確認主選單 build 時間與[送達紀錄](docs/experiments/direct-play-evidence/delivery.md)一致。
2. 左手走位、右手瞄準並起跳，按住出手再往上／下／左／右滑動；觀察觸球部位、方向、落地與魚躍。訓練底欄顯示 FPS、frame p95、sim p95、backlog 與 draw calls；在訓練設定匯出回放，保留裝置與模擬版本資訊。
3. 驗收目標是實機持續 60 FPS、碰撞與畫面一致、雙手觸控不互相中斷；目前仍待真機驗證。若 PWA 保留舊版，完全關閉重開並比對 build；不要清除網站資料，以免影響本機生涯存檔。

## 逐項降規找上限（Phase 0 基準場 URL 參數）

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

### Phase 0 基準場換模型面數/材質等級

把新的 GLB（需含蒙皮動畫，Mixamo 匯出即可）丟進 `public/models/`，用 `?model=檔名.glb` 載入。
程式會自動依 12 名球員的身高表（1.70–2.02m）縮放模型、循環指派 Idle/Walk/Run 動畫。
此基準場使用 three.js 官方範例 `Soldier.glb`；正式比賽與直接操作訓練已改用程式幾何球員。

## 專案分層

```
src/
├── sim/      模擬核心：純 JS、零 three.js 依賴、固定步長 60Hz
│             legacy 比賽及 direct-v2 訓練各有自己的入口與版本
├── render/   three.js 球場、幾何球員、共享姿勢的訓練角色
├── input/    比賽操作、手機雙指直接操作與鍵盤指令
├── app/      正式比賽與一人一球訓練的運行迴圈
├── career/   生涯、隊伍與進度
├── ui/       畫面與 HUD
└── main.js   依模式載入對應入口
```

- **模擬核心與畫面/輸入分離**:`src/sim/` 只吃固定 `SIM_DT`，任何幀率下逐位元一致
  （`tests/determinism.test.mjs` 驗證）。未來單機餵 AI 指令、連線餵網路指令，核心不動。
- **可包殼**：純靜態 PWA 產出（`dist/`），Google Play 走 TWA、App Store 走 Capacitor 均可直接包。

## 部署

任何靜態主機皆可（`base: './'` 相對路徑）。GitHub Pages：

```bash
npm run deploy:pages   # 建置並推 dist/ 到 gh-pages 分支（需先設好 git remote）
```

## Phase 0 歷史基準

Phase 0 當時只有球場、12 名動畫球員、物理排球與 FPS/PWA。這段是舊基準歷史；現有正式比賽、生涯、AI 和直接操作訓練的範圍以上方交接與藍圖為準。
