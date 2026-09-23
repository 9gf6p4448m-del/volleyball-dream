# 直接操作動作與四向扣球：direct-v2（2026-09-24）

## 接手順序

先讀 `docs/DIRECT_PLAY_BLUEPRINT.md`，再看本檔與 `docs/experiments/direct-play-evidence/motion-v2-verification.md`、`motion-browser.json`、`browser-report.json`。前一個可玩版是 `bfc867c`，回退分支 `checkpoint/direct-play-before-motion-bfc867c`。`docs/handoffs/direct-play-stage1.md` 記錄前版 direct-v1，測試數字與「膠囊造型尚非正式動作」敘述是當時狀態。

## 這輪可玩的改動

- `src/sim/directPose.js`：跑動時用實際位移累積步相、左右腿交替；起跳收腿、落地屈膝；接球／舉球／攔網／單手吊球／扣球／低身魚躍有不同剪影。腿部定長 IK 與地板約束同時供物理和畫面使用。
- `src/render/directPlayerView.js`：沿用原作幾何球員的隊衣配色、背號、深短褲、膚色小腿、白鞋。可觸球的四肢直接跟隨模擬膠囊端點，畫面不另播會偏離碰撞體的獨立動作。
- `src/input/directControls.js`、`directInput.js`：扣球按下開始準備；上滑單手吊球、下滑直線、左／右滑斜線。滑動同時調整朝向；觸球窗口後鎖定球種。下一次鍵盤或按鈕扣球會重設為直線。手勢對應承舊沙盒 `freeballControls.js`，但沒有沿用保底球或指定落點。
- `src/sim/directGame.js`：新增 `shotType`／`shotBlend` 的固定子步姿勢過渡，防止切換吊球時手臂瞬移並漏判碰撞。球種進入錄影與逐值回放；物理結果因實際手臂路徑、朝向、時機而變。
- 模擬版本升為 `direct-v2`。舊 `direct-v1` 匯出無法用新物理保真重播，故明確拒絕；舊生涯存檔與 legacy VCR 未改。

## 驗證方式

在專案根目錄執行：

```powershell
node --test tests/direct-physics.test.js tests/direct-input.test.js tests/direct-shot.test.js
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
# 在另一個 PowerShell 視窗繼續執行下列命令
$env:PLAYWRIGHT_MODULE='C:\Users\shung\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:DIRECT_BASE_URL='http://127.0.0.1:4175'
node tools/direct-play-browser.mjs
node tools/direct-play-browser.mjs --motion
```

瀏覽器治具針對正式 build preview 的三尺寸（1280×720、844×390、390×844）驗證真按鍵與原生雙觸控、固定接球與扣球、回放、界內 UI，以及步態、起跳落地、舉球、攔網、魚躍、三向滑動與吊球截圖。截圖已由主對話實際開圖檢查；`motion-browser.json` 的 paused `fps=0` 是治具單步狀態，不能當效能數字。

覆審先找到 LINE→TIP 會使手臂瞬移 31.36 cm、漏掉球，以及起跳後魚躍落地穿地 2.59 cm；均先建立失敗測試再修。第二位 JS 審查找到上次 TIP 殘留到下一次鍵盤扣球，亦先驗紅再修。fresh Astra 覆審對原漏球座標實跑現在 contacts=1，故障注入立即切換又會變 contacts=0；另掃 1,440 個球種過渡案例與 532,500 個姿勢樣本，漏判與穿地皆為 0。斜線在控制器事件至模擬的實際鏈路中產生不同橫向速度，無落點保底。

## 尚未交付的大作範圍

目前仍是一人一球訓練，未有完整三／四步助跑節奏、接球前停穩平台、攔網交叉步、魚躍翻滾後起身、12 人六對六自然回合、五位置差異、生涯直接操作整合及正式音畫演出。這些需逐項在共享姿勢與物理上延伸，不能只新增動畫而讓判定跟不上。球場／觀眾沿用舊場景；目前角色服裝與剪影有所改善，未達完整美術品質驗收。

指定真機為 iPhone 14 Pro、Safari、主畫面 PWA。桌面 Chromium 手機尺寸和短時間效能紀錄不能證明手機 60 FPS、長局 10 分鐘或觸控手感。先讓使用者在真機試一球並匯出紀錄，確認操作時機、可見觸球部位、實際 viewport 與持續幀時間，再擴充到藍圖階段 2–5。更新 PWA 時先完全關閉重開並對照訓練設定的 build 時間；不要刪 PWA 或清網站資料，以免失去本機生涯存檔。
