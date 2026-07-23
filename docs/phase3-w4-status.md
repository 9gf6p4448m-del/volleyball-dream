# Phase 3 W4 — 招募判定（狀態快照）

> 2026-07-23 執行。基準：W3 結案（222 測）＋ `docs/phase3-w3-status.md`。
> 任務書：`docs/kickoffs/phase3-w4prompt`（拍板優先於 phase3-kickoff／w4-discussion 的待定欄）。
> 交付：招募條件判定與跨賽季進度、招牌球員 DNA 生成與入隊流程（含賽後儀式）、
> 排陣器板凳層＋`DEFAULT_STARTERS` 動態化、招募臂平衡數據。
> 賽中換人／賽季輪迴／平衡調整＝明確不做（W5/W6）。

## 驗收閘總覽

| 閘 | 結果 |
|----|------|
| 1 決定論 | ✅ `?quick=1&seed=777&points=5&autopilot=1` 重演 **B 勝 5:3、finalTick 4090**（Playwright 實測，與 W1/W2/W3 逐位一致） |
| 2 預設路徑等價 | ✅ 三臂 n=300 逐位命中 W3 表（見 §5）；未招募存檔行為零變化 |
| 3 sim 純度 | ✅ `src/sim` **零改動**（本輪 git diff 無任何 sim 檔）；純度測試綠 |
| 4 測試 | ✅ **245 全綠**（W3 222 ＋ 新增 `tests/recruitment.test.mjs` 23） |
| 5 招募臂 | ✅ `VD_FULL_ROSTER=1` n=300 完成（見 §5；只採數據不設門檻，調整留 W6） |
| 6 截圖／console | ✅ 桌機＋390×844（排陣器含板凳）無橫向溢出（scrollWidth=390 實測）；決定論跑局＋生涯＋排陣＋儀式全程 console **0 error/0 warn** |
| 7 存檔相容 | ✅ W3 存檔（recruitment 空殼）升級冪等（單元測試＋實 UI 注入驗證，不 brick） |

## 1. 條件定義位置與理由

**集中表 `RECRUIT_CONDS` 掛在 `src/career/recruitment.js`**（任務書給的兩案擇一）。
理由：條件引用的全是生涯層概念（壯舉事件掃描器、賽程 stage id、名冊空位），
`opponents.js` 維持「純 sim 參數檔」單一職責——對手數值（level/attrBias/heights/style）
仍由它供給，recruitment.js 只引用不重複。

| opponentId | 招牌 role | wins | feat（事件層定義） | stage |
|---|---|---|---|---|
| north-tech | S（阿澄） | 3 | — | — |
| white-wave | L（小浪） | 2 | digMatch：單場 dig ≥3 ＝1 場達標，×3 場 | — |
| obsidian | MB（阿曜） | 2 | blockKill：攔網得分 ×5 | — |
| iron-mist | OPP（阿鐵） | 2 | strongReceive：敵發第一觸品質 ≥0.8 ×8 | — |
| sky-hawk | OH（阿鷹） | 1 | — | national-final |

- **壯舉統計全部從賽末 `state.events` 掃描**（TOUCH kind/power、BLOCK_TOUCH、SCORE、
  SERVE 既有事件語彙）；**sim 執行碼零改動、零新事件型別**。替代定義的歸因見 §6 偏差表。
- 名字/persona 為預設稿（命名工程 Phase 3 收尾統一做，與 STARTER_DEFS 同約定）。

## 2. 進度資料層與判定時機

- `save.recruitment = { progress: { [oppId]: {wins, feat, stageCleared} }, recruited: [oppId] }`
  ——形狀與任務書 §1 完全一致，**未加任何欄位**（儀式一次性不靠 pending 欄，見 §3）。
- **賽末累加**：`settleCareerMatch`（matchCareer.js）末段呼叫 `accrueRecruitProgress`。
  重入防線：以 `store.loadCareer()` 現況查本場是否已入 results——recordResult 冪等擋不住
  「progress 累加器」的重複累加，故在寫入前判斷（單元測試覆蓋重入）。
- 跨賽季累積、永不重置：progress 只增不清；「開新生涯」的 `store.clear()` 是唯一歸零路
  （既有語意，非本輪新增）。

## 3. 入隊流程

- **時點**：返回生涯畫面時（`renderCareer` → `settleRecruitJoins`）檢查「條件達成＋未入隊
  ＋有空位」→ 入隊 → 彈儀式（開箱級：來源隊/名字/位置/屬性亮相/DNA/trust 說明）。
- **原子性**：`careerStore.applyRecruit` **單次 RMW 寫三處**（roster.members push、
  `lineup.trust[id]=10` 顯式寫入、recruited push）——不留「入了名冊沒記 recruited」中間態。
- **trust 初值 10 顯式寫入**（W3 §6b MEDIUM 記錄項的正面回應）：單元測試用
  `Object.hasOwn(lineup.trust,'R1')` 驗非回退；真 UI 注入實測 `trust.R2===10`。
- **成員形狀**：`{id:'R1..', name, origin:對手id, role, attributes, growth:{grade:2,...},
  dna:{teamId,style,tag}, height, persona}`；屬性=來源隊 `level+attrBias+roleBias[role]`
  ＋每屬性 −2..+2 決定論抖動（FNV-1a hash(careerSeed, `${oppId}:${attr}`)），夾限 [30,85]；
  自由人以 buildLibero 防守專才公式為基底再抖動。同種子重演逐值一致（單元測試）。
- **無空位**：不入隊、條件保持已達成、progress 不清；招募區紅字「⚠ 名冊已滿」。
- **id**：`R{既有 R 成員數+1}`——同存檔重演入隊順序一致故 id 一致。

## 4. 排陣器一般化

- **動態預設序** `defaultStarters(members, playerId)`（lineup.js）：5-1 槽位樣式
  [S,OH,MB,OPP,OH,MB] 從玩家＋名冊建隊，候選佇列＝玩家（自己角色首位）＋名冊原序——
  7 人創隊名冊產出**逐位等於**舊硬編碼 `['A1','A2','A3','A4','A5','A6']`（單元測試＋三臂
  佐證）；招募後預設仍是創隊六人（轉學生上場是玩家決定）。`DEFAULT_STARTERS` 常數保留
  作測試對照。
- **板凳區**：先發 6 格下方列出未上場的場上球員（轉學生帶「轉」徽）；tap 板凳＋tap 先發
  格＝替換上場，沿用 W3 tap-to-swap 語彙（無新互動範式）。守門：主控（玩家）不可下場、
  跨角色替換紅字擋（S↔OPP 例外同 W3）；`checkRoleStructure`＋`checkRotationOrder` 即時
  驗證照舊。Playwright 實測：跨角色紅字、同角色替換成功、合法綠字。
- **雙自由人**：名冊 ≥2 名 libero 時自由人格變為 tap 輪替（W3「唯一 AL、唯讀」解除）；
  `careerMatchSetup` 既有的 `lineup.libero` 查找路徑無需改。
- **重置為預設**：只還原排序/自由人/輪轉，**trust 映射保留**——W4 起 trust 有真實差異
  （新人 10 vs 老班底 20），重置排陣不得洗掉信任（W3 行為是整包重置，當時全 20 無差異）。
- `validateLineup` 合法 id 集本就動態（W3 已備）——零改動。

## 5. 平衡數據（n=300，種子集四臂完全相同）

| 場次 | 基準 | ＋個性化 | 主臂 | **招募臂**（滿名冊） | 對 W3 三臂 |
|------|------|------|------|------|------|
| group-1 | 90% | 90% | 90% | 95% | 逐位相同 |
| group-2 | 86% | 87% | 89% | 93% | 逐位相同 |
| group-3 | 67% | 64% | 68% | 81% | 逐位相同 |
| national-qf | 53% | 52% | 51% | 69% | 逐位相同 |
| national-sf | 52% | 53% | 54% | 64% | 逐位相同 |
| national-final | 23% | 24% | 30% | **35%（+5pp）** | 逐位相同 |
| 奪冠率 | 8% | 7% | 8% | **15%（+7pp）** | 逐位相同 |

- 招募臂＝`VD_FULL_ROSTER=1`：R1 曜石 MB／R2 鐵霧 OPP／R3 天鷹 OH（buildRecruitMember
  正式路徑決定論生成、trust 10 真實初值）頂上三攻擊位，S/L 維持創隊班底。
- 讀法：滿編最強招募（三名高 level 轉學生全上）把決賽 30%→35%、奪冠 8%→15%——上移
  存在但不失控（trust 10 壓低新人球權是天然阻尼）。**只採數據；門檻與調整留 W6**。
- 三臂逐位命中 W3 表＝動態預設序與舊硬編碼 byte-identical 的實跑佐證。

## 6. 偏差與歸因表

| 偏差 | 歸因 |
|------|------|
| 「攔死其快攻」→ 攔網得分 ×5（不分快攻）| 事件流無攻擊型別標記（TOUCH 只有 kind/power），判定快攻需動 sim 加標記＝任務書明令禁止；曜石＝快攻隊、其攻擊以快攻為主體，「攔死其攻擊」是最貼近的既有事件近似 |
| 「接起其強發」→ 敵發第一觸品質 ≥0.8 ×8（不分發球式樣）| SERVE 事件無式樣/力度欄位；以「高品質接發」近似「頂住強發」（0.8 需主動抓時機，AI 自動接發基準 0.6–0.75 構不到＝真壯舉）；不動 sim |
| dig 的事件層明確化：敵方扣球後第一時間 receive/dive | 任務書只寫「dig 達標場次」；掃描器定義=敵 spike TOUCH 之後我方玩家的第一觸救球，門檻單場 ≥3 |
| 入隊執行點在返回生涯畫面（renderCareer），非 settleCareerMatch 內 | 任務書「賽末結算→滿足→入隊」的入隊若在局終寫檔，儀式「只播一次」需在 recruitment 加 pending 欄＝破壞 §1 既定形狀；生涯場次必經生涯畫面才能開下一場，延到 renderCareer＝同一賽末流程鏈、玩家不可分辨、進度零風險（progress 已在局終落檔） |
| 條件表集中 recruitment.js（任務書兩案擇一） | 見 §1——生涯層概念不進 opponents.js |
| defaultLineup 的 libero 改「名冊首位自由人」 | 招募第二 L 後 `DEFAULT_LIBERO_ID` 硬編碼語意失效；創隊名冊首位自由人恆為 AL＝逐位等價 |
| 任務書前提修正：「W3 舊檔（無 recruitment 欄）」 | 實況＝W1 schema v2 起 recruitment 空殼恆在（createSaveV2 預設），W3→W4 **零遷移**；閘 7 以「空殼升級冪等＋壞形狀擋匯入」達成 |
| 儀式錯過情境 | 入隊落檔後、儀式播完前關頁＝儀式不重播（joined 已記）——資料零損失，純演出遺漏；不為此加持久欄位 |

## 6b. 對抗式審查（fresh opus，find-the-exploit 框架）

**Verdict: APPROVE**——零 CRITICAL、零 HIGH。六大攻擊面（重複入隊/存檔 brick/排陣繞過
5-1/決定論/邊界/壯舉掃描序錯位）全數「查過，無」，含 7 個對抗探針實跑（500 種子屬性
夾限掃描、applyRecruit 寫入失敗原子性、同對手雙場次累加等）。發現與處置：

- **[MEDIUM，轉 W5 驗收條款] 跨賽季累積與 W5 results 重置強耦合**：`settledBefore` 與
  `recordResult` 以 matchId 冪等——單季內同場次不重複累加（正確），但北原(勝3)/白浪(勝2)/
  鐵霧(勝2)三條線每季只遇一次，**W5 季迴圈若忘記重置 season.results，這三名永遠招不到**
  （靜默失效）。非 W4 bug（單季可達的曜石/天鷹實測正確）；已列入 §9 的 W5 kickoff 必含
  驗收條件。
- **[已修] LOW-1 半殘 progress 條目產生 NaN**：手改/匯入 `{wins:2}`（缺 feat 鍵）→
  `undefined+n=NaN` → conditionMet 恆 false。修＝`progressOf` 逐鍵正規化（缺鍵補 0，
  非整條回退）＋回歸測試。
- **[記錄] LOW-2 入隊寫入失敗無 UI 提示**：applyRecruit 回 false 時本次看不到入隊也無
  ⚠（原子性正確、無中間態）；下次回生涯畫面自動重試補招——自癒，不加碼。
- **[記錄] LOW-3 重入防線不對稱**：settledBefore 只護 recruitment 累加；同函式的
  feintUses/mergeScouting 在雙重結算下會膨脹——實際 `settleIfOver` phase-edge 一場一次、
  此路徑現實不可達（W2 起既有行為，非本輪引入）。

## 7. schema 升級

- `deserializeSave` 新增 recruitment 輕量形狀驗證（progress 為物件、recruited 為陣列）；
  progress 內容缺鍵由 `progressOf` 預設值容錯（`{wins:0,feat:0,stageCleared:false}`）。
- store 新增 `loadRecruitment/saveRecruitment/applyRecruit`（RMW 慣例同 roster/lineup）。
- 匯出/匯入 roundtrip：入隊後 export→import，成員仍在 members、recruited/trust 保留
  （單元測試）。

## 8. 單賽季可達成性（設計事實，非缺陷）

現行單賽季賽程中各隊遭遇次數：北原/白浪/鐵霧/天鷹各 1 次、曜石 2 次（group-3＋準決賽）。
故 **W4 單賽季內實際可入隊：曜石（勝 2 可湊）與天鷹（決賽勝）**；北原（勝 3）、白浪（勝 2）、
鐵霧（勝 2）依「跨賽季累積」設計須等 W5 賽季輪迴——這正是 progress 永不重置的存在理由。
招募區五條進度全程可見，玩家能看到累積在發生。

## 9. 遺留與下一步

- **命名工程待辦（Phase 3 收尾交付約定，不得遺漏）**：四層範圍——我方 7 人＋W4 招募
  球員 `member.name`（`src/career/roster.js STARTER_DEFS`＋`recruitment.js RECRUIT_DEFS`）
  ／persona 人設收斂／`events.js` 劇情對話 speaker 改以名字說話／對手隊員名
  （`opponents.js` 現「北原工商1號」佔位）。用 Fable 深推理出幾個差異化方向讓 Sawmah
  挑，不自己拍一版。
- `cancelFaultPoints` 續 dormant：W4 未做賽中換人，`performServe` 純註解零執行碼不變；
  觸發源（中途換人/輪轉替補）掛 W5/W6。
- W5 賽季輪迴（**kickoff 必含驗收條件，承 §6b MEDIUM**）：季迴圈必須重置
  `season.results`（否則 settledBefore/recordResult 以 matchId 冪等＝第二季全部場次
  被判已結算，北原/白浪/鐵霧三條招募線永遠湊不齊）且**不得清 recruitment**；驗收要
  實測「第二季再勝同隊 → progress.wins 確實 +1」。名冊已滿＋條件達成的「W5 釋出機制
  再接」點在 `settleRecruitJoins` 的 openSlots 檢查處。
- W6 平衡：招募臂 +5pp/+7pp 數據在案；決賽成長效應 +6pp 複核（承 W2）一併看。
- 真機 FPS：承 W1/W3 懸案，仍待 Sawmah 手機回報。
- 截圖：`docs/img/w4-career-desktop.png`（招募區）、`w4-lineup-desktop.png`／
  `w4-lineup-mobile.png`（板凳層）、`w4-ceremony-mobile.png`（入隊儀式）。
- 驗收固定裝置 `tools/w4-fixture.mjs`（一次性治具：產生注入用存檔）保留供 W5 沿用。
