# Phase 5 W1 §12 驗收證據檔（獨立驗收，非實作端自我回報）

> 驗收對象：`main@0f06fe4`（工單＝`docs/kickoffs/phase5-w1-prompt.md` §12）。
> 驗收日期：2026-07-29。驗收者未修改任何 `src/**`、未改任何既有測試、未 commit／push／deploy。
> 4.7 基準＝`64af618`（本檔的「基準」數字一律**現場實測**，不抄快照）。
> 每一項都寫「怎麼自己查（指令原文）／實際輸出／判定」。

## 0. 結論總表

| # | 驗收項 | 判定 |
|---|--------|------|
| 1 | 測試只增不減 | ✅ 通過（601 → 741，皆全綠） |
| 2 | 建置綠 | ✅ 通過 |
| 3 | sim 純度 | ✅ 通過（字面 grep 有 15 命中，全部是 `'three'` 節奏字串與註解；真依賴 0 命中） |
| 4 | 決定論 | ✅ 通過（route／起步 tick／人格皆有測試背書） |
| 5 | 攔網不作弊 | ✅ 通過（保證行＝`src/sim/blockRead.js:168`） |
| 6 | 全員跑動 | ⚠️ 有條件通過——AI 隊友確實多人同跑（影片＋數據），但**玩家自己操控的那名球員不跑自己的線** |
| 7 | 三步節奏／左手鏡像 | ⚠️ 部分不通過——三步節奏有；**左手鏡像場上永遠看不到（全場 12 名球員 100% 判為右手）** |
| 8 | MB 例外 | ✅ 通過（3476 次快攻 100% 在二傳觸球前已離地） |
| 9 | 二傳 bug | ⚠️ 有條件通過——判定與修法有據、回歸測試綠；但**工單要的原始 log 不在 repo，無法獨立重跑** |
| 10 | C2 連動 | ✅ 通過 |
| 11 | D2 生效 | ✅ 通過（事件流＋治具雙證） |
| 12 | VCR v2 重演相容 | ✅ 通過（含突變測試） |
| 13 | 效能／draw call | ✅ 通過（與 4.7 逐項同值，draw call 零增加） |
| 14 | 動畫求值成本 | ✅ 通過（實測，非估算） |
| 15 | 同隊避讓（跑動級） | ✅ 通過（88 萬 tick 零穿模） |
| 16 | 治具 | ✅ 已如實記錄（**未做任何校準**，數字動很大） |
| 17 | 命名 | ✅ 通過（本輪確實動到 `src/career/opponents.js`，naming 12 測全綠） |

**11 項通過、3 項有條件通過／部分不通過（6、7、9）、0 項無法驗。**

---

## 1. 測試只增不減（`npm test` ≥ 601 且全綠）

**怎麼自己查**

```bash
# 現況
cd "C:/Users/shung/OneDrive/桌面/排球夢" && npm test
# 4.7 基準（另開 worktree，不動主 repo）
git worktree add /tmp/base47 64af618 && cd /tmp/base47 && npm test
```

**實際輸出**

4.7 基準 `64af618`：
```
ℹ tests 601
ℹ suites 0
ℹ pass 601
ℹ fail 0
ℹ duration_ms 4676.6995
```

本輪 `0f06fe4`：
```
ℹ tests 741
ℹ suites 0
ℹ pass 741
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 20234.5811
```

**判定：✅ 通過**（601 → 741，+140；兩端皆 0 fail）

---

## 2. 建置綠（`vite build`）

**怎麼自己查**：`npx vite build`

**實際輸出（尾段）**

```
dist/assets/sim-DdZMRPTD.js                      52.86 kB │ gzip:  19.14 kB
dist/assets/index-CvOKPnLT.js                    89.74 kB │ gzip:  32.32 kB
dist/assets/ui-B4UP0IJy.js                      247.55 kB │ gzip:  88.50 kB
dist/assets/three-DgAIswjq.js                   614.69 kB │ gzip: 156.74 kB
(!) Some chunks are larger than 500 kB after minification. Consider: ...
✓ built in 2.37s

PWA v1.3.0
mode      generateSW
precache  18 entries (1066.46 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```

**判定：✅ 通過**（唯一警告是 three.js chunk >500kB，屬既有狀況，非本輪新增）

---

## 3. sim 純度（`src/sim/` 搜 `three`／`document`／`window` 零命中）

**怎麼自己查**

```bash
# A) 工單原文寫法（字面搜）
grep -rn "three\|document\|window" src/sim/ | wc -l
# B) 只搜「真的是依賴」的形態
grep -rnE "from ['\"]three|require\(['\"]three|\bwindow\.|\bdocument\." src/sim/
# C) 自動守門
node --test tests/purity.test.mjs
```

**實際輸出**

A) **15 命中**（不是 0）。B) **零輸出＝零命中**。

C) 15 個字面命中的全文（**沒有一個是依賴**）：

```
src/sim/ai.js:166:    claimId: null, attackerId: null, attackKind: null, attackTempo: 'three',
src/sim/ai.js:301:      approachRouteOf(aiState.approach.routes, aiState.attackerId)?.tempo ?? 'three';
src/sim/ai.js:1000:  if (!route || route.tempo === 'three') return false;
src/sim/approach.js:36:export function setAimFor(game, team, attackerId, kind, tempo = 'three') {
src/sim/approach.js:64:export function takeoffSpotFor(team, kind, tempo = 'three') {
src/sim/approach.js:120:// | 三速 three | 標準 OH／OPP 高球、pipe/D 球 | 觸球**後**起跳 |
src/sim/approach.js:131:  three: { takeoffLead: 0 },
src/sim/approach.js:183:      ? 'two' : 'three';
src/sim/approach.js:185:  return 'three';
src/sim/approach.js:235:  const takeoffTick = tempo === 'three'
src/sim/ball.js:1:// 排球物理（純函式模組，無 three.js 依賴）
src/sim/blockRead.js:1:// Phase 5 W1 §7 C2 — 攔網站位讀取（純函式、決定論；sim 核心，零 three/DOM）
src/sim/constants.js:1:// 模擬核心常數 — 本目錄（src/sim）不得 import three.js 或任何畫面/輸入層程式碼（架構鐵律）
src/sim/game.js:1:// Phase 1 比賽模擬組裝層 — 模擬核心唯一入口（純 JS、零 three.js/DOM）
src/sim/player.js:1:// D1 資料層 v1 — Player 結構與序列化（純函式、零 three.js/DOM 依賴）
```

守門測試 `tests/purity.test.mjs:10-19` 的黑名單是
`from 'three'` / `require('three')` / `window.` / `document.` / `Math.random(` / `Date.now(` / `performance.now(` / `new Date(`：

```
✔ src/sim 無 three.js/DOM/非決定論來源
```

**判定：✅ 通過**，但**工單這條的驗收寫法需要修正**：本輪 §4 把三速命名為 `'three'`，
字面 grep 從此永遠不可能是 0。實質判準應改為上面 B 段那條 regex（＝`purity.test.mjs` 的黑名單）。

---

## 4. 決定論（同 seed 兩次逐值相同；含 route 分配、起步 tick、read/commit 人格）

**怎麼自己查**

```bash
node --test tests/determinism.test.mjs tests/game-determinism.test.mjs \
  tests/ai-determinism-order.test.mjs tests/tempo.test.mjs \
  tests/attack-routes.test.mjs tests/quick-takeoff.test.mjs \
  tests/approach.test.mjs tests/block-persona.test.mjs
```

**實際輸出（逐條對應工單要求的三項）**

```
✔ 同種子重跑兩次：最終比分與完整事件流逐 byte 相同 (616.6707ms)
✔ 不同種子 → 不同對局（rng 有實際參與，非死劇本） (369.2208ms)
✔ 決定論：同 seed 兩次整局，route 分配／節奏／起步 tick 逐值相同 (609.5063ms)      ← tests/tempo.test.mjs:160
✔ 決定論：同 seed 兩次整局，路線分配（含交叉）逐值相同                              ← tests/attack-routes.test.mjs:206
✔ 決定論：同 seed 兩次整局，一速的起跳 tick 與到位靜止逐值相同 (794.6605ms)         ← tests/quick-takeoff.test.mjs:161
✔ 決定論：同 seed 兩次跑，助跑線分配與座標逐值相同                                   ← tests/approach.test.mjs:164
✔ B1：同 seed 兩次逐值相同（人格與 commit 鎖定狀態皆納入） (2841.2529ms)
✔ B1 回歸閘：未注入 blockPersona 的比賽與 read 人格逐值相同（既有隊伍零變化） (1299.7575ms)
✔ 輪轉序遍歷後：同種子仍逐 byte 一致、整局照常收斂 (611.3512ms)
```

**判定：✅ 通過**（route 分配 ✓、起步 tick ✓、read/commit 人格 ✓，三項全部有獨立測試背書）

---

## 5. 攔網不作弊（攔網 AI 判讀路徑零 `attackerId`；須指名哪一行保證）

**怎麼自己查**

```bash
grep -n "attackerId" src/sim/blockRead.js
grep -n "B1-SCAN-BEGIN\|B1-SCAN-END" src/sim/ai.js src/sim/blockRead.js
node --test tests/block-persona.test.mjs
```

**保證的那一行（已覆核，工單的認知正確）**

```
src/sim/blockRead.js:168:export function blockCommitRead(game, atkTeam, opts = {}) {
```

參數只有 `game`、**攻方隊伍代號** `atkTeam`、與可觀察線索 `opts`（`passTier`／`setterSpotLx`／`k`），
**取不到「二傳最後選了誰」**；且刻意不回傳任何 playerId（`blockRead.js:167` 註解，實作見 :204 只回 `{x, depth}`）。

補充覆核（比工單認知更嚴的兩點，值得記進快照）：
- `blockRead.js:113-115` 明寫**刻意不讀 §4 的 route 表**，理由是 route 帶 `startTick`／`takeoffTick` 等
  未來值、玩家面板看不到，讀了就是資訊不對等。這比「不讀 attackerId」更嚴。
- 判讀路徑被 `B1-SCAN-BEGIN/END` 圍成三個掃描區：
  `src/sim/ai.js:828-836`、`src/sim/ai.js:916-977`、`src/sim/blockRead.js:83-222`。

**靜態掃描守門的實際輸出**（`tests/block-persona.test.mjs:154`，掃描區 <3 個或區內出現 `attackerId` 就轉紅）：

```
✔ B1 反作弊：攔網判讀路徑（B1-SCAN 區）零 attackerId (1.944ms)
✔ B1：read 與 commit 在同一 seed／同一組球員下，中間攔網手的走位明顯不同 (23.6024ms)
✔ B1：快攻沒來（兩翼高球）時，commit 的中間攔網手到位率明顯較差 (1.5468ms)
✔ B2：commit 的攔網手單 tick 位移不得超過該球員的移動能力（無瞬移補位） (32.3805ms)
```

`grep -n "attackerId" src/sim/blockRead.js` 的命中全部落在 **B1-SCAN 區外**（:17/:18/:19/:47/:48/:51
＝`spikeAimsFor`／`blockLaneRead` 這兩支 C2 站位幾何用的函式）或**註解**（:83/:96/:99/:115/:165）。

**判定：✅ 通過**

---

## 6. 全員跑動（一擊完成後可見多名攻擊手同時拉開助跑）

**怎麼自己查**

```bash
# 數據（node，可重跑）
node tools/tempo-probe.mjs
# 畫面：dev server → ?quick=1&autopilot=1&hud=1
npm run dev
```

**實際輸出（`tools/tempo-probe.mjs` ①）**

```
── ① 全員跑動：二傳觸球 ±30 tick 窗口內「同時助跑中」的人數 ──
樣本 tick n=225803｜平均 0.77 人｜p50=1｜p90=2｜max=4
  人數分佈：0 人 46.3%  1 人 33.5%  2 人 17.1%  3 人 3.1%  4 人 0.1%
  每球窗口的最大同時助跑人數：n=3773｜平均 1.84｜p50=2｜≥2 人的球佔 68.8%
```

**瀏覽器實測（Playwright，逐 sim tick 取樣）**：同時助跑人數的 sim-tick 分佈
`0:2496 / 1:445 / 2:554 / 3:160 / 4:26`，**最大同時 4 人**。

**影片證據**（逐 sim tick 步進截圖＋ffmpeg 合成，非錄螢幕）

| 檔案 | 內容 |
|------|------|
| `<scratchpad>/w1-item6-allrun.mp4`（200 格，tick 15393→15593） | B 隊一擊完成後 **3 條線同時拉開**：`B5:pipe`（0.04,−6.94 → 1.00,−4.03）、`B6:quick`（0,−3.00 → 0,−1.93 起跳）、`B2:cross`（3.06,−3.03 → 4.10,−3.60 拉開 → 1.24,−2.49 切進中間） |
| `<scratchpad>/w1-item6-allrun.gif` | 同上，2.0 MB 版 |
| `<scratchpad>/w1-item6-allrun-Aside.mp4`（170 格） | A 隊 4 條線（`A5:pipe` / `A6:quick` / `A2:left` / `A4:dball`） |
| `<scratchpad>/w1-item6-allrun-B2.mp4`（110 格） | B 隊 4 條線 |

`<scratchpad>` ＝
`C:\Users\shung\AppData\Local\Temp\claude\C--Users-shung\87b0455e-552b-4da8-8174-3a5ac3299e76\scratchpad`

### ⚠️ 本項的缺口（新發現，不在工單預期清單裡）

**玩家自己操控的那名球員，不會跑自己被分配到的線。**

瀏覽器實測（`?quick=1&autopilot=1&seed=11`，逐 sim tick 量「這一 tick 有沒有位移 > 0.01m」，
分母＝該球員身上掛著 route 的 tick 數）：

```
受控者 = A2
A2  30/1787 = 1.7%    ← 受控者
A3 228/754  = 30.2%
A4 726/1787 = 40.6%
A5 743/1787 = 41.6%
B2 284/747  = 38.0%
B3 420/1350 = 31.1%
B4 366/1350 = 27.1%
B5 450/1350 = 33.3%
```

成因（可查證，非推測）：`src/app/matchLoop.js:1078` 收 AI Intent 時把受控者排除
（`aiCollectIntents(game, s.aiState, [s.controlledId])`），受控者的走位改由輸入層自動帶位產生；
而輸入層的自動帶位目標是 **`dutyPosition(...)`（職責位）**——見 `src/input/matchControls.js:316`
——**全檔沒有任何一處讀 `aiState.approach.routes`**（`grep -rn "approach\|route" src/input/*.js`
只在 `setOptions.js:32-48` 命中，那是分配面板的路線標籤，不是走位）。

實務後果：四條線裡玩家那一條在畫面上是「站著不動」，攔網手讀到的線索少一條。

**判定：⚠️ 有條件通過** —— 「可見多名攻擊手同時拉開助跑」成立（3–4 人，有影片與數據）；
但「全員」在有玩家的實戰情境下是 **N−1 員**。這條要不要修屬設計題（玩家該不該被系統自動帶去跑助跑），
建議進 W2 討論而非本輪回退。

---

## 7. 三步節奏（小步→制動步→併腳；左手選手為鏡像）

**怎麼自己查**

```bash
node --test tests/geo-animator.test.mjs
node -e "import('./src/render/geoCharacter.js').then(m=>{const g=['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];console.log(g.map(i=>i+'='+(m.isLeftHanded(i)?'LEFT':'right')).join('  '))})"
```

**（a）三步節奏 — 通過**

```
✔ §2-2 助跑三步節奏：三等分時段可見三次明確步相，第二步（制動步）擺幅與下沉都是三步之最 (1.5126ms)   ← tests/geo-animator.test.mjs:249
✔ §2 助跑步相：站著不動時不得原地踏步（跳舞 bug 回歸） (3.3109ms)
✔ §2 助跑步相：真的在跑時三步節奏仍在（修法不得把助跑一起關掉） (1.0039ms)
```

畫面證據：`<scratchpad>/w1-item7-threestep-closeup.mp4`（150 格，半 tick 步進，
tick 25147→25199，涵蓋 `B4:right` 的 `startTick 25159`→`takeoffTick 25183`；
用外掛特寫鏡頭在球員側面 5m、只讀不改遊戲狀態）。慢動作可見跨步—收步—起跳的腿相變化。
同內容 GIF：`w1-item7-threestep-closeup.gif`。

**（b）左手鏡像 — 不通過（機制在，場上永遠觸發不到）**

單元測試層面是綠的：

```
✔ §1b 慣用手：左手選手助跑步序鏡像（右手＝左-右-左，左手＝右-左-右） (2.2066ms)   ← tests/geo-animator.test.mjs:273
✔ §1b 慣用手分佈：決定論（同 id 兩次求值相同）＋ 抽樣比例接近 15%（非 Math.random） (3.8808ms)
```

但實跑一場比賽，場上**沒有任何一個左手球員**：

```
本場全部 playerId： A1, A2, A3, A4, A5, A6, B1, B2, B3, B4, B5, B6
慣用手： A1=right A2=right A3=right A4=right A5=right A6=right
        B1=right B2=right B3=right B4=right B5=right B6=right
左手人數： 0 / 12
```

成因：`isLeftHanded(playerId)`（`src/render/geoCharacter.js:39-42`）吃 playerId 的雜湊，
而 sim 建隊時的 id 是固定字面 `` `${team}${i+1}` ``（`src/sim/game.js:1450`）——
**每一場比賽、每一顆種子、生涯或快速比賽，id 集合都是同一組 12 個**，
這 12 個雜湊出來全部落在右手側。分佈測試用的是 `w1-handed-sample-${i}`
（`tests/geo-animator.test.mjs:294`）這種合成 id，才會看到 15%；真實 id 母體只有 12 個且全右手。

**判定：⚠️ 部分不通過** —— 三步節奏通過；**「左手選手為鏡像」在遊戲中無法被觀察到**，
15% 左手分佈實際上是 0%。修法很輕（把 handedness 綁在 `player.name`／生涯球員 seed 而非 12 個固定 id），
但屬表現層設計決定，留給 Sawmah 裁定。

---

## 8. MB 例外（快攻時 MB 在二傳觸球前已離地）

**怎麼自己查**：`node tools/tempo-probe.mjs`；`node --test tests/quick-takeoff.test.mjs`

**實際輸出**

```
── ② MB 一速：快攻線在「二傳實際觸球」那一 tick 前已離地的比例 ──
快攻線樣本 n=3476：已離地 3476（100.0%）｜未離地 0
  提前量：p50=6 tick（0.10s）  p90=8 tick
```

```
✔ 一速定義不得破壞：二傳觸球時 MB 已在起跳點站定（＝已離地） (375.2103ms)   ← tests/quick-takeoff.test.mjs:147
✔ 一速：到位與起跳之間不得有長靜止（＝「跑完就跳」，不是跑完站著等） (498.0816ms)
✔ 節奏三層的時序規格：一速在二傳觸球前已離地、二速觸球前起跳、三速觸球後起跳 (2.1359ms)
```

**判定：✅ 通過**（3476／3476＝100%）

**順帶記一筆（不影響本項判定）**：同一支探針的 ③ 顯示
`前排/quick/one n=779：p50=14  p90=38  max=49｜站>0.5s 13.2%`
——快攻線有 13.2% 的球在擊球前連續靜止超過 0.5 秒（其餘所有線都是 0.0%）。
這是「一速到位後等球」的殘影，建議列進 Sawmah 試玩重點。

---

## 9. 二傳 bug（log ＋ A／B／C 判定；修後單次抬手）

**怎麼自己查**

```bash
git log -1 --format="%B" 1310aa5
node --test tests/geo-animator.test.mjs
```

**判定結果（已覆核工單認知：是「A 的精確版」，正確）**

commit `1310aa5` 訊息原文（節錄）：

```
W1 §3 定因結果＝假設 A 的精確版（非「播完重播」，是「播到一半被打斷在自己的
釋放尾段」）：geoAnimator 的權重公式 w=min(t/ATTACK,1,(dur-t)/RELEASE,1) 是
所有序列共用的通用漸入漸出，setReady 只有 0.45s(27tick) 而觸發提前 34 tick、
實測到觸球約 24 tick——觸球那一刻它已走進自己 RELEASE_MS(12tick) 尾段，
權重僅剩 0.25（實測手臂 -0.67 vs 滿權重 -2.3），手臂鬆回大半後 overhead 再從
0 漸入抬第二次。排除 B（每個 flight 只觸發一次）與 C（無同幀雙分支）。
```

**回歸測試實際輸出**（`tests/geo-animator.test.mjs`）

```
✔ §3 二傳預備：撐住不自己鬆手（觸球前手臂不得掉權重） (0.4968ms)        ← :195
✔ §3 二傳交棒：overhead 接手不得掉權重（這就是第二次抬手） (0.4217ms)    ← :206
✔ §3 sustain 有界：預備撐完仍會鬆手回待命（不得永遠卡住舉手） (0.1631ms)
✔ §3 無 sustain 的序列行為完全不變（既有動作零影響） (0.4411ms)
✔ §4 交棒不得回退：提前觸發後的新時序下，setReady→overhead 仍然無縫（兩次抬手回歸） (0.2675ms) ← :449
✔ §4 不重播：同一次接觸不得播兩次擊球動畫，型別不同才改播 (0.2174ms)     ← :484
```

**缺口**：工單 §3-1 要求「對二傳單開一條 log，一個 rally 內印 `(tick, 動畫名, 觸發來源)`」，
並在 §12-9 要求「**貼出 log**」。**這條 log 沒有以任何形式留在 repo 裡**——
`tools/` 底下沒有能重現它的探針（`contact-frame-probe.mjs` 量的是「觸球那一幀播到第幾格」、
`setter-reach-probe.mjs` 量的是「二傳搆不搆得到球」，兩者都不是動畫觸發序列 log）。
commit 訊息裡的數字（−0.67 vs −2.3、34 tick vs 27 tick）是實作端當時的量測結果，
**驗收端無法獨立重跑產生同一份 log**。

**判定：⚠️ 有條件通過** —— 判定（A 的精確版）合理、修法對應、6 條回歸測試綠且涵蓋
「第二次抬手」的兩個成因面；但「貼出 log」這條驗收要求**在今天無法被獨立驗證**。

---

## 10. C2 連動（選封直線後，後排陣型可見偏斜線）

**怎麼自己查**：`node --test tests/block-read.test.mjs`

**實際輸出**

```
✔ 幾何單一真相：攻擊瞄準點上移至 sim 後，input/attackZones 讀的是同一份（數值零漂移） (2.6773ms)
✔ 站位推論：站直線過網點＝封直線、站斜線過網點＝封斜線、站中間＝中性不動陣型 (2.7563ms)
✔ 遲滯：已判定後要掉回 EXIT 以下才回中性，翻面要走完整個 ENTER（網前微調不抖） (0.6045ms)
✔ §12-10 連動：玩家封直線 → 後排陣型可見偏斜線（實跑世界座標，非意圖） (15.58ms)   ← tests/block-read.test.mjs:133
✔ 優先序：L 面板的明確指令壓過身體站位推論 (8.3658ms)
✔ 門檻內微調不造成陣型跳動：死區內來回＝後排座標與「無受控者」逐值相同 (5.1107ms)
✔ 決定論：同輸入逐值相同；無受控者（治具/AI 對打）＝零行為改變 (11.2145ms)
ℹ tests 7 / pass 7 / fail 0
```

該測試的驗收方式正是工單要的（實跑世界座標，不是讀意圖旗標），且附了兩道反向閘：
死區微調不得抖動、無受控者時逐值等同舊行為。

**判定：✅ 通過**

---

## 11. D2 生效（發給對方主攻手後，該球對方攻擊池降級）

**怎麼自己查**：`node --test tests/d2-serve.test.mjs`；`node tools/d2-probe.mjs`

**事件流／池的實際輸出**

```
✔ D2①：接一傳的快攻手與後排攻擊手直接掉出攻擊池（同一顆池，不是另開排除清單） (4.0505ms)
✔ D2①：留在池裡的被針對者只剩降級路線——不跑交叉、不跑二速 (4.0696ms)
✔ D2①：整條協調層鏈路生效——一傳接球者的線真的從 aiState.approach 消失 (10.903ms)
✔ D2②：AI 發球會指名發給對方後排主攻手——兩隊都會這樣打對方 (0.5306ms)
✔ D2②：AI 的發球 Intent 真的瞄在被針對者的接發責任區（不是四區循環） (1.9363ms)
✔ D2②：被 AI 發球針對的一方確實少一條線（我方也吃這一刀） (1.3114ms)
✔ D2③：決定論——同構造同種子重跑，池／route／發球目標逐值相同 (1.1947ms)
✔ D2④：與一傳品質分支疊加（同一道三檔階梯）、且不重複扣 (0.3665ms)
✔ D2④：不影響攻擊點的產生規則本身——沒有被針對時逐值等同舊行為 (0.3487ms)
```

**實跑量化（`tools/d2-probe.mjs`，40 場）**

```
── ① D2 針對性發球（攻擊池）──
進攻組織次數 3836
池大小分佈：1 條 5（0.13%）  2 條 10（0.26%）  3 條 2173（56.65%）  4 條 1648（42.96%）
D2 命中（一傳接球者本身是合法攻擊手）：3135（81.73%）
  其中掉出池 2141｜留池但降級 994
  命中時平均池大小 3.31｜未命中 3.91
被針對者仍被選為攻擊手：330／3135（10.53%）
```

**判定：✅ 通過**（雙向生效有測試、降級在事件流可見、實跑池大小 3.91 → 3.31 有量化落差）

**順帶記一筆**：同一支探針顯示 `一傳品質：perfect 99.58%`——一傳幾乎恆到位，
與 `blockRead.js:105-107` 自承的「線索① 目前無變化」一致。這不是本輪的鍋（工單 §11 禁動平衡），
但代表 B1 的三組線索實際只有線索③ 在工作。建議列進 W2 討論。

---

## 12. VCR v2 重演相容

**怎麼自己查**：`node --test tests/rally-tape-approach.test.mjs`

**實際輸出**

```
✔ 前置條件：這顆球真的打出多人拉開的 Transition（routes.length>=2） (102.8213ms)
✔ VCR 重演相容：aiState.approach（助跑 route 分配）逐值一致，涵蓋球軌跡＋球員座標 (153.421ms)
✔ 突變測試：重演時 aiState.approach 沒被正確重建，比對必須轉紅 (4074.9973ms)
ℹ tests 3 / pass 3 / fail 0
```

三條的結構是對的：先證明樣本球**真的有**多人拉開（否則測試會空跑而恆綠），
再逐值比對，最後用突變測試證明「這個比對真的抓得到錯」。這正是工單 §12-12
「不接受自我回報、必須有測試」要的形狀。

**判定：✅ 通過**

---

## 13. 效能（FPS／draw call 對比 4.7 基準；draw call 不得增加）

**怎麼自己查**（兩個版本各起一個 dev server，同一台機、同一組參數、同一段取樣程式）

```bash
# 本輪
npm run dev                                   # → :5173
# 4.7 基準
git worktree add /tmp/base47 64af618
cd /tmp/base47 && npx vite --port 5321        # node_modules 用 junction 借主 repo
# 兩邊都開 ?quick=1&autopilot=1&hud=1&seed=7，跑到 tick>1200 後連取 900 幀
```

**實際輸出（Playwright，1280×800，兩次量測條件完全相同）**

| 指標 | 4.7 基準 `64af618` | 本輪 `0f06fe4` | 差 |
|------|------|------|---|
| draw calls min / p50 / p90 / max | 59 / 77 / 78 / **80** | 59 / 77 / 78 / **80** | **0** |
| triangles min / p50 / max | 124034 / 125106 / 125236 | 124036 / 125106 / 125236 | +2（min，浮動） |
| InstancedMesh 池數 | **11** | **11** | **0** |
| frame time p50 / p90 | 12.1 / 12.3 ms | 12.1 / 12.2 ms | −0.1 |
| FPS（同批取樣） | 81.1 | 82.4 | +1.3 |

**FPS 對 165Hz 基準**：本輪在**前景分頁單獨量測**時 `fps 165.1、frameMs p50 6.10ms`
——與 4.7 快照記的 165 FPS 相同（vsync 上限）。上表 ~82 FPS 是「同時開兩個分頁比較」時的
共通條件，兩版同降、可比。

**InstancedMesh 11 vs 快照寫的「10 個池」的釐清**：11 ＝ `geoCharacter` 的 **10 個角色部件池**
（`src/render/geoCharacter.js:85-92`，實測 count 分別為 14×4 與 28×6）＋ `arena.js:163` 的
**1 個觀眾剪影池**（count 712）。4.7 基準實測同樣是 11。快照的「10」指的是角色池，沒有出入。

**結構證據（零新增場景物件）**

```bash
git diff 64af618 HEAD -- src/ | grep -nE "^\+.*(new THREE\.|scene\.add|\.add\()"
# → 無輸出
git diff 64af618 HEAD -- src/ | grep -n "^[+-].*InstancedMesh"
# → 無輸出
```

`reachAssist`（`src/render/reachAssist.js`，本輪新增 245 行）是**純數值偏置**：
逐幀改關節 rotation／position，不建立任何 mesh。工單「理論上零新增 mesh」的認知**經實測成立**。

**判定：✅ 通過**（draw call 零增加，逐項同值）

---

## 14. 動畫求值成本（3–4 人同時跑助跑時的 frame time；要量不要猜）

**怎麼自己查**：瀏覽器開 `?quick=1&autopilot=1&seed=7`，在 rAF 迴圈外包一層量
「每幀 JS 耗時」與「這一 sim tick 有幾人在跑 route」，跑到樣本足夠再分桶。

**實際輸出（一）rAF 間隔（＝實際 frame time，165Hz vsync 上限 6.06ms）**

| 同時助跑人數 | 幀數 | p50 | p90 | p99 | max |
|---|---|---|---|---|---|
| 0 | 7295 | 6.1 | 6.2 | 6.6 | 12.2 |
| 1 | 1766 | 6.1 | 6.2 | 6.7 | 10.2 |
| 2 | 2521 | 6.1 | 6.2 | 6.4 | 10.4 |
| 3 | 720 | 6.1 | 6.2 | 6.8 | 10.2 |
| **4** | **105** | **6.1** | **6.2** | **6.3** | **6.4** |

**實際輸出（二）每幀 JS 實際耗時（不受 vsync 遮蔽，這才是「求值成本」）**

| 同時助跑人數 | 幀數 | p50 (ms) | p90 | p99 | max |
|---|---|---|---|---|---|
| 0 | 15996 | 1.4 | 1.7 | 2.2 | 7.1 |
| 1 | 3909 | 1.4 | 1.7 | 2.2 | 6.5 |
| 2 | 3288 | 1.4 | 1.7 | 2.1 | 7.4 |
| 3 | 1003 | 1.4 | **1.8** | 2.4 | 7.2 |
| **4** | **341** | **1.4** | **1.7** | **2.1** | **2.3** |

3–4 人同跑時的 p50 與 0 人完全相同（1.4ms），p90 最多多 0.1ms。
16.67ms 的 60Hz 預算裡 JS 只吃 1.4ms，離瓶頸還很遠。

**判定：✅ 通過**（實測，非估算；助跑三步＋reachAssist 的求值成本在量測誤差內）

---

## 15. 同隊避讓（跑動級，交叉路線不得穿模）

**怎麼自己查**

```bash
node "<scratchpad>/clearance-probe.mjs" 30
```

探針只讀不改，量的是 sim 自己的量：逐 tick 掃同隊任兩人的水平距離最小值，
依「這一 tick 有沒有人在跑 route」與「這球有沒有 cross 路線」分桶。
門檻取自 sim 常數：`SEP_RADIUS = 0.55m`（`src/sim/game.js:359`＝避讓啟動半徑）、
穿模門檻 `0.30m`（角色軀幹寬度量級）。

**實際輸出（30 局，88 萬 tick）**

```
=== 同隊避讓（跑動級）：30 局，逐 tick 同隊最小距離 ===
SEP_RADIUS=0.55m（避讓啟動）／穿模門檻 CLIP=0.3m
總 tick 884734｜其中 cross 路線在場 105523
all              n= 884734｜min=0.469  p1=0.531  p50=1.500
moving           n= 277356｜min=0.550  p1=0.555  p50=1.500
crossBall        n= 105523｜min=0.550  p1=0.601  p50=1.500
crossBallMoving  n=  65736｜min=0.550  p1=0.555  p50=1.500
< CLIP(0.3m) 的 tick：0（0.000%）｜其中有人在跑：0
最糟一筆：無
```

讀法：**有人在跑的 27.7 萬 tick 裡，同隊最近距離的最小值是 0.550m ＝ 正好卡在避讓半徑上**
（避讓機制生效、沒有任何一次被壓穿）。交叉路線在場的 10.5 萬 tick 同樣是 0.550m。
全域最小 0.469m 出現在**沒人在跑**的桶（站位微調期），仍遠大於 0.30m 穿模門檻。

補充：`0605e9c` 已加切向滑移（`SEP_SLIDE=0.6`，`game.js:361`）解對向穿越頂牛死鎖，
且有 `tests/separate-slide.test.mjs` 守著。畫面側證見第 6 項的 `w1-item6-allrun.mp4`
（`B2:cross` 從 4.10 切進 1.24，全程無疊人）。

**判定：✅ 通過**。工單「本輪新增交叉路線，可能產生新的穿模風險」的預期——
**實測沒有發生**，避讓半徑一次都沒被壓破。

---

## 16. 治具（`balance-sim.mjs 150`，未做校準須明寫）

**怎麼自己查**：`node tools/balance-sim.mjs 150`

**實際輸出**

```
=== 勝率曲線（150 次生涯模擬；臂＝基準（W7 全關）；A2=AI 代打基準）===
group-1          勝率  79%  平均分差 4.2
group-2          勝率  65%  平均分差 2.3
group-3          勝率  57%  平均分差 0.8
national-qf      勝率  38%  平均分差 -1.0
national-sf      勝率  50%  平均分差 0.2
national-final   勝率  13%  平均分差 -5.3
A2 場均（身高體感代理）：殺球 3.45｜吊球 0.12｜ACE 0.00｜攔網得分 0.00

決賽帶（真實連勝踏進決賽）：21%
奪冠率（國賽三連勝）：4%
逆轉哨兵（落後≥5 後翻盤，全 900 場）：樣本 323 場、翻盤 42（13%）
```

**對比 4.7 基準（工單 §11 所記）**

| 指標 | 4.7 基準 | 本輪 | 變化 |
|---|---|---|---|
| 決賽帶 | 31% | **21%** | −10pt |
| 奪冠率 | 9% | **4%** | −5pt |
| A2 場均殺球 | 3.42 | **3.45** | +0.03 |
| 落後≥5 場次 | 271/900 | 323/900 | +52 |

**明寫：本輪未做任何平衡校準。** 沒有任何 `TUNING`／權重／門檻是為了讓治具數字好看而改的。
數字往下走的方向與本輪內容一致（B1 commit 人格讓對手攔網變凶、D2 讓自己的一傳接球者被打降級）。
依工單 §11，**治具數字本身不構成校準理由**，要 Sawmah 實玩體感才裁定。

災難級判準（勝率 0%、殺球歸零）**未觸發**：小組賽 79/65/57%、殺球 3.45 反而略升，
不是 4.7 那兩次失敗的形狀。

**判定：✅ 已如實記錄（未校準已明寫）**

---

## 17. 命名（若動到名字相關檔，先跑 `tests/naming.test.mjs`）

**前置條件是否觸發**

```bash
git diff --name-only 64af618 HEAD | grep -iE "naming|names|opponents|roster|recruit"
# → src/career/opponents.js
```

**觸發了**（§6 B1 把 read／commit 人格寫進既有隊伍參數檔），所以本項必跑。

**實際輸出**

```
✔ naming：七隊 squad 六人名非空、隊內唯一（含自由人） (1.5038ms)
✔ naming：ace slot 有效且 name 指向該槽位本人、title 非空 (0.2866ms)
✔ naming：全專案全名不撞名（七隊 49 人＋替補 28 人＋我方 6 人＋新生） (0.2482ms)
✔ naming：reserves 物件形狀——name/role/grade/drop 齊全、隊內含遞補不撞名 (0.3654ms)
✔ naming：挖角除名——招募生不再現身原隊、槽位遞補、王牌被挖=ace 拔除 (0.468ms)
✔ naming：careerMatchSetup 整場接線——已招募者從對手隊消失 (3.435ms)
✔ naming：grades 不變式——非 ace 基準年級 ≤2、三年級 ace 恰為拍板四人、接班人年級 1 (1.2874ms)
✔ naming：招募目標年級由來源隊導出——逐鍵可解析、配比符合 Q3（≥1 三年級、≥2 一年級） (0.2727ms)
✔ naming：招募生 fullName＝對手名單同一人、role 對應槽位 (0.4942ms)
✔ naming：buildOpponentTeam 實際輸出 squad 名；無 squad 回退 N號 (0.8907ms)
✔ naming：我方 STARTER_DEFS 全員 fullName 非空唯一、隊長帶稱號 (0.3514ms)
```

**判定：✅ 通過**（12 條全綠）

---

## 附錄 A：驗收產出物路徑

`<scratchpad>` ＝
`C:\Users\shung\AppData\Local\Temp\claude\C--Users-shung\87b0455e-552b-4da8-8174-3a5ac3299e76\scratchpad`

| 檔案 | 用途 | 大小 |
|------|------|------|
| `w1-item6-allrun.mp4` / `.gif` | §12-6 B 隊三線同時拉開（200 格逐 tick） | 1.0 / 2.0 MB |
| `w1-item6-allrun-Aside.mp4` | §12-6 A 隊四線 | 1.1 MB |
| `w1-item6-allrun-B2.mp4` | §12-6 B 隊四線 | 0.4 MB |
| `w1-item7-threestep-closeup.mp4` / `.gif` | §12-7 助跑三步特寫（側面 5m，半 tick 步進） | 1.3 / 3.4 MB |
| `clearance-probe.mjs` | §12-15 跑動級避讓探針（可重跑，不進 repo） | 4 KB |
| `frames6a/ 6b/ 6c/ 7a/ 7cine/ 7cine2/` | 上述影片的原始逐幀 JPG（共 930 張） | 約 60 MB |

## 附錄 B：驗收方法備註

- **逐幀擷取的做法**：不錄螢幕。在頁面內把 `matchLoop` 的 rAF 回呼包一層，改餵「假時鐘」
  ——每次只發放 1 個（或 ½ 個）sim tick 的時間預算，截一張圖再發放下一格。
  這樣得到的是**逐 sim tick 對齊**的慢動作，而不是抽樣。sim 本身仍是固定 60Hz、決定論未被觸碰。
  副作用：畫面左上角 HUD 的 FPS 讀數在步進期間會顯示異常值（260／414／685 等），
  因為它算的是假時鐘的間隔——**這是量測手法的產物，不是效能異常**。
  第 13、14 項的效能數字全部取自**沒有開步進模式**的正常執行。
- **特寫鏡頭**：另外包一層，在正常那一幀渲染完之後把 camera 移到目標球員側面再 render 一次。
  只讀 `game.actors[pid]` 的座標，不寫回任何狀態。
- **未觸發任何 alert/confirm/prompt**。
- **未修改 `src/**`、未修改任何既有測試、未 commit／push／deploy。**
  驗收期間為了拿 4.7 基準數字，用 `git worktree` 在 scratchpad 開了一份 `64af618` 唯讀副本，
  驗收結束後已移除；主工作區自始至終 `git status` 乾淨。
