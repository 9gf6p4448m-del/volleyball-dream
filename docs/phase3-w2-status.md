# Phase 3 W2 — 名冊系統（狀態快照）

> 2026-07-23 執行。基準：W1 結案 commit e4f3281。
> 交付：`save.roster` 從空殼填成具名、個性化、自動成長、帶 DNA 的活名冊＋唯讀隊友卡。
> 招募判定（W4）、先發編排（W3）、賽季輪迴（W5）零實作。

## 名冊實況（具名化後）

成員形狀＝`{ id, name, origin, role, attributes, growth, dna }`＋補充欄位
`height`（建隊用）、`captain`（隊長標記）、`persona`（隊友卡一句話）。
玩家不進 `members`（本體在 `save.player`），capacity 計數時佔 1 席（D1）。

| id | 名字 | 位置 | 年級 | 身高 | jump | power | react | stam | speed | ctrl | serve | block | 總和 |
|----|------|-----|------|------|------|-------|-------|------|-------|------|-------|-------|------|
| A1 | 阿哲 | S | 二 | 1.83 | 58 | 58 | 63 | 61 | 63 | **72** | 61 | 54 | 490 |
| A2 | （玩家） | OH | — | 1.88 | 60 | 62 | 60 | 60 | 62 | 68 | 60 | 58 | 490 |
| A3 | 大山（隊長）| MB | 三 | 1.96 | 64 | 63 | 59 | 60 | 58 | 64 | 56 | **66** | 490 |
| A4 | 阿烈 | OPP | 二 | 1.90 | 62 | **67** | 58 | 61 | 60 | 63 | **64** | 55 | 490 |
| A5 | 小飛 | OH | 一 | 1.86 | 62 | 60 | 63 | 62 | **66** | 65 | 59 | 53 | 490 |
| A6 | 阿岩 | MB | 二 | 1.94 | 62 | 61 | 60 | **63** | 57 | 65 | 57 | **65** | 490 |
| AL | 小守 | L | 一 | 1.72 | 40 | 40 | 74 | 70 | 72 | 72 | 30 | 30 |（buildLibero 公式）|

- **名字全屬預設稿**（D3）：任務書寫「W1 執行端已備的名單草稿」——**repo 內不存在
  此草稿**（全 repo 搜尋確認），本輪新擬；Sawmah 試玩時逐個改名即可（改名寫回
  member.name，`ensureStarterRoster` 不會蓋掉）。小守沿用既定名、隊長＝MB 大山
  （對齊 events.js「隊長（MB）」speaker）。
- 個性化守則：每人八屬性總和守恆＝490（舊全同基準），只重分配不淨增；身高
  `[1.83,1.88,1.96,1.90,1.86,1.94]`、trust 槽位 `[20,60,20,20,20,20]`、小守
  buildLibero 公式全部不動。
- **DNA**（任務 2）：`{ teamId, style, tag }`——starter 全員 `{teamId:'A',
  style:'balanced', tag:'創隊班底'}`（A 隊基準風格）。W4 招募時改填來源隊：
  teamId=對手 id、style/tag 承 opponents.js 的 style/name、屬性生成傾向承其
  level+attrBias。純描述性標記：只影響屬性生成與 UI，比賽行為一律走
  member.attributes → createPlayer 既有參數路徑（決定論不經 DNA）。

## 成長模型（D2 落地參數）

- 管線：`settleCareerMatch`（賽末一次）→ 逐成員 `matchStatsFor(events, memberId,
  myTeam)`（與主角同一套歸因）→ xp → 屬性。決定論（純算術零隨機）；依 matchId
  冪等（log 有該場即跳過）。
- 表現→xp 歸因表（`roster.js XP_RULES`）：

| 表現 | 得 xp |
|------|-------|
| 殺球/吊球得分（atk）| power ×1.0、jump ×0.5 |
| ACE | serve ×1.5 |
| 攔網得分 | block ×1.5、jump ×0.5 |
| Perfect 一傳 | reaction ×0.75、speed ×0.5 |

- 成長率分檔（新人快老將慢）：一年級 ×1.0（小飛/小守）、二年級 ×0.7（阿哲/阿烈/
  阿岩）、三年級 ×0.4（大山）。
- 兌換：每 2 xp 兌 +1 屬性（餘數留存跨場）；**上限 85**（低於主角 90 的護欄），
  封頂後該屬性 xp 歸零。只長 GROWABLE_ATTRS 六項（control/stamina 不開放，同主角）。
- 量級實感（治具 300 次觀測）：隊友一季 6 場合計約 +2~+6 點，集中在有球權的
  攻擊手；小守幾乎只從 Perfect 一傳長 reaction/speed——符合「打得好才長」。

## capacity 語義（D1）

`capacity:10` ＝ 玩家 1＋小守 1＋隊友 8。現員 `rosterCount()`＝members 6＋玩家 1
＝**7**，`openSlots()`＝**3**（對應 W5 新增 2-3 隊、W4 一屆招滿）。UI 名冊列顯示
「7/10・招募空位 3」。

## 平衡驗收（本輪最硬的閘）

### 過程紀錄：v1 個性化退回

第一版偏移 ±8~16（總和守恆）→ n=100 實測 group-1 **86%→97%（+11pp）**、
final 23→31——**違反「首場近中性」退回**。歸因：sim 屬性槓桿非線性——點數被搬進
高槓桿位（二傳 control +8 全隊受益、雙 MB block +14/+16 直接產分），搬出的是
低槓桿位（MB 的 speed/serve）；「總和守恆」不等於「強度守恆」。v2 偏移全面減半
（±1~8）。另發現 n=100 的 SE≈4pp，訊號被噪音蓋過（v2 在 n=100 曾出現 final
+10 而 qf −6 的紊亂讀數），故裁決一律改用 n=300 三臂同種子對照。

### 三臂對照（n=300，種子集三臂完全相同；SE≈1.7~2.9pp）

| 場次 | 基準（無名冊）| ＋個性化 | ＋個性化＋成長 | 個性化效應 | 成長效應 |
|------|------|------|------|------|------|
| group-1 | 90% | 90% | 90% | **±0** | ±0（首場無成長，sanity ✓）|
| group-2 | 86% | 87% | 89% | +1 | +2 |
| group-3 | 67% | 64% | 68% | −3 | +4 |
| national-qf | 53% | 52% | 51% | −1 | −1 |
| national-sf | 52% | 53% | 54% | +1 | +1 |
| national-final | 23% | 24% | **30%** | +1 | **+6** |
| 奪冠率 | 8% | 7% | 8% | −1 | +1 |

（治具新增隔離開關：`VD_NO_ROSTER=1`＝無名冊基準、`VD_NO_GROWTH=1`＝個性化
無成長；W6 終調可直接複用。）

### 閘門裁決

1. **首場近中性 ✓**：Δ0pp（整條個性化效應曲線 −3~+1，全在噪音帶內）。
2. **後段小幅上移 ✓**：成長效應 group-2/3 ＋2~+4。
3. **決賽不暴衝 ✓（帶註記）**：final 24→30 全部來自隊友成長（個性化貢獻 +1）；
   奪冠率 8% 持平、魔王定位保持（唯一 <50% 場次、平均分差仍 −2.6）。**+6pp 為
   本輪最大偏移，如實掛給 W6 決賽終調複核**——若真人數據顯示決賽變軟，第一顆
   調參旋鈕是成長率分檔或天鷹 level。
4. **基準勘誤**：07-23 記錄的 n=100 基準（86/88/67/53/52/23）自帶 ±4pp 噪音——
   同一份無名冊程式在 n=300 讀 90/86/67/53/52/23（group-1 差 4pp 純屬抽樣）。
   本表對照以三臂同種子 n=300 為準，後續基準請沿用 n≥300。

## 唯讀隊友卡（任務 5）

- 生涯畫面新增「名冊」區（成長區下方）：抬頭「名冊 7/10・招募空位 3」＋六列
  成員（名字/隊長徽/位置縮寫/年級），點列開卡。
- 卡片（全螢幕遮罩、點外側或「關閉」收起、**零寫入互動**）：
  名字＋隊長徽＋`MB・三年級・1.96m` → persona 一句話 → `DNA｜創隊班底（balanced）`
  → 八屬性橫條（可成長六項帶 **85 上限刻度**；成長量以**金色段**疊在條尾、
  數值顯示「64（+1）」；control/stamina 灰顯）→ 成長歷程逐場列
  「對北原工商：力量+1」（無成長場次不列；全空顯示「尚未成長——上場的表現會化為成長」）。
- 截圖：`docs/img/w2-roster-list.png`（名冊區）、`w2-card-captain.png`（隊長卡）、
  `w2-card-growth.png`（成長態卡）、`w2-card-mobile.png`（390×844 手機版面，無溢出）。
- 手機 60FPS 不受影響：卡片是靜態 DOM 遮罩，與 rAF 渲染迴圈無涉；console 零錯。

## 空名冊升級路徑（任務 4）

`ensureStarterRoster(store)`（roster.js）：members 空→一次性補齊具名 starter 並
落檔；非空→原樣返回（改名/成長不被蓋掉）；無存檔→null 不落檔。呼叫點＝生涯畫面
渲染（rosterSection）與出戰（main.js onPlay）。瀏覽器實測：W1 空名冊存檔重載後
members 0→6，season.seed 與 player 逐位不動。

## 驗收證據

- **190 測全綠**（W1 結案 173＋17 新增 `tests/roster.test.mjs`：具名化/個性化
  守恆/capacity/補齊冪等/成長歸因/分檔/決定論/冪等/上限 85/建隊接線/小守結構/
  schema 驗證/store RMW）。
- 瀏覽器實測（vite preview＋SW 清除）：新生涯自動建冊 → 出戰後場上 A 隊全員
  帶名冊姓名與個性化屬性（`__phase1.game` 逐員核對）→ 隊友卡桌機/手機渲染 →
  console 零 error/warn。
- **快速比賽決定論零擾動**：`?quick=1&seed=777&points=5&autopilot=1` 重演
  B 勝 5:3、finalTick 4090——與 W1 拆分驗證基準逐位一致（快速路徑不吃名冊，
  維持預設隊 A隊1號/ctrl68）。
- sim 純度：`src/sim` 零改動（名冊全在 career/app/ui 層；決定論與純度測試照綠）。

## 對任務書的偏差與歸因

| 偏差 | 歸因 |
|------|------|
| 名單草稿不存在，本輪新擬 | 任務書假定 W1 已備草稿；repo 全搜無此檔。D3 明言名字非最終稿，不擋工 |
| v1 個性化（±8~16）退回改 ±1~8 | 首場 +11pp 違反近中性閘；屬性槓桿非線性，見平衡節 |
| 07-23 基準勘誤（n=100 噪音 ±4pp）| 三臂 n=300 同種子重測；不是行為變更 |
| `tests/schema-v2.test.mjs` RMW fixture 更新 | 舊 fixture 的 3 欄假成員在成員驗證定實後不再是合法存檔；測試意圖（RMW 不蓋鍵）不變 |
| 成員形狀補 height/captain/persona 三欄 | 建隊需身高、D3 需隊長標記、隊友卡需一句話人設；schema 註解已同步 |
| 治具加 VD_NO_ROSTER/VD_NO_GROWTH 開關 | 平衡歸因需隔離臂；W6 可複用 |

## W3 先發編排接口現況

- **lineup 欄位實際形狀**（`src/career/schema.js:28`）：
  `lineup: { starters: null, libero: null, rotationStart: 0 }`。現況：schema 驗證
  只查頂層鍵存在、careerStore RMW 保證不被蓋掉；**runtime 零讀寫者**。W3 寫入
  約定：`starters`＝6 個成員 id 的輪轉序陣列（null＝沿用預設陣容）、`libero`＝
  自由人成員 id、`rotationStart`＝0-5。
- **7.7 驗證器接線點**：`src/sim/rotationRules.js:97
  isRotationOrderLegal(server, rotationOrder, servedCount)` 與 `:104
  cancelFaultPoints(events, faultTick, faultTeam)` ——**已實作、已有測試、
  現在就可呼叫；src 內零呼叫端**（7.5 站位判定 isRotationLegal 已接在
  game.js:435-436 performServe，兩者分立）。缺的接線：① 輪轉序來源——現行
  serverId 由 teams 陣列順序導出（結構上不可能輪轉錯誤），W3 手動排陣後
  `lineup.starters` 才成為可錯的輸入，需在排陣確認時（或 performServe 側）用
  isRotationOrderLegal 驗證；② cancelFaultPoints 的追溯扣分要接進賽中結算或
  排陣器的預檢提示；③ 排陣 UI 本體。
- **名冊讀取 API（W3 排陣資料源）**：`store.loadRoster()`（careerStore.js）→
  `{capacity, members}`；出戰/渲染路徑一律先 `ensureStarterRoster(store)`
  （roster.js）保證已補齊。場上 7 人池＝`members`（A1/A3-A6＋AL 小守）＋
  `save.player`（A2）。**W3 要動的點**：`careerState.js careerTeams` 目前按
  固定槽位 id 對映（A1→槽0…），W3 改為依 `lineup.starters` 順序建 `teams.A`
  （trust 槽位值跟槽還是跟人，屆時一併拍板）；自由人替換已由 sim
  applyLiberoSwaps 處理，W3 只需把 `lineup.libero` 接進 careerMatchSetup。

## commit 對照

| 內容 | commit |
|------|--------|
| 名冊系統五任務＋測試＋治具三臂開關 | 見 git log（feat: Phase 3 W2）|
| 本狀態文件＋截圖 | 同上（docs） |

## 遺留與下一步

- **待 Sawmah**：試玩驗收（改名請直接講，逐個換 member.name）；W1 真機 FPS
  回報仍懸；W3（先發編排＋7.7）開工指示。
- 掛 W6：決賽成長效應 +6pp 複核（旋鈕：成長率分檔／天鷹 level）。
- 已知邊界：balance-sim 的 A2 是 AI 代打基準，真人讀攔網/假動作會整條上移——
  本表只用於前後對照，不是絕對難度聲明。
