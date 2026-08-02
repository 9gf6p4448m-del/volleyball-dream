# 攔網死結卷 — 開卷前現況勘查（2026-08-02）

> 唯讀勘查。證據標註：**[碼]**＝讀原始碼得出、**[文]**＝讀文件轉述。
> 衝突時以 [碼] 為準。工作點＝`main@1102b64`（HEAD）。

---

## 零、病灶陳述的查證結論：**成立**（機制原封未動，只有行號漂移）

卷五簡報 `docs/kickoffs/vol5-measurement-delivery.md:125-151` 那段陳述，
2026-08-02 覆查結果：**機制層面完全成立**，但**引用的行號全部要 +13**。

**[碼] 行號漂移對照**（成因＝`83892ec` 在 `applyReplanCall`（ai.js:913 一帶）加了 13 行）：

| 簡報寫的 | 現在的真值 |
|---|---|
| `blockSetterTendency` at `ai.js:1543` | **`ai.js:1556`**（函式簽章）／檔頭註解 1527-1555 |
| `BLOCK_PLAN_CARRY` at `ai.js:1662-1677` | **`ai.js:1675-1677`**（陣列本體）／`blockPlanFor` **1679-1690** |
| `blockCommitRead` 唯一呼叫點 `ai.js:1856` | **`ai.js:1869`** |

**[碼] 機制未動的證明**：`git log --oneline --stat 877c1bd..HEAD -- src/` 顯示
量測交付之後只有兩個 commit 動 `src/`（`d888f03`、`83892ec`），
`git diff 877c1bd..HEAD -- src/sim/ai.js` 的 hunk 全部落在 `applyReplanCall`
（叫戰術／B 快解析器），**攔網區（ai.js:1491-1921 的 B1-SCAN 區）一個位元組都沒動**；
`src/sim/blockRead.js` 在該區間**完全沒有 commit 碰過**。

**[碼] 而且死結比簡報描述的更深一層**（簡報沒講到的）：
`AIM_CROSSING_MIX` 已定案為 **1**（`blockRead.js:174`），於是 `ai.js:1608-1616` 走的是
`x = midX`（`a.x + (midX − a.x) × 1`），而 `midX` 完全由 `setAimFor(...)` 的
**每個 kind 寫死的名目 lx/lz** 導出（`approach.js:39-57`，例：`quick` → `{lx:0, lz:1.0}`、
`left` → `{lx:-3, lz:1.3}`）。
⇒ 瞄準 x **不再吃攻擊手的即時位置**，而是「這個 kind 的名目過網點」＝**一個常數**。
⇒ 同一個 rally 內（roll 恆定、kind 恆定）**逐 tick 恆等**，兩名攔網手不論在哪個 tick
求值都拿到同一個數。這讓「改判分歧」在結構上幾乎不可能發生，
比簡報說的「同一個 roll」還要更硬。

---

## 一、`blockSetterTendency` 完整機制 **[碼]**

**位置**：`src/sim/ai.js:1556-1618`（檔頭設計理由 `ai.js:1527-1555`）。
**簽章**：`export function blockSetterTendency(game, atkTeam, opts = {})`
⇒ **沒有 playerId 參數**。這是死結的第一行。

### 輸入
- `game`、`atkTeam`（攻方**隊伍代號**，反作弊界線：拿不到 attackerId，`ai.js:1540-1545`）
- `opts.passTier`（一傳品質，`null` 時退回 `'perfect'`，`ai.js:1563`）

### 加權（`ai.js:1563-1585`）
1. `attackPointsOf(game, atkTeam, setterId, passTier)` → 攻擊池 `pts`（`ai.js:1563`）
2. 每點取 `effectiveTrust` 與 `trust.floorShare`（`ai.js:1567-1568`）
3. `w = applyFloorShare(entries, trustToWeights(entries))`（`ai.js:1570`）
4. **本場配分歷史**：`game.scoutTally[pid].spikes`，Laplace 平滑 `(hist+1)/(total+n)`，
   再 `× n` 讓均值≈1（`ai.js:1574-1584`）；語意＝對 trust 權重的**調變**不是取代
5. `scores[i] = w[i] × share × n`，正規化後餵給 `pickByWeights`

### roll 從哪來（**這是本卷的核心那一行**）
```
ai.js:1599:  const roll = hash01((score.A * 1009 + score.B) * 613 + 71 + (game.seed ?? 0));
ai.js:1600:  const best = pickByWeights(entries, scores.map((v) => v / sum), roll);
```
- **鍵＝比分**（`game.match.score`）＋ `game.seed`。**沒有 `idHash(playerId)`**。
- 對照組（同檔其他 roll 都有 per-player salt）：
  `ai.js:1123` `hash01(score.A*37 + score.B*101 + idHash(playerId) + seed)`、
  `ai.js:1222` `hash01(flightId*613 + idHash(playerId) + seed)`。
  ⇒ **要讓兩人分歧，最小改動就是把 `idHash(playerId)` 加進 1599 這一行的 hash 輸入**，
  但那要先讓 playerId 進得了這個函式（見「要動哪些行」）。
- 設計註解（`ai.js:1592-1597`）明文兩個要求：
  ① 與二傳自己的 roll **不同源**（`pickAttackPoint` 用 `flightId*977+131`，`ai.js:861`）
  ② **一個 rally 內恆定**——用 flightId 會讓賭注在一／二傳觸球那刻無故換人，
     chase 段當「改判」白付 `REPLANT_TICKS`。所以改用比分當鍵。
  ⚠ 這條②是**已裁定的設計約束**，本卷若要引入 per-blocker salt，
     必須保住「rally 內恆定」，否則會踩回這個已知坑。
- `hash01` 是純 hash、零 rng 消耗（`src/sim/rng.js:33`）。

### 輸出
`{ x, lx, kind }` 或 `null`。
- `AIM_CROSSING_MIX = 0` → `{ x: a.x }`（站在人身上，`ai.js:1617`）
- `AIM_CROSSING_MIX = 1`（**現行**）→ `x = midX`＝直線／斜線兩條過網線的中點
  （`ai.js:1608-1616`），來源是 `setAimFor` 的名目點 ⇒ **per-kind 常數**。
- `kind` 只給探針／測試讀（`ai.js:1553-1555`）。

### 被誰呼叫、一次呼叫服務幾個攔網手
- **唯一 sim 呼叫點**＝`blockAimX`（`ai.js:1647`），而 `blockAimX` 只在
  `blockPlanTargetX` 被呼叫兩次：**建計畫**（`ai.js:1726`）與 **chase 段改判**（`ai.js:1882`）。
- `blockAimX(game, aiState, atkTeam, persona, opts)`（`ai.js:1638`）——**同樣沒有 playerId**。
- **一次呼叫服務全隊**：`aiState.blockPlan` 是**單一團隊級欄位**（`ai.js:244` 初始化、
  `ai.js:1652-1654` 註解明文「建計畫仍是單一事件：第一個解鎖的人建，其餘人共讀」）。
- read 人格走另一條：`predictContactPoint(game.ball, ...)`（`ai.js:1640`），
  只吃球的物理量 ⇒ **結構上也不存在 per-blocker 版本** [文]`combination-attack-blueprint.md:140-142` 亦如此記載。

---

## 二、`BLOCK_PLAN_CARRY` 完整機制 **[碼]**

**位置**：`src/sim/ai.js:1675-1677`（陣列）＋ `blockPlanFor` `ai.js:1679-1690`；
設計理由註解 `ai.js:1662-1674`；容器 `newBlockPlan` `ai.js:1656-1660`。

### 它複製什麼
```
ai.js:1675-1677:
const BLOCK_PLAN_CARRY = [
  'x', 'enterTick', 'jumpTick', 'jumpAt', 'replantUntil', 'pendingX', 'blind', 'seen', 'hand',
];
```
`blockPlanFor(plan, playerId)`：該 pid **第一次被取用**時，逐 key 從團隊級
`plan.template` 複製一份到 `plan.byPid[playerId]`（`ai.js:1684-1686`），
之後**只由他自己步進**。`plan.latest` 只剩外部觀測用（`ai.js:1674`、`1688`）。

### 為什麼要複製（設計理由，`ai.js:1664-1673` 逐字）
- 攔網分工卷 step2b（2026-07-31）：「每名攔網手真的各跟各的」。
- step1 原本是「逐 tick 從 `plan.latest` 同步」的**行為中性膠帶**，step2b 把它拆除。
- 存在理由（註解自承）：攔網手不是每 tick 都走得到攔網分支（去接球／補位就沒步進，
  實測單局 601 次）⇒ 落後的人回來時 `seen`／`jumpTick` 會掉隊
  ⇒ **「個別騙得到某一名攔網手」在結構上可表達的那一刻**（組合攻擊卷的交叉／夾塞／時間差要騙的就是這個）。
- **刻意不進 CARRY 的兩個欄位**：`cover`（step2a：我是不是回落補吊球的那個，
  `ai.js:1682-1683`、`ai.js:1370-1373`）與 `chase`（step2b：落地後 close 預算，`ai.js:1906-1917`）
  ——「每人各自一格的判斷結果，從別處帶過來會變成別人的決定」。

### 拿掉它會怎樣
- **[碼] 沒有任何註解或測試直接說「拿掉會怎樣」**——CARRY 是把 template 送進 byPid 的
  唯一通道，直接拿掉＝`byPid[pid]` 全是 `undefined` ⇒ `blockPlanAirborne`
  （`ai.js:1709-1710`，`c.jumpTick == null` 就回 false）永遠不起跳。
- 真正的問題不是「拿掉 CARRY」，而是**`'x'` 這個 key 在 CARRY 裡**：
  它把團隊級單一 roll 的結果原封複製給每個人。要讓兩人分歧，
  **`'x'` 必須改成 per-blocker 自算**（把 `x` 移出 CARRY、在 `blockPlanFor` 或呼叫端各算各的）。
- 反面約束 [碼]`ai.js:1652-1654`：`enterTick` 等「建計畫的時機／輸入」是團隊級，
  拆成各建各的會**連建計畫的時機與輸入都變**——step2b 明文說「本步不動這一層」。
  ⇒ 本卷若要各建各的，就是**推翻 step2b 當初刻意留下的邊界**，要進裁定題。

### 這一卷要動的是哪些行（[碼] 綜合 一＋二）
| # | 檔案:行號 | 現況 | 要改成 |
|---|---|---|---|
| 1 | `ai.js:1556` | `blockSetterTendency(game, atkTeam, opts)` | 加 `playerId`（或 opts.blockerId） |
| 2 | `ai.js:1599` | roll 鍵＝`(score.A*1009+score.B)*613+71+seed` | 併入 `idHash(playerId)`（保住 rally 內恆定） |
| 3 | `ai.js:1638` | `blockAimX(game, aiState, atkTeam, persona, opts)` | 加 `playerId` 參數 |
| 4 | `ai.js:1647` | `blockSetterTendency(game, atkTeam, opts)` | 轉傳 playerId |
| 5 | `ai.js:1726` / `ai.js:1882` | 兩處 `blockAimX(...)` 呼叫端 | 補傳 `playerId`（已在 scope） |
| 6 | `ai.js:1675-1677` | `'x'` 在 CARRY 裡 | 把 `'x'` 移出／或建計畫時就 per-pid 算 |
| 7 | `ai.js:1652-1660` `newBlockPlan` | `template` 團隊級單一事件 | （若要各建各的）本層 step2b 明文未動，屬裁定題 |
| 8 | `blockRead.js:174` `AIM_CROSSING_MIX: 1` | 瞄準退化成 per-kind 常數 | 要不要保留＝策略數值，硬規則 3 須裁定 |

⚠ 注意 6～8 每一項都動到已裁定的東西，不得逕行。

---

## 三、兩名攔網手的「改判」路徑 **[碼]**

`blockPlanTargetX` 的 chase 段（`ai.js:1805-1898`）。現況：

### 改判本身（`ai.js:1882-1898`）
```
ai.js:1882:  const live = blockAimX(game, aiState, atkTeam, persona, opts);
ai.js:1890:  if (tick < c.replantUntil) return c.x;
ai.js:1891:  if (c.pendingX != null) { c.x = c.pendingX; c.pendingX = null; }
ai.js:1892:  if (Math.abs(live.x - c.x) > BLOCK_COMMIT.REPLANT_JUMP_M) { … c.replantUntil = tick + REPLANT_TICKS; }
```
- `REPLANT_JUMP_M = 1.0`（`blockRead.js:180-183`）、`REPLANT_TICKS = 12`（`blockRead.js:187-190`）。
- **`live` 對兩人逐值相同**：`blockAimX` 不吃 playerId，`opts` 來自團隊級 `aiState`
  （`ai.js:1721`），`blockSetterTendency` 的 roll 只吃比分＋seed。
  ⇒ 分歧**只能**來自「兩人在不同 tick 求值」造成的相位差。
- 而 `AIM_CROSSING_MIX=1` 讓 `live.x` 在整個 rally 內是常數 ⇒ 相位差也不產生差異。
  **這是 0.15% 的真正結構理由**（比簡報描述的更強）。
- `blind` 計畫（commit 沒讀到人的退路）**明文不得改瞄**：`ai.js:1879-1881`。

### 目前存在的 per-blocker 通道（全部盤點）
| 通道 | 位置 | 現況 |
|---|---|---|
| ① **漏 tick**（沒走到攔網分支就沒步進） | `ai.js:1668-1672` 註解 | **唯一活著的通道** |
| ② `outerLag` 逐人反應延遲 | `ai.js:1869-1872`，`Math.round(reactionTicks(player) × OUTER_LAG_MUL)` | ⚠ **`OUTER_LAG_MUL = 0`（`blockRead.js:162`）＝出廠關閉**，這條通道現在是死的 |
| ③ `cover`（第三人回落補吊球） | `ai.js:1370-1373` | per-blocker，但不影響瞄準 |
| ④ `chase`（落地後 close 預算） | `ai.js:1906-1917`，吃 `player`／`actor.x` | per-blocker，但不影響瞄準 |
| ⑤ `jumpAt`（read 起跳時鐘） | `ai.js:1772`，建計畫那一 tick 鎖存 | **團隊級**（寫進 template）|
| ⑥ `hand`（press/vertical/retract） | `ai.js:1780-1783` | **團隊級**（寫進 template）|

★ 關鍵事實 **[碼]**：`ai.js:1867-1868` 註解自稱 `outerLag` 是「攔網分工卷 step2b
『個別演進』在輸入端的**第一條真通道**」，但 [文]`docs/block-timing-final-status.md:126`
與 [碼]`blockRead.js:162` 都顯示 `OUTER_LAG_MUL` **出廠＝0**。
⇒ 現況實際上只剩「漏 tick」一條通道。文件與程式碼**不衝突**，但註解的語氣容易誤讀成「已啟用」。

---

## 四、卷一（攔網時序卷）改了什麼／刻意沒動什麼

**[文]** 結案文件＝`docs/block-timing-final-status.md`（199 行）。
**commit 鏈**：`4010c26` → `6687d8a` → `18af216` → `2164670` → `6bfc7dd` → `6e13cd0`
（＋卷尾 `1f543d2`、`1e9f69a`、`2b325e5`）（`block-timing-final-status.md:22`）。

### 動過的機制（裁定對照，`block-timing-final-status.md:12-21`）
| 裁定 | 內容 | commit |
|---|---|---|
| 0 | 款 3 警報器＝乙案（隨卷重定基準）；門檻 5pp → **10pp** | 卷尾 |
| 1 | 落地攔網＝A＋擴大（資格＝物理滯空）；commit 牆「落地攔網」76.88% → **0.00%** | `4010c26` |
| 2 | **commit 人格重寫（賭對就死）**：賭注方向改讀二傳配分傾向；強度端 `AIM_CROSSING_MIX=1` | `6687d8a`／`2164670` |
| 3 | 前排全員手動立即攔網 | `6bfc7dd` |
| 4 | 兩翼偵測放寬（`DEPTH_LZ` 2.9 → `APPROACH.left.lz+0.1 = 3.7`）；**外圍降級掃描後裁定出廠關閉** | `18af216`／`2164670` |
| 5 | commit 起跳訊號＝丙＋甲：**位準早跳保留**、賭注方向改讀配分傾向 | `6687d8a` |
| 6 | 段 F 回饋層併卷尾（②歸因版上線／①退無歸因版） | `6e13cd0` |

### `blockCommitRead` 在段 2 之後的角色 —— **問題的答案：是**
**[碼] 確認**：`blockCommitRead` 在 `src/sim/ai.js` **只剩 `ai.js:1869` 一個呼叫點**，
位於 chase 段的「起跳訊號」分支（`ai.js:1860-1877`：`liveRead` → `c.seen = true` →
`r.touches >= 2 && c.seen && liveRead == null` 才 `c.jumpTick = tick`）。
`ai.js:1643-1646` 註解逐字：「段 2（裁定 2＋5）：commit 的**賭注方向**改讀二傳配分傾向，
不再走 `blockCommitRead`。⚠ `blockCommitRead` **沒有退場**——它仍是 commit 的**起跳訊號**」。
⇒ **`blockCommitRead` 在卷一段 2 之後只決定「何時跳」，不決定「瞄準誰」，成立。**

### 卷一**刻意沒動**的東西（本卷開卷最需要知道的）
1. **`OUTER_LAG_MUL` 出廠關閉**（`blockRead.js:162`、`final-status.md:126,154-157`）
   ——機制留碼，掃描顯示「降級在每一格都同時打翻兩道門檻」（`final-status.md:73-76`）。
   附帶坑：`OUTER_LZ` **不得設在快攻助跑起點（3.0）以內**，設 2.9 款 3 gap 翻成 −7.3pp。
2. **`TANDEM_PLAY_RATE` 維持 0**（`final-status.md:124`）——前置條件已成立，
   但 Sawmah 2026-08-01 裁定「**跨卷再解**」，理由是難度位移歸因分不開。
3. **`TUNING.TOOL_CHANCE` 出廠 0**（`final-status.md:125,146-152`）——解封條件未達成，
   但**原因換了**：舊理由「瞄手意圖連結率 <10%」→ 新阻塞點「牆很少出現在球路上」（進帶 3.3%）。
4. **難度校正一律不做**（`final-status.md:6`）——歸難度重校卷（卷二）。
5. **三人牆恢復**列記債（`final-status.md:167`）：「待本卷段 3 修好瞄準後另卷再議」。
6. **read 人格結構上沒有 per-blocker 版本**——卷一沒碰。
7. 「該吃第幾個下降沿」＝**憲法 §零 領域，實作端不得自行決定**（`ai.js:1845-1846`）。

---

## 五、款 3 警報器

### 完整定義 **[碼]**
- **在哪**：`tests/block-persona.test.mjs:371-393`，測試名
  `款3 離地率警報器：read 對快攻的離地率須明顯低於 commit（真載體）`
- **量什麼**：`quickAirShare(persona, sets)`（`block-persona.test.mjs:321-369`）——
  對 `kind === 'quick'` 的攻擊，在**球過網那一 tick**量守方前排 MB 的
  `blockTopEdge / blockReach > standingReach / blockReach`（＝「離開地板」），
  取百分比。口徑抄自 `tools/phase5-block-jumpcount-probe.mjs:64-148`（註解 `:316-317`）。
- **樣本**：`SETS = 40`（`:377`）、seed `s*101`、守方 `aiProfiles.B.blockPersona`；
  樣本門檻 `read.n >= 30 && commit.n >= 30`（`:380-381`）。
- **落帳語意**：只在 `DEAD_BALL` 落帳 ⇒ **每個 rally 只記最後一次攻擊**
  （`:318-320`，改成每次過網會混入不同母體、差 +19pp）。
- **門檻**：`assert.ok(gap >= 10)`，`gap = commit.share − read.share`（`:382,390`）。
- **現值**（[文] `block-timing-final-status.md:123`、`block-persona.test.mjs:385-388`）：
  卷前 read 19.5% / commit 25.8% → **+6.3pp**（門檻 5、餘裕 1.3pp）；
  段 1 落地後 **+1.8pp**（紅過一次，裁定 0 預先簽准）；
  卷一定案 40 局 read 19.5% n=307 / commit 34.0% n=256 → **+14.4pp**（門檻 10、餘裕 4.4pp）。
  ⚠ [文] `phase5-section10-4-stage2-discussion-brief.md:153-155`：§十-4b 意圖層
  （tool/retract/press）把 gap 收窄到 **+8.5pp@40 局**——那是**卷一之前**的量測，
  卷一定案後回到 +14.4pp。**兩個數字屬不同工作點，別混用。**

### 它為什麼存在 **[文]**
- R4 三款的定義在 `docs/kickoffs/phase5-section10-stage2-v4-rulings.md:61-84`：
  款 1 read×兩翼／後排顯著高於地板；款 2 commit×快攻顯著高於地板；
  **款 3 ＝ read×快攻 明顯低於 commit×快攻**（＝「read 不對快攻賭」＝賭局存在的證明）。
- 教訓來源（`phase5-section10-4-discussion-brief.md:138-152`）：原本守的是 G% margin，
  160 局重測證明那是 **+0.5±2.1pp 的空載體** ⇒ 指標退役，改守離地率 gap。
  ★兩條教訓逐字：①**警報器要守載體不是守代理**；②時序鏈全綠但真載體翻轉時會沒人叫。
- 同檔另有第二道閘：`block-persona.test.mjs:395` 起
  `B1 回歸閘：read 對快攻的預測擊球 tick 仍偏晚（款 3 的載體不得消失）`——
  守 `predictContactPoint` 對快攻的系統性偏晚（實測 +7~+9 tick）大於快攻飛行段（p50 6 tick），
  中位數門檻 6 tick（`:431-433`）。**任何改善擊球點預測精度的改動都會打穿款 3。**

### 動攔網瞄準會怎麼影響它 **[碼]＋[文]**
- 款 3 量的是**離地率**（何時跳），不是瞄準 x。純粹動瞄準（`blockSetterTendency` 的 roll）
  **不直接**動起跳訊號——commit 的起跳仍走 `blockCommitRead` 下降沿（`ai.js:1869-1877`），
  read 仍走鎖存的 `jumpAt`（`ai.js:1855-1859`）。
- **但有間接路徑**：`c.x` 改變 → `REPLANT_JUMP_M` 判定改變 → `replantUntil` 改變 →
  站位改變 → 誰算 tier 0/1/2（`ai.js:1360-1375`）改變 → 誰在牆上、誰去補吊球改變
  ⇒ 落帳母體改變。且 `AIM_CROSSING_MIX` 若被本卷動到，是**直接**改 commit 的站位與
  攔到率，`final-status.md:73-76` 的掃描表已示範「降級在每一格都同時打翻兩道門檻」。
- [文] **預授權處置已有前例且一致**：`phase5-section10-4-discussion-brief.md:111,121`
  與 `stage2-discussion-brief.md:111` 都寫「**款 3 若翻轉＝停手回報，不現場調參**」。
  `block-persona.test.mjs:389` 逐字：「門檻只跟著**已裁定的重設計**走，
  不得為了讓某次改動過關而調——那是改測試遷就實作」。

---

## 六、憲法級限制（本卷不得推翻的既有裁定）

> 核心九條在下，權威出處在「六補」。

1. **反作弊界線（最硬）** **[碼]**：`src/sim/blockRead.js:104-108` — 攔網 AI 不得取得
   `attackerId`；`blockCommitRead` 簽章只吃 `game` ＋隊伍代號；ai.js 判讀路徑由
   `B1-SCAN-BEGIN`（`ai.js:1491` 一帶）/`B1-SCAN-END`（`ai.js:1921`）圍起，
   由 `tests/block-persona.test.mjs` **靜態掃描**把關。
   更嚴的一條（`blockRead.js:117-124`）：**AI 與玩家必須讀同一組線索**，
   刻意不讀 `§4 的 route 表`（帶 startTick／takeoffTick 等未來值）。
   ⇒ 本卷讓兩人分歧，**不得**靠「各自知道真攻擊手是誰」來做。
2. **`blockCommitRead` 不回傳 playerId** **[碼]** `blockRead.js:230-232`：
   「刻意不回傳任何 playerId：呼叫端就算想偷渡也拿不到人」。
   ⇒ 分歧率只能用 `byPid[pid].x` 是否不同來操作化（降級指標，卷五已明列限制）。
3. **「該吃第幾個下降沿」＝憲法 §零 領域** **[碼]** `ai.js:1845-1846`：
   「實質上就是 read／commit 賭局的定義本身……不由實作端自行決定」。
   同一句在 [文] `docs/phase5-section10-test-triage.md:847`、
   `block-division-case-memo.md:73`、`block-division-discussion-brief.md:203`。
   ⚠ 實測過的失敗：「下降沿要認人」→ read 面對快攻 **100% 不起跳**、commit 回到 set+0，**已撤回**（`ai.js:1843-1844`）。
4. **per-blocker 輸入的前案裁定** **[文]** `docs/kickoffs/combination-attack-blueprint.md:133`
   逐字：「**輸入要不要 per-blocker｜不做，本卷收在這裡**……只改輸入零效果，
   要有效必須連觀察窗一起放寬，而那動的是 commit 賭局的判準本身（憲法 §零）＋全域平衡重驗。
   **寫成未來『攔網時序卷』的材料**」。
   ⇒ **這一卷就是那個「未來」**。但注意當時的歸因（候選數＝1 佔 99.77%）
   已被卷五推翻（現值 12.68%），**不得再引用那個理由**。
5. **read 人格結構上無 per-blocker 版本** **[碼]** `ai.js:1639-1641`
   （`predictContactPoint` 只吃球）＋ [文] `combination-attack-blueprint.md:140-142`。
6. **策略數值一律先問使用者**（使用者硬規則 3）：`AIM_CROSSING_MIX`、`OUTER_LAG_MUL`、
   `REPLANT_JUMP_M`、`REPLANT_TICKS`、`DEPTH_LZ` 全屬此類；
   `blockRead.js:167-168` 逐字標註「⚠ 這是策略數值（硬規則 3）」。
7. **`TANDEM_PLAY_RATE` 跨卷再解、`TOOL_CHANCE` 不解封**（`final-status.md:124-125`）。
8. **款 3 翻轉＝停手回報，不現場調參**（見 §五）。
9. **`AIM_CROSSING_MIX=1` 是 Sawmah 2026-08-01 定案**（`blockRead.js:172-174`，
   掃描依據 `tools/block-outer-sweep.mjs`）——動它＝推翻卷一裁定 2 強度端。

### 六補：攔網人格憲法的**權威出處**（本卷最需要先讀的一段）**[文]**
`docs/phase5-section10-RESOLVED-supplement.md` **§2.1（line 104）與 §2.2**——
文件自己在 `:165-168` 明文更正：v3 裁定書寫「請寫入憲法 §零」是**寫錯位置**
（`phase5-decisions-RESOLVED.md` 的 §零 是「編號變更」，與攔網無關），
**攔網人格原則的權威出處就是這一節**。同一更正也記在
`docs/phase5-section10-test-triage.md:716`（#13）。

該節的兩條拍板逐字：
- **§2.1（`:104` 一帶）**：「read 與 commit 走同一條路，只差決策時點」；
  「打開 `COMMIT_PERSONA_ENABLED` 後兩者共用同兩支函式，**只有觸發 tick 不同**」。
  ⇒ 本卷若讓兩人「各走各的判準」，要先確認**沒有把 read／commit 的差異從
  『觸發 tick』擴張成『判準本身』**——那是憲法層。
- **§2.2 三段狀態機**：【判】＝「起算事件＋反應延遲後，**選定一名攻擊手**；
  目標 x 由**該攻擊手的預測過網點**導出」。
  ⚠ **這句有歧義且是本卷的關鍵**：「選定一名攻擊手」沒有明說是
  「每隊選一名」還是「每名攔網手各選一名」。現行實作是前者（團隊級 template）。
  **本卷開卷第一題應該就是請 Sawmah 釋這一句。**
- **§2.1 附註（`:160-164`）**：R4 第 3 款「是靠預測擊球 tick 系統偏晚撐著的」，
  「任何日後改善擊球點預測精度的改動都會打穿 R4 第 3 款」——護欄就是
  `tests/block-persona.test.mjs:395` 那條。

### 六補二：`CLAUDE.md` 層級的一般約束 **[文]**
- 專案 `CLAUDE.md`：「設計定案見 `docs/design-brief.md`——**已定案決策清單不重開討論**」。
  實查 `docs/design-brief.md` 的攔網相關只有 `:14`（五種動作的操作哲學）與
  `:43`（視線欺敵：第一人稱扣球時玩家看向哪裡是攔網 AI 讀取的資訊）——
  **`:43` 的「視線欺敵」是尚未實作的已定案賣點，本卷若動攔網讀取應順帶確認不與它衝突。**
- 架構鐵律 1：`src/sim/` **零 three.js、固定步長 60Hz、決定論**；sim 改動必跑 `npm test`。

---

## 七、既有攔網探針清單

> 以下是親自讀過檔頭的關鍵幾支，完整 22 支表在本節末。

- `tools/block-divergence-probe.mjs`（**最相關**）— 組合攻擊卷段 D 的攔網分歧量測，
  三臂：A0 base@3031a2f worktree／A1 base HEAD／**A2 `nearest` 反事實**
  （用 `module.registerHooks` 在載入時改字串，磁碟零改動；`:37-115`）。
  用法：`node tools/block-divergence-probe.mjs [局數=40]`，`BD_ARMS=base,nearest`、`BD_OUT=<dir>`。
  ★★ **[碼] 這支的 `nearest` 臂現在會直接拋錯** ★★
  `sub()` 在找不到目標字串時 `throw new Error('patch 目標消失…')`（`:63-67`），而它要找的
  `'  const x = blockCommitRead(game, atkTeam, opts)?.x ?? null;'`（`:80`）與
  `'  DEPTH_LZ: 2.9,'`（`:73`）**在現行 src 中都已不存在**（實測 `grep -c` 皆為 0）。
  ⇒ 本卷若要重跑反事實臂，**必須先重寫這支探針的 patch 目標**（新目標＝`blockSetterTendency`）。
- `tools/vol5-block-read-probe.mjs` — 卷五量的候選數分佈／分歧率／候選 lz，
  用 `opts.k` 覆寫點反覆調低門檻「剝」出候選（真實路徑，零重抄判定邏輯；檔頭 `:13-54`）。
- `tools/block-commit-bet-probe.mjs` — 量 commit 的賭注對象與賭中率；
  `:22-23` 自動偵測 `blockSetterTendency` 是否存在來決定走段 2 前／後的口徑。
- `tools/block-outer-sweep.mjs` — 段 3 的掃描臂（款3gap／右翼攔回%／jt 相異%／交叉jt%／攻方每球得分）。
- `tools/block-individuation-probe.mjs` — 個體化率口徑的來源（divergence probe 沿用）。
- `tools/segf-decoy-probe.mjs` — 段 F 誘餌回饋門檻；`:84-87` 已改呼叫 `blockSetterTendency`
  （god 口徑修正，`final-status.md:83-88`）。
- `tools/phase5-block-jumpcount-probe.mjs` — 離地率口徑的來源（款 3 警報器抄它）。
- `tools/t10-4b-alarm-ablation.mjs` — 款 3 gap 的歸因消融。
### 完整清單（22 支，檔頭一句話；全部 `tools/` 下）**[碼]**
| 探針 | 量什麼 |
|---|---|
| `block-commit-bet-probe.mjs` | 卷一段 2：commit 的「賭注」四件事（賭中率／盲賭率／線別分佈） |
| `block-defend-probe.mjs` | 試玩提問：開了攔網窗真的攔得到嗎／退防是接球模式嗎 |
| **`block-divergence-probe.mjs`** | 組合攻擊卷段 D：攔網分歧（三臂含 per-blocker 反事實）★已失效，見上 |
| `block-edge-sequence-probe.mjs` | `blockCommitRead` **下降沿序列**（一次攻擊有幾個下降沿、各在何時） |
| **`block-individuation-probe.mjs`** | 分工卷 step2b 驗收：攔網手的個別演進真的成立了嗎（只讀 `byPid`，零行為改動） |
| `block-marginal-probe.mjs` | 分工案開卷補量：M1 第三人邊際貢獻／M2 吊球／M3 牆寬敏感度 |
| **`block-outer-sweep.mjs`** | 卷一段 3 掃描 harness：外圍降級幅度曲線（含款3gap 欄） |
| `block-persona-probe.mjs` | W1 §6 B1：read 隊 vs commit 隊行為差異量化 |
| `block-read-probe.mjs` | W1 §7 C2：封直線→後排陣型偏斜線（世界座標） |
| `landed-block-probe.mjs` | 卷一段 1：攔網接觸中有多少是已落地的人擦到的 |
| `phase5-block-blind-probe.mjs` | blind 退路計畫到底會不會起跳 |
| `phase5-block-clue-probe.mjs` | read 手上有沒有線索分辨誘餌與真攻擊手 |
| `phase5-block-geometry-probe.mjs` | E 表新指標 H／V／G（過網帶幾何） |
| **`phase5-block-jumpcount-probe.mjs`** | 單次攻擊內起跳次數分佈＋**離地率**（款 3 警報器的口徑來源，`:64-148`） |
| `phase5-block-nettick-probe.mjs` | 球能不能告訴 read「什麼時候」（過網 tick 可導性） |
| `phase5-block-plan-lifecycle-probe.mjs` | 攔網計畫壽命診斷（窗長／分支活著／從未活過） |
| `phase5-block-timing-probe.mjs` | 攔網的時間預算（read 的延遲有沒有咬到） |
| `phase5-block-width-probe.mjs` | 攔網手橫移與牆的實際寬度 |
| `phase5-blockgap-probe.mjs` | `commitGap`／`readGap` 收斂前對照 |
| `t10-4b-blockout-probe.mjs` | §十-4b：打手出界／縮手／z 維（`node … [局] [a] [b] [TOOL_CHANCE]`） |
| `tandem-block-probe.mjs` | 夾塞被攔死率診斷（零 src 改動） |
| `triple-block-probe.mjs` | 三人攔中的試玩回饋查證（唯讀觀測） |
| `t10-4b-alarm-ablation.mjs` | 款 3 gap 的歸因消融（tool −9pp／retract +4.5pp） |
| `vol5-block-read-probe.mjs` | 卷五：候選數分佈／分歧率／候選 lz（真實路徑＋`opts.k` 剝候選） |
| `sim-hash-probe.mjs` ＋ `sim-hash-baseline.json` | 決定論指紋（`--write` 重寫基準） |
| `balance-sim.mjs` ＋ `balance-paired-baseline-*.json` | 全域平衡配對治具（款 3 之外的第二道閘） |

**「真實路徑 vs 重建模型」自標註**：`block-individuation-probe`（`:3` 零行為改動、只讀 byPid）、
`vol5-block-read-probe`（`:21-28` 真實 `blockCommitRead`、零重抄判定邏輯）、
`landed-block-probe`（`:3` 實際事件與 actor 狀態）、`tandem-block-probe`／`triple-block-probe`
（零 src 改動）＝真實路徑；`block-divergence-probe` 的 A2/A2w 臂＝**反事實臂**
（檔頭明文「不得當成上線後的預測值」，`combination-attack-blueprint.md:146`）。

---

## 八、相關測試護欄 **[碼]**

### ★ 會直接擋住「讓兩人分歧」的第一號護欄 ★
**`tests/block-tendency.test.mjs:98-105`**
測試名：`段2 反作弊：blockSetterTendency 只吃隊伍代號，回傳不含任何 playerId`
```
tests/block-tendency.test.mjs:100:  const t = blockSetterTendency(game, 'A', { passTier: 'perfect' });
tests/block-tendency.test.mjs:102:  assert.deepEqual(Object.keys(t).sort(), ['kind','lx','x'], '回傳欄位多了東西（不得夾帶 pid）');
tests/block-tendency.test.mjs:104:  for (const v of Object.values(t)) assert.ok(!ids.has(v), '回傳值裡出現 playerId');
```
⇒ 這條把 **`blockSetterTendency` 的呼叫形狀與回傳形狀都釘死了**。
把 playerId 加進**參數**：`:100` 那行只傳 3 個參數，多的參數會是 `undefined`
（不必然轉紅，但語意上直接違反測試名的宣稱）。
把 pid 帶進**回傳**：`:102` 立刻轉紅。
⚠ 這條是**反作弊護欄**，不是效能護欄——退它要走裁定，不能改測試遷就實作。
**但要分清楚**：它禁的是「拿到攻方的 playerId」；本卷要傳的是**守方自己那名攔網手的 pid**，
語意上不同（自己知道自己是誰不算作弊）。**這個區分必須進裁定題，不得自行認定。**

### ★ 反向護欄（要求分歧存在，本卷的盟友）★
**`tests/block-individuation.test.mjs:91-99`**
測試名：`step2b 耦合警報器：兩名上牆者的 jumpTick 必須仍有機會相異（同步線不得被加回來）`
- 口徑：`wallJumpIndividuation(40)`，`SETS=40`／`MIN_PAIRS=800`／`MIN_DIFF_PCT=0.5`
  （`:85-89`），分母現值 1022 波。
- 斷言 **`pct >= 0.5%`**（`:96-99`）——注意它守的是 **`jumpTick` 相異率**，不是瞄準 x 相異率。
  ⇒ 本卷若讓瞄準分歧，這條**不會擋**，反而是同方向；但**本卷不得讓它掉到 0.5% 以下**。

### 其他攔網護欄（`tests/block-persona.test.mjs`）
| 行號 | 測試名 | 對本卷的意義 |
|---|---|---|
| `:117` | B1：read 與 commit 走位明顯不同 | 動瞄準會改走位，可能受壓 |
| `:136` | B1：快攻沒來時 commit 到位率明顯較差 | 同上 |
| `:172` | **B1 反作弊：攔網判讀路徑（B1-SCAN 區）零 attackerId** | 靜態掃描，**硬護欄** |
| `:201` | B1 護欄的護欄：剝註解對 CRLF/CR/LF 結果相同 | 支援上一條 |
| `:226` | B2：commit 攔網手單 tick 位移不得超過移動能力（無瞬移） | 動瞄準要守住 |
| `:254` | **B1：同 seed 兩次逐值相同（人格與 commit 鎖定狀態皆納入）** | 決定論，**硬護欄** |
| `:264` | **B1 回歸閘：未注入 blockPersona 的比賽與 read 人格逐值相同** | read 路徑不得被本卷污染，**硬護欄** |
| `:272` | `blockCommitRead`：一傳沒到位＝沒有 commit 標的 | 不受影響 |
| `:289` | `blockCloseBudget` 時間預算 | 不受影響 |
| `:371` | **款3 離地率警報器（gap ≥ 10pp，40 局）** | 見 §五，**硬護欄** |
| `:395` | **B1 回歸閘：read 對快攻預測擊球 tick 仍偏晚（中位數 ≥ 6 tick）** | 見 §五，**硬護欄** |

### `tests/block-tendency.test.mjs` 其餘四條（全部釘 `blockSetterTendency` 的行為）
- `:48` 段2-③ 本場配分歷史真的驅動賭注（堆歷史就拉高被賭比例）
- `:66` 段2-① trust 權重真的驅動賭注（歷史持平時跟著 trust 走）
- `:83` 段2-② passTier 掉檔後池裡沒快攻，commit 賭不到中路 MB
- `:98` （見上，反作弊）
⇒ 這四條**全部直接呼叫 `blockSetterTendency(game, 'A', {...})`**，
本卷若改簽章，**四條都要同步改**（是機械改動，但要在 kickoff 裡先講明工程量）。

### `tests/block-timing.test.mjs`（卷一新增）
`:35` 網下不可攔／`:43` BLOCK_TOUCH 不與 DEAD_BALL 同 tick／
`:72` **段1 真載體：AI 攔網接觸一律在滯空窗內**／`:102` 段1 記債（玩家手動窗落地段保留）。

### 決定論／sim-hash
- `tools/sim-hash-baseline.json` — 現行基準 **`c81955fdea3f6877`**
  （[文] `block-timing-final-status.md:177`）。**動瞄準必然改 sim-hash**，
  卷五「逐值不變」的做法（只建線不接抽籤）在本卷**用不上**。
- **[碼] sim-hash 沒有任何測試在守它**：`grep -rn "sim-hash-baseline|simHash" tests/ package.json`
  **零命中** ⇒ 它是**人工紀律**（跑 `tools/sim-hash-probe.mjs`），不是 CI 護欄。
  ⇒ 本卷改瞄準會改 sim-hash，但**不會有測試轉紅提醒你**，要自己記得重寫基準。
- `tests/determinism.test.mjs:8,28`（批次推進一致／10 分鐘無 NaN）、
  `tests/game-determinism.test.mjs:18,31`（同種子逐 byte 相同／不同種子不同對局）、
  `tests/ai-determinism-order.test.mjs:16,24`——**[碼] 逐條讀過**：
  三支守的都是「**同 seed 重跑一致**」，**沒有一支守「遍歷順序不影響結果」**
  （`ai-determinism-order.test.mjs:16-22` 只跑 `playSet(2024)` 兩次比對，名字容易誤讀）。
  ⇒ 本卷把 template 改成 per-blocker 之後若引入「誰先解鎖誰建計畫」的順序相依，
  **這三支測試抓不到**。這是一個**護欄缺口**，kickoff 應主動點名。
- [文] `npm test` 現況：卷五量測交付時 **991-992 全綠**；卷一結案時 953。
