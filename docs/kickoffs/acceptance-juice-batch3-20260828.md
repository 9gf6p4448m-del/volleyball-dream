# 大作感卷 批3「光的化妝」驗收凍結（2026-08-28）

> 開工基準 SHA＝`26f6807`（批4 UI 皮膚）。sim-hash 開工前實跑合計＝`34d7a1367a2a8d99`（14 場，留底 scratchpad/simhash-before.txt）。
> 拍板依據：kickoff Q5（Sawmah 08-28）——預設檔＝現狀畫質＋輕量拖尾/塵土；bloom/地板反光掛 `?fx=high` 手動開（鐵律 2 慣例）；他手機實測 60FPS 過了才議改預設。
> 色調走批4金色（theme.js COLORS 單一來源）。本檔凍結後要改任一條照 02 §2.1。

## 範圍

- `src/render/quality.js`：新增 `?fx=high` 解析（預設/非法值＝off）。
- `src/render/postFx.js`（新）：EffectComposer＋UnrealBloomPass＋OutputPass 包裝層；off＝直渲 passthrough。
- `src/render/floorReflection.js`（新）：球場 Reflector 半透明反光（fragmentShader 補丁 alpha），只在 fx=high。
- `src/render/ballView.js`：金色火花拖尾（Points 池、加法混色、決定論偽亂數）；既有細線拖尾改吃 theme 金色。
- `src/render/matchView.js`：塵土池擴充（死球爆塵加量）。
- `src/app/matchLoop.js`／`src/main.js`：主場景渲染出口改走 postFx。
- 不碰：`src/sim/**`、replayStage/ritualStage/beatStage/kitPreview/recruitPortrait 等獨立小舞台。

## 驗收條件（A1–A8）

- **A1 `?fx` 閘**：無參數或非法值→`fx:'off'`；`fx=high`→`'high'`；describeQuality 顯示 fx 檔位。變紅的實作＝解析錯或預設變 high。機械驗：單元測試。
- **A2 預設檔零成本**：fx=off 時 composer factory **不被呼叫**、`createFloorReflection` 回 null。變紅的實作＝off 檔也建後處理。機械驗：spy 斷言。
- **A3 渲染單一出口**：`src/app/matchLoop.js` 內 `ctx.renderer.render(` 出現 **0 次**、`ctx.postFx.render(` **≥3 次**（三個渲染點：現場主迴圈/即時 highlight/手動🎬）。變紅的實作＝任一點繞過 postFx。機械驗：source 掃描測試。
- **A4 光效永不致死**（沿用 08-28 音訊紀律）：composer 建構丟例外→退回直渲、遊戲照跑；Reflector shader 形狀不符（three 升版）→不加反光回 null，不丟例外。變紅的實作＝拔 try/catch 或 patch 失敗仍加。機械驗：注入丟例外 factory／假 material 測試。
- **A5 預設檔輕量升級**：`sparkSpawnCount(speed)`——速度 ≤ 門檻＝0、超過線性升、封頂 3（紅綠測試）；火花與細線色值 import 自 `theme.js` COLORS（source 掃描 `COLORS.goldLight`）；塵土 DEAD_BALL 顆數/池上限提升（source 斷言）。所有數值【試玩必調】。
- **A6 sim 零改動**：`git diff --stat 26f6807.. -- src/sim/` 零檔案；sim-hash 收工實跑合計仍＝`34d7a1367a2a8d99` 且 14 場逐場同 simhash-before.txt。
- **A7 全套綠**：`npm test`（node --test）全綠（基準 2309＋本批新增），貼輸出摘要。
- **A8【使用者側】真機閘**：預設檔 FPS 不得退步；`?fx=high` 在他手機實測 60FPS 過了才議改預設（Q5，改預設＝另一次拍板）。BLOOM（strength/radius/threshold）、REFLECT（opacity/textureSize）、spark/dust 數值全屬提案，試玩即改。

## 已知邊界（誠實揭露）

- 地板反光鏡像會含頭上標籤 sprite（depthTest=false 者鏡中也畫）；opacity 低（0.26 提案值）下不明顯，試玩刺眼再議分層。
- bloom 作用於亮像素（球發光/火花/白色燈帶），聚光燈本體無可見燈具幾何，光暈主要來自高亮材質。
- 獨立小舞台（情蒐帶 replayStage 等）不掛 bloom——各自有獨立 renderer，本批不擴。
