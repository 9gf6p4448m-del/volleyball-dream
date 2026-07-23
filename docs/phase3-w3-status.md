# Phase 3 W3 — 先發編排 ＋ FIVB 7.7 接線（狀態快照）

> 2026-07-23 執行。基準：W2 結案（190 測）＋ `docs/phase3-w2-status.md`。
> 交付：`save.lineup` 從零讀寫欄位定形為可編排的先發陣容；`careerTeams` 改為
> 依 lineup 建隊、trust 跟人；7.7 驗證器（`isRotationOrderLegal` 預檢）第一次有真實輸入；
> 排陣器 UI（tap-to-swap，手機優先）上線。招募判定（W4）、賽季輪迴（W5）零實作。

## 驗收閘總覽

| 閘 | 結果 |
|----|------|
| 1 決定論零擾動 | ✅ `?quick=1&seed=777&points=5&autopilot=1` 重演 **B 勝 5:3、finalTick 4090**（與 W1/W2 逐位一致） |
| 2 預設路徑等價 | ✅ 三臂 n=300：主臂逐位命中 W2 表（見下表），預設 lineup 建隊 byte-identical |
| 3 sim 純度 | ✅ `src/sim` 僅 game.js 加**純註解**（cancelFaultPoints 接線點，零執行碼）；純度測試綠 |
| 4 測試 | ✅ **215 全綠**（W2 190 ＋ 新增 `tests/lineup.test.mjs` 25，含對抗審查補的 3 防線測試） |
| 5 真機 FPS | ⚠️ 見「FPS」節：桌機代理 164.7fps（渲染迴圈健康）；**真機仍承 W1 待驗** |
| 6 截圖／console | ✅ 桌機＋390×844 無溢出；quick match 與生涯/排陣器 console **零 error/warn** |

## 1. lineup 形狀定案與 schema 驗證範圍

**形狀**（`src/career/lineup.js`）：
```js
lineup = {
  starters: ['A1','A2','A3','A4','A5','A6'], // 6 個場上球員 id 的輪轉序（index 0＝起始 1 號位）
  libero: 'AL',                              // 自由人 member id
  rotationStart: 0,                          // 0-5，該局首發球位（旋轉輪轉序的起點）
  trust: { A1:20, A3:20, A4:20, A5:20, A6:20 }, // 隊友 trust 跟人映射（玩家 A2 不入，見 §2）
}
```
- 場上 6 人＝玩家 A2 ＋ 5 名非自由人隊友（A1/A3/A4/A5/A6）；自由人 AL 為第 7 人（sim `applyLiberoSwaps` 換入）。
- **`null` 只存在於「從未開過生涯」的建檔中間態**（`createSaveV2` 的 `starters:null`）；runtime 建隊路徑只有一條（§4）。

**schema 驗證範圍**（`validateLineup` in lineup.js；`deserializeSave` schema.js 於 `starters!=null` 時呼叫）：
- starters 長度＝6、無重複、每個 id ∈（非自由人隊友 ∪ 玩家 id）
- 自由人不得排入 starters；libero 必為名冊中 role='libero' 的成員
- rotationStart 為 0-5 整數
- `starters=null`（建檔中間態）**放行不驗內容**——與 `player=null` 的容許同義

## 2. trust 跟人映射

- **儲存形狀**：`lineup.trust` ＝ `{ memberId: number }` 映射（取代 W2 的固定槽位陣列
  `BASE_TRUST=[20,60,20,20,20,20]`——後者是 careerState 的**程式常數**，從未進存檔）。
- **玩家 A2 刻意不入映射**：玩家 trust 的唯一權威是 `save.player`（現值 40、地板 0.27，
  隨劇情/成長演變）；把它複製進 trust 映射會造成雙真相。實測補齊後的 `lineup.trust`
  ＝`{A1:20,A3:20,A4:20,A5:20,A6:20}`，`trust.A2===undefined`。
  （偏差：任務書遷移示例列「A2→60」；因玩家 trust 已在 save.player 隨玩家走，故排除 A2
  以杜絕雙真相——見偏差表。）
- **sim 展開方式**（`careerTeams` in careerState.js）：依 `effectiveOrder(starters, rotationStart)`
  逐位建 A 隊；玩家槽取 `player` 物件（trust 從 save.player）、隊友槽 `trust: trustOf(lineup, id)`
  （以 member id 查映射、缺鍵回退 20）。**換位不繼承他人信任**（單元測試：A3 帶 55 換到
  index 0，A1 仍 20、A3 仍 55）。
- **遷移**：無舊資料可遷（trust 從未持久化）；首次 `ensureLineup` 直接以 `defaultLineup`
  落隊友全 20 映射（§4），與 lineup 補齊同一段升級邏輯、冪等。

## 3. FIVB 7.7 兩函式接線位置

- **`isRotationOrderLegal`（本輪啟用，預檢）**：`src/career/lineup.js checkRotationOrder()`
  以實際輪轉序走完整一輪發球、逐棒呼叫驗證發球者依序輪替。接線在**排陣器 UI**
  （`careerScreen.js` 排陣器 `paint()`）即時計算，非法陣容標紅＋理由、`確認出戰` 禁用。
  - 誠實聲明：W3 內發球者由 `match.rotations` 決定論導出＝合法排列恆通過此檢查，
    作用為**結構防護＋給 UI 具體 7.7 理由字串**。真正可被玩家排錯的發球序來源
    （中途換人／輪轉替補產生的「未經預檢發球者」）在 W4 才出現。
- **`cancelFaultPoints`（本輪只接線不啟用）**：呼叫點定死在 `src/sim/game.js performServe`
  的發球合法性段之後（緊接 7.5 POSITIONAL_FAULT 區塊，約 game.js:446）——一段**純註解**，
  零執行碼。註解寫明啟用條件：「當 lineup 發球序來源不再全經排陣預檢時
  （W4 招募後中途換人／輪轉替補）→ 在此偵測違序發 ROTATION_FAULT（帶 faultTick）→
  賽末結算改呼叫 `cancelFaultPoints(state.events, faultTick, faultTeam)` 追溯扣分」。
  不接執行碼的理由：為不存在的觸發源改賽中結算＝拿決定論穩定性換用不到的功能。
- 與 game.js:435-436 既有 7.5 站位判定（`isRotationLegal`）分立、互不干擾。

## 4. null 路徑移除後的升級邏輯位置

- 舊 `careerTeams` 的「按固定槽位 id 對映」分支（`teams.A.map((slot,i)=>...find(slot.id))`）
  **已整段移除**；只留一條「依 lineup 輪轉序展開」路徑（未給 lineup＝取 `defaultLineup`，
  預設序＝舊固定槽位同序 → 逐位等價）。
- 升級邏輯集中在 `src/career/roster.js ensureStarterRoster()` → `ensureLineup()`：
  members 空→補具名 starter；接著 lineup `starters=null`→落 `defaultLineup(members)`
  （含 trust 映射）。**冪等判定**＝`starters!=null` 即原樣不動（玩家編排/前次補齊不被覆蓋）。
  三種狀態（members 空+lineup null／members 滿+lineup null 的 W2 舊檔／玩家已排）
  單元測試皆覆蓋。
- `ensureStarterRoster` 現回傳 `store.loadRoster()`；main.js `onPlay` 另 `store.loadLineup()`
  一併帶進 `runMatch`（careerCtx.lineup → matchConfig → careerMatchSetup）。

## 5. 排陣 UI

- **入口**：生涯畫面「▶ 出戰」下方新增「⚙ 先發編排」（opt-in）。出戰＝直接開賽走已存/
  預設 lineup（**不強制打斷既有流程**）；先發編排＝開排陣 overlay，確認後才開賽。
- **互動**：tap-to-swap（點兩格互換；無既有拖曳基建，tap 換位最貼合現況觸控範式）。
  自由人 W3 唯一 AL、唯讀；rotationStart 6 顆數字鈕；即時合法性（`validateLineup`＋
  `checkRotationOrder`）綠/紅顯示；「重置為預設」「沿用上次」「✓ 確認出戰」（非法時禁用）。
- **樣式**：沿用 careerScreen overlay 範本（`position:fixed;inset:0`、點外側取消、
  `env(safe-area-inset)` 捲動、inline cssText、COLOR 常數、pointerdown 事件）。
- **截圖**：`docs/img/w3-lineup-desktop.png`（桌機 1000×820）、`docs/img/w3-lineup-mobile.png`
  （390×844，card `min(400px,94vw)` 無橫向溢出）。

## 6. 三臂對照（n=300，種子集三臂完全相同；證明預設路徑等價）

新版 `careerTeams`（依 lineup、無 lineup 取 defaultLineup）跑三臂治具，與 W2 表逐項對照：

| 場次 | W3 基準 (VD_NO_ROSTER) | W3 ＋個性化 (VD_NO_GROWTH) | W3 ＋個性化＋成長 (主臂) | 對 W2 |
|------|------|------|------|------|
| group-1 | 90% | 90% | 90% | 逐位相同 |
| group-2 | 86% | 87% | 89% | 逐位相同 |
| group-3 | 67% | 64% | 68% | 逐位相同 |
| national-qf | 53% | 52% | 51% | 逐位相同 |
| national-sf | 52% | 53% | 54% | 逐位相同 |
| national-final | 23% | 24% | 30% | 逐位相同 |
| 奪冠率 | 8% | 7% | 8% | 逐位相同 |

- **三臂全部逐位命中 W2 表**（W2 基準 90/86/67/53/52/23、＋個性化 90/87/64/52/53/24、
  ＋成長 90/89/68/51/54/30；奪冠 8/7/8）——**非僅噪音帶內、而是完全相同**，因新預設 lineup
  路徑建隊與舊固定槽位對映 byte-identical（單元測試逐位證明＋此三臂實跑佐證）。
- 「基準」臂＝`VD_NO_ROSTER=1` 走 `careerTeams` else-branch（舊碼未動）；「＋個性化」臂＝
  `VD_NO_GROWTH=1` 走新 roster 路徑（無成長）；主臂＝完整名冊＋成長。
- 玩家自排陣容的平衡不設閘（拍板：玩家自負）。

## 6b. 對抗式審查（fresh opus，find-the-exploit 框架）

**Verdict: APPROVE 可上線**——零 CRITICAL、零 HIGH。決定論、遷移冪等、trust 語義、
7.7 零執行碼接線全查證忠實（六大攻擊點含「查過，無」逐項確認）。3 個 MEDIUM 皆 W4 潛伏／
層間契約項，其中 2 個已即修：

- **[已修] careerTeams 對 `{starters:null}` 中間態未回退**：schema 說合法、careerTeams 卻
  `effectiveOrder(null)` 崩。改 `(lineup?.starters == null) ? defaultLineup : lineup`
  （careerState.js）＋測試「中間態回退預設不炸」。
- **[已修] 未強制玩家 A2 必在先發**（W4 fieldIds>6 潛伏，會建出無主控的隊）：
  `validateLineup` 增「先發須含主控球員」、`careerTeams` map 後 assert 隊含 player.id
  （lineup.js／careerState.js）＋兩測試。
- **[記錄] trustOf 缺鍵回退 20 遮蔽 W4 漏建**：W3 無觸發（defaultLineup 建滿映射）；
  W4 招募流程須顯式寫入新成員 trust，勿依賴回退（見 §9）。

## 7. 真機 FPS 實測

- **桌機代理**：390×844 視窗、比賽渲染中量 rAF 幀率＝**164.7 fps**（DPR=1）——渲染迴圈遠非
  瓶頸、不鎖幀（sim 固定 60Hz 獨立於幀率）。排陣器對此**零影響**：它是靜態 DOM 遮罩、
  且只在生涯畫面（非比賽中）顯示，與 rAF 迴圈無涉（同 W2 隊友卡）。
- **真機仍待驗**：Playwright 為桌機級環境（DPR=1、桌機 GPU），非真機。真機（行動 GPU、
  DPR 2-3）數值較低——**真機 60fps 承 W1 懸案，仍需 Sawmah 手機實測回報**。

## 8. 對任務書的偏差與歸因

| 偏差 | 歸因 |
|------|------|
| trust 映射排除 A2（任務書遷移示例列 A2→60）| 玩家 trust 已在 save.player 隨玩家走（唯一權威）；複製進映射造成雙真相、且 60 與實際 40 不符。排除 A2 完全實現「star trust 隨玩家走」意圖，行為契約（換位不繼承）不受影響 |
| 排陣器改 opt-in（「先發編排」按鈕），出戰不強制開排陣 | 忠實「不強制打斷既有流程」＋「出戰前排陣步驟」兩句：出戰路徑不動、排陣為 opt-in 入口且持久化。**若 Sawmah 希望出戰即強制排陣，改動極小（把 startMatch 換成 showLineupEditor 攔截）** |
| 互動用 tap-to-swap（非真拖曳）| careerScreen 零既有拖曳基建、全 pointerdown 離散點按；tap 換位最貼現況觸控範式、手機最穩。任務書寫「拖曳**或**點選」，tap 已滿足 |
| height fallback 從 `FALLBACK_HEIGHTS[i]` 改常數 1.85 | 新建隊依 lineup 順序、槽位 index 已非固定，FALLBACK_HEIGHTS[i] 語意失效；名冊成員恆帶 height（buildStarterMembers），fallback 僅防呆、實際不觸發 → 等價 |
| 7.7 預檢在 W3 對合法排列恆真 | 發球者結構上由輪轉序決定論導出，無可錯源；預檢為結構防護＋UI 理由字串，真觸發源 W4 出現（任務書亦如此框定）|

## 9. W4 招募接口現況

- **名冊空位**：`openSlots`＝3（capacity 10 − 現員 7）；W4 招滿一屆。DNA 填寫路徑：
  W4 招募時 member.dna 改填來源隊（teamId=對手 id、style/tag 承 opponents.js），
  屬性生成傾向承其 level+attrBias（W2 已定；本輪未動）。
- **lineup 的 W4 一般化**：`DEFAULT_STARTERS` 現硬編碼 `['A1'..'A6']`（W3 名冊固定）；
  W4 名冊變動後需改為由 members+player 動態建預設序（lineup.js 已註記）。
  `validateLineup` 的合法 id 集已是動態（fieldMemberIds ∪ playerId），無需改。
- **`cancelFaultPoints` 觸發源預期**：W4 招募後的中途換人／輪轉替補會產生「未經排陣預檢
  的發球者」——即 7.7 追溯扣分的真實觸發源。呼叫點已定死在 game.js performServe（§3），
  啟用時在該處偵測違序發 ROTATION_FAULT、賽末結算呼叫 cancelFaultPoints。
- **trust 映射的 W4 演變**：新招球員的 trust 進 `lineup.trust`；`trustOf` 缺鍵回退 20
  為安全預設，W4 招募流程應顯式寫入其初始 trust（勿依賴回退，以免掩蓋漏寫）。

## 結案後補強（同日 07-23，Sawmah 試玩回報＋拍板）

| 項 | commit | 內容 |
|----|--------|------|
| 賽後對話無限重跳 | 59a625e | W1 schema v2 漏存 `career.events`（已播事件清單）→存檔來回蒸發→賽後對話重跳卡死。schema 三處補欄位＋2 回歸測試（217 綠）|
| 新生涯繼承舊名冊成長 | 93f3f21 | 「開始生涯」只覆寫 career/player、舊 roster/lineup 被繼承。改開新檔前 `store.clear()` 全清＋1 回歸測試（218 綠）|
| **5-1 對位強制**（Sawmah 拍板） | 見 git log | 原排陣器任意互換可排出「兩 MB 相鄰」→前排同角色搶同一職責位（dutyPosition 相撞）。新 `checkRoleStructure`（對角三組須 S–OPP/OH–OH/MB–MB 各一）；UI 僅同角色可互換（S↔OPP 例外）、擋下紅字說理由；`ensureLineup` 讀到衝突舊陣→重置預設（保留 trust，不 brick 存檔）；schema 匯入不擋（防壞檔連坐）。實際排陣自由度＝OH 誰前誰後×MB 誰前誰後×S/OPP 對換×起始輪轉——與真實排球 5-1 一致。＋4 測試（**222 綠**）|

## 遺留與下一步

- **待 Sawmah**：試玩驗收排陣器（opt-in 入口是否合意、或改出戰即強制）；W1/W3 真機 FPS 回報。
- 掛 W6：決賽成長效應 +6pp 複核（承 W2）。
- W3 未做（任務書明列）：球員改名（Phase 3 收尾一次性）、招募判定（W4）、賽季輪迴（W5）。
