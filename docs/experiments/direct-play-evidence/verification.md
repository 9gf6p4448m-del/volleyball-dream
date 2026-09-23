# direct-v1 階段 1 驗證紀錄

2026-09-24；基準 e9f5164。真機指定 iPhone 14 Pro / Safari / 主畫面 PWA，尚未取得手機實測。

## 實跑

| 指令 | 實際結果 |
|---|---|
| `node --test tests/direct-physics.test.js tests/direct-input.test.js` | tests 31 / pass 31 / fail 0 |
| `npm test` | tests 2542 / pass 2542 / fail 0 / skipped 0 / duration_ms 57144.9984 |
| `npm run build` | 213 modules；PWA precache 33 entries；exit 0。既有大型chunk與lockstep動靜import警告仍在 |
| `node tools/direct-play-browser.mjs` | PASS 3 viewports: real input, jump, cancel, replay, layout, disposal |
| `node tools/direct-play-browser.mjs --delivery` | PASS delivery: menu navigation, direct practice, export metadata; direct-v1 · 2026-09-24 02:20 |
| `git diff --cached --check` | 無輸出、exit 0 |

瀏覽器測試環境：`DIRECT_BASE_URL=http://127.0.0.1:4175`（正式build preview），`PLAYWRIGHT_MODULE=C:\Users\shung\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright`。使用既有runtime，未增加套件依賴。瀏覽器版本由該runtime Chromium提供，不代表Safari。

三尺寸每種固定接球連續5次；原生雙觸控同時移動/瞄準、touchCancel後煞停；獨立跳躍、固定高球扣擊；重新開始重新建input timeline；實際app迴圈在30/60/120Hz回放相同；相同快照及指令還原。截圖已開圖检查主角/球網/控制區，另修正出手按鈕hover對比及設定面板疊層，後者有elementFromPoint實測。

`initialPerformance` 是短時間桌面headless量測；`syntheticPlaybackMetrics` 含合成幀節奏，不得當效能證據。尚未通過手機60FPS或完整6v6的10分鐘門檻。

## 失敗→修正證據

- 淺擦碰：新增測試先輸出 `0 !== 1`；保守推進耗盡後改用有界區間求交。修後命中0.1mm切入，0.1mm外側仍不命中。
- 先落地再碰小腿：新增測試先輸出 `1 !== 0`；環境與身體比較首次碰撞時間。修後只有ground、contacts=0；身體先碰改變路徑則不沿用原落地判定。
- 原輸入重開時間軸與表單keyboard問題均經獨立覆核為真修。核心第三輪定向覆核0 CRITICAL/HIGH/MEDIUM；新增menu/export/debug loop經JS覆核無HIGH。
- 開發伺服器驗證中曾有一次固定接球失敗；未以重試掩蓋。凍結正式build後，三尺寸各連續5次相同旅程均通過；開發時熱更新與測試並行的影響未單獨量測，不宣稱已確定根因。

## 範圍檢查

相對基準只增加direct實驗路徑，未重寫既有遊戲判定或存檔。

| 檔案 | 對應需求 |
|---|---|
| src/sim/directConstants.js | 固定步長、身體與動作參數集中 |
| src/sim/directPose.js | 畫面/碰撞共享姿勢 |
| src/sim/directPhysics.js | 連續接觸、衝量、首次環境碰撞 |
| src/sim/directGame.js | 單人訓練狀態與版本化回放 |
| src/input/directInput.js | tick命令與去重 |
| src/input/directControls.js | 手機/鍵鼠與取消清理 |
| src/render/directPlayerView.js | 依碰撞膠囊直接呈現身體 |
| src/app/directPractice.js | 訓練場、固定步迴圈、回放、裝置匯出 |
| src/app/directPractice.css | 三尺寸控制區與可讀性 |
| src/main.js | 隔離direct路由 |
| src/ui/careerScreen.js | 現有PWA主選單可進訓練 |
| tests/direct-physics.test.js | 接觸/擦過/時機/版本/還原驗收 |
| tests/direct-input.test.js | 操作、雙指、鍵盤與取消驗收 |
| tools/direct-play-browser.mjs | 真實瀏覽器、截圖、送達與匯出驗證 |
| docs/DIRECT_PLAY_BLUEPRINT.md | 已確認設計、介面與階段門檻 |
| docs/design-brief.md | 新操作決策取代舊第一人稱/無提示條款 |
| FREEBALL_CLAUDE_CODE_SPEC.md | 舊藍圖與Master Prompt標為歷史 |
| README.md | 新入口及接手連結 |
| docs/handoffs/INDEX.md、direct-play-stage1.md | 明天接手與尚未驗收界線 |
| 本資料夾 JSON/PNG/Markdown | 驗證與送達證據 |

使用者原本未追蹤的 AGENTS.md 保留，未納入提交。
