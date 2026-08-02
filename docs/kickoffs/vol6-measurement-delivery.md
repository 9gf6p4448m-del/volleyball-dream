# 卷六量測交付 — 攔網死結：兩名攔網手分開賭（2026-08-02）

> 上位＝`vol6-block-divergence-ruling.md`（Sawmah 2026-08-02 四項裁定）。
> 工作基準 `main@1102b64`（實作起點 `215ffe3`，該 commit 為 docs-only，`src/` 逐值相同）。
> 本檔只放**量到的數字與怎麼量的**；裁定原文不重抄。

---

## 一、動手前必查項（裁定書 §三）

### 1. CARRY 其餘 8 欄的建立順序相依 — **無害，不觸發 D4**

- `plan.template` 建立後**全域唯讀**：唯一讀取點 `ai.js:1685`，全 repo 零寫入點
  （`grep -rn '\.template' src tools tests`）。⇒ 八欄不論哪個 tick 入場都拿到
  建計畫那一刻的鎖存值，順序相依只存在於「**誰**建計畫」這一層，x 抽出後不新增任何相依。
- 唯一與 x 有欄位耦合的是 `hand`（read 用 `|read.x| > BLOCK_RETRACT_WIDE_X` 決定縮不縮手，
  `ai.js:1780-1784`）。它只在 read 的 `predictContactPoint` 回不出值、掉到
  `blockSetterTendency` 退路時才會 pid 化 ⇒ 該情形**實測 0 / 4,877**（80 局，
  `tools/block-carry-coupling-probe.mjs`，read 3,247 ／ commit 1,630）。脫鉤不存在。
- ★**裁定書漏列一個 `blockPlanFor` 呼叫點**★：`ai.js:1371`（關牆佈局讀 `cover`）
  也會替不存在的 pid **建格**。若首次求值只掛在 `ai.js:1798`，被 1371 搶先建格的攔網手
  會靜默拿回團隊級 x、分歧當場消失。⇒ 求值實作在 `blockPlanFor` **內部**
  （計畫上的 `resolveX` 閉包），不是改呼叫端。

### 2. `replantUntil` 初值 — 不誤觸發，但釘死一個前提

- 兩處 template 的 `replantUntil: -1`／`pendingX: null` 逐值照抄，`tick < c.replantUntil`
  恆偽 ⇒ 首次取用不進重新踩定（與裁定 2「首次取用不算改判」一致）。
- **前提**：首次複製求出的 x 必須與**同一 tick** chase 段 `live` 算出的 x 逐值相同，
  否則 `|live.x − c.x| > REPLANT_JUMP_M` 會把首次取用判成改判。
  ⇒ `resolveX` 一律讀**當下**的 possession／persona／`passTier`（`blockAimOptsOf` 單一定義
  兩邊共用），不得鎖存建計畫那一刻的 opts。
- **blind 計畫不參與求值**：建計畫時 `blockAimX` 回 null，晚入場者求值會拿到非 null 的
  新瞄準點＝事後改瞄，違反 `ai.js:1880-1881` 的 blind 裁定。實作＝blind 那條
  `newBlockPlan` 不傳 `resolveX`。實測 blind 在 80 局出現 **0 次**（裁定 2＋5 把 x 來源
  換成 tendency 之後幾乎不再回 null）⇒ 零成本的保守處置。
  ⚠ 誠實註記：0 次是「**沒有樣本可驗**」不是「驗過了耦合率 0%」。

### 3. 反事實探針 — 確認失效，且不只裁定書點名的那一處

| patch 目標 | 檔案 | grep 命中 |
|---|---|---|
| `function blockAimX(...opts) {` | `ai.js` | 1 |
| `const x = blockCommitRead(game, atkTeam, opts)?.x ?? null;` | `ai.js` | **0**（段 2 換成 `blockSetterTendency`） |
| 兩處 `blockAimX` 呼叫端 | `ai.js` | 1／1 |
| `  DEPTH_LZ: 2.9,` | `blockRead.js` | **0**（`:142` 現為 `APPROACH.left.lz + 0.1`） |

⇒ `nearest`（裁定書點名）與 `wide`（裁定書未點名）**兩條臂都會炸**。兩條臂的主張本身
也已被卷五實測否決（病灶不在讀取範圍／候選數，`vol5-measurement-delivery.md:125-151`），
故**不予重建**：`installHooks` 開頭直接擋下並說明，本卷的反事實臂改為 `nosalt`。

---

## 二、驗收六條

### 1. 分歧率 — **0.1% → 49.4%**（方向性斷言成立）

口徑沿用簡報：`blockPlan.byPid[pid].x` 是否不同（`tools/block-divergence-probe.mjs` 的
`x相異%`，全部攻擊列）。40 局／臂。

| 臂 | 攻擊數 | jt 相異% | **x 相異%** | \|Δx\| p50/p90/mean |
|---|---|---|---|---|
| 改動前（worktree `215ffe3`） | 1,461 | 8.8 ± 0.87 | **0.1 ± 0.07** | 0.000／0.000／0.003 |
| 改動後 | 1,431 | 7.3 ± 0.81 | **49.4 ± 1.33** | 0.000／5.050／1.625 |
| `nosalt`（只拔掉 pid salt） | 1,461 | 8.8 ± 0.87 | **0.1 ± 0.07** | 0.000／0.000／0.003 |

**新現值＝49.4 ± 1.33%（n=1,431）**，記錄為下一卷的基線。
（簡報前值 0.15%±0.04pp 的 n=11,325 來自更大樣本；本卷前後對照統一用 40 局同一支探針。）

### 2. 難度位移 — 未超出雜訊帶，**不觸發 D1**

`VD_PAIRED` 配對、RUNS=100、同種子 100/100 配對成功：

| 桶 | Δ | 逐條有變 |
|---|---|---|
| group-1／group-2 | +0.0 ± 0.0 | 0/100 |
| group-3 | +3.0 ± 5.0 | 25/100 |
| national-qf | −4.0 ± 4.9 | 24/100 |
| national-sf | −1.0 ± 4.8 | 23/100 |
| national-final | **+9.0 ± 4.9** | 25/100 |
| **Δ奪冠率** | **+2.0 ± 3.8** | 14/100 |

判準用既有 CI 口徑（單桶 ±15pp 熔斷帶、RUNS≥100；40 局 SE≈7pp 會製造假熔斷的教訓見
組合攻擊卷）。最大位移 national-final +9.0pp ＝ **1.84 SE、帶內**；Δ奪冠 0.53 SE。
⚠ 留給 Sawmah 過目：+9.0pp 不是「≤1SE」那種乾淨的零，只是沒有越過既有門檻。

### 3. 款 3 gap — **14.4pp → 13.6pp**，門檻 10，**不觸發 D2**

`tools/t10-4b-alarm-ablation.mjs all 40`（口徑逐行抄自 `block-persona.test.mjs`）：

| | read 離地率 | commit 離地率 | gap |
|---|---|---|---|
| 改動前 | 19.5%（n=307） | 34.0%（n=256） | **+14.4pp** |
| 改動後 | 19.5%（n=307） | 33.2%（n=238） | **+13.6pp** |

read 側逐值未動（read 人格不吃 tendency）；餘裕 4.4pp → 3.6pp。

### 4. 反作弊回歸 — `block-tendency.test.mjs` 5 條全綠

護欄改名＋斷言升級（見 §三）。改名理由已逐字寫進 commit 訊息。

### 5. 遍歷順序護欄 — 新增並已驗鑑別力

`tests/block-tendency.test.mjs`「卷六護欄：打亂攔網手的處理順序，每個人的賭注逐值不變」：
正序／逆序／另一種排序三份結果 `deepEqual`，外加**非空轉檢查**（25 個比分中至少一個
要真的出現分歧，否則一個退化成常數的實作也會通過）。

### 6. 鑑別力 — 拔掉 pid salt，斷言轉紅

- 探針層：`nosalt` 臂的**全部子指標逐值復現改動前**（1461／1461／1058、8.8±0.87、
  0.1±0.07、mean 4.42、0.003）。⇒ 分歧確實由 pid salt 造成；**同時證明其餘改動
  （`resolveX` 管線、`blockerId` 傳遞、入參檢查）行為中性**，行為差異全歸因於 salt 這一項。
- 測試層：把 roll 鍵的 salt 乘 0 實跑，新護欄紅在**行為斷言**
  （「掃過 25 個比分…一次都沒賭到不同的東西」），非旁枝錯誤。

---

## 三、工程清單落地對照

| 裁定書 # | 落地 |
|---|---|
| 1 pid 參數 | `opts.blockerId`（非位置參數）——三支既有探針的既有呼叫零改動仍可跑 |
| 2 roll 鍵 | `+ (blockerId == null ? 0 : idHash(blockerId))`，沿用本檔既有慣例（`ai.js:1123`） |
| 3／4 轉傳 | 走 `opts` ⇒ `blockAimX`／tendency 簽章零改動 |
| 5 兩呼叫端 | `{ ...opts, blockerId: playerId }`（`ai.js` 建計畫處與 chase 處） |
| 6 CARRY x | `blockPlanFor` 內以 `plan.resolveX(pid)` 求值；其餘 8 欄照抄 |
| 7 `newBlockPlan` | 團隊級單一事件**未動**，只多一個 `resolveX` 欄位 |

**明確不碰已核對**：`blockCommitRead` 唯一呼叫點 `ai.js:1869` 逐字未動（`opts` 未被
加寬，blockerId 只在兩處 `blockAimX` 顯式併入）、`REPLANT_JUMP_M`／`REPLANT_TICKS`／
`AIM_CROSSING_MIX`／`OUTER_LAG_MUL`／`DEPTH_LZ` 一格未動。

**人工紀律**：sim-hash `c81955fdea3f6877` → **`cc989aa6ed0eb862`**，基準已重寫。
逐局比對顯示**只有 obsidian 兩局變動**（其餘四隊逐值相同）——obsidian 是唯一 commit 人格，
與「分歧只來自 tendency 路徑」相符。

---

## 四、D5 判準與方向 D 預備件備忘

**D5＝拆牆弱化（雙人牆率崩＋攻方得分率升）：未觸發。** 口徑＝`block-divergence-probe`
的「攔網結果」對照列（40 局／臂）：

| | 上牆均 | 攻方得分率 | 被攔死率 | 救起率 | 前排離地率 |
|---|---|---|---|---|---|
| 改動前（n=1,461） | 2.72 | 63.1% | 0.2% | 35.5% | 78.8% |
| 改動後（n=1,431） | **2.77** | 64.5% | 0.6% | 33.6% | 79.2% |

上牆均**不降反微升**；得分率 +1.4pp 落在 1 SE 內（p≈0.64、n≈1,450 ⇒ 差值 SE≈1.8pp）
＝分不出。**兩條件皆不成立 ⇒ 方向 D 維持預備件，本卷不啟用。**

**方向 D（職責塑形）啟用條件備忘**：未來若量到雙人牆率明顯下滑**且**攻方得分率顯著上升，
才作為第二步「職責調變候選權重」開卷，需新常數、要帶數字回 Sawmah 裁；
本卷未預授權其落地。當時的對照數字即上表（2.77／64.5%／33.6%）。

**極端回退保底**（裁定 3）：revert roll 鍵的 pid salt 一項即可逐值回到改動前——
`nosalt` 臂已實測驗證這條退路成立。
