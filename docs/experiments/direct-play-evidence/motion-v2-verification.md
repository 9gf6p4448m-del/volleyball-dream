# direct-v2 動作與四向扣球驗證（2026-09-24）

基準 `bfc867c`；回退分支 `checkpoint/direct-play-before-motion-bfc867c`。測試位置為本機正式 build preview `http://127.0.0.1:4175`；瀏覽器是既有 Playwright runtime 的桌面 Chromium、模擬三種 viewport，**不是 iPhone 或 Safari**。

| 指令 | 實際輸出 |
|---|---|
| `node --test tests/direct-physics.test.js tests/direct-input.test.js tests/direct-shot.test.js` | tests 42 / pass 42 / fail 0 |
| `npm test` | tests 2553 / pass 2553 / fail 0 / skipped 0 / duration_ms 63537.2348 |
| `npm run build` | 213 modules，PWA precache 33 entries，exit 0；既有大型 ui/three chunk 及 lockstep import 警告仍在 |
| `node tools/direct-play-browser.mjs` | `PASS 3 viewports: real input, jump, cancel, replay, layout, disposal` |
| `node tools/direct-play-browser.mjs --motion` | `PASS motion: 3 viewports with run, jump, land, set, block, dive captures`，並以原生 touch 驗證上滑 TIP／左、右斜線 |

命令執行前設 `PLAYWRIGHT_MODULE=C:\Users\shung\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright` 與 `DIRECT_BASE_URL=http://127.0.0.1:4175`。完整機械報告在 `browser-report.json` 和 `motion-browser.json`。前者確認三尺寸都有 5 次固定接球、真實高球扣擊、取消、回放與界內 UI；後者記錄各動作擷取。

主對話實際打開檢查的截圖：

- [跑動 12 tick](desktop-motion-run-12.png)、[18 tick](desktop-motion-run-18.png)、[30 tick](desktop-motion-run-30.png)：可見交替步相及鞋底。
- [落地](desktop-motion-land.png)、[魚躍](landscape-motion-dive.png)、[攔網](portrait-motion-block.png)：低身、雙臂、落地與場地控制區。
- [上滑吊球](desktop-motion-tip.png)、[左斜線](desktop-motion-cross-left.png)、[右斜線](desktop-motion-cross-right.png)：單手推送與軀幹朝向有分別；手機直式亦看過[吊球](portrait-motion-tip.png)。

真實球路不是按選項送到定點。整合覆審用控制器 pointer 事件一路推進到 sim 並實際碰球：左滑 `vx=-12.636211 m/s`、下滑直線 `vx=-0.099556 m/s`、右滑 `vx=+12.488679 m/s`；三種皆 `contacts=1`。單手吊球小弧擊球約 `5.29 m/s`，相同條件重扣約 `18.72 m/s`。這是重建的固定訓練狀態，不代表實際比賽落點分布。

第一輪 Astra code reviewer 找到兩項：LINE→TIP 手掌原本瞬移 0.3136367 m、靜球漏碰；起跳後魚躍落地時 torso 最低 -0.0259016 m。第二位 JS reviewer 找到上滑 TIP 殘留至下一次鍵盤 J。三項均有舊版行為紅、新版綠的回歸測試。fresh Astra 覆審以原始漏球座標驗得 `contacts=1`，故障注入立即切換再次得 `contacts=0`；另掃 1,440 個切換球種案例與 532,500 個身高／動作／落地姿勢樣本，漏球、穿地均為 0。覆審三項皆判「真的修好」，沒有新增 HIGH／CRITICAL。

效能：正式 build 的 headless 初始窗口桌面約 10.7 FPS、portrait 約 19.0 FPS；landscape 只有 2 幀，約 1.46 FPS，樣本不足。畫面約 88–120 draw calls。`--motion` 先暫停再單步，所以其 `frames=0/fps=0` 不是實時效能。這些桌面軟體渲染數值不能推論 iPhone 14 Pro 的流暢度；手機 PWA 的觸控與 10 分鐘六對六效能仍待真機驗收。
