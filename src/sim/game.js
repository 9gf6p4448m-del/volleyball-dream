// Phase 1 比賽模擬組裝層 — 模擬核心唯一入口（純 JS、零 three.js/DOM）
// 鐵律：stepGame 只吃 Intent（玩家/AI/網路同型，不知來源）；固定步長；隨機只走種子 PRNG
import { SIM_DT, COURT, BALL, CONVERGE_T, SETTER_SPOT } from './constants.js';
import { createBall, stepBall } from './ball.js';
import { createMatch, serverId, pointTo, isFourHits } from './match.js';
import {
  TEAM_SIDE, otherTeam, basePosition, servePosition,
  isBackRow, isInFrontZone, landedCourtTeam, localToWorld,
} from './rotation.js';
import {
  createPlayer, spikeReach, blockReach, blockTopEdge, moveSpeed, feintMasteryMul,
} from './player.js';
import {
  reachVolumeFor, ballInReach, reachRadiusFor, REACH_ACTION,
} from './reach.js';
// 攔網時序卷 段 1：攔網接觸資格＝物理滯空，界線沿用 sim 既有的滯空窗定義
// （＝TUNING.TAKEOFF_LOOKBACK_TICKS，也是 blockTopEdge 判「手回站立摸高」用的同一條線）
import { AIR_TICKS } from './approach.js';
import {
  BLOCK_HALF_WIDTH, buildBand, bandContact, overBlockerHands, classifyBlockContact,
} from './blockBand.js';
import { velocityForApex, spikeVelocity, predictLanding } from './flight.js';
import { seedRng, rand } from './rng.js';
import { isRotationLegal, isRotationOrderLegal, cancelFaultPoints } from './rotationRules.js';
import { applyAttackOutcome, applyComboAssist } from './trust.js';
import {
  STAMINA, drainStamina, recoverStamina, staminaPerfMul, staminaRecvMul,
  staminaServeScatterMul,
} from './stamina.js';

// §十-1 末段：可及體的球半徑膨脹量——**階段一唯一的行為變更**。
// 觸球條件是「球**面**碰到手」不是「球**心**碰到手」，所以可及體要長大一個球半徑。
// 攔網高度判定（`overBlockerHands`：`b.y > blockReach + BALL.RADIUS`）一直是這樣算的，
// 觸球判定卻是純球心對球心——同一個 sim 裡兩套球半徑標準，⑤ 的不一致由此而來。
// 統一為都吃。效果：可及體各方向長 10.5cm，觸球略容易（下一階段收斂會把總量調回來）。
const REACH_INFLATE = BALL.RADIUS;

// 遊戲層調參常數（骨架版；H 區手感層只調數值、不動結構）
export const TUNING = {
  // 基準 B 的收斂進度（單一真相在 constants.js；t=0 逐值重現基準 A）
  CONVERGE_T,
  SERVE_DEAD_TICKS: 110,  // 死球哨音到可發球的間隔（1.8s：慶祝/喘息的比賽節拍）
  SUBS_PER_SET: 6,        // W6 賽中換人：每局每隊人次上限（簡化版拍板；自由人不計次）
  TIMEOUTS_PER_SET: 2,    // W7 B3 暫停：每場每隊 2 次（FIVB；單局制＝每場）
  TIMEOUT_DEAD_TICKS: 1800, // 喊暫停後追加的死球時間（30s＝FIVB 真實時長；試玩回饋 07-24 二輪）
  TIMEOUT_RESUME_BUFFER: 90, // 提早開賽的最短殘餘（1.5s：球員走回位的銜接時間）
  TIMEOUT_CALM_RECOV: 0.04, // 暫停選項「穩住」：全隊體力額外小回（基礎 0.03 之上）
  TIMEOUT_FIRE_STEP: 1,     // 暫停選項「燃起來」：我方氣勢推檔數
  // W7 B1 團隊氣勢（拍板：小幅、快衰、偏散佈——防雪球第一原則）：
  // 雙向檔位計 −3..+3（＋＝A 氣勢、−＝B 氣勢）；連得 3+ 起算每分推一檔、
  // 對向得分往中間收一檔（幾球未得分即歸中）；只動散佈/失誤率、不動力量/速度
  MOMENTUM_STREAK_MIN: 3, // 連得幾分起算
  MOMENTUM_MAX: 3,        // 檔位上限（±）
  MOMENTUM_SCATTER_CAP: 0.08, // 滿檔散佈效果封頂（氣勢好 ×0.92／氣勢差 ×1.08）
  // W8（07-26 Sawmah 拍板：逐檔非僅滿檔）：氣勢方每檔＝死球間隙全隊額外恢復量
  // （腎上腺素敘事——打出氣勢就不覺得累；雙向對稱、快衰歸中＝量體自限）。
  // 滿檔 +0.006/死球＝場上基礎回 0.005 的雙倍出頭；C3 難度裁定時把此因素算入
  MOMENTUM_RECOV_PER_STEP: 0.002,
  REACH_RADIUS: 1.3,      // 觸球水平可及距離（m）
  TOUCH_COOLDOWN: 15,     // 同一人再次觸球的最短 tick 間隔（物理防抖）TODO Phase 2：完整雙擊判定
  SCATTER_MAX: 1.7,       // 精度屬性=0 時的落點散佈半徑（m）
  BLOCK_WINDOW: 48,       // block intent 的有效 tick 窗口（0.8s，手機反應時間友善）
  // 攔網水平涵蓋半徑（m）——真相在 blockBand.js（陷阱 1：改制前 attackZones.js 的
  // BLOCK_COVER_X 與這裡各寫死一份 1.1，漏改任一份面板就會對玩家說謊）
  // 攔網單人半寬：**單一真相在 blockBand.js**（基準 B 的收斂已在那裡算完），
  // sim 與玩家面板（input/attackZones.js）吃同一個值 ⇒ t 一動兩邊同時動
  BLOCK_REACH_X: BLOCK_HALF_WIDTH,
  SERVE_APEX: 4.6,        // 各球路弧頂高度（m）
  // ═══ 2026-08-10 發球平衡調參（Sawmah 三輪裁定，終版）═══════════════════
  // 量測＝`scratchpad/serve-style-probe.mjs`（三式各強制 60 局、每式 n≈1500 顆，真實 sim 事件）。
  // 起點：真人打到第 1 屆決賽拿到跳發後回報「飄浮比跳發得分率高多了」，實測跳發＝零價值
  //（ACE 0.0%、該分勝率 27% ≈ 普通發球）。
  //
  // ★ 終版形狀＝三種風險胃口，**期望值刻意不持平** ★
  //   普通 26.0%（零風險零報酬）＜ 飄浮 31.1%（失誤 3.4%＋中體力）＜ 跳發 35.1%（ACE 13.3
  //   ＋接噴 4.6＋失誤 13.9＝**每三顆就有一顆當場出結果**，＋最貴體力）。溢酬 +4.0pp。
  //   中途曾把跳發與飄浮調成等期望（34.0 vs 34.7），被使用者當場否決且理由正確：飄浮那時
  //   **零失誤、零體力、勝率又不差** ⇒ 理性玩家全程只發飄浮，另外兩式變成死選項。
  //   體力三檔在 `stamina.js`（站發 0.001 ＜ 飄浮 0.008 ＜ 跳發 0.015），別再讓誰白拿。
  //
  // ⚠ 兩條機制事實（調參前量出來的；**它們是後續每一顆鈕的前提**，改鈕前先讀）⚠
  //   ① 這個 sim 裡 **ACE 的唯一來源是「彈道不可預測」**。接球 AI 用 `predictLanding`
  //      的乾淨彈道走位，飛行 ~59 tick、只需跑 ~2.7m ⇒ **彈道可預測時恆碰得到**。
  //      加急墜之前跳發沒有任何騙位機制，APEX 掃到下限、SCATTER 掃到 2.8，**ACE 逐格都是
  //      0.0%**——那不是調參不足，是結構。`POWER_DROP_ACC` 就是補上的那個機制。
  //   ② `POWER_SERVE_RECEIVE_MUL` 的價值 **100% 走爆接（blown）通道、0% 走 passTier**。
  //      實測 MUL 1.34→3.0：poor 一傳 34%→71%，但**分 tier 的該分勝率不動**（perfect 24%
  //      vs poor 30%）；總勝率 +6.3pp 與「接爆直接失分」+6.2pp 逐格對齊。
  //      ⇒ 想用「壓爛對方一傳」當報酬是幻覺。**這條是全局設計債**（不只發球）：
  //        「破壞對方公式」的因果鏈末端失效，修法要動攻擊池的戰術分支＝難度重校卷處理。
  //      ★★ 2026-08-11 已還清（爆接／poor 一傳卷）——在原地銷帳 ★★
  //      當時的診斷「要動攻擊池的戰術分支」**是錯的**：逐格量測（d 從 0 到 11m）顯示
  //      落點誤差與出界率**全程是平的**（p50 0.175–0.237、出界 0.26–0.71%）⇒ 執行面
  //      本來就沒耦合、也不需要耦合。真正斷掉的是**攔網**這條通道，斷在兩處：
  //        ① `ai.js` 的 `BLOCK_RETRACT_ON_POOR`：守方讀到爛一傳就縮手「賭你自打出界」，
  //           實測放棄 34.1pp 攔網成功率只換到 0.16pp 出界率 ⇒ 已關（poor 被攔 1.61%→35.74%）
  //        ② 攔網起跳時鐘錨在「擊球點」而非「過網」⇒ 爆接後的慢速中路搶救球（crossT
  //           15 tick vs 一般 8）飛到時牆已落地 ⇒ 已改錨 `predictNetCrossing`
  //           （爆接被攔 22.47%→33.14%、牆上有人 84.67%→99.85%）
  //      ⇒ 現在跳發臂的**分 tier 該分勝率 perfect 27% vs poor 36%（+9pp）**——
  //        壓爛對方一傳**真的有報酬了**，而且是修攔網的副產品，發球端一格未動。
  //        三式階梯 26.7/30.7/38.0 完好（n≈1500/式），溢酬 +4.0→+7.3pp（使用者裁定接受）。
  POWER_SERVE_APEX: 3.9,  // 跳躍發球弧頂（timing>1.1）。3.35→3.9：急墜上線後**必須抬高**
  //   ——`velocityForApex` 解的是乾淨重力的彈道，急墜等於把重力加大 ⇒ 過網那一刻的淨空
  //   先被吃掉。實測 3.35＋急墜 1.0：掛網 19.2%、失誤 100% 由掛網獨佔。抬高讓淨空買得起急墜。
  //   ★ 3.9 是**上限**，不是我挑的甜蜜點 ★ 訂死它的是設計不變量「跳發更平更快」
  //   （`tests/career.test.mjs:262`：跳發初速須 > 站發 ×1.15）。抬 apex＝拉長飛行時間
  //   ＝水平初速變慢，逐值實測比值：3.8＝1.187／**3.9＝1.157**／3.95＝1.143 ✖。
  //   ⚠ 想再抬就會壓破那條不變量；而 3.8 以下急墜買不起（同組實測 D1.3 才有 ACE 10.8%，
  //     失誤已衝到 19.9%）⇒ **可用窗只有 3.8-3.9 這一格** ⚠
  //   ⚠ 3.0 以下無效——`applyServe` 的 `Math.max(apex, contactY + 0.35)` 會夾住 ⚠
  POWER_SERVE_SCATTER: 2.8, // 跳躍發球散佈放大倍率。1.45→2.8＝**刻意給失誤第二個來源**
  //   （裁定：別讓掛網獨佔，「才是真實的排球」）。終版 208 顆失誤＝掛網 164／出界 44。
  POWER_DROP_ACC: 1.30,   // ★ 上旋急墜加速度（m/s²，新機制）★ 實作與物理理由在 `stepRally`。
  //   目標帶＝ACE 12-15%／失誤 12-15%／接噴 3-5%／該分勝率 36±1%。
  //   逐格實掃（APEX 3.9／SCATTER 2.8／MUL 2.0 臂，n≈750 顆／格）：
  //     1.15＝ACE 10.0／失誤 10.9／勝率 34.0　1.20＝ACE 12.8／失誤 10.0／勝率 37.1
  //     **1.30＝ACE 14.1／失誤 14.2／勝率 36.7／接噴 4.6 ← 四條帶同時成立的那一格**
  //     1.40＝ACE 18.2／失誤 16.7　1.55＝ACE 18.3／失誤 19.9（ACE 在此飽和、失誤還在漲）
  //   ⚠ ACE 約在 18% 觸頂：急墜再兇就先掛網，球到不了對面 ⇒ 想要更高 ACE 只能抬 APEX，
  //     而 APEX 被下面那條不變量卡死 ⇒ **本機制的 ACE 天花板 ≈18%，別再往上找**。
  //   ⚠ 這顆鈕與 APEX 是**一組**、不得單獨動：急墜同時買 ACE（球短墜、接球者判深站後面）
  //     與掛網（過網淨空被吃掉），APEX 是把這兩件事分開的那根槓桿。
  FLOAT_APEX_MUL: 0.8,    // 飄浮發球弧頂縮減（較平、帶進撲朔感）
  FLOAT_SCATTER: 2.2,     // 飄浮發球自身散佈。1.05→2.2（2026-08-10 裁定「飄浮也要有失誤，
  //   但比跳發低」，目標 3-4%）：發飄浮要用硬手腕把球推出去、本來就會失手 ⇒ 失誤形狀是
  //   **出界**（實測 50 顆失誤全數 OUT、零掛網），與跳發以掛網為主的失誤分得開。
  //   實測（n≈1500）2.2＝失誤 **3.4%**／2.3＝3.8-4.6%／2.6＝5.2%。
  FLOAT_RECEIVE_MUL: 1.15, // 飄浮球接發品質懲罰（07-24 真飄上線 1.28→1.15：站位被騙已是
  //   有機難度來源，數字懲罰下調防雙重懲罰；balance A/B 校準）
  FLOAT_DRIFT_ACC: 1.955,  // 真飄側向亂流加速度幅值（m/s²；雙頻曲線、總偏移 ~±0.3-0.5m）
  //   2.2→2.03→**1.955**。這顆鈕現在的職責是**把飄浮的該分勝率釘在 31±1%**（裁定：
  //   跳發要比飄浮高 +4~6pp，飄浮不能再是無腦最優解），ACE 是它的附帶結果不是目標。
  //   實測（SCATTER 2.2 臂，n≈1500）：1.955＝ACE 7.6%／勝率 31.1%　1.975＝8.3%／31.5%
  //   2.00＝9.3%／32.6%（**出帶**）。舊臂（SCATTER 1.05）的 ACE 曲線：2.2＝26.0／2.05＝15.2／
  //   2.03＝12.5／1.9＝3.6／1.8＝0——閾值極陡，動它之前一定要重跑。
  // ★ 為什麼終版飄浮 ACE 是 7.6% 而不是曾經定案的 12.5%（算術互斥，不是忘了調回）★
  //   飄浮的該分勝率恆等於 `ACE + (1 − ACE − 失誤) × c`，而 c（球被接起來之後伺服方
  //   還能贏這一分的機率）**打在地板上動不了**：實測 c ≈ 26.0%，與普通發球同值，
  //   且把 FLOAT_RECEIVE_MUL 從 1.15 壓到 0.6（接發變成 97.1% perfect ＝ 給對方加分）
  //   c 也紋絲不動 ⇒ 一傳品質這條路對勝負早已飽和（上面 ② 那條債的第三次獨立量到）。
  //   代進裁定的三個數（c＝26.0，量自普通發球同一支探針）：要 ACE 12.5% ∧ 失誤 3.4%
  //   ⇒ 勝率必然是 33.9%，回不到 31%；要勝率 31% ∧ ACE 12.5% ⇒ 失誤得拉到 14.5%
  //   （遠出 3-4% 帶）。**三選二，沒有第三條路。**
  //   本版選的是「失誤 3-4% ＋ 勝率 31%」＝**溢酬結構優先**（那才是使用者否決持平版的
  //   理由）；ACE 就讓它落到 7.6%。要把 ACE 調回 12.5% 就得放掉另外兩項的其中一項。
  POWER_SERVE_RECEIVE_MUL: 2.0, // 跳躍發球接發懲罰（球快難墊；遠高於飄浮＝正面對決最難接）
  //   1.34→2.4（第一輪）→**2.0**（第二輪回調）。走爆接通道＝「發球把對方接飛、球直接
  //   飛出去」。回調理由：急墜上線後 ACE 自己吃掉一塊得分，2.4 會把「接噴」推到 5.7%
  //   （裁定帶是 3-5%）。同臂實測：2.0＝接噴 5.0%／勝率 34.0、2.1＝4.8%／32.6 ⇒ 取 2.0。
  //   ★ 2.4 曾是**天花板扣掉安全邊際**，往上沒有空間 ★ 上限由 07-23 爆接拍板的不變量
  //   「好接球永不爆」訂死（`tests/blown.test.mjs:60`：control/reaction 90、站在
  //   0.9× 幾何可及上限，60 次須零爆接）。逐值實掃：MUL ≤2.5 高技術爆接 0/60、
  //   2.55 起 1/60、3.0 起 5/60 ⇒ **2.5 是硬牆**。現值 2.0 離牆還有 20% 餘裕，
  //   但**任何往上的調整都要先回頭跑那支掃描**（`scratchpad/blown-guard-scan.mjs`）。
  DIVE_REACH_MUL: 1.8,    // 魚躍可及半徑倍率（一次性大延伸）
  DIVE_MAX_Y: 1.15,       // 魚躍只救低球（貼地撲救，不是跳接）
  DIVE_RECOVER_TICKS: 42, // 撲出去後倒地恢復（0.7s）——撲空也一樣（風險換範圍）
  RECEIVE_APEX: 4.8,
  SET_APEX: 5.2,
  QUICK_APEX: 3.4,        // 快攻低弧（set 且 timing<0.5 時採用——MB 簡版快攻）
  SHOOT_APEX: 4.2,        // §5 第三檔：平拉開／半快（0.5 ≤ timing < 0.65）
  SPIKE_SPEED_BASE: 9,    // 扣球速度 = BASE + power × PER（m/s）
  SPIKE_SPEED_PER: 0.17,
  SPIKE_MIN_TIME: 0.18,   // 扣球最短飛行時間（避免零距離除法）
  TIP_SPEED_MIN: 0.55,    // 輕吊速度下限＝全力的 55%（timing=0 時）
  // §十-4 彈道自由度：各攻擊型態的目標過網高度帶 [timing 好→下緣, 差→上緣]（球心）。
  // 初始值＝憲法參照帶 ∩ 幾何可行域（kickoff §六.5 Q4：驗收只驗相對序，絕對值為調參項）；
  // 硬地板＝NET_HEIGHT+BALL.RADIUS＝2.535，帶下緣至少留 0.04 淨空否則擦網
  TIP_CLEAR_T: 0.45,      // timing ≤ 此值＝輕吊帶（檔位邊界，與 set 三檔同款慣例）
  // 快攻下緣＝舊常數 2.655（07-31 掃描裁定：低於它 read 攔網幾何上占便宜、R4 款3 的
  // G% 真翻轉 2.6 SE；上緣保留＝玩家自操快攻的品質→高度回饋，AI 全滿蓄貼下緣零平衡影響）；
  // 兩翼下緣 2.66＝保相對序（快 2.655 < 翼 2.66，兩者皆綁定態、p50 貼下緣）
  SPIKE_CLEARANCE: {
    tip: [2.575, 2.62], quick: [2.655, 2.7], wing: [2.66, 2.85], back: [2.75, 2.95],
  },
  // 出手品質（2K 式甜蜜區）：蓄力進度落在甜蜜區＝準、超蓄＝飄
  SWEET_LO: 0.7, SWEET_HI: 1.05, OVERCHARGE_T: 1.15,
  // W4(P4) 題5 OPP 要球（初擬值、治具驗）：品質提升＝甜蜜區時機窗微放寬（非傷害加成）；
  // 信任雙倍下注＝要球後成功/失誤 trust 升降幅同倍放大（沿 trust.js 乘係數零新機制）
  CALL_SWEET_WIDEN: 0.06,
  CALL_TRUST_MUL: 2,
  SWEET_ACC: 0.55,        // 甜蜜區散佈乘數（越小越準）
  OVER_ACC: 1.5,          // 超蓄散佈乘數
  PERFECT_RECV_ACC: 0.5,  // Perfect 接球（timing≥0.95）的散佈乘數
  // 接球品質（07-23 改版）：實測 AI 全隊接球都「站著勉強搆」（dist≈1.1、且不分角色，
  // 因球一進可及範圍就接、非跑到正下方再接）→純到位不可行（全隊崩盤且速度優勢用不上）。
  // 改以「接球技術＝(control+reaction)/2」為主軸（自由人最高＝接球最好）、到位程度為次要
  // 修正（保留走位深度但不主導）；低姿勢一傳不再被觸球高度冤枉。
  RECV_SKILL_MIN: 55,     // 技術基準下限（(control+reaction)/2＝此值→最差基準）
  RECV_BASE_MAX: 1.2,     // 低技術接球基準散佈乘數（差）
  RECV_BASE_SLOPE: 0.029, // 每點技術降基準（技術 73＝自由人→約 0.68 好球）
  RECV_POS_MIN: 0.9,      // 走到位（r=0）到位修正（微獎）
  RECV_POS_RANGE: 0.2,    // 勉強（r=1）→×1.1（微罰；走位深度但不主導）
  // 爆接（Sawmah 07-23 拍板「真噴」）：一傳品質過差→機率出低平噴射球而非健康高弧——
  // 接噴救球（備援追球者＋救噴必撲魚躍）的戲劇來源。好接球（q<門檻）永不爆；
  // 自由人（技術 73→q≈0.9）天生不爆＝身分保留
  BLOWN_Q_MIN: 1.15,        // 品質散佈乘數超過此值進入爆接判定
  BLOWN_CHANCE_SLOPE: 0.55, // 爆接機率＝(q−Q_MIN)×斜率
  BLOWN_CHANCE_MAX: 0.35,   // 機率上限（最惡劣品質）
  BLOWN_SPIKE_PRESSURE: 1.2, // 重扣壓迫：dig 的爆接判定品質加乘（只影響爆接、不動散佈）
  BLOWN_APEX: 1.9,          // 噴射球弧頂（低平＝滯空短、追起來像救火）
  // 擦手（one-touch）：§十-4b 起改幾何分區（blockBand.js classifyBlockContact），
  // 舊 BLOCK_GRAZE_CHANCE 機率帶退役。初值錨定＝總 graze 率≈改制前（每局 ~10.95 次，
  // t10-4b 探針 M1 基準；Q4 裁定＝調參項不進驗收閘）
  BLOCK_EDGE_FRAC: 0.15,    // 側緣區佔帶半寬比例（dx 落最外 15% ＝擦側）
  BLOCK_TOP_BAND: 0.14,     // 擦頂窄條厚度 m（手頂邊＋球半徑往下算；0.15/0.14 掃描定＝graze 率 10.68/局 距錨 −2.5%）
  BLOCK_GRAZE_SLOW: 0.45,   // 擦側後穿越速度保留比（減速但仍常飛向深區/界外）
  BLOCK_GRAZE_TOP_SLOW: 0.75, // 擦頂後速度保留比（指尖擦過＝球保留大半前速衝深區/底線外）
  // §十-4b 意圖層：tool 路線（打手出界的攻擊端）。被牆蓋住的強攻有機率改瞄
  // 「牆手頂帶＋出界深區」——擦到手＝攔網方失分，沒擦到＝自打出界（真實 tool 的賭局）
  TOOL_CHANCE: 0,           // ⚠ 出廠關閉（2026-07-31 Sawmah 裁定乙）：tool 意圖對現行
                            // 攔網時序連結率 <10%（三瞄法×兩牆判實測，kickoff 十-4b §七.5）。
                            // 機制與測試保留；重開條件＝未來「攔網時序卷」讓牆能回應
                            // 非常規球路後，再調此值 >0
  TOOL_OUT_DEPTH: 0.9,      // 出界保證量：沒擦到時落點須超出邊線至少此距離 m
  TOOL_SEE_DEPTH: 1.2,      // 「看得見的牆」門檻：對面前排 |z| 在此內＝貼網 block-ready
  TOOL_TARGET_Z: 5.0,       // wipe 目標深度 m（落點 z；x 由「過網恰在牆外側緣」反解）
  // §十 階段二 2-B：攔網時機不再是乘數。BLOCK_SWEET_MIN/MAX 與 LATE/EARLY_MUL
  // 四個常數連同 blockTimingMul() 一起拆掉——時機現在是幾何的（player.js
  // blockTopEdge：太早已下墜、太晚還在上升，兩者都表現為球到那一刻手不夠高）。
  // H3 視線欺敵曲線（騙敵線性、失誤平方；試玩調參用，結構不變）
  THETA_MAX_DEG: 45,      // 視線與實際擊球方向的最大有效夾角
  DECEIVE_GAIN: 0.7,      // 騙過攔網機率 = min(θ/θmax,1) × 此值（線性）
  ERROR_GAIN: 0.5,        // 自身失誤增量 = (θ/θmax)² × 此值（平方）
  // 後排攻擊合法性判定的位置回溯窗（0.4s＠60Hz）：治標近似「起跳離地位置」，
  // 真正的滯空狀態機留給 Phase 2；見 takeoffZ()
  TAKEOFF_LOOKBACK_TICKS: 24,
};

// teams = { A: [6 個 Player], B: [6 個 Player] }；陣列順序即開局輪轉（index 0 = 1 號位）
// setTarget：局分（預設 25；快速局可傳 15）
// aiProfiles = { A?, B? }：每隊 AI 風格參數（tipRate/dumpRate/jumpServeRate…）
// scoutRead = { A?|B?: { targetId, read(0-1), zones:{line,cross,middle,tip} } }：
// stage 5 情蒐——該隊對 targetId 的歷史攻擊分佈讀取（攔網向慣用線收攏）
// liberos = { A?: Player, B?: Player }：stage 6 自由人（第 7 人）——死球時自動
// 替換後排 MB、輪到前排/發球位自動換回（結構上不可能發球/攔網）
// benches = { A?: [Player], B?: [Player] }（W6）：板凳球員——場邊待命，僅經
// applySubstitution（死球換人）進場；不在輪轉＝不參與任何 sim 判定（tryBlock/AI
// 皆以輪轉名單為準），無換人時對比賽零擾動
// stamina（W7）：true＝雙隊預設啟用；或 { A?: {costMul?, heavyExempt?}, B?: {...} }
// （A4 對手對稱性：costMul 0.6 慢耗＋heavyExempt 豁免重度門檻）。未傳＝整套關閉、
// 零副作用（state.stamina 為 null，所有掛點短路）
// momentum（W7 B1）：true＝啟用團隊氣勢（雙向檔位計）；未傳＝關閉零副作用
// trustDynInit（W7 D2）：{ playerId: 偏移 } 場內動態信任開場值（舊隊情結 +8；場末即散）
// series（W4 Q8 分級賽制）：{ bestOf: 3|5 }＝多局系列（關鍵戰 bo3／冠軍戰 bo5、
// 決勝局 15 分＋8 分換邊照 FIVB）；未傳或 bestOf 1＝現行單局、state.series null 零擾動
// comboScale（2026-08-01）：組合攻擊（交叉／夾塞／時間差）三型觸發機率的**外部倍率**。
// 未傳＝null＝出廠值（approach.js 的 COMBO_RATE 原值）＝快速比賽與所有既有呼叫端零擾動；
// 傳 0＝這場沒有組合攻擊（雙方同步——它是場級參數，不分敵我）。
// ★ sim 只認這個數字，不認識「屆數／賽季／生涯」★ 值由呼叫端算好（現況＝career 層
// careerMatchSetup 依屆數給），與 aiProfiles／scoutRead／liberos 同一條注入範式。
export function createGame({
  seed = 1, teams, setTarget, aiProfiles, scoutRead, liberos, benches, stamina, momentum,
  trustDynInit, series, comboScale,
} = {}) {
  const rosters = teams ?? createDefaultTeams();
  const players = {};
  const actors = {};
  for (const team of ['A', 'B']) {
    const extra = [
      ...(liberos?.[team] ? [liberos[team]] : []),
      ...(benches?.[team] ?? []),
    ];
    for (const p of [...rosters[team], ...extra]) {
      players[p.id] = p;
      actors[p.id] = {
        x: 0, z: 0, px: 0, pz: 0,
        blockUntil: -1, blockStartTick: -9999, blockHand: 'vertical', lastTouchTick: -9999,
        // 攔網時序卷 段 1：這個攔網窗是不是玩家手動投遞的（記債豁免，見 tryBlock）
        blockManual: false,
        divedUntil: -1, // 魚躍倒地恢復期（此前不得移動/觸球）
        zHistory: [], // 每 tick 推入舊 z（見 takeoffZ）；固定長度＝回溯窗
      };
    }
  }
  const state = {
    tick: 0,
    seed, // 原始種子（AI 決策 hash 的混合項——跨場次變化、同種子可重現）
    aiProfiles: aiProfiles ?? null,
    // 組合攻擊觸發倍率（null＝未注入＝出廠值 1；讀取端 ai.js 一律 `?? 1`）
    comboScale: comboScale ?? null,
    scoutRead: scoutRead ?? null, // 情蒐讀取（對手讀我的慣用線；生涯注入）
    liberos: liberos
      ? Object.fromEntries(Object.entries(liberos)
          .filter(([, p]) => p)
          .map(([t, p]) => [t, { liberoId: p.id, replacedId: null }]))
      : null,
    scoutTally: {},  // 情蒐統計（playerId→intent 分佈；場末由生涯層收走跨場累積）
    trustDyn: { ...(trustDynInit ?? {}) }, // stage 4 場內動態信任（playerId→偏移；場末即散）
    //   W7 D2：trustDynInit＝開場預載偏移（舊隊情結）；未傳＝空＝行為不變
    trustStreak: {}, // 連續得分/失誤計數（正＝連得、負＝連失）
    // W7 體力（A1-A5）：playerId→0..1；未啟用＝null（零副作用）。
    // per-team 設定（A4 對稱性）存 staminaCfg；效果/消耗全走 stamina.js 純函式
    staminaCfg: stamina
      ? { A: { ...(stamina === true ? {} : stamina.A) }, B: { ...(stamina === true ? {} : stamina.B) } }
      : null,
    stamina: stamina
      ? Object.fromEntries(Object.keys(players).map((id) => [id, 1]))
      : null,
    rngState: seedRng(seed),
    // W6 賽中換人：板凳名單＋每局人次（自由人體系不經此路）
    bench: {
      A: (benches?.A ?? []).map((p) => p.id),
      B: (benches?.B ?? []).map((p) => p.id),
    },
    subs: {
      A: { remaining: TUNING.SUBS_PER_SET },
      B: { remaining: TUNING.SUBS_PER_SET },
    },
    // W7 B3 暫停：每隊 2 次；pointStreak＝隊級連得分（暫停 AI 判準＋stage 3 氣勢輸入）
    timeouts: {
      A: { remaining: TUNING.TIMEOUTS_PER_SET },
      B: { remaining: TUNING.TIMEOUTS_PER_SET },
    },
    // W4 試玩修正（07-27）：同一分（同一死球窗）每隊至多喊一次暫停——
    // 記「喊過暫停的分數 key」（同局比分恆遞增＝天然的分識別；跨局歸零）
    timeoutAtPoint: { A: -1, B: -1 },
    timeoutBoostArmed: false, // W7.1 暫停教練選項：applyTimeout 上膛、用掉或下個死球窗自動收
    pointStreak: { team: null, n: 0 },
    // W7 B1 團隊氣勢：value ∈ [−MOMENTUM_MAX, +MOMENTUM_MAX]（＋＝A、−＝B）；
    // 與 trustDyn 分工（B2 拍板）：trustDyn 管舉球分配、氣勢管全隊散佈，輸入同源不疊算
    momentum: momentum ? { value: 0 } : null,
    // W7 C3 回歸監看（sim 內建單一事實源；UI ⚡ 字卡與氣勢注入共用）：
    // out＝曾被換下者；back＝回場後尚未建功者（建功即清、可再次下場重新累積）
    subLog: { out: {}, back: {} },
    // W6 B4（7.7 接線）：登記發球序——換發輪 nextIdx 前進、換人走 applySubstitution
    // 槽位繼承；match.rotations 若被非法路徑改動＝performServe 抓違序（最後防線）
    serveSeq: {
      A: { order: rosters.A.map((p) => p.id), nextIdx: 0 },
      B: { order: rosters.B.map((p) => p.id), nextIdx: 0 },
    },
    rotationFault: { A: null, B: null }, // 首次違序 tick（賽末 7.7.2 追溯扣分）
    players,
    actors,
    match: createMatch({
      rotationA: rosters.A.map((p) => p.id),
      rotationB: rosters.B.map((p) => p.id),
      ...(setTarget ? { target: setTarget } : {}),
    }),
    // W4(P4) Q8 多局系列狀態機：局間收束/重置語意逐項明列於 startNextSet；
    // 決勝局（最終局）＝15 分＋8 分換邊（FIVB）；短局測試（?points=）決勝局取較小值。
    // startRotations/startBench＝每局重排的基準（工單「沿用現行 lineup 鏈」＝
    // 每局回到開場先發序；換人/暫停額度按 FIVB 每局重置）
    series: series && series.bestOf > 1 ? {
      bestOf: series.bestOf,
      setsToWin: Math.ceil(series.bestOf / 2),
      baseTarget: setTarget ?? 25,
      deciderTarget: Math.min(15, setTarget ?? 25),
      setIndex: 1,
      setsWon: { A: 0, B: 0 },
      setScores: [], // 各局終分 [{A,B}]（box score／生涯結算消費）
      startRotations: { A: rosters.A.map((p) => p.id), B: rosters.B.map((p) => p.id) },
      startBench: {
        A: (benches?.A ?? []).map((p) => p.id),
        B: (benches?.B ?? []).map((p) => p.id),
      },
      startServing: 'A', // 各局首發球權交替（FIVB 語意的決定論化：奇數局 A、偶數局 B）
      sideSwitched: false, // 決勝局 8 分換邊（一次性；事件化＋表現層演出）
      over: false,
      winner: null,
    } : null,
    phase: 'serve', // 'serve' | 'rally' | 'set_break'（多局局間） | 'set_over'
    serveReadyTick: 0,
    ball: createBall(),
    rally: {
      flightId: 0,     // 每次擊球/發球遞增；AI 的呼叫鎖定以此為鍵（不可撤銷窗口）
      profile: null,   // 'serve' | 'arc' | 'spike'
      touches: 0,      // 持球方本波觸球數（攔網不計）
      possession: null,
      lastTouchTeam: null,
      lastToucherId: null,
      deceiveP: 0,       // H3：當前扣球夾帶的騙敵機率（攔網結算用）
      lastSpikeZone: null, // 本波扣球的線路分類（line/cross/middle/tip；情蒐讀取用）
      lastSetKind: null,   // §十-4：最後一次舉球檔位 {team, kind:'quick'|'shoot'|'high'}（快攻分類資料底）
      // ★ 2026-08-11 爆接／poor 一傳卷：本波一傳離二傳站位多遠（公尺；無一傳＝null）★
      // 為什麼住在 sim 而不是走 Intent：`ai.js` 的 `passTierOf` 目前自己算一次，
      // 而**輸入層有能力漏傳** ⇒ 玩家側會天然逃脫懲罰。量測住在 sim ＝
      // **雙方對稱是結構保證，不是紀律保證**。消費端（分檔門檻）仍留在 ai.js，
      // 因為那要用二傳身高算可及半徑——量測一份、消費兩處、解析度不同，不是兩份真相。
      passOffset: null,
      passTeam: null,      // 這個 offset 是誰的一傳（換方持球時要清）
      serveStyle: null,  // 本球發球式（'float'＝飄浮：接發品質懲罰；過首觸即無效）
      touchLockTick: -1, // 每 tick 至多一次觸球（先到先得，順序＝Intent 陣列序，決定論）
      // W4 題5 OPP 要球：本波要球者。
      // ★ 2026-08-05 更正過期註解（稽核 08-03 存疑項覆核）★ 原文寫「trust 2×／甜蜜區放寬
      // 的資料底」，但**trust 2× 從未實作**——全 `src/` 只有本檔用到 `callPid`，
      // 唯一效果是下面扣球結算的**甜蜜區微放寬**（`CALL_SWEET_WIDEN`）。
      // ⇒ 要球**不影響二傳把球舉給誰**（`ai.js` 一次都沒引用它）。
      // E 路實測「授予後撐到二傳出手仍是原受控者只剩 55.5%」正是這個設計的必然結果，
      // 不是 bug——但**與玩家對「⚡跟上！」這顆按鈕的預期不符**，已送裁（見下）。
      callPid: null,
      // 段 4 組合獎金的資料底：`{ pid, team }`＝本波組合的配合者且他**實際起跳**了。
      // 由 ai.js 的 applyRouteCommit 寫（那裡才同時看得到 attackCombo 與 routeCommit），
      // settlePoint 讀。放 rally 而不是 aiState 的理由：獎金要在**得分結算**那一刻兌現，
      // 而 game.js 讀不到 aiState；rally 又剛好與「一波」同壽命（死球即清，同 callPid）
      comboAssist: null,
      // ★ 2026-08-08 顯示層可觀測旗標（OPP 夾塞可見度裁定）★ 純新增、只給 UI 讀：
      // 唯一寫入點在 trust.js applyComboAssist——那裡在真正寫 trustDyn 的同一行旁
      // 寫這個欄位，語意＝「這次入帳真的發生了、發給誰、哪個 flightId」。
      // 不進 sim-hash 白名單（tools/sim-hash-probe.mjs 的 tickRecord 只挑固定欄位，
      // rally 只列 11 個既有欄位，這個不在裡面），也不改變 comboAssist 本身或
      // addTrustDyn 的任何寫入時機／值。
      comboAssistCredit: null,
    },
    events: [], // 完整事件日誌（測試/回放用）
  };
  setupServePhase(state);
  return state;
}

// 推進一個固定步長。intents：本 tick 生效的 Intent 陣列（玩家與 AI 混在一起，sim 不區分）
// 回傳本 tick 產生的事件陣列
export function stepGame(state, intents = []) {
  // set_break（多局局間）＝模擬凍結：下一局由呼叫端 startNextSet 顯式開啟
  // （UI 的「下一局」按鈕／治具的自動推進）——局間存檔的同步點就在這裡
  if (state.phase === 'set_over' || state.phase === 'set_break') return [];
  const ev = [];

  // 快照上一步位置：供 render 層插值（同 ball 的 px/py/pz 慣例）；
  // 同時推入 zHistory（回溯窗），供後排攻擊合法性判定近似起跳位置用
  for (const a of Object.values(state.actors)) {
    a.px = a.x;
    a.pz = a.z;
    a.zHistory.push(a.z);
    if (a.zHistory.length > TUNING.TAKEOFF_LOOKBACK_TICKS) a.zHistory.shift();
  }

  for (const it of intents) {
    if (it.tick !== state.tick) continue; // 只吃本 tick 的 Intent（決定論保護）
    const actor = state.actors[it.playerId];
    if (!actor) continue;
    applyMove(state, actor, it);
    if (it.action) tryAction(state, it, ev);
  }
  separateTeammates(state); // 同隊避讓：走位後解重疊（穿模/疊人）

  if (state.phase === 'rally') stepRally(state, ev);

  state.tick += 1;
  state.events.push(...ev);
  return ev;
}

// ---- Intent 消費 ----

function applyMove(state, actor, intent) {
  if (state.tick < actor.divedUntil) return; // 魚躍倒地恢復中：不能移動
  let { x = 0, z = 0 } = intent.move ?? {};
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  const player = state.players[intent.playerId];
  const speed = moveSpeed(player) * staminaPerfMul(state, player); // W7 A2：累了腿變沉

  // 走位邊界：限本方半場＋自由區，不可越中線（貼網保留 0.12m）
  // TODO Phase 2：越中線細則（腳可過線不干擾）——現簡化為硬牆
  const maxX = COURT.WIDTH / 2 + COURT.FREE_ZONE - 0.2;
  const maxZ = COURT.LENGTH / 2 + COURT.FREE_ZONE - 0.2;
  const side = TEAM_SIDE[player.teamId];
  actor.x = clamp(actor.x + x * speed * SIM_DT, -maxX, maxX);
  const z2 = actor.z + z * speed * SIM_DT;
  actor.z = side === 1 ? clamp(z2, 0.12, maxZ) : clamp(z2, -maxZ, -0.12);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---- stage 5 情蒐（Scouting）----

// 扣球線路分類：吊球看力度、其餘看橫向——與攻擊手同側＝直線、對側＝斜線
// （用 intent.aim 而非散佈後落點：情蒐讀的是「意圖習慣」）
export function classifySpikeZone(actorX, aimX, power) {
  if (power <= 0.45) return 'tip';
  if (Math.abs(aimX) < 1.8) return 'middle';
  const side = actorX >= 0 ? 1 : -1;
  return (aimX >= 0 ? 1 : -1) === side ? 'line' : 'cross';
}

function scoutTallyOf(state, pid) {
  if (!state.scoutTally[pid]) {
    state.scoutTally[pid] = {
      zones: { line: 0, cross: 0, middle: 0, tip: 0 },
      // 組合攻擊卷 Q4 資料層（2026-07-31，純記帳）：路線種類分佈，比照 zones。
      // 鍵集＝approach.js 的合法 kind（'left_inside' 是 2026-07-31 由 'cross' 改名，
      // 見 approach.js routeKindFor 註解）。消費端（scoutBlockMul 同型門檻）本輪不開。
      // 組合攻擊卷 段 A（2026-07-31）補 'cross'／'tandem'：下面 :659 的
      // `tal.routes[...] !== undefined` 守衛在鍵不存在時**不報錯、直接不記**
      // ⇒ 鍵集必須與 approach.js 的 APPROACH 表同步，否則段 B/C 一接上抽籤，
      // 記帳就會靜默丟掉一半（tests/attack-routes.test.mjs 有同步性斷言）
      routes: {
        quick: 0, bquick: 0, left: 0, left_inside: 0, cross: 0, tandem: 0, right: 0, pipe: 0, dball: 0,
      },
      feints: 0, spikes: 0,
      serves: { jumps: 0, floats: 0, total: 0 },
    };
  }
  return state.scoutTally[pid];
}

// 情蒐讀取的攔網乘子：慣用線（分佈占比>0.35）被讀死、反常線（<0.15）出其不意。
// read＝對手強度參數（弱隊 0＝不讀）；樣本 <6 球不讀（避免小樣本亂收攏）
export function scoutBlockMul(state, blockTeam) {
  const sc = state.scoutRead?.[blockTeam];
  const zone = state.rally.lastSpikeZone;
  if (!sc || !zone || state.rally.lastToucherId !== sc.targetId) return 1;
  const z = sc.zones ?? {};
  const total = (z.line ?? 0) + (z.cross ?? 0) + (z.middle ?? 0) + (z.tip ?? 0);
  if (total < 6) return 1;
  const share = (z[zone] ?? 0) / total;
  if (share > 0.35) return 1 + (sc.read ?? 0) * (share - 0.35) * 1.8;
  if (share < 0.15) return Math.max(0.6, 1 - (sc.read ?? 0) * 0.25);
  return 1;
}

// 回溯窗最舊的一筆＝約 TAKEOFF_LOOKBACK_TICKS 個 tick 前的位置（近似起跳離地位置）；
// 開局未滿窗時退化為目前可得的最舊資料，最終退回 actor.z
function takeoffZ(actor) {
  return actor.zHistory.length > 0 ? actor.zHistory[0] : actor.z;
}

// 同隊避讓：兩人擠進 SEP_RADIUS 內時對稱讓位（每 tick 上限 SEP_PUSH）——
// 只解「穿模/疊人」的觀感問題，不動任何職責/跑位邏輯；
// 輪轉序成對檢查＋完全重合時固定軸分開＝決定論；邊界 clamp 與 applyMove 同源。
// 07-28 追修（Sawmah：「自動換位會卡在一起」）：純徑向推擠在「兩人對向穿越」
// （站位交換的交叉路徑）時頂牛死鎖——推力≥步速、又無側向分量＝誰也繞不過誰。
// 加切向滑移（垂直於連線、固定手性＝決定論）：對衝時錯身而過；
// 幅度隨重疊深度縮放＝距離 ≥ SEP_RADIUS 的靜止同伴完全不受影響
const SEP_RADIUS = 0.55;
const SEP_PUSH = 0.08; // 每 tick 讓位上限：兩人合計 0.16m/tick > 全速對衝的合攏速度
const SEP_SLIDE = 0.6; // 切向分量比例（相對徑向推力）
export function separateTeammates(state) {
  const maxX = COURT.WIDTH / 2 + COURT.FREE_ZONE - 0.2;
  const maxZ = COURT.LENGTH / 2 + COURT.FREE_ZONE - 0.2;
  for (const team of ['A', 'B']) {
    const rot = state.match.rotations[team];
    const side = TEAM_SIDE[team];
    const zLo = side === 1 ? 0.12 : -maxZ;
    const zHi = side === 1 ? maxZ : -0.12;
    for (let i = 0; i < rot.length; i += 1) {
      for (let j = i + 1; j < rot.length; j += 1) {
        const a = state.actors[rot[i]];
        const b = state.actors[rot[j]];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        if (d >= SEP_RADIUS) continue;
        if (d < 1e-6) { dx = 1; dz = 0; d = 1; } // 完全重合：固定軸分開
        const push = Math.min((SEP_RADIUS - d) / 2, SEP_PUSH);
        const px = dx / d;
        const pz = dz / d;
        // 徑向推開＋切向滑移（a、b 反向切向＝繞著彼此錯身；固定手性＝決定論）
        const nx = (px - pz * SEP_SLIDE) * push;
        const nz = (pz + px * SEP_SLIDE) * push;
        a.x = clamp(a.x - nx, -maxX, maxX);
        b.x = clamp(b.x + nx, -maxX, maxX);
        a.z = clamp(a.z - nz, zLo, zHi);
        b.z = clamp(b.z + nz, zLo, zHi);
      }
    }
  }
}

function tryAction(state, intent, ev) {
  const { rally, ball, match } = state;
  const player = state.players[intent.playerId];
  const actor = state.actors[intent.playerId];

  if (intent.action === 'serve') {
    if (state.phase !== 'serve') return;
    if (intent.playerId !== serverId(match)) return;
    if (state.tick < state.serveReadyTick) return;
    performServe(state, intent, ev);
    return;
  }

  if (state.phase !== 'rally') return;

  // W4(P4) 題5 OPP 要球：登記本波要球者（信任雙倍下注＋甜蜜區微放寬的資料底）；
  // 每波一次、走 Intent 管線（VCR 可重演）；效果全掛既有結算點——零新機制
  if (intent.action === 'call') {
    if (rally.callPid == null && player) {
      rally.callPid = intent.playerId;
      ev.push({ type: 'CALL_BALL', tick: state.tick, team: player.teamId, playerId: intent.playerId });
    }
    return;
  }

  if (intent.action === 'block') {
    // 攔網＝開啟時機窗；是否攔到在球過網瞬間結算（tryBlock）
    // 起跳時刻只在新窗開啟時記錄（連續 intent 延長窗但不重置起跳）——時機判定用
    if (actor.blockUntil < state.tick) {
      actor.blockStartTick = state.tick;
      // §十-4b 手態三檔（press/vertical/retract）：AI blockPlan 決定、隨 intent 帶入，
      // 一窗一態（窗開時定格；玩家手動攔網無 hand 欄位＝vertical，範圍⑤不在本卷）
      actor.blockHand = intent.hand ?? 'vertical';
      // 攔網時序卷 段 1（裁定 1 適用範圍）：`manual` ＝玩家手動投遞（K 鍵／攔網鈕／
      // 「立即攔網」面板）。AI（雙方）與玩家的自動跳攔都不帶這個旗標 ⇒ 一律吃物理滯空閘。
      // 玩家手動窗（48-tick 計時器）的落地段 tick 25–48 是**已記債、本卷不處理**的項目：
      // 玩家在 sim 裡沒有攔網滯空狀態，那個窗與身體無關，砍它＝砍掉玩家的攔網手感。
      actor.blockManual = intent.manual === true;
      drainStamina(state, intent.playerId, STAMINA.COST_JUMP_BLOCK, ev); // W7 A1：一新窗＝一跳
    }
    actor.blockUntil = state.tick + TUNING.BLOCK_WINDOW;
    return;
  }

  // receive / set / spike / dive：觸球嘗試
  if (rally.touchLockTick === state.tick) return; // 本 tick 已有人觸球
  if (state.tick - actor.lastTouchTick < TUNING.TOUCH_COOLDOWN) return;
  if (state.tick < actor.divedUntil) return; // 魚躍倒地恢復中：不得再觸球
  // 發球飛行中，發球方全隊不得觸球（發球必須過網；掛網落回本方＝自然失分）
  if (rally.profile === 'serve' && player.teamId === rally.lastTouchTeam) return;
  // 球在對方半場（未過網）不得觸球——隔網打球只有攔網（tryBlock）一條路。
  // 沒這道閘，網前防守者的 reach 會跨網碰到對方組織中的球，
  // 又因觸球計數不分隊被記成第 4 擊——防守方莫名被吹四擊犯規的根源
  if (ball.z * TEAM_SIDE[player.teamId] < 0) return;

  // 自由人不得完成高於網上緣的攻擊（FIVB 19.3.1.2 精神；低球處理合法）
  if (intent.action === 'spike' && player.currentRole === 'libero' && ball.y > COURT.NET_HEIGHT) {
    return;
  }
  // 魚躍救球：技術資格（未學不會撲）；出手即倒地——撲空一樣躺（風險換範圍）
  const isDive = intent.action === 'dive';
  if (isDive && (player.techniques?.dive ?? 1) < 1) return;
  if (isDive) {
    actor.divedUntil = state.tick + TUNING.DIVE_RECOVER_TICKS;
    drainStamina(state, player.id, STAMINA.COST_DIVE, ev); // W7 A1：撲空也扣（出手即倒地）
  }

  // §十-1：構不構得到由 reach.js 單一決定（改制前是水平圓／舉球上限／扣球上限／
  // 魚躍四條各自為政的閾值）。Phase 5 W1 §5 A3 跳舉是**唯一**吃 intent.jump 的地方——
  // 跳起來出手＝可及頂端從站立摸高抬到起跳摸高，於是二傳更早、在更高處接管這顆球。
  // 之後的每一行（目標、散佈、弧頂、力度）都不看 intent.jump ⇒ 球的威力零變化。
  const vol = reachVolumeFor({
    player,
    actor,
    action: intent.action,
    jump: intent.jump,
    jumpMul: staminaPerfMul(state, player),
    tuning: TUNING,
    inflate: REACH_INFLATE,
  });
  const { ok, dist } = ballInReach(ball, vol);
  if (!ok) return;

  executeTouch(state, intent, player, actor, ev, dist);
}

function executeTouch(state, intent, player, actor, ev, dist = 0) {
  const { rally, ball } = state;
  const team = player.teamId;
  // §十-4：換方持球＝上一拍舉球檔位失效（快攻分類只認同一波持球內的舉球，
  // 防跨波/跨 possession 殘留把普通扣球誤分成快攻）
  if (team !== rally.possession) {
    rally.lastSetKind = null;
    // 換方持球＝上一隊的爛一傳與你無關（清空點三處：這裡、發球、死球結算）
    rally.passOffset = null;
    rally.passTeam = null;
  }
  // 觸球數屬於持球方：非持球方的觸球（如攔網回彈落在對側）從 1 起算，
  // 不得繼承前一隊的計數——共用計數器曾把防守方第一觸誤記成第 4 擊
  const newCount = team === rally.possession ? rally.touches + 1 : 1;

  // 規則：觸球上限 3（第 4 次觸球即犯規）
  if (isFourHits(newCount)) {
    settlePoint(state, otherTeam(team), 'FOUR_HITS', ev);
    return;
  }
  // 規則：後排攻擊限制（後排球員於前區、高於網上緣完成攻擊＝違例）。
  // 用回溯窗位置（takeoffZ）近似起跳離地瞬間，而非觸球當下位置——
  // 助跑扣球時人本就會在空中前飄越線，真規則看的是起跳腳位置，不是觸球位置。
  // TODO Phase 2：換成真正的滯空狀態機（記錄實際起跳 tick）取代此近似
  if (
    intent.action === 'spike' &&
    isBackRow(state.match.rotations[team], player.id) &&
    isInFrontZone(team, takeoffZ(actor)) &&
    ball.y > COURT.NET_HEIGHT
  ) {
    settlePoint(state, otherTeam(team), 'BACK_ROW_ATTACK', ev);
    return;
  }

  // 依動作解球路；精度屬性決定落點散佈（control；發球用 serve 屬性）
  const from = { x: ball.x, y: ball.y, z: ball.z };
  // H3：扣球帶視線欺敵——θ 越大越可能騙過攔網（線性），但自身落點越飄（平方）
  const dec = intent.action === 'spike'
    ? computeDeception(from, intent.aim, intent.gaze)
    : { deceiveP: 0, errorBoost: 0 };
  // 假動作熟練度（stage 3）：騙敵成功率×使用次數乘子（生涯 0.6 起步→1.2；預設 1.0 不變）
  if (dec.deceiveP > 0) dec.deceiveP *= feintMasteryMul(player);
  // 高低手球質（接球）×出手品質（扣球甜蜜區/超蓄）：都收斂到散佈乘數
  // 接球另吃 Perfect 時機（timing≥0.95＝球到瞬間出手，一傳更準）
  const rawT = intent.timing ?? 1;
  // 發球接發懲罰（只吃發球首觸；魚躍視同接球）：飄浮＝不轉難墊、跳發＝球快難接
  const isReceiveLike = intent.action === 'receive' || intent.action === 'dive';
  const serveRecvMul = rally.profile === 'serve' && isReceiveLike
    ? (rally.serveStyle === 'float' ? TUNING.FLOAT_RECEIVE_MUL
      : rally.serveStyle === 'power' ? TUNING.POWER_SERVE_RECEIVE_MUL : 1)
    : 1;
  // 接球品質＝到位程度（dist：走到球正下方＝穩、勉強搆＝飄）×控制屬性×Perfect 時機×
  // 來球難度。魚躍一律用正常 reach 算到位比例＝r 恆偏大＝勉強救起（撲救本就飄）
  // W7 B1：氣勢進散佈（全動作一致；氣勢差＝手緊＝散佈/失誤率微升，±封頂 8%）
  // ★ 2026-08-03 收斂殘留清算 #4（難度重校卷 題 C）★ 第二參數是「到位程度」的**分母**，
  // 原本寫死 `TUNING.REACH_RADIUS`(1.3)＝基準 A 舊值。`CONVERGE_T` 收斂到 1 後真實接球
  // 可及是 0.38×身高（175cm ⇒ 0.665）⇒ `r = dist/reach` 被**系統性低估**：
  // 一顆 dist=0.6 的球實際已在可及邊緣（0.90），卻被算成 0.46「還算到位」。
  // 後果＝全體（雙方）接球品質被高估，且 r 的值域被壓在 [0, 0.51] ⇒ 位置修正乘數
  // 只用到 [0.9, 1.002]（設計值域是 [0.9, 1.1]）＝「走位深度」這個設計維度**幾乎沒在作用**。
  // 上一行註解「魚躍一律用正常 reach 算到位比例」的設計意圖不變——魚躍的 dist 遠大於
  // 接球可及，`receiveQualityMul` 內部 `Math.min(1, …)` 仍把它夾成 r=1（勉強救起）。
  const qualityMul = (isReceiveLike
    ? receiveQualityMul(dist, receiveReachOf(player), player) * receivePerfectMul(rawT)
      * serveRecvMul * staminaRecvMul(state, player) // W7 A2：重度疲勞手軟（餵爆接湧現）
    : intent.action === 'spike'
      // W4 題5：要球者的甜蜜區微放寬（callPid＝本波要球者；非傷害加成、只放時機窗）
      ? timingQualityMul(rawT, rally.callPid === player.id ? TUNING.CALL_SWEET_WIDEN : 0)
      : 1) * momentumScatterMul(state, team);
  // 爆接判定（僅第一觸的接球類；純 hash 不動 rng 流——非爆接時間線 rand 消費順序不變）：
  // 品質乘數（含發球/重扣壓迫）超過門檻→機率把出球換成低平噴射（真噴）
  const blownQ = isReceiveLike && newCount === 1
    ? qualityMul * (rally.profile === 'spike' ? TUNING.BLOWN_SPIKE_PRESSURE : 1)
    : 0;
  const blown = blownQ > TUNING.BLOWN_Q_MIN
    && blownHash(state, player.id) < Math.min(
      TUNING.BLOWN_CHANCE_MAX,
      (blownQ - TUNING.BLOWN_Q_MIN) * TUNING.BLOWN_CHANCE_SLOPE,
    );
  const target = blown
    ? blownTarget(state, from, player.id)
    : scatterTarget(
      state, intent.aim, player.attributes.control, intent.action,
      dec.errorBoost, qualityMul,
    );
  // 力度：封頂 1；超蓄（放太晚）力度也掉——手型跑掉了
  const timing = rawT > TUNING.OVERCHARGE_T ? Math.min(clamp01(rawT), 0.85) : clamp01(rawT);
  let v;
  let toolSpike = false;
  if (intent.action === 'spike') {
    // 蓄力輕重：timing 短＝輕吊（慢、弧墜）、蓄滿＝重扣（全速）
    // W7 A2：疲勞折力量（AI 預判 spikeClearsNet 用全值＝不自知累了——W8 才考慮行為差異）
    const speed = spikeSpeed(player) * staminaPerfMul(state, player)
      * (TUNING.TIP_SPEED_MIN + (1 - TUNING.TIP_SPEED_MIN) * timing);
    // §十-4 彈道自由度：過網高度隨攻擊型態（route 帶）×出手品質（帶內位置）分岔
    let aimT = target;
    let clearance = spikeClearanceFor(spikeRouteAt(state, team, actor.z, timing), timing);
    // §十-4b tool 路線（打手出界的意圖半邊）＝**側緣 wipe**：非輕吊、無假動作、
    // 原目標被牆蓋住時，有機率改打「牆外側手的側緣帶→邊線外」。
    // 為什麼是側緣不是頂帶：側緣是確定性擦手區（不吃跳躍相位），過網高度維持
    // route 帶＝牆構得到；頂帶 tool 實測連結率 7-10% 且對瞄準高度不敏感＝結構性
    // 連不上（掃描紀錄見 kickoff 十-4b §七.5）。與 deceive 同層擇一（裁定 Q1 乙）。
    // 賭局：牆跳準＝擦側緣、球被向外撥出邊線帶（攔網方失分）；牆沒跳/跳晚/縮手
    // ＝球沿原線飛出邊線（自打出界）——出界保證量閘先驗過才敢打
    if (timing > 0.45 && dec.deceiveP === 0
      && blownHash(state, `${player.id}:tool`) < TUNING.TOOL_CHANCE) {
      const ref = toolBlockerFor(state, team, from, target);
      if (ref) {
        const dirOut = ref.x >= 0 ? 1 : -1; // 朝較近邊線那側的外側手
        const xEdge = ref.x + dirOut * TUNING.BLOCK_REACH_X * (1 - TUNING.BLOCK_EDGE_FRAC / 2);
        const zMid = -Math.sign(from.z) * TUNING.TOOL_TARGET_Z;
        const tNet = from.z / (from.z - zMid); // from→目標直線過網（z=0）的比例
        const xLand = from.x + (xEdge - from.x) / tNet; // 過網恰在 xEdge 時的落點 x
        // 出界保證量閘：沒擦到時球要真的出邊線；角度拉不出去（正對牆心）就不 wipe
        if (Math.abs(xLand) >= COURT.WIDTH / 2 + TUNING.TOOL_OUT_DEPTH) {
          aimT = { x: xLand, z: zMid };
          toolSpike = true;
        }
      }
    }
    v = spikeVelocity(
      from,
      { x: aimT.x, y: BALL.RADIUS, z: aimT.z },
      speed,
      TUNING.SPIKE_MIN_TIME,
      clearance,
    );
  } else {
    let apex = TUNING.RECEIVE_APEX;
    if (blown) {
      apex = TUNING.BLOWN_APEX;
    } else if (intent.action === 'set') {
      const kind = rawT < 0.5 ? 'quick' : rawT < 0.65 ? 'shoot' : 'high';
      rally.lastSetKind = { team, kind }; // §十-4：下一拍扣球的快攻分類資料底
      apex = kind === 'quick' ? TUNING.QUICK_APEX
        : kind === 'shoot' ? TUNING.SHOOT_APEX : TUNING.SET_APEX;
    }
    v = velocityForApex(from, { x: target.x, y: BALL.RADIUS, z: target.z }, apex);
  }
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;

  // ★ 爆接／poor 一傳卷 階段 A：純記帳（本階段零消費者，行為必須逐值不變）★
  // 第一觸＝一傳 ⇒ 量它會落到離二傳站位多遠。取樣時點是**觸球當下的乾淨彈道**，
  // 與 `ai.js` 現行 `ensureFlightPlan` 的取樣（晚 1 tick 以上）不同——階段 B 讓
  // `passTierOf` 改吃這一份時，邊界附近的檔位會翻幾格，屆時要驗 tier 分佈仍在
  // 87.0/8.0/4.9 ±1pp。
  if (newCount === 1) {
    const land = predictLanding(ball);
    const spot = localToWorld(team, SETTER_SPOT.lx, SETTER_SPOT.lz);
    rally.passOffset = land ? Math.hypot(land.x - spot.x, land.z - spot.z) : null;
    rally.passTeam = team;
  }

  // stage 5 情蒐統計：扣球線路/假動作進 intent 分佈（跨場累積由生涯層收走）
  if (intent.action === 'spike') {
    const zone = classifySpikeZone(actor.x, intent.aim.x, timing);
    rally.lastSpikeZone = zone;
    const tal = scoutTallyOf(state, player.id);
    tal.zones[zone] += 1;
    tal.spikes += 1;
    // Q4 資料層：路線記帳——只有協調層選定的攻擊手扣球時 intent 才帶 routeKind
    // （見 ai.js／matchControls.js 的記帳規則），不耗 rng、不影響任何判定
    if (intent.routeKind && tal.routes[intent.routeKind] !== undefined) {
      tal.routes[intent.routeKind] += 1;
    }
    if (dec.deceiveP > 0) tal.feints += 1;
  } else {
    rally.lastSpikeZone = null;
  }
  rally.touches = newCount;
  rally.possession = team;
  rally.lastTouchTeam = team;
  rally.lastToucherId = player.id;
  rally.deceiveP = dec.deceiveP;
  rally.profile = intent.action === 'spike' ? 'spike' : 'arc';
  rally.flightId += 1;
  rally.touchLockTick = state.tick;
  actor.lastTouchTick = state.tick;

  ev.push({
    type: 'TOUCH', tick: state.tick, team, playerId: player.id,
    kind: intent.action, touches: newCount,
    ...(toolSpike ? { tool: true } : {}), // §十-4b：這一扣走了 tool 路線（觀測用）
    ballY: Math.round(from.y * 100) / 100, // 擊球高度：表現層分高手/低手動作與音效用
    power: Math.round(timing * 100) / 100, // 蓄力品質：表現層分輕吊/重扣音效用
    dist: Math.round(dist * 100) / 100, // 到位程度：接球品質來源（表現層可做勉強救球動作/音效）
    ...(blown ? { blown: true } : {}), // 爆接標記（播報/探針用）
    // §5 A3 跳舉標記（表現層/播報/探針用；不參與任何判定）——攔網手要讀的線索
    // 「二傳是否跳舉」在事件流裡就看得到，不必去翻協調層狀態
    ...(intent.action === 'set' && intent.jump ? { jumpSet: true } : {}),
  });

  // W7 A1 消耗（本次觸球的品質判定用的是觸球前體力——疲勞在動作之後才上身）：
  // 觸球者按動作計費（魚躍已在 tryAction 出手瞬間扣）＋場上全員每拍小額（長 rally 張力）
  if (state.stamina) {
    const actionCost = intent.action === 'spike' ? STAMINA.COST_SPIKE
      : intent.action === 'receive' ? STAMINA.COST_BUMP
        : intent.action === 'set' ? STAMINA.COST_SET : 0;
    if (actionCost > 0) drainStamina(state, player.id, actionCost, ev);
    for (const t of ['A', 'B']) {
      for (const pid of state.match.rotations[t]) {
        drainStamina(state, pid, STAMINA.COST_RALLY_TOUCH, ev);
      }
    }
  }
}

// 爆接噴射落點：沿來球水平動量方向偏轉（hash 角 ±75°）、距離 2.5-5.5m——
// 手臂沒吃住球、球帶著動量彈飛。夾限自由區內（球員活動範圍＝救援有戲）；
// 不鎖半場＝可能噴過網（亂槍過網的真實混亂）
function blownTarget(state, from, playerId) {
  const { ball } = state;
  const sp = Math.hypot(ball.vx, ball.vz);
  const bx = sp > 0.3 ? ball.vx / sp : 0;
  const bz = sp > 0.3 ? ball.vz / sp : (from.z >= 0 ? 1 : -1);
  const ang = (blownHash(state, `${playerId}:a`) - 0.5) * (Math.PI * 5 / 6); // ±75°
  const dist = 2.5 + blownHash(state, `${playerId}:b`) * 3;
  const dx = bx * Math.cos(ang) - bz * Math.sin(ang);
  const dz = bx * Math.sin(ang) + bz * Math.cos(ang);
  const mx = COURT.WIDTH / 2 + COURT.FREE_ZONE - 0.6;
  const mz = COURT.LENGTH / 2 + COURT.FREE_ZONE - 0.6;
  return {
    x: clamp(from.x + dx * dist, -mx, mx),
    z: clamp(from.z + dz * dist, -mz, mz),
  };
}

// 爆接專用 hash（FNV 風格：flightId×鍵×種子）：決定論且不消費 game rng——
// 爆接判定不改變非爆接時間線的 rand 順序
function blownHash(state, key) {
  let h = (Math.imul(state.rally.flightId + 1, 2654435761) ^ (state.seed ?? 0)) >>> 0;
  for (const ch of String(key)) {
    h = (h ^ ch.codePointAt(0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// 規則引擎配接層：把單點球員轉成 rotationRules 的 lineup（隊伍視角座標）
// 現行 sim 無腳部模型＝每人一隻虛擬腳；發球階段無跳躍＝恆著地
export function lineupOf(state, team) {
  const side = TEAM_SIDE[team];
  const sid = serverId(state.match);
  return state.match.rotations[team].map((pid, idx) => {
    const a = state.actors[pid];
    return {
      zone: idx + 1,
      feet: [{ x: side * a.x + COURT.WIDTH / 2, y: side * a.z, grounded: true }],
      isServer: pid === sid && team === state.match.servingTeam,
    };
  });
}

function performServe(state, intent, ev) {
  const { ball, rally } = state;
  const player = state.players[intent.playerId];
  const actor = state.actors[intent.playerId];
  const team = player.teamId;

  // 7.5 位置錯誤：發球擊球瞬間判接發球方站位（7.4 發球方全隊豁免輪轉站位、
  // 僅檢場內包含）；犯規＝發球方直接得分、球不發出
  const recv = otherTeam(team);
  const recvCheck = isRotationLegal(lineupOf(state, recv), false);
  const servCheck = isRotationLegal(lineupOf(state, team), true);
  const faulty = !recvCheck.legal ? recv : !servCheck.legal ? team : null;
  if (faulty) {
    ev.push({
      type: 'POSITIONAL_FAULT', tick: state.tick, team: faulty,
      faults: (faulty === recv ? recvCheck : servCheck).faults,
    });
    settlePoint(state, otherTeam(faulty), 'POSITIONAL_FAULT', ev);
    return;
  }

  // 7.7 輪轉錯誤（W6 B4 接線兌現，W3 預留）：發球者對照「登記發球序」（serveSeq——
  // 開局輪轉＋合法換人槽位繼承）。合法路徑（ROTATE 前進/換人 applySubstitution/自由人
  // 體系）下結構上不違序；違序＝rotations 被未經預檢的路徑改動＝sim 最後防線：
  // 記首次違序 tick（每隊一次），比賽照打、賽末 SET_END 依 7.7.2 追溯扣分
  // （cancelFaultPoints：犯規隊自 faultTick 起得分全取消、對隊保留——見 settlePoint）
  const seq = state.serveSeq[team];
  if (
    state.rotationFault[team] === null &&
    !isRotationOrderLegal(player.id, seq.order, seq.nextIdx)
  ) {
    state.rotationFault[team] = state.tick;
    ev.push({
      type: 'ROTATION_FAULT', tick: state.tick, team,
      server: player.id, expected: seq.order[seq.nextIdx % seq.order.length],
    });
  }

  const contactY = Math.max(spikeReach(player, staminaPerfMul(state, player)) * 0.92, 2.2); // 跳發擊球點
  ball.x = actor.x; ball.y = contactY; ball.z = actor.z;
  // 發球三式：穩定（預設）／跳躍（timing>1.1：低平快＋散佈放大——力量換準度）
  // ／飄浮（style 'float'：弧較平、自身散佈略增，殺傷在對方接發品質懲罰）
  const power = (intent.timing ?? 1) > 1.1;
  const float = !power && intent.style === 'float';
  // 跳發也記式樣（原本只記 float）——接發懲罰要吃得到跳發，否則跳發只是自己球快、
  // 對接發方毫無額外難度（07-23 補：跳發跳飄都更難接）
  rally.serveStyle = power ? 'power' : float ? 'float' : null;
  // 清空點之二（爆接卷）：發球＝新的一波，上一波的一傳偏移作廢
  rally.passOffset = null;
  rally.passTeam = null;
  // 情蒐統計：發球風格偏好
  const stal = scoutTallyOf(state, player.id).serves;
  stal.total += 1;
  if (power) stal.jumps += 1;
  if (float) stal.floats += 1;
  const target = scatterTarget(
    state, intent.aim, player.attributes.serve, 'serve', 0,
    (power ? TUNING.POWER_SERVE_SCATTER : float ? TUNING.FLOAT_SCATTER : 1)
      * momentumScatterMul(state, team) // W7 B1：氣勢進發球散佈
      // 疲勞→發球準度（`stamina.js` 有完整理由）：滿體力恆 1＝三式數字逐值不變，
      // 掉檔之後才開始不準，且**越吃體力的式子受影響越大**
      * staminaServeScatterMul(state, player, power ? 'power' : float ? 'float' : 'stand'),
  );
  const apex = Math.max(
    power ? TUNING.POWER_SERVE_APEX
      : float ? TUNING.SERVE_APEX * TUNING.FLOAT_APEX_MUL : TUNING.SERVE_APEX,
    contactY + 0.35,
  );
  const v = velocityForApex(ball, { x: target.x, y: BALL.RADIUS, z: target.z }, apex);
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;

  rally.touches = 0; // 發球不計入受球方的 3 次觸球
  rally.possession = team;
  rally.lastTouchTeam = team;
  rally.lastToucherId = player.id;
  rally.deceiveP = 0;
  rally.profile = 'serve';
  rally.flightId += 1;
  rally.serveTick = state.tick; // 真飄相位起點（飄浮發球側向亂流的時間基準）
  actor.lastTouchTick = state.tick;

  state.phase = 'rally';
  ev.push({ type: 'SERVE', tick: state.tick, team, playerId: player.id });
  // W7 A1 → 2026-08-10 改三檔（裁定：飄浮不得再白拿）：跳發大額 > 飄浮中額 > 站發極低。
  // 三檔的順序與 `rally.serveStyle` 的三個值一一對應，別再讓任何一式共用別人的價目。
  drainStamina(state, player.id, power ? STAMINA.COST_JUMP_SERVE
    : float ? STAMINA.COST_SERVE_FLOAT : STAMINA.COST_SERVE_STAND, ev);
}

// 扣球速度：power 屬性推導；AI 過網預判（ai.js spikeClearsNet）用同一函式
export function spikeSpeed(player) {
  return TUNING.SPIKE_SPEED_BASE + player.attributes.power * TUNING.SPIKE_SPEED_PER;
}

// §十-4 彈道自由度：擊球當下的攻擊型態分類（sim 實際擊球與 AI 預判共用，不得各自手刻）。
// tip＝輕蓄力；back＝攻擊線後起扣；quick＝我方上一拍是快攻檔舉球；其餘＝兩翼強攻
export function spikeRouteAt(state, team, actorZ, timing) {
  if (timing <= TUNING.TIP_CLEAR_T) return 'tip';
  if (Math.abs(actorZ) > COURT.ATTACK_LINE) return 'back';
  const ls = state.rally.lastSetKind;
  if (ls && ls.team === team && ls.kind === 'quick') return 'quick';
  return 'wing';
}

// §十-4：型態帶 × 出手品質 → 這一球的目標過網高度。timing 好→帶下緣（貼網敢壓）、
// 差→帶上緣（被推高）；輕吊帶內反向同理（蓄越接近檔位上限＝越貼下緣的尖銳吊）
export function spikeClearanceFor(route, timing) {
  const [lo, hi] = TUNING.SPIKE_CLEARANCE[route];
  const t = TUNING.TIP_CLEAR_T;
  const qn = route === 'tip'
    ? clamp01(timing / t)
    : clamp01((timing - t) / (1 - t));
  return hi - qn * (hi - lo);
}

// W7 B1 氣勢散佈乘數（純讀取）：該隊氣勢滿檔 ×(1−CAP)＝出手穩、
// 對向滿檔 ×(1+CAP)＝手緊失誤多；未啟用恆 1。只進散佈、不動力量/速度（防雪球）
export function momentumScatterMul(state, team) {
  if (!state.momentum) return 1;
  const dir = team === 'A' ? 1 : -1;
  const t = (state.momentum.value * dir) / TUNING.MOMENTUM_MAX;
  return 1 - t * TUNING.MOMENTUM_SCATTER_CAP;
}

// W8 氣勢逐檔恢復加成（純讀取；07-26 Sawmah 拍板）：氣勢偏向該隊時，每檔＝
// 死球間隙全隊額外回 MOMENTUM_RECOV_PER_STEP（+2 檔＝雙倍加成，滿檔最多）；
// 氣勢未啟用、歸中、或偏向對方＝0。setupServePhase 消費；純算術零 rng
export function momentumRecovBonus(state, team) {
  if (!state.momentum) return 0;
  const dir = team === 'A' ? 1 : -1;
  const steps = state.momentum.value * dir;
  return steps > 0 ? steps * TUNING.MOMENTUM_RECOV_PER_STEP : 0;
}

// H3 視線欺敵（純函式）：由擊球點、實際目標、視線目標算出
// θ（水平夾角）、騙過攔網機率（線性）、自身失誤增量（平方）
export function computeDeception(from, aim, gaze) {
  const NIL = { theta: 0, deceiveP: 0, errorBoost: 0 };
  if (!gaze || (gaze.x === aim.x && gaze.z === aim.z)) return NIL;
  // 退化護欄：瞄準點或視線點與擊球點重合 → atan2(0,0) 會算出假角度、假拉滿欺敵
  if ((aim.x === from.x && aim.z === from.z) ||
      (gaze.x === from.x && gaze.z === from.z)) return NIL;
  const aimAngle = Math.atan2(aim.x - from.x, aim.z - from.z);
  const gazeAngle = Math.atan2(gaze.x - from.x, gaze.z - from.z);
  let diff = Math.abs(aimAngle - gazeAngle);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  const theta = (diff * 180) / Math.PI;
  const t = Math.min(theta / TUNING.THETA_MAX_DEG, 1);
  return {
    theta,
    deceiveP: t * TUNING.DECEIVE_GAIN,
    errorBoost: t * t * TUNING.ERROR_GAIN,
  };
}

// 出手品質（純函式）：蓄力進度 t（可>1）→散佈乘數。甜蜜區線性外皆 1、超蓄劣化。
// widen（W4 題5）：甜蜜區窗兩側微放寬（要球者的品質提升——時機窗變寬、上限不變）
export function timingQualityMul(t, widen = 0) {
  if (t >= TUNING.SWEET_LO - widen && t <= TUNING.SWEET_HI + widen) return TUNING.SWEET_ACC;
  if (t > TUNING.OVERCHARGE_T) return TUNING.OVER_ACC;
  return 1.0;
}

// Perfect 接球（純函式）：球到瞬間出手（timing≥0.95）＝一傳更準
export function receivePerfectMul(t) {
  return t >= 0.95 ? TUNING.PERFECT_RECV_ACC : 1;
}

// §十 階段二 2-B：`blockTimingMul` 已拆除。時機改由幾何承載——
// 見 `player.js` 的 `blockTopEdge(p, t, jumpMul)`（頂邊隨跳躍相位升降）。
// 攔網結算區不得再出現任何乘數式的時機修正（`tests/mechanics.test.mjs` 有靜態掃描護欄）。

// 接球品質（純函式，07-23 改版）：主軸＝接球技術（control 手穩＋reaction 判斷到位），
// 自由人最高＝接球最好；次要＝到位程度（走到球正下方微獎、勉強搆微罰）。取代舊「觸球
// 高度」判準——低姿勢墊球不再冤枉。技術主導的理由：實測 AI 接球 dist≈1.1 不分角色
// （球進範圍就接），純到位既無法讓自由人突出、又會全隊崩盤（見 TUNING.RECV_* 註）。
/**
 * 接球「到位程度」的**分母**——單一具名來源。
 *
 * ★ 為什麼要抽成具名 export（對抗審查 HIGH-3）★
 * 這個分母原本直接寫在呼叫端（`TUNING.REACH_RADIUS`，基準 A 舊值 1.3）。清算改對之後，
 * 審查指出**沒有任何測試能抓到它被改回去**——`tests/mechanics.test.mjs:181/190` 測的是
 * `receiveQualityMul` 這個純函式本身、分母由測試自己傳入，呼叫端傳什麼它都不知道。
 * 抽成具名函式之後，「分母該是什麼」變成一條可斷言的契約
 * （守門測試＝`tests/mechanics.test.mjs` 的「接球到位程度的分母必須是收斂後的可及半徑」）。
 */
export function receiveReachOf(player) {
  return reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, player?.height?.current ?? null);
}

export function receiveQualityMul(dist, reach, player) {
  const a = player.attributes;
  const skill = (a.control + a.reaction) / 2; // 接球技術
  const base = Math.max(
    0.5, TUNING.RECV_BASE_MAX - (skill - TUNING.RECV_SKILL_MIN) * TUNING.RECV_BASE_SLOPE,
  );
  const r = Math.min(1, Math.max(0, dist) / reach); // 到位程度（次要修正）
  return base * (TUNING.RECV_POS_MIN + TUNING.RECV_POS_RANGE * r);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// 落點散佈：精度屬性越高越準；兩次 rand 呼叫（角度、半徑），順序固定＝決定論
// extraInaccuracy：H3 欺敵的失誤增量（平方項）；qualityMul：高低手球質乘數
function scatterTarget(state, aim, accuracyAttr, action, extraInaccuracy = 0, qualityMul = 1) {
  const factor =
    action === 'set' ? 0.55 : action === 'spike' ? 1.2 : action === 'serve' ? 1.35 : 1.0;
  const r = TUNING.SCATTER_MAX *
    ((1 - accuracyAttr / 100) * factor * qualityMul + extraInaccuracy);
  const angle = rand(state) * Math.PI * 2;
  const radius = rand(state) * r;
  return { x: aim.x + Math.cos(angle) * radius, z: aim.z + Math.sin(angle) * radius };
}

// ---- 物理推進與裁決 ----

function stepRally(state, ev) {
  const b = state.ball;
  const prevZ = b.z;
  const prevY = b.y;
  // 真飄（07-24 拍板）：飄浮發球飛行中（首觸前）施加側向亂流加速度——力道曲線由
  // seed×flightId hash 導出（決定論：同種子重演逐 tick 一致，非隨機）。
  // 刻意住在 game 層而非 stepBall：predictLanding／AI 接觸點／玩家落點圈全用乾淨
  // 彈道＝「不含飄」→ 接球方站位被騙是有機的（真實飄浮球的殺傷本體）。
  // 過首觸即停（profile 換 arc/spike）；接發品質懲罰 FLOAT_RECEIVE_MUL 同輪下調防雙重懲罰
  if (state.rally.profile === 'serve' && state.rally.serveStyle === 'float') {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 1e-6) {
      const t = (state.tick - (state.rally.serveTick ?? state.tick)) * SIM_DT;
      const ph = blownHash(state, 'fd1') * Math.PI * 2;
      const ph2 = blownHash(state, 'fd2') * Math.PI * 2;
      const nx = -b.vz / sp; // 側向單位向量（垂直於飛行方向）——先取樣再改速度
      const nz = b.vx / sp;
      const acc = (Math.sin(t * 5.1 + ph) + 0.6 * Math.sin(t * 9.7 + ph2)) * TUNING.FLOAT_DRIFT_ACC;
      b.vx += nx * acc * SIM_DT;
      b.vz += nz * acc * SIM_DT;
    }
  }
  // 上旋急墜（2026-08-10 Sawmah 裁定「跳發＝容易接噴＋ACE、但失誤率也高」）：
  // 跳發的強烈上旋 ⇒ Magnus 力向下 ⇒ 球比乾淨拋物線**更早急墜**，接球者用乾淨彈道
  // 預判會**判深、站在球後面**。與飄浮成對比：飄浮＝左右飄、跳發＝縱向墜，觀感分得開。
  // ★ 範式逐條照抄上面那段真飄（07-24 拍板）★ 住在 game 層而非 `stepBall`
  // ⇒ `predictLanding`／AI 接觸點／玩家落點圈全走乾淨彈道＝「站位被騙是有機的」；
  // 條件 `serveStyle === 'power'`、過首觸即停（applyTouch 把 profile 換成 arc/spike）。
  // ★ 為什麼是「純向下加速度」而不是「沿速度方向的水平減速」★
  //   ① 物理上就對：上旋球的 Magnus 力方向≈垂直於速度且朝下，向下分量是主角；
  //   ② 參數好調：`vy -= a·dt` 等價於把重力從 g 加到 g+a，落點縮短量對 a **單調且平滑**，
  //      掃描不會出現飄浮 DRIFT 那種懸崖；
  //   ③ 水平減速會**拉長**飛行時間＝反而多給接球者反應時間，與「急墜殺傷」相反。
  // ★ 每顆球的上旋量不同（`blownHash` 逐 flight 取一次，決定論、整段飛行同值）★
  //   **這不是裝飾，是可調性的前提**：初版寫成固定值時實測是**懸崖**——
  //   APEX 4.6 下 DROP 1.0＝ACE 1.3%、DROP 2.0＝ACE 84.8%，中間沒有可用的帶
  //   （急墜量固定 ⇒ 接球者的餘裕要嘛蓋得住、要嘛全蓋不住，全有全無）。
  //   改成 `2 × hash` 的均勻分佈（值域 [0, 2a]、期望值仍是 a）後，跨過臨界的**比例**
  //   隨 a 線性上升 ⇒ ACE 率變成可以逐格掃出來的平滑曲線。真飄用 hash 導相位是同一招。
  // ⚠ 與 `collideNet` 的互動＝設計的一部分：墜得越兇掛網越多，那份掛網算進失誤率。
  if (state.rally.profile === 'serve' && state.rally.serveStyle === 'power') {
    b.vy -= TUNING.POWER_DROP_ACC * 2 * blownHash(state, 'pd') * SIM_DT;
  }
  stepBall(b, SIM_DT);

  // 過網（z 正負翻越；掛網被彈回不算過網——collideNet 已把 z 還原回原側）
  const crossed = (prevZ > 0) !== (b.z > 0) && prevZ !== b.z;
  let blocked = false;
  if (crossed) {
    const toTeam = b.z > 0 ? 'A' : 'B';
    blocked = state.rally.profile === 'spike' && tryBlock(state, toTeam, ev);
    if (!blocked) {
      state.rally.possession = toTeam;
      state.rally.touches = 0;
      ev.push({ type: 'BALL_OVER_NET', tick: state.tick, toTeam });
    }
  }

  // 落地（本 tick 首次觸地）。剛被攔到的球以攔網後的新速度續飛，
  // 本 tick 的舊位置是過時資料，不得拿來做落地判定（攔網/落地禁止同 tick 交錯裁決）
  if (!blocked && prevY > BALL.RADIUS + 1e-9 && b.y <= BALL.RADIUS + 1e-9) {
    const inTeam = landedCourtTeam(b.x, b.z);
    if (inTeam) {
      settlePoint(state, otherTeam(inTeam), 'BALL_IN', ev); // 界內落地：落點半場那隊失分
    } else {
      const loser = state.rally.lastTouchTeam ?? state.match.servingTeam;
      settlePoint(state, otherTeam(loser), 'OUT', ev); // 界外：最後觸球隊失分
    }
  }
}

// 攔網結算：扣球過網瞬間，受球方前排、block 窗內、涵蓋範圍內 → 依 block 屬性擲骰
function tryBlock(state, toTeam, ev) {
  const b = state.ball;
  // 手在網上緣附近才攔得到：低於網的球（含網下穿越）一律不可攔
  if (b.y < COURT.NET_HEIGHT - 0.15) return false;
  // 【第一層】幾何閘門：在窗內、手構得到的人組成牆；帶＝各人區間的聯集，
  // 球的過網 x 落在帶內才算碰到手。多人加成由此湧現，不靠任何加成係數。
  const members = [];
  for (const p of Object.values(state.players)) {
    if (p.teamId !== toTeam) continue;
    if (!isFrontRowOf(state, toTeam, p.id)) continue;
    const actor = state.actors[p.id];
    if (actor.blockUntil < state.tick) continue;
    // §十-4b retract（縮手）：手收回不過網＝帶寬歸零，絕不被 tool——
    // 代價是這面牆對這一球完全不存在（賭對手自打出界）
    if (actor.blockHand === 'retract') continue;
    // 頂邊吃「起跳後經過幾 tick」（2-B 之前 blockTopEdge 忽略 t＝退化成跳躍頂點，
    // 行為與改制前逐值相同；換的是介面不是數值）。W7：累了跳不高
    const airT = state.tick - actor.blockStartTick;
    // ★ 攔網時序卷 段 1（Sawmah 2026-08-01 裁定 1：A＋擴大）★
    // 攔網接觸資格＝**物理滯空**。落地＝資格結束，界線就是 `AIR_TICKS`——
    // 與 `blockTopEdge` 判「這次跳躍已經結束、手回站立摸高」用的同一條線，不另立標準。
    //
    // 為什麼非有這條不可：`blockUntil` 每 tick 被 block intent 續期（見上方 intent 分支），
    // 有效窗最長到起跳後約 95 tick ≫ AIR_TICKS(24)；落地後 `blockTopEdge` 回站立摸高，
    // **仍搆得到貼手頂的低平慢球**。實測 commit 牆的攔網接觸有 76.9% 發生在落地之後
    // （read 牆 2.6%），其中 press 桶 95.6% 是站著擦到的——那不是攔網。
    //
    // ⚠ 只動這道資格閘，**不動續期本身**（改續期會讓窗過期後當場重開新窗＝原地重跳，
    // 那是第三種行為，裁定書明文禁止）。
    if (airT > AIR_TICKS && !actor.blockManual) continue;
    const top = blockTopEdge(p, airT, staminaPerfMul(state, p));
    if (overBlockerHands(b.y, top)) continue;
    members.push({ id: p.id, x: actor.x, top, p, actor });
  }
  const band = buildBand(members, TUNING.BLOCK_REACH_X);
  const { inside, contact } = bandContact(band, b.x);
  if (!inside) return false;
  const best = contact;

  // H3：攔網手被扣球者的視線騙過 → 整手撲空（機率＝欺敵線性項）。
  // BLOCK_DECEIVED 事件（07-24 Sawmah）：假動作成效從此看得見——表現層彈
  // 「晃過攔網」字卡/播報（純觀測事件，rand 消費與原版一致、零遊戲性影響）
  if (state.rally.deceiveP > 0 && rand(state) < state.rally.deceiveP) {
    ev.push({
      type: 'BLOCK_DECEIVED', tick: state.tick, team: toTeam,
      blockerId: best.p.id, spikerId: state.rally.lastToucherId,
    });
    return false;
  }

  // §十 階段二 2-B：**這裡不再有時機乘數**。
  // 起跳太晚（手還沒到頂）與太早（已在下墜）都已經在上面的幾何閘門結算掉了——
  // 頂邊 `blockTopEdge(p, airT, ...)` 隨跳躍相位升降，手不夠高就直接 `continue`，
  // 根本走不到這裡。時機打折率＝把同一件事再算一次，那是兩套標準。
  // 【第二層】邊緣區（§十-4b 起真幾何）：擦到的是不是手的邊緣，由接觸點位置決定，
  // 不再擲骰（blockBand.js classifyBlockContact；債清償——改制前是 roll 三段切
  // 的機率帶，擦手與 dx 無關）。邊緣接觸只會擦、不會攔死。
  const zone = classifyBlockContact({
    dx: best.dx, halfWidth: band.halfWidth, ballY: b.y, handTop: best.top,
    edgeFrac: TUNING.BLOCK_EDGE_FRAC, topBand: TUNING.BLOCK_TOP_BAND,
  });
  if (zone !== 'body') {
    // §十-4b press（壓網手）擦頂＝壓球：手伸過網面蓋著，頂帶的球不往後飛、
    // 被拍回攻方場內快速下墜——tool 的反制（z 深度檔位語意：手在網的另一側）。
    // 歸因同攔死（lastTouch=攔網方、球回攻方半場）
    if (zone === 'top' && best.actor.blockHand === 'press') {
      b.vz = -b.vz * 0.3;
      b.vx *= 0.5;
      b.vy = -1.2;
      const r = state.rally;
      r.touches = 0;
      r.lastTouchTeam = toTeam;
      r.lastToucherId = best.p.id;
      r.deceiveP = 0;
      r.profile = 'arc';
      r.flightId += 1;
      ev.push({
        type: 'BLOCK_TOUCH', tick: state.tick, team: toTeam, playerId: best.p.id,
        zone, pressed: true,
      });
      return true;
    }
    // 擦手（one-touch）：沒攔死但擦到手的邊緣——BLOCK_TOUCH 一樣不計 3 次觸球。
    // 方向性偏折（§十-4b）：擦到哪裡決定飛去哪裡——「打手出界」的物理成因在此。
    if (zone === 'top') {
      // 擦頂＝指尖帶：球保留大半前速衝攔網方深區／底線外，微上挑
      b.vz *= TUNING.BLOCK_GRAZE_TOP_SLOW;
      b.vx = b.vx * 0.9 + (blownHash(state, `${best.p.id}:gx`) - 0.5) * 1.0;
      b.vy = 0.9 + blownHash(state, `${best.p.id}:gy`) * 0.8;
    } else {
      // 擦側＝帶外緣：球被向外側撥（撥向球相對手中心的那一側）——改變救球幾何，
      // 多數仍留場內可救（探針實測未觸出界僅 ~6%）；出側線屬長尾
      const dir = Math.sign(b.x - best.x)
        || (blownHash(state, `${best.p.id}:gd`) < 0.5 ? -1 : 1);
      b.vz *= TUNING.BLOCK_GRAZE_SLOW;
      b.vx = dir * (1.2 + blownHash(state, `${best.p.id}:gx`) * 2.0);
      b.vy = 1.2 + blownHash(state, `${best.p.id}:gy`) * 1.0;
    }
    const r = state.rally;
    r.touches = 0;
    r.lastTouchTeam = toTeam;
    r.lastToucherId = best.p.id;
    r.deceiveP = 0;
    r.profile = 'arc';
    r.flightId += 1;
    ev.push({
      type: 'BLOCK_TOUCH', tick: state.tick, team: toTeam, playerId: best.p.id,
      graze: true, zone,
    });
    return true;
  }
  // 【第三層】屬性擲骰（手身區才走到這）：`block` 屬性**只**決定碰到之後的結果分佈，
  // 不決定有沒有碰到（那是第一層幾何的事）。stage 5 情蒐讀取＝對被讀者的慣用線收攏
  //（假動作的 deceive 骰在上方——騙贏免讀）
  const chance = (0.12 + best.p.attributes.block * 0.004) * scoutBlockMul(state, toTeam);
  if (rand(state) >= chance) return false; // 手身也沒成形（手型/時差）＝乾淨過網

  // 攔到：球被拍回攻方側上空；攔網觸球不計入 3 次觸球，雙方觸球數歸零
  b.vz = -b.vz * 0.35;
  b.vx *= 0.6;
  b.vy = 2.2;
  const r = state.rally;
  r.touches = 0;
  r.lastTouchTeam = toTeam;
  r.lastToucherId = best.p.id;
  r.deceiveP = 0;
  r.profile = 'arc';
  r.flightId += 1;
  ev.push({ type: 'BLOCK_TOUCH', tick: state.tick, team: toTeam, playerId: best.p.id });
  return true;
}

function isFrontRowOf(state, team, playerId) {
  const rot = state.match.rotations[team];
  const idx = rot.indexOf(playerId);
  return idx === 1 || idx === 2 || idx === 3; // 2/3/4 號位
}

// §十-4b tool 路線的目標牆手：對手前排、貼網 block-ready、站位蓋住這一球
// **原目標**的過網 x——回傳最近的那面「看得見的牆」。
// ⚠ 讀站位不讀窗：實測攔網窗在扣球後 3-4 tick 才開（tools/ 下 debug 實測），
// 出手瞬間讀窗＝永遠看不到牆。攻擊手看得見的是「誰站在我的線上準備跳」；
// 他會不會準時跳、跳了縮不縮手，出手時**看不見**——這正是 tool 的賭局本體：
// 跳準了＝擦頂打手出界（攔網方失分），跳晚／縮手＝整球飛出底線（自付）。
// 反作弊：只讀前排站位（x/z 公開資訊），不讀 blockPlan/blockHand。
function toolBlockerFor(state, team, from, target) {
  const opp = otherTeam(team);
  const tN = from.z / (from.z - target.z);
  if (!(tN > 0 && tN < 1)) return null;
  const crossX = from.x + (target.x - from.x) * tN;
  let ref = null;
  for (const p of Object.values(state.players)) {
    if (p.teamId !== opp) continue;
    if (!isFrontRowOf(state, opp, p.id)) continue;
    const a = state.actors[p.id];
    // 窗開＝出手瞬間**已經跳在空中**的牆才 tool 得到。read 晚跳（等球出手才拔）
    // ＝天然免疫 tool；commit 早跳（賭在先）＝把手亮給了攻擊手——persona 的代價結構。
    // 實測（kickoff 十-4b §七.5）：讀站位不讀窗時 read 牆連結率 <10%（時序永遠對不上），
    // tool 的有效域就是「看得見的窗」
    if (a.blockUntil < state.tick) continue;
    if (Math.abs(a.z) > TUNING.TOOL_SEE_DEPTH) continue;
    const dx = Math.abs(a.x - crossX);
    if (dx > TUNING.BLOCK_REACH_X) continue;
    if (!ref || dx < ref.dx || (dx === ref.dx && p.id < ref.p.id)) ref = { x: a.x, dx, p };
  }
  return ref;
}

// 一分結算：把 match 事件補上 tick 收進事件流，接著佈置下一球或收局
// DEAD_BALL 事件附上球當下座標（落點/犯規點），供回放與 UI 用
function settlePoint(state, winner, reason, ev) {
  // stage 4 信任動態歸因：攻擊直接定勝負的球——殺進＝＋、打出界＝−（連續加碼）
  // 只認乾淨歸因（最後觸球＝扣球）；攔網回彈等混合責任不記帳
  const r = state.rally;
  // 清空點之三（爆接卷）：死球＝這一波結束。三處缺一都會讓上一波的一傳偏移
  // 殘留到下一波（本專案已因「清空點漏一處」踩過三次，見 ai.js:400-411 的逐字紀錄）
  r.passOffset = null;
  r.passTeam = null;
  if (r.profile === 'spike' && r.lastToucherId) {
    // W4 題5：要球者的信任雙倍下注——要了球又是這記攻擊的歸因者＝升降幅同倍放大
    const mul = r.callPid === r.lastToucherId ? TUNING.CALL_TRUST_MUL : 1;
    const scored = reason === 'BALL_IN' && r.lastTouchTeam === winner;
    if (scored) {
      applyAttackOutcome(state, r.lastToucherId, true, mul);
    } else if (reason === 'OUT' && r.lastTouchTeam !== winner) {
      applyAttackOutcome(state, r.lastToucherId, false, mul);
    }
    // 段 4 組合獎金：得分者拿的還是上面那份 KILL，配合者（誘餌）另外拿一份。
    // 掛在同一個閘後面＝「有人因為這記攻擊拿到 KILL」才有獎金可分（出廠 0＝不動）
    applyComboAssist(state, r.lastToucherId, scored);
  }
  // W7 B3：隊級連得分（暫停 AI 判準＋氣勢輸入）——純記帳零 rng
  state.pointStreak = state.pointStreak.team === winner
    ? { team: winner, n: state.pointStreak.n + 1 }
    : { team: winner, n: 1 };
  const at = { x: state.ball.x, z: state.ball.z };
  for (const e of pointTo(state.match, winner, reason)) {
    ev.push(e.type === 'DEAD_BALL' ? { tick: state.tick, ...e, at } : { tick: state.tick, ...e });
    // W6 B4：換發輪＝該隊登記發球序前進一格（7.7 驗證的期望值來源）
    if (e.type === 'ROTATE') state.serveSeq[e.team].nextIdx += 1;
  }
  // W7 B1 團隊氣勢：連得 3+ 每分往贏方推一檔；對向得分往中間收一檔（快衰歸中）。
  // 觀測事件 MOMENTUM 只在值變動時發、落在 SCORE 之後（B4 氣勢計/聲量/播報驅動源）
  if (state.momentum) {
    const dir = winner === 'A' ? 1 : -1;
    const m = state.momentum;
    const prev = m.value;
    if (state.pointStreak.n >= TUNING.MOMENTUM_STREAK_MIN) {
      m.value = clamp(m.value + dir, -TUNING.MOMENTUM_MAX, TUNING.MOMENTUM_MAX);
    } else if (m.value * dir < 0) {
      m.value += dir;
    }
    if (m.value !== prev) {
      ev.push({ type: 'MOMENTUM', tick: state.tick, value: m.value });
    }
  }
  // W7 C3 回歸即建功：曾被換下者回場後首次「最後觸球定勝負」（殺球或攔死——
  // lastToucherId 歸因同 pointBanner）→ COMEBACK_SPARK＋團隊氣勢直接 +2 檔（觀眾爆聲
  // 由表現層吃事件）。建功即清監看；再次下場再回可重新觸發（敘事弧可重演）
  const backer = r.lastToucherId;
  if (
    backer && state.subLog.back[backer] &&
    reason === 'BALL_IN' && r.lastTouchTeam === winner &&
    state.players[backer].teamId === winner
  ) {
    delete state.subLog.back[backer];
    ev.push({ type: 'COMEBACK_SPARK', tick: state.tick, team: winner, playerId: backer });
    if (state.momentum) {
      const dir = winner === 'A' ? 1 : -1;
      const m = state.momentum;
      const prev = m.value;
      m.value = clamp(m.value + 2 * dir, -TUNING.MOMENTUM_MAX, TUNING.MOMENTUM_MAX);
      if (m.value !== prev) {
        ev.push({ type: 'MOMENTUM', tick: state.tick, value: m.value });
      }
    }
  }
  // W4(P4) Q8 決勝局 8 分換邊（FIVB）：任一隊先到 8 分的那一分，一次性事件化
  // （表現層吃事件做轉場演出；物理半場不真換——鏡頭/操作恆我方視角，裁量點記錄快照）
  if (
    state.series && !state.match.setOver
    && state.series.setIndex === state.series.bestOf && !state.series.sideSwitched
    && (state.match.score.A === 8 || state.match.score.B === 8)
  ) {
    state.series.sideSwitched = true;
    ev.push({ type: 'SIDE_SWITCH', tick: state.tick, score: { ...state.match.score } });
  }
  if (state.match.setOver) {
    // W6 B4（7.7.2 追溯扣分）：曾記違序的隊伍，自 faultTick 起得分全數取消、
    // 對隊保留；調整後重判勝方（最後防線——合法路徑下永不觸發）
    const fault = state.rotationFault;
    if (fault.A !== null || fault.B !== null) {
      const score = { ...state.match.score };
      let cancelled = 0;
      for (const team of ['A', 'B']) {
        if (fault[team] === null) continue;
        const adj = cancelFaultPoints(state.events.concat(ev), fault[team], team);
        score[team] = adj.score[team];
        cancelled += adj.cancelled;
      }
      state.match.score = score;
      state.match.winner = score.A === score.B
        ? state.match.winner // 全取消後平手＝維持原判（極端防呆，不產生無勝方局）
        : score.A > score.B ? 'A' : 'B';
      ev.push({
        type: 'ROTATION_ADJUST', tick: state.tick, cancelled,
        score: { ...score }, winner: state.match.winner,
      });
    }
    // W4(P4) Q8 多局系列結算：記局→判系列勝負；未分出＝set_break（局間，模擬凍結）
    if (state.series && !state.series.over) {
      const s = state.series;
      const w = state.match.winner;
      s.setsWon[w] += 1;
      s.setScores.push({ ...state.match.score });
      if (s.setsWon[w] >= s.setsToWin) {
        s.over = true;
        s.winner = w;
        ev.push({
          type: 'MATCH_END', tick: state.tick, winner: w,
          setsWon: { ...s.setsWon }, setScores: s.setScores.map((sc) => ({ ...sc })),
        });
        state.phase = 'set_over';
      } else {
        ev.push({
          type: 'SET_BREAK', tick: state.tick, setIndex: s.setIndex,
          setsWon: { ...s.setsWon }, score: { ...state.match.score },
        });
        state.phase = 'set_break';
      }
    } else {
      state.phase = 'set_over';
    }
  } else {
    setupServePhase(state);
  }
}

// W4(P4) Q8 下一局開局（唯一合法的局間推進路徑；UI「下一局」鈕／治具／局間存檔續玩
// 皆走此函式）。局間收束/重置語意逐項（工單 §3 明列）：
// - 體力：跨局延續＋局間恢復一次性（RECOV_SET_BREAK；量＝題7 治具輪校準）
// - 氣勢：跨局歸零（W7「無跨局持續」原則）；連得分/暫停選項一併歸零
// - 輪轉/先發：回到開場先發序（FIVB 每局重排；沿現行 lineup 鏈——不做局間換陣 UI）
// - trust 場內動態（trustDyn）：跨局延續（同一場比賽的連續敘事）；subLog 同（回歸弧跨局成立）
// - 換人/暫停額度：每局重置（FIVB per set）；發球序/違序監看隨新局重建
// - 發球權：各局交替（奇 A 偶 B，決定論）；決勝局 target＝15（deciderTarget）
export function startNextSet(state) {
  const s = state.series;
  if (!s || state.phase !== 'set_break') return false;
  s.setIndex += 1;
  const decider = s.setIndex === s.bestOf;
  const target = decider ? s.deciderTarget : s.baseTarget;
  const servingTeam = s.setIndex % 2 === 1 ? s.startServing : otherTeam(s.startServing);
  state.match = createMatch({
    rotationA: [...s.startRotations.A],
    rotationB: [...s.startRotations.B],
    servingTeam,
    target,
  });
  state.subs = {
    A: { remaining: TUNING.SUBS_PER_SET },
    B: { remaining: TUNING.SUBS_PER_SET },
  };
  state.timeouts = {
    A: { remaining: TUNING.TIMEOUTS_PER_SET },
    B: { remaining: TUNING.TIMEOUTS_PER_SET },
  };
  state.timeoutAtPoint = { A: -1, B: -1 }; // 同分防重 key 跨局歸零（新局比分重來）
  state.serveSeq = {
    A: { order: [...s.startRotations.A], nextIdx: 0 },
    B: { order: [...s.startRotations.B], nextIdx: 0 },
  };
  state.rotationFault = { A: null, B: null };
  state.bench = { A: [...s.startBench.A], B: [...s.startBench.B] };
  // 自由人配對歸零：先發全回場，setupServePhase 依新局輪轉重新換入（hold 同歸零
  // ——手動回場的抑制窗不跨局）
  if (state.liberos) {
    for (const team of ['A', 'B']) {
      if (state.liberos[team]) {
        state.liberos[team].replacedId = null;
        state.liberos[team].hold = false;
      }
    }
  }
  if (state.momentum && state.momentum.value !== 0) {
    state.momentum.value = 0;
    state.events.push({ type: 'MOMENTUM', tick: state.tick, value: 0 });
  }
  state.pointStreak = { team: null, n: 0 };
  state.timeoutBoostArmed = false;
  if (state.stamina) {
    for (const id of Object.keys(state.stamina)) {
      recoverStamina(state, id, STAMINA.RECOV_SET_BREAK);
    }
  }
  state.events.push({
    type: 'SET_START', tick: state.tick, setIndex: s.setIndex, target, servingTeam,
  });
  setupServePhase(state);
  return true;
}

// ---- W6 賽中換人（B1 簡化版拍板：死球可換、每局 6 人次、不限原對；自由人體系
// 照舊不計次）。UI 擋第一層（對位/主控/次數），此處為 sim 最後防線＋唯一寫入路徑。
// 比照 applyLiberoSwaps：純 state 副作用、不經 Intent 管線（不影響 VCR 決定論——
// 換人只發生在死球窗，發球前快照已含換人後陣容）----
export function applySubstitution(state, { team, outId, inId }) {
  const deny = (reason) => ({ ok: false, reason });
  if (state.phase !== 'serve') return deny('not-dead-ball');
  if ((state.subs[team]?.remaining ?? 0) <= 0) return deny('limit');
  const pOut = state.players[outId];
  const pIn = state.players[inId];
  if (!pOut || !pIn || pOut.teamId !== team || pIn.teamId !== team) return deny('unknown');
  if (!state.bench[team].includes(inId)) return deny('not-on-bench');
  const rot = state.match.rotations[team];
  const idx = rot.indexOf(outId);
  if (idx < 0) return deny('not-on-court');
  if (rot.includes(inId)) return deny('already-on-court');
  if (pOut.currentRole === 'libero' || pIn.currentRole === 'libero') return deny('libero');
  // 自由人配對中的被替換者（暫離場）不可經一般換人進出（FIVB：只能由自由人體系換回）
  if (state.liberos?.[team]?.replacedId === inId) return deny('libero-paired');

  rot[idx] = inId;
  // 登記發球序：槽位繼承（進場者接手離場者的發球輪次）——7.7 期望值同步
  const seq = state.serveSeq[team];
  const oi = seq.order.indexOf(outId);
  if (oi >= 0) seq.order[oi] = inId;
  // 板凳名單互換（離場者可再進場——B1 不限原對、不限次別，只吃隊伍人次額度）
  state.bench[team] = state.bench[team].filter((id) => id !== inId).concat(outId);
  state.subs[team].remaining -= 1;
  // W7 C3 回歸監看：曾被換下者再進場＝回歸（首次建功→COMEBACK_SPARK，見 settlePoint）
  if (state.subLog.out[inId]) state.subLog.back[inId] = true;
  state.subLog.out[outId] = true;
  // 進場者站上該輪轉槽基準位、離場者停板凳（死球窗內，無插值拖影）
  const pos = basePosition(team, idx + 1);
  const ai = state.actors[inId];
  ai.x = pos.x; ai.z = pos.z; ai.px = pos.x; ai.pz = pos.z;
  ai.blockUntil = -1; ai.divedUntil = -1;
  parkBenchActor(state, team, outId);
  state.events.push({ type: 'SUBSTITUTION', tick: state.tick, team, inId, outId });
  return { ok: true, reason: '' };
}

// W4（07-27）：同一分是否已喊過暫停——sim 與 UI 反灰共用的單一事實源。
// 分識別＝該局比分 key（rally point 同局恆遞增；跨局由 startNextSet 歸零）
function timeoutPointKey(state) {
  return state.match.score.A * 1000 + state.match.score.B;
}
export function timeoutUsedThisPoint(state, team) {
  return state.timeoutAtPoint?.[team] === timeoutPointKey(state);
}

// ---- W7 B3 暫停（拍板 A：每場每隊 2 次、死球時可喊；對手 AI 也會喊——判準在
// ai.js aiTimeoutWanted，呼叫端＝matchLoop/治具）。比照 applySubstitution：死球窗
// 純 state 副作用、不經 Intent。效果＝我方全隊小回體力（stamina 未啟用＝純演出）
// ＋斬對方連得分（pointStreak 歸零＝stage 3 氣勢歸中的資料底）＋死球時間延長（演出）----
export function applyTimeout(state, { team }) {
  const deny = (reason) => ({ ok: false, reason });
  if (state.phase !== 'serve') return deny('not-dead-ball');
  if ((state.timeouts[team]?.remaining ?? 0) <= 0) return deny('limit');
  // W4 試玩修正（07-27 Sawmah）：同一分每隊至多一次——防連喊把死球窗疊長/
  // 教練選項疊發（兩隊各自可喊；下一分即恢復）
  if (timeoutUsedThisPoint(state, team)) return deny('already-this-point');
  state.timeoutAtPoint = { ...(state.timeoutAtPoint ?? {}), [team]: timeoutPointKey(state) };
  state.timeouts[team].remaining -= 1;
  // 對方的連得分被斬斷（自家連得不歸零——沒人會喊暫停斬自己氣勢，防呆為主）
  if (state.pointStreak.team && state.pointStreak.team !== team) {
    state.pointStreak = { team: null, n: 0 };
  }
  // W7 B1×B3：對方氣勢歸中（只斬對方——氣勢計偏向對隊時直接清零；自家氣勢不動）
  if (state.momentum) {
    const oppDir = team === 'A' ? -1 : 1;
    if (state.momentum.value * oppDir > 0) {
      state.momentum.value = 0;
      state.events.push({ type: 'MOMENTUM', tick: state.tick, value: 0 });
    }
  }
  for (const p of Object.values(state.players)) {
    if (p.teamId === team) recoverStamina(state, p.id, STAMINA.RECOV_TIMEOUT);
  }
  state.serveReadyTick = Math.max(state.serveReadyTick, TUNING.TIMEOUT_DEAD_TICKS + state.tick);
  state.timeoutBoostArmed = true; // 教練選項上膛（每次暫停一發；下個死球窗自動收）
  state.events.push({
    type: 'TIMEOUT', tick: state.tick, team, remaining: state.timeouts[team].remaining,
  });
  return { ok: true, reason: '' };
}

// W7.1 暫停教練選項（試玩回饋 07-24 #3 拍板「有選項可按」）：applyTimeout 之後、
// 同一個死球窗內由 UI 呼叫一次。'calm'＝穩住（全隊體力額外小回）／'fire'＝燃起來
// （我方氣勢推一檔）。純算術零 rng；每次暫停一發（armed 旗標，setupServePhase 收窗）
export function applyTimeoutBoost(state, { team, boost }) {
  const deny = (reason) => ({ ok: false, reason });
  if (state.phase !== 'serve') return deny('not-dead-ball');
  if (!state.timeoutBoostArmed) return deny('already-boosted');
  if (boost === 'calm') {
    for (const p of Object.values(state.players)) {
      if (p.teamId === team) recoverStamina(state, p.id, TUNING.TIMEOUT_CALM_RECOV);
    }
  } else if (boost === 'fire') {
    if (state.momentum) {
      const dir = team === 'A' ? 1 : -1;
      const prev = state.momentum.value;
      state.momentum.value = clamp(
        prev + TUNING.TIMEOUT_FIRE_STEP * dir, -TUNING.MOMENTUM_MAX, TUNING.MOMENTUM_MAX,
      );
      if (state.momentum.value !== prev) {
        state.events.push({ type: 'MOMENTUM', tick: state.tick, value: state.momentum.value });
      }
    }
  } else {
    return deny('unknown-boost');
  }
  state.timeoutBoostArmed = false; // 一發用畢
  state.events.push({ type: 'TIMEOUT_BOOST', tick: state.tick, team, boost });
  return { ok: true, reason: '' };
}

// W7.1 二輪（試玩回饋：暫停改真實 30s＋可提早開賽）：把暫停剩餘時間縮到走回位
// 緩衝。只在「延長窗」有效（剩餘 > 一般死球節拍＝確為暫停窗，普通發球間隔不受理）
export function resumeFromTimeout(state) {
  const deny = (reason) => ({ ok: false, reason });
  if (state.phase !== 'serve') return deny('not-dead-ball');
  if (state.serveReadyTick - state.tick <= TUNING.SERVE_DEAD_TICKS) return deny('not-timeout');
  state.serveReadyTick = state.tick + TUNING.TIMEOUT_RESUME_BUFFER;
  state.events.push({ type: 'TIMEOUT_RESUME', tick: state.tick });
  return { ok: true, reason: '' };
}

// 板凳停放（applyLiberoSwaps 與換人共用）：場邊席位、純視覺、無 intent 不參與
function parkBenchActor(state, team, pid) {
  const a = state.actors[pid];
  a.x = -6.6;
  a.z = TEAM_SIDE[team] * 10.6;
  a.px = a.x;
  a.pz = a.z;
}

// stage 6 自由人替換（死球時執行；FIVB 精神：替換不計次、不得發球/前排）：
// 輪到前排或發球位（idx 0-3）→ 原 MB 回場；後排（idx 4/5）出現 MB → 自由人換入。
// 被換下的人停放板凳位；事件進 state.events（完整日誌）
function applyLiberoSwaps(state) {
  if (!state.liberos) return;
  for (const team of ['A', 'B']) {
    const lib = state.liberos[team];
    if (!lib) continue;
    const rot = state.match.rotations[team];
    const li = rot.indexOf(lib.liberoId);
    if (li >= 0 && li <= 3) {
      rot[li] = lib.replacedId;
      state.events.push({
        type: 'LIBERO_SWAP', tick: state.tick, team,
        inId: lib.replacedId, outId: lib.liberoId,
      });
      lib.replacedId = null;
    }
    // W4(P4) 手動回場的抑制窗（applyLiberoRecall 拍板 07-27）：原對位還在後排＝
    // 這輪次自己守、不自動換入；後排已無 MB（輪到前排）＝窗結束，下一位後排 MB
    // 恢復預設換入
    if (lib.hold) {
      const backRowMb = [4, 5].some(
        (idx) => state.players[rot[idx]]?.currentRole === 'middle',
      );
      if (backRowMb) continue;
      lib.hold = false;
    }
    if (!rot.includes(lib.liberoId)) {
      for (const idx of [4, 5]) {
        const pid = rot[idx];
        if (state.players[pid].currentRole === 'middle') {
          lib.replacedId = pid;
          rot[idx] = lib.liberoId;
          state.events.push({
            type: 'LIBERO_SWAP', tick: state.tick, team,
            inId: lib.liberoId, outId: pid,
          });
          break;
        }
      }
    }
  }
}

// W4(P4) 試玩回饋（07-27 Sawmah 拍板 B）：自由人配對的手動回場——FIVB 真實規則
// （自由人替換不算換人、不吃額度、任何死球可換回）。代價全由既有系統誠實承擔：
// 回場者接球屬性差（爆接風險）＋留場上不吃板凳快回（多局制放大）。
// hold＝本輪次抑制自動換入（見 applyLiberoSwaps）；死球窗限定、唯一寫入路徑
export function applyLiberoRecall(state, { team }) {
  const deny = (reason) => ({ ok: false, reason });
  if (state.phase !== 'serve') return deny('not-dead-ball');
  const lib = state.liberos?.[team];
  if (!lib || lib.replacedId == null) return deny('no-pair');
  const rot = state.match.rotations[team];
  const li = rot.indexOf(lib.liberoId);
  if (li < 0) return deny('libero-not-on-court');
  const backId = lib.replacedId;
  rot[li] = backId;
  lib.replacedId = null;
  lib.hold = true;
  state.events.push({
    type: 'LIBERO_SWAP', tick: state.tick, team, inId: backId, outId: lib.liberoId,
  });
  // 回場者站進槽位、自由人停板凳（沿換人瞬移慣例——死球窗內無插值拖影）
  const pos = basePosition(team, li + 1);
  const a = state.actors[backId];
  a.x = pos.x;
  a.z = pos.z;
  a.px = pos.x;
  a.pz = pos.z;
  a.blockUntil = -1;
  a.divedUntil = -1;
  parkBenchActor(state, team, lib.liberoId);
  return { ok: true, reason: '' };
}

// 板凳停放（全隊通用；W6 起與自由人解耦——無自由人的隊也有板凳要停）：
// 不在輪轉上的隊員到場邊席位（純視覺位置；無 intent 不參與）
function parkOffCourt(state) {
  for (const team of ['A', 'B']) {
    const rot = state.match.rotations[team];
    for (const p of Object.values(state.players)) {
      if (p.teamId !== team || rot.includes(p.id)) continue;
      parkBenchActor(state, team, p.id);
    }
  }
}

// 佈置發球局面：全員回輪轉基準位、發球員到發球點、球置於發球員手上
function setupServePhase(state) {
  applyLiberoSwaps(state); // 死球即換（換完再歸位，自由人直接站進職責位）
  parkOffCourt(state); // 板凳（含被換下者）停場邊席位
  state.phase = 'serve';
  state.serveReadyTick = state.tick + TUNING.SERVE_DEAD_TICKS;
  state.timeoutBoostArmed = false; // W7.1：教練選項一發限本死球窗——新窗自動收

  // W7 A3 恢復（rally 中不回、死球間隙小回、坐板凳快回）：死球窗一次性——
  // 逐 tick 回會獎勵拖延發球（玩家發球無時限）。開局呼叫時全員滿格＝封頂 no-op。
  // W8：氣勢方逐檔額外回（momentumRecovBonus；氣勢未啟用/歸中＝0 零副作用）
  if (state.stamina) {
    for (const team of ['A', 'B']) {
      const rot = state.match.rotations[team];
      const bonus = momentumRecovBonus(state, team);
      for (const p of Object.values(state.players)) {
        if (p.teamId !== team) continue;
        recoverStamina(state, p.id,
          (rot.includes(p.id) ? STAMINA.RECOV_DEAD : STAMINA.RECOV_BENCH) + bonus);
      }
    }
  }

  for (const team of ['A', 'B']) {
    const rot = state.match.rotations[team];
    rot.forEach((pid, idx) => {
      const pos = basePosition(team, idx + 1);
      const a = state.actors[pid];
      a.x = pos.x; a.z = pos.z;
      a.px = pos.x; a.pz = pos.z; // 瞬移回位不做插值拖影
      a.blockUntil = -1;
      a.divedUntil = -1; // 死球即起身（倒地恢復不跨球）
    });
  }
  const sid = serverId(state.match);
  const sp = servePosition(state.match.servingTeam);
  const sa = state.actors[sid];
  sa.x = sp.x; sa.z = sp.z;
  sa.px = sp.x; sa.pz = sp.z;

  const b = state.ball;
  b.x = sp.x; b.y = 1.6; b.z = sp.z;
  b.vx = 0; b.vy = 0; b.vz = 0;
  b.px = b.x; b.py = b.y; b.pz = b.z;

  const r = state.rally;
  r.flightId += 1;
  r.profile = null;
  r.touches = 0;
  r.possession = null;
  r.lastTouchTeam = null;
  r.lastToucherId = null;
  r.deceiveP = 0;
  r.touchLockTick = -1;
  r.callPid = null; // 要球一波一效（死球即清）
  r.comboAssist = null; // 組合獎金候選同樣一波一效（另一個清空點在 ai.js：新的一波開帳時）
  // ★ 不清 comboAssistCredit ★ 這裡與 settlePoint 同一個 tick 同步執行（非局末的一般
  // 得分：settlePoint 的 else 分支直接呼叫本函式，不是隔幾個 tick 才跑）——若在這裡
  // 清掉，會把 applyComboAssist 剛寫進去的值在同一 tick 內原地抹掉，UI 永遠讀不到
  // （2026-08-08 debug 探針實測踩過：加了這行清空，14 局字卡與入帳全部雙雙歸零）。
  // flightId 天然單調遞增，讀取端本來就要以 flightId 去重，不靠這裡清空來防重放。
}

// ---- 預設隊伍（測試/示範用；正式生涯隊伍由 Phase 2+ 資料驅動）----

// trust＝舉球員信任初值（攻擊分配權重）：主攻手槽（index 1，玩家）60、其餘 20
// ——後排點另吃 rowFactor 0.5（見 ai.js attackPointsOf），等效 10
const DEFAULT_LINEUP = [
  { role: 'setter', height: 1.83, trust: 20 },
  { role: 'outside', height: 1.88, trust: 60 },
  { role: 'middle', height: 1.96, trust: 20 },
  { role: 'opposite', height: 1.9, trust: 20 },
  { role: 'outside', height: 1.86, trust: 20 },
  { role: 'middle', height: 1.94, trust: 20 },
];

export function createDefaultTeams() {
  const make = (team) =>
    DEFAULT_LINEUP.map((slot, i) =>
      createPlayer({
        id: `${team}${i + 1}`,
        name: `${team}隊${i + 1}號`,
        teamId: team,
        naturalRole: slot.role,
        currentRole: slot.role,
        height: slot.height,
        trust: slot.trust,
        attributes: {
          jump: 60, power: 62, reaction: 60, stamina: 60,
          speed: 62, control: 68, serve: 60, block: 58,
        },
      }),
    );
  return { A: make('A'), B: make('B') };
}
