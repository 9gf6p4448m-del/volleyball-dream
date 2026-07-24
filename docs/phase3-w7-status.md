# Phase 3 W7 結案快照 — 教練腦三件套（體力／氣勢＋暫停／主角下場）＋舊隊情結

> 2026-07-24。拍板依 `docs/kickoffs/w7-implementation-prompt.md`（17 題全定案）；
> kickoff 回填見 `docs/kickoffs/w7-kickoff.md`。本檔＝W8+ 接手權威快照。
> Commits：c33fcb1（拍板回填）→ 1fd3326（sim 地基）→ stage2 表現層 → ce0f66f（氣勢
> ＋C3 sim）→ 49002e3（舊隊情結）→ stage3 B4 → stage4 C1-C3 →（重基準／本檔）。

## 1. 交付總表

| 題 | 內容 | 落點 |
|----|------|------|
| A1 | 動作計費消耗（跳最貴：扣 0.02/攔跳 0.014/跳發 0.016/魚躍 0.018；墊/舉近零；每拍全員小額 0.0012）——純算術零 rng | `src/sim/stamina.js STAMINA`＋game.js 掛點（tryAction/executeTouch/performServe） |
| A2 | 兩段門檻劣化：<50% 力量/彈跳/速度 ×0.9、<25% ×0.8＋接球品質 ×1.18（餵爆接湧現）；不動反應/控制 | `staminaPerfMul`/`staminaRecvMul`；掛點＝applyMove/spikeSpeed/spikeReach/blockReach/receive qualityMul |
| A3 | 三檔恢復：rally 不回／死球場上 +0.004／板凳 +0.025／暫停全隊 +0.03 | `setupServePhase` 一次性（防拖延發球 exploit）＋`applyTimeout` |
| A4 | 對手 costMul 0.6 慢耗＋豁免重度門檻；標籤 <50% 轉黃＋喘氣 idle（gasp 姿勢）；體力播報雙方嚴格節流 | createGame({stamina:{B:{costMul,heavyExempt}}})；matchView 標籤/姿勢；commentary 節流（每人一次/同窗取王牌 trust 最高/主角豁免/我方 25% 再播/敵方重度不播） |
| A5 | stamina 屬性＝消耗抗性（±0.5%/點）＋恢復率（±0.8%/點）；不開放成長 | `attrCostMul`/`attrRecovMul` |
| A6 | 換人面板體力條＋我方標籤 <25% 紅＋主角 HUD 體力條（左下） | subPanel row/matchView/matchStage createHeroStaminaBar |
| B1 | 雙向氣勢計 −3..+3（＋=A）：連得 3+ 推檔、對向得分收檔、只動散佈 ±8% 封頂；表現層四件（聲量客場邏輯/燈光 ±10%/highfive+dejected/連得播報既有） | game.js momentum＋`momentumScatterMul`；scoreboard 氣勢計（A 往左 B 往右對齊比分）；matchLoop 聲量；scene setMomentum |
| B2 | 與 trustDyn 分工並存：trustDyn 管舉球分配、氣勢管全隊散佈 | 結構天然分離（零交集） |
| B3 | 暫停每場每隊 2 次死球可喊：斬對方氣勢歸中＋我方全隊小回＋死球 +3s；對手 AI 被連 4 分喊 | `applyTimeout`＋`aiTimeoutWanted`（ai.js AI.TIMEOUT_STREAK=4）；⏱ 鈕（matchStage）；matchLoop DEAD_BALL 節拍 |
| B4 | 氣勢計/聲量/燈光/肢體語言（見 B1） | 同上 |
| C1 | 主角可下場（subPanel 解鎖、同角色保 5-1）＋低體力教練建議（<25% 每場一次、在場才提） | subPanel；matchLoop DEAD_BALL 節拍 staminaAdviceShown |
| C2 | 板凳三件：bench 鏡頭（-6.6,1.8,10.6）＋⚙ 儀表板不凍結＋⏩×2（死球/回場自動回 1×）；回場＝獨立 🔥 鈕（優先換下接替者） | cameraRig 'bench'；matchLoop onCourt/findComebackOut/comebackAvailability（export 可測） |
| C3 | 回歸即建功：sim 內建 subLog 監看→COMEBACK_SPARK＋氣勢 +2 檔；⚡ 字卡改吃 sim 事件（W6 本地路徑刪除）＋sfx.cheer(2.4) 爆聲 | game.js applySubstitution/settlePoint；matchLoop COMEBACK_SPARK 分支 |
| C4 | 誠實計費——**W6 已結構性成立零改動**：gp 綁事件（板凳無事件＝無 gp）；主角換下信任豁免（matchCareer.js 本就排除 playerId 且主角不入 trust 映射） | 無改動 |
| D1 | 舊隊情結動態賽前事件（dna.teamId=對手→對話；每人對原隊一生一次） | events.js `oldTeamPreEvents`＋careerScreen 出戰合流 |
| D2 | trustDyn 開場 +8（含板凳/自由人；場末即散） | careerMatchSetup trustDynInit→createGame({trustDynInit}) |
| D3 | 開賽環境句（老東家句取代敵情句）＋復仇者首次建功播報 | commentary revenge 參數；matchStage 接線 |
| E1 | 治具雙臂＋逆轉哨兵＋體力診斷；管理臂政策＝<25% 換人＋被連 4 分喊暫停（aiTimeoutWanted 同一顆）；對手 B AI 暫停 W7 臂恆鏡像 | balance-sim.mjs VD_STAMINA/VD_MANAGE/VD_MOMENTUM |
| E3 | ⚙ 常駐、板凳無人反灰＋「板凳無人——招募隊員後解鎖」提示 | matchStage/subPanel sync |

## 2. 結構要點（W8+ 接手必讀）

- **啟用旗標**：`createGame({ stamina, momentum, trustDynInit })` 全部「存在才生效」；
  未傳＝state 欄位 null/空＝零副作用（零擾動有測試把關）。生涯/快速比賽由
  `matchConfig` 統一開（生涯對手 A4 非對稱、快速比賽對稱）；快速比賽重開局
  （matchLoop 換種子）與帶子預生成（buildScoutTape 第 7/8 參數）都要帶同設定
  ——**帶子鏡像鐵律**。
- **調參點**：體力全在 `stamina.js STAMINA`（消耗/恢復/門檻/A5 斜率）；氣勢在
  `game.js TUNING.MOMENTUM_*`；暫停 `TUNING.TIMEOUTS_PER_SET`/`TIMEOUT_DEAD_TICKS`；
  AI 喊暫停門檻 `ai.js AI.TIMEOUT_STREAK`。
- **事件新增**：`STAMINA_LOW {playerId,tier}`（向下跨檔一次；tier 用原始檔位、
  豁免只作用效果層）、`TIMEOUT {team,remaining}`（走 state.events 直推）、
  `MOMENTUM {value}`（值變動時、落在 SCORE 後）、`COMEBACK_SPARK {team,playerId}`。
- **決定論紀律**：體力/氣勢全純算術不碰 rand 流——「首次跨檔前與關閉態逐位一致」
  的測試模式（stamina/momentum 測試檔）是新機制的驗收範本。
- **氣勢防雪球**：只動散佈、快衰歸中、暫停可斬——逆轉哨兵（落後 ≥5 翻盤率）
  進治具常態輸出，改氣勢參數必看此值。
- **主角在板凳的判準**＝`s.playerId` 不在 rotations（不是 controlledId——輪控下
  controlledId 會漂）；matchControls 有零輸入守衛。
- **subLog（sim）**＝回歸監看單一事實源；UI 不得自己判回歸（W6 本地路徑已刪）。

## 3. 偏差表（自主決策，供 Sawmah 否決）

| # | 決策 | 理由 |
|---|------|------|
| 1 | 快速比賽體力/氣勢對稱雙開（拍板只規範生涯對手 A4） | 快速賽雙方同無板凳＝對稱公平；重開局沿用 |
| 2 | 體力播報「同一死球窗」實作為「同一 rally 累積、DEAD_BALL 結算」 | STAMINA_LOW 只在 rally 中發生，死球窗本身無新事件 |
| 3 | 王牌判定＝場上 trust.fromSetter 最高（同分 id 序） | 拍板未給定義；決定論且貼「球隊倚重度」語義 |
| 4 | 暫停鈕不綁生涯恆建；反灰而非顯隱 | timeouts 為 sim 通用；沿 subPanel 常駐＋反灰範式防版面跳動 |
| 5 | HUD 主角體力條放左下角 | 右上/頂部已滿（回放/離開/⚙/⏱/泡泡） |
| 6 | 氣勢計方向＝A 往左、B 往右（對齊比分 A:B 位置）；agent 原稿反向被我修正 | 視覺一致性 |
| 7 | 肢體語言＝滿檔固定映射（highfive/dejected）非機率加播 | 決定論、零額外狀態；「時長」路線（1.3s） |
| 8 | 燈光 ±10%／聲量 ±0.035（拍板只說「微」） | 參照局點張力管線量級外推 |
| 9 | C3 建功歸因＝BALL_IN＋最後觸球者屬勝方（含攔死；同 pointBanner 語義） | 拍板「建功」未細分；再次下場再回可重演 |
| 10 | D1 一生一次（id 綁 member×原隊）；D2/D3 每次對戰都生效 | 對話每屆重播會膩；場內效果重複合理 |
| 11 | D3 開賽環境句：有復仇者時「取代」敵情句 | 敵情句生涯畫面已看過；單槽環境句不疊放 |
| 12 | 治具基準臂不帶 trustDynInit/B AI 暫停（W7 臂才開） | 保基準臂與 pre-W7 逐位一致的回歸追蹤能力 |
| 13 | 板凳鏡頭高度 1.8m（拍板只給 x/z） | 教練站立視線量級；真機取景待驗 |
| 14 | 2× 加速與 hit-stop/慢動作不互斥（疊乘） | 板凳期間視窗僅由他人精彩球觸發，力道打折無正確性問題 |
| 15 | 教練建議台詞 agent 硬編「阿夢」→ 修為動態玩家名 | 真 bug 修復（記錄供審） |

## 4. Bug 與回歸測試

- 修 agent 硬編玩家名（教練建議台詞）——動態 `game.players[playerId].name`。
- 氣勢計方向反轉（偏差 #6）。
- W6 ⚡ 本地回歸判定路徑（subOuts/comebackWatch）整段移除＝行為由 sim
  COMEBACK_SPARK 單一事實源接管（tests/comeback.test.mjs 3 條把關）。
- 測試總量：321（W6.1）→ **367**（+46：stamina 9/timeout 6/momentum 6/comeback 3/
  old-team 4/commentary 節流 6/geoAnimator 姿勢 2 批/comeback-ui 9…見各檔）。

## 5. Balance 數據（n=300；AI 代打基準）

| 臂 | g1/g2/g3/qf/sf/final | 奪冠 | 逆轉率(落後≥5 翻盤) | 體力診斷（A 終場均值/單場最低/場均換人） |
|----|----------------------|------|---------------------|------|
| 基準（W7 全關） | 86/76/69/56/57/19 | 6% | 11%（56/518） | —（與 pre-W7 程式碼逐位一致，stash 對照實證） |
| 氣勢單獨 | 84/78/70/54/55/18 | 5% | 12%（65/527） | — |
| 體力無管理（首版參數） | 86/74/68/50/53/15 | 2% | 8% | 0.59／0.00／0.00 |
| 體力＋管理（首版） | 86/74/68/51/54/15 | 3% | 8% | 0.61／0.00／0.00（第 1 屆無板凳＝換不了） |
| 最終形態（首版） | 86/75/67/53/54/14 | 3% | 9% | 0.61／0.00／0.00 |
| **體力無管理（調參後）** | …/…/…/…/53/21 | **6%** | 9% | 0.69／0.01／0.00 |
| **最終形態（調參後）** | …/…/…/…/54/20 | **7%** | **11%** | 0.71／0.10／0.00 |
| **跨屆 ×6（調參後最終形態）** | 奪冠 7→10→13→19→21→20% 單調上行 | — | — | 0.70／0.01／0.01 |

跨屆補充：衛冕收斂 titles=1 15%／titles=2 7%（W6 基準 18%/6% 同型）；招募流動
（sky-hawk 88%/gale-shore 100%/sky-hawk-2 97% 等 wins 軸照流、壯舉軸 AI 讀數 0＝
真人技術軸下緣照舊）；名冊終量 11.8/12。

### 5.1 重基準結論（E1）

- **首版參數把第 1 屆壓成 2% 奪冠**且管理臂救不回——根因＝**創隊第 1 屆結構上
  無板凳**（7 人全上場），「<25% 換人」政策無人可換、暫停小回杯水車薪。
- **調參**（07-24）：COST_SPIKE .02→.018、JUMP_BLOCK .014→.013、JUMP_SERVE
  .016→.015、DIVE .018→.017、RALLY_TOUCH .0012→.001、RECOV_DEAD .004→.005。
- **調後定位**：單屆奪冠回到基準帶（6-7% vs 6%）＝體力的咬合點在**長局/deuce
  消耗戰**（單場最低仍 0.01-0.10）而非場場磨損；氣勢逆轉率與基準持平＝防雪球
  成立；跨屆進程不被扭曲。第 2 屆起板凳到位，管理工具才開始產生差異。
- **治具政策註**：自動管理臂「<25% 換人」極少觸發（調後全隊均值 0.69）——
  此臂是保守下緣；真人會在黃燈（<50%）就主動輪換，上緣待真人數據。

## 6. 命名工程增量清單（全掛 TODO(naming)）

- 體力播報三句（我方 tier1/tier2、敵方 tier1）＋暫停播報兩句（commentary.js）
- 暫停教練圈台詞（matchLoop requestTimeout）
- 低體力教練建議台詞（matchLoop DEAD_BALL 節拍）
- 回場鈕文案「🔥 回到場上」＋成功浮字（matchStage/matchLoop）
- 舊隊情結：D1 對話模板兩行（events.js oldTeamPreEvents）＋D3 環境句/建功句（commentary.js）
- 換人敘事（W6 既有）沿用未動

## 7. Sawmah 試玩清單

1. **體力可讀性**：打一場生涯——隊友頭頂標籤變紅/對手變黃的時機、喘氣姿勢、
   換人面板體力條、左下自己的體力條，「該換了」的瞬間有沒有出現？
2. **暫停手感**：被連 4 分時對手會喊暫停（浮字＋播報）；自己喊——教練圈一句＋
   全隊小回。⏱ 位置/時機順不順？
3. **氣勢**：連得 3 分起記分板下的雙向條、觀眾聲量（對手連得＝場館變安靜）、
   燈光微變、±3 滿檔的擊掌/低頭——讀得出「氣勢」這件事嗎？
4. **主角下場弧**：體力紅了→教練勸休（對話）→⚙ 換自己下→板凳鏡頭看 AI 打
   （⚙ 面板變儀表板、⏩×2 快轉）→死球按 🔥 回場→（若首球建功）⚡＋爆聲＋氣勢跳
   ——這條弧完整走一次。
5. **舊隊情結**：帶招募生打原隊（如小磐 vs 曜石）——賽前對話、開賽播報、
   他建功時的「向老東家證明自己」。
6. **矮視窗**：520-709px 高（橫持手機）——氣勢計與泡泡/局點徽章有沒有撞
   （偏差 #8 幾何推導未真機驗）。
7. **難度體感**：體力上線後後段變難（下緣奪冠 2%→管理工具回收）——
   第 1 屆沒板凳只有暫停，累起來的壓力合不合理？（W6 難度三選一仍懸，一併裁）

## 7.5 W7.1 試玩回饋輪（07-24 同日，Sawmah 7 題）

| # | 回饋 | 處置 |
|---|------|------|
| 1 | 暫停鈕位置 | ✅ ⏱ 移 ⚙ 正下方直排、⏩ 跟進同欄 |
| 2 | 氣勢「只有我方得分才加？」 | ✅ 查證非 bug（探針：A/B 觸發 9:9 對稱）——連得 3+ 才推檔＋對向先收檔的視覺誤讀；以 #4 delta 箭頭解可讀性 |
| 3 | 暫停沒演出、不知獲得什麼 | ✅ 拍板 A＋選項：全隊聚攏＋教練選項（🧘穩住=全隊額外+0.04／🔥燃起來=氣勢+1檔，applyTimeoutBoost 一暫停一發）＋倒數條＋「趁機換人」提示；時長 180→300 tick；**時長/恢復量待試玩再調** |
| 4 | 氣勢滿檔氛圍不夠 | ✅ 滿檔一次性字卡＋條 glow 脈動＋delta 箭頭＋聲量 ±0.05＋隊色微染 |
| 5 | 招募動畫 | ✅ 拍板 B 開卡儀式：3D 幾何立繪＋stagger 亮起＋count-up＋光暈＋宣言＋fanfare；**C（3D 過場）記帳 Phase 4** |
| 6 | 沒有能力值補體力 | ✅ 拍板 C：屆間訓練營主角耐力 +2/屆（上限 80、A5 灑點不動）；追加想法（連戰殘留 W8/鐵人字卡/對手疲勞戰術提示）待裁 |
| 7 | 兩屆只招到一個 | ✅ 查證在設計曲線上（治具最快線平均 2.3-3 屆）；建議指定邀請集中衝勝場軸＋壯舉軸真人可打；門檻要不要降待再裁 |

382 測綠（+13）；瀏覽器實測開卡儀式/暫停選項鏈/倒數條 console 零錯。

## 8. 懸念記帳（不擋結案）

- W6 難度三選一（w6-status §10）仍等真機裁定；A4 拍 A 後與本卷無互抵
- 真機 FPS 承 W1 仍懸
- feat 條件數值複核（W6 偏差 3）、爆接對鐵霧實測照舊
- 對手換人/板凳＝Phase 4（A4 慢耗敘事「鏡頭外輪換」先頂著）
- 氣勢影響 AI 行為（發球保守度/快攻配比）＝W8 觀察項（拍板明定不做）
- B1 換人真實度（原對/次數貼 FIVB）＝業餘/職業篇重開評估（W6 既有）
