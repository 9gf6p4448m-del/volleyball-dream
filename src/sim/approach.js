// Phase 5 W1 §2-2「Transition 拉開」＋§4「A1 節奏三層」
// ——攻擊線幾何與助跑節奏（純函式、決定論、零 rng 狀態）
//
// 真實排球：一擊完成的瞬間，場上每個合法攻擊手都轉身背對網、跑向**自己那條線的
// 助跑起點**站定等二傳。攔網手要讀的第一組線索就是「誰跑去哪、離網多遠」；
// 第二組線索是「誰什麼時候起步」——那就是 §4 的節奏三層。
//
// 4.7 之前全隊共用 `dutyPosition`（前排一律 lz=3.0、後排一律 lz=7.0），三名前排
// 站成一直排、後排完全不動（探針實測 Δ=0.00m）＝攔網手看不到任何線索。
//
// 本檔是「攻擊線幾何」的單一真相：舉球落點（setAimFor）／助跑起點（approachStartFor）
// ／起跳點（takeoffSpotFor）／節奏與起步 tick（approachRoutesFor）。
// **刻意不從 ai.js import**——攻擊池（attackPointsOf）由呼叫端供給，
// 避免 sim 內循環相依，也讓 §4「全員各跑各的線」直接對整個池 map 一次即可。
// （§4 追記：setAimFor 與 TAKEOFF_* 原本住在 ai.js，本輪上移到此——起跳點是
//  「舉球落點往後退一段」，助跑 route 要自己算得出來就必須拿到這兩份；ai.js 反向
//  import 會成環。數值與函式本體逐字未動，ai.js 的 `AI.TAKEOFF_*` 改為指向此處。）
import { COURT, SIM_DT } from './constants.js';
import { localToWorld, TEAM_SIDE } from './rotation.js';
import { hash01 } from './rng.js';
import { actionPhaseAt } from './actionPhase.js';
// 單人攔網的水平涵蓋半寬——**單一真相來源**（blockBand.js:41，隨 CONVERGE_T 自己動）。
// 交叉條件 5「搆不到」吃的就是這個值；抄一個字面量進來的話，攔網收斂一動這裡就分岔。
import { BLOCK_HALF_WIDTH } from './blockBand.js';

// 二傳落點：前後排皆已換位 → 各攻擊點固定（真實排球的進攻座標）
// 前排 OH 左翼/OPP 右翼高球、MB 面前低弧快攻；
// 後排 pipe 中路偏左（後中 OH）、D 球右路（右後 OPP）——皆壓攻擊線後（合法起跳）
const ATTACK_LZ = 1.3; // 舉球目標深度（不在表上的 kind 的保底線）
// 第三檔弧線（§4 遺留的阻塞項）：二速的平拉開／半快。
// t 落在 [0.5,0.65) ⇒ game.js 取 TUNING.SHOOT_APEX（4.2，介於快攻 3.4 與高球 5.2）。
// 落點刻意推到 ±4.4（近標誌桿）：弧越低，「球墜到扣球窗上緣」的位置就越往二傳側縮，
// 落點不外推的話擊球點會被拉回中場（§4 借快攻低弧那次的失敗成因）。
// 實測（tools/… 的彈道試算）：apex 4.2＋落點 -4.4 → 擊球點 lx -2.87、飛行 64 tick，
// 對照高球（apex 5.2＋落點 -3）的 -2.15／83 tick——更外側、快 19 tick。
const SHOOT = { left: -4.4, right: 4.4 };
// 二速的名目擊球點（takeoffSpotFor 用）：不是落點本身，是上面試算出來的擊球點
const SHOOT_HIT = { left: -2.9, right: 2.9 };
export function setAimFor(game, team, attackerId, kind, tempo = 'three') {
  if (tempo === 'two' && SHOOT[kind] !== undefined) {
    return { lx: SHOOT[kind], lz: 1.3, t: 0.55 };
  }
  if (kind === 'quick') return { lx: 0, lz: 1.0, t: 0.4 }; // t<0.5＝sim 低弧快球
  if (kind === 'left') return { lx: -3, lz: 1.3, t: 0.75 };
  // §5 A2 交叉：OH 從外側切進中間（真實排球的 X 戰術）——落點在快攻點的左肩、
  // 離快攻點 1.3m ＞ TUNING.BLOCK_REACH_X（1.1m）＝跟死快攻的中間攔網手**構造上
  // 搆不到這一球**。這個「搆不到」就是交叉存在的理由，不靠任何機率加成。
  // kind 標籤 2026-07-31 由 'cross' 改名為 'left_inside'（CROSS_RATE 機率不變）：
  // 這條不是真交叉（單人改寫、不涉及 MB），名字讓給本卷稍後要做的真交叉。
  if (kind === 'left_inside') return { lx: -1.3, lz: 1.3, t: 0.75 };
  // ---- 組合攻擊卷 段 A（2026-07-31）：真交叉／夾塞的幾何前置 ----
  // **本段只建線，不接任何抽籤**（routeKindFor／tempoFor 一格未動）＝沒有人跑得到
  // 這兩條線，sim-hash 因此必須逐值不變。段 B/C 才把它們接上組合排程層。
  //
  // cross（真交叉）：OH 從左邊線外側切進來，**穿過快攻手身後**落在快攻點的右肩。
  //   lx ＝ +1.3 ＝ left_inside 的 −1.3 **鏡像**——同一個「離快攻點的橫向距離」語意，
  //   只是 left_inside 停在快攻的同側（沒穿過去），cross 真的穿過 lx=0 到對側。
  //   為什麼是這個距離：跟死快攻的中間攔網手涵蓋半寬＝TUNING.BLOCK_REACH_X
  //   （＝blockBand.BLOCK_HALF_WIDTH，CONVERGE_T=1 下實測 0.5m），1.3 > 0.5
  //   ⇒ **構造上搆不到**（藍圖 §四 交叉條件 5）。上界由 right 線的 lx=3 夾住：
  //   3 − 1.3 ＝ 1.7m ≫ SEP_RADIUS 0.55，不會跟 OPP 擠成同一點。
  if (kind === 'cross') return { lx: 1.3, lz: 1.3, t: 0.75 };
  // tandem（夾塞）：躲在快攻手的影子裡、**同一條縱線上晚一拍**起跳。
  //   lx ＝ +0.3：與快攻點（lx 0）的 |Δlx| ＝ 0.3 ≤ TANDEM 同線門檻 0.6（藍圖條件 1），
  //   不取 0 是為了讓「助跑線段的 lx 區間」嚴格**不含** 0（藍圖條件 4：夾塞不得同時
  //   滿足交叉的穿越條件，否則兩型雙重計數）——起點 lx 2.6 → 終點 0.3，區間 [0.3, 2.6]。
  //   lz ＝ 2.0：起跳點 lz ＝ 2.0 + TAKEOFF.FRONT 0.68 ＝ 2.68，比快攻起跳點 1.68
  //   **深 1.0m**，> 藍圖條件 2 的硬下界 SEP_RADIUS 0.55 ⇒ 同隊避讓不會把兩人推開。
  //   t ＝ 0.55：落在 game.js 的 'shoot' 檔（SHOOT_APEX 4.2，介於快攻 3.4 與高球 5.2）
  //   ——夾塞的球必須比高球平（否則攔網手有時間從快攻收回來），又不是快攻的一速低弧。
  //   與二速平拉開共用同一檔弧線＝零新弧線。
  if (kind === 'tandem') return { lx: 0.3, lz: 2.0, t: 0.55 };
  if (kind === 'right') return { lx: 3, lz: 1.3, t: 0.75 };
  if (kind === 'pipe') return { lx: -1, lz: 3.6, t: 0.75 };
  if (kind === 'dball') return { lx: 2.6, lz: 3.6, t: 0.75 };
  return { lx: 2, lz: ATTACK_LZ, t: 0.75 };
}

// 起跳點＝擊球點往自家後場退多遠（m）——決定「空中前飄」的實際距離。
// 前排幾乎垂直拔起（真人 0.3-0.5m）；後排在三米線後起跳、往前上方衝進去打，
// 位移本就較大。SETTLE＝離起跳點多近算「到位」（到位即停止水平移動＝原地拔起）。
// **4.7 兩次勝率 0% 換來的禁區常數，本輪一格未動**（見 ai.js 起跳點分支的註解）
export const TAKEOFF = { FRONT: 0.68, BACK: 0.22, SETTLE: 0.25 };

// 後排攻擊線（起跳點退的距離與前排不同）
const BACK_KINDS = new Set(['pipe', 'dball']);

// 起跳點（世界座標）＝該線的舉球落點往自家後場退 TAKEOFF.FRONT/BACK。
// 這是「這條線的人最後會停在哪拔起」的名目值——被選中者到了第三擊改吃實測 hitPoint
// （ai.js 的起跳點分支，禁區不動），未被選中者跑的假動作就以此為終點。
export function takeoffSpotFor(team, kind, tempo = 'three') {
  const aim = setAimFor(null, team, null, kind, tempo);
  // 二速：落點被外推到標誌桿，實際擊球點在 SHOOT_HIT（見上方彈道試算）
  const lx = (tempo === 'two' && SHOOT_HIT[kind] !== undefined) ? SHOOT_HIT[kind] : aim.lx;
  const back = BACK_KINDS.has(kind) ? TAKEOFF.BACK : TAKEOFF.FRONT;
  const w = localToWorld(team, lx, aim.lz + back);
  return { x: w.x, z: w.z };
}

// 助跑起點（隊伍視角）：lz＝離網距離、lx＝面向網時的右手向。
// 對照 setAimFor 的舉球落點：quick(0,1.0) left(-3,1.3) right(3,1.3)
// pipe(-1,3.6) dball(2.6,3.6)——起點一律比落點更遠離網、且往外側讓開，
// 讓助跑方向是「由外往內、由後往前」進球（真實助跑路線，不是原地站著等）。
//
// steps＝助跑步數（§2-4 位置例外的規格值，供表現層挑步序節奏；sim 不消費）
export const APPROACH = {
  // MB 快攻：兩步——**離網最近**（3.0 < 兩翼 3.6），二傳觸球前就要起跳。
  // ★ lz 不得小於「起跳點 lz」＋助跑距離：起跳點＝hitPoint.z + TAKEOFF_FRONT_M
  // 實測 p50 ≈ 1.99，再扣 TAKEOFF_SETTLE_M 0.25（到位即停）＝可跑的助跑段。
  // 初版寫 1.5（比起跳點還貼網）→ 助跑被吃光、退回 07-23 拍板禁止的「提早到網前
  // 罰站」：attack-flow-probe §2 從 0 筆樣本暴增到 537 筆、罰站 p50 31 tick、
  // 站超過 0.5s 佔 100%。3.0 是改動前 dutyPosition 的等效值（該版罰站 0 筆），
  // 留約 1m 助跑＝MB 的兩步。（07-28 Sawmah 拍板；§4 A1 把 MB 起跳提前後可再議）
  quick: { lx: 0, lz: 3.0, steps: 2 },
  // OH 4 號位：約四步距離離網，從邊線外側切進來
  left: { lx: -3.6, lz: 3.6, steps: 4 },
  // §5 A2 交叉：**同一個 OH**，起點更貼邊線（-4.1＝場內夾制上限）、終點在中間，
  // 助跑因此是一條橫越 2.8m 的斜線（直線攻擊只橫移 0.6m）——「切進中間」在幾何上
  // 就是這條線與 left 的差，攔網手看得到的也正是這個差
  // kind 標籤改名 'cross'→'left_inside'（2026-07-31，理由見上方 setAimFor 註解）
  left_inside: { lx: -4.1, lz: 3.6, steps: 4 },
  // ---- 組合攻擊卷 段 A（2026-07-31）：真交叉／夾塞 ----
  // cross（真交叉）：起點與 left_inside **逐值相同**（−4.1, 3.6）＝場內夾制上限的同一點。
  //   刻意相同：同一名 OH 不論跑 left／left_inside／cross，站上助跑起點的那一刻長得一樣，
  //   攔網手要到他起步之後才分得出來——這是交叉的欺敵價值本身，不是巧合。
  //   終點在 lx +1.3（見 setAimFor），助跑因此是一條橫越 **5.4m** 的斜線
  //   （left_inside 2.8m、left 0.6m）——「穿過去」在幾何上就是這條線與那兩條的差。
  //   ★ 穿越餘裕（藍圖 §四 條件 2/3）：線段 (−4.1, 3.6) → (+1.3, 1.98) 在 lx=0 處
  //     lz ＝ 3.6 − (4.1/5.4)×1.62 ＝ **2.370** > 快攻起跳點 lz 1.68，餘裕 0.690m
  //     ——且 0.690 > SEP_RADIUS 0.55 ⇒ 穿過去的那一刻不會被同隊避讓推開。
  cross: { lx: -4.1, lz: 3.6, steps: 4 },
  // tandem（夾塞）：從右側切進來、收在快攻手正後方。
  //   起點 lx 2.6（＝dball 的縱線，但 lz 4.2 比 dball 的 5.6 近網 1.4m ⇒ 兩起點不相撞）。
  //   lz 4.2 的下界＝助跑段不變量：4.2 − (2.0 + TAKEOFF.FRONT 0.68) − TAKEOFF.SETTLE 0.25
  //   ＝ **1.37m** ≥ 0.5m（一步）。起點在攻擊線（3m）後，前排球員起跳點 2.68 仍在前區＝合法。
  tandem: { lx: 2.6, lz: 4.2, steps: 4 },
  // OPP 2 號位：沿用 OH 架構鏡像
  right: { lx: 3.6, lz: 3.6, steps: 4 },
  // 後排 pipe：四步、**離網最遠**（4.7 量到的 0.86m 空中前飄即此成因，屬正確行為）
  pipe: { lx: -1, lz: 5.6, steps: 4 },
  // 後排 D 球：pipe 的右路版（同屬後排攻擊，深度一致）
  dball: { lx: 2.6, lz: 5.6, steps: 4 },
};

// ---- 夾塞的可機械判定門檻（藍圖 §四；段 A 只立值，段 C 才有消費端）----
// 立在這裡而不是留在段 C 就地寫死：這兩個數字是**幾何參數**，與 APPROACH 表同壽命，
// 分開放就會出現「表改了門檻沒改」的分岔（本專案已為同名不同義踩過坑）。
// TANDEM_LANE_M＝「同一條縱線」的容忍（|Δlx|）。
// TANDEM_DEPTH_M＝「前後疊」的最小深度差（Δlz）——**硬下界是 game.js 的 SEP_RADIUS
//   0.55**：低於它，同隊避讓每 tick 會把兩人往外推，夾塞的幾何自己瓦解＝條件恆真但
//   無意義。取 0.8 留 0.25m 餘裕（實際線距 1.0m，見 tandem 的 setAimFor 註解）。
export const TANDEM_LANE_M = 0.6;
export const TANDEM_DEPTH_M = 0.8;

// 助跑起點（世界座標）；kind 不在表上（非攻擊手）回 null——呼叫端據此回落職責位
export function approachStartFor(team, kind) {
  const a = APPROACH[kind];
  if (!a) return null;
  // 場內夾制：起點不得跑到邊線外或端線外（六人制助跑起點都在場內）
  const lim = COURT.WIDTH / 2 - 0.4;
  const lx = Math.max(-lim, Math.min(lim, a.lx));
  const lz = Math.min(a.lz, COURT.LENGTH / 2 - 0.4);
  const w = localToWorld(team, lx, lz);
  return { x: w.x, z: w.z, lz, steps: a.steps, kind };
}

// ---- §4 A1 節奏三層 ----
//
// | 節奏 | 定義 | 起跳時機（相對「二傳觸球 tick」） |
// |---|---|---|
// | 一速 one   | MB A 快／B 快              | 觸球**前**已在空中 |
// | 二速 two   | 邊攻半快、平拉開            | 觸球**後**約 44 tick 起跳（2026-07-31 解封，見 TEMPO_TWO_RATE） |
// | 三速 three | 標準 OH／OPP 高球、pipe/D 球 | 觸球**後**起跳 |
//
// 節奏在 sim 裡的唯一體現＝**起步 tick 不同**（不動舉球彈道、不動 trust 權重）。
// 「不同節奏＝不同起步 tick，那就是攔網要讀的東西本身」（憲法 §三 A1）。
//
// takeoffLead＝起跳點比二傳觸球早幾 tick（三速為 0＝起步就踩在觸球那一刻，
// 對齊憲法的黃金錨點「二傳觸球瞬間 OH 應正踩在助跑第一步上」，起跳自然落在觸球後）。
// 14 tick＝0.23s：真人快攻手在二傳觸球前約 0.2-0.3s 離地，二傳把球送到他手上。
//
// ★★ two: −40 ——2026-07-31 Sawmah 裁定（route B），由 +3 改為 −40 ★★
// 負值＝起跳落在二傳觸球**之後**。這不是把二速改慢，是**把一個物理上做不到的定義修正掉**：
//   二速走 SHOOT 弧（TUNING.SHOOT_APEX 4.2），球從二傳手上飛到標誌桿要 61 tick；
//   人起跳後只滯空 AIR_TICKS=24 tick。「觸球前起跳又能擊到球」需要 61 ≤ 3+24＝27——恆假。
// 舊值 +3 的後果不是「二速比較早」，而是**二速根本沒有發生過**：實測物理起跳
//   一速 p50 15／二速 p50 15（IQR 逐值重疊）／三速 p50 68 ⇒ 所謂二速＝一速起跳＋網前罰站 46 tick，
//   三檔實際上只有兩檔。改 −40 之後為 15／44／68，三檔第一次真的等距散開、IQR 互不重疊。
// 選 −40 而非動態反推（dyn）或 −30：−40 罰站 0.0%、一→二 29 tick／二→三 24 tick 最接近等距，
//   且是**零新機制**（與 one/three 同形式的一個常數），最容易驗證也最容易回退。
// 量測依據：tools/tempo-routeb-probe.mjs（2×2＋22 臂、40 局、決定論複跑逐位元相同），
//   裁定書＝docs/kickoffs/phase5-tactics-v1-combination-attack-handoff.md §十.2/§十.3。
export const TEMPO = {
  one: { takeoffLead: 14 },
  two: { takeoffLead: -40 },
  three: { takeoffLead: 0 },
};
// 邊攻跑二速的比例。
//
// ★★★ 2026-07-31：二速解封（0 → 0.35）。Sawmah 裁定＝route B ★★★
//
// 停派了三輪的病灶終於定位。**它不在弧線、不在接觸模型，在憲法對二速的定義本身。**
//
// 補量一（tools/tactics-reach-window-probe.mjs，40 局）——否決了「改接觸模型」這條路：
//   真實可及模型（reach.js 球體相交）的**垂直**可及窗 p50 = 61 tick，遠超門檻 27
//   ⇒ **接觸模型從來不是瓶頸**。下面 163-169 行那段「41 > 3+24，接觸模型的問題」的論證是錯的，
//     而且它連數字都套錯常數：3.4m 是一速的 QUICK_APEX，二速走 SHOOT_APEX 4.2、實測弧頂 4.15m、
//     來回 58 tick（不是 41）。
//   真正的阻塞＝**球的水平飛行時間**：二速的 set→擊球 p50 = 61 tick，而滯空窗只有 24。
//   只做 A（球體規劃）罰站率 100% → 92.1%，set→擊球 仍 56-61 tick、0% 落在窗內。
//
// 補量二（tools/tempo-routeb-probe.mjs，2×2＋22 臂，40 局）——route B 單獨就解得掉：
//   plane × lead=−40：罰站 100.0% → **0.0%**、起跳→擊球 54 → 11 tick、落在 AIR_TICKS 窗內 0% → **100%**
//   set→擊球 七個 lead 值一律 61 tick ⇒ **route B 對舉球彈道零副作用**（它只動人幾時起跳）
//   A 與 B **不互補，A 在二速上是負作用**：球體規劃把擊球高度設在球體頂端 p50 4.29-4.33m，
//     而 SHOOT_APEX 只有 4.20m ⇒ 球永遠墜不到 ⇒ predictContactPoint 100% 回退成落地點，
//     二速 344 波打成 246 波沒扣成。補充臂（改瞄球心、不回退）仍留 80.6% 罰站
//     ⇒ **罰站是 B 解掉的，不是 A。**
//
// ⚠ 給下一個讀到這裡的人：下面 150-196 行整段是**歷史**，保留是為了讓人看見錯在哪。
//   它的每一次結論（「缺一檔弧線」「接觸模型的問題」「換掉接觸模型會自動解封」）
//   都指認了一個**不是病灶**的地方。共同的錯：把「AI 幾時該起跳」的問題當成「球怎麼飛」的問題。
//
// ——以下為歷史，2026-07-31 前的三輪停派論證——
//
// §4 當時的判定是「缺一檔舉球弧線」；§5 已經把那一檔做出來了
// （TUNING.SHOOT_APEX 4.2 ＋ 落點外推到標誌桿，見本檔上方 SHOOT／SHOOT_HIT），
// 並依工單把 TEMPO_TWO_RATE 開回 0.35 實測。結論：**修好一半，另一半修不好**。
//
// 開到 0.35 的實測（node tools/tempo-probe.mjs，40 局）：
//   ✅ ② 擊球點被拉回中場（借快攻低弧那次的坑）＝**解決**
//      attack-flow-probe ④「離地時離球 >3m」9.8% → 0.1%（基準 0.0%）、
//      ⑤ 前排真空中前飄 p90 1.29m → 0.71m（基準 0.57m）
//      舉球飛行 tick 三檔終於分得開：一速 32／二速 60／三速 81
//   ❌ ① 網前罰站＝**未解決**（07-23 Sawmah 拍板的 0.5s 硬線）
//      二速擊球前連續站著不動 p50 159 tick（2.65s）→ **42 tick（0.70s）**，
//      改善 74%，但「站超過 0.5s 的比例」仍是 99.7%（left）／98.6%（right）。
//
// 為什麼第三檔補不完：sim 的擊球判定是「球下墜穿過扣球窗上緣 SPIKE_APPROACH_Y
// ＝2.9m 的那一刻」。球必須先升過 2.9m 再墜回來，這段來回在弧頂 3.4m（已是低弧
// 下限，再低擊球點就退回二傳身邊）時就要 41 tick；而二速的定義是「二傳觸球前
// 起跳」（TEMPO.two.takeoffLead＝3），滯空窗只有 AIR_TICKS＝24 tick。
// **41 > 3+24：任何弧頂都不可能讓人在空中等到球。** 這不是弧線的問題，
// 是「擊球＝球墜到 2.9m」這個接觸模型的問題——那是憲法 §十「讓 sim 誠實」
// 十-1（觸球判定幾何）那一卷的東西，本輪明令不得動。
//
// 兩條可能的出路（都需要 Sawmah 拍板，本輪不自行發揮）：
//   A. 改 §十 的擊球窗模型（擊球窗改成帶狀／可在上升段擊球）——本輪禁區
//   B. 改 A1 對二速的定義（takeoffLead 由「觸球前 3 tick」改成「跑到位就跳、
//      只是比三速早」）——那是憲法 §三 A1 的規格，不是實作細節
// 在其中一條落地之前，二速維持停派；第三檔弧線的程式與測試全部保留，
// 屆時只要把這個常數改回 0.35。
//
// ★ 07-30 W2 裁定 2 重測（歸屬 W2，非彈道卷）★
// 憲法 §十-1 觸球判定已從「球下墜穿過 SPIKE_APPROACH_Y 平面」換成手點球心球體
// （`reach.js`，CONVERGE_T 收斂至 1），預告「阻塞論證的接觸模型已被換掉、可能自動
// 解封」。重測結果：**不成立，維持停派**——上面 148-154 行那段論證講的其實是
// **AI 走位／起跳時機的規劃**（`ai.js` 選定攻擊手的 `hitPoint` 仍吃
// `predictContactPoint(ball, AI.SPIKE_APPROACH_Y)`，這條路徑§十-1 沒有換掉、
// 也不在本輪範圍內），不是 sim 的觸球判定本身——球體遷移換的是「構不構得到」
// 那一格，不是「AI 幾時該起跳」那一格，兩者是不同的兩條路徑，所以舊病灶原封不動。
// 開 0.35 重測（node tools/tempo-probe.mjs，40 局，CONVERGE_T=1）：
//   ❌ ① 網前罰站——仍未解決，且比 07-30 稍早那次（42 tick／99.7%~98.6%）更差：
//      前排/left/two 擊球前連續靜止 p50=47 tick（0.78s）p90=61、站>0.5s **100.0%**；
//      前排/right/two p50=44 tick（0.73s）p90=48、站>0.5s **100.0%**。
//   ✅ 舊已解決的兩項仍維持解決狀態（未退步）：
//      擊球點對齊（setToHit 二速 p50=61 tick vs 三速 82 tick，一速 33 tick——
//      三檔仍分得開）；`npm test` 除下面這一條「停派」釘子測試外全綠。
// 結論：問題確實出在 A/B 兩條路徑之一（AI 的 hitPoint 規劃仍綁 SPIKE_APPROACH_Y），
// 與 §十-1 的觸球判定幾何無關——「換掉接觸模型會自動解封」的預告不成立，
// 需要先動 A 或 B 其中一條（皆屬本輪禁區／憲法規格層級）才可能真正解封。
// 二速維持停派，改回 0；第三檔弧線的程式與測試全部保留，之後要試就把這個常數改回 0.35。
// ——歷史結束——
export const TEMPO_TWO_RATE = 0.35;
// 收勢窗：起跳後多久算「這條假動作跑完了」，之後才落回 cover／職責位。
// 24＝sim 既有的滯空窗定義（TUNING.TAKEOFF_LOOKBACK_TICKS，判後排踏線違例用的
// 同一個回溯窗）——動畫與規則共用同一時間錨點，不另立標準（4.7 已建立的原則）
export const AIR_TICKS = 24;
// 起步 tick 算不出來（沒有二傳觸球預估）時的回落速度（m/s）：moveSpeed 的中位值
const NOMINAL_SPEED = 4.0;

const KIND_SALT = { left: 11, right: 23 };

// 這條線跑幾速：快攻恆一速、後排高球恆三速、邊攻由種子決定二速／三速。
// 純 hash（吃 flightId＋池內序＋線別＋seed）＝同種子同球逐值相同，不耗 game rng
//
// passTier 是**這條線自己的檔位**（§7 D2 之後同一顆池裡各線可以不同檔——
// 接了一傳的那個人吃罰則檔，其餘人維持本球的一傳品質檔）。
// 'poor' 的規格字面就是「只剩兩翼高球」＝那一檔不得跑二速的平拉開／半快，
// 沿用同一道三檔階梯、不另立判準。
export function tempoFor(kind, { flightId = 0, seed = 0, index = 0, passTier = 'perfect' } = {}) {
  if (kind === 'quick') return 'one';
  // ---- 段 C：夾塞的節奏＝二速（把段 A 留下的「弧線是半快、節奏是三速」不一致收掉）----
  //
  // 段 A 給 tandem 的舉球落點是 `t = 0.55`＝game.js 的 SHOOT_APEX 4.2 檔（半快弧），
  // 理由是「夾塞的球必須比高球平，否則攔網手有時間從快攻收回來」；但當時 tempoFor
  // 未動，於是這條線的**弧線是半快、節奏標籤卻是三速**。段 A 的結案訊息把它列為
  // 「留給段 C 的已知不一致」。
  //
  // 為什麼是改標籤而不是改弧線：`tempo` 在 sim 裡的唯一體現是**起跳時機**（見上表），
  // 而 SHOOT 弧的 set→擊球 實測 61 tick（tools/combo-probe.mjs ⑤ 換算，見 SET_TO_HIT_TICKS）。
  //   三速：takeoffTick ＝ set + runTicks（跑得快的人**更早**到＝更早起跳＝罰站更久）
  //   二速：takeoffTick ＝ set + 40（TEMPO.two.takeoffLead ＝ −40，錨在二傳觸球上）
  // tandem 的助跑段 (2.6,4.2)→(0.3,2.68) 長 2.757m，以 NOMINAL_SPEED 4.0 需 41 tick
  // ⇒ 兩者算出來的起跳只差 1 tick（41 vs 40）＝**改標籤幾乎不改行為**，但它把
  // 「起跳時機由誰決定」從「這名球員跑多快」換成「二傳幾時觸球」——後者才是節奏的定義，
  // 也讓罰站變成常數 61 − 40 ＝ 21 tick（0.35s，07-23 硬線 0.5s 之內）而不隨屬性漂移。
  // ★ 沒有動任何弧線常數、沒有動 TEMPO 表 ★ 只是讓標籤說出這條線本來就在做的事。
  if (kind === 'tandem') return 'two';
  if ((kind === 'left' || kind === 'right') && passTier !== 'poor') {
    return hash01(flightId * 419 + index * 37 + KIND_SALT[kind] + seed) < TEMPO_TWO_RATE
      ? 'two' : 'three';
  }
  return 'three';
}

// ---- §5 A2 路線組合 ----
//
// 節奏（tempo）決定「什麼時候起步」，路線（kind）決定「往哪裡跑」——兩者正交，
// 合起來才是一條完整的 route。本輪新增的路線只有一條：**交叉**（OH 切進中間）。
//   pipe：後排中央高球，早在 §2 就進了 APPROACH／setAimFor，本輪只是被 route
//         系統一視同仁地涵蓋（見 tests/attack-routes.test.mjs 的 pipe 條款）。
//   slide（單腳背快）：本輪**未做**，工單 §5 明列為唯一可砍項——理由見結案快照。
//
// 交叉只掛在 OH 的 left 線上（OPP 的 right 線不做鏡像版）：交叉的戰術意義是
// 「繞過**中間**攔網手」，而 sim 的快攻點固定在 lx=0，從左側切進去才會經過它；
// 右側鏡像是另一組幾何（前後夾），屬 A2 未做的部分，不在本輪硬性項內。
export const CROSS_RATE = 0.3;
const CROSS_SALT = 57;

// 這名攻擊手本球跑哪條線（純 hash：吃 flightId＋池內序＋seed，不耗 game rng）。
// 非 OH 前排（kind !== 'left'）一律原樣回傳＝其餘線本輪零變化。
// **passTier 必須是 perfect**：交叉是跑戰術，它的全部價值來自「快攻先把中間攔網手
// 帶走」——快攻不在池裡（ok／poor 檔）就沒有東西可繞，那只是繞遠路的高球。
// 這條也讓既有的一傳品質分支規格維持原樣：勉強一傳仍然只剩兩翼高球
// kind 標籤 2026-07-31 由 'cross' 改名為 'left_inside'（機率 CROSS_RATE 一格未動）：
// 這條不是真交叉（見 §一 Q0 背景），'cross' 這個名字留給本卷稍後要做的真交叉。
export function routeKindFor(kind, { flightId = 0, seed = 0, index = 0, passTier = 'perfect' } = {}) {
  if (kind !== 'left' || passTier !== 'perfect') return kind;
  return hash01(flightId * 733 + index * 53 + CROSS_SALT + seed) < CROSS_RATE
    ? 'left_inside' : 'left';
}

// 把路線變體套上整個攻擊池——**必須在 pickAttackPoint 之前套**，
// 否則二傳選中的 kind 與該人實際跑的 route 會是兩條線（舉球落點對不上助跑終點）。
// 純函式、不改入參（points 由 attackPointsOf 供給，該函式維持原樣＝玩家分配面板
// src/input/setOptions.js 讀到的池不受影響）。
// §7 D2：每個 point 可以自帶 `tier`（接一傳者的罰則檔），有就用它、沒有才吃
// opts.passTier——「同一顆池、各線各自的檔位」，不是另開一條平行分支
export function applyRouteKinds(points, opts = {}) {
  return points.map((pt, index) => {
    const kind = routeKindFor(pt.kind, { ...opts, index, passTier: pt.tier ?? opts.passTier });
    return kind === pt.kind ? pt : { ...pt, kind };
  });
}

// ---- 組合排程層（組合攻擊卷 段 B，2026-07-31）：真交叉 ----
//
// ★ 排程順序（藍圖 §三＝裁定 A 乙的形狀），順序不可調換 ★
//   applyRouteKinds（現行單人抽籤，**不動**）
//     → pickAttackPoint（**一格未動**：trust 照現行抽出主攻者）
//     → planCombination（由主攻者的 kind 決定能不能組合、配誰）
//     → applyComboRoutes（只改涉及的兩人）
//     → approachRoutesFor
// 組合排在選人**之後**＝`pickAttackPoint` 的入參逐值不變 ⇒ trust 分佈零漂移。
// 這不是實作偏好，是裁定 A 乙的驗收條件本身（今天已因難度位移欠了一卷，不再疊第二個）。
// 代價（裁定 A 乙已知並接受）：組合觸發率被 trust 分佈綁死。

// 交叉的觸發機率。裁定 C 甲＝`left_inside`（內切）的 `CROSS_RATE` **一格不動**，
// 真交叉**另立**一個機率。
//
// ★★ 初值 0.25 ＝實作端提案，**待 Sawmah 裁定** ★★
//    這是會影響平衡的策略參數，實作端沒有拍板權（CLAUDE.md 硬規則 3）。
// 依據（由兩個上下界夾出來，不是憑感覺挑的）：
//   ① 上界＝裁定 C 自己列的代價「兩個機率相加可能讓 left 直線攻擊出現率過低」。
//      交叉只從**沒被抽成內切的那 (1−CROSS_RATE)** 裡再抽（見 evaluateCombination
//      的 `main.kind === 'left'` 前置條件）⇒ P(直線) ＝ 0.7×(1−p)。
//      要讓直線仍是 OH 左線的多數（>50%）⇒ **p < 0.286**。
//   ② 下界＝可讀性。交叉的全部價值是「攔網手讀得到有這條線」，佔比太低＝與雜訊無異。
//      p=0.25 ⇒ 交叉佔 OH 左線 0.7×0.25 ＝ **17.5%**（約每 5.7 顆 OH 球一次），
//      與 CROSS_RATE 0.30／TEMPO_TWO_RATE 0.35 同一量級帶。
//   ③ 這是**名目上界**：實際觸發還要過「主攻者恰是那名 OH」「MB 快攻在池裡」兩道
//      （裁定 A 乙的已知代價）。實測觸發率見 `tools/combo-probe.mjs`。
export const CROSS_PLAY_RATE = 0.25;
const CROSS_PLAY_SALT = 91;

// ---- 交叉的前後腳偏移（段 B2，2026-07-31）----
//
// 語意：**交叉主攻者比「三速的黃金錨點」早幾 tick 起步**（正值＝提早）。
//   三速原式：startTick = setTick、takeoffTick = setTick + runTicks
//   帶偏移後：startTick = setTick − tempoGap、takeoffTick = setTick + runTicks − tempoGap
// 選這個形式（偏移加在起步，起跳跟著整條平移）而不是「錨死起跳 tick 再倒推起步」：
//   後者對跑得慢的人會把 startTick 推到規劃點之前更遠，被規劃點截斷後反而不可預測；
//   前者的偏移量就是「提早起步幾 tick」本身，可直接對照可用的提前量（見下方 ★）。
//
// ★★ 先讀這段：目標帶「前後腳 20–30 tick」在現行禁區約束下**恆不可達** ★★
//
// 不變量（符號推導，`02 §6.1` 條 6；下方每個數字都有實測對應）：
//   前後腳 ＝ main 物理起跳 − partner 物理起跳
//   main 物理起跳 ＝ main 擊球 tick − 罰站 tick（他到位之後就是站著等球，sim 沒有二次起跳）
//   ⇒ **前後腳 ＝（main 擊球 − partner 起跳）− 罰站 ＝ 87 − 罰站**（tick）
// 右邊那個 87 是兩個**本段禁止觸碰**的常數夾出來的：
//   main 擊球 ＝ set + 82（cross 走 t=0.75 高球弧，tools/tempo-probe.mjs ④ 實測 p50=82）
//   partner 起跳 ＝ set − 5（TEMPO.one.takeoffLead＝14，實測物理值 −5）
// ⇒ 要把前後腳壓進 20–30，必須讓罰站落在 **57–67 tick ＝ 0.95–1.12 秒**，
//   而 07-23 Sawmah 拍板的硬線是 0.5 秒。**兩條驗收互為補集，同時滿足是恆假的。**
//   實測驗證（tools/combo-probe.mjs 24 局，見下表）：gap=80 → 前後腳 0、罰站 63 tick
//   ＝ 100% 破硬線；gap=70 → 前後腳 33、罰站 53 ＝ 100% 破線。恆假成立。
// 要真的做出 0.3–0.5s 的 X 戰術，得讓 cross 的 set→擊球 從 82 掉到 ~45–55 tick
// ＝**新開一檔弧線**（現有兩檔：SHOOT 61／QUICK 33 都不在那個帶），那是段 A 的
// 幾何／彈道層工作，本段明令不得動 ⇒ **交 Sawmah 裁定**。
//
// ★ 那本段的值怎麼定 ★ 取「sim 自己承認**不算罰站**的那個預算」當上界：
//   AI.APPROACH_LEAD ＝ 12 tick（ai.js:51 原文「比精算早到 0.2s＝短暫引臂接起跳，不罰站」）。
//   gap=30 實測罰站平均 13.0 tick ≈ 12 ⇒ **30 ＝ 在「引臂不算罰站」的定義內拿得到的最大壓縮**。
//   這不是對著前後腳擬合出來的數字，是拿既有常數當錨（同 AIR_TICKS／SEP_RADIUS 的用法）。
//
// 實測前緣（tools/combo-probe.mjs 24 局；罰站口徑同 tools/tempo-probe.mjs ③）：
//   gap  前後腳p50  罰站p50  站>0.5s  Δfinal(對段A,RUNS=40)  款3    主攻者扣成率
//    0      88        0       0.0%       +17.5pp ± 7.1        8.1pp    88.8%
//   20      82        3       0.0%        +7.5pp ± 6.6       14.9pp    95.4%
//   30      72       15       0.0%       +10.0pp ± 7.0       15.9pp    95.4%   ← 本段採用
//   40      61       24       1.9%       +10.0pp ± 7.0       16.2pp    95.4%
//   55      53       33      62.5%        +2.5pp ± 6.7       16.6pp    95.4%
//   70      33       53     100.0%       +10.0pp ± 7.8       16.5pp    95.4%
//   ⇒ **前後腳＋罰站 ≈ 87 逐列成立**＝上面那條不變量的實測面。
//   （款 3 是往「安全」的方向跑：門檻是 gap ≥5pp，8.1 → 16 是餘裕變大，不是翻。）
//
// 平衡（配對同種子，基準＝段 A d3542f7 現做）——**RUNS=40 的解析力不足以下判斷**：
//   段 B（gap=0） vs 段A：RUNS=40 Δ決賽 +17.5±7.1（當時據此熔斷）
//                         RUNS=100 Δ決賽 **+8.0±5.1**／Δ準決賽 +15.0±6.1／Δ奪冠 +4.0±2.8
//   gap=30       vs 段A：RUNS=100 Δ決賽 **+4.0±4.9**／Δ準決賽 +3.0±6.7／Δ奪冠 −1.0±1.7
//   ⇒ ① 段 B 那次 +17.5 有一半是 40 局的取樣噪音（100 局同一組種子的超集只剩 +8.0）
//     ② 但方向是穩的，而**加上偏移後三個指標全部收斂到 1 SE 內**＝熔斷解除。
//   真正在起作用的很可能不是「起跳差」本身，而是「攔網手做決定（二傳觸球）那一刻，
//   交叉的 OH 是不是已經在跑」：gap=0 時他還站在邊線的助跑起點，牆讀不到這條線
//   ——這也解釋了為什麼 gap=20（前後腳幾乎沒動）就已經把 Δ 拉下來。
//
// ★★ 值 30 ＝實作端提案，**待 Sawmah 裁定**（同 CROSS_PLAY_RATE 0.25 的處置）★★
export const CROSS_TEMPO_GAP = 30;

// ════════════════════════════════════════════════════════════════
// 段 C（2026-07-31）：夾塞 tandem ＋ 他人時間差 delay
// ════════════════════════════════════════════════════════════════
//
// ★ 兩個「物理 tick」常數表——本段所有時序判準的單一真相 ★
//
// 護欄 3：所有時序斷言一律用**物理 tick**（人真的離地的那一刻／球真的被打到的那一刻），
// 不是 `routeTicks` 的計畫 tick——兩者一速差 8 tick、三速差 14 tick，攔網手讀得到的
// 只有物理值（`blockRead.js` 明文不讀 route 表）。計畫值寫判準＝量錯位置。
//
// 兩張表都是**實測值**，不是推導值，各有一支獨立探針；
// `tests/combo-play.test.mjs` 有一條「重新量一次並比對」的防過期測試
// （改弧線／改 TEMPO 表卻沒改這裡 ⇒ 該測試轉紅），因為它們是本段判準的地基。
//
// PHYS_TAKEOFF_TICKS＝各節奏的物理起跳（相對二傳實際觸球 tick）
//   量法：離開助跑起點 → 走到自己起跳點 1.0m 內 → 單 tick 位移 < 0.005m 的那一格
//   來源：tools/combo-probe.mjs ③「口徑校準」，24 局 p50（一速 −6／二速 44／三速 68）
export const PHYS_TAKEOFF_TICKS = { one: -6, two: 44, three: 68 };
// SET_TO_HIT_TICKS＝二傳實際觸球 → 該節奏的攻擊手擊球，＝**這一檔弧線的飛行時間**
//   來源：tools/tempo-probe.mjs ④（一速 33／二速 61／三速 82），
//   與 tools/combo-probe.mjs ⑤ 反算逐值吻合（二速 61、三速 81）
export const SET_TO_HIT_TICKS = { one: 33, two: 61, three: 82 };

// ---- 夾塞（tandem）----
//
// 幾何早在段 A 就放好了（起點 (2.6,4.2) → 起跳 (0.3,2.68)，符號驗算見 APPROACH 表註解）。
// 本段接上抽籤，主攻者＝**跑 right 的 OPP**（前排），配合者＝跑 quick 的 MB。
//   為什麼是 right 而不是 left：tandem 的助跑起點 lx ＝ +2.6 在右半場，
//   由 OH 從左邊線跑過來要橫越 6m＝那是另一條線（而且 left 已經被交叉佔著）。
//   為什麼不能是 pipe／dball：tandem 的起跳點 lz ＝ 2.68 **在攻擊線（3.0）內**，
//   後排球員在那裡起跳＝踏線違例。`attackPointsOf` 只在前排才產出 'right' ⇒ 天然安全。
//
// ★★ TANDEM_PLAY_RATE 初值 0.25 ＝實作端提案，**待 Sawmah 裁定** ★★
// 依據（兩個上下界夾出來）：
//   ① 上界＝與裁定 C 同一條紀律「直線仍要是該線的多數」。right 線沒有內切那種同族變體
//      ⇒ P(直線) ＝ 1 − p ⇒ **p < 0.5**。實際取值遠低於此。
//   ② 下界＝可讀性，與 CROSS_RATE 0.30／TEMPO_TWO_RATE 0.35 同量級帶。
//   ③ 取「與 CROSS_PLAY_RATE 相同的 0.25」而不是「與交叉的**實效**佔比 17.5% 對齊
//      （＝0.175）」：本卷下一段（段 D 攔網分歧量測）要在**每一型**上各取樣本，
//      同權重的骰子讓兩型的樣本數同量級，是段 D 的前提。
//      ⇒ 實效佔比：交叉 ＝ OH 左線的 17.5%（先被 CROSS_RATE 切掉 30%），
//                 夾塞 ＝ OPP 右線的 25.0%（沒有同族變體先切）。
//        要讓兩型實效佔比相等，值應改 0.175 ——這是 Sawmah 的選擇題，不是實作的。
export const TANDEM_PLAY_RATE = 0.25;
const TANDEM_PLAY_SALT = 137;
// 夾塞條件 3「節奏錯開」的門檻（tick）。取 AI.APPROACH_LEAD ＝ 12
// （ai.js:51 原文「比精算早到 0.2s＝短暫引臂接起跳」）＝ sim 自己定義的
// 「這點時間差還算同一拍」的預算；差得比它多才算真的錯開。與 CROSS_TEMPO_GAP
// 用同一個錨（不另立標準）。
export const TANDEM_STAGGER_TICKS = 12;

// ---- 他人時間差（delay）----
//
// 語意（真實排球）：MB 跑一個**不會來球的快攻**，攔網手跟著他起跳；等他落地時，
// 邊攻才把球打下去——攔網手在下降段，牆等於不存在。
// 「他人」＝誘餌是別人（對照「自我時間差」：同一個人先假跳再真跳）。
//
// ★ 這一型在 sim 裡改的是什麼 ★
// 誘餌是**湧現**的（池內每個 point 都拿到完整 route，MB 每一波本來就在跑假快攻），
// 所以「有沒有誘餌」不是變數。真正的變數是**主攻者的節奏**：
//   三速（高球弧 t=0.75）：誘餌落地後還要等 63 tick（1.05s）才擊球 ⇒ 牆早就落地重整
//   二速（半快弧 t=0.55）：誘餌落地後 43 tick（0.72s）擊球 ⇒ 才construct得上「時間差」
// ⇒ **delay ＝ 把主攻者的節奏從三速改成二速**（`combo.mainTempo`），
//   不改線、不改弧線常數、不動誘餌（partner 的 route 一格未動＝湧現式不破）。
//
// ★★ DELAY_WINDOW ＝ 51，**先量再定**（裁定 D 丙），下面是實測分佈 ★★
// 量法：offset ＝ main 擊球（第三擊 TOUCH 的絕對 tick）− partner 落地
//      （partner 物理起跳 + AIR_TICKS），**兩端皆物理 tick**。
// tools/combo-probe.mjs ⑤，24 局：
//   main tempo=two    n=174   min 33／p10 34／**p50 43**／p90 45／max 48
//   main tempo=three  n=1007  min 54／p10 56／**p50 63**／p90 66／max 71
//   兩個分佈之間有一條**空帶 (48, 54)**，51 ＝ 空帶中點（兩側各 3 tick 餘裕）。
// ⇒ 二速 100% 落在窗內、三速 0%。
//
// ⚠⚠ 藍圖 §四 的試算「差 16 tick，窗取 ±8 恆假、取 ±20 幾乎恆真」**與實測不符** ⚠⚠
//   實測 43，不是 16。兩端都錯：藍圖用 §〇.2 的「一速物理起跳 +15」，而段 B2 修好
//   量測口徑（加位置閘）後實測是 **−6**（差 21 tick）；main 側藍圖用 55、實測 61。
//   ⇒ **照藍圖寫 ±20 的話，delay 是恆假的**（|43| > 20，一顆都不會成立）。
//   這是本專案抓到的第五個恆假，而且又一次出現在「驗收要用的門檻」上。
// ★★ 值 51 ＝實作端提案，待 Sawmah 裁定（同 CROSS_PLAY_RATE／CROSS_TEMPO_GAP 的處置）★★
export const DELAY_WINDOW = 51;
// 時間差成立時，主攻者被指派的節奏（＝上面推導出「落在窗內」的那一檔）
export const DELAY_TEMPO = 'two';
// ★★ DELAY_PLAY_RATE 初值 0.20 ＝實作端提案，**待 Sawmah 裁定** ★★
// 依據：delay 動的是**節奏軸**（不是路線軸），所以上下界要在節奏的分佈上推：
//   ① 上界＝「三速高球仍是邊攻的多數」（它是這個遊戲的基準攻擊，不該被戰術擠成少數）。
//      邊攻走三速的比例 ＝ (1 − TEMPO_TWO_RATE) × (1 − d) ＝ 0.65 × (1 − d) > 0.5
//      ⇒ **d < 0.231**。
//   ② 下界＝可讀性：delay 佔邊攻 ＝ 0.65 × d ≥ 10% ⇒ **d ≥ 0.154**。
//   ③ 取 0.20 ⇒ delay 佔邊攻 13.0%、三速仍佔 52.0%。
//   ④ 注意這是**名目**：delay 排在交叉／夾塞之後評估，被前兩型拿走的波不再進入。
export const DELAY_PLAY_RATE = 0.20;
const DELAY_PLAY_SALT = 173;

// 三型的規格表（放同一處＝新增一型只改這裡，不必到處找散落的 if）
// 順序即**評估順序**，先成立者勝 ⇒ 三型天然互斥（藍圖 §四 夾塞條件 4）
export const COMBO_TYPES = ['cross', 'tandem', 'delay'];
// 主攻者本來要跑哪條線才有資格升級成這一型
const COMBO_MAIN_KINDS = { cross: ['left'], tandem: ['right'], delay: ['left', 'right'] };
// 組合型別 → 配合者必須跑的線（藍圖 §四 交叉條件 1；三型的誘餌都是 MB 快攻）
const COMBO_PARTNER_KIND = { cross: 'quick', tandem: 'quick', delay: 'quick' };
// 主攻者被改成哪條線；null＝**維持原線**（delay 只動節奏不動路線）
const COMBO_LINE = { cross: 'cross', tandem: 'tandem', delay: null };
// 主攻者被指派的節奏；null＝照 tempoFor（cross 走三速高球、tandem 由 tempoFor 給二速）
const COMBO_TEMPO = { cross: null, tandem: null, delay: DELAY_TEMPO };
// 主攻者的起步偏移（段 B2 的 tempoGap）
const COMBO_LEAD = { cross: CROSS_TEMPO_GAP, tandem: 0, delay: 0 };
const COMBO_RATE = {
  cross: CROSS_PLAY_RATE, tandem: TANDEM_PLAY_RATE, delay: DELAY_PLAY_RATE,
};
const COMBO_SALT = {
  cross: CROSS_PLAY_SALT, tandem: TANDEM_PLAY_SALT, delay: DELAY_PLAY_SALT,
};

// 交叉的三條幾何條件（藍圖 §四 條件 2／3／5）——只吃兩條線的 kind，純幾何、可單測。
// **回傳逐條結果而不是一個 boolean**：驗收 ② 要看得出「是哪一條在擋」，
// 只回總結等於把失敗原因藏起來。
export function crossGeometryOf(team, mainKind = 'cross', partnerKind = 'quick') {
  const s = approachStartFor(team, mainKind);
  const nil = {
    crosses: false, behind: false, outOfReach: false, ok: false, lzAtLane: null, gap: null,
  };
  if (!s || !APPROACH[partnerKind]) return nil;
  const t = takeoffSpotFor(team, mainKind);
  const p = takeoffSpotFor(team, partnerKind);
  const side = TEAM_SIDE[team];
  const sLx = side * s.x; const sLz = side * s.z;
  const tLx = side * t.x; const tLz = side * t.z;
  const pLx = side * p.x; const pLz = side * p.z;
  // 條件 2 穿越：主攻者助跑線段的 lx 區間包含配合者起跳點的 lx
  const crosses = tLx !== sLx
    && pLx >= Math.min(sLx, tLx) && pLx <= Math.max(sLx, tLx);
  // 條件 3 後方：線段在該 lx 處的 lz 高於配合者起跳點的 lz（＝從他**身後**穿過去）
  const lzAtLane = crosses
    ? sLz + ((pLx - sLx) / (tLx - sLx)) * (tLz - sLz) : null;
  const behind = crosses && lzAtLane > pLz;
  // 條件 5 搆不到：兩人擊球點的距離超過單人攔網的水平涵蓋半寬
  const gap = Math.hypot(t.x - p.x, t.z - p.z);
  const outOfReach = gap > BLOCK_HALF_WIDTH;
  return {
    crosses, behind, outOfReach, ok: crosses && behind && outOfReach, lzAtLane, gap,
  };
}

// 這條線的名目助跑 tick（決定論：吃 NOMINAL_SPEED，不吃個人屬性）——
// 只在**規劃期的節奏判準**用（三速的起跳 tick ＝ set + runTicks，需要它才算得出來）。
// 實跑時 approachRoutesFor 用的是該球員自己的 moveSpeed，兩者可能差幾 tick；
// 判準吃名目值＝「這條線的節奏」是線的屬性，不隨跑者快慢改變（否則同一型組合會
// 因為換人上場而時成立時不成立）。
function nominalRunTicks(team, kind, tempo) {
  const s = approachStartFor(team, kind);
  const t = takeoffSpotFor(team, kind, tempo);
  if (!s || !t) return 1;
  return Math.max(1, Math.round(
    Math.hypot(t.x - s.x, t.z - s.z) / (NOMINAL_SPEED * SIM_DT),
  ));
}

// 這條線的**計畫**起跳（相對二傳觸球）——與 routeTicks 同一條算式，不重刻。
// （夾塞條件 3 只能吃計畫值：它是規劃期的判準，物理值要跑完才知道。
//   物理面的驗證交給 tools/combo-probe.mjs ③ 的前後腳分佈，兩邊都要看。）
function plannedTakeoffOffset(team, kind) {
  const tempo = tempoFor(kind);
  return tempo === 'three' ? nominalRunTicks(team, kind, tempo) : -TEMPO[tempo].takeoffLead;
}

// 夾塞的四條判定（藍圖 §四 夾塞條件 1／2／3／4）——同樣**逐條回傳**，理由同 crossGeometryOf。
//   1 同線     |Δlx| ≤ TANDEM_LANE_M
//   2 前後疊   Δlz ≥ TANDEM_DEPTH_M（硬下界 SEP_RADIUS 0.55，見常數註解）
//   3 節奏錯開 計畫起跳 tick 差 ≥ TANDEM_STAGGER_TICKS
//   4 兩型互斥 不得同時滿足交叉的穿越條件（否則同一波被雙重計數）
export function tandemGeometryOf(team, mainKind = 'tandem', partnerKind = 'quick') {
  const nil = {
    lane: false, depth: false, stagger: false, notCrossing: false, ok: false,
    laneGap: null, depthGap: null, staggerTicks: null,
  };
  if (!APPROACH[mainKind] || !APPROACH[partnerKind]) return nil;
  const side = TEAM_SIDE[team];
  const m = takeoffSpotFor(team, mainKind, tempoFor(mainKind));
  const p = takeoffSpotFor(team, partnerKind, tempoFor(partnerKind));
  const laneGap = Math.abs(side * m.x - side * p.x);
  const depthGap = side * m.z - side * p.z;
  const staggerTicks = plannedTakeoffOffset(team, mainKind)
    - plannedTakeoffOffset(team, partnerKind);
  const lane = laneGap <= TANDEM_LANE_M;
  const depth = depthGap >= TANDEM_DEPTH_M;
  const stagger = Math.abs(staggerTicks) >= TANDEM_STAGGER_TICKS;
  const notCrossing = !crossGeometryOf(team, mainKind, partnerKind).crosses;
  return {
    lane, depth, stagger, notCrossing,
    ok: lane && depth && stagger && notCrossing,
    laneGap, depthGap, staggerTicks,
  };
}

// 他人時間差的兩條判定（藍圖 §四 delay 條件 1／2）——**全程物理 tick**（護欄 3）。
//   1 partner 物理起跳 < main 物理起跳（誘餌先跳，他才是誘餌）
//   2 partner 落地（物理起跳 + AIR_TICKS）落在 main 擊球的 ±DELAY_WINDOW 內
// 三個時間點全部由上方兩張實測表導出，本函式只做算術＝可單測、可符號檢查。
export function delayTimingOf(mainTempo = DELAY_TEMPO, partnerKind = 'quick') {
  const partnerTempo = tempoFor(partnerKind);
  const nil = {
    earlier: false, inWindow: false, ok: false, offset: null, land: null, hit: null,
  };
  const mainTakeoff = PHYS_TAKEOFF_TICKS[mainTempo];
  const partnerTakeoff = PHYS_TAKEOFF_TICKS[partnerTempo];
  const hit = SET_TO_HIT_TICKS[mainTempo];
  if (mainTakeoff == null || partnerTakeoff == null || hit == null) return nil;
  const land = partnerTakeoff + AIR_TICKS;
  const offset = hit - land;
  const earlier = partnerTakeoff < mainTakeoff;
  const inWindow = Math.abs(offset) <= DELAY_WINDOW;
  return { earlier, inWindow, ok: earlier && inWindow, offset, land, hit };
}

// 配合者＝**池內幾何最接近者**（裁定 B）——**不吃 trust**：用 trust 選誘餌語意是反的
// （信任最高的人去當誘餌？）。「最接近」＝配合者起跳點離主攻者本型終點最近；
// 同距離時取 pid 字典序小者（決定論；現行池內 quick 至多一人，此分支是防禦性的）。
// mainKind＝主攻者這一型**實際會跑的線**（delay 不換線 ⇒ 就是他本來那條）。
function pickComboPartner(team, points, mainId, type, mainKind) {
  const want = COMBO_PARTNER_KIND[type];
  if (!want) return null;
  const goal = takeoffSpotFor(team, mainKind ?? type);
  let best = null;
  for (const pt of points) {
    if (pt.pid === mainId || pt.kind !== want) continue;
    const t = takeoffSpotFor(team, pt.kind);
    const d = Math.hypot(t.x - goal.x, t.z - goal.z);
    if (!best || d < best.d - 1e-12
      || (Math.abs(d - best.d) <= 1e-12 && pt.pid < best.pt.pid)) best = { pt, d };
  }
  return best?.pt ?? null;
}

// 組合排程的**逐條診斷版**。`planCombination` 是它的薄封裝——sim 只吃 combo，
// 探針與測試讀 checks。刻意讓探針**讀真實判斷式的結果**而不是自己重刻一份：
// 重抄一份被測邏輯做成的探針是循環論證（`02 §6.1` 條 4）。
//
// points＝applyRouteKinds 之後的池（每個 point 自帶 `tier`，§7 D2）。
// mainId＝pickAttackPoint 已經抽好的主攻者——**本函式不參與選人**。
export function evaluateCombination(points, mainId, opts = {}) {
  const {
    team = 'A', flightId = 0, seed = 0, passTier = 'perfect', type = 'cross',
  } = opts;
  // 型別專屬條件先佔位（順序＝探針列印順序，也是「前一條沒過就走不到下一條」的順序）
  const checks = { hasMain: false, mainKind: false, tier: false, partner: false };
  if (type === 'cross') Object.assign(checks, { crosses: false, behind: false, outOfReach: false });
  else if (type === 'tandem') {
    Object.assign(checks, { lane: false, depth: false, stagger: false, notCrossing: false });
  } else if (type === 'delay') Object.assign(checks, { earlier: false, inWindow: false });
  checks.roll = false;

  const main = mainId ? (points.find((p) => p.pid === mainId) ?? null) : null;
  checks.hasMain = !!main;
  if (!main) return { combo: null, checks };
  // 主攻者本來跑的線決定他有沒有資格升級成這一型：
  //   cross ← left（OH 直線）／tandem ← right（OPP 直線）／delay ← left 或 right（邊攻）
  // 內切（left_inside）與已經是組合線的 cross／tandem 都不在名單上
  // ⇒ CROSS_RATE 的機率帶一格不動（裁定 C 甲），且不會出現「組合疊組合」。
  checks.mainKind = (COMBO_MAIN_KINDS[type] ?? []).includes(main.kind);
  if (!checks.mainKind) return { combo: null, checks };
  // 跑戰術要一傳到位——與 routeKindFor 同一道三檔階梯，不另立判準。
  // 一傳 poor 沒快攻時組合自然不成立（裁定 B：這是預期行為，不是 bug）
  checks.tier = (main.tier ?? passTier) === 'perfect';
  if (!checks.tier) return { combo: null, checks };
  // delay 不換線 ⇒ 主攻者實際跑的還是他本來那條
  const mainKind = COMBO_LINE[type] ?? main.kind;
  const partner = pickComboPartner(team, points, mainId, type, mainKind);
  checks.partner = !!partner;
  if (!partner) return { combo: null, checks };
  let structOk = false;
  if (type === 'cross') {
    const geo = crossGeometryOf(team, mainKind, partner.kind);
    checks.crosses = geo.crosses;
    checks.behind = geo.behind;
    checks.outOfReach = geo.outOfReach;
    structOk = geo.ok;
  } else if (type === 'tandem') {
    const geo = tandemGeometryOf(team, mainKind, partner.kind);
    checks.lane = geo.lane;
    checks.depth = geo.depth;
    checks.stagger = geo.stagger;
    checks.notCrossing = geo.notCrossing;
    structOk = geo.ok;
  } else {
    const t = delayTimingOf(COMBO_TEMPO[type], partner.kind);
    checks.earlier = t.earlier;
    checks.inWindow = t.inWindow;
    structOk = t.ok;
  }
  if (!structOk) return { combo: null, checks };
  // 觸發機率排在最後：前面每一條都是「這球有沒有資格組合」的結構條件，
  // 骰子只決定「有資格的這球要不要真的跑」。順序反過來會讓 checks 的通過率
  // 全部被骰子稀釋成 p×(結構通過率)＝看不出是哪一條在擋。
  checks.roll = hash01(flightId * 1097 + COMBO_SALT[type] + seed) < COMBO_RATE[type];
  if (!checks.roll) return { combo: null, checks };
  return {
    combo: {
      type,
      mainId,
      partnerId: partner.pid,
      // 段 B2：由留白改為實值＝主攻者提早起步幾 tick（0＝與段 B 逐值相同）
      tempoGap: COMBO_LEAD[type],
      // 段 C：主攻者被指派的節奏；null＝照 tempoFor（delay 是唯一會指派的一型）
      mainTempo: COMBO_TEMPO[type],
      // 幾何自證欄位：探針與測試直接讀，不必跨欄位對照
      mainKind,
      partnerKind: partner.kind,
    },
    checks,
  };
}

// 三型逐一評估（順序＝COMBO_TYPES）。**先成立者勝** ⇒ 一波至多一個組合＝三型互斥，
// 不可能同時被計為交叉與夾塞（驗收 ②）。三型全評估而不是命中就跳出：
// checks 要交出「是哪一條在擋」，跳出等於把後兩型的診斷藏起來。
// hash01 是純函式（不耗 game rng），多評估兩次零副作用。
export function evaluateCombinations(points, mainId, opts = {}) {
  const byType = {};
  let combo = null;
  for (const type of COMBO_TYPES) {
    const ev = evaluateCombination(points, mainId, { ...opts, type });
    byType[type] = ev.checks;
    if (!combo && ev.combo) combo = ev.combo;
  }
  return { combo, byType };
}

// null＝本波沒有組合＝現行單人行為（退路分支）
export function planCombination(points, mainId, opts = {}) {
  return evaluateCombinations(points, mainId, opts).combo;
}

// 把組合的線寫回池——**只動涉及的兩人**，其餘 point 原樣（同一個物件參照）。
// 純函式、不改入參（與 applyRouteKinds 同範式）。
export function applyComboRoutes(points, combo) {
  if (!combo) return points;
  return points.map((pt) => {
    if (pt.pid === combo.mainId && pt.kind !== combo.mainKind) {
      return { ...pt, kind: combo.mainKind };
    }
    if (pt.pid === combo.partnerId && pt.kind !== combo.partnerKind) {
      return { ...pt, kind: combo.partnerKind };
    }
    return pt;
  });
}

// 一條 route 的三個時間點（純算術，與幾何無關；抽出來是為了三種節奏都能被單測到
// ——實戰裡哪些節奏會被指派受 TEMPO_TWO_RATE 影響，規格本身不該被那個比例綁住）：
//   startTick   起步（離開助跑起點）
//   takeoffTick 起跳（＝抵達起跳點、到位即停）
//   settleTick  收勢完成（之後才落回 cover／職責位）
// 一速／二速：先算起跳（早於二傳觸球 takeoffLead 個 tick），再倒推起步。
// 三速：起步＝二傳觸球那一刻（黃金錨點），起跳自然落在觸球後 runTicks。
// comboLead＝組合偏移（段 B2 的 tempoGap，正值＝整條 route 往前平移幾 tick）。
// 預設 0＝本函式對所有非組合的 route 逐值不變（零率對照的機械保證之一）。
export function routeTicks(tempo, setTick, runTicks, comboLead = 0) {
  if (setTick == null) return { startTick: null, takeoffTick: null, settleTick: null };
  const takeoffTick = (tempo === 'three'
    ? setTick + runTicks
    : setTick - TEMPO[tempo].takeoffLead) - comboLead;
  return {
    startTick: takeoffTick - runTicks,
    takeoffTick,
    settleTick: takeoffTick + AIR_TICKS,
  };
}

// 整個攻擊池的 route（§4「全員各跑各的線」直接吃這個）：
// points＝attackPointsOf(game, team, setterId, passTier) 的輸出。
// opts.setTick＝預估的「二傳觸球 tick」（絕對 tick）——本檔不預測球，由呼叫端
// 用既有的 contactPoint 錨點供給（同一個錨點也餵表現層的舉球預備動作）。
// 給不出 setTick 時（預測失效）三個 tick 欄位皆 null＝呼叫端回落「站在起點等」。
export function approachRoutesFor(team, points, opts = {}) {
  const {
    setTick = null, flightId = 0, seed = 0, speedOf = null, passTier = 'perfect',
    combo = null,
  } = opts;
  const routes = [];
  points.forEach((pt, index) => {
    const start = approachStartFor(team, pt.kind);
    if (!start) return;
    // §7 D2：檔位以 point 自帶的為準（接一傳者的罰則檔），沒帶才吃本球的一傳品質
    // 段 C：組合可以**指派主攻者的節奏**（delay ＝ 把三速換成二速，讓誘餌落地與擊球
    // 對得上；見 DELAY_WINDOW 的實測分佈）。指派只掛在主攻者身上，配合者的 route
    // 一格未動＝誘餌維持湧現式。combo.mainTempo 為 null／undefined 時逐值走原路徑。
    const isComboMain = !!combo && pt.pid === combo.mainId;
    const tempo = (isComboMain && combo.mainTempo)
      ? combo.mainTempo
      : tempoFor(pt.kind, { flightId, seed, index, passTier: pt.tier ?? passTier });
    const takeoff = takeoffSpotFor(team, pt.kind, tempo);
    // 助跑段跑完要幾 tick＝距離 ÷ 這個人的步長（決定論：moveSpeed 純吃屬性）。
    // 疲勞折速不計入——這是規劃期的預估值，估得樂觀＝晚到一點點，不影響到位即停
    const stepM = ((speedOf ? speedOf(pt.pid) : NOMINAL_SPEED) || NOMINAL_SPEED) * SIM_DT;
    const runTicks = Math.max(1, Math.round(
      Math.hypot(takeoff.x - start.x, takeoff.z - start.z) / stepM,
    ));
    // 組合偏移只掛在**主攻者**身上（配合者跑他本來的一速，TEMPO.one 一格未動）。
    // 掛在 route 上而不是走位分支去讀 combo：走位分支讀 attackCombo 就等於內建誘餌
    // 旗標（藍圖 §六，ai.js 的 COMBO-SCAN 護欄）；route 欄位與 tempo 同性質＝
    // 「這條線幾時起步」，攔網手本來就讀得到的東西。
    const comboLead = isComboMain ? (combo.tempoGap ?? 0) : 0;
    routes.push({
      pid: pt.pid, kind: pt.kind, tempo, start, takeoff, runTicks, comboLead,
      ...routeTicks(tempo, setTick, runTicks, comboLead),
    });
  });
  return routes;
}

// §9 `ActionPhaseContract` 的案例 A 接口：這條 route 在這一 tick 走到哪一段。
//   wait    還沒到起步 tick（或 setTick 預測失效＝三個 tick 欄位皆 null）＝站在起點等
//   chase   起步了、還沒到起跳 tick＝跑向起跳點（實際的「停」由到位判定給，見 ai.js）
//   air     滯空收勢窗（窗長＝本檔 AIR_TICKS，契約不另立標準）
//   release 收勢完成＝落回 cover／職責位
// 三個 tick 欄位（startTick／takeoffTick／settleTick）本身仍由 routeTicks 排定，
// 此處只是把「tick → 相位」的判讀交給契約，數值與邊界一格未動
// （settleTick === takeoffTick + AIR_TICKS，見 routeTicks）。
export function routePhaseAt(route, tick) {
  return actionPhaseAt(tick, {
    enterTick: route?.startTick ?? null,
    airTick: route?.takeoffTick ?? null,
    airTicks: AIR_TICKS,
  });
}

// 查表：這名球員本球的 route（不是合法攻擊手＝null）
export function approachRouteOf(routes, playerId) {
  if (!routes) return null;
  for (const r of routes) if (r.pid === playerId) return r;
  return null;
}

// 查表：這名球員本球的助跑起點（不是合法攻擊手＝null）
export function approachStartOf(routes, playerId) {
  if (!routes) return null;
  for (const r of routes) if (r.pid === playerId) return r.start;
  return null;
}
