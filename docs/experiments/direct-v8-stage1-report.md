# direct-v8 第一階段實作報告：接球＋魚躍＋慢動作＋情境出手

分支 `feat/direct-rules-s1`（自 `3e90288` 分出，隔離工作樹 `.claude/worktrees/agent-a17aa1404ed442fb1`）。
驗收文件（凍結、未改）：`docs/kickoffs/direct-v8-stage1-receive-acceptance.md`。方向錨點：`docs/kickoffs/direct-v8-rules-plan.md`。
本報告的數字全部來自本分支最終碼實跑（指令列於各節）；舊碼紅燈來自 `3e90288` 的分離工作樹。

## 0. 結論

- R1–R11 每條都有對應測試或治具且為綠；R12 的 `npm test` 全綠（2581 條、0 skip，只少了第四節核准退場的測試）、四個瀏覽器治具 PASS。R12 的部署與 `--delivery` 對線上版由主對話做，本分支未部署、未 push。
- 鑑別力：R1、R3、R4、R6 的新測試在舊碼 `3e90288` 上 8/9 條紅（第 9 條「範圍外 0 例救到」新舊皆綠，見 §2），紅的原因全是行為斷言（`docs/experiments/direct-v8-stage1-old-red.tap`）。R9 慢動作觸發 tick 數 > 0、R10 情境切到魚躍次數 > 0（§1 R9／R10）。
- 版本字串單一來源 `src/sim/directConstants.js:3` → `direct-v8.2`（第 6 輪 X2 自 `direct-v8.1` 升版；練習頁 `[data-build]` 與匯出檔 `simulationVersion` 都由它產生）。
- **2026-09-28 第六輪（第 5 輪覆審 NEW-A／NEW-B／X3 修補＋使用者裁定甲／甲／版本升 v8.2，§14）**：MEDIUM NEW-A（按魚躍而球進圈＝U2 的動作改跑接球的 32 tick、不再定住 63 tick，期間有撲空姿勢：動作總長 63 → **32**、推搖桿後身體開始移動 tick 74 → **43**（動作結束後 2 tick）、骨盆最多低 0 → **0.171 m**、軀幹前傾 0 → **33.9°**；U2 判定格瞬移 max 0.736 → **0.658 m**（高手圈）、0.717 → 0.179 m（低手圈））、NEW-B（`SIMULATION_VERSION` `direct-v8.1` → **`direct-v8.2`**，重播／還原拒絕 v8.1、治具 `--delivery` 期望值同步）、LOW X3（round5 W3 的 `maxDrawnArmGap` 改量練習頁自己緩回的迎球：單幀變化 ≤ 0.05 h、≤ 5 幀回到 sim 值，「直接歸零」與「保持伸出」兩個突變各自變紅）；X1 有修前碼 `ff6e868` 行為紅燈。R8 1080/2646 = 40.8%（不變）。`npm test` 與四個瀏覽器治具：見 §14「收尾驗證」。
- **2026-09-28 第五輪（第 4 輪覆審 NEW-1～NEW-3 修補＋使用者裁定甲／丙／甲，§13）**：HIGH NEW-1（預測消失手臂收回＋圈邊不伸手：畫面前臂被球穿過後沒接到 76 → **0**/5292，最大深度 0.168 → 0）、HIGH NEW-2（按魚躍而球進圈＝U2 時身體不撲出、球貼站姿：判定格瞬移 max 1.371 → **0.736 m**，> 1.2 m 42 → 0）、MEDIUM NEW-3（球貼無迎球姿勢＋觸球即歸零迎球、畫面緩回：迎球開關雙樹 `differs 0`、觸球後落點差 max 3.545 → **0**、判定後撞看不見手臂 2 → 0）；W1～W3 各有修前碼 `c6a5c67` 行為紅燈。R8 1080/2646 = 40.8%（不變）。`npm test` 與四個瀏覽器治具：見 §13「收尾驗證」。
- **2026-09-27 第四輪（第三輪覆審 findings 修補＋使用者裁定 U1～U4 全選甲，§12）**：HIGH N1（按魚躍、球在圈內 → 有按的噴球「這球要按接球」）、HIGH N2（魚躍目標用按下當刻朝向；已判定的球按鈕不再標魚躍）、HIGH N3（迎球只改姿勢：碰撞、分離、部位一律用未迎球姿勢）、MEDIUM N4（沒按噴球貼表面最近部位）、U3（判定瞬移只在畫面層平滑，每幀 ≤ 0.12 m、≤ 4 幀收斂）、N6 報告更正四處；V1～V5 各有修前碼 `0e72fd4` 行為紅燈、V3 三組雙樹比對 0 例不同。R8 1080/2646 = 40.8%。`npm test`：2597/2597 過、0 skip（單獨跑）；四個瀏覽器治具 PASS。N5、N7 不修、記錄。
- **2026-09-27 第三輪（第二輪覆審 findings 修補＋使用者裁定第 2～6 題全選甲，§11）**：HIGH 撲救範圍下界（第 5 題）、HIGH M5 分母（第 4 題）、MEDIUM 魚躍倍率 1.05（第 6 題）、第 2 題（按接球不自動魚躍）、第 3 題（判定格瞬移：迎球姿勢＋沒按貼身體）、R2 分母含噴球，每條都有本樹實跑證據與舊碼（`b06df69`）或突變紅燈；兩條 LOW 未修、列在 §8 第 11／12 點；第二輪報告的四處錯誤已更正（§11「報告更正」）。R8 重量 1062/2646 = 40.1%。`npm test`：2593/2593 過、0 skip（單獨跑）；四個瀏覽器治具：四個治具 PASS。
- **2026-09-27 第二輪（第一輪 fresh opus 覆審的 12 條 findings 修補，§10）**：C1、H1、H2、H3、M2、M3、M4、L1、L2、L3、L4 修好且各有舊碼或突變紅燈；M5 的四條 B 組測試改寫成獨立測試、門檻原封不動，其中 **A14（b 舉球區 0.478、c 弧頂中位數 1.24 m）與 A16b（舉球區 0.450）不過門檻 0.50／3.0**，依指示沒動門檻、例數、網格，數字交主對話裁定。`npm test` 最終：2588 條、2586 過、**2 敗（就是 A14 與 A16b）**、0 skip；四個瀏覽器治具 PASS。R8 在修補後是 901/2646 = 34.05%，只比 34% 門檻多 1 例（原因見 §10 L4）。

## 1. R1–R12 逐條

指令：`node --test tests/direct-v8-rules.test.js tests/direct-v8-context.test.js tests/direct-receive-assist.test.js`；數字補充來自同構的統計腳本（與測試同一套案例建構）。
**2026-09-27 第一輪覆審修補後（§10）**：R1、R2、R4、R7、R8、R9、R10、R11 的實作或測試都有改動，本表的數字若與 §10 不同，以 §10 為準（尤其 R8 由 39.1% 變 34.05%、R4 誤差比較由 1.061 m 變 1.77 m，原因見 §10 的 H1／M3／L4）。

| 條 | 測試／治具（檔案:行號） | 實際輸出 |
|---|---|---|
| R1 規則取代碰撞 | `tests/direct-v8-rules.test.js:57`（案例組）、`:73`（轉身 −30°／0°／+30°） | 案例組 36 例（產法 §3）：新碼 36/36 判 `PERFECT`（`technique: underhand`）、36/36 `target` 在舉球區；**第二輪（L3）改嚴格驗法**：用觸球後球速做彈道預測落點，36/36 落在舉球區、與 `target` 最大偏差 0.0017 m；實際落地 32/36 在區內，**被自己再碰到的是 15/36 例（第一輪報告寫 4 例是錯的）**——球員仍推搖桿往網前跑、跑到自己傳出的球底下再碰到一次。轉身組：10/10 例三種角度的 `tier`＋`target` 逐值相同。 |
| R2 分級單調 | `tests/direct-receive-assist.test.js:23`（原 A23d，門檻不變） | chase n=2646、有等級觸球 1048：PERFECT 191（18.2%）、GOOD 782（74.6%）、POOR 75（7.2%），三級皆 ≥ 5%；平均落點距離 完美 < 普通 < 差（斷言通過）。 |
| R3 噴球 | `tests/direct-v8-rules.test.js:102`（甲）、`:112`（乙） | 甲（沒按 30 例）：30/30 有觸球事件且 `spray:true, timing:'none'`，進舉球區 0/30。乙（早 15、晚 15，偏差＝窗外 1～6 tick，k=1.140、窗邊 5.13 → 偏移 ±6…±11）：早 15/15 標 `early`、晚 15/15 標 `late`，進舉球區早 0/15、晚 0/15。 |
| R4 魚躍 | `tests/direct-v8-rules.test.js:172`、`:187`、`:200`、`:221` | 撲救範圍內 30 例（d 0.6–1.9 m）：情境出手 30/30 = `dive`，30/30 朝球撲出（朝向偏 ≤ 10°、速度 > 0.5 m/s），30/30 判 `dive:GOOD`，判定 tick 40 ＝ 球心到 0.3 m 的 tick 40，PERFECT 0 次。10 種按鍵偏差：魚躍平均落點誤差 1.061 m（n=300）> 低手 0.483 m（n=192）。倒地 42 tick：有／無移動指令位置逐值相同、出手指令 0 個動作事件。範圍外（d 2.1–3.4 m）30 例：情境出手 30/30 = `receive`，救到 0 例。 |
| R5 判定順序 | `tests/direct-v8-context.test.js:49`（甲）、`:62`（乙） | 甲：球直落額頭點（之後也會在低手圈內），額頭高度 tick 先於平台高度 tick，判 `overhand` 且判定 tick＝額頭高度 tick。乙：d=0.49 十例全判 `underhand`（情境出手 `receive`）、d=0.51 十例全判 `dive`（情境出手 `dive`）。 |
| R6 不隔空 | `tests/direct-v8-rules.test.js:228` | R1 案例 36 觸球 + chase 規則觸球 1569（含噴球 521）＝1605 例，球面到手掌／前臂表面距離最大 0.0000 m、中位數 0.0000 m，> 0.05 m 者 0 例（100%）。量法：`armGap`（`tools/receive-assist-probe.mjs:8`）用該 tick 結束時的姿勢（`getDirectPose(s, 0)`，舊探針用 fraction 1 是下一 tick 的姿勢，已修）。 |
| R7 失誤原因 | `tests/direct-v8-context.test.js:80`；文字在 `src/app/directReceiveReasons.js` | 八種情境：完美低手「完美：時機剛好 · 低手」；沒按「噴球：沒按 · 低手」；太早／太晚「噴球：按太早／按太晚 0.xx 秒」；魚躍「普通：… · 魚躍」；站位「沒接到：站位偏了 N 公分，球在你右／前邊，往右／前移」；魚躍時機「沒接到：魚躍時機太早…」。每球結束皆非空（sim 的終止事件帶 `judged`／`miss`，`src/sim/directGame.js:115-123`）。 |
| R8 難度不退步 | `tests/direct-receive-assist.test.js:15`（原 A23a，門檻 34%／25%／5% 不變） | chase n=2646（`node tools/receive-assist-probe.mjs chase`）：空接 299（11.3%）≤ 25%、碰網 8（0.3%）≤ 5%、舉球區 1034（39.1%）≥ 34%；出手 dive 1293／receive 1353；噴球 521。舊碼 `3e90288` 同探針（舊探針、按 `receive`）：空接 622（23.5%）、舉球區 860（32.5%）、碰網 45（1.7%）、出界 107；即舊碼在此網格其實不到 34% 門檻，新規則 39.1% 是真的變好接，不是持平。 |
| R9 慢動作 | `tests/direct-v8-context.test.js:123`；治具 `tools/direct-play-browser.mjs --pass`（`slowRun`） | 純函式 `slowMotionScale(state, {enabled})`（`src/sim/directReceiveRules.js`）；強力發球錄影開／關慢動作 sim 事件序列與狀態逐位元相同，開時觸發 tick 數 > 0 且觸發時球速 ≥ 13 m/s，關時 0；慢球（一般餵球）0 次、人在範圍外 0 次；倍率只出現 1／0.5。瀏覽器：強力發球在 tick 48（球速 ≥ 13 m/s、離判定 ≤ 0.4 s）時 `slowMotion`＝0.5，用合成時鐘驅動真實 `frame()` 12 幀（60 Hz）只推進 5／6／6 tick（desktop／landscape／portrait），`slowMotionTicks` 5／6／6；關閉慢動作同一時刻＝1、12 幀推進 11／12／12 tick、`slowMotionTicks` 0。 |
| R10 情境出手 | `tests/direct-v8-context.test.js:160`；治具 `--pass`（`contextual`、`.dp-actions select` 計數） | `contextAction` 無球回 null、`resolveHitAction(s,'auto')`＝`receive`、指定 `spike` 即 `spike`；五種站位／走位 × 120 tick，經真實鍵盤輸入層按下後 sim 啟動的動作與標籤相同 0 處不同（比對 tick ≥ 100），情境出現 dive > 0 且 receive > 0。瀏覽器三尺寸（含直式 390×844）：主畫面 `.dp-actions select` = 0、設定內 `[data-action]` = 1 且預設 `auto`；接球站位（0, 4.9）按鈕文字含「接球」、真實觸控按下後 sim `player.action`＝`receive`；魚躍站位（1.4, 4.9）文字含「魚躍」、按下後＝`dive`；同一球走過球路 70 tick 逐 tick 比對按鈕動作 0 處不同，其中 8 tick 是魚躍。 |
| R11 決定論 | `tests/direct-v8-context.test.js:209` | 錄影含低手接球、噴球、魚躍（`underhand,spray,dive`），每隔 23 tick 中途還原逐 tick 逐位元相同，整卷 `replayDirectTape` 相同。 |
| R12 全套綠 | `npm test`；四治具 | `npm test` 2581/2581 過、0 skip（§4）。治具：預設 PASS、`--assist` PASS、`--motion` PASS、`--pass` PASS（§5）。部署／`--delivery` 對線上版：未做（主對話負責）。 |

## 2. 舊碼紅燈證據（鑑別力）

指令（在 `3e90288` 的分離工作樹，複製最終版 `tests/direct-v8-rules.test.js`、`tools/receive-rules-cases.mjs` 與案例 JSON 後）：`node --test --test-reporter=tap tests/direct-v8-rules.test.js`，全文存於 `docs/experiments/direct-v8-stage1-old-red.tap`。測試檔以動態 import 載入新規則模組，舊碼上載不到就退回舊碼的顯式 `dive`，因此紅的是行為斷言、不是 import 錯誤：

| 條 | 舊碼結果 | 紅在哪個斷言 |
|---|---|---|
| R1 案例組 | not ok | 「完美且進舉球區 0/36」——舊碼觸球部位 `torso`（或大腿）、無等級，例 `stick=0,-1 x0=0 z0=5.6 m=0.35 rt=28 → torso → ground (0.00, 3.67)` |
| R1 轉身組 | not ok | 「turn 0°: torso → ground」——`tier` 不是 `PERFECT`（undefined） |
| R3 甲 | not ok | 「判成沒接到 3/30」——球從身前落地無任何觸球事件（其餘 27 例碰到頭／胸但無噴球標記） |
| R3 乙 | not ok | 「early: 判成沒接到 1/15」（`d=0.45 offset 9`） |
| R4 撲救範圍內 | not ok | 「沒有朝球撲出：朝向偏 47.9°、速度 6.38 m/s」——舊魚躍沿原朝向撲 |
| R4 誤差比較 | not ok | 「魚躍 0、低手 79 筆有等級的觸球」——舊魚躍沒有等級 |
| R4 倒地 42 tick | not ok | 「倒地期間移動指令改變了位置」——舊 recovery 25 tick |
| R4 範圍外 0 例救到 | ok | 新舊皆 0（舊魚躍沿朝向撲也救不到），這條不具鑑別力，由同組其他三條補上 |
| R6 不隔空 | not ok | 「659/1192 例超過 0.05 m（中位數 0.058 m）」——舊磁吸觸球在遠處折返，例 `z0=6 rt=33 0.623` |

## 3. R1 案例組怎麼產生（`tools/receive-rules-cases.mjs`，在舊碼上跑）

沿用 A22（direct-v6）的真實路徑產法：固定餵球、第 10 格起推搖桿、單一按鍵 tick。用原始 A22 網格（只有接球餵球、身高 1.75、正前／斜前）在舊碼上找不到任何「圈內＋完美時機＋舊碼碰軀幹／大腿／上臂」的案例——舊碼對圈內的球一律由前臂或磁吸先接到，碰軀幹的都是圈外（球已跑到身後）。因此把同一產法的參數放寬：餵球 receive／spike／serve、身高 1.5／1.75／2.1、搖桿 7 種（含不推、側向、後退）、z0 五值、x0 三值、m 0.35／1.0、rt 14–44，共 54,405 案例，逐例用新規則幾何（平台中心 0.31 h、額頭 0.12 h、0.6 h／1.02 h 穿越 tick、`|offset| ≤ 2k`、`d/r ≤ 0.7`、且額頭圈外）分類，取舊碼第一次觸球部位 ∈ {torso, hips, arm, thigh} 者，得 36 例（torso 5 例：接球餵球；thigh 31 例：高球餵球）。清單凍結於 `docs/experiments/direct-v8-r1-cases.json`（含每例舊碼觸球部位與 tick），R1／R6 測試逐例重播。

## 4. `npm test` 最後 10 行

指令：`npm test`。跑了三次：

- 第一次（sim／tests 全部改完、commit `61ca35e`，之後只再動 `src/app`、`src/app/*.css`、`tools/direct-play-browser.mjs`、docs——這些沒有任何測試 import）：2581 過、0 敗、0 skip：

```
✔ 整場實跑：滿速↔靜止的 stop-go 交替率 < 0.5%（修前 5.92%） (791.3956ms)
✔ 決定論：同 seed 兩次整場逐 tick 位置逐值相同（幅值化走位不引入浮點分岔） (502.8692ms)
ℹ tests 2581
ℹ suites 0
ℹ pass 2581
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 262236.6086
```

- 第二次（最終樹，但與 Chromium 治具同時跑，全套 1040 s、平時 262 s）：2580 過、1 敗＝`tests/pro-batch4c-wiring.test.mjs:91`「W2 ★F2-1 非時機軸★」。歸因：該測試用 `performance.now()` 忙等 35 ms 模擬「第二段慢放開」，CPU 被治具搶走時忙等被拉長、超出窗口，`slow.aim` 變 undefined；該檔 import 的 `game.js`／`matchControls.js`／`careerState.js` 都不在本分支改動內；無負載下單檔連跑 5 次 9/9 全綠（`node --test tests/pro-batch4c-wiring.test.mjs` ×5）。來源＝環境時序，不是受測物，也不是本分支改動。
- 第三次（最終樹、無其他負載，作為 R12 的最終證據）：

```
✔ 整場實跑：滿速↔靜止的 stop-go 交替率 < 0.5%（修前 5.92%） (676.4618ms)
✔ 決定論：同 seed 兩次整場逐 tick 位置逐值相同（幅值化走位不引入浮點分岔） (382.8463ms)
ℹ tests 2581
ℹ suites 0
ℹ pass 2581
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 193936.9042
```

- 2026-09-27 第二輪（最終樹 `8064811` 的內容、單獨跑、無其他負載；指令 `npm test`，05:35:51 → 05:40:00）：

```
✖ A14 到位球：少碰網、落在舉球區、弧頂夠高 (8556.3194ms)
✖ A16b 邊移動邊接（放開搖桿減速中觸球）：碰網 ≤ 10%，舉球區 ≥ 50% (21736.1065ms)
  AssertionError [ERR_ASSERTION]: A14b set zone 0.48 (n=345)
  AssertionError [ERR_ASSERTION]: A16b moving set zone 0.45 (n=436)
ℹ tests 2588
ℹ suites 0
ℹ pass 2586
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 247978.3963
```

兩敗都是 B 組改寫後門檻不過（§10 M5），沒有其他失敗；新增 7 條（R4 加嚴 2、R7 身體先碰 1、A23c 1、A14／A16／A16b 3）→ 2581 + 7 = 2588。慢測試都有跑：A23c 69.7 s、A25 45.5 s、R6 與 chase 照舊。

- 2026-09-27 第三輪（裁定落實後的最終樹、單獨跑）：見 §11「收尾驗證」（新增 5 條 → 2593）。

## 5. 四個瀏覽器治具

前置：`npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`（背景），`PLAYWRIGHT_MODULE=C:\Users\shung\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright`。

| 治具 | 結果 | 報告檔 |
|---|---|---|
| `node tools/direct-play-browser.mjs`（預設） | `PASS 3 viewports: real input, jump, cancel, replay, layout, disposal` | `docs/experiments/direct-play-evidence/browser-report.json` |
| `--assist` | `PASS assist: 3 viewports with visible receive turn, contact, replay` | `assist-browser.json` |
| `--motion` | `PASS motion: 3 viewports with run, jump, land, set, block, dive captures` | `motion-browser.json` |
| `--pass` | `PASS pass: 3 viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, tap resting, replay; advanced hides hints` | `pass-browser.json` |

2026-09-27 第二輪（修補後的最終碼，四個治具重跑，`docs/experiments/direct-play-evidence/*.json` 為這次的輸出）：預設 `PASS 3 viewports: real input, jump, cancel, replay, layout, disposal`；`--assist` `PASS assist: 3 viewports with visible receive turn, contact, replay`；`--motion` `PASS motion: 3 viewports with run, jump, land, set, block, dive captures`；`--pass` `PASS pass: 3 viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, tap resting, replay; advanced hides hints`。`--pass` 本輪新增／改寫的檢查：R10 逐 tick 真按比對（§10 C1）、R9 開關逐位元比對（§10 H3）、`[data-face]` 不存在（§10 L2）；A21b 按住 0／3／6／9 tick 仍 11/11。

2026-09-27 第三輪（最終樹，四個治具重跑，`docs/experiments/direct-play-evidence/*.json` 為這次的輸出）：四個都 PASS，逐字輸出見 §11「收尾驗證」；治具本身本輪未改。

治具改動（`tools/direct-play-browser.mjs`，逐項）：
1. `--pass`：拿掉 A21a／A21c 的左右滑平台選擇與 `passType` 斷言（第四節 C 組退場）、`pass-drill` 餵球（P1 後方向練習已無意義，練習頁一併移除）；新增 R10（主畫面無 `select`、設定內 `[data-action]` 預設 `auto`、接球與魚躍兩種站位下按鈕文字＝sim 啟動的動作）與 R9（`assistState().slowMotion`＋用合成時鐘驅動真實 `frame()` 12 幀：慢動作應推進約 6 tick、關閉約 12 tick）。原有的資訊輔助三級提示、A21b 按住放開、A20e 自動朝向照舊。
2. `--pass` A21b「按住 0／3／6／9 tick」的追蹤範圍：原治具只在放開之後追蹤觸球與球高。新規則的判定發生在固定的穿越 tick（tick 42），金色提示最後兩格（34、35）按住 9 tick 時，判定落在按住期間，放開後才追蹤就看不到觸球，回報 9/11（改前實跑：rest 9 = 9/11，其餘 11/11）。改後按住期間也追蹤，並把「已觸球」旗標帶到放開後那段讓球高繼續累計（改前一次修正只帶 tier 沒帶球高，仍 9/11）。判準沒有變：仍要求該球第一次觸球是有等級的判定（`tier`），且球升到 2 m 以上（傳球真的起來），門檻 10/11 不變。壞掉的實作（沒判定、判成噴球、球沒起來、按住期間觸球後放開重送第二次動作）都仍會紅；改後實跑：三尺寸皆 rest 0＝11/11、3＝11/11、6＝11/11、9＝11/11（`pass-browser.json` 的 `tapResults`）。
3. `--motion`／預設：動作選單搬到設定面板後，選動作改走 `assign()`（開設定 → 選 → 關）；預設治具的扣球段同樣在設定內選 `spike`。註解裡「direct-v4 contact lands on tick 42」改寫成規則判定落在 tick 42（實際 tick 相同）。
4. `--delivery`：`simulationVersion` 與 `[data-build]` 前綴改為 `direct-v8.1`（本分支未對線上跑）。

## 6. 退場／改寫清單對照（驗收第四節）

**A 退場（全部照清單）**：`tests/direct-absorb.test.js` 整檔刪除（A18a／A18b／A18c／A18c+ ×3，共 6 條）；`tests/direct-inner-gap.test.js` 整檔刪除（只剩 A22c 一條）；`tests/direct-physics.test.js:26-190` 的迎球轉身輔助 9 條與其 `receiveFeed` 輔助函式刪除，其餘 23 條不動；`tests/direct-pass.test.js` 的 A2、A3、A3b、A4、A6、A6b、A17、L1 刪除；`tests/direct-receive-assist.test.js` 的 A24c、A23b 刪除。
**B 改寫（門檻不變）**：A23a → R8（`direct-receive-assist.test.js:15`，34%／25%／5%）；A23c 併入 R8（不再獨立斷言，探針 `sweep` 保留）；A23d → R2（`:23`，三級 ≥ 5%、單調）；A23e 保留（`:34`）；A25（`:73`，70%／90%／≥ 50）、A26a（`:91`，≥ 1.5）、A27a／b（`:97`、`:103`）改用新判定跑，門檻不變；A28g／A28h（`:130`、`:136`）保留、對新判定路徑斷言；A14／A16／A16b 併入 R8（刪除獨立測試）；A24d（`:59`）改成純畫面姿勢檢查，90%／95% 不變。探針對應改動：`tools/receive-assist-probe.mjs`（按情境出手、噴球也入列、`armGap` 用 tick 末姿勢）、`tools/receive-cue-probe.mjs`（提示排練認「有等級的觸球」、按情境出手）、`tools/receive-realism-probe.mjs`（站姿統計只算有等級且非魚躍的接球）。
**C 退場**：`direct-pass.test.js` 的 A1、A7、A15；`direct-hold-release.test.js` 的 A21a、A21c、「覆審保留」（A19d 保留）；`direct-pass-lock.test.js` 整檔刪除（只剩 H1）。
**D 不動**：`direct-physics.test.js` 其餘 23 條、`direct-input.test.js` 15 條、A5、A20a、A27b——內容未動；唯二機械修訂（2026-09-27 第一輪覆審 L1 更正為如實描述）：
- A5（`direct-pass.test.js`）：正向重播的 `simulationVersion` 由 `'direct-v7'` 改 `'direct-v8.1'`；**原本「拒絕 `direct-v6` 重播」的 `assert.throws(() => replayDirectTape({ simulationVersion: 'direct-v6' … }))` 被刪掉、換成拒絕 `'direct-v7'` 的同型斷言**；「拒絕 `direct-v6` 還原」的 `restoreDirectGame` throws 保留，另加一條拒絕 `'direct-v7'` 還原。
- 「replay and mid-flight restore」（`direct-physics.test.js`）：正向重播版本字串 `"direct-v7"` → `"direct-v8.1"`；原檔（`3e90288`）的拒絕斷言是**五條**——還原 `"bad"`、還原 `"direct-v1"`、還原 `"direct-v2"`、還原 `"direct-v6"`、重播 `"bad"`（`git show 3e90288:tests/direct-physics.test.js` 541–559 行）——全部保留，只**新增**一條拒絕 `"direct-v7"` 還原（第四輪更正 N6：第二輪寫成「拒絕 `direct-v6` 還原／重播兩條」、第三輪寫成「三條」都是錯的，漏數了 `direct-v1`／`direct-v2` 兩條；現行檔 `:378-396`：還原 bad `:379`、v1 `:382`、v2 `:385`、v6 `:388`、v7 `:391`（新增）、重播 bad `:393-395`）。
（與前幾版升版做法相同；不是門檻。）

數量：退場 37 條（A 組 26＝absorb 6＋inner-gap 1＋physics 9＋pass 8＋receive-assist 2；B 組併入 R8 而消失 4＝A23c、A14、A16、A16b；C 組 7）、新增 15 條（`direct-v8-rules` 9、`direct-v8-context` 6）；現在全套 2581 條，推算舊套為 2581＋37−15＝2603（未在舊碼上實跑全套，此數為推算）；`git diff 3e90288..HEAD --stat` 內其餘既有測試檔沒有任何門檻被放寬（A 組整條刪、B 組門檻數字逐條相同、D 組只動版本字串）。

## 7. 實作摘要（給覆審用的地圖）

- `src/sim/directReceiveRules.js`（新）：判定點（額頭 0.12 h／平台中心 0.31 h／魚躍 0.3 m）、`nextJudgement`（預測會成立的判定：高手 → 低手 → 魚躍）、`contextAction`／`resolveHitAction`（R10）、`slowMotionScale`（R9）、`ruleGhost`（往判定去的球穿過身體不碰撞）、`judgeTick`（tick 末判定：圈內＋窗內 → `pass`；圈內＋窗外／沒按／按成魚躍（第四輪 U2）→ `spray`；魚躍在 0.3 m 判，等級封頂 GOOD、誤差總倍率 1.05（第 6 題甲，第三輪改；第二輪一度是 1.5））、`snapToBody`（第四輪更正 N6：函式名一直是 `snapToBody`，不是 `snapToArms`；有按的貼到最近的手掌／前臂表面、沒按的貼到身體任一部位表面最近者（第 3 題甲）；第四輪起「最近」用表面距離、部位由未迎球姿勢決定、球放到畫面姿勢上）、`missInfo`（R7 資料）、`receiveContactEta`（提示）。
- `src/sim/directGame.js`：拿掉 v7 磁吸與「真實前臂觸球即傳球」、平台左右滑（`passType`）；`judge` 狀態隨球重置；魚躍在範圍內自動朝球（`diveTargetFor`、`diveLaunchSpeed`、伸臂比例 `diveReach`），魚躍期間朝向鎖定；身體物理碰撞先於判定時（球在圈外）標成 `body` 失誤。`DIRECT_ACTIONS.dive.recovery` 25 → 42。
- `src/sim/directReceiveAssist.js`：只剩時機分級與傳球落點（`passOutcome` 加 `errorMultiplier`，去掉 `passType`）。`src/sim/directPose.js`：平台不再偏擺；魚躍手臂依 `diveReach` 伸出。
- `src/input/directControls.js`：`resolveAction` 回呼（出手鍵動作由 app 決定）、拿掉接球滑動；`directInput.js` 去掉 `passType`。
- `src/app/directPractice.js`：動作選單搬進設定（`練習指定`，預設自動）、出手鈕標示動作（`data-does`）、慢動作開關（只縮放進 accumulator 的畫面時間）、接球圈＋觸球點兩個地上圈、失誤原因（`directReceiveReasons.js`）、`debug.frames()` 供治具量真實迴圈。

## 8. 可疑或沒做完的地方（請覆審特別看）

1. **R1 的「送往舉球區」判讀**（第二輪 L3 已改）：36 例 `target` 全在舉球區、32 例實際落區；再碰到自己的是 15 例（不是第一輪寫的 4 例）。第一輪的「目標在區內且（落地在區內或再度觸球）＋落區 ≥ 80%」兩個寬鬆子句已拿掉，改為「觸球後球速的彈道預測落點 36/36 在舉球區」（§10 L3）。
2. **R1 案例組來源**：原 A22 網格在舊碼上湊不出任何符合前提的案例（見 §3），案例組是放寬同一產法參數後得到的；36 例裡 31 例是高球餵球碰大腿。
3. **R6 的「全部觸球」**：有按的噴球（按太早／太晚、按成魚躍）貼到手臂、沒按的噴球貼到身體任一部位表面最近者（第 3 題甲；第四輪更正 N6：第一輪的「噴球也貼到手臂」自第三輪起已不成立），因此 100% 是實作保證的結果（量測是真的量、舊碼是紅的）；圈外的球仍會與身體物理碰撞而偏彈，這類「沒接到」的物理觸球沒有列入 R6 的分母（它們不是規則觸球）。
4. **魚躍時窗中心**：接球沿用現行時窗；魚躍沒有現成時窗，我定為動作第 20 格（`RECEIVE_RULES.diveWindowCentre`，windup 6 + active 15 的尾端），讓「同一個提前量」按接球與魚躍都合理。R4 的 10 種偏差以此為基準。等級封頂 GOOD（`PERFECT→GOOD`），誤差總倍率 1.05、不吃站姿倍率（第 6 題甲；第四輪更正 N6：第一輪寫的「再 ×1.5」是第二輪一度的值，第三輪已改回 1.05）。
5. **R2 的 POOR 佔比 7.2%**：新規則下窗外一律噴球，POOR 只來自「擦邊降一級」（`edgeRatio 0.7`）與魚躍，離 5% 門檻餘裕不大。
6. **情境出手的判定**：`nextJudgement` 用「目前跑動延伸到穿越時刻之前任一點」的最近距離（跑動中的人往前跑會到得了的球算接球），停下來或反向跑則按靜止判；chase 探針裡 dive 1293／receive 1353。慢動作的「人在範圍內」用同一個函式。
7. **球穿身**：往判定去的球在判定前不與身體碰撞（`ruleGhost`），視覺上球可能穿過胸口幾格再貼到手上；圈外的球照舊物理碰撞。
8. **提示與姿勢**：舉手（高手姿勢）改在預測會判高手且剩 ≤ 0.25 s 時才舉（A24d 綠）；A25 沿用 `receiveContactEta`（改用新判定幾何）。
9. 練習頁移除了「接球方向練習」餵球與目標圈（P1 之後無意義），未在驗收清單內、屬順手清理，覆審若認為超出範圍可還原。
10. `.dp-actions` 的出手鈕屬性原本也叫 `data-action`，與設定內的 `<select data-action>` 撞名讓治具定位到兩個元素，改成 `data-does`。
11. **（第二輪覆審 LOW，未修、如實列出）跑動低手的誤差倍率可能高於魚躍**：低手傳球的站姿倍率 `stanceMultiplier(bodySpeed)` 在 0.5 → 5.5 m/s 之間由 0.7 線性升到 1.6（`directConstants.js` `stanceStill/stanceRun`），魚躍的總倍率是固定的 1.05（第 6 題裁定後）——身體速度 ≥ 2.44 m/s 的跑動低手（0.7 + 0.9 × (2.44 − 0.5) / 5 = 1.05）誤差倍率就已經和魚躍一樣、再快就更高（覆審時倍率還是 1.5，門檻是 4.94 m/s）。這是設計取捨（跑動中的墊球本來就不準），本輪不改。
12. **（第二輪覆審 LOW，未修、如實列出）球低於平台高度後情境判斷回 `null`**：`nextJudgement` 的魚躍段要先算得出平台高度的穿越點（`if (dive && under)`），球心一低於平台高度 `crossingPoint` 回 null，於是 `contextAction` 回 null（按鈕退回「接球」）、`slowMotionScale` 回 1——強力發球錄影裡慢動作在 tick 59（球過平台高度）就關掉，魚躍判定在 tick 64 才發生。這段 5 tick 內按出手會啟動接球而不是魚躍（`resolveHitAction` 的 `?? 'receive'`）；R10「按鈕文字＝sim 動作」仍成立（兩邊都回接球）。本輪不改，第二階段若動出手鍵再一併處理。

## 9. 背景程序（已關閉）

- dev server（`vite`，127.0.0.1:5175，PID 25916）：四個治具跑完後以 `Stop-Process -Id 25916 -Force` 關閉，`netstat` 確認 5175 埠已釋放。
- 2026-09-27 第二輪：5175（PID 40904，真樹）與 5176（PID 5180，突變副本）兩個 vite 於治具與突變驗紅全部跑完後以 `taskkill //PID … //F //T` 關閉，`netstat -ano | grep -E ":517[56]"` LISTENING 0 筆（§10 收尾驗證）。
- 其他本工作樹起的背景程序（舊碼案例掃描、探針、`node --test`、Playwright 治具）皆已自行結束；分離工作樹 `scratchpad/old-3e90288`（舊碼紅燈用）保留在 scratchpad，未動 repo 的分支。
- 未部署（未跑 `deploy:pages`）、未 push；`main` 未動。

## 10. 第一輪覆審修補對照（2026-09-27）

修補起點 `ae48ba2`；本節的舊碼紅燈一律指「把最終版測試複製到 `ae48ba2` 的 `git archive` 副本上跑」（`docs/experiments/direct-v8-stage1-r2-old-red.tap`，指令 `node --test --test-reporter=tap --test-name-pattern="R1 規則取代碰撞|R4 魚躍（加嚴）|R7" tests/direct-v8-rules.test.js tests/direct-v8-context.test.js`），L3 另在 `3e90288` 副本上跑（`direct-v8-stage1-r2-old-3e90288-r1.tap`）。突變驗紅在 `HEAD` 的 `git archive` 副本上套用突變、用另一個 dev server（5176）跑同一支治具，還原一律從備份副本複製回來並比對 sha1，真樹不動。驗收文件 `docs/kickoffs/direct-v8-stage1-receive-acceptance.md` 未改（`git diff ae48ba2..HEAD -- docs/kickoffs/` 為空）；既有門檻、例數、案例集沒有放寬，加嚴／新增案例逐條列在下面。

### C1｜R10 瀏覽器逐 tick 比對是空的

- 改了什麼：`tools/direct-play-browser.mjs:121-148`。同一顆餵球＋同一段走位（tick 20 起向右 0.7），對 tick 1…70 每一格都從 `restart()` 重播到該格，讀出手鈕的 `data-does` 與文字，再用真實觸控（CDP `Input.dispatchTouchEvent`）按下、step 一格，比對 sim 啟動的 `player.action` 與「按下前那一格按鈕顯示的動作」，同時檢查文字含「接球」／「魚躍」；累計不一致次數後 `assert.equal(perTick.mismatched, 0)`（`:148`），並斷言接球與魚躍都出現過。
- 證據（`docs/experiments/direct-play-evidence/pass-browser.json` 的 `perTick`，三尺寸相同）：`{"checked":50,"pressed":50,"mismatched":0,"dives":9,"receives":41,"rows":[]}`——球在 tick 51 落地所以比到 50 格；9 格魚躍、41 格接球，0 處不同。
- 突變驗紅（`docs/experiments/direct-v8-stage1-r2-mutations.log`；突變套在 `HEAD` 的 `git archive` 副本、由 5176 的 dev server 供頁，還原自備份副本、sha1 與套用前相同；同一副本未突變時先跑一次對照組 = `PASS`）：
  - `c1-lag`（`updateHitLabel` 顯示上一格的動作）：`AssertionError: hit button (data-does/text) vs the action the sim started on a real press, per tick: 2/50 differ [{"tick":34,"does":"receive","label":"接球 · J","started":"dive"},{"tick":43,"does":"dive","label":"魚躍 · J","started":"receive"}]`——落後一格正好在走進／走出撲救範圍的兩格被抓到。
  - `c1-wrong`（該顯示魚躍時顯示接球）：`AssertionError: dive: hit button resolves to dive ({"tick":83,"action":"receive","label":"接球 · J"})`——紅在同一治具較早的魚躍站位檢查（`:96-114`，同樣是 `data-does`／文字對 sim 動作的比對），逐 tick 段沒有跑到；逐 tick 斷言本身的鑑別力由 `c1-lag` 那次證明。

### H1｜撲救範圍量錯時刻

- 改了什麼：`src/sim/directReceiveRules.js:73-86`——`nextJudgement` 的魚躍段改用 `diveReachOf`（`:81`）：球心到 0.3 m 那一刻的落點，到低手接球點（含目前跑動）的水平距離 d，`d ≤ 0.5 + 1.5` 才是撲救範圍；`diveTargetFor`（`:106-110`）把按下那一刻量到的 `d`／`radius`／低手點一併記在 `player.diveTarget`；`judgeDive`（`:235-247`）改讀 `target.d`，**拿掉 `platformDistance ≤ 0.5` 這道閘門**（函式已刪），範圍內且時機在窗內就是魚躍（等級封頂普通），範圍外或窗外才是沒接到。情境出手、慢動作與判定都走同一個 `diveReachOf`。
- 新案例（加嚴，R4）：`tests/direct-v8-rules.test.js:249-300`。強力發球（14 m/s、平台高度穿越 tick 58 → 0.3 m 穿越 tick 64，兩點相距 1.40 m）。範圍內 12 例：0.3 m 時刻 d ∈ (0.5, 2.0]，其中 7 例在平台高度量會 > 2.0；範圍外 10 例：0.3 m 時刻 d > 2.0，但平台高度量都 ≤ 2.0。
- 新碼輸出：範圍內 `魚躍救到 12/12`、判定 tick 全部 = 64、`PERFECT` 0 次、情境出手 12/12 = `dive`；範圍外 `auto` 與硬按 `dive` 都 `救到 0/10`。
- 舊碼（`ae48ba2`）紅燈：`not ok 4 … 魚躍救到 4/12；例：d(0.3 m)=1.20 d(平台高)=2.60 (0.00, 8.37) 情境出手 receive → 沒有觸球 → ground (0.00, 7.50)…`；`not ok 5 … auto: 救到 10/10：d(0.3 m)=2.09 d(平台高)=0.85 (0.60, 5.17) → forearm:GOOD/dive → ground (0.78, 2.05)…`（審查員 `dive-moment.mjs` 的 A／B 兩組在新碼上也反過來：A 組 4 例全部 `receive`／沒接到，B 組 4 例全部 `dive/GOOD`）。
- 既有 R4 四條重跑全綠（範圍內 30 例 30/30 魚躍、範圍外 30 例 0 例救到、倒地 42 tick）。

### H2｜身體先碰時失誤原因用反彈後的球算

- 改了什麼：`src/sim/directGame.js:331-337`——`collideBody` 之前先抄下碰撞前的球（位置＋速度），身體先碰時 `missInfo(s, 'body', incoming)`；`missInfo`（`directReceiveRules.js:250`）多一個 `ball` 參數，用它做到平台高度的自由飛行外推。
- 新案例（R7）：`tests/direct-v8-context.test.js:126-150` 三例（右側來球碰身體沒按；同一球＋按太早＝站位與時機都不合格；正面平飛碰胸口）。斷言：`miss.stage === 'body'`、公分與碰撞前預測差 ≤ 3 cm、方向與預測相同、字串寫「站位」。新碼 3/3 綠。
- 舊碼紅燈：`not ok 2 … 右側來球碰身體，沒按: 公分 97 ≠ 碰撞前預測 61（「沒接到：站位偏了 97 公分，球在你後邊，往後移。」）`——用反彈後的球算出「後邊」，真相是右邊 61 公分。

### H3｜R9 測不出慢動作改到 sim

- 改了什麼：`tools/direct-play-browser.mjs:191-215`。同一卷腳本（tick 0 強力發球、tick 1–20 往後走到 z≈7.19、tick 45 魚躍）用 `p.command({ at })` 排進真實練習迴圈，慢動作開／關各跑一次，都以合成 60 Hz 時鐘驅動真實 `frame()` 直到 tick 160，取 `p.events()`（練習頁新增的 sim 事件紀錄，`src/app/directPractice.js:110,261,422`）與最終 `snapshot()` 逐位元比對（`:214-215`）；順便在球速 ≥ 13 m/s 那一格量 12 幀推進幾 tick。練習頁的 `frames()` 改成接續同一個 accumulator（`:433`），`command()` 支援 `at`（`:250`）。
- 證據（`pass-browser.json` 的 `slowMotion`，三尺寸相同）：`identical: true`；開：armed tick 48、scale 0.5、12 幀推進 6 tick、`slowMotionTicks` 18、慢動作幀 23（portrait／landscape 24）、事件 3 筆、觸球 `64:dive/GOOD`；關：scale 1、12 幀推進 12 tick、`slowMotionTicks` 0、同樣 3 筆事件、`64:dive/GOOD`。
- node 測試 `tests/direct-v8-context.test.js:175-194`：拿掉原本恆真的「開關事件序列相同」（那個 `enabled` 從來進不了 `stepDirectGame`），改斷言 `slowMotionScale` 不改狀態（每 tick 序列化前後相同，`:186`）＋觸發次數 > 0、觸發時球速 ≥ 13、關閉 0 次、倍率只有 1／0.5；發球錄影的站位改到 z=7（原 z=5 在新的撲救範圍量法下離 0.3 m 落點 2.7 m、永遠不觸發）。
- 突變驗紅（`h3-timescale`：`stepDirectGame` 多收 `timeScale`、子步 `dt = DIRECT_DT * timeScale / substeps`，練習頁傳 `slowMotion()` 進去；同上檔）：`AssertionError: The serve reaches the passer as a hard ball at the same tick (54 / 48)`——慢動作一進到 sim 的時間，開慢動作那卷的球晚 6 tick 才到，治具在事件比對之前就在「同一 tick 到達」這條行為斷言變紅（事件序列必然也不同：觸球 tick 會變）。對照組（未突變副本）`PASS`。

### M2｜太早按被說成「沒按」

- 改了什麼：`src/sim/directReceiveRules.js:16` `judge.press` 記這顆球第一次按的接球／魚躍與 tick（`src/sim/directGame.js:219` 寫入）；`receiveOffset`（`:138`）：動作還在就用 `actionWindowOffset`，動作已結束就用 `tick − press.tick + 1 − 13`；`judgeStage` 與 `missInfo` 都改用它。
- 新案例（R7）：`tests/direct-v8-context.test.js:109-124`——球從 3.5 m 落下，按在判定前 40 tick（0.67 s，接球動作 32 tick 早已收招；測試先斷言這個前提）；斷言噴球、`active === false`、`timing === 'early'`、字串以「噴球」開頭且含「按太早」不含「沒按」。新碼綠。
- 舊碼紅燈：`not ok 1 … 按太早（動作已收招）: timing none / 'none' !== 'early'`。

### M3｜魚躍誤差倍率與註解不符

- 改了什麼：`src/sim/directReceiveAssist.js:51,53` `passOutcome` 多一個 `stance` 參數（預設仍 `stanceMultiplier(bodySpeed)`）；`directReceiveRules.js` 魚躍傳 `stance: 1`＋`errorMultiplier: 1.5`，所以倍率當時真的是 1.5（原本 0.7×1.5 = 1.05）。×1.5 是實作者自訂的數值（第二節沒規定倍率、R4 只要求魚躍比低手不準）；**第三輪依第 6 題裁定改回總倍率 1.05**（§11）。`bodySpeed` 照實記在事件裡（畫面「沒站穩」本來就對魚躍不顯示）。
- 證據：R4 誤差比較重跑（`tests/direct-v8-rules.test.js` 第 2 條 R4）：魚躍平均落點誤差 1.77 m（n=300）> 低手 0.483 m（n=192）（第一輪 1.061 m）。

### M4｜R11 沒斷言慢動作真的出現

- 改了什麼：`tests/direct-v8-context.test.js:261-281`——錄影中 `slowMotionScale < 1` 的 tick 數斷言 > 0（`:280`），接球、噴球、魚躍逐一斷言存在（`:281`）；錄影加一段 tick 360–380 往後走 20 tick（到 z≈7.04），因為 H1 之後站 z=5 的強力發球離 0.3 m 落點 2.7 m、慢動作不會觸發（第一輪錄影在新碼上是 0 tick，這條斷言先紅過）。
- 證據：測試綠；同一卷錄影探針（scratchpad `r11-walk.mjs`）算出慢動作 18 tick、觸球 `42:underhand/PERFECT 242:spray 464:dive/GOOD`。

### M5＋A14／A16／A16b｜B 組被刪而不是改寫

門檻、網格、例數一律照 `3e90288` 原測試抄；按法一律 `resolveHitAction(s)`（v8 預設情境出手＝真人按的那顆鍵）。

- A23c（`tests/direct-receive-assist.test.js:26-32`）：`sweep` 探針改成情境出手、舉球區只算規則觸球（`tools/receive-assist-probe.mjs:37-58`）。**過**：diagonal 舉球區 714/2070（≥ 108）、碰網 0；diagonalNoisy 1454/4140（≥ 277）、碰網 2/4140 = 0.05%（≤ 3%）。（第三輪更正：舊碼 `3e90288` 的原 A23c 在同網格實跑是 **diagonal 273／2070、diagonalNoisy 511／4140**（碰網 0 與 9；指令：在 `3e90288` 的 `git archive` 副本跑 `node tools/receive-assist-probe.mjs`，輸出 `diagonal {"n":2070,…,"zone":"273 13.2%","net":0…}`、`diagonalNoisy {"n":4140,…,"zone":"511 12.3%","net":9…}`）；第二輪寫的「72／224」是錯的。）
- A14（`tests/direct-pass.test.js:48-85`，網格 5×3×23）：n=345 全部是主動前臂／手觸球。A14a 碰網 0/345 = 0.00（≤ 0.10）**過**；**A14b 舉球區 165/345 = 0.478 < 0.50 不過**（測試在這條停）；A14c 弧頂中位數（測試沒跑到，同構探針算出）1.24 m < 3.0 m **也不過**；A14d（低球平台不以碰網為主）沒有規則版對應物——上下滑平台選擇已隨 P1 退場，該子句沒寫進來（報告明列，不算改寫）。
- A16（`:87-120`）：n=258，碰網 0.00 過，舉球區 132/258 = 0.512 ≥ 0.50 **過**（只多 3 例）。
- A16b（`:122-129`）：n=436，碰網 0.00 過，**舉球區 196/436 = 0.450 < 0.50 不過**。
- 不過的原因（數字給主對話裁定，本輪沒動門檻、例數、網格）：三個網格都掃 rt 18–40 共 23 個按鍵 tick，v7 舊碼窗外按下仍是一次物理墊球、常常也進區；v8 依 Q3「圈內但窗外 → 噴球」，A14 的 345 例裡 180 例（52%）是噴球、A16b 的 436 例裡 216 例是噴球，噴球一律不進舉球區也不起弧頂（所以 A14c 的中位數才會是 1.24 m）。有等級的觸球本身進區率很高（A14：165 有等級、165 進區）。

### L2

- `tools/direct-play-browser.mjs:83` 還原 `assert.equal(await page.locator('[data-face]').count(), 0, 'The receive auto-face trial setting is gone')`（原 `3e90288` 的 `:145`）。治具 PASS 見 §5 更新。

### L3｜R1 改嚴格驗法

- 改了什麼：`tests/direct-v8-rules.test.js:31-71`——判定那一格結束時的球速做子步同構的彈道積分到落地，要求 36/36 落在舉球區（`:69`）且與 `target` 的最大偏差 ≤ 0.05 m（`:71`）；拿掉「或被自己再碰到」與「落區 ≥ 80%」。
- 新碼輸出：36/36 `PERFECT`、彈道落點 36/36 在區內、最大偏差 0.0017 m；實際落地 32/36、被自己再碰到 15/36（第一輪報告寫 4 例，§1／§8 已更正）。
- 舊碼（`3e90288`）紅燈：`完美且彈道落點在舉球區 0/36；例：stick=0,-1 x0=0 z0=5.6 m=0.35 rt=28 → torso → ground (0.00, 3.67) 彈道落點 (0.00, 3.67)…`。

### L4｜R8 舉球區不得計入身體彈開

- 改了什麼：`tools/receive-assist-probe.mjs:28-35` `settle()`：沒有等級也不是噴球的觸球（身體彈開）一律進 `groundOther`，落進區內另計 `bodyZone` 不算 `zone`；`chase`／`sweep` 共用（`:55,112`）。
- 證據（`node tools/receive-assist-probe.mjs chase`，最終碼）：n=2646、空接 175（6.61%）≤ 25%、碰網 8（0.30%）≤ 5%、**舉球區 901（34.05%）≥ 34%——只比門檻多 1 例（34% × 2646 = 899.6）**；身體彈進區 27 例（已排除）；噴球 521；情境出手 dive 1460／receive 1186；有等級 1131。R2：PERFECT 191（16.89%，平均 0.211 m）< GOOD 845（74.71%，1.18 m）< POOR 95（8.40%，1.873 m）。
- 為什麼從第一輪的 39.1%（審查員排除身體彈開後 38.06%）掉到 34.05%（第三輪依覆審員實測更正歸因；每項各自套用、其餘不動，舉球區例數的變化）：H1 約 **+66**（撲救範圍改在 0.3 m 時刻量，chase 網格裡按魚躍的案例 1293 → 1460、被救起來的更多）、M3 約 **−169**（魚躍誤差倍率 1.05 → 1.5 讓魚躍傳球落點散開，`other` 1010 → 1555）、L4 **−27**（身體彈進區內不計）；三項加總是 1034 − 130 = **904**，實測是 901，差 3 例來自三項的交互作用（每項是各自單獨套用量到的，不可直接相加；第四輪更正 N6：第三輪寫「淨值就是 1034 → 901」是把不可加的數字當成加總）。M3 的 ×1.5 是實作者自訂的數值，不是規格或設計要求（第二節沒有規定倍率），第 6 題已裁回 1.05（§11）；門檻沒動。

### L1

- §6「D 不動」改為如實描述：A5 原本「拒絕 `direct-v6` 重播」的 `assert.throws(replayDirectTape(... 'direct-v6'))` 被刪、換成拒絕 `direct-v7`；`direct-v6` 還原的 throws 保留。

### 收尾驗證

- `npm test`（單獨跑，§4 第二輪段有最後 10 行）：2588 條、2586 過、2 敗、0 skip。兩敗 = `A14b set zone 0.48 (n=345)`、`A16b moving set zone 0.45 (n=436)`，即 M5 的 B 組門檻不過，未動門檻，交主對話。其餘 2586 條（含本輪新增的 R4 加嚴 ×2、R7 身體先碰、A23c、A16 與所有 R1–R11）全綠。
- 四個瀏覽器治具（真樹、5175，修補後的最終碼；指令與輸出見 §5 的 2026-09-27 段）：預設 PASS、`--assist` PASS、`--motion` PASS、`--pass` PASS（C1／H3／L2 的證據就是這次的 `pass-browser.json`）；另在 `HEAD` 副本（5176）上未突變的 `--pass` 對照組 PASS。
- 背景程序：5175（PID 40904）與 5176（PID 5180）兩個 vite 都以 `taskkill //PID … //F //T` 關閉，`netstat -ano | grep -E ":517[56]"` 之後 LISTENING 0 筆（已釋放）。突變副本 `scratchpad/mut-tree` 與舊碼副本 `scratchpad/old-ae48ba2`／`old-3e90288` 都在 scratchpad，不在 repo。
- `git diff ae48ba2..HEAD -- docs/kickoffs/`：空。
- 2026-09-27 第三輪：5175 的 vite（PID 38468）與 `--pass` 治具留下的孤兒 `chrome-headless-shell`（PID 24832 樹，其父 node 已結束）都以 `taskkill //F //T` 關閉，見 §11「收尾驗證」。

## 11. 第二輪覆審修補對照（2026-09-27，使用者裁定第 2～6 題全選甲）

修補起點 `ef8221d`（碼＝`b06df69`）；本輪的碼從 `d2054ec` 起（commit 清單見本節末）。驗收文件未改（`git diff ef8221d..HEAD -- docs/kickoffs/` 為空）；門檻、例數、案例集、網格一律不動。
證據的取得路徑：**舊碼紅燈**＝把最終版測試（含新探針）複製到 `b06df69` 的 `git archive` 副本上跑（`docs/experiments/direct-v8-stage1-r3-old-red.tap`；指令 `node --test --test-reporter=tap tests/direct-v8-round3.test.js` 與 `--test-name-pattern="R6" tests/direct-v8-rules.test.js`）；**突變驗紅**＝在本輪最終樹（`git write-tree` 3d52616＝`d2054ec` 的樹）的 archive 副本上套突變、跑對應測試、從備份副本複製回來並比 sha1（`docs/experiments/direct-v8-stage1-r3-mutations.log`；突變定義見 log 的附錄與 `docs/experiments/direct-v8-r3-probes/mutate.py`），每個突變之前先在未突變副本跑一次對照組（全綠）。所有探針數字都是本樹實跑，指令逐項列出；本輪的探針與突變腳本收在 `docs/experiments/direct-v8-r3-probes/`（唯讀探針；`mutate.py`／`run-mutations.sh` 只寫 archive 副本），用法 `node docs/experiments/direct-v8-r3-probes/<探針>.mjs <repo 根目錄>`，其邏輯與對應測試同構。

### HIGH｜撲救範圍下界（第 5 題甲）

- 改了什麼：`src/sim/directReceiveRules.js:116` `diveTargetFor` 把按下魚躍那一刻 `nextJudgement` 預測的判定 `stage` 記進 `player.diveTarget`；`:312` `judgeTick` 只有 `diveTarget.stage === 'dive'` 的魚躍才走 0.3 m 判定，否則照高手 → 低手鏈判（球在圈內 → 噴球或沒接到，不會是魚躍）。**下界**＝按魚躍那一刻，預測球在平台高度穿越點時不在低手圈內（也不在額頭圈內，即預測的判定不是高手／低手）；**上界**＝0.3 m 時刻 `d ≤ 0.5 + 1.5`（`diveReachOf`，H1 已改）。**量法**（照現行實作、未改）：`nextJudgement` 的各段距離都用 `runDistance`——把目前跑動延伸到穿越時刻之前任一點、取最近距離（跑動中的人「跑得到」就算圈內；停下或反向跑就按靜止判），所以跑動往前推算**有**做，推算上限是穿越時刻。
- 新測試 `tests/direct-v8-round3.test.js:81`／`:96`（斜落球，4 m/s 橫向、由 2.0 m 落下，六個方位）：往平台來——d(平台高)=0.88、d(0.3 m)=0.30 → 6/6 情境出手 `dive`、6/6 判 `dive` 有等級（無完美）、判定 tick＝0.3 m tick；離平台去——d(平台高)=0.30、d(0.3 m)=0.88 → 6/6 情境出手 `receive`、按接球 6/6 判 `underhand` 有等級；硬按魚躍 6/6 不是魚躍、無等級（球在低手穿越時判：撲出去的身體平台不在圈內就是沒接到、之後碰到身體）。
- 舊碼紅燈（`b06df69`）：`not ok 2 … d(平台高)=0.30 d(0.3 m)=0.88 硬按魚躍仍判魚躍 → forearm:GOOD/dive → ground (1.17, 2.59)`——舊碼只查上界，覆審員的 d(0.3 m)=0.36 案例同型。往平台來那條在舊碼綠（舊碼也救），鑑別力由突變補：`q5-literal`（把原條文字面「0.3 m 時 0.5 < d」當下界）→ 紅：`d(平台高)=0.88 d(0.3 m)=0.30 情境出手 null`（`null !== 'dive'`，第一例即停）；`q5-lower-bound`（任何魚躍按鍵都走 0.3 m 判定、不看 stage）→ 紅：`d(平台高)=0.30 d(0.3 m)=0.88 硬按魚躍仍判魚躍 → forearm:GOOD/dive → ground (0.82, 2.30)`。
- **platformDistance 閘門移除的守衛**：`tests/direct-v8-round3.test.js:162`。情境取自追球探針裡舊閘門會綁住的真實案例（`docs/experiments/direct-v8-r3-probes/gate-probe.mjs`：chase 616 個魚躍在判定格「球到伸出前臂最近點的水平距離」中位 0.103、p95 0.431、最大 0.621 m，> 0.5 m 的 21 例，全是餵球 {x 0, y 2.8, z 0.8, vx −1.5, vy 0, vz 4}、追球者從 (0, 7.5) 出發、晚按 −3／−6 tick）：站位誤差 0／±0.3 × 晚按 −3／−6 共 6 例，6/6 情境出手 `dive`、6/6 判 `dive` 有等級，前臂離球距離 0.503／0.596／0.525／0.611／0.485／0.584 m（`docs/experiments/direct-v8-r3-probes/gate-six.mjs`；> 0.5 m 的 5/6，斷言門檻 ≥ 4）。突變 `gate`（把 `ae48ba2` 的 `platformDistance ≤ 0.5` 閘門加回 `judgeDive`）→ 紅：`魚躍救到 1/6；例：ex=0 off=-3 → 沒有觸球 → ground (-1.11, 3.76)；ex=0 off=-6 → 沒有觸球 → …`（只剩前臂距離 0.485 m 那例救到）。

### HIGH｜M5 的 A14／A16／A16b 分母（第 4 題甲）

- 改了什麼：`tests/direct-pass.test.js:58` `timed(hit)`＝規則觸球（有 `tier` 或 `spray`）、部位是前臂或手、`|offset| ≤ goodTicks × windowScale(ballSpeed)`（觸球時按下的動作在時機窗內）；`:68`（A14 的 `active`）、`:112`（A16／A16b 的列入條件）改用它。與 `3e90288` 的 `hit.active` 同義：舊碼的 `active` 是姿勢的出手期旗標（`directPose.js` `t >= windup && t < windup + active`），磁吸則只在 `receiveWindowOffset` 非 null 時觸發，所以窗外按下的觸球是被動觸球、不入分母；v8 依 Q3 窗外＝噴球，同樣不入。A16b 的身體彈開（無等級、非噴球）不是規則觸球，自動排除（本樹 58 例；覆審時 22 例，第 3 題的迎球姿勢讓更多圈外球碰到伸出的前臂）。門檻（碰網 ≤ 0.10、舉球區 ≥ 0.50、弧頂中位 ≥ 3.0）、網格、例數照 `3e90288`。A14d（低球平台不以碰網為主）隨 P1 退場、無對應物。
- 數字（`docs/experiments/direct-v8-r3-probes/denominator-probe.mjs`，與測試同構、同時印出兩種分母）：A14 n=165（PERFECT 75、GOOD 90）舉球區 165/165 = 1.000、碰網 0、弧頂中位 4.20 m；A16 n=132 舉球區 132/132 = 1.000、碰網 0；A16b n=198（PERFECT 60、GOOD 102、POOR 36）舉球區 174/198 = 0.879、碰網 0。覆審員算的是 150/150、120/120、0.879–0.900：比率相同、例數不同（165 vs 150、132 vs 120），覆審員的算法沒附，差異來源未查。
- 紅燈：同一份碼換回整個動作期的分母就紅——A14 165/345 = 0.478（噴球 180 例）、A16 132/258 = 0.512、A16b 226/472 = 0.479；突變 `a14-whole-action`（把 `b06df69` 的 `tests/direct-pass.test.js` 放到本樹跑）→ 紅：`A14b set zone 0.48 (n=345)`、`A16b moving set zone 0.48 (n=472)`（A16 在舊分母下 0.512 仍過，與第二輪相同）。

### MEDIUM｜魚躍誤差倍率（第 6 題甲）

- 改了什麼：`src/sim/directConstants.js:83` `diveErrorMultiplier: 1.05`（註解如實：魚躍不吃站姿倍率，此值就是總倍率，= 第一輪的 0.7 × 1.5）；`directReceiveRules.js:235-238` 魚躍傳 `stance: 1`＋`errorMultiplier: R.diveErrorMultiplier`。
- 新測試 `tests/direct-v8-round3.test.js:181`（每例不同 seed，讓每次傳球是獨立的亂數）：① 對基準的比＝魚躍事件的 `target` 與**同一亂數**（同 seed／tick／salt）但倍率 1 的 `passOutcome` 的 x 偏移比，193 例平均 1.0500、最大偏離 1.05 為 0.0000（容差 0.02；倍率 1.5 會偏離 0.45）；② 經驗比＝同一組按鍵偏差下，魚躍普通級平均落點誤差 0.854 m（135 例）÷ 站定低手普通級 0.566 m（75 例）＝ **1.51**（容差 1.25–1.75；倍率 1.5 時約 2.1）——「相對站定低手 ×1.5」就是「總倍率 1.05 ÷ 站定 0.7」。數字來源 `docs/experiments/direct-v8-r3-probes/q6-numbers.mjs`（與測試同構）：`{"ratios":193,"ratioMean":1.05,"ratioMaxDev":0,"diveGood":135,"diveGoodMean":0.854,"underGood":75,"underGoodMean":0.566,"empirical":1.51}`。
- 舊碼紅燈（`b06df69`）：`not ok 4 … 魚躍對基準誤差的比值 平均 1.500、最大偏離 1.05 為 0.450`；突變 `q6-1.5`（常數改回 1.5）→ 紅：`魚躍對基準誤差的比值 平均 1.500、最大偏離 1.05 為 0.450`。既有 R4「魚躍平均落點誤差 > 低手」照舊綠（本節末 npm test）。

### 第 2 題甲｜按接球、球落撲救範圍 → 沒接到

- 現行實作已是如此：`judgeTick`（`directReceiveRules.js:312`）只在動作是魚躍時走魚躍判定；按的是接球、球在低手圈外 → 低手穿越時 `missInfo(s, 'under')`（`:322`）→ 沒接到。本輪只加註解（`:269-270`），沒改行為。
- 新測試 `tests/direct-v8-round3.test.js:214`：撲救範圍內 6 顆直落球（d 0.80–1.62 m），按接球（時機對準低手穿越）→ 6/6 無等級、無噴球，終止事件帶 `miss.pressed = true`、`miss.d > 0.5`，字串「沒接到：站位偏了 N 公分，球在你 X 邊，往 X 移。」（N＝該例的公分數）；同一球按魚躍（對準 0.3 m）→ 6/6 `dive` 有等級。
- 舊碼綠（行為相同）→ 突變 `q2-auto-dive`（低手判定時圈外、撲救範圍內、有按接球 → 升格成魚躍傳球）→ 紅：`d=1.00 按接球 → forearm:GOOD/dive → ground (0.11, 2.33)（應為沒接到）`。

### 第 3 題甲｜判定格球瞬移貼手

- (a) 迎球（`src/sim/` 內、純函式、決定論；姿勢層資料，判定不讀）：`directReceiveRules.js:126` `receiveReachTarget`——接球動作進行中、球在下落且 `nextJudgement(dive:false)` 預測會進圈時，算球在判定高度的穿越點相對**姿勢平台中心**（技術的前方偏移、在含 `receiveTurn` 的身體座標系）的右／前偏移，限 ±`receiveReachLimit`；預測消失時保持現有伸展（不縮回）、觸球後保持、動作結束才歸零。`directGame.js:40` 新狀態 `player.receiveAhead`（前後）、`:272,:285` 每子步以 `receiveReachSpeed` 混合、`:331` 進 `restingSurfacePose`（不加衝量）；`directPose.js:128-139` 平台（與高手姿勢 `:143-144`）加上 `reach`／`ahead` 位移。常數 `directConstants.js:20-21`：`receiveReachLimit` 0.2 → 0.25 h、`receiveReachSpeed` 1.5 → 3 h/s（純畫面常數；原值在 8 tick 起手內走不到位）。這批球在判定前不與身體碰撞（`ruleGhost` 同一條件），所以迎球不改任何判定；R1 轉身組、R11 重播／中途還原仍綠。
- (b) 沒按：`directReceiveRules.js:195-196` `snapToBody(s, pose, parts)`；`:246` 噴球 `timing === 'none'` → 貼到身體任一部位最近表面；有按的（接球、噴球早晚、魚躍）仍貼手掌／前臂。
- 修前／修後判定格位移（`docs/experiments/direct-v8-r3-probes/snap-probe.mjs`：追球探針 chase 全部 2646 案例（有按）＋同網格全不按（沒按類），判定那一格球在自由飛行下的位置 vs 事件位置的距離；修前在 `b06df69` 副本量、修後在本樹量）：

| 類別 | 修前 n | 修前 中位／p95／最大 (m) | 修後 n | 修後 中位／p95／最大 (m) |
|---|---|---|---|---|
| 有按接球（有等級、非魚躍） | 515 | 0.057／0.143／0.242 | 498 | **0.028／0.070／0.130** |
| 噴球有按（按太早／太晚） | 521 | 0.078／0.295／0.524 | 512 | **0.038／0.261／0.514**（p95 以上是按太早到動作已收招的例子：手臂垂著，迎球幫不上） |
| 沒按（噴球 timing none） | 1253 | 0.283／0.619／0.701 | 1253 | 0.283／0.619／0.701（63/1253 例改貼到非手臂部位；中位數沒變——閒置姿勢的手就垂在身前，多數例子最近部位本來就是手） |
| 魚躍 | 616 | 0.086／0.260／0.449 | 616 | 0.086／0.260／0.449（未改：身體已自動朝球撲、手臂依距離伸出） |

  例數變動（515 → 498、521 → 512）來自迎球姿勢：預測消失後手臂保持伸出，圈邊的球有些改碰到伸出的前臂（身體彈開），這些不是規則觸球。
- R6 量法：`tools/receive-assist-probe.mjs:9-23` `armGap` 另回 `bodyGap`（任一部位）、`chase({ press: 'none' })`（`:91,:103`）產沒按的觸球、rows 記 `timing`；測試 `tests/direct-v8-rules.test.js:304`：有按（R1 36 例＋chase 全部規則觸球 1626 例）球面到手掌／前臂 ≤ 0.05 m 全過；沒按 1253 例球面到身體任一部位 ≤ 0.05 m 全過（實作保證），其中 63 例最近部位不是手臂（活性斷言 `:324`）。舊碼紅燈（`b06df69`）：`not ok 1 - R6 … error: '沒按的噴球全部貼在手臂上（身體表面規則沒有被行使）'`；突變 `r6-pressed-body`（有按的也貼身體任一部位）→ 紅：`93/1662 例超過 0.05 m（中位數 0.000 m），例：chase dive:GOOD 0.165；chase dive:GOOD 0.060；…`（有按的觸球被貼到軀幹／大腿等最近部位，離手臂 > 0.05 m 的 93 例）。

### R2 分母改嚴格版

- `tests/direct-receive-assist.test.js:37`：分母＝chase 全部規則觸球（有等級＋噴球）。數字（`docs/experiments/direct-v8-r3-probes/r2-means.mjs`，同一次 chase）：`{"total":1626,"graded":1114,"sprays":512,"PERFECT":{"n":191,"share":0.1175,"mean":0.211},"GOOD":{"n":839,"share":0.516,"mean":0.931},"POOR":{"n":84,"share":0.0517,"mean":1.695}}`——完美 191/1626 = 11.75%（平均距目標 0.211 m）、普通 839 = 51.6%（0.931 m）、差 84 = 5.17%（1.695 m）。三級各 ≥ 5%、平均距離 完美 < 普通 < 差；POOR 只比 5% 門檻多 2.7 例（5% × 1626 = 81.3）（§8 第 5 點的餘裕提醒仍成立）。

### LOW × 2（未修，列在 §8）

- §8 第 11 點：跑動低手誤差倍率可能高於魚躍——倍率改回 1.05 後門檻由 4.94 m/s 降到 2.44 m/s，如實列出、不改。
- §8 第 12 點：球低於平台高度後情境判斷回 null——本樹實測（`docs/experiments/direct-v8-r3-probes/low12-probe.mjs`，強力發球、站 z=7）：tick 58 球心 1.11 m 仍 `dive`／0.5，tick 59 球心 1.00 m 起 `contextAction` 回 null、倍率回 1，魚躍在 tick 64 判；不改。

### 報告更正（覆審員抓到的）

- §10 L4：R8 從 39.1% 掉到 34.05% 的歸因改為覆審員實測的逐項效果（H1 約 +66、M3 約 −169、L4 −27）；「規格與設計要求」措辭刪除。第 6 題改回 1.05 後重量：**R8 = 1062/2646 = 40.1%**（下面「R8 重量」）。
- §10 M3：「×1.5」改寫為實作者自訂數值、第三輪已改回 1.05。
- §10 M5 A23c：舊碼 `3e90288` 的原 A23c 同網格實跑是 diagonal 273/2070、diagonalNoisy 511/4140（不是 72/224）。
- §6 D 組：`direct-physics.test.js` 原檔的拒絕斷言是「還原 bad、還原 direct-v6、重播 bad」三條，沒有「拒絕 direct-v6 重播」那條；已改為如實描述。

### R8 重量（本輪最終碼）

`node tools/receive-assist-probe.mjs chase`：`{"n":2646,"whiff":"5.8%","zone":"1062 40.1%","bodyZone":58,"net":4,"out":11,"other":1416,"sprays":512,"tiers":{"GOOD":839,"POOR":84,"PERFECT":191},"tech":{"dive":616,"underhand":1010},"actions":{"dive":1460,"receive":1186}}`——空接 153/2646 = 5.8% ≤ 25%、碰網 4/2646 = 0.15% ≤ 5%、舉球區 1062/2646 = **40.1%** ≥ 34%（身體彈進區 58 例不算）。與第二輪 34.05% 的差全部來自第 6 題把魚躍倍率改回 1.05（魚躍傳球收斂，`other` 1555 → 1416）；第 3 題的迎球姿勢**不是**回升的來源，它反而讓舉球區少 18 例（第四輪更正 N6，覆審員在 `0e72fd4` 上實測：迎球開 1062、`receiveReachLimit`＝0 時 1080——伸出的前臂攔到 58 顆本來會被判定的球，第四輪 U4 修掉這件事後見 §12）。

### 收尾驗證

- `npm test`（單獨跑、無其他負載）：指令 `npm test`，11:07:08 → 11:12:43（治具與 vite 都關掉之後才跑，期間沒有其他負載）：**2593 條、2593 過、0 敗、0 skip**（2588 + 本輪新增 5 條 `tests/direct-v8-round3.test.js`）。最後 10 行：

```
✔ 整場實跑：滿速↔靜止的 stop-go 交替率 < 0.5%（修前 5.92%） (1621.6864ms)
✔ 決定論：同 seed 兩次整場逐 tick 位置逐值相同（幅值化走位不引入浮點分岔） (1030.644ms)
ℹ tests 2593
ℹ suites 0
ℹ pass 2593
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 334546.9915
```
- 四個瀏覽器治具（真樹、5175；前置同 §5）：預設 `PASS 3 viewports: real input, jump, cancel, replay, layout, disposal`；`--assist` `PASS assist: 3 viewports with visible receive turn, contact, replay`；`--motion` `PASS motion: 3 viewports with run, jump, land, set, block, dive captures`；`--pass` `PASS pass: 3 viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, tap resting, replay; advanced hides hints`（10:31–11:04 循序跑，`docs/experiments/direct-play-evidence/*.json` 為本次輸出；即 R9／R10／A21b 的第三輪證據）
- 背景程序：5175 的 vite（PID 38468）於 11:06 以 `taskkill //PID 38468 //F //T` 關閉（含子行程 33032），`netstat -ano | grep -E ":517[56]"` LISTENING 0 筆；`--pass` 治具結束後殘留的 `chrome-headless-shell`（PID 24832 樹，父 node 34660 已結束）在 11:07 下 `taskkill //PID 24832 //F //T` 時已自行結束（回「找不到處理程序」），隨後 `tasklist | grep -ci chrome-headless-shell` = 0；其他本 session 起的 node（探針、`node --test`）皆已自行結束，機器上剩下的 node 行程只有 09-26 起的 MCP server（非本 session）。突變副本 `mut-tree`／`mut-tree-backup` 與舊碼副本 `old-b06df69`／`old-3e90288` 都在 scratchpad，不在 repo。
- commit 清單：`d2054ec`（sim＋測試＋探針＋報告 §6/§8/§10 更正）→ 第二個 commit＝本 §11、`direct-v8-stage1-r3-old-red.tap`、`direct-v8-stage1-r3-mutations.log`、`direct-v8-r3-probes/`、四治具重跑的 `direct-play-evidence/*`（SHA 見 `git log`，本節寫入時尚未建立）。未 push、未部署、`main` 未動。

## 12. 第三輪覆審修補對照（2026-09-27，使用者裁定 U1～U4 全選甲、第 4 輪驗收 V1～V6）

修補起點 `b62c611`（碼＝`0e72fd4`）。驗收文件未改（`git diff b62c611..HEAD -- docs/kickoffs/` 為空）；門檻、例數、案例集、網格一律不動。證據的取得路徑：**修前碼紅燈**＝把最終版測試（`tests/direct-v8-round4.test.js`＋`tools/direct-v8-round4-probes.mjs`、瀏覽器治具 `tools/direct-play-browser.mjs`）複製到 `0e72fd4` 的 `git archive` 副本上跑（`docs/experiments/direct-v8-stage1-r4-old-red.tap`；V5 另起該副本的 dev server 5176 跑 `--pass`）；**雙樹比對**（V3）＝`tools/receive-reach-diff.mjs <本樹副本> <改常數的副本>`，副本只複製 `src/`＋`tools/`、只改副本的 `directConstants.js`，真樹不動。所有數字都是本樹實跑，指令逐項列出。

### U1｜撲救下界的量法（不需改碼，寫明）

按下魚躍（或情境出手判為魚躍）那一刻，`diveTargetFor`（`src/sim/directReceiveRules.js`）用 `nextJudgement` 以當下跑動外推（`runDistance`）預測「低手判定那一刻球是否在低手圈內」，記成 `player.diveTarget.stage`；上界（0.3 m 時刻 d ≤ 2.0）同一時刻、同一做法（`diveReachOf`）。撲出後身體位置改變不再重量。與 §11「HIGH 撲救範圍下界」所述實作相同，本輪未動。

### N1 HIGH／U2／V1｜按魚躍、判定時球在接球圈內 → 有按的噴球

- 改了什麼：`src/sim/directReceiveRules.js` `pressOf(s)`（接在 `receiveOffset` 後）——這顆球的按鍵：進行中的接球或魚躍，否則 `judge.press` 記的第一個接球／魚躍按鍵（含已收招的）；`circleTiming(press, k)`：按的是魚躍 → timing `'dive'`，否則照 `timingOf`。`judgeStage` 改用 `pressOf`＋`circleTiming`；`spray` 對 `timing !== 'none'` 一律貼手掌／前臂（`'dive'` 屬有按類），事件 `active` 對進行中的魚躍也為 true。`missInfo` 同樣改用 `pressOf`（`pressed`＝有按過、`timing` 可為 `'dive'`）。`src/app/directReceiveReasons.js` `contactReason`：timing `'dive'` → 「噴球：這球要按接球，按成魚躍了 · 低手／高手」；`missReason`：圈內、有按、timing `'dive'` → 「沒接到：這球要按接球，按成魚躍了。」（身體先碰到球的 body 類才會走到）。
- 網格：`tools/direct-v8-round4-probes.mjs diveInCircle`＝覆審 `dive-in-circle.mjs` 同網格（練習指定＝魚躍、球自 2.5 m 直落、d 0.1／0.2／0.3／0.4／0.49 × 8 方位 × 兩個時窗 × 偏差 −3／0／+3 ＝ 240 例；tU 32、tD 40）。其中 **206 例按下在判定前**（覆審員的 206）、34 例球在額頭高度就被判定（tick 22）而按鍵在 tick 23／24 之後才到——那 34 例維持「噴球：沒按 · 高手」，是事實。
- 證據（`node tools/direct-v8-round4-probes.mjs dive-in-circle`，本樹）：`pressedBefore 206`、`outcomes {"stage=over -> spray:dive": 68, "stage=under -> spray:dive": 138}`、`noneTiming 0`、`textWith沒按 0`、`textWith要按接球 206`、`armGapOver005 0`、`graded 0`、`dives 0`；例 `d=0.1 ang=0 diveWin off0 rt21: spray:dive 「噴球：這球要按接球，按成魚躍了 · 高手」 armGap 0.000 part forearm`。測試 `tests/direct-v8-round4.test.js` V1（同一函式）綠。
- 修前碼紅燈（`0e72fd4`）：`not ok 1 - V1 … timing 為 none：206/206，例：d=0.1 ang=0 diveWin off0: spray:none 「噴球：沒按 · 高手」 armGap 0.582；…`（行為斷言：206 例全是沒按噴球、球離手臂 0.58 m）。

### N2 HIGH／V2｜練習頁情境出手：按鈕判斷與 sim 用不同朝向

- 改了什麼：`src/sim/directGame.js` 指令迴圈裡的魚躍分支——`diveTargetFor(s)` 改在 `p.aim` 暫時換回 `s.poseAimStart`（本 tick 開始時的朝向＝按鈕標籤計算時的狀態）下計算，算完還原，所以 sim 記的 `diveTarget.stage` 與標籤的 `nextJudgement` 完全同一個狀態；本 tick 的 aim 指令仍照舊套用到身體。`src/sim/directReceiveRules.js` `contextAction`：這顆球已判定（`judge.done`）就回 null——已判定的球按魚躍不會有目標，按鈕不得再標「魚躍」（覆審 `first` 變體裡 700 例就是這種：沒按的噴球發生後標籤仍寫魚躍）。練習頁 `directPractice.js:238-239` 的送法未動。
- 網格：`tools/direct-v8-round4-probes.mjs aimFlip`＝覆審 `aim-flip.mjs`（chase 餵球／站位誤差／偏差 × 起點 (±1, 6)、(0, 7.5)、(±2, 6)＝4410 局；接球時送自動朝向、魚躍時送搖桿朝向）。
- 證據（`node tools/direct-v8-round4-probes.mjs aim-flip`，本樹）：chase 變體 `divePresses 2617、stageMismatch 0、nullTarget 0`（tally 只剩 `label=dive sim=dive` 四種結果：body 1337、dive:GOOD 1048、miss:dive 170、dive:POOR 62）；first 變體 `divePresses 3003、stageMismatch 0、nullTarget 0`（修 `contextAction` 前 700／700）。測試 V2 兩變體都斷言 0 且每例 `labelStage === 'dive'`，綠。
- 修前碼紅燈：`not ok 2 - V2 … chase: 顯示魚躍而 diveTarget 為 null 28/2617，例：feed vx-1.5 vy0 vz5 start(2,6) err(0,0) off-9: aim jump 24.0° label dive -> sim null -> miss:under；…`（覆審員的 28；stage≠dive 的 39 由第二條斷言抓，第一條先紅就停）。

### N3 HIGH／U4／V3｜迎球只改姿勢，不改判定與碰撞

- 改了什麼：`src/sim/directPose.js` `getDirectPose(state, fraction, { reach = true })`——`reach: false` 時平台不加 `receiveReach`／`receiveAhead`。`src/sim/directGame.js`：碰撞用的 `oldPose`／`nextPose`／`restingSurfacePose`（鍵只剩 `receiveTurn`、`receiveOverhand`）、`bodySeparated` 一律用 `collisionPose(f)`＝`getDirectPose(s, f, { reach: false })`；`judgeTick(s, getDirectPose(s, 1), collisionPose(1))`——球放到畫面姿勢上、**部位由未迎球姿勢選**（`directReceiveRules.js` `snapToBody(s, pose, parts, base)`：在 `base` 選最近部位，再把球放到 `pose` 同 id 的那段表面）。渲染（`directPractice.js` `view.sync(getDirectPose(state))`）與 R6 量法（`armGap`，預設姿勢）仍是迎球姿勢。迎球目標（`receiveReachTarget`）、預測消失時保持伸展、觸球後保持——都沒動。
- 後果（如實）：預測消失後仍伸著的前臂**不再攔球**——球會穿過畫面上的前臂（修前是彈開判 body）。追球探針 chase：這種球 76 例落地判站位失誤、37 例走到判定（噴球 13、傳球 24）、3 例仍碰到身體其他部位；R8 因此從 1062 變 1080（見下）、空接從 153 變 229。
- 證據 V3（`node tools/receive-reach-diff.mjs <本樹副本> <副本>`，簽名＝第一觸的 tick／kind／part／id／tier／technique／timing／offset／target ＋ 終止事件的 type／tick／judged／miss stage；chase 有按 2646＋chase 沒按 2646＋A14 345＋A16 276＋A16b 1150）：三組都是 **0 例不同**（輸出存 `docs/experiments/direct-v8-r4-evidence/reach-diff-*.json`）：
  - 現值（0.25 h／3 h/s）vs `receiveReachLimit` 0：`differs 0`；tally 只剩允許的差異——chase 有按「同第一觸、觸球位置不同」1045、「同第一觸、觸球後落地 tick／落點不同」659；A14 345／199；A16 257／167；A16b 724／474；chase 沒按 2646 例連位置都相同（沒按時迎球本來就是 0）。
  - 現值 vs 0.2 h／1.5 h/s：`differs 0`。現值 vs 0.6 h／10 h/s：`differs 0`（B 樹實際看到的最大 reach 0.6 h，迎球確實在動）。
  - 修前碼紅燈：`0e72fd4` 副本現值 vs 同副本 `receiveReachLimit` 0 → `differs 989`（chase 有按 428：body→none 76、body→spray 13、body→pass 24、body→body 3，其餘是 pass→pass／spray→spray 但**部位不同**，例 `right-forearm → left-forearm`；A14 105、A16 106、A16b 350 含 body→none 124）——即修前迎球既改碰撞（前臂攔球）也改部位。
- 單元測試 `tests/direct-v8-round4.test.js` V3：覆審 `events-diff.reach0.json` 列出的 8 例（feed vx −1.5 vy 1.5 vz 4、起點 (−1, 6)、誤差 (0.5, 0.3)×5 偏差／(−0.5, −0.3)×3 偏差）第一觸須等於不迎球版（無觸球、tick 54 落地、`miss.stage under`），且過程中 `receiveReach`／`receiveAhead` 有伸出（> 0.05 h）。本樹綠；修前碼紅：`not ok 3 - V3 … start(-1,6) err(0.5,0.3) off-9: 伸出的前臂攔到球 → body（tick 45, forearm）`。
- R8 重量（`node tools/receive-assist-probe.mjs chase`，本樹）：`{"n":2646,"whiff":"8.7%","zone":"1080 40.8%","bodyZone":0,"net":0,"out":0,"other":1337,"sprays":525,"tiers":{"GOOD":850,"POOR":97,"PERFECT":191},"tech":{"dive":616,"underhand":1047},"actions":{"dive":1460,"receive":1186}}`——舉球區 1080/2646 = **40.8%** ≥ 34%、空接 229/2646 = 8.7% ≤ 25%、碰網 0 ≤ 5%。與覆審員在 `0e72fd4` 上把 `receiveReachLimit` 設 0 量到的 `{"zone":1080,"bodyZone":0,"whiff":229,"net":0,"out":0,"other":1337,"sprays":525,…}` 逐值相同（`scratchpad/v8-r3/r8.m-reach0.json`）：迎球開著的本樹，判定結果已經和沒有迎球一樣。

### N4 MEDIUM／V4｜沒按的噴球貼「表面最近」的部位

- 改了什麼：`snapToBody` 比較 `|球心 − 軸線最近點| − 部位半徑`（表面距離），不再比軸線距離。
- 證據（`node tools/direct-v8-round4-probes.mjs nearest-surface`，chase 網格全不按，量法同覆審 `nearest-surface.mjs`：以判定 tick 自由飛行位置對 tick 末姿勢逐部位算表面距離）：`n 1253、notNearestSurface 0`、位移 `median 0.271 p95 0.603 max 0.689`（修前 0.283／0.619／0.701）、選中部位 `torso 294、hand 938、forearm 7、leg 14`（修前 forearm 1176、torso 77）、`reachNonZero 0`（沒按類判定時迎球都是 0，所以「未迎球姿勢選部位」與覆審員在畫面姿勢上量是同一件事）、`snapFromMatchesFreeFlight 1253/1253`（事件新欄位 `snapFrom` 與自由飛行外推逐值相同，見 V5）。測試 V4 綠。
- 修前碼紅燈：`not ok 4 - V4 … 1169/1253 例貼到的不是表面最近的部位，例：right-forearm 表面距 0.308 vs torso 0.211；…`（覆審員的 1169）。

### U3／V5｜沒按類（及所有判定）的畫面瞬移只在畫面層平滑

- 改了什麼（sim 只多記資料）：`directReceiveRules.js` `snapToBody` 回傳 `snapFrom`（貼之前的球心＝判定 tick 自由飛行位置），`pass`／`spray` 把它寫進 contact 事件；sim 的任何判斷都不讀它（R11 決定論測試照舊綠）。`src/app/directPractice.js`：設定頁新增「觸球畫面平滑」勾選（`[data-smooth]`，預設開）；`step()` 遇到帶 `snapFrom` 的 contact 事件時記 `snapOffset = snapFrom − position`，`draw()` 畫在 `sim 球 + snapOffset`，畫完把偏移長度每幀縮 `SNAP_SMOOTH_STEP`＝0.12 m 直到 0；餵球／重新開始清零。`debug.picture()` 回傳畫面球位置、sim 球位置、剩餘偏移，給治具量。
- 治具（`tools/direct-play-browser.mjs --pass` 新增段落，三個視口各跑一次）：接球餵球、21 個圈內站位（x −0.3…0.3 × z 4.8／4.95／5.1）× 三類（timed receive＝按在 offset 0；spray＝按早 8 tick；none＝不按），先用不按的一局找出判定 tick，再對每例用真實 `frame()` 迴圈以合成 60 Hz 時鐘從判定前 15 幀跑到判定後 12 幀，每幀記 e(f)＝|畫面球 − sim 球|；斷言：判定前 e ≤ 0.01；**判定那一幀畫面球與「前一幀 sim 球自由飛行一 tick」的差 ≤ 0.01 m**（畫面沒有跳）；判定後 e 逐幀不增、每幀減少 ≤ 0.12、≤ 10 幀內 ≤ 0.01；三類各 ≥ 20 例；再以平滑關閉跑同一組，逐例 sim 事件序列與最終狀態字串相同，且關閉時每幀 e ≤ 0.01。
- 證據：`docs/experiments/direct-play-evidence/pass-browser.json` `scenes[desktop].snapSmoothing`（量測只在 desktop 視口跑，畫面偏移與視口無關；landscape／portrait 記 `measured on desktop only`）：`cases 63`（none 21、pass 21、spray 21）；判定那一幀畫面球對「前一幀 sim 球自由飛行一 tick」的差 `maxJumpOnJudgementFrame 0`（畫面沒有跳）；e(0)＝該幀的 sim 瞬移量：沒按 min 0.110／中位 0.253／p95 0.392／max 0.394 m，接球 0.023 m（max 0.057），噴球 0.005–0.095 m；判定後每幀減少最大 `maxClosePerFrame 0.1200`（≤ 0.12）、逐幀不增（斷言）、最多 `maxFramesToSettle 4` 幀回到 ≤ 0.01 m（≤ 10）；`identicalOnOff true`＝平滑關閉跑同一組 63 例，逐例 sim 事件序列與最終狀態字串相同，且關閉時每幀 e ≤ 0.01。三視口 `PASS pass: 3 viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, judgement snap smoothed in the picture only, tap resting, replay; advanced hides hints`（21:11–21:43）。
- 修前碼紅燈（`0e72fd4` 副本、dev server 5176、同一支治具）：`DIRECT_BASE_URL=http://127.0.0.1:5176 DIRECT_VIEWPORTS=desktop node tools/direct-play-browser.mjs --pass`（21:46 起）→ `AssertionError [ERR_ASSERTION]: stance (-0.3, 4.8) none: the drawn ball jumped 0.136 m on the judgement frame (sim snap ? m)`——行為斷言（第一例沒按的噴球，判定那一幀畫面球一次跳 0.136 m；修前事件沒有 `snapFrom`，顯示 `?`）；紀錄 `docs/experiments/direct-v8-r4-evidence/pass-old-0e72fd4.log`。

### N6 LOW｜報告殘留錯誤（全部更正，原地改）

- §6 D 組：原檔拒絕斷言是五條（還原 bad／v1／v2／v6＋重播 bad），已改，附原檔行號與現行行號。
- §7：`snapToArms` → `snapToBody`；「誤差 ×1.5」→ 總倍率 1.05。§8 第 3 點「噴球也貼到手臂」→ 有按貼手臂、沒按貼身體；第 4 點「再 ×1.5」→ 1.05。
- §10 L4：「淨值就是 1034 → 901」→ 三項加總 904、實測 901、差 3 例是交互作用。
- §11 R8 重量：回升全部來自第 6 題；迎球姿勢反而讓舉球區少 18 例（1062 vs 1080）。

### N5、N7（不修，記錄）

- N5：A14／A16 新分母的鑑別力偏弱（資訊）——不動。
- N7：`direct-v8.1` 從未部署、沒有外流錄影，版本字串不升。

### 收尾驗證

- `npm test`（單獨跑：治具、vite、探針全部結束並以 `netstat`／`tasklist` 確認後才起）：22:05:46 → 22:10:17，**2597 條、2597 過、0 敗、0 skip**（2593 + 本輪新增 4 條 `tests/direct-v8-round4.test.js`）。最後 10 行：

```
✔ 整場實跑：滿速↔靜止的 stop-go 交替率 < 0.5%（修前 5.92%） (805.0117ms)
✔ 決定論：同 seed 兩次整場逐 tick 位置逐值相同（幅值化走位不引入浮點分岔） (532.7952ms)
ℹ tests 2597
ℹ suites 0
ℹ pass 2597
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 269717.9354
```
- 四個瀏覽器治具（真樹、5175、`PLAYWRIGHT_MODULE` 同 §5）：`--assist` `PASS assist: 3 viewports with visible receive turn, contact, replay`（13:30）、`--motion` `PASS motion: 3 viewports with run, jump, land, set, block, dive captures`（13:33）、`--pass` `PASS pass: 3 viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, judgement snap smoothed in the picture only, tap resting, replay; advanced hides hints`（21:11–21:43）、預設 `PASS 3 viewports: real input, jump, cancel, replay, layout, disposal`（21:43–21:46）；`docs/experiments/direct-play-evidence/*.json` 為本次輸出。第一次跑 `--pass` 時（V5 量測在三個視口都跑）行程在 portrait 視口卡住超過 6 小時、無輸出，行程被中止後改成只在 desktop 量測（`tools/direct-play-browser.mjs`，與視口無關的量）重跑；第一次跑預設治具在 `[data-replay]` 點擊逾時（當時同機另有兩個 node 探針與一個 headless 瀏覽器在跑），單獨重跑一次即 PASS——兩者都沒有加 retry／sleep。
- R8（`node tools/receive-assist-probe.mjs chase`）：**1080/2646 = 40.8%** ≥ 34%（見 N3 段）。
- 修前碼 `0e72fd4` 紅燈：V1～V4 `docs/experiments/direct-v8-stage1-r4-old-red.tap`（`not ok 1`～`not ok 4`，斷言訊息見各段）；V3 雙樹 `reach-diff-old-vs-old-reach0.json` differs 989；V5 `pass-old-0e72fd4.log`。
- 背景程序：5175（PID 37120）與 5176（PID 30908）兩個 vite 於 npm test 前以 `taskkill //PID … //F //T` 關閉，`netstat -ano | grep -E ":517[56] "` LISTENING 0 筆、`tasklist` 無 `chrome-headless-shell`；探針與 `node --test` 皆已自行結束。副本 `old-0e72fd4`（junction 指向真樹的 node_modules）、`v3-*` 都在 scratchpad，不在 repo。未 push、未部署、`main` 未動。
- commit 清單：`3e73464`（碼＋測試＋探針＋報告 §12 草稿＋N6 更正）→ `9126c33`（V3 證據、治具視口過濾）→ 第三個 commit＝V5 證據、四治具重跑的 `direct-play-evidence/*`、本節收尾（SHA 見 `git log`）。

## 13. 第 4 輪覆審修補對照（2026-09-28，使用者裁定 NEW-1 甲、NEW-2 丙、NEW-3 甲；第 5 輪驗收 W1～W4）

修補起點 `c6a5c67`（碼＝已部署試玩版；`7f63933` 只多驗收檔修訂）。驗收文件未改（`git diff 7f63933..HEAD -- docs/kickoffs/` 為空）；門檻、例數、案例集、網格一律不動。證據取得路徑：**修前碼紅燈**＝把最終版測試（`tests/direct-v8-round5.test.js`＋`tools/direct-v8-round5-probes.mjs`、`tools/receive-reach-diff.mjs`、瀏覽器治具 `tools/direct-play-browser.mjs`）複製到 `c6a5c67` 的 `git archive` 副本（scratchpad `v8-r5/old`，`node_modules` 為 junction）上跑；**雙樹比對**（W3）＝`tools/receive-reach-diff.mjs <本樹 src+tools 副本> <同副本改 receiveReachLimit=0>`，真樹不動。所有數字都是本樹實跑。探針來源：覆審 `v8-r4-aux/` 的 `pen2.mjs`→`drawnArmPenetration`、`snapdist.mjs`→`snapDistances`、`second.mjs`→`secondContacts`（同網格、同量法，移進 `tools/direct-v8-round5-probes.mjs`），`land.mjs` 的落點比對併進 `receive-reach-diff.mjs`（落點差 > 0.01 m 列為 DIFFERS）。

### NEW-1 HIGH／W1｜預測消失時手臂收回（甲）

- 改了什麼：`src/sim/directReceiveRules.js` `receiveReachTarget`——只有**觸球後**（`receiveTouched`／`contactEpisode`）才回 null（保持）；球不在飛向圈內（`nextJudgement` 為 null、球已判定為失誤、球不再下落）一律回 `{0, 0}`，手臂以原速（`receiveReachSpeed` 3 h/s）收回。另加**邊緣衰減**：迎球量乘上 `sure = clamp((radius − d) / receiveReachMargin)`（`directConstants.js` 新常數 `receiveReachMargin` 0.15 m）——球預測落在圈邊 0.15 m 內時迎球比例線性降到 0。只改畫面姿勢（`getDirectPose` 的 reach），碰撞與判定姿勢（`collisionPose`）本來就不含迎球（U4），判定不變。
- 為什麼單靠收回不夠（如實）：只做「預測消失即收回」，追球網格的穿透例從 76 降到 29；gate 改用不外推的預測（`run: 0`）降到 20；再加「跑到判定時刻也在圈內」的保守 gate 降到 9。剩下的 9 例都是同一型：預測在判定前 1～3 tick 才翻成「圈內」（判定量的是 tick 末的球位置，圈邊球會差 5～10 cm），手臂剛伸出 0.05～0.15 h 就被判失誤——任何收回速度都來不及。邊緣衰減從源頭不對圈邊球伸手，單獨加上（不需 `run: 0`、不需保守 gate）即為 0 例；最終碼只留「收回」＋「邊緣衰減」兩件。
- 證據（`node tools/direct-v8-round5-probes.mjs penetration`，本樹）：`runs 5292, penetrateThenNoTouch 0, maxDepth 0`（W1 門檻 ≤ 5、≤ 0.168 m）。測試 W1（`tests/direct-v8-round5.test.js`）綠。迎球仍在動：雙樹比對 `maxReachSeen 0.25`（A 樹）。
- 修前碼紅燈（`c6a5c67`，`docs/experiments/direct-v8-r5-evidence/round5-old-red-c6a5c67.tap`）：`not ok 1 - W1 … 球穿過畫面上的前臂後沒被接到：76/5292，例：feed(-1.5,1.5,4) start(-1,6) err(0.5,0.3) off-9 auto: tick 45 left-forearm 深 0.038 m reach -0.25/0.02 h；…`（行為斷言；覆審員的 76）。0e72fd4 基準（同探針、scratchpad 副本）：5 例、最大 0.168 m——即 W1 條文的兩個數字。
- V3 測試（round4）與 W1 不衝突：8 例第一觸仍無觸球、tick 54 落地、`under` 失誤，且 `receiveReach`／`receiveAhead` 仍有伸出（> 0.05 h）——迎球在預測消失前已伸出，收回不影響判定一致性斷言；V3 未改。

### NEW-2 HIGH／W2｜U2 球改貼未撲出的姿勢（丙）

- 改了什麼：`src/sim/directPose.js` 新增 `diveThrown(p)`＝`action === 'dive' && (!diveTarget || diveTarget.stage === 'dive')`。按魚躍時預測球會進高手／低手圈（`diveTarget.stage` 為 `over`／`under`，U2）→ **身體不撲出**：`directGame.js` 不給起撲速度（原本會以 `diveMinSpeed` 朝球撲）、減速改用一般 `friction`、步態相位照常；`directPose.js` 的魚躍變形（下蹲 0.28、前撲傾身、手臂前伸、腿部）全部以 `thrown` 為條件，U2 時是站姿。判定不變：仍在圈內判「有按的噴球」（timing `dive`、原因「這球要按接球，按成魚躍了」），球貼在站姿的手掌／前臂上（V1 量法 `gaps(s)` 在畫面姿勢上 ≤ 0.05 m 照舊綠）。撲救範圍內（stage `dive`）與無目標的魚躍（plain dive）照舊撲出，R4 的 30/30 朝球撲出、倒地 42 tick 不變。
- 證據（`node tools/direct-v8-round5-probes.mjs snap-distance`，chase 五起點有按＋沒按＋dive-in-circle 網格）：`overhand/dive n 68 p95 0.736 max 0.736 over12 0`、`underhand/dive n 138 p95 0.636 max 0.717 over12 0`（修前 88 例 max 1.371、42 例 > 1.2；118 例 max 0.543）；其餘類別 max：dive/pass 0.437、underhand/none 0.689、underhand/late 0.511、underhand/pass 0.313（W3 後球貼無迎球姿勢，較修前 0.172 大，仍遠低於 1.2）。測試 W2 綠。
- 修前碼紅燈：`not ok 2 - W2 … overhand/dive: 42/88 例瞬移 > 1.2 m（最大 1.371 m）`。
- V5 瀏覽器量測納入本類：治具 `--pass` 的 V5 段新增第四類 `dive`（21 站位、判定前 12 tick 注入 `action: 'dive'`，判為 timing `dive` 的噴球），每類 ≥ 20 例——結果見「收尾驗證」。

### NEW-3 MEDIUM／W3｜迎球開關的觸球後軌跡一致（甲）

- 改了什麼：`directGame.js` `judgeTick(s, collisionPose(1))`——球**貼到無迎球的碰撞姿勢**（不再是畫面姿勢），判定有觸球就把 `receiveReach`／`receiveAhead` 歸零，所以判定那一格結束時畫面姿勢＝碰撞姿勢、球就在畫面手臂上（R6 量法 `armGap` 在 `getDirectPose(s, 0)` 上不變，仍 100%）。`judgeTick`／`snapToBody`／`pass`／`spray` 的 `base` 參數移除（只剩一個姿勢）。sim 從此完全不讀迎球：碰撞、部位、貼球位置、出球、後續二次碰撞都與 `receiveReachLimit` 無關。
- 畫面層（`src/app/directPractice.js`）：`shownReach` 以每幀 ≤ `receiveReachSpeed/60` h（＝sim 自己的每 tick 上限，所以平時零延遲）跟隨 sim 迎球，唯獨判定那一格的瞬間歸零改為幾幀緩回；`view.sync(getDirectPose(state, 0, { reach: shownReach }))`（`directPose.js` 的 `reach` 選項新增可傳 `{ side, ahead }`）。「觸球畫面平滑」關閉時畫面直接用 sim 值。`debug.picture()` 多回 `reach: { shown, sim }` 給治具量。
- 為什麼不是「球仍貼畫面手臂、出球補償到同一落點」（如實）：先試過該做法（噴球從無迎球位置算落點、再從畫面位置對準它）——落點差 > 0.01 m 剩 16/1663，全是噴球落回身上的**二次碰撞**在兩版路徑不同下一有一無；要 0 例只能讓 sim 路徑本身相同。
- 證據 W3（`node tools/receive-reach-diff.mjs <new> <new-reach0>`，`docs/experiments/direct-v8-r5-evidence/reach-diff-reach0.json`）：chase 有按 2646＋沒按 2646＋A14 345＋A16 276＋A16b 1150：`differs 0`、`maxLandingDifferenceAfterTouch 0`，tally **連「觸球位置不同（允許）」都是 0**——兩樹事件逐值相同；`A.maxReachSeen 0.25`（迎球確實在動）。`node tools/direct-v8-round5-probes.mjs second-contact`：`judged 1663, second 20, invisible []`（修前 2）、判定那一格 `reachNonZero 0`、球離畫面姿勢與無迎球姿勢的手臂最大 0.00001 m。測試 W3 綠。
- 修前碼紅燈：雙樹 `reach-diff-old-c6a5c67-vs-reach0.json`：`differs 1094`（chase 有按落點差 > 0.01 m 461、A14 166、A16 113、A16b 354）、`maxLandingDifferenceAfterTouch 3.545`（覆審員的 1046／3.54 m，同一組案例，本工具另計 A14／A16／A16b）；`not ok 3 - W3 … 判定後撞到畫面上沒有的手臂 2/36，例：[{"feed":[-1.5,0,6],"start":[1,6],"err":[0,-0.3],"off":3,"part":"forearm","gap":0.105},…]`。
- R8 重量（`node tools/receive-assist-probe.mjs chase`，`docs/experiments/direct-v8-r5-evidence/r8-chase.txt`）：`{"n":2646,"whiff":"8.7%","zone":"1080 40.8%","bodyZone":0,"net":0,"out":0,"other":1337,"sprays":525,…}`——與 §12 逐值相同（sim 結果本來就已與迎球無關；U2 不撲出只改噴球的貼球位置，不改判定）。

### 既有測試的改動

- 無。`tests/direct-v8-round4.test.js`（含 V3 的判定一致性斷言）未改；只新增 `tests/direct-v8-round5.test.js`。治具 `tools/direct-play-browser.mjs` 只**加**一類（dive）與一個記錄欄位（`maxDrawnReachLag`），既有斷言與門檻未動；`tools/receive-reach-diff.mjs` 把「觸球後落點不同」從「允許」改為 DIFFERS（加嚴）。

### 收尾驗證（W4）

- `npm test`（單獨跑：四治具、兩個 vite（5175／5176）、舊碼治具全部結束並以 `netstat`（`:5175`／`:5176` LISTENING 0 筆）、`tasklist`（無 `chrome-headless-shell`）確認後才起）：03:03:34 → 03:08:41，**2600 條、2600 過、0 敗、0 skip**（2597 + 本輪新增 3 條 `tests/direct-v8-round5.test.js`）。最後 10 行：

```
✔ 整場實跑：滿速↔靜止的 stop-go 交替率 < 0.5%（修前 5.92%） (1093.0012ms)
✔ 決定論：同 seed 兩次整場逐 tick 位置逐值相同（幅值化走位不引入浮點分岔） (715.1575ms)
ℹ tests 2600
ℹ suites 0
ℹ pass 2600
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 306207.8953
```
- 四個瀏覽器治具（真樹、vite 5175 `--force`、`PLAYWRIGHT_MODULE` 同 §5，三視口）：`--pass` `PASS pass: 3 viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, judgement snap smoothed in the picture only, tap resting, replay; advanced hides hints`（01:32–02:28）、預設 `PASS 3 viewports: real input, jump, cancel, replay, layout, disposal`（02:28–02:32）、`--assist` `PASS assist: 3 viewports with visible receive turn, contact, replay`（02:32–02:34）、`--motion` `PASS motion: 3 viewports with run, jump, land, set, block, dive captures`（02:34–02:39）；`docs/experiments/direct-play-evidence/*.json` 為本次輸出。第一次起的 vite 因 dep 快取過期回 504（頁面載不進 `__directPractice`，四治具 34 秒內逾時），改以 `--force` 重起後一次全過，沒有加 retry／sleep。
- V5＋W2 瀏覽器量測（`pass-browser.json` `scenes[desktop].snapSmoothing`）：`cases 84`（none 21、pass 21、spray 21、**dive 21**）；`maxJumpOnJudgementFrame 0`、`maxClosePerFrame 0.1200`、`maxFramesToSettle 4`、`identicalOnOff true`；e(0)：dive 類 min 0.123／中位 0.253／p95 0.392／max 0.423 m，none 0.110–0.394，pass max 0.136，spray max 0.139；畫面手臂緩回對 sim 迎球的最大落後 `maxDrawnReachLag 0.153 h`（只發生在判定那一格的歸零之後，≤ 3 幀收完）。
- 修前碼 V5 dive 類紅燈（`c6a5c67` 副本、vite 5176、同一支治具、desktop）：`DIRECT_BASE_URL=http://127.0.0.1:5176 DIRECT_VIEWPORTS=desktop node tools/direct-play-browser.mjs --pass`（02:40–03:02）→ `AssertionError [ERR_ASSERTION]: stance (-0.3, 4.8) dive: expected a dive, got {"tick":46,"tier":null,"spray":false,"timing":null,"technique":null,"part":"torso","snap":null}`——行為斷言：舊碼在圈內按魚躍會把身體撲向球、球撞到軀幹判 body（不是有按的噴球）；紀錄 `docs/experiments/direct-v8-r5-evidence/pass-old-c6a5c67.log`。舊碼瞬移 > 1.2 m 的紅燈由 W2 測試（`round5-old-red-c6a5c67.tap`）提供。
- R8：**1080/2646 = 40.8%** ≥ 34%（`r8-chase.txt`）。
- 背景程序：5175（`--force` 起的 vite）與 5176 於 npm test 前以 `taskkill //PID … //F //T` 關閉，`netstat -ano | grep -E ":517[56] "` LISTENING 0 筆、`tasklist` 無 `chrome-headless-shell`、無殘留 `direct-play-browser` 行程；探針與 `node --test` 皆自行結束。副本 `old`、`old-reach0`、`old-0e72fd4`、`new`、`new-reach0`（junction 指向真樹 `node_modules`）都在 scratchpad `v8-r5/`，不在 repo。未 push、未部署、`main` 未動。
- commit 清單：`085d172`（碼＋測試＋探針＋工具＋舊碼紅燈＋§12 更正）→ 第二個 commit＝四治具與舊碼 V5 輸出、§13、§0（SHA 見 `git log`）。

## 14. 第 5 輪覆審修補對照（2026-09-28，使用者裁定 NEW-A 甲、迎球取捨甲、NEW-B 甲；第 6 輪驗收 X1～X4）

修補起點 `c7a0337`（碼＝`ff6e868`，即第 5 輪證據版；`c7a0337` 只多驗收檔的裁定與 X1～X4 凍結）。驗收文件未改（`git diff c7a0337..HEAD -- docs/kickoffs/` 為空）；門檻、例數、案例集、網格一律不動。證據取得路徑：**修前碼紅燈**＝把最終版測試（`tests/direct-v8-round6.test.js`＋`tools/direct-v8-round6-probes.mjs`）複製到 `ff6e868` 的 `git archive` 副本（scratchpad `v8-r6/old`，`node_modules` 為 junction）上跑；**X3 突變紅燈**＝把本樹 `src/`＋`tools/`＋`tests/` 複製成兩份副本（`v8-r6/mut-instant`、`v8-r6/mut-hold`），只改副本的 `src/app/directPicture.js`，真樹三檔 sha1（`f500693d…`、`d3005f55…`、`c18f9e5c…`）在突變前後相同。所有數字都是本樹實跑。探針來源：覆審 `v8-r5-review/` 的 `u2.mjs`→`u2Scenario`、`u2chase.mjs`→`u2Chase`、`u2restore.mjs`→`u2Restore`（同情境、同網格、同量法，移進 `tools/direct-v8-round6-probes.mjs`）；覆審三支原探針在修前／修後的原始輸出也留在 `docs/experiments/direct-v8-r6-evidence/reviewer-*.log`。

### NEW-A MEDIUM／X1｜U2 動作縮短＋撲空姿勢（甲）

- 改了什麼：`src/sim/directPose.js` 新增 `actionDef(p)`——動作時長的單一來源：`dive` 且 `!diveThrown(p)`（U2）時回 `DIRECT_ACTIONS.receive`（8＋10＋14＝32 tick），其餘回 `DIRECT_ACTIONS[p.action]`；`stepDirectGame` 的動作結束判斷（`directGame.js:388-392`）與 `getDirectPose` 的 `def` 都改讀它，所以 U2 的魚躍與接球一樣長，結束後搖桿立刻生效（動作期間搖桿仍被忽略，與接球相同）。撲空姿勢：`WHIFF`＝0.35——U2 時 `dive`＝0.35×weight（weight＝raise×recover，沿接球的時序起落），下蹲 0.28×dive、軀幹前傾與腿部後蹬都沿用撲出魚躍的公式乘上這個係數；手臂改到球要進的圈：`diveTarget.stage` 為 `over` → 高手（額前）位置，否則 → 低手平台位置，讓球仍貼在判定點附近的手掌／前臂上（W2、R6 不變）。判定鏈沒動：U2 仍在圈內判「有按的噴球」（`pressOf` 讀 `judge.press`，動作是否已結束都一樣是 timing `dive`）。撲出的魚躍（band、plain）與倒地 42 tick（R4）不變。練習頁提示（`directPractice.js`）改讀 `actionDef`／`diveThrown`：U2 顯示「收招中」而非「倒地起身中」。
- 為什麼手臂分高手／低手（如實）：只做下蹲＋前傾、手臂維持站姿時，高手圈 U2 的判定格瞬移會從 0.736 m 變差到約 0.75 m（下蹲把手肘從 0.6 h 拉低到 0.59 h）；把手抬到球要進的圈之後，高手圈 max 0.658 m、低手圈 0.179 m，都比第 5 輪小。
- 證據（`node tools/direct-v8-round6-probes.mjs u2`，`docs/experiments/direct-v8-r6-evidence/round6-u2.json`；修前 `round6-u2-old-ff6e868.json`）：低手圈 `stage under, actionTicks 32（修前 63）, endTick 41（72）, firstMoveTick 43（74）, vxAfterEnd 0.4, maxPelvisDrop 0.171 m（0）, maxTorsoLean 33.9°（0）`，判定 `t32 timing dive spray forearm`、原因「噴球：這球要按接球，按成魚躍了 · 低手」；高手圈 `stage over` 同一組時長，判定 `t22 timing dive spray hand`、「… · 高手」。覆審原探針 `u2.mjs`：`dive: first tick body moves after stick push at 12 -> 43`（修前 74）；`chase(5 starts) contextual dive presses 2636 of which U2 (circle stage) 0`（不變：情境出手不會對進圈的球按魚躍，U2 只來自練習指定）。
- 瞬移（`node tools/direct-v8-round5-probes.mjs snap-distance`，`round5-snap-distance.json`）：`overhand/dive n 68 p95 0.634 max 0.658`（修前 0.736）、`underhand/dive n 138 p95 0.173 max 0.179`（修前 0.717）；其餘類別逐值與 §13 相同（dive/pass 0.437、underhand/none 0.689、underhand/late 0.511、underhand/pass 0.313、underhand/early 0.217、overhand/none 0.319）。練習指定魚躍的 chase 網格（`u2-chase`，5 起點 4410 局、U2 觸球 1294）：`p50 0.068（修前 0.271）, max 0.514（0.689）, over 0.74: 0`。
- R11（`u2-restore`）：3 卷 U2 錄影每 3 tick 還原續跑＋整卷重播 `checks 6108, bad 0, stages [over, under]`。
- 測試 `tests/direct-v8-round6.test.js` 4 條綠（`round6-new.tap`）。修前碼紅燈（`ff6e868` 副本，`round6-old-red-ff6e868.tap`）：低手圈與高手圈兩條各紅在 `AssertionError: 動作總長 63 tick（接球動作 32）`（行為斷言，第一條就是覆審員量到的 63 tick 定住；同一測試接著要求 2 tick 內能動、撲空姿勢，修前分別是 firstMove 74 與 0 m／0°，探針輸出可見）；瞬移 ≤ 0.74 與 R11 兩條在舊碼也綠（本來就是「不得變差」的界線與既有性質）。

### NEW-B／X2｜版本升 `direct-v8.2`（甲，R12 條文經使用者同意改）

- `src/sim/directConstants.js:3` `direct-v8.1` → `direct-v8.2`；練習頁 `[data-build]`（`directPractice.js:76`）與匯出 `simulationVersion`（`tape()`）都由 `SIMULATION_VERSION` 產生，未另改；`tools/direct-play-browser.mjs:20` `VERSION` → `direct-v8.2`（`--delivery` 期望值）。
- 拒絕舊版（比照 v6／v7 的既有斷言）：`tests/direct-pass.test.js` A5 多 `restoreDirectGame` 與 `replayDirectTape` 各拒絕 `direct-v8.1` 一條；`tests/direct-physics.test.js` 多 `restoreDirectGame` 拒絕 `direct-v8.1` 一條；`tests/direct-v8-context.test.js` R11 多 `replayDirectTape` 拒絕 `direct-v8.1` 一條。

### X3 LOW｜`maxDrawnArmGap` 改量畫面實際的迎球（加嚴）

- 原斷言為什麼恆真：`secondContacts` 在判定那一格用 `getDirectPose(s)` 量球到「畫面手臂」的距離，但 `judgeTick` 已把 `receiveReach`／`receiveAhead` 歸零，`getDirectPose(s)` 就是無迎球姿勢，所以「drawn」與「base」永遠同一個數。練習頁真正畫的是它自己緩回的值（前一幀的值朝 sim 值每幀最多走 `receiveReachSpeed/60`＝0.05 h）。
- 改了什麼：把那條緩回規則從 `directPractice.js` 抽成 `src/app/directPicture.js` 的 `easeReach`（零 three，練習頁改 import 它，不再自留一份），`tools/direct-v8-round5-probes.mjs` 的 `secondContacts` 對每個判定觸球，從判定前一 tick 的 sim 迎球值起，逐幀（一 tick 一幀）套 `easeReach` 到與 sim 值相等為止，回報：判定前有迎球的例數 `reachedBefore`、單幀最大變化 `maxReachStepPerFrame`、回到 sim 值所需最大幀數 `maxFramesToSettle`、回到那一幀球到畫面手臂的距離 `maxDrawnArmGap`，另附判定那一幀（緩回中）球到畫面手臂的距離 `judgementFrameGap`（資訊）。`tests/direct-v8-round5.test.js` W3 改斷言：`reachedBefore ≥ 100`（緩回要有東西可量）、`maxReachStepPerFrame ≤ REACH_EASE_STEP`、`maxFramesToSettle ≤ ⌈receiveReachLimit / REACH_EASE_STEP⌉`（＝5）、回到那一幀 `maxDrawnArmGap ≤ 0.05`；原 `maxBaseArmGap ≤ 0.05` 保留。
- 證據（`node tools/direct-v8-round5-probes.mjs second-contact`，`round5-second-contact.json`）：`judged 1663, reachedBefore 956, maxReachStepPerFrame 0.0500, maxFramesToSettle 5, maxDrawnArmGap 0.00001, judgementFrameGap 0.0765, maxBaseArmGap 0.00001, invisible []`。如實：回到 sim 值那一幀畫面姿勢＝無迎球姿勢（0.00001 與 base 同數），真正有鑑別力的是「單幀 ≤ 步長」與「≤ 5 幀回到」兩條；判定那一幀畫面手臂還在緩回途中，球離它最多 0.077 m——這一幀的球由 V5 的畫面球平滑一起帶回去，不是 sim 的事。動手前先在修前碼量了畫面層各幀的距離分布（`x3-picture-reach-exploration-ff6e868.txt`）：判定前一 tick 迎球 p95 0.226 h（pass 類），「球貼在判定那一幀畫面手臂 ≤ 0.05」在任何緩回實作下都不可能成立（最大 0.437 m），所以斷言量的是畫面迎球本身的連續與收斂。
- 突變紅燈（`round5-mut-instant-zero.tap`、`round5-mut-hold-reach.tap`，兩份副本各只改 `easeReach` 一行）：直接歸零 → `AssertionError: 畫面迎球單幀變化最大 0.250 h > 步長 0.050（判定那一格直接歸零）`；保持伸出 → `AssertionError: 畫面迎球 20+ 幀仍未回到 sim 值（上限 5 幀；保持伸出）`。本樹同一測試綠（`round5-new-with-x3.tap`：W1、W2、W3 3/3）。

### 既有測試的改動（逐檔）

- `tests/direct-pass.test.js:37-43`、`tests/direct-physics.test.js:367,393-396`、`tests/direct-v8-context.test.js:289-291`：重播用的版本字串 `direct-v8.1` → `direct-v8.2`（不改就是紅——`replayDirectTape` 拒絕不同版本，屬 X2 使用者已同意的 R12 改動），另各加一條拒絕 `direct-v8.1` 的 `assert.throws`（只會更嚴）。
- `tests/direct-v8-round5.test.js` W3：如上，四條新斷言全是加嚴，沒有拿掉任何一條有鑑別力的舊斷言（拿掉的只有恆真的那條，換成量畫面值的四條）。
- 其餘測試未改；`tools/direct-v8-round5-probes.mjs` 的 `drawnArmPenetration`、`snapDistances` 未改。

### 收尾驗證（X4）

- 提早回歸（在治具之前、本樹）：`node --test tests/direct-v8-rules.test.js tests/direct-v8-round4.test.js tests/direct-v8-context.test.js tests/direct-pass.test.js tests/direct-physics.test.js` → 49/49 過、0 skip（含 R4 倒地 42 tick、V1～V4、R11、A5 與 X2 的拒絕 v8.1 斷言）。
- 四個瀏覽器治具（真樹、vite 5175 `--force`、`PLAYWRIGHT_MODULE` 同 §5、三視口，循序）：`--pass` `PASS pass: 3 viewports with cues, contextual hit button (receive/dive), slow motion 0.5x/1x, judgement snap smoothed in the picture only, tap resting, replay; advanced hides hints`（05:44–06:18）、預設 `PASS 3 viewports: real input, jump, cancel, replay, layout, disposal`（06:18–06:21）、`--assist` `PASS assist: 3 viewports with visible receive turn, contact, replay`（06:21）、`--motion` `PASS motion: 3 viewports with run, jump, land, set, block, dive captures`（06:21–06:23）；`docs/experiments/direct-play-evidence/*.json` 為本次輸出，四支 log 在 `direct-v8-r6-evidence/harness-*.log`。
- `--delivery`（本機 5175，對本樹；線上版由主對話部署後再跑）：`PASS delivery: menu navigation, direct practice, export metadata; direct-v8.2 · 2026-09-28 05:39`——`[data-build]` 以 `direct-v8.2` 開頭、匯出檔 `simulationVersion === 'direct-v8.2'`（`delivery-browser.json`：`{"build":"direct-v8.2 · 2026-09-28 05:39","exportMetadata":true,"menuNavigation":true,"errors":[]}`）。
- V5＋W2 瀏覽器量測（`pass-browser.json` `scenes[desktop].snapSmoothing`）：`cases 84`（none 21、pass 21、spray 21、dive 21）；`maxJumpOnJudgementFrame 0`、`maxClosePerFrame 0.1200`、`maxFramesToSettle 4`、`identicalOnOff true`、`maxDrawnReachLag 0.153 h`；e(0)：dive 類 min 0.003／中位 0.049／p95 0.165／max **0.165 m**（§13 為 0.123／0.253／0.392／0.423——U2 的球現在貼在抬到圈上的手上，畫面要收的距離小了），none 0.110–0.394、pass max 0.136、spray max 0.139（與 §13 同）。R10 逐 tick 對照 `checked 50, mismatched 0, dives 9, receives 41`；R9 慢動作開關 `identical true`。
- R8：**1080/2646 = 40.8%** ≥ 34%（`r8-chase.txt`，與 §12／§13 逐值相同——U2 只改動作長度與姿勢，情境出手的追球網格沒有 U2）。
- `npm test`（單獨跑：vite 5175（PID 46280 樹）以 `taskkill //PID 46280 //F //T` 關閉、`netstat -ano | grep -E ":517[5-9] "` LISTENING 0 筆、`tasklist` 無 `chrome-headless-shell`、無 `direct-play-browser` node 行程之後才起）：06:24:41 → 06:29:06，**2604 條、2604 過、0 敗、0 skip**（2600 + 本輪新增 4 條 `tests/direct-v8-round6.test.js`）。最後 10 行：

```
✔ 整場實跑：滿速↔靜止的 stop-go 交替率 < 0.5%（修前 5.92%） (900.8569ms)
✔ 決定論：同 seed 兩次整場逐 tick 位置逐值相同（幅值化走位不引入浮點分岔） (448.135ms)
ℹ tests 2604
ℹ suites 0
ℹ pass 2604
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 263543.4919
```
- 背景程序：vite 5175 已關（`taskkill` 回報 PID 46280 與子行程 47168 已終止；之後 `netstat` 只剩 OS 的 TIME_WAIT，LISTENING 0）；沒有起 5176（本輪突變只在 node 測試層驗紅，不需第二個 dev server）；探針、`node --test`、治具都自行結束。副本 `old`（`ff6e868`）、`mut-instant`、`mut-hold`（`node_modules` 為 junction 指向真樹）都在 scratchpad `v8-r6/`，不在 repo。未 push、未部署、`main` 未動。
- commit 清單：`bd4e4c9`（碼＋測試＋探針＋工具＋舊碼紅燈＋突變紅燈＋證據 JSON）→ 第二個 commit＝四治具輸出、`--delivery` 本機 PASS、§14、§0（SHA 見 `git log`）。
