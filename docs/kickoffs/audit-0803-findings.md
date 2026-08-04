# 08-03 玩家可見層稽核（A/B/E 三路）findings 清冊

> 補記背景：2026-08-03 主 session（`ded7ff45-758a-4123-a918-38a280940297`）跑「玩家可見層稽核」，分五路併行（A 玩家可見層死功能普查／B 恆假不可達判斷式掃描／C 裁定書 vs 實作對帳／D 測試鑑別力普查／E 五位置玩法完整性），但 session 因 claude.exe 記憶體洩漏中途死掉，**findings 清單從未落檔**。本檔是從逐字稿（主 session ＋ subagents/ 各路子逐字稿）事後重建，只收 A／B／E 三路（依收尾任務指示範圍）；C／D 兩路的內容只在必要時引用作背景佐證，不列入本檔正式 findings。
>
> 資料來源：`.claude/projects/C--Users-shung/ded7ff45-758a-4123-a918-38a280940297.jsonl`（主逐字稿）＋ `subagents/agent-a58861a4d854d0c3f.jsonl`（A 主）／`agent-a6dc460df18506afd.jsonl`＋`agent-ab658a709626cff87.jsonl`（A 的兩個子任務，各自完成了完整報告）／`agent-adaa7985a524ea77d.jsonl`（B，唯一產出完整結構化報告的路）／`agent-a4f9c6d459adc80a6.jsonl`（E，session 死前只完成探測，未產出結論）。
>
> **完成狀態總覽**：A 路的兩個子任務（UI 元素死活盤點）**跑完並各自回報了完整報告**，但 A 的主 agent 本身在整合這兩份報告、寫最終收斂結論之前就跟著主 session 一起死了——所以 A 路目前只有「兩份未收斂的原始清冊」，沒有 A 自己講好的「幾項活的/死的/未涵蓋＋優先修三項」格式。B 路是唯一完整跑完全流程（含反事實鑑別力對照臂）並產出結構化最終報告的路。E 路只寫出兩支探針、跑出兩批原始數字，**在產出任何結論之前就死了**——不是「找到 N 項死碼但沒收斂」，是「連死活判定都還沒開始做」。


> ★★ 2026-08-04 覆核更新（主對話逐條重驗）★★
> B 路的「死碼」判定**錯了三組**，共同原因是**用「實跑時沒觸發」推論「結構上是死的」**，
> 沒有分辨那是「上游先篩掉」「刻意出廠關閉」還是「參數讓它暫時恆真」：
>
> | 項 | 稽核判定 | **覆核結論** | 依據 |
> |---|---|---|---|
> | B3–B7 | 9 條結構條件全部恆真或恆假（HIGH） | **不成立**——枚舉 72 組線路：crosses 11真/61假、behind 9真/63假、tandem 四條全部有鑑別力。只有 `outOfReach` 恆真，且是**收斂造成的**（最小兩點距離 0.854m，半寬收斂後 0.5m 才恆真；基準 A 的 1.1m 下它是活的）。實跑 false=0 是因為 `partner` 選擇器在**上游先篩掉**幾何不成立的組合 | 主對話枚舉實測 |
> | B9 | 段 3「外圍時序降級」整段 no-op（MEDIUM） | **不成立**——`OUTER_LAG_MUL: 0` 是 **08-01 已裁定**的出廠關閉（`block-timing-final-status.md` §四.4 明文「留在碼裡但出廠關閉，**不是沒做**」），常數註解亦寫「待 Sawmah 定案」。掃描曲線顯示一開降級交叉 jt% 就掉到 0.00、款3 gap 翻負 ⇒ 關著是對的 | 該卷 §2.3 掃描表 |
> | B11 | `mix > 0` 恆真、fallback 不可達（LOW 死碼） | **半成立**——不可達是**參數所致**（`AIM_CROSSING_MIX` 08-01 定案＝1），調回 0 就復活。真正錯的是**註解**（寫「出廠 MIX=0＝行為不變」）⇒ 已更正 | `ai.js` 註解已修 |
> | B2 | `bs !== 0` 恆假（MEDIUM） | **成立但非缺陷**——讀期的 `anchorX` 恆為 0（設計上「錨在場地中軸」），結構上不可能邊線夾擠 ⇒ 本來就沒事做。已加註說明何時會復活 | `ai.js` 已加註 |
> | B12 | 魚躍放生區（CRITICAL，未修） | **已修**（2026-08-03 收斂殘留清算 #1–#3，`converge-residue-cleanup.md`）。撲空率 27.69%→1.02% | main@f34c546 |
> | A-UI-1 | MB 攔網字卡三句恆假（HIGH） | **已修**（08-03 裁定乙第二步 main@e4ba27e；08-04 再修「只給攔中」的角色限制 main 已推） | — |
> | A-UI-2 | boxScore 缺 OPP 專屬行（HIGH） | **已修**（2026-08-04） | — |
>
> ⇒ 本檔原始 findings 保留於下方供對照，但**上表為準**。
> 教訓：靜態掃描說「這個分支沒被走到」時，必須再問一句「**是誰擋住它的**」——
> 上游篩選、出廠開關、參數恆真，三者的處置完全不同。


---

## 第一部分：結論先行

**已修 3 項（main@74a9fff）／確認未修 11 項（含 1 項 CRITICAL 會讓玩家實際丟分）／存疑（有證據但未收斂或未實跑）約 17 項／判定為非缺陷或設計限定 12 項**。

**除了已知的 3 項，最嚴重的未修項目是 B 路的「魚躍放生區」（B12）**：`src/sim/ai.js:1259-1260` 與 `src/input/matchControls.js:97` 用 `TUNING.REACH_RADIUS`(1.3) 當「站著搆不到才需要撲」的下界，但收斂到 `CONVERGE_T=1` 之後真實站立可及半徑已經變成 `0.38×身高`≈0.65–0.76m。**距離落在 0.68–1.30m 之間的來球：系統判定「不用撲」，但站著又搆不到，直接落地丟分**。實測（B 路探針，24 局）：4.22%±0.58pp 的來球（50/1186）全程沒有任何一 tick 可觸也可撲；另有 6.38% 是「撲了也搆不到」。這條在主 session 死前**已經被使用者本人看到、且已排進「四件現在就修」清單的最後一件**（因為它會動到 AI 對局行為、要先跑量測），但 session 在排定它之前就死了，**目前程式碼裡完全沒有動過**。

第二嚴重的是 A 路發現的兩項死碼：① MB 攔網時機字卡三句（「快攻比你更快」等）恆假死碼（`matchLoop.js:1314-1319`，今天改版留下的殘骸，`s.mbCommit.jumped` 沒有任何寫入點會設真）；② `boxScorePanel` 單場數據面板缺 OPP（舉對）專屬行——`matchLoop.js:1904-1916` 只有 setter/libero/middle 三支 if/else，沒有 opposite 分支，與檔內註解「四位置全數上線」矛盾，玩家轉任 OPP 打完整場永遠看不到任何專屬數據。

**E 路的任務完全沒有完成**——它連「五個位置各自玩起來有沒有東西」這個最基本的判定都還沒開始做，就在建置量測工具的階段跟著主 session 一起死了。它留下的唯一有意義的殘餘是一批未經解讀的原始數字（OPP 要球鈕「⚡跟上」授予後、撐到二傳實際出手前有 55.5% 被覆寫），沒有結論陳述，不能算 finding，只能算「存疑、需要重新派工」。

---

## 第二部分：已修 3 項（main@74a9fff，`git show 74a9fff` 已核對）

| # | 路別 | 問題陳述 | 證據 | 狀態 |
|---|---|---|---|---|
| FIX-1 | B（B8） | `liberoRead.js` 的 `digReadFor` 把 player **物件**傳給吃 pid 的 `spikeBiasOf` ⇒ `scoutTally[物件]` 恆 `undefined` ⇒ 自由人的情蒐線索文字 `markText` 從落地起一次都沒顯示過（同檔 `digSuggestionFor` 傳的是正確 id，建議功能照常運作，只有線索文字全滅——最難察覺的形態） | `src/input/liberoRead.js:61-62`（修前）；B 路探針 `tools/auditB-deadbranch-probe.mjs` 實跑坐實 | **已修（main@74a9fff）**——`liberoRead.js:62` 改傳 `aiState.claimId` |
| FIX-2 | 主 session C 路對帳發現、B 路獨立同址觸及（B 未實跑表 row 9 `callPlay.js:39,118,138`） | `src/sim/ai.js` 的 `applyReplanCall` 把 `mode` 寫死字面量 `'replan'`（死球窗時代殘骸，卷五已把死球窗入口整條拆除）⇒ 面板按鈕文案是「⚡指令」，按下去卻收到「🔄改判」的回饋字卡——同一件事兩種說法 | `src/sim/ai.js:954`（修前，`mode: 'replan'`） | **已修（main@74a9fff）**——改為 `mode: res.mode ?? 'command'` |
| FIX-3 | 主 session C 路對帳發現（教學文案 vs 裁定書對帳） | `career/events.js`（阿哲/阿岩對話）與 `career/growth.js`（技術頁描述）的叫戰術教學仍教「死球的空檔比手勢：交叉、**夾塞**、時間差」，但死球窗入口 08-02 已整條拆除、夾塞出廠關閉（`TANDEM_PLAY_RATE=0`）玩家結構上叫不出來，真正叫得出來的 B快兩處都沒提 | `src/career/events.js:88,94`；`src/career/growth.js:43`（修前） | **已修（main@74a9fff）**——改為「一傳起來、球還在飛的時候……交叉、時間差、B快」 |

---

## 第三部分：確認未修（真的是死碼/bug，需要處理）

### B 路（恆假／不可達判斷式掃描，24 局真實路徑實跑，含反事實鑑別力對照臂）

| # | 檔案:行號 | 問題 | 證據 | 嚴重度 | 狀態 |
|---|---|---|---|---|---|
| B12 | `src/sim/ai.js:1259-1260`＋`src/sim/game.js:953`＋`src/input/matchControls.js:97,58,170-171,373-378` | **魚躍「放生區」**：`dist > TUNING.REACH_RADIUS`(1.3) 當「不用撲」下界，但 `CONVERGE_T=1` 後真實站立可及已是 0.65–0.76m。0.68–1.30m 的來球搆不到也不撲，直接落地 | 9069 tick／1186 顆來球實測：4.22%±0.58pp（50/1186）全程無解落地；另 6.38%（579 tick）「撲了也搆不到」 | **CRITICAL——會讓玩家實際丟分** | **未修** |
| B2 | `src/sim/ai.js:1391` | `bs !== 0`（`bs = Math.sign(anchorX)`），該分支內 `anchorX = planX ?? 0` 恆為字面常數 0，`Math.sign(0)===0` 恆假 | 恆假（構造性）；外層分支活著（前排攔網讀期佔 56.97% tick） | MEDIUM（分支活但內層死路） | 未修 |
| B3–B7 | `src/sim/approach.js:616-617,621,623-624,670-673,696-697,726` | 組合攻擊 cross/tandem/delay 判定式的比較量全是編譯期常數（輸入只有 kind 字串，kind 由常數表鎖死）⇒ 9 條結構條件全部恆真或恆假 | 分別被求值 179–1783 次，false/true 恆定為 0（B3 312 次 false=0／B4 179 次 false=0／B5 179 次 false=0／B6 491 次 false=0／B7 1783 真/0假） | HIGH（玩家可見後果：`callPlay.js:89-103` 為這 9 條各寫的失敗文案「兩條線沒有交會」「前後疊得不夠深」等，在任何一局都印不出來） | 未修 |
| B9 | `src/input/blockRead.js:162→229,261-263` | `OUTER_LAG_MUL: 0` ⇒ `outerLag` 恆 0 ⇒ `laggedZView` 第一行早退，`OUTER_LZ`/`OUTER_LX` 兩條判準對輸出零影響 | `if (!view) continue` 恆假 | MEDIUM（段 3「外圍時序降級」整段 no-op） | 未修 |
| B11 | `src/sim/ai.js:1678,1686` | `if (mix > 0)`，`mix = BLOCK_COMMIT.AIM_CROSSING_MIX` 實測值為 1（非註解宣稱的 0）⇒ `mix > 0` 恆真 ⇒ `:1686` fallback `return` 不可達，`ai.js:1673` 註解已過期 | 實測 mix=1 | LOW（純技術債，不影響玩家可見行為，但註解會誤導後續維護者） | 未修 |

### A 路（玩家可見層死活盤點，兩支子任務各自完成、母任務未收尾）

| # | 檔案:行號 | 問題 | 證據 | 嚴重度 | 狀態 |
|---|---|---|---|---|---|
| A-UI-1 | `src/app/matchLoop.js:1314-1319`（顯示端）＋`:983`（賦值端） | MB 攔網時機字卡三句「快攻比你更快——再搶半拍」／「早了——是高球，等它下來」／「時機對了——線差一點！」，觸發條件 `s.mbCommit?.jumped` 為真，但 `s.mbCommit` 只在 `zonePanel.js` 的 MB 面板回呼裡被賦值一次、值寫死 `{jumped:false,...}`。全 repo 搜尋 `mbCommit` 沒有任何地方把 `jumped` 設 `true` | 靜態掃描確認（今天「起跳交回自動跳攔」改版留下的殘骸——賦值端已改，判斷分支沒跟著拔） | HIGH | 未修 |
| A-UI-2 | `src/app/matchLoop.js:1904-1916`（`buildBoxPanelData`） | `boxScorePanel` 單場數據面板的位置差異欄位只有 `if(setter)/else if(libero)/else if(middle)` 三支，**沒有 opposite 分支**，與檔內註解「Q9：四位置全數上線」矛盾。玩家轉任 OPP（`positionFlags.js` 已宣告 OPP 為 `ENGINEERED_OPEN` 四位置之一）打完整場，永遠看不到任何 OPP 專屬數據行 | 靜態掃描確認（三支 if/else 窮舉，缺第四支） | HIGH | 未修 |

**小計：確認未修 9 項（B 路 6 項＋A 路 2 項，B3-B7 併計為一組共 5 條規則但列 5 行）**——若逐條計數 B3/B4/B5/B6/B7 各算一項，總計 **11 項**（B2,B3,B4,B5,B6,B7,B9,B11,B12 ＝ 9 項＋A-UI-1,A-UI-2 ＝ 2 項）。

---

## 第四部分：存疑（有跡象但未實跑、未收斂，或探針已跑出數字但沒人寫結論）

### B 路自報「疑似，未實跑」（12 項，B 路自己列的，未跑真實路徑驗證）

| 檔案:行號 | 判斷式 | 推導 | 狀態 |
|---|---|---|---|
| `matchControls.js:97` | `hypot(L−actor) > TUNING.REACH_RADIUS` | 玩家版的 B12：同一族「舊基底」問題，`render/reachAssist.js:117` 已改吃新值，輸入層漏了 | 證據不足（未實跑，但與 B12 CRITICAL 同根因，建議與 B12 一併處理） |
| `matchControls.js:58,420-421,458-459` | `AUTO_RECEIVE_DIST`／魚躍上下界 | 同上舊基底族，寬 52%／1.07m | 證據不足 |
| `matchControls.js:170-171` | `near = dist <= REACH_RADIUS*1.1` | 配 36-tick 緩衝，「觸球確實發生」條件下近乎恆真 ⇒ Perfect 一傳手動門檻可能塌陷 | 證據不足 |
| `matchControls.js:373-378` | `airborneMs > JUMP_WINDOW_MS(900)` | `releaseCharge` 路徑上限≈600ms < 900 ⇒ 該路徑恆假 | 證據不足 |
| `blockRead.js:212-220,276-281` | `abs(lean) >= LEAN_M(0.35)` | 二傳未插上時 lean 恆 1.8 ⇒ tie-break 恆偏右側 | 證據不足 |
| `matchControls.js:29,56` | `abs(actor.z) < NEAR_NET_Z(2.2)` | 對方持球時自動帶位關閉 ⇒ 不主動推進的玩家攔網面板＋自動跳攔一起不開 | 證據不足 |
| `attackZones.js:19-21,51` | 面板把全體前排當牆 | sim 只認 `blockUntil`+`airT` 條件 ⇒ 面板系統性高報「被封」 | 證據不足 |
| `setOptions.js:84` | `kind==='quick' && trust<…` | 卷五後 MB 可能是 `'bquick'` ⇒ 低信任 B 快永不顯示猶豫標 | 證據不足 |
| `callPlay.js:39,118,138` | `CALL_MODES.replan` | `resolveCalledPlay` 的 mode 現為無條件字面量 `'command'` ⇒ replan 分支無取用路徑（與 FIX-2 相關但不同：FIX-2 修的是 `ai.js` 呼叫端亂寫死值，這條是解析器本身 replan 分支現在變成死碼，不影響玩家但是技術債） | 證據不足 |
| `blockRead.js:44-51` | `ENTER:0.45`／`MIN_M:0.15` | 註解宣稱 half≈0.70m，實算≈0.565 ⇒ 實際門檻比宣稱小 21% | 證據不足 |
| `approach.js:713-715` | `d < best.d - 1e-12` | 同 kind 候選 d 逐值相同 ⇒ 恆假，僅 pid 字典序活著（目前無害，每隊至多一名 quick） | 證據不足（自報「目前無害」） |
| `approach.js:960-962` | `pt.kind !== combo.partnerKind` | `combo.partnerKind` 恆等於 `partner.kind` ⇒ 恆假 ⇒ `applyComboRoutes` 永遠只動一人、delay 型零人 | 證據不足 |

### A 路兩份子報告裡標記「可疑但未實測驗證」的項目

| 檔案:行號 | 問題 | 狀態 |
|---|---|---|
| `src/ui/callButton.js`＋`matchLoop.js:1253-1261` | 「⚡跟上！」浮鈕僅在受控者是 Opposite＋後排＋隊友一傳觸球時彈出，且每 flight 只給 0.8 秒窗——A 路判定「符合玩家反饋『按鈕純損』的樣態」但未實測出現率 | 存疑，**E 路有相關原始數據**（見下）但未整合成結論 |
| `src/ui/routeCue.js` | 「S 要你跑 X」橫幅今天（08-03）剛改完，`SHOW_LEAD_TICKS=90` 作者自陳「暫定值……沒有量過」，顯示條件疊三層 AND，視窗可能窄到玩家看不到 | 存疑，未實測 |
| `src/ui/setOverOverlay.js:17,28`＋`matchLoop.js:608,1794` | 生涯模式下「點擊任意處返回生涯」hint 顯示後立即被 `boxScorePanel` 蓋掉，A 路懷疑「玩家幾乎來不及讀到就跳轉」 | 存疑，未實測 |
| `src/ui/diegeticItems.js:55-75` `createLatencyStats().summary()` | repo 內找不到任何呼叫端（`push` 有用，`summary` 沒人叫）——非玩家可見 UI 死碼，但是「算了沒人看」的孤兒方法 | 存疑（非 UI 死碼，屬技術債） |

### E 路（五位置玩法完整性）——**任務未完成，僅有原始探針數字，無結論**

E 路的主 agent 在寫出兩支探針（`auditE-census.mjs`／`auditE-consequence.mjs`）、各跑過幾批數字之後，session 就跟著主線一起死了，**從未產出「S/OH/MB/OPP/L 五個位置各自玩起來有沒有東西」的判定**。以下是它跑出但沒有寫結論的原始數字，**不構成 finding，只能列為需要重新派工調查的線索**：

| 探針/數字 | 內容 | 狀態 |
|---|---|---|
| `auditE-consequence.mjs`，role=opposite，20 局×2 臂 | OPP 要球鈕「⚡跟上」授予（`arm=tap`）164 次；**授予後撐到二傳實際出手時，仍是原受控者的只剩 73 次，已被覆寫 91 次（覆寫率 55.5%）** | 存疑——原始數字存在但無解讀。若覆寫率確實過半，會強化 A 路對 callButton「按鈕純損」的懷疑（按了但常常沒真的換人打），但這需要另一輪調查判斷「覆寫」本身是否為預期行為（例如二傳本就有權依戰況改判） |
| `auditE-census.mjs`，被動（不移動）合成玩家 | 用不主動走位的合成玩家跑 census，`setter posHist {"1":8385}`（全程停在 1 號位未動）⇒ `oppPossTicks` 中 `ofWhichFront=0` | **方法論觀察，非遊戲缺陷**——E 路自己在 session 死前判斷這是探針本身的問題（被動玩家不會走到網前，需要「active player」移動臂），而非遊戲的死功能。若要重跑 E 路，第一步就是先修好這個移動臂，否則所有「前排限定」的功能都會被探針誤判成死的 |
| 五個位置的死活判定表 | （原任務要求的核心產出） | **完全沒有**——E 路連第一個位置都沒查完就死了 |

---

## 第五部分：判定為非缺陷／設計限定（記錄備查，不需修）

以下項目經稽核路自行判定為「正常防呆」「模式限定」「劇情深度限定」，不算死碼，但收錄以防日後重複稽核：

- **B1**（`ai.js:2127` yNet clearance）：恆真但反事實門檻測試證實掃描本身有能力回報「擋下」，現值 0 只是門檻低於實際最小值所致，非死碼。
- **B10**（`approach.js:945`／`TANDEM_PLAY_RATE=0`）：已宣告的出廠關閉（裁定乙/丙），非缺陷。
- A 路：`scoreboard.js` 的 `hintFor` 八句 classic 專屬提示字、`actionButtons.js` 整支檔——僅 `?classic=1` 才會建構/顯示，預設 `simpleMode` 恆不可達，屬模式限定非死碼。
- A 路：`subPanel.js` 體力條、`setBreakOverlay.js` 整支檔——分別依賴 `game.stamina` 開關與 `bestOf>1`（多局系列賽），快速比賽玩家看不到屬模式限定。
- A 路：`replayVault.js` 典藏牆——需第 3 屆終點且（奪冠或止步全國賽）且（拿過冠軍點或戰過天鷹隊）三重 AND，視窗極窄但非死碼。
- A 路：`chaseDiagram.js` 三種 variant——資料源綁死第二代（N2）特定劇情事件，正常設計非死碼。
- A 路：`tutorial.js` 整張教學卡——`localStorage['vd-tutorial-v10']` 只顯示一次，若測試機此前已顯示過就看不到，屬設計如此但值得排查當次測試環境。
- A 路：`careerScreen.js` 舊存檔遷移訊息（`wasLegacyReset`）、空槽二次確認——均為明確防禦性程式碼，正常路徑很難觸發。
- A 路：`graduationRitual.js` 空防呆（`perGraduate.length===0` 直接 skip）——第 1→2 屆換屆通常無人畢業，正常路徑。

---

## 第六部分：結論

**已修 3 項／確認未修 11 項（其中 1 項 CRITICAL：魚躍放生區會讓玩家實際丟分）／存疑 17 項（12 項 B 路未實跑＋3 項 A 路未實測＋2 項 E 路原始數據無結論）／判定為非缺陷或設計限定 12 項**。

E 路（五位置玩法完整性）**沒有完成任何一個位置的判定**，是這輪稽核唯一交白卷的一路——若要真的回答「S/OH/MB/OPP/L 玩起來有沒有東西」，需要重新派工，且第一步要先修好它自己那支探針的「被動玩家不會走位」方法論缺陷。
