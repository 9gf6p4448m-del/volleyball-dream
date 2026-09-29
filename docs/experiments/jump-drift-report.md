# 跳躍前飄卷報告（feat/jump-drift，起點 dcd6609；驗收修訂 R1–R3 見 914d34d）

## 0. 結論

J1、J4–J9 共 7 條過。**J2 在「扣球（前排）」類 166 筆裡有 4 筆不過、J3 有其中 2 筆不過**，全是**舉球員第二觸攻擊**。
其中 2 筆的跳躍是在觸球那一幀才開始（只影響 J2），2 筆是從跳舉動作接過去的（J2、J3 都不過）。
扣除這 4 筆，扣球的 J2、J3 全過。
這 4 筆放在現行條件下都無解（理由見 §4），依規矩停下回報，驗收條件一字未改。
後排攻擊 17/17、跳發 31/31（R3）、正式比賽 A2 玩家扣球 41/41（R2）逐筆全過。

## 1. 任務複述（3 行）與採用的解讀
1. 只改表現層：滯空期間 root 沿前進方向飄向擊球點（扣球、後排、跳發；跳舉 ≤0.15 m；攔網 0），不過網；落地後 ≤0.5 s 併回 sim。
2. AI 與玩家（正式比賽 A2，R2）都要生效；src/sim 一行不動，reachAssist 參數不動；J3、J7 每幀 ≤0.07 m（R1）。
3. 用真實 matchView 鏈路量測，改前、改後逐條比對 J1–J9。

我採用的解讀如下：
- **擊球點 H**：觸球那一 tick 的球位置，也就是 game.js 的 `from`。sim 在同一 tick 就把球往前積分了一步，所以治具用「現在的球位置 − 球速 × (g.tick − e.tick)/60」倒推回觸球點。第一版報告直接讀積分後的球位置，d_sim 被高估約 0.15 m；本版的改前基準已用修正後的定義重跑（`measure-before.json`）。
- **J2 的 d_sim**：照字面解讀，從起跳幀 sim 位置 P0 到 H。**J3**：量 root 總位移，以畫面幀為單位（治具的 rAF 間隔 16 ms），沿前進方向每步的增量必須 ≥ −1e-9（只容許浮點誤差）。
- **J7**：量「落地後 render − sim − reachAssist 實際套用的根位移」這個殘差。時間用遊戲時間（dt 累加），步長看殘差的逐幀變化。落地後 0.5 s 內就被「得分後重新佈陣」瞬移截斷的樣本不判，另列略過數。
- **J4**：量慣用手腕到 H 的 3D 距離，樣本是正式比賽 6 場的扣球＋後排共 183 筆。改前、改後是同一批球：sim 決定論，J1 已證明 sim 沒動。
- **J8**：由治具代打 A2。走位用真的 WASD 鍵盤事件；出手呼叫 `controls.chooseAttack`，也就是攻擊面板按鈕的 handler。細節見 §2。

## 2. 量法（tools/jump-drift-measure.mjs → tools/jump-drift-verdict.mjs）

**開賽與取樣**
- 用 resolveMatchConfig→buildMatchStage→startMatchLoop 開正式生涯比賽，Playwright 虛擬時鐘、no-op 渲染。
- 包一層 `matchView.sync` 只讀結果：root 讀 `u.rig.root.position`；sim 用 sync 自己的插值；滯空用 `animator.probe().jumpY>0` 判定。
- 改後多讀兩個除錯欄位：`u.jumpDrift`（本卷的前飄偏移）、`u.reachOff`（reachAssist 實際套用的根位移）。

**場次**
- 種子 1、2、3（新生涯第一場）。
- 種子 1、2、3 對 iron-mist（jumpServeRate 0.45，用來收跳發樣本）。
- J8：種子 1–5 的 `#J8` 場次。
  - 舉給 A2 時用 WASD 跑向「AI 擊球點 + 0.68 m」，也就是 AI 攻擊手的起跳點定義。
  - 在「距 AI 擊球點 ≤26 tick」時出手。依據：玩家的出手是球一進手點就判定，實測比 hitPoint 早約 8 tick；這樣起跳→擊球約 18 tick，接近 AI 攻擊手的 23 tick。

**改前基準**
- 在 `git worktree add --detach … dcd6609` 的副本上起 dev server（127.0.0.1:5232），用同一支治具量。
- 改前、改後的 tick 數與 episode 數逐場相同。

**指令**
```
npx vite --host 127.0.0.1 --port 5231 --strictPort                      # 本工作樹（改後）；改前在 dcd6609 副本起 5232
SEEDS="1,2,3,1@iron-mist,2@iron-mist,3@iron-mist,1#J8,2#J8,3#J8,4#J8,5#J8" PLAYWRIGHT_MODULE=<playwright> node tools/jump-drift-measure.mjs --label after --out <after.json>
JD_BASE_URL=http://127.0.0.1:5232 SEEDS=<同上> ... --label before --out <before.json>
node tools/jump-drift-verdict.mjs docs/experiments/jump-drift-evidence/measure-after.json docs/experiments/jump-drift-evidence/measure-before.json
```

## 3. 逐條結果

| 條件 | 指令／證據 | 改前 | 改後 | 判定 |
|---|---|---|---|---|
| J1 sim 不動 | `node tools/sim-hash-probe.mjs`；`npm test`；`git diff --stat dcd6609 -- src/sim` | 0a948ad2b9895d49＝基準；2613/2613 | 0a948ad2b9895d49＝基準（`sim-hash-after.txt`）；**2623/2623**（＝2613＋新增 10，fail 0）；src/sim diff 空 | 過 |
| J2 扣球 | verdict（正式比賽 6 場） | 166/166 不過，ratio 最小 −0.36 | 162/166 過；另 4 筆是舉球員二次攻擊（見 §4） | **不過（4 筆無解）** |
| J2 後排 | 同上 | 17/17 不過（ratio 0.59–） | 17/17 過，ratio 最小 0.829 | 過 |
| J2 跳發（R3） | 同上：起跳→落地沿發球方向位移 | 2.08–3.37 m，31/31 不過 | **1.404–1.419 m**，31/31 過 | 過 |
| J3（R1 0.07） | 同上 | 扣球最大 0.150 m、最大倒退 −0.116 m；後排 0.103；跳發 0.196 | 後排、跳發：0.069 m、無倒退（−1e-15 級浮點誤差）；扣球 164/166 過，2 筆不過同 §4 | 扣球不過 2 筆（§4），其餘過 |
| J4 手球落差 | 同上，n=183 | 中位 **0.863**／最大 **1.539** m | 中位 **0.631**／最大 **1.479** m（門檻：≤0.863、≤1.559） | 過 |
| J5 不過網 | 同上 | 離網最小 0.600 m | 最小 0.416 m（扣球）、3.046 m（後排）、5.800 m（跳發）；對方側 0 幀 | 過 |
| J6 攔網／跳舉 | 同上 | （改前沒有前飄欄位） | 攔網 419 筆全幀前飄**恰為 0**；跳舉 37 筆最大偏移 **0.120 m** | 過 |
| J7（R1） | 同上 | 扣球 12/92 不過、後排 1/17 不過（併回單幀最大 0.169 m） | 扣球 92/92（略過 74）、後排 17/17、跳發 23/23（略過 8）；併回最慢 **0.496 s**、單幀最大 **0.069 m** | 過 |
| J8（R2）A2 扣球 | verdict `#J8` 場次（5 場） | 41/41 J2、J3 不過（ratio 0.07–0.21、步長 0.089） | **41/41** 過 J2/J3/J5/J7（ratio 最小 0.908、步長 0.069、離網最小 1.173 m、J7 判 25 筆併回最慢 0.448 s） | 過 |
| J9 2A | `npm run dev -- --host 127.0.0.1 --port 5185 --strictPort`＋`REPORT_NAME=report-jumpdrift.json node tools/real-match-browser.mjs`；B1 用 `j9/b1-check.mjs`（原 B1 腳本沒入 repo，照報告步驟①–④重做） | 全過 | B2–B9、B12、H1 全 true（`j9/2a/report.json`、B12 截圖 8 張在 `j9/2a/`）；B1 pass（`j9/b1-ui-check.json`）；B10：`npm test` 2623/2623、`npm run build` exit 0、precache 含 player_5k/20k.glb | 過 |
| J9 2B | `node tools/motion-d0-measure.mjs`；`node tools/motion-2b-check.mjs --d0-json …`；`REAL_BASE_URL=…5205 node tools/real-player-browser.mjs`；`node tools/dive-proposal-check.mjs` | 39/39 | E2(a) 39/39（D0 表與 dcd6609 逐列相同）；E3、E4、E6 OK；E5：A1–A6、A8–A12 全 true（A7 依 E5 不適用）；DA2 左右手全幀 PASS | 過 |
| J9 v8 四治具 | `node tools/direct-play-browser.mjs` [--assist/--motion/--pass]（5175） | PASS | 4 支全 PASS（`j9/v8-*.txt`） | 過 |
| J9 R8 | `node tools/receive-assist-probe.mjs chase` | 1080/2646＝40.8% | 1080/2646＝**40.8%**，空接 8.7%（逐值相同） | 過 |

## 4. 仍不過的 4 筆：條件無解，停手回報

全部是「舉球員第二觸就扣」（TOUCH kind＝spike、routeKind＝null）：
- **觸球那一幀才起跳（2 筆）**：`2/A1@5429`（d_sim 0.774）、`1@iron-mist/B1@12970`（0.771）。
  - 表現層在收到 TOUCH 事件時，才冷觸發 `spike` 開始跳躍弧，所以起跳幀就是擊球幀。
  - 這兩筆起跳→擊球是 0 幀，d_render 恆為 0；只要 d_sim > 0，J2 就無解。
  - `tools/jump-drift-feasibility.mjs` 在 R1 上限下，也只把這兩筆（外加 #J8 場次裡重複的同一球）標為無解。
  - 要解，只能讓表現層事前知道「舉球員會自己扣」。但這是 sim 在觸球當下才決定的。
- **跳舉轉扣（2 筆）**：`3/A1@7660`（0.190 < 0.8×0.630）、`3@iron-mist/B1@11042`（0.193 < 0.8×0.735），兩筆的 J3 也不過。
  - 起跳那一幀的動作是 `overheadJump`（跳舉），J6 要求跳舉偏移 ≤0.15 m，所以跳舉期間 root 必須跟著 sim（偏移只能 ≤0.12 m）。
  - 同一跳在觸球時才變成扣球，要同時滿足 J2 的 0.8·d_sim（0.5–0.6 m）和 J3 的「空中不跟 sim」，就會超出 J6 的上限。
  - 起跳當下無從分辨這是跳舉還是二次攻擊。

請裁定（建議 A）：
- A：舉球員第二觸攻擊不列入 J2/J3 的「扣球」樣本（它不是「助跑後往前上方斜跳」的攻擊），報告改成單列筆數。
- B：維持條件，另開一卷處理舉球員二次攻擊的起跳時機（要動 matchLoop 的觸發或新增預測，範圍比本卷大）。

## 5. 實作（改動檔案:行號，相對 dcd6609）

- `src/render/jumpDrift.js`（新，285 行，純函式、可單測）
  - **攻擊與跳發改成空中自由飛行**：離地那一幀接手「上一幀畫面上的 root」，之後完全不跟 sim。每幀最多走 0.069 m，步長綁畫面幀，所以慢動作 0.4× 決策窗裡的扣球也來得及飄到。
  - **攻擊的目標點**：沿「起跳點→估計擊球點」方向推進 reachFrac(D)·D，D≤0.8 m 時飄滿，D≥1.3 m 時飄 0.87。
  - **擊球後**：沿前進方向凍結，只做橫向靠回 sim（時間常數 0.25 s）。
  - **防倒退**：擊球前每一步沿估計方向的分量至少要佔步長的 20%，擊球後不准沿前進方向倒退；另外不准朝自家底線、離網面至少 0.2 m。
  - **跳發**：沿發球方向前飄 1.45 m，橫向跟 sim，總位移夾在 ≤1.45 m。
  - **落地**：偏移凍結 1 幀，接著每幀最多 0.069 m 併回，約 0.42 s 內完成。
  - **跳舉**：改用相對 sim 的小偏移（≤0.12 m）。攔網、歡呼、站發小跳恆為 0。
  - **重置**：sim 單幀瞬移 >0.5 m 就作廢前飄。
- `src/render/matchView.js`
  - :26-29 import。
  - :45-53 擊球高度係數：AI 為 1.62×身高（改前實測觸球高度 p50）；受控玩家為 1.99×身高（J8 實測 p50 1.995）。
  - :105 `driftAttacker`。
  - :204-206 除錯欄位。
  - :209-232 `driftAimFor`：擊球點估計只給 matchLoop 轉交的 claimId，球沿重力拋物線推算落到擊球高度的位置。
  - :340-341 `setDriftAttacker`；:372 每幀先算一次 `driftAim`。
  - :531-565 `stepJumpDrift` 接在 `animator.update` 之後；飄過的位置 x/z 供塵土、夠球、朝向、root、標籤使用，玩家光圈仍標 sim 位置。
  - :614-622 reachAssist 根位移的合成（見下）；:656 玩家光圈改標 sim 位置（simX/simZ）。
  - :718-728 `ballAtHeight`。
- `src/app/matchLoop.js:2793-2797`：每幀把協調層的 `aiState.claimId` 唯讀轉交給 matchView。只有第二觸之後才轉交，不影響任何判定。
- `src/render/geoAnimator.js:764-767`：`probe()` 多回 airT/airDur，唯讀。
- `tests/jump-drift.test.mjs`（新，10 條）。
- 治具：`tools/jump-drift-measure.mjs`、`tools/jump-drift-verdict.mjs`、`tools/jump-drift-feasibility.mjs`（R1 上限 0.07；加 `STEP_MAX=0.05` 可重現改前結論）。

**reachAssist 根位移的合成**：參數一格沒動。自由飛行與落地停留期間，水平根位移的權重是 0；併回期間線性加回 1；其他時候是 1，與改前逐值相同。理由有三：
1. 前飄本身就是把身體送到球下，兩者疊加等於重複補償。
2. 根位移逐幀跟著球變，改前空中那 0.07–0.10 m／幀的抖動就是它造成的。
3. 起跳那一幀的根位移已經包含在接手的 root 裡，所以權重歸 0 不會讓人往回彈。

姿勢偏置（軀幹、手臂、rootUp）照舊全部套用。J4 中位數也從 0.863 降到 0.631 m。

## 6. 範圍外發現（只列不修）
- 改前 root 會在空中跟著 sim 助跑、回防，所以會「空中往後飄」。這就是 J3 改前全紅的來源，本卷已由自由飛行消除。
- `spike` 序列（land:true）播完會把還沒走完的跳躍弧直接截斷，畫面上從 0.3–0.4 m 高單幀落地。→ 已由修訂 R5 併入本卷修正，見 §7 J11。
- B12 截圖畫面上蓋著教學對話框與主選單（改前的截圖也一樣），用它判斷動作外觀的參考價值有限。
- 新生涯第一場的對手 jumpServeRate＝0，整場沒有跳發。
- 無輸入的代打時，A2 被舉到球也不會自己跑位（claimId＝本人時不自動帶位），所以原 autopilot 一整場收不到玩家扣球。
- **魚躍根位移單幀跳變（改前最大 0.292 m）**：matchView 的魚躍根位移（diveX／diveZ）在魚躍起始幾幀會讓 root 單幀往前撲一大段。
  - 改前 d143b26 的 raw 裡，dive 幀的殘差單幀最大 0.292 m（2/B2@5440）。
  - 這是既有行為，與前飄無關；本卷不修（修訂 R7）。
  - 它曾讓 J7 的 `3@iron-mist/B4@367` 誤紅，見 §7.4。

## 7. J11 落地不瞬降（修訂 R5；J7 時限與重演剪接依修訂 R6）

**結論**：J11 改前單幀最大下降 **0.546 m**，改後 **0.070 m**（正式比賽 6 場）；含 5 場 #J8 為 0.073 m。R5 六類全部 ≤0.08。
J1、J2–J9 全過；J2／J3 不過的仍只有 R4 那幾筆舉球員二次攻擊，其餘全過。J7 依 R6（0.6 s）、R7（檢查窗限落地後 0.6 s 內）判定，見 §7.4。

### 7.1 量法
- **量測治具**：`tools/jump-drift-measure.mjs`，走真實 matchView／geoAnimator 鏈路，逐幀讀 `u.rig.root.position.y`。
  - 本卷只加了一個 `nl` 欄位：精華重演畫面的累計數。
- **判定**：`tools/jump-land-verdict.mjs`（新增），不重算任何動畫公式。
  - 窗口：起跳幀 → 落地幀後 0.2 s。判準：`ry[i−1]−ry[i] ≤ 0.08`。
  - 分類：扣球、後排、跳發、跳舉、攔網、舉球員二次攻擊（R4 定義：扣球觸球那一幀 touches=2、routeKind=null）。其他跳躍另列。
  - 分類核對：改前抓到的舉球員二次攻擊 4 筆，正好是 R4 列的 4 筆（2/A1@5429、3/A1@7660、1@iron-mist/B1@12970、3@iron-mist/B1@11042）。
  - 重演剪接（R6）：兩個比賽幀之間若隔著精華重演，不算相鄰幀，但逐筆列在 `[重演剪接]` 段。
- **指令**：
  ```
  SEEDS="1,2,3,1@iron-mist,2@iron-mist,3@iron-mist,1#J8,2#J8,3#J8,4#J8,5#J8" PLAYWRIGHT_MODULE=<playwright> node tools/jump-drift-measure.mjs --label <x> --out <json>
  node tools/jump-land-verdict.mjs <json 同名 -raw.json> --main
  ```
  改前在 `git worktree add --detach … d143b26` 的副本上跑（dev server 5232），改後在本工作樹（5231）。

### 7.2 改前／改後（`jump-drift-evidence/j11/verdict-{before,after}.txt`，正式比賽 6 場）

| 類別 | n | 改前單幀最大下降（m） | 改前 >0.08 | 改後單幀最大下降（m） | 改後 >0.08 |
|---|---|---|---|---|---|
| 扣球 | 162 | **0.546**（2@iron-mist/A6@8936，第 64 幀，tick 8979，jumpY 0.500→0） | 158 | 0.070 | 0 |
| 後排 | 17 | 0.502 | 17 | 0.057 | 0 |
| 跳發 | 31 | 0.050 | 0 | 0.050 | 0 |
| 跳舉 | 37 | 0.139 | 17 | 0.068 | 0 |
| 攔網 | 419 | 0.224 | 3 | 0.067 | 0 |
| 舉球員二次攻擊 | 4 | 0.078 | 0 | 0.067 | 0 |

- 舉球員二次攻擊在這 6 場只有 4 筆。加上 5 場 #J8 共 7 筆，最大 0.067（`verdict-after-all.txt`，1466 筆全部 ≤0.08，最大 0.073）。
- 改前紅在「單幀下降 >0.08」這條行為斷言本身（jumpY 從 0.3–0.5 m 單幀歸 0），沒有旁枝錯誤。
- 改前另外量到：誘餌 spikeHold→receiveReady 0.513 m、overheadJump→overhead 0.216 m。改後分別是 0.065 與 0.043。
- 重演剪接：改後 378 處。落差 >0.08 的有 2 處：`1/A6@17160` 0.184 m（中間隔 182 幀重演）、`2#J8/A3@20981` 0.217 m（隔 179 幀）。兩處都是人在空中時得分，重演播完回到比賽畫面時已經落地。依 R6 不算單幀下降，只列出。

### 7.3 修法（`src/render/geoAnimator.js`，只動渲染層，src/sim 無 diff）

- **:525-541 `startFall`**：從當下高度與垂直速度接真實重力（9.8 m/s²）自由落體。`air.dur` 改寫成預估落地時刻。
  - 為什麼不讓 sin 弧照飛完：弧的等效重力只有約 6 m/s²，照飛會多滯空 0.3 s 以上。這樣落地時與 sim 的殘差超過 2 m，J7 的併回時限就過不了。
- **:837-839**：帶 land 的序列（spike／tip／block…）播到原本的結束時刻時，人如果還在空中，就接自由落體，並把 landSoft 延到真正落地才接。
- **:854**：延後的這一段不出姿勢，動作層權重和舊版一樣已經在 RELEASE 漸出到 0。
  - 起初的版本把末幀姿勢以滿權重撐在空中，2A B4 因此量到 0.051。見 §7.5。
- **:732-737**：人還在弧上就被非跳躍動作接手時，改接自由落體，姿勢照新動作播。舊版是 `air=null`。
  - 常見情形：攔網後 receiveReady、扣球後 transitionWait、誘餌 spikeHold 後 receiveReady。
- **:749**：空中被地面動作接手時，權重從 0 漸入，不走滿權重交棒。否則地面動作的下蹲會單幀套滿（誘餌改前一幀沉 0.13 m）。
- 單元測試：`tests/geo-animator.test.mjs` 末尾 3 條 J11。
  - 拿到 d143b26 上跑全紅，都紅在下降斷言：0.396／0.363／0.569 m。改後全綠。

### 7.4 J7（R6：0.6 s，步長 ≤0.07、無瞬移不變）

- `tools/jump-drift-verdict.mjs` 的 J7 時限改成 0.6 s，照 R6 字面。設 `J7_LIMIT=0.5` 可重現 R6 之前的判法。
- R7 檢查窗：步長與「併回後維持 <0.01 m」都只看落地後 0.6 s 內。
  - 量測治具另外輸出 `mergeMaxStepIn`／`mergedAtSecIn`；原本的整窗欄位照舊輸出。
  - 設 `J7_WINDOW=all` 可重現 R7 之前的判法，輸出與 R7 前逐字相同。

| 類別 | 判／略過 | 併回最慢 | 併回單幀最大 | 不過 |
|---|---|---|---|---|
| 扣球 | 57／109 | 0.544 s | 0.069 m | 0 |
| 後排 | 11／6 | 0.560 s | 0.069 m | 0 |
| 跳發 | 23／8 | 0.496 s | 0.069 m | 0 |
| J8（A2 扣球） | 25／16 | 0.448 s | 0.040 m | 0（J2/J3/J5 41/41） |

- **判的筆數變少**：時限拉長到 0.6 s，只有落地後看滿 0.6 s 的樣本才判。扣球 77→57、後排 13→11。
  - 另外逐筆核對了落地後只看到 0.5–0.6 s 的 22 筆，全部在觀察窗內併回，步長都 ≤0.07，沒有藏住的紅。
- **R7 前唯一紅的 `3@iron-mist/B4@367`（整窗單幀 0.147 m）**：
  - 併回本身沒問題：0.448 s 就完成，殘差 0；落地後 0.6 s 內殘差單幀最大 0.054 m。
  - 0.147 出現在落地後 0.619 s。該球員這時 sim 開始魚躍（seq=dive，divedUntil 494，tick 453–454，慢動作 dt 0.0056）。matchView 的魚躍根位移（diveX／diveZ）讓 root 往前撲，治具的殘差只扣掉 reachAssist，沒扣魚躍位移。
  - 改前同樣的魚躍幀也有這種跳變，改前 raw 裡 dive 幀殘差單幀最大 0.292 m。
  - 改前這一筆落地得比較早（第 88 幀），治具落地後只錄 0.7 s，錄完時魚躍還沒開始。改後落地晚 14 幀，魚躍就落進錄製窗了。
  - 使用者裁定 R7：檢查窗限在落地後 0.6 s 內。改窗後這筆的步長 0.147→0.054、併回時刻 null→0.448 s，轉綠。
  - 188 筆判定（含 J8 場次）逐筆比對，判定有變的只有這 1 筆（紅→綠），其餘判定都不變。
  - 量測檔除了新增的兩個窗內欄位，4735 列逐列相同。
  - 魚躍跳變本身列為範圍外發現（§6），本卷不修。

### 7.5 J9 2A B4（headTopDiff ≤0.05）

- **改前基準**：d143b26 副本，`REALMATCH_BASE_URL=…5232 SKIP_SHOTS=1 node tools/real-match-browser.mjs`，第 1 次就跑完，B4 true。三個種子最大 0.0442／0.0469／0.0469（`j11/j9/b4-before-d143b26.json`）。
- **起初版本**：0.050／0.050／0.051，全部是 seq=spike。這是改動造成的：序列延到落地時，末幀 spikeFollow 以滿權重撐在空中，舊版從來沒有這個姿勢組合。
- **修後**：延長段不出姿勢（:854）。B4 true，最大 0.0444／0.0470／0.0461，和改前相同量級。
- 2A 全套：B2–B9、B12、H1 全 true（`j11/j9/2a-report.json`，B12 截圖在 `j11/j9/2a-shots/`）。

### 7.6 其餘回歸（最終程式碼）

- **J1**：
  - `node tools/sim-hash-probe.mjs`＝0a948ad2b9895d49，等於基準。
  - `npm test` 2626/2626、fail 0（＝2623＋3 條 J11）。
  - `git diff d143b26 -- src/sim` 為空。
- **J2–J6、J8**（`j11/verdict-j2j8.txt`）：
  - J2：後排 17/17、跳發 31/31（1.404–1.419 m）。扣球只有 R4 那 4 筆舉球員二次攻擊不過，其餘都過。
  - J3：只有同樣 R4 的 2 筆不過。
  - J4：中位 0.632／最大 1.479，門檻 ≤0.863／≤1.559。
  - J5：離網最小 0.445 m。
  - J6：攔網前飄全幀為 0；跳舉最大偏移 0.120 m。
  - J8：41/41。
- **2B**：
  - E2(a) 39/39，D0 輸出逐列等於前一次（`j11/e2a.txt`）。
  - E3、E4、E6 OK（`j11/check-2b.txt`）。
  - E5：A1–A6、A8–A12 全 true（A7 依 E5 不適用）。
  - DA2 PASS；R8 1080/2646＝40.8%，逐值相同。
- **v8 四治具**：預設、--assist、--motion、--pass 在低負載下單獨循序跑，第 1 次就全部 PASS（`j11/j9/v8*.txt`、`v8-status.txt`）。
  - 改前樹的預設治具也 PASS（`v8-before-d143b26.txt`）。
  - 先前 `[data-replay]` 逾時，發生在同機另有兩個量測在跑的高負載下。
- **B1**：pass（`j11/j9/b1-ui-check.json`）。
