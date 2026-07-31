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
import { localToWorld } from './rotation.js';
import { hash01 } from './rng.js';
import { actionPhaseAt } from './actionPhase.js';

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
  // OPP 2 號位：沿用 OH 架構鏡像
  right: { lx: 3.6, lz: 3.6, steps: 4 },
  // 後排 pipe：四步、**離網最遠**（4.7 量到的 0.86m 空中前飄即此成因，屬正確行為）
  pipe: { lx: -1, lz: 5.6, steps: 4 },
  // 後排 D 球：pipe 的右路版（同屬後排攻擊，深度一致）
  dball: { lx: 2.6, lz: 5.6, steps: 4 },
};

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

// 一條 route 的三個時間點（純算術，與幾何無關；抽出來是為了三種節奏都能被單測到
// ——實戰裡哪些節奏會被指派受 TEMPO_TWO_RATE 影響，規格本身不該被那個比例綁住）：
//   startTick   起步（離開助跑起點）
//   takeoffTick 起跳（＝抵達起跳點、到位即停）
//   settleTick  收勢完成（之後才落回 cover／職責位）
// 一速／二速：先算起跳（早於二傳觸球 takeoffLead 個 tick），再倒推起步。
// 三速：起步＝二傳觸球那一刻（黃金錨點），起跳自然落在觸球後 runTicks。
export function routeTicks(tempo, setTick, runTicks) {
  if (setTick == null) return { startTick: null, takeoffTick: null, settleTick: null };
  const takeoffTick = tempo === 'three'
    ? setTick + runTicks
    : setTick - TEMPO[tempo].takeoffLead;
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
  } = opts;
  const routes = [];
  points.forEach((pt, index) => {
    const start = approachStartFor(team, pt.kind);
    if (!start) return;
    // §7 D2：檔位以 point 自帶的為準（接一傳者的罰則檔），沒帶才吃本球的一傳品質
    const tempo = tempoFor(pt.kind, { flightId, seed, index, passTier: pt.tier ?? passTier });
    const takeoff = takeoffSpotFor(team, pt.kind, tempo);
    // 助跑段跑完要幾 tick＝距離 ÷ 這個人的步長（決定論：moveSpeed 純吃屬性）。
    // 疲勞折速不計入——這是規劃期的預估值，估得樂觀＝晚到一點點，不影響到位即停
    const stepM = ((speedOf ? speedOf(pt.pid) : NOMINAL_SPEED) || NOMINAL_SPEED) * SIM_DT;
    const runTicks = Math.max(1, Math.round(
      Math.hypot(takeoff.x - start.x, takeoff.z - start.z) / stepM,
    ));
    routes.push({
      pid: pt.pid, kind: pt.kind, tempo, start, takeoff, runTicks,
      ...routeTicks(tempo, setTick, runTicks),
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
