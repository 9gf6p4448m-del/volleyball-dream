// D3 回合 AI — 雙層架構（純函式、決定論；隊友/對手/未來多人補位共用同一套）
//   協調層：每個 flight 指派一次「誰接球」（責任區 → 呼叫鎖定不可撤銷 → 最近者 → ID 序）
//   個體層：待命 → 判來球 → 移動到位 → 執行動作 → 回位
// 原則：寧可有人搶錯，不可兩人互讓（呼叫鎖定以 flightId 為鍵，天然不可撤銷、不打架）
// 難度＝堪打等級：動作正確、不玩心理戰、不打刁鑽落點（強度調參 Phase 2+）
import { BALL, COURT, SIM_DT, SETTER_SPOT } from './constants.js';
import { serverId } from './match.js';
import {
  otherTeam, basePosition, localToWorld, isFrontRow, isBackRow, positionOf, TEAM_SIDE,
} from './rotation.js';
import { standingReach, spikeReach, moveSpeed } from './player.js';
import {
  predictLanding, predictContactPoint, predictNetCrossing, spikeVelocity, heightAtNet,
} from './flight.js';
import { createIntent } from './intent.js';
import {
  approachRoutesFor, approachStartOf, approachRouteOf, setAimFor, TAKEOFF,
  applyRouteKinds, routeKindFor, routePhaseAt, planCombination, planSoloPlay,
  applyComboRoutes, applySoloRoute,
  resolveCalledPlay, offeredCallTypes, AIR_TICKS,
  evaluateCombination, firstFailedCheck,
} from './approach.js';
import { ACTION_PHASE, actionPhaseAt } from './actionPhase.js';
import {
  blockLaneRead, digForBlock, blockCommitRead, blockCloseBudget,
  BLOCK_PERSONA, BLOCK_COMMIT, spikeAimsAt, netCrossingX,
} from './blockRead.js';
import { hash01 } from './rng.js';
import { TUNING, spikeSpeed, spikeRouteAt, spikeClearanceFor } from './game.js';
import { REACH_ACTION, reachRadiusFor, SET_HANDPOINT_H_RATIO } from './reach.js';
import { trustToWeights, pickByWeights, effectiveTrust, applyFloorShare } from './trust.js';
import { STAMINA, staminaPerfMul } from './stamina.js';

// export：助跑起點的不變量測試要拿 TAKEOFF_* 算「起跳點在哪」，
// 常數必須是同一份——測試自己抄一份就會跟本體漂移（07-28）
export const AI = {
  SERVE_DELAY: 30,        // 可發球後再等的 tick 數（模擬哨音到發球的節奏）
  // §十-4b 縮手線索：read 預測的擊球點 |x| 超過此值＝對手被擠到邊線外帶勉強打，
  // 高機率是出界球或 tool——縮手不給打（天線在 ±4.5，留 0.3 的邊帶）
  BLOCK_RETRACT_WIDE_X: 4.2,
  // §十-4b 縮手線索②開關：一傳 poor 也縮（「別攔爛球」）。掛常數是給驗收探針
  // in-process 消融用（對照臂＝兩線索齊關量「沒有縮手時被 tool 失分率」）
  // ★★ 2026-08-11 爆接／poor 一傳卷：1 → 0（使用者裁定「精準版」）★★
  // 起點是真人回報「接噴之後還可以很好地扣出第三球」。查下來三個機制各自合理、
  // 疊起來反了：①攻擊池在 poor 檔收斂 ✓ ②守方讀到 poor 縮手、**賭對方自打出界** ✓
  // ③但一傳品質從未進入擊球結果的算式 ✗ ⇒ 那個賭注永遠不會兌現。
  // ★這顆賭注的收支表（段 0 紅色基準，反事實臂＝把本旗標設 0 的 in-process 消融）★
  //   poor 波扣球**被攔率** 1.61% → **35.74%**（+34.13pp）＝放棄掉的攔網成功率
  //   對手自打出界率 0.51% → 0.35%（**−0.16pp**）＝賭贏換到的東西
  //   攻方該分勝率 72.50% → 68.09%（−4.41pp）
  //   ⇒ **放棄 34.1pp 只換到 0.16pp，而且獨力吃掉 poor 應有懲罰的 58%**。
  // ★關鍵發現：關掉之後 poor 被攔率 35.74% **高於** perfect 的 23.59%
  //   ⇒「砍選項」那條懲罰一直是有效的，只是在最後一步被這顆旗標抵銷掉★
  // ⚠ 逐格量過：落點誤差與出界率在 d（一傳偏移）0→11m 全程是**平的**
  //   （p50 0.175–0.237、出界 0.26–0.71%）⇒ **懲罰通道是「被攔」不是「失誤」**，
  //   所以修法不是把 passTier 接進 `scatterTarget`，是把牆還回來。
  // ⚠ 另一條線索（`BLOCK_RETRACT_WIDE_X`＝擊球點被擠到邊線外帶）**保留**：
  //   那是真的「別被 tool」的情境，與一傳品質無關。
  // ⚠ poor 的真實佔比是 **21.3%**（不是註解裡那組 87/8/4.9——那是裸 createGame、
  //   10 局、只在第二觸取樣量的；真實路徑 74.2/4.5/21.3）⇒ 這顆旗標影響**每五波一波**。
  BLOCK_RETRACT_ON_POOR: 0,
  // 到位判定（m）：小於此距離就完全不動。**必須遠小於單 tick 步長**
  // （步長＝moveSpeed 2.8–5.2 / 60 ＝ 0.047–0.087 m），否則走位目標每 tick 的微移
  // 會被死區吃掉、累積到帶外才「一次全速釋放」＝滿速↔靜止的 stop-go 極限環
  // （07-28 逐幀實測：速度在 4.29 與 0 之間每 3–4 tick 交替＝視覺上的「原地跳舞」）。
  // 0.004m 的殘差一次釋放＝0.24 m/s，低於表現層的移動門檻 0.25，不會誘發踏步動畫
  ARRIVE_EPS: 0.004,
  ATTEMPT_RADIUS: 0.95,   // 觸球嘗試距離（保底寬門檻）＝ REACH_RADIUS × 此係數
  RECV_CONTACT_Y: 1.35,   // 接球舒適高度（走位深度：瞄球墜到此高度的水平位置＝接觸點）
  RECV_BAND: 0.3,         // 接球高度帶半寬（球墜進 1.35±0.3 時抓「到位觸球」）
  CLOSE_RADIUS: 0.45,     // 嚴門檻（球在接球帶內＝逼人站到球正下方才觸）＝ REACH_RADIUS × 此
  SPIKE_MIN_Y: COURT.NET_HEIGHT * 0.85, // 球低於此高度就不硬扣、改送安全球
  SPIKE_APPROACH_Y: 2.9,  // 扣球窗上緣（一氣呵成助跑的到位目標：球墜到此高度時人剛到）
  APPROACH_LEAD: 12,      // 助跑提前量（tick）：比精算早到 0.2s＝短暫引臂接起跳，不罰站
  // 起跳點＝擊球點往自家後場退多遠（m）——決定「空中前飄」的實際距離。
  // 前排幾乎垂直拔起（真人 0.3-0.5m）；後排在三米線後起跳、往前上方衝進去打，
  // 位移本就較大。上限受 TUNING.REACH_RADIUS(1.3) 約束——退太遠就打不到球
  // 直覺會以為「退得遠＝飄得遠」，實際相反：退得遠＝更早到位＝停得更久＝前飄更小
  // （探針實證：back 0.9 的後排前飄只有 0.21m，前排 0.45 反而 0.71m）。
  // 要後排有「往前衝進去打」的位移，反而要讓他站得靠近一點、晚一點到位
  // ★數值的單一真相已於 §4 上移到 approach.js 的 TAKEOFF（起跳點是「舉球落點往後
  // 退一段」，助跑 route 要自己算得出來）；**值一格未動**，此處只是別名
  TAKEOFF_FRONT_M: TAKEOFF.FRONT,
  TAKEOFF_BACK_M: TAKEOFF.BACK,
  TAKEOFF_SETTLE_M: TAKEOFF.SETTLE,  // 離起跳點多近算「到位」（到位即停＝原地拔起）
  // 叫戰術重做卷 段 1（裁定 1C）：早訊號判準①「他離自己的助跑起點多近算已進助跑線」（m）。
  // ★不是新數字★ 它對齊的是 `src/ui/routeCue.js` 的 `AT_START_M`（同值 0.3、同語意
  // 「距起點多遠算還沒到位」）——**畫面對玩家說「就位」的那把尺，必須與 sim 判
  // 「他有跑」的那把尺是同一把**，否則提示說就位、S 卻在同一 tick 判他不跑。
  // 兩處同值由 tests/route-commit.test.mjs 的靜態掃描守著（漂了就轉紅）。
  // 量級來源同 routeCue 的原註解：sim 判「走到定點了」的死區量級
  //（approach.js `TAKEOFF.SETTLE` 0.25＝離起跳點多近算到位）。
  AT_START_M: 0.3,
  SETTER_SPOT,                          // 一傳目標（隊伍視角）——單一事實源在 constants.js
  BLOCK_LZ: 0.6,          // 攔網站位深度
  BLOCK_SPREAD: 1.5,      // 攔網分工間距：中前正對球、兩翼各偏一個間距（不疊人）
  BLOCK_SCHEME_SHIFT: 0.9, // W4 附錄 B-1：L 配套封線站位偏移（封直線往邊線/封斜線往內）
  // 治具保真度量測臂（見 decideOne 的 PLAYER_PERFECT_RECV 註解）：
  // 0 ＝**現行，零行為改動**；1 ＝讓治具的主角 A2 接球也拿 Perfect（模擬真人）。
  // 只有量測臂會 patch 它，production 恆 0。
  PLAYER_PERFECT_RECV: 0,
  // §7 D2 針對性發球：多少比例的球指名發給對方後排主攻手（其餘走既有四區循環）。
  // 0.5＝兩種發球各半，「這球是不是衝著我來的」才讀得出來。設計值，**未依治具校準**
  SERVE_TARGET_RATE: 0.5,
  TIP_RATE: 0.1,          // AI 第三擊輕吊機率（攻擊分支：不被讀死；重扣為絕對主體）
  DUMP_RATE: 0.07,        // S 前排二次球機率（球到位時偶發）
  JUMP_SET_RATE: 0.35,    // §5 A3 跳舉發生率（理由見 ensureFlightPlan 的抽選處）
  DIG_SHIFT: 0.35,        // Dig 收縮：後排向球側平移係數（上限 ±1.2m）
  // 攻守平衡卷 批4（B2-1/B2-4）：邊翼後衛外開＋前壓——走廊深角的守備縫。
  // 真實量測（落地前一 tick 快照，避開結算重置假影）：走廊 kill 的守方最近人
  // p50=2.21-2.24m、p25=2.03——緊貼魚躍可及 2.0 的外側 0.2-0.3m ＝結構縫。
  // 邊翼 dig 位原本 (±3, 6.2)，走廊落點叢集在 (±4.1, 5.0)。真實排球的一、五號位
  // 後衛就是貼邊線守直線/斜線走廊的人。
  DIG_WING_OUT: 0.5,      // 邊翼外開 m【試玩必調】
  DIG_WING_FWD: 0.4,      // 邊翼額外前壓 m【試玩必調】
  // 攻守平衡卷 批5（B5-1/B5-4）：雙人牆分工縫——read 的 MB 往斜線過網點讓的比例。
  // 0＝現狀（疊在翼手同點）、1＝整個站到斜線過網點上。門檻沿 classifySpikeZone 的
  // 中路界線 1.8（接觸點在中路＝本來就是 MB 自己的球，不讓）。
  BLOCK_SEAM_MIX: 0.65,   // 【試玩必調】
  BLOCK_SEAM_MIN_X: 1.8,
  DIVE_RATE: 0.16,        // AI 魚躍積極度預設（快速比賽；生涯我方綁解鎖、對手 opponents 分級）
  //  ↑ balance-sim 定：0.5 讓奪冠 8→26% 失控，降到 0.16 求溫和（魚躍有感但 rally 不失衡）
  TIMEOUT_STREAK: 4,      // W7 B3：被對方連得幾分時 AI 喊暫停（拍板＝4）
  SUB_BELOW: STAMINA.TIER2_BELOW, // W1(P4) A1：場上球員體力跌破重度疲勞＝考慮換人
  SUB_MARGIN: 0.25,       // W1(P4) A1：板凳體力須高出疲勞者此值才換（防上下場乒乓）
};

// W7 B3 對手 AI 暫停判準（純讀取零副作用；呼叫端＝matchLoop/治具，
// 成立時再呼叫 game.applyTimeout）：死球窗＋還有額度＋被對方連得 ≥4 分
export function aiTimeoutWanted(game, team) {
  if (game.phase !== 'serve') return false;
  if ((game.timeouts?.[team]?.remaining ?? 0) <= 0) return false;
  const ps = game.pointStreak;
  return !!ps && ps.team === otherTeam(team) && ps.n >= AI.TIMEOUT_STREAK;
}

// W1(P4) A1 對手疲勞換人判準（純讀取零副作用、決定論；呼叫端＝matchLoop/治具，
// 成立時再走 sim 唯一寫入路徑 applySubstitution）：死球窗＋有額度＋場上最累者
// 體力 < SUB_BELOW＋板凳有「同位置、體力高出 SUB_MARGIN」者（取板凳最有體力者，
// 平手取板凳序前位）。板凳強弱由 careerMatchSetup 的 reserve drop 供給——
// 弱隊換上者明顯變弱＝板凳深度差異可感；我方（受控隊）換人是玩家決策，不走此判準
export function aiSubstitutionWanted(game, team) {
  if (game.phase !== 'serve' || !game.stamina) return null;
  if ((game.subs?.[team]?.remaining ?? 0) <= 0) return null;
  const rot = game.match.rotations[team] ?? [];
  const bench = game.bench?.[team] ?? [];
  if (!bench.length) return null;
  let outId = null;
  let outSta = 1;
  for (const id of rot) {
    const p = game.players[id];
    if (!p || p.currentRole === 'libero') continue;
    const sta = game.stamina[id] ?? 1;
    if (sta < AI.SUB_BELOW && sta < outSta) {
      outId = id;
      outSta = sta;
    }
  }
  if (!outId) return null;
  const role = game.players[outId].currentRole;
  let inId = null;
  let inSta = -1;
  for (const id of bench) {
    const p = game.players[id];
    if (!p || p.currentRole !== role) continue;
    if (game.liberos?.[team]?.replacedId === id) continue; // 自由人配對暫離者不經此路
    const sta = game.stamina[id] ?? 1;
    if (sta > inSta) {
      inId = id;
      inSta = sta;
    }
  }
  if (!inId || inSta < outSta + AI.SUB_MARGIN) return null;
  return { outId, inId };
}

// W8（07-26 Sawmah 拍板：對手暫停也該有教練選項——原本只有我方能選＝對手暫停是
// 空包彈）：AI 選項＝情境決定論（零 rng，可讀＝真情報）——
// ①場上均值跌破輕度門檻＝先回血（穩住）②否則衝氣勢（燃起來）；
// 氣勢未啟用時恆穩住（fire 無效果時不浪費該次選擇）。呼叫端：matchLoop/治具
export function aiTimeoutBoost(game, team) {
  if (!game.momentum) return 'calm';
  if (game.stamina) {
    const rot = game.match.rotations[team] ?? [];
    const avg = rot.length
      ? rot.reduce((s, id) => s + (game.stamina[id] ?? 1), 0) / rot.length
      : 1;
    if (avg < STAMINA.TIER1_BELOW) return 'calm';
  }
  return 'fire';
}

// 每隊 AI 風格參數：生涯對手參數檔經 createGame({ aiProfiles }) 注入；
// 未注入（快速比賽/我方）一律回落 AI 預設值——行為與 stage 2 之前完全一致
export function aiProfileOf(game, team) {
  const p = game.aiProfiles?.[team];
  return {
    tipRate: p?.tipRate ?? AI.TIP_RATE,
    dumpRate: p?.dumpRate ?? AI.DUMP_RATE,
    // 發球風格（預設 AI 全穩定）；powerServeRate 為 jumpServeRate 改名前的舊鍵（相容）
    jumpServeRate: p?.jumpServeRate ?? p?.powerServeRate ?? 0,
    floatServeRate: p?.floatServeRate ?? 0,
    diveRate: p?.diveRate ?? AI.DIVE_RATE, // 魚躍積極度（對手 opponents 分級／我方綁解鎖／快速比賽預設）
  };
}

// Phase 5 W1 §6 B1 攔網人格（隊伍參數，opponents.js 的 ai.blockPersona 分級）。
// **刻意不併進 aiProfileOf**：那裡回的是一組「機率」，人格是離散行為模式，語意不同；
// 併進去也會改動 aiProfileOf 的回傳形狀（既有測試對它做 deepEqual，不得為實作改測試）。
// 未注入＝'read'＝**本輪之前的既有攔網行為**（追球軸）——我方與快速比賽零變化
export function blockPersonaOf(game, team) {
  return game.aiProfiles?.[team]?.blockPersona === BLOCK_PERSONA.COMMIT
    ? BLOCK_PERSONA.COMMIT : BLOCK_PERSONA.READ;
}

// AI 協調層狀態：每個 flight 算一次、鎖定到 flight 結束（呼叫鎖定的實作）
export function createAiState() {
  return {
    flightId: -1, planTick: 0, landing: null, contactPoint: null, landingTeam: null,
    claimId: null, attackerId: null, attackKind: null, attackTempo: 'three',
    // Phase 5 W1 §2-2：本球全部合法攻擊手的助跑起點（{ team, routes:[{pid,kind,start}] }）。
    // 與 attackerId 同壽命（touches===1 算一次、撐到本波攻擊結束、來球時清空）——
    // 「事前開多條線」的載體，不是只有被選中那一人才有
    approach: null,
    // 組合攻擊卷 段 B §二：本波的組合攻擊（null＝沒有組合＝現行單人行為）。
    // { type:'cross', mainId, partnerId, tempoGap, mainKind, partnerKind }
    // 與 attackerId／approach **同壽命同重算範式**（一傳完成算一次；非 rally 與來球
    // 兩處清空）⇒ 純由可觀察量重算，不需要進 rallyTape 的 PLAYER_AI_FIELDS。
    // ★ 誘餌仍是**湧現式** ★ 池內未被選中者照樣跑完整 route，sim 的走位分支
    //   （COMBO-SCAN 區）結構上讀不到本欄位——見 tests/combo-play.test.mjs 的靜態掃描。
    attackCombo: null,
    // ---- 組合攻擊卷 段 E（2026-07-31）：玩家叫套路的指令槽 ----
    // ★ 這是**玩家寫、sim 讀**的指令槽 ★ 與 digBias／attackerId 同性質：
    //   走的不是 Intent 管線，重演時算不出來 ⇒ 必須進 rallyTape 的
    //   PLAYER_AI_FIELDS（護欄 2；段 B 的 AI 產出 combo 走重算路徑，不進白名單）。
    //
    // ★ 卷五（2026-08-02 裁定 1）：**路徑甲（死球窗叫牌）整條退場** ★
    //   舊制在死球窗寫 `calledPlay`，於 touches===1 被 resolveCalledPlay 吃掉。
    //   退場理由＝玩家在死球窗**不知道自己被排到哪條線、也不知道一傳品質**
    //   ⇒ 他叫的是願望不是決策。戰術入口統一到球內的遠段窗（路徑乙），
    //   那裡一傳品質已知，且走的是**同一支** resolveCalledPlay、**同一個**窗界。
    // replanCall（路徑乙・S 遠段臨場改判）：{ type, callerId }
    //   壽命＝**下一個 tick 內消費**（aiCollectIntents 的 applyReplanCall），窗外即作廢。
    replanCall: null,
    // callOutcome（回饋層的唯一真相）：{ type, mode, outcome, reason, mainId, flightId }
    //   outcome ∈ command｜infeasible；mode 恆為 replan（卷五：command 那條隨路徑甲退場）。
    //   （2026-08-01 題 0：舊「請求」語意廢除 ⇒ accepted／refused／request 三個值已消失）
    //   由 sim 產生**機器碼**、文案在 input 層——裁定 E 要求「當場回饋失敗、不得靜默
    //   降級」，所以失敗也要留下逐條原因（reason＝第一個沒過的 check）。
    //   純由 replanCall＋可觀察量重算 ⇒ 不進錄影白名單。
    callOutcome: null,
    // ---- 內切窗（2026-08-07）----
    // cutCall（玩家寫、sim 讀的指令槽，與 replanCall 同性質）：{ pid, cut:true }
    //   壽命＝這一波的第二觸窗（清空點：ensureFlightPlan 的死球分支與「窗已結束」分支）。
    //   ★ 與 replanCall 同樣算不出來 ⇒ 必須進 rallyTape 的 PLAYER_AI_FIELDS ★
    // cutOutcome（回饋層的唯一真相，範式同 callOutcome）：
    //   { flightId, pid, outcome:'applied'|'missed', reason }
    //   reason 的代碼由 `cutStateOf` 定義（already／nowindow／pass／nopool／locked）。
    //   由 sim 產生機器碼、文案在 app 層——「沒生效要說出原因」的資料面。
    cutCall: null,
    cutOutcome: null,
    // ---- 夾塞窗（2026-08-07；集訓卷 2b 解封的後半場）----
    // 與上面那一組**同型不同事**：內切是 OH 改自己的線（單人），夾塞是 OPP 與 MB 的
    // 兩人配合（`attackCombo`）。欄位形狀刻意逐項比照，理由與 callButton 共用元件相同
    // ——兩個窗的競態處理（一波一次、窗一關就作廢、AI 對局零漂移）必須一致。
    // tandemCall（玩家寫、sim 讀）：{ pid }
    //   壽命＝這一波的第二觸窗（清空點：ensureFlightPlan 的死球分支與「窗已結束」分支）。
    //   ★ 算不出來 ⇒ 必須進 rallyTape 的 PLAYER_AI_FIELDS ★
    // tandemOutcome：{ flightId, pid, outcome:'applied'|'missed', reason }
    //   reason 的代碼由 `tandemStateOf` 定義；文案在 app 層（sim 不產生給人看的字串）。
    tandemCall: null,
    tandemOutcome: null,
    // Phase 5 W1 §7 D2：本波接一傳的人（attackPointsOf 的罰則對象）。
    // 與 attackerId／passTier 同壽命、同重算範式（純由 rally.lastToucherId 推得）＝
    // VCR v2 重演時跟其餘 AI 狀態一起被逐 tick 重建，不需要進錄影白名單
    passReceiverId: null,
    backupId: null,    // 第二追球者（接噴救球）：主追者明顯趕不上時加派的備援
    hitPoint: null,    // 第三擊：球墜到扣球窗上緣的時空點（一氣呵成助跑的推遲起跑基準）
    setterDump: false, // S 前排二次球（本 flight 決定論抽選）
    // §5 A3 跳舉（純資訊武器）：本波二傳是否跳起出手。**唯一的作用是把「可以觸球
    // 的高度上緣」從站立可及抬到起跳可及**——球的目標、弧頂、散佈、扣球的速度與
    // 落點散佈**一格未動**（見 touchCeiling()／tests/jump-set.test.mjs）。
    // 與 setterDump 同壽命、同抽選範式（touches===1 算一次、純 hash 決定論）＝
    // VCR v2 重演時跟其餘 AI 狀態一起被逐 tick 重建，不需要進錄影白名單
    jumpSet: false,
    letDrop: false,    // 判斷來球出界 → 全隊放球（讓它落地得分）
    // W4(P4) 附錄 B-4 ace 反讀：{ pid, openLine }——宿敵 ace 且玩家配套被讀死時
    // 由呼叫端（matchLoop/治具）注入；chooseTouch 第三擊消費＝改打讓開的線
    counterRead: null,
    // Phase 5 W1 §7 C2：受控玩家前排攔網的**身體站位**推論（{ team, block, dig }）——
    // 由 aiCollectIntents 逐 tick 從 excludeIds 重算（零面板、零玩家指令），
    // block 可為 null＝模稜兩可的中性讀（同時是遲滯的記憶槽）
    blockRead: null,
    // §十-2 攔網三段狀態機的鎖定槽。**每名攔網手一份**（攔網分工卷 step1／step2b，2026-07-31）：
    //   { team, template, byPid: { [playerId]: { x, enterTick, jumpTick, jumpAt,
    //     replantUntil, pendingX, blind, seen, hand, cover, chase } }, latest }
    //   `team`＋`template`＝團隊級（建計畫是單一事件，見 blockPlanTargetX 的建計畫段）；
    //   `byPid` 的每一份從 `template` 複製一次後**只由本人步進**（step2b，見 blockPlanFor）；
    //   `latest`＝最近步進的那一份，**純外部觀測用**（探針／測試），sim 不由它取值。
    // ——**兩種人格共用同一條路**（read／commit 只差何時允許做決定）。與本波攻擊同壽命
    //（來球／新的一擊完成都清空），純由可觀察量重算＝VCR v2 重演時跟其餘 AI 狀態
    // 一起被逐 tick 重建，不需要進錄影白名單
    blockPlan: null,
    // §十-2 起算事件：二傳觸球那一 tick（{ team, tick }）——read 人格的反應延遲從這裡起算。
    // 選二傳觸球而非攻擊手起跳，是因為快攻在二傳觸球前就已離地（W1 實測 100%），
    // 等起跳就永遠來不及。這是**可觀察量**（球離手看得見），不是未來資訊
    setTouch: null,
    // 叫戰術重做卷 段 1（Sawmah 2026-08-01 裁定 1A/1B/1C）：本波「跑不跑」記帳。
    //   { team, flightId, replanned, entries: [{ pid, kind, tempo, startTick,
    //     takeoffTick, ran, jumped }] }
    //   ・`ran`＝早訊號（承諾 tick 到了他有沒有進助跑線）；null＝還沒到判定時刻
    //   ・`jumped`＝實際起跳（他有沒有從自己那條戰術線的起跳點拔起）
    //   ・`replanned`＝本波已經改過一次組織（裁定 1A「一波只改一次」的旗標）
    // ★ 本段只記帳、零消費端 ★ 消費端是下一段的組合獎金；裁定 1B 明文「不跑零懲罰」，
    //   所以本波記帳路徑上**不得出現任何 trust 寫入**（tests/route-commit.test.mjs 釘死）。
    // 與 attackCombo／approach 同壽命、純由可觀察量重建（受控者的實際位移）＝
    // VCR v2 重演時跟其餘 AI 狀態一起被逐 tick 重建，不需要進錄影白名單
    routeCommit: null,
  };
}

// 蒐集本 tick 全部 AI 的 Intent（excludeIds＝玩家操控者，AI 不代打）
// 輸出與玩家輸入同型的 Intent、走同一條管線進 sim —— sim 不知來源
export function aiCollectIntents(game, aiState, excludeIds = []) {
  ensureFlightPlan(game, aiState);
  // 段 E 路徑乙：S 的遠段臨場改判。排在 ensureFlightPlan **之後**——它要改的正是
  // 那一步剛排好的 approach／attackCombo；排在走位（decideOne）**之前**——改判要在
  // 同一個 tick 內生效，否則這一 tick 的人還照舊線跑＝面板與跑位分岔一格。
  // 輸入（replanCall）由 UI 層寫、在此消費：走的是 digBias／attackerId 同一條
  // 「玩家透過協調層下指令」的路，因此同樣要進 rallyTape 的 PLAYER_AI_FIELDS。
  applyReplanCall(game, aiState);
  // 內切窗（2026-08-07）：玩家的內切決定在此消費。排在 `ensureFlightPlan` **之後**
  // ——舊制把它塞進 ensureFlightPlan 的 `cutFor`，而那一步逐 flightId 只跑一次
  // ⇒ 玩家真正的死線是「開窗後一個 tick」（實測 D=1 生效率 22.2%＝自然骰基準）。
  // 排在 applyReplanCall 之後：S 的指令優先於攻擊手的自主改線（同一 tick 撞上時，
  // 面板承諾的是 S 那份，兩者衝突要讓面板贏）；applyCutCall 會偵測到線已被改走並誠實回報。
  applyCutCall(game, aiState);
  // 夾塞窗（2026-08-07）：玩家（OPP）的夾塞決定在此消費。排在 `applyCutCall` **之後**
  // ——兩者理論上互斥（同一個受控玩家不可能同時是 OH 與 OPP），但真的兩個欄位都有值時
  // 順序必須確定：夾塞重建池時帶 `cutFor: aiState.cutCall` ⇒ 後跑的它會保住前者的改線，
  // 反過來排的話 applyCutCall 會拿還沒成立的組合去算。
  applyTandemCall(game, aiState);
  // B 快窗（2026-08-09）：玩家（MB）的「要 B 快」在此消費。排在最後＝三顆鈕撞在
  // 同一 tick 時它最後寫，但實務上撞不到——三顆鈕的窗互斥於位置（OH／OPP／MB）。
  // 排在 applyTandemCall 之後的理由同該行：組合要先成立，`bquickStateOf` 才讀得到
  // `attackCombo` 並誠實回報 'locked'（S 排了組合就不讓攻擊手單方面拆）。
  applyBquickCall(game, aiState);
  // 叫戰術重做卷 段 1：受控玩家「不跑就改組織」。掛在 applyReplanCall **之後**、
  // 走位（decideOne）**之前**——理由與上一行逐字相同：改判要在同一個 tick 內生效，
  // 否則這一 tick 的人還照舊線跑＝提示與跑位分岔一格。
  applyRouteCommit(game, aiState, excludeIds);
  updateBlockRead(game, aiState, excludeIds); // C2：先讀受控玩家的攔網站位，後排本 tick 就吃得到
  const intents = [];
  // 以輪轉名單的顯式順序遍歷（不靠 Object.keys 插入序；接生涯資料換 id 型別也不變序）
  for (const playerId of [...game.match.rotations.A, ...game.match.rotations.B]) {
    if (excludeIds.includes(playerId)) continue;
    const it = decideOne(game, aiState, playerId);
    if (it) intents.push(it);
  }
  return intents;
}

// ---- 協調層 ----

function ensureFlightPlan(game, aiState) {
  if (game.phase !== 'rally') {
    // 死球／發球階段：上一球的助跑線已經沒有意義了。
    //
    // 為什麼要補這一行：清空原本只寫在 rally 內的「來球」分支（下方 `aiState.approach = null`），
    // 所以只有「球又飛回來」才會清。當一球是在攻擊路線還活著的時候結束的（殺球直接得分），
    // routes 就會一路殘留到下一球的發球階段。
    // 消費端目前都掛著 `r.touches >= 1` 之類的守衛，讀不到這份髒狀態（本改動經
    // `tools/sim-hash-probe.mjs` 證實行為逐值零變化），但**外部觀測者讀得到**：
    // `tempo.test.mjs` 的瞬移護欄就是拿 `ai.approach.routes` 當「誰在助跑」的名單，
    // 於是把死球後的歸位站定（一次 0.5m 的瞬間復位）算成了助跑中的瞬移。
    // 髒狀態沒有讓 sim 說謊，但讓量測說謊——§十 這一卷要的正好是相反的東西。
    aiState.approach = null;
    // 組合與 approach 同壽命（藍圖 §二）：死球之後沒有組合在跑
    aiState.attackCombo = null;
    // 段 E：上一球的叫牌回饋隨死球作廢（新的一球從乾淨狀態開始）。
    // 卷五裁定 1／2：死球窗不再是叫牌時機（路徑甲已退場），戰術只管一球
    // ⇒ 沒有任何指令需要跨死球存活。
    aiState.callOutcome = null;
    aiState.replanCall = null; // 遠段改判只在第二觸窗內有效，死球即作廢
    // 內切的決定與它的結算同壽命（另一個清空點＝下方「窗已結束」分支）
    aiState.cutCall = null;
    aiState.cutOutcome = null;
    // 夾塞的決定與它的結算同壽命（另一個清空點＝下方「窗已結束」分支）
    aiState.tandemCall = null;
    aiState.tandemOutcome = null;
    // B 快同壽命（2026-08-09）——三個清空點一次補齊，見下方「窗已結束」分支的教訓
    aiState.bquickCall = null;
    aiState.bquickOutcome = null;
    aiState.routeCommit = null; // 段 1 記帳與助跑線同壽命（清空點之一）
    // 同理：死球之後沒有攻擊要攔，攔網鎖定與起算事件都作廢
    aiState.blockPlan = null;
    aiState.setTouch = null;
    // S2 鎖存（見下方跳舉抽選處）：死球＝第二觸窗結束，清鎖存
    aiState.jumpSetRoll = null;
    aiState.jumpSet = false;
    return;
  }
  if (aiState.flightId === game.rally.flightId) return; // 呼叫鎖定：本 flight 已指派，不重算

  aiState.flightId = game.rally.flightId;
  aiState.planTick = game.tick;
  // §十-2 起算事件：二傳觸球（第二觸完成＝球離手飛向攻擊手）。攔網手的反應延遲從這裡起算。
  // 純可觀察量——球離開二傳的手，場上每個人都看得見；不是「二傳選了誰」那種未來資訊。
  if (game.rally.touches === 2 && game.rally.possession) {
    aiState.setTouch = { team: game.rally.possession, tick: game.tick };
  }
  const landing = predictLanding(game.ball);
  aiState.landing = landing;
  // 走位深度：接球者瞄「球墜到接球高度時的水平位置」（接觸點）而非地板落點
  aiState.contactPoint = predictContactPoint(game.ball, AI.RECV_CONTACT_Y);
  aiState.setContactPoint = null; // P1-B：僅第二觸窗計算（見下）
  aiState.landingTeam = landing ? (landing.z >= 0 ? 'A' : 'B') : null;
  aiState.claimId = null;
  aiState.backupId = null;
  aiState.hitPoint = null;
  aiState.letDrop = false;

  if (!landing || !aiState.landingTeam) return;
  const team = aiState.landingTeam;
  const r = game.rally;

  // S2 鎖存的窗界：本次規劃不在「第二觸窗」（落點方持球且 touches===1）＝窗已結束，
  // 清鎖存——確保下一個第二觸窗一定重新抽選（見下方跳舉抽選處的鎖存語意）
  if (!(r.possession === team && r.touches === 1)) {
    aiState.jumpSetRoll = null;
    aiState.jumpSet = false;
    // 內切「只管這一波」（matchLoop 註解的原話）——舊制只在死球清，於是一顆球裡
    // 按過一次之後，同一 rally 的**後續每一波**都被強制內切。窗一結束就作廢。
    aiState.cutCall = null;
    aiState.cutOutcome = null;
    // 夾塞同理「只管這一波」：窗一結束就作廢，否則同一 rally 的後續每一波都被強制夾塞
    aiState.tandemCall = null;
    aiState.tandemOutcome = null;
    // ★ B 快同理，而且我在 2026-08-09 上線當天**真的踩了這一格** ★
    // 探針實測：漏清的話按一次之後同一 rally 每一波都繼續要球——
    // 15 次按壓變成 25 次生效＋293 次「沒趕上」。上面那條內切的教訓逐字重演了一次。
    aiState.bquickCall = null;
    aiState.bquickOutcome = null;
  }

  // 落點方已用完三次觸球（如扣球掛網彈回本側）→ 依規則不得再觸，全隊放球讓它落地
  if (r.possession === team && r.touches >= 3) return;

  if (r.possession === team && r.touches === 1) {
    // §十-2：新的一擊完成＝新一波攻擊，上一波的攔網鎖定與起算事件都作廢（重新讀一次）
    aiState.blockPlan = null;
    aiState.setTouch = null;
    // 二傳歸屬（職責制）：S 固定執行；S 剛接了一傳→OPP 備援代舉；再不行才仲裁救球
    const roster = teamRoster(game, team);
    const setter = roster.find(
      (p) => p.currentRole === 'setter' && p.id !== r.lastToucherId,
    );
    const backup = roster.find(
      (p) => p.currentRole === 'opposite' && p.id !== r.lastToucherId,
    );
    aiState.claimId = setter?.id ?? backup?.id
      ?? arbitrate(game, team, landing, r.lastToucherId);
    // P1-B（2026-07-30 補償階段拍板「二傳走位包」，convergence §5.12）：二傳追第二觸
    // 瞄「球墜到自己站舉手點高度（SET_HANDPOINT_H_RATIO×H，reach.js 單一真相）時的
    // 水平位置」——與接球者 contactPoint 同構的走位深度；瞄地板落點＝墜落段人永遠
    // 追在球後面。低平弧（不高於手點）predictContactPoint 自動回退地板落點。
    // 只在規劃層算一次（predictContactPoint 是整段 rollout，不得逐 tick 呼叫）。
    const setterH = game.players[aiState.claimId]?.height?.current;
    aiState.setContactPoint = Number.isFinite(setterH)
      ? predictContactPoint(game.ball, SET_HANDPOINT_H_RATIO * setterH)
      : null;
    // 攻擊分配：一傳品質決定戰術分支（到位＝全池/可用＝無快攻/勉強＝只剩兩翼高球）
    // × 站位合法池（AND）× trust 權重（傾向），決定論抽選
    const tier = passTierOf(team, landing, game.players[aiState.claimId] ?? null);
    aiState.passTier = tier; // W3 S 玩法：分配面板讀同一份品質分檔（setOptions 消費）
    // §7 D2：本波接一傳的人＝剛剛那一觸的執行者。攻擊池與**玩家的分配面板**
    // （setOptions）都吃這一份，兩邊看到的是同一顆池（4.5A 的教訓：同一個判定寫
    // 在兩個地方遲早分岔）
    aiState.passReceiverId = r.lastToucherId ?? null;
    // §5 A2 路線組合：先決定「每條線往哪跑」（OH 的 left 可能變 left_inside），**再**選人。
    // 順序不可調換——選完人再改線＝二傳瞄的落點與該人助跑的終點是兩個地方
    const points = applyRouteKinds(
      attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId),
      {
        flightId: game.rally.flightId,
        seed: game.seed ?? 0,
        passTier: tier,
        // 位置體檢裁定 B1：受控玩家的左翼線由他自己決定（matchLoop 逐波寫入）。
        // null＝AI 對局 ⇒ 照舊擲骰、逐值不變。
        cutFor: aiState.cutCall ?? null,
      },
    );
    const pick = pickAttackPoint(game, team, aiState.claimId, tier, points);
    aiState.attackerId = pick?.pid ?? null;
    // ---- 組合排程層（段 B，2026-07-31；藍圖 §三＝裁定 A 乙的形狀）----
    // **順序不可調換**：選人（上一行，一格未動）→ 組合 → 寫回池 → 算 route。
    // 組合排在選人之後 ⇒ `pickAttackPoint` 的入參逐值不變 ⇒ trust 分佈零漂移，
    // 這是裁定 A 乙的驗收條件本身（tests/combo-play.test.mjs 有靜態順序斷言）。
    // 卷五（2026-08-02）：路徑甲退場後，這裡只剩**自動觸發**一條路。
    // 玩家叫的套路改由路徑乙（applyReplanCall）在同一個窗界內以同一支
    // `resolveCalledPlay` 解析並覆寫 approach ⇒ 面板承諾的與實際跑的仍是同一個物件。
    // comboScale（2026-08-01）：組合三型的觸發機率倍率，由呼叫端經 createGame 注入
    // （未注入＝1＝出廠值）。只掛在**自動觸發**這條路徑上：玩家叫的套路走 force，
    // 本來就跳過觸發骰（見 evaluateCombination 的 force 註解）。
    // ★ 這裡讀的是一個數字，不是「第幾屆」★ sim 不知道生涯／賽季存在。
    const combo = planCombination(points, aiState.attackerId, {
      team,
      flightId: game.rally.flightId,
      seed: game.seed ?? 0,
      passTier: tier,
      comboScale: game.comboScale ?? 1,
    });
    aiState.attackCombo = combo;
    // ★★ 2026-08-09：組合沒成立時再骰一次單人型（B 快）★★
    // 優先序＝組合贏：三型的互斥結構與既有機率一格未動，B 快只吃它們讓出來的波，
    // 所以這條加進來不會稀釋 cross／tandem／delay 的發生率（測試有守）。
    // `planSoloPlay` 要求 `attackerId` 本人就是跑 A 快的那個 ⇒ 球本來就要給他，
    // 白跑率結構上恆為 0（夾塞的教訓，見該函式檔頭）。
    const solo = combo ? null : planSoloPlay(points, aiState.attackerId, {
      flightId: game.rally.flightId,
      seed: game.seed ?? 0,
      comboScale: game.comboScale ?? 1,
    });
    aiState.attackSolo = solo;
    // 只改涉及的人；兩者皆無時 comboPoints === points（同一個陣列參照）
    const comboPoints = applySoloRoute(applyComboRoutes(points, combo), solo);
    // 攻擊線由**寫回後**的池決定——否則二傳瞄的落點（setAimFor(attackKind)）
    // 與該人助跑的終點會是兩個地方（§5 A2 的順序教訓，這裡是它的組合版）。
    // combo 為 null 時 find 取回的就是 pick 那一筆＝逐值等同舊寫法 `pick?.kind ?? null`
    aiState.attackKind =
      comboPoints.find((pt) => pt.pid === aiState.attackerId)?.kind ?? null;
    // Transition 拉開（§2-2）＋節奏三層（§4 A1）：整個池一次算完助跑起點、節奏與
    // 起步 tick——未被選中者照樣拉開跑假動作，攔網手才有多條線可讀。
    // 時間錨點＝contactPoint（球墜到接球高度的 tick）＝二傳觸球的預估時刻，
    // 與表現層的舉球預備動作共用同一個錨點（4.7 原則：動畫與規則不得各算各的）。
    // 純幾何＋純 hash、零 game rng；決定論由 points 的順序＋flightId／seed 保證
    const setTick = aiState.contactPoint?.ticks != null
      ? game.tick + aiState.contactPoint.ticks : null;
    aiState.approach = {
      team,
      setTick,
      routes: approachRoutesFor(team, comboPoints, {
        setTick,
        flightId: game.rally.flightId,
        seed: game.seed ?? 0,
        passTier: tier,
        speedOf: (pid) => moveSpeed(game.players[pid]),
        // 段 B2：組合的前後腳偏移（tempoGap）由 route 層表達——combo 為 null 時
        // 每個 route 的 comboLead 都是 0＝逐值等同段 B 之前的寫法
        combo,
      }),
    };
    // §5 A3 跳舉：一傳到位（憲法 §三 A3「一傳到位時的既有分支下」）＋真的是 S 在舉
    // （備援代舉／救球仲裁者不跳舉——那種球本來就是勉強處理）＋種子決定論。
    // ★ 觸發率的取捨（實測背景）：一傳品質目前恆為 'perfect'（W2 簡報 D-3），
    //   所以「到位」這個條件**每球都成立**，真實世界的 60–80% 在這裡等於「每球都跳」
    //   ＝攔網手讀不到差別、資訊武器自我歸零。0.35 ≒ 每三球出現一次，
    //   與 §4 原定的二速比例同量級，讓「這球被壓縮了沒」保持可讀
    // ★ S2 鎖存（2026-07-30 Sawmah 拍板；同 read 起跳「取樣一次並鎖存」先例）★
    // 骰的鍵是 flightId，而 flightId 可能因非觸球事件在同一個第二觸窗內遞增
    // ⇒ 原寫法在那種情況下等於同一顆球重骰。鎖存語意＝**骰與資格分離**：
    // 骰每個第二觸窗（possession＋touches===1 連續區間）取樣一次並鎖存（窗內首次
    // 規劃的 flightId，決定論）；資格（主追＝二傳、tier）逐次規劃即時評估。
    // 窗界清除在上方兩處（死球分支＋窗外規劃）。
    // ⚠ 段 2 語料實測本鎖存為行為 no-op（該語料窗內 churn 未發生）——留著是正確性
    // 加固，不是段 2 紅的成因；紅的真因與修復見下方 decideOne 的「S2 退路」（球墜入
    // 站舉可及即退站舉；修前抽中跳舉的窗 47.7% 整窗無舉球、~12 分/局落地失分）。
    if (aiState.jumpSetRoll == null) {
      aiState.jumpSetRoll =
        hash01(game.rally.flightId * 811 + 29 + (game.seed ?? 0)) < AI.JUMP_SET_RATE;
    }
    aiState.jumpSet =
      !!aiState.claimId &&
      game.players[aiState.claimId].currentRole === 'setter' &&
      tier === 'perfect' &&
      aiState.jumpSetRoll;
    // §5 第三檔弧線：被選中那條線跑幾速（routes 是節奏的單一真相）——
    // 二速要吃平拉開的低弧（setAimFor 的 tempo 分支），三速維持高球
    aiState.attackTempo =
      approachRouteOf(aiState.approach.routes, aiState.attackerId)?.tempo ?? 'three';
    // S 二次球（偶發）：S 前排、一傳完美到位 → 小機率直接處理第二球
    aiState.setterDump =
      !!aiState.claimId &&
      game.players[aiState.claimId].currentRole === 'setter' &&
      isFrontRow(game.match.rotations[team], aiState.claimId) &&
      tier === 'perfect' &&
      hash01(game.rally.flightId * 331 + 7 + (game.seed ?? 0)) < aiProfileOf(game, team).dumpRate;
  } else if (r.possession === team && r.touches === 2) {
    // 第三擊：先前選定的攻擊手；不成立則仲裁補位
    const atk = aiState.attackerId;
    aiState.claimId =
      atk && atk !== r.lastToucherId && game.players[atk]
        ? atk
        : arbitrate(game, team, landing, r.lastToucherId);
    // 一氣呵成助跑（Sawmah 07-23）：記球墜到扣球窗上緣的時空點——攻擊手據此推遲起跑
    aiState.hitPoint = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
  } else {
    // 來球（發球/對方攻擊/自由球）：先判界內外，再責任區仲裁
    // 出界判斷（含誤差）：明顯出界＝放球讓它落地得分；壓線球寧可接（寧搶錯）
    // 非殺球來球（發球/free ball）＝陣型排除 S/前排 MB（見 arbitrate）
    const claimer = arbitrate(game, team, landing, r.lastToucherId, r.profile !== 'spike');
    const outDist = landingOutDistance(landing);
    // 放球看出界的前提＝最後觸球是對方（落地出界我方得分）；自家擦手/觸過的球
    // （攔網 graze 後 lastTouchTeam＝我方）出界＝送分——再遠也得追（07-23 擦手配套）
    if (outDist > 0 && claimer && outDist > judgeMargin(game, claimer)
      && r.lastTouchTeam !== team) {
      aiState.claimId = null;
      aiState.letDrop = true; // 全隊看它出界
    } else {
      aiState.claimId = claimer;
    }
    aiState.attackerId = null;
    aiState.attackKind = null;
    aiState.approach = null; // 來球＝上一波的助跑線作廢
    aiState.attackCombo = null; // 同壽命：組合隨助跑線一起作廢（藍圖 §二 兩處清空點之二）
    // 段 1 記帳同壽命（清空點之二）。★壽命刻意綁在「來球」而不是「重新規劃」★
    // 我方要開新的一波，球必然先回到我方（走這條來球分支）⇒ 這裡清＝天然每波一份，
    // 且不受第二觸窗內 flightId churn 影響（同 jumpSetRoll 鎖存要處理的那個問題）
    aiState.routeCommit = null;
    // §十-2：來球＝沒有攻擊要攔，鎖定作廢——但**對方的扣球例外**：那正是要攔的那顆球。
    // 鎖定現在同時掛著起跳窗（planX 為 null 就不開窗），扣球一出手就清掉的話，
    // 窗會在球飛向網子、真正該攔的那幾十 tick 裡消失。改制前鎖定只管站位所以無害。
    if (r.profile !== 'spike') {
      aiState.blockPlan = null;
      aiState.setTouch = null;
    }
    aiState.passReceiverId = null; // §7 D2：來球＝這一波還沒有人接一傳
  }

  // 第二追球者（接噴救球「球不落地不結束」）：限【自家噴球】——我方持球中
  // （touches≥1）的亂飛球、主追球者明顯趕不上 → 加派次近備援接力去救；
  // 主追趕得上＝零加派（正常回合行為不變的回歸閘）。
  // 不含來球（touches===0）：防守自有責任區仲裁＋dig＋魚躍體系，且快速 flight
  // （扣球/發球）是「球飛過身邊時攔截」，落地可及性不是對的量尺——探針實測
  // 曾誤觸發 19% flight（07-23）。攻擊 flight（主追＝選定攻擊手）同理不加派。
  if (aiState.claimId && !aiState.letDrop
    && r.possession === team && r.touches >= 1
    && !(r.touches === 2 && aiState.claimId === aiState.attackerId)
    && !canReachLanding(game, aiState, aiState.claimId)) {
    aiState.backupId = arbitrate(game, team, landing, [r.lastToucherId, aiState.claimId]);
  }
}

// Phase 5 W1 §7 C2（07-28 Sawmah 拍板 A 案）——後排防守跟著攔網走，**零新面板**：
// 玩家在前排攔網時是用身體站位在封線，所以後排讀的是「他實際站到哪條過網線」，
// 不是他按了什麼（跟真實排球一致：隊友看你站哪）。
// 生效窗＝與前排攔網／後排 dig 分支同一組條件（對方持球、非接發弧線、我在前排），
// 讀不出明確傾向（模稜兩可）＝中性、陣型不動。遲滯由 prev 提供（見 blockRead.js）。
// **只讀受控玩家**（excludeIds）；AI 攔網手的站位不驅動後排（本輪 out of scope）。
function updateBlockRead(game, aiState, excludeIds) {
  const prev = aiState.blockRead;
  aiState.blockRead = null;
  if (game.phase !== 'rally' || !excludeIds?.length) return;
  const r = game.rally;
  const atkId = aiState.attackerId;
  if (!atkId || !game.players[atkId]) return;
  const atkTeam = game.players[atkId].teamId;
  for (const pid of excludeIds) {
    const p = game.players[pid];
    if (!p || p.teamId === atkTeam) continue;            // 我方進攻中＝沒有攔網這回事
    const team = p.teamId;
    if (!r.possession || r.possession === team) continue; // 對方持球才有得讀
    if (aiState.landingTeam === team && r.profile !== 'spike') continue; // 接發局面（同 receivingArc）
    if (!isFrontRow(game.match.rotations[team], pid)) continue;
    const memo = prev?.team === team ? prev.block : null;
    const block = blockLaneRead(game, pid, atkId, memo);
    aiState.blockRead = { team, block, dig: digForBlock(block) };
    return;
  }
}

// P0 對齊修（2026-07-30 補償階段拍板，convergence §5.12）：AI 對「自己構不構得到」
// 的估算向 sim 判定的單一真相 reachRadiusFor 取值（A-9 同族——TUNING.REACH_RADIUS
// =1.3 只是 t=0 基底，收斂後 sim 已按動作縮到 0.38H–0.55H，AI 還照 1.3 估＝以為
// 構得到而停步空揮、備援永不加派）。動作由 touches 推（0＝接、1＝舉、≥2＝扣，
// 與 chooseTouch 的分派一致）；t=0 時 reachRadiusFor 早退回 1.3 ⇒ 本修在 t=0 逐值無效。
function aiReachFor(player, touches) {
  const action = touches === 0 ? REACH_ACTION.RECEIVE
    : touches === 1 ? REACH_ACTION.SET : REACH_ACTION.SPIKE;
  return reachRadiusFor(action, TUNING, player?.height?.current ?? null);
}

// 可及性預估：含反應延遲，從當前位置起跑能否在球落地前趕到落點可及圈。
// 寬鬆估（扣可及半徑緩衝，P0 起按動作向 reachRadiusFor 取）：估錯寧可「以為趕得上」
// ——備援只在明顯來不及時加派。planTick＝本 flight 起算點（landing.ticks 同一基準）
function canReachLanding(game, aiState, playerId) {
  const { landing } = aiState;
  if (!landing?.ticks) return true;
  const p = game.players[playerId];
  const a = game.actors[playerId];
  const gap = Math.hypot(a.x - landing.x, a.z - landing.z) - aiReachFor(p, game.rally.touches);
  if (gap <= 0) return true;
  const runTicks = gap / (moveSpeed(p) * SIM_DT);
  return reactionTicks(p) + runTicks <= landing.ticks;
}

// 落點超出界線的距離（0＝界內；壓線算界內）
function landingOutDistance(landing) {
  const dx = Math.max(0, Math.abs(landing.x) - COURT.WIDTH / 2);
  const dz = Math.max(0, Math.abs(landing.z) - COURT.LENGTH / 2);
  return Math.hypot(dx, dz);
}

// 出界判斷邊際：reaction 越高看得越準（邊際越小、越敢放）；
// 以 flight+球員的純 hash 加抖動——同局重跑完全一致（決定論），但球球不同
function judgeMargin(game, playerId) {
  const p = game.players[playerId];
  const base = 0.55 - p.attributes.reaction * 0.005;
  const jitter = (hash01(game.rally.flightId * 131 + idHash(playerId) + (game.seed ?? 0)) - 0.5) * 0.3;
  return Math.max(0.08, base + jitter);
}

function idHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = h * 31 + id.charCodeAt(i);
  return h;
}

// 自由人在**殺球 dig** 上的責任區放大倍率（<1＝責任區變大，比照 S 的 ×3 是縮小）。
// 0.75 的來歷（**先量再定**）：改前防守份額 L 12.0/單位 vs OH 24.55／MB 14.1＝全場最低。
//
// ★ 實測結果與我原本設的目標不同，如實記錄 ★
// 原本寫「拉到與 MB 同量級、不要拉到最高」，實跑 20 局後是：
//   L 防守起球 8.4% → **19.4%**（每單位在場時間 12.0 → **27.3，全場最高**）
//   OH 49.1% → 42.8%／OPP 19.2% → 17.2%／MB 19.2% → 16.6%（各讓出約兩成）
//   L 在場觸球密度 0.13 → **0.19**、每局觸球 4.3 → 6.3
// **維持 0.75 而不回調**，理由是原本那句目標寫錯了：真實排球的自由人本來就是全隊 dig 王，
// 「不該高過 OH」是我憑印象設的假目標。而且即使拉到全場最高，他的絕對份額 19.4%
// 仍**低於**真實排球自由人常見的三到四成 ⇒ 0.75 這一格是保守的，不是過頭。
// 再調的話往 0.6 走（更貼近真實），不要往 0.85 縮——但任何調整都要重跑本探針與平衡臂。
const LIBERO_DIG_ZONE_MUL = 0.75;

// 「誰接球」仲裁（定死，決定論）：
// 1. 責任區＝各人輪轉基準位的勢力範圍（比基準位到落點距離）
// 2. 交界時比當前位置距離　3. 仍平手比固定 ID 序
// formationExempt=true（發球接發＋free ball 等非殺球來球）：S 與前排 MB
// 【陣型排除】不進候選——真實排球連 free ball 都不讓 S 接第一球（他要舉球）、
// 前排 MB 要準備快攻；剩餘四人涵蓋全場，慢球飛行時間內任何落點都可達。
// 只有對方【殺球】的 dig 不得已（權重制縮小責任區、極近仍救）
function arbitrate(game, team, landing, excludeId, formationExempt = false) {
  const excluded = Array.isArray(excludeId) ? excludeId : [excludeId];
  const rot = game.match.rotations[team];
  let best = null;
  for (const pid of rot) {
    if (excluded.includes(pid)) continue;
    const pos = positionOf(rot, pid);
    const base = basePosition(team, pos);
    let zoneDist = Math.hypot(base.x - landing.x, base.z - landing.z);
    const role = game.players[pid].currentRole;
    const frontMb = role === 'middle' && isFrontRow(rot, pid);
    if (formationExempt && (role === 'setter' || frontMb)) continue;
    // ★★ 2026-08-09 Sawmah 裁定：前排不撲「乾淨重扣」★★
    // 真人回報：「對方扣球我方沒攔到，卻在三米線前魚躍」——實測前場魚躍 59% 是
    // 對方重扣直接打進來、68% 落在離網 1–2m 的攔網手區域，而撲的 100% 是前排球員
    // （前排基準位就壓在三米線上，重扣落短時 zoneDist 恆由前排勝出）。
    // 真實排球裡，穿過攔網的重扣落在三米線內＝得分——前排的人剛落地/在轉身，
    // 不會有人來得及轉頭撲那顆球；會被前排救起的是**擦手球**與**吊球**，那兩類保留：
    //   · 擦手球：tryBlock 碰到就把 profile 改成 'arc'（game.js 三處 BLOCK_TOUCH 旁）
    //     ⇒ `profile === 'spike'` 在指派當下**本身就等於「攔網完全沒碰到」**，
    //     不必另立 blockTouched 旗標（第二份真相）
    //   · 吊球：`lastSpikeZone === 'tip'`（它的救援本來就靠前排前壓）
    // 條件成立＝前排整排排除 ⇒ 指派給後排（搆得到就救、搆不到＝乾淨 kill）。
    // 前排 S ×3／前排 MB ×1.8 的既有懲罰對這類球被本排除涵蓋；其他球型照舊。
    if (!formationExempt && isFrontRow(rot, pid)
      && game.rally?.profile === 'spike' && game.rally.lastSpikeZone !== 'tip') {
      continue;
    }
    // ★★ 2026-08-09 Sawmah 裁定（檔 A）：二傳在**殺球 dig** 上的 ×3 懲罰整個拿掉 ★★
    //
    // 觸發＝真人試玩「打 OH 選直線幾乎都能得分」。歸因翻了三次才落地，記在這裡免得有人
    // 照著前兩次的錯誤方向再改一遍：
    //   ① 「牆只攔斜線」——**否證且是反的**：牆對直線的涵蓋比斜線好（過網點 p50
    //      0.28m vs 0.63m、被攔死 13.5% vs 7.9%）。
    //   ② 「站位不夠近」——**否證**：兩個獨立實驗把最近防守者從 2.10m 移到 1.81m／1.34m，
    //      被救起**完全沒動**（1.0% / 1.1%）。距離從來不是那個綁住的約束。
    //   ③ 真因＝**挑錯人**：本函式主鍵是「輪轉基準位」距離、當下站位只是平手次鍵，
    //      而 OH 直線的落點正好落在對方二傳的基準格裡 ⇒ 這條 ×3 把**場上唯一夠近的人
    //      （1.06m）仲裁掉**，實際被指派者離落點 4.21m。來球時只有 claim 者能觸球
    //      （不加派 backup），所以直線球結構性無人處理：被指派者＝最近者 **0.0%**、
    //      `canReachLanding` **0.0%**（斜線對照兩者都是 38.0%）。
    //
    // ★ 當時「為什麼是拿掉而不是調小」的理由 ★（部分保留、部分被同日推翻，見下）：
    // `:694` 對 `formationExempt===true` 已整個 `continue` 掉二傳 ⇒ 這條懲罰只在殺球
    // dig 生效；而「他接了就沒人舉球」在對方重扣的 dig 上不成立——真實排球的二傳在
    // 後排就是要挖球。
    //
    // 量測（300 個屆槽、配對同種子；`oh-line-cross-probe` 1464–1854 次攻擊）：
    //   直線被救起 1.1% → **14.7%**、直線−斜線贏球率落差 **+16.1pp → −2.0pp**（不對稱消失）
    //   副作用如實記錄：**斜線也順帶好打**（kill 48.8→57.6、被攔死 7.9→4.4），
    //   單波整體贏球率 89.1% → 82.6%。生涯難度實質不動（配對奪冠率差全在噪音內）。
    // ⚠ 另一檔「全面改用當下站位當主鍵」實測**過頭**（主角場均殺球 5.08→2.42 腰斬、
    //   吊球歸零、冷門消失），已否決——有人日後想再往那個方向走，先看這行。
    //
    // ★★ 2026-08-09 同日修正：**前排**二傳的懲罰恢復（Sawmah 裁定）★★
    // 全拿掉之後真人立刻回報兩個症狀，前後對照（200 局配對同種子）證實都是這一格：
    //   ① 二傳在**離網 1–2m** 魚躍接重扣的怪畫面：前場魚躍裡 setter 1 → 36 次
    //     ——前排二傳的基準位在 2 號位（lz=3，貼著前場），懲罰一拿掉右前角重扣全歸他
    //   ② S 接第一球 0.60 → 2.10 次/局（指派給 S 的比率 2.7%→17.7%）⇒ 玩家坐 OPP
    //     （指定補舉位）不知道要補，實測 100% 落地＝每局送 2 分
    // 教訓＝**這一格同時在回答兩個問題**：「誰搆得到」與「該不該保護二傳」。
    // 全拿掉＝兩題都答「不保護」；原本 ×3＝兩題都答「保護」。正解是拆開：
    //   **前排**二傳恢復 ×3——他要留著舉第二球＋參與攔網，而且他的基準位就在網前，
    //     讓他去撲 1–2m 的重扣既怪又貴（直線那個洞的落點 z≈5.2 在後場，本來就不歸他）
    //   **後排**二傳維持無懲罰——直線修正的載體就是他（真實排球後排二傳就是要挖球）
    // 驗收＝改完直線對稱性必須還在（−2.0pp 量級），前場 setter 魚躍與 S 接一傳
    // 要顯著回落；三個數字都在 commit 訊息裡。
    if (role === 'setter' && isFrontRow(rot, pid)) zoneDist *= 3;
    if (frontMb) zoneDist *= 1.8; // 前排 MB 責任區縮小（他要準備快攻）
    // ★ 位置體檢 2026-08-06 裁定 A1′：自由人的責任區**放大** ★
    // 量測（`tools/position-load-probe.mjs`）：自由人的防守起球份額換算成在場時間只有
    // **12.0**，OH 24.55／OPP 19.2／MB 14.1——他是全場最低的**防守**貢獻者，
    // 而真實排球的自由人是全隊 dig 王。成因**不是仲裁歧視**（整段原本沒有任何
    // libero 分支，實測也確認接發球份額他是全場最高 25.3/單位），
    // 而是**責任區覆蓋面**：他固定頂替後排中間那一格，OH／OPP 六個輪轉會走遍多個區。
    //
    // 修法沿用本函式既有的形狀（權重制，不新增控制流）：S ×3、前排 MB ×1.8 是**縮小**
    // 責任區的懲罰，這裡給自由人一個**放大**責任區的係數＝「後排球有疑義時他先叫」，
    // 那正是真實排球裡自由人的角色（他有權喊掉隊友的球）。
    // ⚠ 只作用在**殺球 dig** 這條路徑上（`formationExempt=false`）：接發球那條他份額
    //   已是全場最高，再加只會把隊友擠掉、變成一個人接全場。
    else if (role === 'libero' && !formationExempt) zoneDist *= LIBERO_DIG_ZONE_MUL;
    const nowDist = Math.hypot(
      game.actors[pid].x - landing.x, game.actors[pid].z - landing.z,
    );
    if (
      !best ||
      zoneDist < best.zoneDist - 1e-9 ||
      (Math.abs(zoneDist - best.zoneDist) <= 1e-9 &&
        (nowDist < best.nowDist - 1e-9 ||
          (Math.abs(nowDist - best.nowDist) <= 1e-9 && pid < best.pid)))
    ) {
      best = { pid, zoneDist, nowDist };
    }
  }
  return best ? best.pid : null;
}

// 攻擊點池（職責制）：站位合法性（AND）決定資格、trust 決定傾向
// 前排：OH=左翼(left)、MB=快攻(quick)、OPP=右翼(right)
// 後排：OH=pipe、OPP=D 球（後排點 rowFactor 0.5）；S 與 MB 後排不進池
// 接一傳者【不】排除——一、三擊非連續觸球合法，接完打第三球是真實常態
// passTier（一傳品質戰術分支）：'perfect'＝全池、'ok'＝無快攻（MB 出池）、
// 'poor'＝只剩兩翼高球（快攻要完美一傳、後排攻擊要像樣一傳——真實排球鐵律）
//
// receiverId（Phase 5 W1 §7 D2「針對性發球吃 transition」）：本波**接一傳的那個人**。
// 他剛把球墊出去，沒有時間完成 §2 的 Transition 拉開 ⇒ 他這一球降到罰則檔
// `D2_PASSER_TIER`。**刻意沿用同一道三檔階梯、不另開平行分支**：
//   ① 檔位是 per-point 的（`pt.tier`），整顆池仍然只有這一顆——攻擊點的產生規則
//      一條未改，只是「這個人現在用哪一檔」不同
//   ② 疊加取**較差**的那一檔（worseTier）＝不重複扣：一傳本來就 'poor' 時
//      接球者的檔位不會再被扣一次（本來就只剩兩翼高球）
//   ③ 下游（applyRouteKinds／tempoFor）照 pt.tier 走 ⇒ 他自動失去交叉與二速，
//      這就是工單說的「只能打降級路線」
// 真實排球對照：快攻手接了一傳就跑不了快攻、後排攻擊手接了一傳跑不完四步 pipe，
// 前排兩翼接了一傳仍然打得到高球——這正是「發給對方主攻手」值得做的理由。
export const D2_PASSER_TIER = 'poor';
const TIER_ORDER = { perfect: 0, ok: 1, poor: 2 };
function worseTier(a, b) {
  return (TIER_ORDER[b] ?? 0) > (TIER_ORDER[a] ?? 0) ? b : a;
}

export function attackPointsOf(game, team, setterId, passTier = 'perfect', receiverId = null) {
  const rot = game.match.rotations[team];
  const pts = [];
  for (const pid of rot) {
    if (pid === setterId) continue;
    const p = game.players[pid];
    const front = isFrontRow(rot, pid);
    const role = p.currentRole;
    // 這條線自己的檔位（D2：接一傳者吃罰則檔，其餘人＝本球的一傳品質）
    const tier = pid === receiverId ? worseTier(passTier, D2_PASSER_TIER) : passTier;
    if (front) {
      if (role === 'outside') pts.push({ pid, kind: 'left', rowFactor: 1, tier });
      else if (role === 'middle' && tier === 'perfect') {
        pts.push({ pid, kind: 'quick', rowFactor: 1, tier });
      } else if (role === 'opposite') pts.push({ pid, kind: 'right', rowFactor: 1, tier });
      // S 前排不進池；libero 前排不存在（預留）
    } else if (tier !== 'poor') {
      // 後排攻擊需會後排攻擊技術（Player.techniques.pipe；預設 1＝AI/快速比賽不變，
      // 生涯新人 0＝二傳不舉給不會後排攻擊的人——否則地板球權會逼出送分自由球）
      const canBackAttack = (p.techniques?.pipe ?? 1) >= 1;
      if (!canBackAttack) continue;
      if (role === 'outside') pts.push({ pid, kind: 'pipe', rowFactor: 0.5, tier });
      // W3 OPP 微調（工單 §5）「後排 D 球權重提高」：全局 0.65 實測把 175 主錨拖出帶
      // （23%/7%→27%/4%，n=150 對照歸因確鑿）——W2 §5 同款裁定：動分佈＝整組重校準，
      // 不免費。故維持 0.5 保錨點；玩家=OPP 的後排球權已由 trustFloor 0.27＋高 trust
      // 實質保障（相對隊友「權重提高」成立）。全局寫實化＝試玩清單待 Sawmah 裁定
      else if (role === 'opposite') pts.push({ pid, kind: 'dball', rowFactor: 0.5, tier });
      // MB/S 後排不進池；libero（Phase 2+）後排替換於此掛鉤
    }
  }
  return pts;
}

// 一傳品質分檔：落點距舉球點的距離（真實排球：快攻吃完美一傳、後排攻擊吃像樣一傳）
// ==== §4 階段四：H 一批——`passTier` 門檻相對化 ====
//
// ★ 病（工單 §4.1，本輪實測復現）★
// 門檻寫死 1.2m，而落點距二傳點的距離 d 結構上到不了：
//   d ＝ rand() × 該次散佈上界 r（`game.js scatterTarget`），實測 r ∈ [0.460, 0.562]
//   ⇒ d p10 0.051／p50 0.250／p90 0.450／max 0.562（非爆接）
//   ⇒ **passTier 實測 perfect 99.9%／poor 0.1%**（那 0.1% 是爆接 `blownTarget`）
// 一傳品質是死的輸入：攻擊池的三個分支（到位＝全池／可用＝無快攻／勉強＝只剩兩翼高球）
// 實際上永遠只走第一個。這是本卷「機制存在但輸入是死的」那一類的第四件。
//
// ★ 相對化掛在哪（2026-07-30 Sawmah 裁定＝掛「舉球可及半徑」）★
// perfect 的語意就是「**二傳不用移動就能舉**」⇒ 門檻 ＝ 舉球可及半徑的倍數。
// 掛 `reachRadiusFor(SET)`（可及的單一真相來源），門檻隨收斂**自己跟著縮**。
// ⚠ 下句原推算（段 2 冷讀勘誤，2026-07-30）：曾寫「目標值 0.45 ⇒ 0.923×0.45＝0.415，
//   落在 p50 與 p90 之間 ⇒ 收斂後真的會出現分佈」——那是把 §5.2 的 0.45 誤讀成公尺
//   絕對值。v4 拍板 1 寫死舉球目標＝**0.45×H（身高比例）**⇒ t=1 可及 ≈0.77–0.86、
//   門檻 ≈0.71–0.79，仍高於 d 的非爆接上界 ≈0.56 ⇒ **照現行三參數（poor 5%／0.923／
//   SCATTER_MAX）收斂全程不會出現分佈**。缺口已隨段 2 回報送裁（convergence §5.6）；
//   掛法本身（單一真相來源）不受影響。
//
// ⚠ 已量測排除的替代方案：掛**接球**可及半徑。階段五把它縮到「身高×0.38」（主錨 175
//   ⇒ ≈0.67）後門檻只縮到 0.614，仍高於 d 的上界 0.562 ⇒ 收斂後照樣全 perfect，滿足不了 §4.2。
// ⚠ 也排除：用**逐次實現的散佈上界 r** 正規化。因 d ＝ rand()×r，`d/r` 恆為 U(0,1)
//   ⇒ 每種 control 的 tier 比例完全相同、passTier 與球員技術脫鉤。可證明的錯，不採。
//
// ★ 係數的來歷與本批的分寸（協議 6：三件套＋H 一批**一起校準**，不得逐件收斂）★
// 係數 ＝ 現值比例（1.2÷1.3、3÷1.3），所以**本批行為零漂移、sim-hash 不變**；
// 真正的數字由階段五連同其他旋鈕一起擰。**本批只交付接縫，不做校準。**
// `ok` 的係數語意較弱（3m 本來就不是對著可及訂的），階段五可再議——這裡沿用現值比例
// 是為了不在本批偷偷改動它。
// ★ S1 聯合反解落地（2026-07-30，補償階段 convergence §5.12；ruling-v3 §三 S1 預授權
//   「t=1 收斂完成後以實測 d 分佈聯合反解，約束＝poor 5%／ok ≥8% 地板，全由量測定、不手挑」）★
// 反解輸入＝t=1 實測 d 分佈（40 局 n=2549，phase5-passtier-probe）：
//   PASS_PERFECT_MUL ＝ d p87 ÷ 舉球可及 p50 ＝ 0.426 ÷ 0.824（⇒ ok 恰為 8% 地板——閉式解）
//   PASS_OK_MUL      ＝ d p95 ÷ 舉球可及 p50 ＝ 0.467 ÷ 0.824（⇒ poor 5%，爆接計入 poor）
// A-7 申報：語意＝門檻對舉球可及的現值比例（與 0.923 同座標系）；單位＝無因次；原點＝
//   d 從二傳站位點（身體軸）、可及半徑以手點為原點——跨原點知情登記沿用（0.923 三要素申報）。
// 套回驗證 perfect 87.0／ok 8.0／poor 4.9%（§4.2「收斂後不得恆為 perfect」自此成立）。
// ⚠ 係數不隨 t 內插 ⇒ t=0 行為也會動（爆接一傳從 ok/perfect 改判 poor）——此效應屬
//   §5.8② 「S1 做完後的玩家實際體驗版 vs A''」要量的總 Δ 的一部分，不重定基準。
// export＝治具向真相來源取值用（A-9；tests/roles-trust 曾寫死 1.2/1.3 快照，S1 後漂移）
export const PASS_PERFECT_MUL = 0.426 / 0.824;
export const PASS_OK_MUL = 0.467 / 0.824;
export function passTierOf(team, landing, setter = null) {
  const spot = localToWorld(team, AI.SETTER_SPOT.lx, AI.SETTER_SPOT.lz);
  const d = Math.hypot(landing.x - spot.x, landing.z - spot.z);
  // 基準 B：舉球可及在 t>0 之後吃**身高**（§1.3 目標值是身高比例）
  // ⇒ 門檻也跟著變成逐二傳。二傳＝`aiState.claimId`；取不到時退回無身高呼叫
  //（t=0 時 reachRadiusFor 不需要身高，見其早退）。
  const setterH = setter?.height?.current ?? null;
  const setReach = reachRadiusFor(REACH_ACTION.SET, TUNING, setterH);
  return d < PASS_PERFECT_MUL * setReach ? 'perfect'
    : d < PASS_OK_MUL * setReach ? 'ok' : 'poor';
}

// 站位交換（真實排球：發球觸球後前後排都跑職責位）——
// 前排：OH 左翼、MB 中、OPP/S 右翼
// 後排：OH 後中（pipe 準備位）、OPP/S 右後（D 球/插上起點）、MB 左後
// （自由人 Phase 2 於左後替換後排 MB 掛鉤）
//
// 07-28 追修（Sawmah：「AI 換站位會撞在一起卡在中間」）：槽位按角色寫死會撞號
// ——前排 S＋OPP 同排（六人輪轉必然出現）目標點完全相同，目標追蹤與同隊避讓
// 推拉平衡＝兩人卡死互抖。改「整排指派」：照偏好槽分配，撞號者拿最近的空槽
//（輪轉序迭代＝決定論；無撞號的輪轉逐值維持原行為＝零平衡漂移）。
const DUTY_SLOTS = [-3, 0, 3];
function dutyPrefer(role, front) {
  if (front) return role === 'outside' ? -3 : role === 'middle' ? 0 : 3;
  return role === 'outside' ? 0 : (role === 'middle' || role === 'libero') ? -3 : 3;
}

export function dutyPosition(game, team, playerId) {
  const rot = game.match.rotations[team];
  const front = isFrontRow(rot, playerId);
  const lz = front ? 3 : 7;
  // 同排成員照輪轉序逐一佔槽；輪到自己時的結果即答案（每人各自呼叫也逐值一致）
  const row = rot.filter((pid) => isFrontRow(rot, pid) === front);
  const taken = new Set();
  for (const pid of row) {
    const prefer = dutyPrefer(game.players[pid].currentRole, front);
    let lx = prefer;
    if (taken.has(lx)) {
      // 撞號：拿距偏好槽最近的空槽（距離同＝取較小 lx；恆有空槽——排員 ≤ 槽數）
      lx = DUTY_SLOTS.filter((s) => !taken.has(s))
        .sort((a, b) => (Math.abs(a - prefer) - Math.abs(b - prefer)) || a - b)[0];
    }
    taken.add(lx);
    if (pid === playerId) return localToWorld(team, lx, lz);
  }
  return localToWorld(team, dutyPrefer(game.players[playerId].currentRole, front), lz);
}

// W3 L（附錄 A1）：收縮指令是否讀對——與 input/liberoRead.digReadCorrect 同語意
// （sim 層內建版：AI 代打與治具上下限臂共用；嚴格相等、middle＝不中）
function digBiasCorrectFor(game, aiState, team) {
  const bias = aiState.digBias;
  if (!bias || bias.team !== team) return false;
  const r = game.rally;
  return r.profile === 'spike' && r.lastSpikeZone != null && r.lastSpikeZone === bias.choice;
}

// W3 L 玩法（附錄 A1）：後排收縮目標——bias＝L 玩家的收縮指令
// （'line'＝加深球側走廊／'cross'＝收斜對角／'tip'＝前壓短區／null＝現行 AI 判斷）。
// 純函式：AI 後排與玩家自身（輸入層）共用同一來源，陣型一體移動
export function digTargetFor(game, team, playerId, bias = null) {
  const d = dutyPosition(game, team, playerId);
  const ballLx = TEAM_SIDE[team] * game.ball.x;
  let shift = Math.max(-1.2, Math.min(1.2, ballLx * AI.DIG_SHIFT));
  let forward = 0.8; // 收前 0.8m（lz 7→6.2）：防守預備深度
  // 批4：邊翼（槽位 |lx|>1）外開＋前壓，把走廊深角收進可及圈（中路槽照舊）。
  // 前壓在 bias 分支「之後」疊加——tip 的前壓短區也要吃邊翼加成，否則指令型
  // forward 覆寫會把邊翼前壓靜默吃掉（block-read 測試的 z 差距斷言抓過這一版）
  const dLx0 = TEAM_SIDE[team] * d.x;
  const outward = Math.abs(dLx0) > 1 ? Math.sign(dLx0) * AI.DIG_WING_OUT : 0;
  if (bias === 'line') {
    // 偏移 1.3m（07-27 試玩回饋：0.9 在六人陣型裡看不見——指揮要有可見的重量）
    shift = Math.max(-2.2, Math.min(2.2, shift + Math.sign(ballLx) * 1.3));
  } else if (bias === 'cross') {
    shift = Math.max(-2.2, Math.min(2.2, shift - Math.sign(ballLx) * 1.3));
  } else if (bias === 'tip') {
    forward = 2.2; // 前壓短區（吊球斷點）
  }
  if (outward !== 0) forward += AI.DIG_WING_FWD; // 批4：邊翼前壓（任何 bias 都疊加）
  // D-1（Phase 5 W2 掃尾-11，07-30）：收縮 shift 上限 ±2.2 是「相對偏好槽」的量，
  // 偏好槽本身已在 ±3（DUTY_SLOTS）——兩者相加會出界（3+2.2=5.2 > 半場內界 4.1），
  // 修前無場地夾限。比照攔網手同一份 clampCourtX（ai.js 下方），只夾 x（z 的前壓
  // 不在本題範圍內，未一併處理）
  return {
    x: clampCourtX(d.x + TEAM_SIDE[team] * (shift + outward)),
    z: d.z - TEAM_SIDE[team] * forward,
  };
}

// Cover（攻擊掩護）站位——彈回區在「攻擊者與網之間」：
// 前排非攻擊手貼網壓低（職責線收向攻擊者側）；後排非攻擊手：
// OH 左側補、OPP/S 右側補（攻擊者周邊）、MB 留深位保險。前後排攻擊點通用——
// 後排攻擊時前排三人正是主要 cover 者（貼網），不會被拉到攻擊者身後
export function coverPosition(game, team, playerId, attackerId) {
  const rot = game.match.rotations[team];
  const role = game.players[playerId].currentRole;
  const atk = game.actors[attackerId];
  const atkLx = TEAM_SIDE[team] * atk.x;
  const atkLz = TEAM_SIDE[team] * atk.z;
  if (isFrontRow(rot, playerId)) {
    const dutyLx = role === 'outside' ? -3 : role === 'middle' ? 0 : 3;
    return localToWorld(team, dutyLx * 0.6 + atkLx * 0.3, 1.3);
  }
  if (role === 'middle' || role === 'libero') return localToWorld(team, 0, 6.6); // 深位保險（長彈回）
  const sideLx = role === 'outside' ? -1.5 : 1.5;
  const lx = Math.max(-4.2, Math.min(4.2, atkLx + sideLx));
  return localToWorld(team, lx, Math.min(atkLz + 1.5, 7.5));
}

// 二傳落點（攻擊線幾何的單一真相已移到 approach.js；此處轉出維持既有 import 路徑）
export { setAimFor };

// 依 trust 權重決定論抽選攻擊點（無任何硬寫比例——權重全來自 Player.trust）
// stage 4：有效 trust＝baseline＋場內動態（連得/連失）；floorShare＝保底球權地板
function pickAttackPoint(game, team, setterId, passTier = 'perfect', points = null) {
  const pts = points ?? attackPointsOf(game, team, setterId, passTier);
  if (pts.length === 0) return null;
  const entries = pts.map((pt) => ({
    ...pt,
    trust: effectiveTrust(game, game.players[pt.pid]),
    floorShare: game.players[pt.pid].trust.floorShare ?? 0,
  }));
  const weights = applyFloorShare(entries, trustToWeights(entries));
  const roll = hash01(game.rally.flightId * 977 + 131 + (game.seed ?? 0));
  return pickByWeights(entries, weights, roll);
}

// 【已刪除・2026-08-01 戰術重做卷 題 0】原本此處有 `requestAcceptP()`：
// 非 S 的「請求」由 S 的 AI 依 trust 權重佔比擲骰決定採納與否。舊語意廢除後
// 沒有任何一條路徑需要採納機率——叫套路的人恆為 S、指令直接生效。

// ---- 段 E 路徑乙：S 遠段臨場改判（藍圖 §2.6）----
//
// ★ 卷五（2026-08-02）：路徑甲（死球窗）退場後，**這裡是玩家叫戰術的唯一入口** ★
// 乙發生在 `touches === 1` **之後**——一傳已經觸球、品質已知，助跑線已經排好、人已經在跑。
// ⇒ 沒有「事前輸入」這條捷徑可走，**必須真的重跑** planCombination ＋ applyComboRoutes
// ＋ approachRoutesFor，把 `aiState.approach` 整份重建。
//
// ⚠ **已起跑的人不得改線** ⚠ 這是 ai.js 一路警告過的「倒著跑回助跑起點」禁區
// （見 approachLaunched 的註解，以及一氣呵成助跑那一段的 §4 A1 例外）。
// 處置＝主攻者或配合者任一已起跑就整筆作廢並回饋 'launched'——不做「只改沒起跑的
// 那一個」的半套改判：組合是**兩人之間的關係**，只改一邊等於兩人跑不同的套路。
// 其餘人的 route 逐值重算（輸入一格未動 ⇒ 結果本來就相同），但仍逐一以舊物件覆蓋
// 已起跑者：把「不得改線」寫成程式碼裡看得到的保證，不倚賴「反正算出來會一樣」。
// ⚠ **誠實標註（符號掃描實測，300 個規劃點）**：下面 `.map()` 裡的「已起跑就沿用舊
// route」那一支目前**跑不到**（改判窗開在二傳觸球前，那一刻 0/300 次有人起跑過）。
// 真正在承重的是上面那道「主攻者/配合者已起跑就整筆作廢」——它兩側都有測試。
// 這三行是**防禦性**的，留著是因為單人型擴充卷（slide／背飛）會再加一速線，
// 屆時它才會變成活的；**不得把它當成「已起跑者不得改線」的證據**。
// 窗界＋池子重建——`applyReplanCall`（會改狀態）與 `callFeasibilityOf`（純查詢）共用同一段。
// 抽出來的理由：UI 要知道「哪幾個戰術這球湊得出來」，但**不得自己再重建一顆池**
// （那就變成第二份真相，與 applyReplanCall 遲早漂開）。窗外一律回 null。
function replanContextOf(game, aiState) {
  const r = game.rally;
  const team = aiState.landingTeam;
  // 窗界＝與甲同一個規劃窗（我方持球的第二觸窗、助跑線還活著）
  if (game.phase !== 'rally' || !team || r.possession !== team || r.touches !== 1
    || aiState.approach?.team !== team || !aiState.approach.routes) return null;
  const tier = aiState.passTier ?? 'perfect';
  // 池子用**與 ensureFlightPlan 逐字相同的**三個輸入重建（claimId／tier／passReceiverId
  // 都是本波已定案的協調層狀態）⇒ 同一顆池，不另闢真相
  const points = applyRouteKinds(
    attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId),
    {
      flightId: r.flightId,
      seed: game.seed ?? 0,
      passTier: tier,
      // 2026-08-07：池子每次重建都要沿用玩家已按下的內切決定，否則 S 的改判／
      // 段 1 的重組織會把它悄悄洗掉（ensureFlightPlan:398 一直都這樣做，這裡漏了）
      cutFor: aiState.cutCall ?? null,
    },
  );
  return { team, tier, points };
}

// ════════════════════════════════════════════════════════════════
// 內切窗（2026-08-07 Sawmah 裁定：修，不退）
// ════════════════════════════════════════════════════════════════
//
// ★ 本函式是「內切現在按不按得到」的**單一真相** ★
// UI 用它決定浮鈕顯不顯示、`applyCutCall` 用它決定生不生效
// ⇒ **名目窗與真實窗在構造上相等**。這正是本次 bug 的修法本身。
//
// ★ 修前是什麼樣（實測，不是推論）★
//   舊制：UI 自己記一個 800ms 計時器，sim 卻在 `ensureFlightPlan` 的 `cutFor` 消費
//   ——而那一步逐 flightId 只跑一次，開窗後**下一個 tick（16.7ms）**就把線鎖死。
//   `tools/cut-effectiveness-probe.mjs`：D=0 生效 66.4%／D=1（+16.7ms）22.2%／
//   D=5（+83ms）22.2%——D≥1 逐位等同 `CROSS_RATE` 30% 自然骰。
//   人類反應 ≥150ms ⇒ **真人按的每一次都與沒按無法區分**（這顆鈕從上線就沒生效過）。
//
// ★ 窗的真實邊界是什麼（實測）★
//   `left`／`left_inside` 都是三速 ⇒ `routeTicks` 給的 `startTick === setTick`
//   ＝攻擊手在**二傳觸球那一刻才起步**，在那之前他站在助跑起點等。
//   ⇒ 物理上「還來得及改線」的邊界＝二傳尚未觸球（`r.touches === 1`）。
//   實測開窗→二傳觸球間隔（同一支探針，快速比賽＋生涯各 12 局）：
//   **最短 1386ms／中位 1486ms／最長 1620ms**——遠寬於名目的 800ms。
//   最晚可改線 tick 的助跑品質掃描見 `tools/cut-deadline-probe.mjs`。
//
// 回傳 `{ open, reason, kind }`：
//   open   ＝按下去會真的改變這一波的線
//   reason ＝關窗原因（UI 與回饋文案共用同一組代碼，不另立第二套）
//     'nowindow' 不在第二觸窗（還沒起球／球已經舉出去了）
//     'pass'     這條線的一傳檔位不是 perfect ⇒ `routeKindFor` 第一道閘就原樣返回＝按了必無效
//     'nopool'   這一波沒有你的線（後排／不在攻擊池）
//     'done'     你這一波本來就跑內切（`CROSS_RATE` 自然骰已經切了）
//     'locked'   S 已經把你的線改成別的（交叉／夾塞等組合線）
export function cutStateOf(game, aiState, playerId) {
  const shut = (reason) => ({ open: false, reason, kind: null });
  const r = game?.rally;
  const team = game?.players?.[playerId]?.teamId ?? null;
  if (game?.phase !== 'rally' || !r || !team) return shut('nowindow');
  if (r.possession !== team || r.touches !== 1) return shut('nowindow');
  if (aiState?.approach?.team !== team || !aiState.approach.routes) return shut('nowindow');
  const route = approachRouteOf(aiState.approach.routes, playerId);
  if (!route) return shut('nopool');
  if (route.kind === 'left_inside') return { open: false, reason: 'done', kind: route.kind };
  if (route.kind !== 'left') return { open: false, reason: 'locked', kind: route.kind };
  // ★ B：一傳不到位就不開窗 ★ `routeKindFor:390` 的 `passTier !== 'perfect'` 直接
  // 原樣返回 ⇒ 那些波按了必然無效，舊制卻照樣跳鈕、照樣報成功＝假陽性回饋。
  //
  // ⚠ 這裡吃的是**這條線自己的檔位**，不是隊伍的 `aiState.passTier` ⚠
  //   §7 D2：接一傳的那個人這一球只剩降級路線（`attackPointsOf` 的
  //   `worseTier(passTier, D2_PASSER_TIER)`）——而 OH 自己接一傳是家常便飯。
  //   實測（`tools/cut-deadline-probe.mjs` 的診斷輪）：只看隊伍檔位的話，
  //   未生效的波裡有一大半是「隊伍 perfect、但 A2 自己接了一傳所以線是 poor」。
  //   兩層檔位是同一個 bug 的兩張臉，一起關掉。
  // 判準**不重刻**：直接問 `routeKindFor`「若我強制內切，它會給我什麼」。
  //   （抄一份 `passTier !== 'perfect'` 進來＝第二份真相，本專案已為同型分岔踩過坑。）
  const tier = aiState.passTier ?? 'perfect';
  const pt = attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId)
    .find((p) => p.pid === playerId);
  if (!pt) return shut('nopool');
  if (routeKindFor(pt.kind, { passTier: pt.tier ?? tier, forcedCut: true }) !== 'left_inside') {
    return shut('pass');
  }
  return { open: true, reason: null, kind: route.kind };
}

// ════════════════════════════════════════════════════════════════
// CALL_PLAY —— 玩家戰術指令的**純觀測**事件（練習賽卷 2026-08-12）
// ════════════════════════════════════════════════════════════════
// ★ 為什麼要有它 ★ 叫戰術的四個入口全程只寫 `aiState.*Outcome`（執行期狀態），
// 賽末結算讀的是 `game.events` ⇒ 「這場成功叫成幾次戰術」在事件流上判不到。
// 這支就是把那一刻寫進歷史，**不改任何判定**：沒有人讀 CALL_PLAY，sim 一格不動。
//
// ★ 掛在哪 ★ 四個入口的「指令真的生效」那一行（`record('applied')`／replan 的收尾）：
//   ⚡ S 的分配面板（replanCall）／↘ OH 內切（cutCall）／
//   🤝 OPP 夾塞（tandemCall）／🖐 MB 要 B 快（bquickCall）
// 四個都是 `TECH_DEFS.callPlay` 這一把技術解鎖的同一件事（見 career/growth.js:51），
// 所以四個都要發——只掛 S 那一個的話，玩家站 OH／OPP／MB 時科目結構上做不到，
// 那正是 `practiceMatch.js` 檔頭在防的「喊了但判不到」。
//
// ★ 零漂移保證 ★ 四個呼叫端的第一行都是「指令槽是空的就 return」，而那四個槽
// **只有 matchLoop 的受控玩家按鈕會寫** ⇒ AI vs AI 對局一顆都不會發。
//
// ★ 寫進 `game.events` 而不是 tick 的 `ev` 緩衝 ★ 協調層拿不到那個緩衝（
// `aiCollectIntents` 的簽名裡沒有），而 game.js 本來就有直接寫 state.events 的先例
//（settlePoint／applySubstitution 等）。時序上它落在同一 tick 的 TOUCH **之前**＝
// 「先叫，才打」，正是結算要的順序。
//
// 欄位：{ type, tick, team, playerId(＝下指令的人), callType, mainId(＝主攻者),
//         kind(＝寫回後主攻者真正要跑的線) }
// `kind` 一律從**寫回後的** `aiState.approach.routes` 讀（不是從指令名推）——
// 面板承諾的與場上真的要跑的必須是同一個來源。
function pushCallPlay(game, aiState, { callerId, callType, mainId }) {
  const kind = approachRouteOf(aiState?.approach?.routes, mainId)?.kind ?? null;
  game.events.push({
    type: 'CALL_PLAY',
    tick: game.tick,
    team: game.players[callerId]?.teamId ?? game.players[mainId]?.teamId ?? null,
    playerId: callerId ?? null,
    callType,
    mainId: mainId ?? null,
    kind,
  });
}

// 消費玩家的內切決定。**AI 對局恆為 no-op**：`aiState.cutCall` 只有 matchLoop
// （受控玩家按鈕）會寫，AI vs AI 一律 null ⇒ 第一行就 return，逐值零漂移。
//
// 重建範式逐項抄 `applyReplanCall`（那支已經在做同一件事：在第二觸窗內把 approach
// 整份重算）。三個差別，都是刻意的：
//   ① **不重跑 `pickAttackPoint`**——內切是攻擊手改自己的線，不是改「S 要給誰」。
//      （`pickAttackPoint` 只吃 pid／trust，不吃 kind ⇒ 早按晚按對選人本來就同值。）
//   ② **不重跑 `planCombination`**——組合是兩人之間的關係，攻擊手不該單方面拆掉它；
//      S 已經排了組合線時走 'locked' 誠實回報，不硬改。
//   ③ 沿用既有的 `aiState.approach.setTick`（時間錨點不因改線而重估）。
function applyCutCall(game, aiState) {
  const call = aiState.cutCall;
  if (!call || call.cut !== true) return; // ★ AI 對局的零漂移保證就是這一行 ★
  const r = game.rally;
  const flightId = r?.flightId ?? null;
  // 同一個 flight 只結算一次（flightId 在窗內 churn 時會再結一次，冪等）
  if (aiState.cutOutcome && aiState.cutOutcome.flightId === flightId) return;
  const record = (outcome, reason = null) => {
    aiState.cutOutcome = { flightId, pid: call.pid, outcome, reason };
    // 純觀測（見 pushCallPlay）：'applied' 的兩條路（真的改了線／'already' 本來就切了）
    // 對玩家都是「這一波我要的線成立了」⇒ 同樣記一筆，不在此處分岔。
    if (outcome === 'applied') {
      pushCallPlay(game, aiState, { callerId: call.pid, callType: 'cut', mainId: call.pid });
    }
  };
  const st = cutStateOf(game, aiState, call.pid);
  if (!st.open) {
    // 'done'＝他要的內切本來就成立（自然骰已經切了）⇒ 對玩家而言是成功，不是失敗
    if (st.reason === 'done') record('applied', 'already');
    else record('missed', st.reason);
    return;
  }
  const team = aiState.landingTeam;
  const tier = aiState.passTier ?? 'perfect';
  const combo = aiState.attackCombo;
  // ★ 順序：組合先落地、內切後套 ★ 與 `ensureFlightPlan`（applyRouteKinds → 組合）
  //   刻意相反，理由是這裡的組合**已經是既定事實**（S 這一波排好的），而內切是
  //   之後才進來的攻擊手決定。照 ensureFlightPlan 的順序寫的話，
  //   `applyComboRoutes` 會拿規劃當時存下的 `combo.mainKind`（例如 delay 型的 'left'）
  //   把剛改好的 left_inside 蓋回去——實測診斷輪裡確實踩到了這一格。
  //   反過來寫之後：組合真的換了線（cross／tandem）⇒ kind 已不是 'left'
  //   ⇒ `routeKindFor` 原樣返回＝組合贏（`cutStateOf` 也會先回 'locked'）；
  //   組合只換節奏（delay）⇒ kind 仍是 'left' ⇒ 內切生效。兩種都對。
  //   其餘人的 kind 在兩種順序下逐值相同（非 'left' 的線 routeKindFor 一律原樣返回，
  //   其他 OH 左線吃的 hash 三個輸入 flightId／index／seed 也都沒動）。
  const nextPoints = applyRouteKinds(
    applyComboRoutes(
      attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId),
      combo,
    ),
    { flightId: r.flightId, seed: game.seed ?? 0, passTier: tier, cutFor: call },
  );
  const routes = approachRoutesFor(team, nextPoints, {
    setTick: aiState.approach.setTick,
    flightId: r.flightId,
    seed: game.seed ?? 0,
    passTier: tier,
    speedOf: (pid) => moveSpeed(game.players[pid]),
    combo,
  });
  aiState.approach = { team, setTick: aiState.approach.setTick, routes };
  // 攻擊線／節奏由**寫回後**的池決定（同 ensureFlightPlan／applyReplanCall 的教訓：
  // 否則二傳瞄的落點與該人助跑的終點會是兩個地方）。他不是本波攻擊手時維持原值。
  aiState.attackKind =
    nextPoints.find((pt) => pt.pid === aiState.attackerId)?.kind ?? aiState.attackKind;
  aiState.attackTempo =
    approachRouteOf(routes, aiState.attackerId)?.tempo ?? aiState.attackTempo;
  record('applied');
}

// ════════════════════════════════════════════════════════════
// 夾塞窗（2026-08-07 Sawmah 裁定：OPP 前排比照 OH 內切主動化）
// ════════════════════════════════════════════════════════════
//
// ★ 為什麼要有這一支 ★ 08-06 集訓卷裁定 2b 把夾塞（`TANDEM_PLAY_RATE`）解封，
// 價值定位是「**OPP 有一條只有他能打的線**」——但玩家操 OPP 時對這條線零決定權：
// 只能等 25% 自動骰或等 S 叫。真人試玩回報的就是這件事。
//
// ★ 與內切的兩個差別（同型不同事，不得互相覆寫）★
//   ① 內切改的是**一條線**（`routeKindFor` 的 forcedCut）；夾塞改的是**兩人的關係**
//      （`attackCombo`），所以這裡走的是 `evaluateCombination(type:'tandem', force:true)`
//      而不是 cutFor。
//   ② 內切的 force 只跳過 `CROSS_RATE` 的骰子；夾塞的 force 只跳過 `COMBO_RATE.tandem`
//      的骰子，**世界閘 `comboScale` 一樣關得掉它**（approach.js:878-884 的裁定不動）。
//
// ★ 這顆鈕**不改球權** ★ 「球給我打」是另一顆鈕（`⚡ 跟上！`／`rally.callPid`）。
// 夾塞只把這一波的兩條線排成夾塞；球最後給誰仍由 `pickAttackPoint` 的 trust 決定
// （鈕面的兩態會誠實地說「這球你的」沒有）。兩件事合併＝OPP 用戰術鈕偷球權。
//
// 回傳 `{ open, reason }`：
//   open   ＝按下去這一波會真的排成夾塞
//   reason ＝關窗原因（機器碼；文案在 app 層，sim 不產生給人看的字串）
//     'nowindow' 不在第二觸窗（還沒起球／球已經舉出去了）
//     'done'     這一波本來就已經排了你的夾塞（自動骰／S 叫的都算）⇒ 對玩家是成功
//     'locked'   本波已經有**別的**組合（S 排的交叉／時間差等）——組合是兩人之間的
//                關係，攻擊手不該單方面把它拆掉（與 cutStateOf 的 'locked' 同一條紀律）
//     'nopool'   這一波沒有你的線（後排輪次／不在攻擊池）
//     其餘       `evaluateCombination` 的 checks 第一個沒過的條件名
//                （mainKind／tier／partner／lane／depth／stagger／notCrossing／roll）
//                ——**不重刻判準**：夾塞成不成立由那支函式說了算，這裡只轉述。
function tandemPlanOf(game, aiState, playerId) {
  const shut = (reason) => ({ open: false, reason, points: null, combo: null });
  const r = game?.rally;
  const team = game?.players?.[playerId]?.teamId ?? null;
  if (game?.phase !== 'rally' || !r || !team) return shut('nowindow');
  if (r.possession !== team || r.touches !== 1) return shut('nowindow');
  if (aiState?.approach?.team !== team || !aiState.approach.routes) return shut('nowindow');
  // 本波已經有組合：是我的夾塞＝按了也是同一條線（'done'）；別型／別人的＝'locked'
  const cur = aiState.attackCombo;
  if (cur) {
    return shut(cur.type === 'tandem' && cur.mainId === playerId ? 'done' : 'locked');
  }
  const tier = aiState.passTier ?? 'perfect';
  // 池用**與 ensureFlightPlan 逐字相同的**三個輸入重建（同一顆池，不另闢真相）
  const points = applyRouteKinds(
    attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId),
    {
      flightId: r.flightId,
      seed: game.seed ?? 0,
      passTier: tier,
      cutFor: aiState.cutCall ?? null,
    },
  );
  if (!points.some((pt) => pt.pid === playerId)) return shut('nopool');
  const ev = evaluateCombination(points, playerId, {
    team,
    flightId: r.flightId,
    seed: game.seed ?? 0,
    passTier: tier,
    type: 'tandem',
    force: true, // 玩家明確要跑 ⇒ 跳過觸發骰（世界閘 comboScale 仍然擋得住）
    comboScale: game.comboScale ?? 1,
  });
  if (!ev.combo) return shut(firstFailedCheck(ev.checks));
  return { open: true, reason: null, points, combo: ev.combo };
}

// `tandemPlanOf` 的薄封裝（範式同 `planCombination` 之於 `evaluateCombination`）：
// UI 只該看得到「開不開、為什麼」，池與組合是消費端（applyTandemCall）的內部事。
export function tandemStateOf(game, aiState, playerId) {
  const p = tandemPlanOf(game, aiState, playerId);
  return { open: p.open, reason: p.reason };
}

// 消費玩家的夾塞決定。**AI 對局恆為 no-op**：`aiState.tandemCall` 只有 matchLoop
// （受控玩家按鈕）會寫，AI vs AI 一律 null ⇒ 第一行就 return，逐值零漂移。
//
// 寫回範式逐項抄 `applyCutCall`（它抄的又是 `applyReplanCall`），三個刻意的差別：
//   ① **不重跑 `pickAttackPoint`**——這顆鈕不改球權（見上方說明）。
//   ② 組合由 `tandemPlanOf` 一次算完並帶回來，不在這裡重算：重算＝同一份判斷寫兩遍，
//      而「窗說開、按下去卻不成立」正是那種分岔的產物。
//   ③ 沿用既有的 `aiState.approach.setTick`（時間錨點不因排戰術而重估）。
function applyTandemCall(game, aiState) {
  const call = aiState.tandemCall;
  if (!call || !call.pid) return; // ★ AI 對局的零漂移保證就是這一行 ★
  const r = game.rally;
  const flightId = r?.flightId ?? null;
  // 同一個 flight 只結算一次（flightId 在窗內 churn 時會再結一次，冪等）
  if (aiState.tandemOutcome && aiState.tandemOutcome.flightId === flightId) return;
  const record = (outcome, reason = null) => {
    aiState.tandemOutcome = { flightId, pid: call.pid, outcome, reason };
    if (outcome === 'applied') { // 純觀測，見 pushCallPlay
      pushCallPlay(game, aiState, { callerId: call.pid, callType: 'tandem', mainId: call.pid });
    }
  };
  const plan = tandemPlanOf(game, aiState, call.pid);
  if (!plan.open) {
    // 'done'＝這一波本來就排了他的夾塞 ⇒ 對玩家而言是成功，不是失敗
    if (plan.reason === 'done') record('applied', 'already');
    else record('missed', plan.reason);
    return;
  }
  const team = aiState.landingTeam;
  const tier = aiState.passTier ?? 'perfect';
  const { points, combo } = plan;
  // 只改涉及的兩人（主攻＝玩家、配合者＝MB 快攻），其餘 point 同一個物件參照
  const comboPoints = applyComboRoutes(points, combo);
  const routes = approachRoutesFor(team, comboPoints, {
    setTick: aiState.approach.setTick,
    flightId: r.flightId,
    seed: game.seed ?? 0,
    passTier: tier,
    speedOf: (pid) => moveSpeed(game.players[pid]),
    combo,
  });
  aiState.attackCombo = combo;
  aiState.approach = { team, setTick: aiState.approach.setTick, routes };
  // 攻擊線／節奏由**寫回後**的池決定（同 ensureFlightPlan／applyCutCall 的教訓：
  // 否則二傳瞄的落點與該人助跑的終點會是兩個地方）。他不是本波攻擊手時維持原值。
  aiState.attackKind =
    comboPoints.find((pt) => pt.pid === aiState.attackerId)?.kind ?? aiState.attackKind;
  aiState.attackTempo =
    approachRouteOf(routes, aiState.attackerId)?.tempo ?? aiState.attackTempo;
  record('applied');
}

// ════════════════════════════════════════════════════════════════
// B 快窗（2026-08-09 Sawmah 裁定：MB 的專屬鈕＝「要 B 快」）
// ════════════════════════════════════════════════════════════════
//
// 為什麼是這顆鈕：第 2 屆解鎖叫戰術時，OH 拿到內切鈕（+7.6 次決定/局）、
// OPP 拿到夾塞鈕（+10.7）、S 拿到叫戰術面板（+29.6），**MB 拿到 0**。
// 而 MB 每局 28.5 次互動裡 69% 壓在攔網賭局那一種上，那個面板 08-01 起已擴散到
// 前排全員 ⇒ 不再是他的身分。他缺的不是球權數字，是「只有他能下的決定」。
//
// ★★ 這顆鈕**會要球**（同 `⚡ 跟上！`，不同於內切與夾塞）★★ 三顆鈕的語意刻意分開：
//   「↘ 內切」＝我改我自己的線（不動球權）
//   「🤝 夾塞」＝我跑那條配合線（不動球權——實測 73% 的波球不是他打的）
//   「🖐 要 B 快」＝**把這球給我，我打 B 快**（動球權）
// 選要球型而不是改線型是本卷最關鍵的取捨：MB 的抱怨是「球權很少、體驗很少」，
// 給他一顆只改線的鈕＝再造一個 73% 白跑的夾塞。要球型**白跑率結構上為 0**。
//
// reason 與內切共用同一組代碼語意：
//   'nowindow' 不在第二觸窗　'playsOff' 這場沒有戰術（第 1 屆）
//   'nopool'   這一波你沒有快攻線（後排／一傳不到位／不在攻擊池）
//   'done'     你這一波本來就跑 B 快（AI 二傳已經給了）
//   'locked'   S 已排了組合，攻擊手不單方面拆掉兩人之間的關係（同 applyCutCall 差別②）
export function bquickStateOf(game, aiState, playerId) {
  const shut = (reason) => ({ open: false, reason });
  const r = game?.rally;
  const team = game?.players?.[playerId]?.teamId ?? null;
  if (game?.phase !== 'rally' || !r || !team) return shut('nowindow');
  if (r.possession !== team || r.touches !== 1) return shut('nowindow');
  // 世界規則閘：與 planSoloPlay／resolveCalledPlay 同一個旗標，不另立第二份真相
  if ((game.comboScale ?? 1) <= 0) return shut('playsOff');
  if (aiState?.approach?.team !== team || !aiState.approach.routes) return shut('nowindow');
  const route = approachRouteOf(aiState.approach.routes, playerId);
  if (!route) return shut('nopool');
  if (route.kind === 'bquick') return { open: false, reason: 'done' };
  // ★ 只有本來就跑得動 A 快的人才要得動 B 快 ★（`SOLO_MAIN_KINDS.bquick = ['quick']`）
  // 這一條同時吃掉「後排」與「一傳不到位」——兩者都讓 attackPointsOf 不給他 quick，
  // 所以**不得**在這裡重刻一份一傳檔位判斷（那是第二份真相，本專案累犯型錯誤）。
  if (route.kind !== 'quick') return shut('nopool');
  if (aiState.attackCombo) return shut('locked');
  return { open: true, reason: null };
}

// 消費玩家的 B 快要求。**AI 對局恆為 no-op**（`bquickCall` 只有 matchLoop 會寫）。
// 重建範式逐項抄 `applyCutCall`，兩個刻意的差別：
//   ① 用 `applySoloRoute` 而不是 `cutFor`（B 快是單人型，不走 routeKindFor 那條）
//   ② **改球權**：`attackerId = call.pid`——這就是「要」與「改線」的差別本身
function applyBquickCall(game, aiState) {
  const call = aiState.bquickCall;
  if (!call) return; // ★ AI 對局的零漂移保證就是這一行 ★
  const r = game.rally;
  const flightId = r?.flightId ?? null;
  if (aiState.bquickOutcome && aiState.bquickOutcome.flightId === flightId) return;
  const record = (outcome, reason = null) => {
    aiState.bquickOutcome = { flightId, pid: call.pid, outcome, reason };
    if (outcome === 'applied') { // 純觀測，見 pushCallPlay
      pushCallPlay(game, aiState, { callerId: call.pid, callType: 'bquick', mainId: call.pid });
    }
  };
  const st = bquickStateOf(game, aiState, call.pid);
  if (!st.open) {
    if (st.reason === 'done') record('applied', 'already');
    else record('missed', st.reason);
    return;
  }
  const team = aiState.landingTeam;
  const tier = aiState.passTier ?? 'perfect';
  const solo = { mainId: call.pid, kind: 'bquick' };
  // 順序逐字對齊 ensureFlightPlan：applyRouteKinds 先、單人型後
  //（反過來寫會讓 routeKindFor 拿舊 kind 重算，把剛升級的 bquick 蓋回去）
  const nextPoints = applySoloRoute(
    applyRouteKinds(
      attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId),
      {
        flightId: r.flightId,
        seed: game.seed ?? 0,
        passTier: tier,
        cutFor: aiState.cutCall ?? null,
      },
    ),
    solo,
  );
  const routes = approachRoutesFor(team, nextPoints, {
    setTick: aiState.approach.setTick,
    flightId: r.flightId,
    seed: game.seed ?? 0,
    passTier: tier,
    speedOf: (pid) => moveSpeed(game.players[pid]),
    combo: null,
  });
  aiState.approach = { team, setTick: aiState.approach.setTick, routes };
  aiState.attackerId = call.pid; // ★ 要球：與另外兩顆鈕的差別就在這一行 ★
  aiState.attackSolo = solo;
  aiState.attackKind = nextPoints.find((pt) => pt.pid === call.pid)?.kind ?? aiState.attackKind;
  aiState.attackTempo = approachRouteOf(routes, call.pid)?.tempo ?? aiState.attackTempo;
  record('applied');
}

// ★ 2026-08-03 Sawmah 裁定乙：湊不出來的戰術**當場不列** ★
// 為什麼現在可以列（而 `callPlay.js:47-49` 的裁定 E 曾禁止「預先變灰」）：
// 那條禁令的理由是「變灰＝**預判**一傳品質＝作弊」，而它成立於**死球窗入口還在**
// 的時代——那時你在一傳落地**之前**就要叫，變灰確實等於劇透未來。
// 卷五 §六把死球窗入口拆了、入口搬到遠段（一傳已落地、`passTier` 已定案，
// 面板標題自己就印著「一傳到位／可用／勉強」）⇒ **這裡讀的是已知事實，不是預測**。
//
// 回傳 `{ [type]: { feasible, reason } }`；窗外回 null（＝沒有可判定的東西）。
// **純查詢：不改 game／aiState 任何一格。**
// ⚠ 不含 `launched`（已起跑就作廢）那一關——那是取用時點才問得出來的，
//   而實測改判窗開在二傳觸球前、0/300 次有人起跑過（見上方誠實標註）。
export function callFeasibilityOf(game, aiState) {
  const ctx = replanContextOf(game, aiState);
  if (!ctx) return null;
  const { team, tier, points } = ctx;
  const out = {};
  for (const type of offeredCallTypes()) {
    const res = resolveCalledPlay(points, { type, callerId: null, isSetter: true }, {
      team,
      flightId: game.rally.flightId,
      seed: game.seed ?? 0,
      passTier: tier,
      fallbackMainId: aiState.attackerId,
      comboScale: game.comboScale ?? 1,
    });
    out[type] = { feasible: !!(res.combo ?? res.solo), reason: res.reason ?? null };
  }
  return out;
}

function applyReplanCall(game, aiState) {
  const call = aiState.replanCall;
  if (!call) return;
  const r = game.rally;
  aiState.replanCall = null; // 窗內窗外都只嘗試一次（殘留指令不跨球生效）
  const ctx = replanContextOf(game, aiState);
  if (!ctx) return;
  const { team, tier, points } = ctx;
  // 遠段改判的人一定是 S（面板在 S 的分配窗裡）⇒ 語意是**指令**
  const res = resolveCalledPlay(points, { type: call.type, callerId: call.callerId, isSetter: true }, {
    team,
    flightId: r.flightId,
    seed: game.seed ?? 0,
    passTier: tier,
    fallbackMainId: aiState.attackerId,
    comboScale: game.comboScale ?? 1, // 同路徑甲：世界規則關閉時，遠段改判也叫不出來
  });
  const out = {
    // ★ 2026-08-03 裁定甲的另一半 ★ 這裡原本寫死 'replan'，於是面板按鈕是「⚡指令」、
    // 按下去的回饋字卡卻是「🔄改判」——同一件事兩種說法。
    // 「改判」是死球窗入口還在的時代的措辭（先在死球窗叫一次、遠段才是「改」那一次）；
    // 卷五 §六 把死球窗入口整條拆了之後**沒有前一次判定可以改**。
    // 解析器自己回的 mode 一直都是 'command'（approach.js:908「叫套路的人一定是 S」）。
    type: call.type, mode: res.mode ?? 'command', outcome: res.outcome, reason: res.reason,
    mainId: res.mainId, flightId: r.flightId,
  };
  // 卷五：解析器現在有**兩種**成立形狀——組合（combo，兩人配合）與單人改線（solo，
  // 只動他自己的線）。兩者都帶 mainId，底下共用的那幾行只讀 mainId；分歧的兩處
  //（起跑判定要不要看配合者、線怎麼寫回池）各自分支。
  const shaped = res.combo ?? res.solo;
  if (!shaped) { aiState.callOutcome = out; return; }
  const tick = game.tick;
  // 起跑判定必須在覆寫 aiState.approach **之前**取（approachLaunched 讀的就是它）
  // 組合是兩人之間的關係 ⇒ 任一人已起跑就整筆作廢；單人型只有他自己這一條線要看。
  const launched = (pid) => approachLaunched(aiState, pid, tick);
  if (launched(shaped.mainId) || (res.combo && launched(res.combo.partnerId))) {
    aiState.callOutcome = { ...out, outcome: 'infeasible', reason: 'launched' };
    return;
  }
  const prev = aiState.approach.routes;
  const nextPoints = res.combo
    ? applyComboRoutes(points, res.combo)
    : applySoloRoute(points, res.solo);
  const routes = approachRoutesFor(team, nextPoints, {
    setTick: aiState.approach.setTick,
    flightId: r.flightId,
    seed: game.seed ?? 0,
    passTier: tier,
    speedOf: (pid) => moveSpeed(game.players[pid]),
    // 單人型沒有 tempoGap／指派節奏 ⇒ 傳 null，approachRoutesFor 逐值走原路徑
    combo: res.combo,
  }).map((rt) => (launched(rt.pid) ? (prev.find((o) => o.pid === rt.pid) ?? rt) : rt));
  aiState.attackerId = shaped.mainId;
  // ⚠ **無條件指派**（不得寫成 `if (res.combo)`）：單人型的 res.combo 是 null，而它
  // 正是要把上一份組合清掉——B 快拉走的就是那份組合的誘餌（三型的誘餌都是跑 A 快的
  // MB），關係當場斷掉。留著舊 combo ⇒ 下游（組合獎金判定，本檔 attackCombo?.partnerId）
  // 會拿一份「兩條線都已經被這次重建覆蓋掉」的組合做判定。
  aiState.attackCombo = res.combo;
  // 攻擊線由**寫回後**的池決定（與 ensureFlightPlan 同一道教訓：否則二傳瞄的落點
  // 與該人助跑的終點是兩個地方）
  aiState.attackKind = nextPoints.find((pt) => pt.pid === shaped.mainId)?.kind ?? null;
  aiState.approach = { team, setTick: aiState.approach.setTick, routes };
  aiState.attackTempo = approachRouteOf(routes, shaped.mainId)?.tempo ?? 'three';
  aiState.callOutcome = out;
  // 職業章批 4b（改叫 E3/E4）：呼叫者不是 S ⇒ 這是「改叫」入口（重用本函式的既有
  // 指令通道，不另立第二套）。記下 mainId，settlePoint 讀（那一波沒得分＝trust
  // 扣加倍）。S 呼叫的既有路徑（caller.currentRole === 'setter'）不寫這格，
  // r.audibleMainId 維持 null——上面所有既有邏輯一行未動，這裡只新增一格記帳。
  const caller = game.players[call.callerId];
  if (caller && caller.currentRole !== 'setter') {
    r.audibleMainId = shaped.mainId;
  }
  // 純觀測（見 pushCallPlay）：走到這一行＝指令成立且線已經寫回 approach
  //（'infeasible'／'launched' 兩條路都在上面提前 return，發不出這一顆）。
  pushCallPlay(game, aiState, {
    callerId: call.callerId, callType: call.type, mainId: shaped.mainId,
  });
}

// ════════════════════════════════════════════════════════════════
// 職業章批 4b（改叫，B2）—— 非 S 位置的組合指令窗
// ════════════════════════════════════════════════════════════════
// UI 用它決定「改叫」浮鈕顯不顯示、哪幾個戰術這球湊得出來（同 `callFeasibilityOf`
// 的裁定乙：湊不出來的當場不列）。**不重建窗界或池子**——直接問 `callFeasibilityOf`
// （S 面板背後那支），只多做兩件 S 不需要的事：①排除 S 本人（S 走自己的既有面板，
// 這裡不是第二個入口）②把「這場我方是不是在這個窗裡」的隊伍歸屬也問一遍——
// `callFeasibilityOf` 只看 `aiState.landingTeam`（whichever 隊在窗裡），不查
// playerId；非 S 呼叫者必須先確認那正是**他自己這一隊**，否則會把敵隊的窗誤判成
// 自己能叫（跨隊誤觸發，`aiState` 是全場唯一一份、兩隊共用同一個協調層狀態）。
export function audibleStateOf(game, aiState, playerId) {
  const player = game.players?.[playerId];
  if (!player || player.currentRole === 'setter') return { open: false, types: [] };
  if (aiState.landingTeam !== player.teamId) return { open: false, types: [] };
  const feas = callFeasibilityOf(game, aiState);
  if (!feas) return { open: false, types: [] };
  const types = offeredCallTypes().filter((t) => feas[t]?.feasible !== false);
  return { open: types.length > 0, types };
}

// ---- 叫戰術重做卷 段 1：受控玩家「不跑」的後果（Sawmah 2026-08-01 裁定 1A/1B/1C）----
//
// 新語意的下半場。段 0 已經做完上半場：一傳完成 → S 決策 → 非 S 收到球內提示
//（`src/ui/routeCue.js`「S 要你跑 X」）→ **他自己決定跑不跑**。本函式處理
// 「他不跑會怎樣」：S 當場把他從攻擊池拿掉、改給別人（裁定 1A）。
//
// ★★★ 護欄 C：本機制只檢查 excludeIds（受控玩家）★★★
// AI 隊友「沒跑自己的線」是**既有行為**——他去接球、去補位（實測單局 601 次沒步進
// 協調分支），那不是「決定不跑」。拿它觸發改判會把既有平衡整個打爛。
// 因此 excludeIds 為空（AI vs AI 對局）時第一行就 return ⇒ `tools/sim-hash-probe.mjs`
// 必須逐值相同。這條護欄轉紅代表把 AI 也算進去了，不是基準該重立。
//
// ★ 兩段式判定（裁定 1C）★ 兩段各有各的消費端，不得互相替代：
//   ① 早訊號（**S 改組織用**）＝承諾 tick（該員 route 的 `startTick`）到了，他還沒
//      「進助跑線」。要早，因為 S 得來得及改給別人；「起跳」那時球都出手了。
//      「進助跑線」只認兩種，不得另立第三種：
//        ⓐ 離自己的 `route.start` 在 `AI.AT_START_M` 內（就位在等，本來就該站那）
//        ⓑ 這一 tick 正朝網推進（`BLOCK_COMMIT.APPROACH_EPS`，＝攔網手判「這個人正在
//           助跑」的同一把尺；玩家面板 `src/input/blockRead.js` 讀的也是它）
//   ② 實際起跳（**信任結算用**）＝AIR 相位期間人真的停在自己那條線的起跳點上
//      （`AI.TAKEOFF_SETTLE_M`＝sim 自己的「到位即停＝原地拔起」判準，不另立尺）。
//      sim 沒有滯空狀態機（game.js「真正的滯空狀態機留給 Phase 2」），所以「起跳」
//      在這一層就是相位＋站位，不是一個 y 座標。
//
// ★ 裁定 1B：零懲罰 ★ 不跑**不扣任何 trust**，只是失去這一波的獎勵資格。
// 因此本函式（含 replanWithoutRunners）**一行 trust 都不寫**——現行 trust 只在
// `applyAttackOutcome` 因得分／失誤變動，這裡不加第二條路。
function applyRouteCommit(game, aiState, excludeIds) {
  if (!excludeIds?.length) return; // ★護欄 C★ AI vs AI 一格不動
  const r = game.rally;
  const team = aiState.landingTeam;
  if (game.phase !== 'rally' || !team || r.possession !== team || r.touches < 1) return;
  if (aiState.approach?.team !== team || !aiState.approach.routes) return;

  // 建帳：壽命同 approach（清空點在 ensureFlightPlan 的死球分支與來球分支）。
  // `team` 不符＝上一波的殘帳（清空點沒蓋到的縫），整份重來
  if (!aiState.routeCommit || aiState.routeCommit.team !== team) {
    aiState.routeCommit = { team, flightId: r.flightId, replanned: false, entries: [] };
    // 新的一波開帳＝上一波的組合獎金候選作廢（清空點之一；另一個在 game.js 死球重置）。
    // 沒有這一行的話：第一波配合者起跳了但被對方救起、第二波換人打並得分，
    // 獎金會發給第一波的人＝跨波誤發
    r.comboAssist = null;
  }
  const ledger = aiState.routeCommit;
  const tick = game.tick;
  const side = TEAM_SIDE[team];

  for (const pid of excludeIds) {
    const route = approachRouteOf(aiState.approach.routes, pid);
    const actor = game.actors[pid];
    if (!route || !actor) continue; // 不在攻擊池＝這一波沒被叫，沒有帳可記
    let e = ledger.entries.find((x) => x.pid === pid);
    if (!e) {
      e = {
        pid, kind: route.kind, tempo: route.tempo,
        startTick: route.startTick, takeoffTick: route.takeoffTick,
        ran: null, jumped: false,
      };
      ledger.entries.push(e);
    }
    // ---- ① 早訊號：承諾 tick 一到就判一次，判完不再改（`ran` 從 null 變成布林）----
    // 用 `>=` 而不是 `===`：規劃點本身可能已經晚於 startTick（一速／二速的起步早於
    // 二傳觸球，而規劃是在一傳完成那一刻才做的），那時第一個看得到的 tick 就是判定時刻。
    // `startTick` 為 null＝錨點算不出來（setTick 預測失效）＝這一波沒有承諾 tick，不判。
    if (e.ran === null && route.startTick != null && tick >= route.startTick) {
      const atStart = Math.hypot(route.start.x - actor.x, route.start.z - actor.z)
        <= AI.AT_START_M;
      const closing = (side * actor.pz) - (side * actor.z) > BLOCK_COMMIT.APPROACH_EPS;
      e.ran = atStart || closing;
    }
    // ---- ② 實際起跳：只記帳，本段零消費端（下一段的組合獎金才會讀）----
    if (!e.jumped && routePhaseAt(route, tick) === ACTION_PHASE.AIR
      && Math.hypot(route.takeoff.x - actor.x, route.takeoff.z - actor.z)
        < AI.TAKEOFF_SETTLE_M) {
      e.jumped = true;
    }
  }

  // ---- 段 4 組合獎金：登記本波的「配合者已起跳」----
  // 段 1 留下的記帳在這裡有了第一個消費端。**只寫不清**（清在上面的開帳處與死球重置）：
  // 起跳這件事發生過就發生過了，之後球飛到對面、possession 一換，上面的守衛就會讓
  // 本函式整個 return——那正是我們要保住這筆登記活到 settlePoint 的那段時間。
  //
  // 規則原話：「**誰帶走牆誰拿**」——得分者拿的是既有的 KILL，不重複賺
  //（trust.js applyComboAssist 另有一道 pid === scorerId 的防守性閘）。
  //
  // ★★ 2026-08-07 覆審 MEDIUM-4(b)（Sawmah 裁定丙：按原意修正，誘餌是誰就給誰）★★
  //   舊碼寫死 `attackCombo.partnerId`。那在 AI 路徑上**恰好等於**誘餌，因為自動排程
  //   （ensureFlightPlan／replanWithoutRunners／applyReplanCall）的 `mainId` 恆等於
  //   `attackerId` ⇒ 兩人裡不是攻擊手的那個就是 partner。
  //   但玩家自己叫的夾塞不改球權（`applyTandemCall` 刻意不動 `attackerId`）⇒ 實測
  //   **73.0%**（159 波裡 116 波、14 局 ±3.5pp；舊註解的「73.9%」是 tick 加權的污染值）
  //   的波 `mainId !== attackerId`：功能上的誘餌是玩家（他跑夾塞線拉牆）、
  //   代碼上的受益者卻是 MB（AI，拿不到 `jumped`）⇒ 語意反了，玩家零回報。
  //   改成依「**這一波誰不是攻擊手**」判定，不寫死欄位名。
  //   ⚠ AI 路徑逐值不變 ⚠ 上面那條恆等式讓兩種寫法在自動排程上同值。
  //   ★ 這件事**不能拿 `tools/sim-hash-probe.mjs` 當證據** ★ 那支跑的是 AI vs AI
  //     （excludeIds 為空）⇒ 護欄 C 第一行就 return、`comboAssist` 根本不會被寫，
  //     雜湊不動是必然的，對這條改動零鑑別力。真正的背書在 `tests/` 的夾塞窗層那一檔
  //     （`tandem-call-` 開頭三檔中帶「窗」的那支）E 組：受控玩家在場、獎金真的發得
  //     出來，逐筆比對受益者是不是 partnerId。
  //     （檔名在此刻意不寫全：`tests/purity.test.mjs` 的 DOM 禁令會掃到那支檔名裡的
  //       瀏覽器全域字樣，寫全會讓純度護欄誤報。）
  //   ⚠ 幅度／加成值一格未動 ⚠ 這是把 bug 改回原設計，不是新規則。
  const combo = aiState.attackCombo;
  // 兩人裡不是本波攻擊手、而且**真的起跳了**的那個。把 `jumped` 併進 find 而不是
  // 先挑人再檢查：組合兩人都不是攻擊手時（球被改給第三人），誰跑了就算誰的。
  const decoyId = combo
    ? [combo.mainId, combo.partnerId].find((pid) => pid && pid !== aiState.attackerId
      && ledger.entries.find((e) => e.pid === pid)?.jumped) ?? null
    : null;
  // ⚠ 受益者只可能是受控玩家 ⚠ 上面的護欄 C 讓 routeCommit 只記 excludeIds，
  // 所以 AI 誘餌永遠沒有 `jumped` 可讀＝拿不到獎金。這是刻意的：AI 隊友「跑不跑」
  // 不是一個決定（見護欄 C 的說明），沒有決定就沒有獎勵的對象。
  if (decoyId) r.comboAssist = { pid: decoyId, team };

  // ---- 裁定 1A：S 當場改組織 ----
  // 窗界＝與路徑甲／乙同一個規劃窗（第二觸窗）。出了窗球已經在飛向攻擊手，
  // 改攻擊手沒有意義；但上面的**記帳**不受此限（起跳發生在二傳觸球之後）。
  if (ledger.replanned || r.touches !== 1) return;
  const skipIds = ledger.entries.filter((e) => e.ran === false).map((e) => e.pid);
  if (!skipIds.length) return;
  replanWithoutRunners(game, aiState, team, skipIds, ledger);
}

// 把 skipIds（判定為「不跑」的受控玩家）從攻擊池拿掉，重選攻擊手、重算組合與助跑線。
// **範式逐項抄 `applyReplanCall`**（那支已經在做同一件事，只是觸發源是 S 的面板指令）：
// 同一顆池的重建方式、同一道「已起跑者不得改線」硬線、同一組寫回欄位。
// 不造第二套重規劃流程——兩套遲早分岔（4.5A 的教訓）。
function replanWithoutRunners(game, aiState, team, skipIds, ledger) {
  const r = game.rally;
  // 一波只改一次：**嘗試即記旗標**。湊不出替代方案（池子空了／新主攻已起跑）時也
  // 不再逐 tick 重試——重試除了燒 CPU 沒有新資訊，輸入下一 tick 不會變。
  ledger.replanned = true;
  const tier = aiState.passTier ?? 'perfect';
  // 池子用**與 ensureFlightPlan 逐字相同的**三個輸入重建（claimId／tier／passReceiverId
  // 都是本波已定案的協調層狀態）⇒ 同一顆池，不另闢真相
  const points = applyRouteKinds(
    attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId),
    {
      flightId: r.flightId, seed: game.seed ?? 0, passTier: tier,
      cutFor: aiState.cutCall ?? null, // 同上：改判重建池時也要沿用玩家的決定
    },
  ).filter((pt) => !skipIds.includes(pt.pid));
  if (!points.length) return; // 池子被掏空＝沒有別人可以改給，維持原案（不跑就不跑）
  const pick = pickAttackPoint(game, team, aiState.claimId, tier, points);
  if (!pick) return;
  const tick = game.tick;
  // 起跑判定必須在覆寫 aiState.approach **之前**取（approachLaunched 讀的就是它）
  const launched = (pid) => approachLaunched(aiState, pid, tick);
  const combo = planCombination(points, pick.pid, {
    team, flightId: r.flightId, seed: game.seed ?? 0, passTier: tier,
    comboScale: game.comboScale ?? 1,
  });
  // ⚠ 已起跑的人不得改線 ⚠ 與 applyReplanCall 同一道硬線、同樣不做「只改沒起跑的
  // 那一個」的半套改判：組合是兩人之間的關係，只改一邊等於兩人跑不同的套路
  if (launched(pick.pid) || (combo && launched(combo.partnerId))) return;
  const prev = aiState.approach.routes;
  const comboPoints = applyComboRoutes(points, combo);
  const routes = approachRoutesFor(team, comboPoints, {
    setTick: aiState.approach.setTick,
    flightId: r.flightId,
    seed: game.seed ?? 0,
    passTier: tier,
    speedOf: (pid) => moveSpeed(game.players[pid]),
    combo,
  }).map((rt) => (launched(rt.pid) ? (prev.find((o) => o.pid === rt.pid) ?? rt) : rt));
  aiState.attackerId = pick.pid;
  aiState.attackCombo = combo;
  // 攻擊線由**寫回後**的池決定（同 ensureFlightPlan／applyReplanCall 的教訓）
  aiState.attackKind = comboPoints.find((pt) => pt.pid === pick.pid)?.kind ?? null;
  // setTick 是本波的時間錨點，改組織不得重算它（重算＝助跑時序整組平移）
  aiState.approach = { team, setTick: aiState.approach.setTick, routes };
  aiState.attackTempo = approachRouteOf(routes, pick.pid)?.tempo ?? 'three';
}

// ---- 個體層 ----

function decideOne(game, aiState, playerId) {
  const tick = game.tick;
  const player = game.players[playerId];
  const actor = game.actors[playerId];
  const team = player.teamId;

  if (game.phase === 'serve') {
    if (playerId === serverId(game.match)) {
      if (tick >= game.serveReadyTick + AI.SERVE_DELAY) {
        // 發球風格（與玩家同一條 sim 路徑）：跳發＝timing>1.1、飄浮＝style 'float'；
        // hash 吃比分＋發球員＋種子——決定論、逐球變化；機率帶：[0,jump)跳、[jump,jump+float)飄
        const { score } = game.match;
        const prof = aiProfileOf(game, team);
        const roll = hash01(score.A * 37 + score.B * 101 + idHash(playerId) + (game.seed ?? 0));
        const jump = roll < prof.jumpServeRate;
        const float = !jump && roll < prof.jumpServeRate + prof.floatServeRate;
        return createIntent({
          playerId, tick, action: 'serve', aim: serveTarget(game, team),
          ...(jump ? { timing: 1.15 } : {}),
          ...(float ? { style: 'float' } : {}),
        });
      }
      return null; // 發球員原地等節奏
    }
    return moveIntent(game, playerId, tick, actor, homePosition(game, team, playerId));
  }

  if (game.phase !== 'rally') return null;
  const r = game.rally;

  // 被呼叫鎖定的接球者（主追或備援第二追球者，同一套邏輯）：
  // 先吃反應延遲（reaction 屬性），再移動到預測落點，球進可及範圍且下墜時出手
  if ((aiState.claimId === playerId || aiState.backupId === playerId) && aiState.landing) {
    if (tick - aiState.planTick < reactionTicks(player)) return null; // 判來球中，尚未起動
    const ball = game.ball;
    const dist = Math.hypot(ball.x - actor.x, ball.z - actor.z);
    // 備援禮讓：主追者本 tick 自己就搆得到（將出手且未倒地）＝備援不搶著觸球，
    // 只跟著壓落點（防同 tick 雙觸把觸球數灌成 2）；主追搆不到時備援才接力出手
    if (aiState.backupId === playerId && aiState.claimId) {
      const pa = game.actors[aiState.claimId];
      const pd = Math.hypot(ball.x - pa.x, ball.z - pa.z);
      // P0：主追構得到與否按主追者的收斂後可及估（aiReachFor），不再用 1.3 基底
      if (pd <= aiReachFor(game.players[aiState.claimId], r.touches) * AI.ATTEMPT_RADIUS
        && tick >= pa.divedUntil) {
        return moveIntent(game, playerId, tick, actor, aiState.landing);
      }
    }
    // 走位深度（只作用於接對方來球的第一觸 receive/dig，不碰舉球/扣球——那是高點打）：
    // 球仍高於接球高度＝有時間走到位，用嚴門檻逼人站到球正下方（到位＝好一傳）；球墜破＝
    // 不能再等，放寬到極限勉強接（沒到位＝接噴，散佈大）。舉球/扣球維持原寬門檻。
    const receivingIncoming = r.touches === 0; // 本波第一觸＝接對方來球（receive/dig）
    let inReach;
    if (receivingIncoming) {
      // 接球帶內（1.35±0.3）用嚴門檻抓「人到位觸球」（人瞄接觸點、球墜到頭頂＝dist 小＝
      // 好一傳）；墜破帶下緣＝來不及，寬門檻保底勉強接（沒到位＝接噴，散佈大）
      const inBand = ball.y <= AI.RECV_CONTACT_Y + AI.RECV_BAND;
      const belowBand = ball.y < AI.RECV_CONTACT_Y - AI.RECV_BAND;
      // P0：寬門檻（勉強接保底）基底改吃 aiReachFor——寬過真實可及＝停步空揮；
      // 嚴門檻（CLOSE 0.585）本就窄於收斂後接球可及，維持原樣＝逼到位的語意不動
      inReach = inBand && ball.vy < 0 && (belowBand
        ? dist <= aiReachFor(player, r.touches) * AI.ATTEMPT_RADIUS
        : dist <= TUNING.REACH_RADIUS * AI.CLOSE_RADIUS);
    } else {
      inReach = dist <= aiReachFor(player, r.touches) * AI.ATTEMPT_RADIUS && ball.vy < 0;
    }
    if (inReach) {
      const [action, aim, tOverride] = chooseTouch(game, aiState, player, actor);
      // §5 A3：跳舉只抬高「這一觸的高度上緣」（jumpSet 由 ensureFlightPlan 決定論抽選）。
      // AI 這一側的門檻與 sim 的 game.js:maxY 必須是同一個值，否則 AI 會送出
      // sim 當場駁回的 Intent（一次白等、下一 tick 才補上）——兩處各留註解互指
      // ★ S2 退路（2026-07-30 Sawmah 拍板，零新常數）：跳舉的意義＝比站舉更早更高觸球；
      // 球一旦墜入站舉可及上緣（touchCeiling 站舉值＝standingReach+0.35，既有量）之下，
      // 跳舉買不到任何東西，真實二傳會直接站舉處理。修前實測（t=0.5，6 局）：抽中跳舉
      // 的窗 47.7% 整窗無舉球、~72 顆球在二傳腳邊落地失分——高手點（spikeReach）＋縮小
      // 的可及對低球永遠構不到，而 AI 沒有退路、對著下墜的球逐 tick 送跳舉意圖到死。
      const jumpSet = action === 'set' && !!aiState.jumpSet
        && ball.y > touchCeiling(player, 'set', false);
      if (action && ball.y <= touchCeiling(player, action, jumpSet)) {
        // AI 觸球品質基準 0.75（玩家 Perfect＝1.0 才有超越空間）；快攻舉球帶 t<0.5（低弧）
        let timing = tOverride ?? (action === 'spike' ? 1 : 0.75);
        // W3 L（附錄 A1）：收縮指令讀對且球到 L 手上＝Perfect 窗——機制屬於指令本身，
        // AI 代打（治具上下限臂）與真人走同一條規則（真人路徑在 matchControls 鏡像）
        if (action === 'receive' && r.touches === 0 && player.currentRole === 'libero'
          && digBiasCorrectFor(game, aiState, team)) {
          timing = 1.0;
        }
        // ★ 2026-08-04 治具保真度量測臂（`AI.PLAYER_PERFECT_RECV`，預設 0＝零行為改動）★
        // 為什麼需要它：治具用 AI 代打主角，接球 timing 恆 0.75、**結構上拿不到 Perfect**；
        // 但真人幾乎**無條件**拿得到——`matchControls.js` 的 perfect 判定門檻是
        // `REACH_RADIUS × 1.1 = 1.43m`，而觸球本身要求 dist ≤ 收斂後的接球可及 0.665m
        // ⇒ **觸球一旦發生，那個 near 必然為真**（稽核 08-03 存疑項，08-04 覆核成立）。
        // Perfect 讓散佈乘數變成 `PERFECT_RECV_ACC = 0.5`（減半）⇒ 這是真人相對治具的
        // **系統性優勢**，而難度重校卷的所有錨都是為真人定的。
        // ⇒ 開這個臂＝量「治具低估真人多少」，那是把治具數字換算成真人難度的橋。
        if (action === 'receive' && playerId === 'A2' && (AI.PLAYER_PERFECT_RECV ?? 0) > 0) {
          timing = 1.0;
        }
        // Q4 資料層：這一擊若是「協調層選定的攻擊手」扣球，帶上已定案的路線種類
        // （純記帳、零判定語意）。用 attackerId 比對而非單看 action==='spike'——
        // S 二次球（setterDump）也是 action==='spike' 但攻擊手是 S 本人，
        // aiState.attackKind 那時掛的是本來要舉給誰的舊值，比對不上就不記
        const routeKind = action === 'spike' && aiState.attackerId === playerId
          ? aiState.attackKind : null;
        return createIntent({ playerId, tick, action, aim, timing, jump: jumpSet, routeKind });
      }
    }
    // AI 魚躍救球（接噴救球／方案A 全隊 AI 魚躍）：正常站立搆不到、但魚躍可及範圍內
    // 的低球，以 diveRate 機率撲救（對手 opponents 分級／我方綁玩家解鎖）。
    // 接噴補完（07-23 拍板）：不再限對方來球（touches===0）——隊友噴掉的一傳/二傳
    // （touches 1/2 的亂飛低球）主追與備援一樣可撲；第三觸撲救目標改過網安全球
    // （撲回自家二傳點＝白送第 4 擊犯規）。
    // roll 吃 flightId＝一個 flight 只決定一次（撲/不撲固定，非每 tick 骰）；倒地 42tick
    // 代價＋diveRate<1 是「球不落地不結束」與「rally 不爆長」的平衡閘
    // ★ 2026-08-03 收斂殘留清算（難度重校卷 題 C，Sawmah 拍板「全部併入、排在調參之前」）★
    // 這兩條閘原本寫死 `TUNING.REACH_RADIUS`(1.3)＝**基準 A 的舊值**。`CONVERGE_T` 已收斂到
    // 1.0（`constants.js:41`），真實可及改由 `reachRadiusFor` 決定 ⇒ 兩端都與實情脫鉤：
    //   ・**下界** 1.3 遠寬於真實接球可及（0.38×身高≈0.665）⇒ (0.77, 1.30] 這段
    //     「站著搆不到、又不觸發魚躍」＝**放生帶**（實測 2.94% 的防守低球窗無人處理）
    //   ・**上界** 1.3×DIVE_REACH_MUL=2.34 遠於真實魚躍可及 2.0（`DIVE_REACH_TARGET_M`）
    //     ⇒ 撲了搆不到＝**撲空**（實測 27.69%，`CONVERGE_T=0` 對照僅 0.88%），
    //     每次代價 42 tick 倒地＋體力。**上界的量級是下界的約 6 倍**。
    // P0 對齊修當時明文「嚴門檻與魚躍閘不動」（`phase5-section10-convergence.md:808`）
    // ⇒ 這是**已知債**、不是遺漏；本卷把它還掉。
    // 兩者方向相反（補下界讓 rally 變長、補上界讓它變短）⇒ **必須一起改**，分開做會各自
    // 把難度推向一邊。裁決書＝`docs/kickoffs/dive-gap-verdict.md`。
    // ★ 對抗審查 MEDIUM-5 修正 ★ 下界一度寫成 `aiReachFor(player, r.touches)`＝
    // 依觸數取 RECEIVE/SET/SPIKE。**錯的**：本閘的前提是 `ball.y ≤ DIVE_MAX_Y`(1.15)，
    // 而 SET 手點在 1.03H(1.80m)、SPIKE 手點在 spikeReach(2.92m)——那種高度的可及體
    // 根本罩不到 1.15m 以下的球（實測第三觸低球 sim 端「任何水平距離都搆不到」）。
    // 且 `chooseTouch` 對低球一律回 `'receive'`（本檔函式尾端的 fallback）
    // ⇒ 真正生效的是 RECEIVE 可及體，下界就必須用 RECEIVE 半徑。
    if (ball.vy < 0 && ball.y <= TUNING.DIVE_MAX_Y
      && dist > reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, player?.height?.current ?? null)
      && dist <= reachRadiusFor(REACH_ACTION.DIVE, TUNING, player?.height?.current ?? null)
      && game.tick >= actor.divedUntil
      && (player.techniques?.dive ?? 1) >= 1) {
      const { diveRate } = aiProfileOf(game, team);
      // 救噴（自家持球中的亂球）不擲骰——最後希望，不撲＝必失分，真實球員一定撲；
      // 接對方來球維持 diveRate 節流（rally 長度平衡閘）。探針實測擲骰版救噴 0 次
      // （窗口僅最後 0.15s、再被 roll 過濾 84%＝實戰不可能出現）
      const rescue = r.possession === team && r.touches >= 1;
      const roll = hash01(game.rally.flightId * 613 + idHash(playerId) + (game.seed ?? 0));
      if (rescue || roll < diveRate) {
        const aim = r.touches === 2
          ? localToWorld(otherTeam(team), 0, 6.5) // 第三觸：撲過網（安全球深區）
          : localToWorld(team, AI.SETTER_SPOT.lx, AI.SETTER_SPOT.lz);
        return createIntent({ playerId, tick, action: 'dive', aim, timing: 0.5 });
      }
    }
    // 一氣呵成助跑（Sawmah 07-23：攻擊手不提早到網前罰站）：計畫攻擊（第三擊且我＝
    // 選定攻擊手）時，球墜到扣球窗還久（跑得到＋APPROACH_LEAD 餘裕）就留在職責位
    // （助跑起點），進窗才全速衝——助跑→引臂→起跳→揮擊連續。快攻低弧（airtime 短）
    // 與遠距補位（runTicks 大）自然不觸發＝照舊直衝，不影響能不能打到球
    // §4 A1 例外：一速／二速的人在二傳觸球前就已經跨過起跑點了（見下方助跑分支），
    // 這時再叫他「等」＝倒著跑回助跑起點。**只跳過「等」這一段**，下面的起跳點
    // 分支（4.7 兩次勝率 0% 換來的禁區）一個字未動。三速維持原行為
    if (r.touches === 2 && aiState.attackerId === playerId
      && aiState.hitPoint?.ticks && !inReach
      && !approachLaunched(aiState, playerId, tick)) {
      const ticksLeft = aiState.hitPoint.ticks - (tick - aiState.planTick);
      const gap = Math.hypot(aiState.hitPoint.x - actor.x, aiState.hitPoint.z - actor.z);
      const runTicks = Math.max(0, gap - 0.4) / (moveSpeed(player) * SIM_DT);
      if (ticksLeft > runTicks + AI.APPROACH_LEAD) {
        // §2-3 第 3 段「等待姿勢」：在**自己那條線的助跑起點**站定等二傳，
        // 不是回全隊共用的職責槽（回職責槽＝剛拉開又往網走 0.6m，白跑一趟）
        const wait = (aiState.approach?.team === team
          ? approachStartOf(aiState.approach.routes, playerId) : null)
          ?? dutyPosition(game, team, playerId);
        return moveIntent(game, playerId, tick, actor, wait);
      }
    }
    // 攻擊手根運動（07-28 Sawmah 拍板，工單 §1「位移驅動動作 → 動作驅動位移」）：
    // 走位目標＝**起跳點**（擊球點往自家後場退一段），不是擊球點本身；進入滯空窗
    // （TAKEOFF_LOOKBACK_TICKS＝sim 自己判踏線違例用的同一個回溯窗）後**停止水平
    // 移動＝原地拔起**。原本是「邊跑邊到擊球點」，起跳那刻人還在 1.89m 外、靠空中
    // 飄過去（真人前排只有 0.3-0.5m）。
    // 前後排退不同距離＝真實排球：前排幾乎垂直拔起；後排在三米線後起跳、往前上方
    // 衝進去打（舉球點本就送到線後——setAimFor pipe lz=3.6 vs 前排 1.0-1.3）
    if (r.touches === 2 && aiState.attackerId === playerId && aiState.hitPoint) {
      // 起跳點＝**擊球點**（球墜到扣球窗上緣 SPIKE_APPROACH_Y 的水平位置＝hitPoint）
      // 往自家後場退一段。不可用 landing——那是球「落地」的點，球飛到那裡時高度
      // 已近 0、早就扣不了（治具實證：用 landing 當基準＝殺球 1.42→0.19）。
      // 停止條件用**到位**不用時間：時間條件（ticksToHit≤24）會在人還在半路時就
      // 叫停，一樣打不到（治具實證：勝率 0%）。到位才停＝原地拔起；沒到位照跑，
      // 不會比原本更差
      const back = isBackRow(game.match.rotations[team], playerId)
        ? AI.TAKEOFF_BACK_M : AI.TAKEOFF_FRONT_M;
      const spot = {
        x: aiState.hitPoint.x,
        z: aiState.hitPoint.z + TEAM_SIDE[team] * back,
      };
      const gap = Math.hypot(spot.x - actor.x, spot.z - actor.z);
      if (gap < AI.TAKEOFF_SETTLE_M) {
        return moveIntent(game, playerId, tick, actor, { x: actor.x, z: actor.z }); // 原地拔起
      }
      return moveIntent(game, playerId, tick, actor, spot);
    }
    // 站位：接來球瞄接觸點（球會被接到的水平位置＝人站球正下方，走位深度）；第二觸
    // （二傳）P1-B 起瞄站舉手點高度的接觸點；扣球維持瞄地板落點。
    // 下游微偏＝觸球點在身前、面向來球（真實接球站位）
    const target = (receivingIncoming && aiState.contactPoint) ? aiState.contactPoint
      : (r.touches === 1 && aiState.setContactPoint) ? aiState.setContactPoint
        : aiState.landing;
    const sp = Math.hypot(ball.vx, ball.vz);
    const off = sp > 0.5 ? 0.2 : 0;
    return moveIntent(game, playerId, tick, actor, {
      x: target.x + (off ? (ball.vx / sp) * off : 0),
      z: target.z + (off ? (ball.vz / sp) * off : 0),
    });
  }

  // 攔網手（職責制）：MB＝攔網軸正對球、近側翼組雙人攔網、遠側翼撤退補吊球
  // 例外：來球是發球/高球（非扣球）飛向我方＝接發局面，前排不貼網、去跑站位交換
  const opponentHasBall = r.possession && r.possession !== team;
  const receivingArc = aiState.landingTeam === team && r.profile !== 'spike';
  if (opponentHasBall && !receivingArc &&
      isFrontRow(game.match.rotations[team], playerId)) {
    // 換位制攔網線：OH 恆左翼、MB 恆軸（追球）、OPP/前排 S 恆右翼——
    // 角色定線保證三線互斥，任何輪轉都不疊人（前排恆為三對角各一）
    const role = player.currentRole;
    const lane = role === 'middle' ? 0 : role === 'outside' ? -1 : 1;
    const laneOff = TEAM_SIDE[team] * lane * AI.BLOCK_SPREAD;
    // W4(P4) 附錄 B-1：L 配套的攔網手站線（blockScheme——digBias 同一指令的前排半）。
    // 'off'（攔手讓開・收吊球）＝前排退攻擊線一帶補吊球、不開攔網窗（賭吊球的語意）；
    // 站線幾何自然改變攔網涵蓋——攔網數值零特例
    // ★ 2026-08-03 Sawmah 裁定乙：**現場執行者說了算** ★
    // 牆是攔網手在砌，往哪封該由他決定；L 的配套退成**後備**（他沒下就照 L 的）。
    // 這反轉了 W4(P4) 附錄 B-1「一個指令同時驅動牆與地板」那條 4-1 拍板 A——
    // 反轉理由＝實測（tools/block-timing-oracle-probe.mjs）證明攔網按鈕問「何時跳」
    // 在時機軸上沒有可贏的區間（連開天眼都只有 +0.82pp／0.44 SE），
    // 而橫向維度 |A2.x − ball.x| 全臂 p50 都是 0.69–0.75、完全沒被那顆按鈕碰過。
    // ⚠ 目前只有**玩家**攔網手寫得出 blockCall；AI 攔網手仍照 L 的配套走
    //   ⇒ AI 對局逐值不變（sim-hash 可證）。AI 自己決定封線屬後續另量。
    const scheme = (aiState.blockCall?.team === team ? aiState.blockCall.line : undefined)
      ?? (aiState.digBias?.team === team ? aiState.digBias.block : undefined);
    // ==== B1-SCAN-BEGIN（工單 §6 反作弊掃描區：本區內不得出現 attackerId）====
    // §十-2 三段狀態機的錨點。**本分支自此以下零 `game.ball.x`**（工單 §11-5 可 grep 驗）：
    // 改制前這裡是 `clampCourtX(game.ball.x + laneOff)`——攔網手逐 tick 直接追球的 x，
    // 而球最後會飛到攻擊手手上，等於用未來的答案本身當導航。
    //   planX == null ＝【讀】還沒被允許做決定 → 錨在場地中軸（陣型基準位）
    //   planX != null ＝【判／關】已選定攻擊手 → 錨在他身上
    const planX = blockPlanTargetX(game, aiState, team, playerId, player, actor, tick);
    const anchorX = planX ?? 0;
    // ==== B1-SCAN-END ====
    if (scheme === 'off') {
      return moveIntent(game, playerId, tick, actor, {
        x: clampCourtX(anchorX * 0.4 + laneOff), z: TEAM_SIDE[team] * 2.6,
      });
    }
    // 遠側翼（攻擊點在對側且離中線夠遠）＝不參與攔網、退防補吊球。
    // 讀期 anchorX＝0 ⇒ 三人都先留在牆上，決定之後遠側翼才撤——這正是「判斷發生前
    // 不該知道要往哪邊撤」的誠實形狀。
    // 退防點改吃 blockCoverSpot（攔網分工卷 step2a）：原本寫死的 x = laneOff*2 = ±3.0
    // 離吊球落點 p50 4.33m、≤2m 只有 15.0%＝站在那裡碰不到吊球，見該函式檔頭。
    if (blockFarWing(game, team, playerId, anchorX)) {
      return moveIntent(game, playerId, tick, actor, blockCoverSpot(team, anchorX));
    }
    let nx;
    if (planX == null) {
      // 【讀】判定還沒發生 ⇒ 陣型基準位，沿用既有的固定分工間距。
      // **這一段刻意不合牆**：還不知道要攔誰就先併肩，等於用未來的答案站位。
      //
      // 邊線夾擠防疊（真實合牆：翼守標誌桿、MB 收內側肩並牆）——
      // 翼吃 clamp 貼邊即可；MB 發現近側翼被邊線壓進間距內時自己往內讓。
      // 兩人各自從同樣輸入算出一致結論（純函式無共享狀態），且讓位方向恆向內＝永不交叉
      nx = clampCourtX(anchorX + laneOff);
      if (lane === 0) {
        // ⚠ 2026-08-04（稽核 08-03 B2）：**這段在現行設計下不可達，但不是死碼**。
        // 本分支的前提就是 `planX == null`（讀期），而讀期的 `anchorX` 恆為 0
        // ——上方註解明文「錨在場地中軸」⇒ `Math.sign(0) === 0` ⇒ 下面的 `bs !== 0` 恆假。
        // 讀期站在中軸上，結構上不可能發生邊線夾擠，所以這裡本來就沒事做。
        // 留著是為了「讀期錨點哪天改成非中軸」的那一天——屆時夾擠會真的發生。
        const bs = Math.sign(anchorX);
        const nearWingX = clampCourtX(anchorX + bs * AI.BLOCK_SPREAD);
        if (bs !== 0 && Math.abs(nearWingX - nx) < AI.BLOCK_SPREAD * 0.9) {
          nx = nearWingX - bs * AI.BLOCK_SPREAD;
        }
      }
    } else {
      // 【判／關】§3 階段三：關牆——站距由幾何長出來（見 blockWallSlots 的檔頭說明）
      // step2c：把**已鎖存的回落決定**餵給佈局，讓「牆上有誰」與「誰佔哪一格」同一個集合
      // ——不餵的話，退場者漂到補吊球點（中路）會把自己插進兩名留牆者中間的那一格，
      // 牆就開一個 0.55m 的洞（見該函式檔頭 step2c 段）。
      // 直接讀 `byPid`：`blockPlanFor` 會為不存在的 pid 建格並改寫 `latest`，查詢不得有副作用。
      const wallPlan = aiState.blockPlan && aiState.blockPlan.team === team
        ? aiState.blockPlan : null;
      const slot = blockWallSlots(game, team, anchorX,
        wallPlan ? (pid) => wallPlan.byPid[pid]?.cover : null)?.[playerId];
      if (!slot) return moveIntent(game, playerId, tick, actor, dutyPosition(game, team, playerId));
      // ★ 攔網分工卷 step2a（Sawmah 2026-07-31 裁定題 2）：單一攻擊點**最多 2 人上牆** ★
      // 留牆的是離 anchorX 最近的兩人（tier 0 主攔／1 輔攔），最遠的那人（tier 2）
      // **無條件**回落補吊球——這是分工，不是「趕不到才退」的時間預算。
      // 依據＝開卷補量的 cap2b 反事實臂（brief §1.2）：拿掉第三人，攻方得分率
      // −5.46pp ± 1.77（顯著），而被攔死率 −0.05pp ± 0.61（分不出）
      // ⇒ 第三人在牆上零貢獻，防守的增益全部來自「地板多一個人」。
      // 本條同時取代舊的 `wallBail`（close 預算退路）：tier 2 現在恆退，那條預算永遠問不到。
      //
      // ★ 算一次就鎖存 ★ 沿用舊 `wallBail` 記下來的教訓（原註解：「逐 tick 重算會出事」），
      // 而且新的 tier 定義讓它變成**必要條件**：tier 吃的是**當下的 x**，而退防點在橫向上
      // 也會動 ⇒ 第三人一往中路退，他離 anchorX 就變近、下一 tick 又被排成 tier 0/1、
      // 於是回牆上跳（實測未鎖存時曜石快攻三人在窗率 77.7% → **83.5%＝更糟**，
      // 雖然 AI 側同時要求攔網的人數已經是 0.0%——他是在 48 tick 的窗尾巴裡跳的）。
      // 決定在「判」的那一刻下，之後不再反覆。`cover` 與舊 `wallBail` 同樣**不進**
      // BLOCK_PLAN_CARRY：它是每人各自一格的判斷結果，同步過來會變成別人的決定。
      // 卷六：這裡也會替不存在的 pid **建格**（比 blockPlanTargetX 先跑到就由它建）⇒
      // 求值器一樣要傳，否則被這條路搶先建格的攔網手會靜默拿回團隊級 x、分歧當場消失。
      const cp = aiState.blockPlan
        ? blockPlanFor(aiState.blockPlan, playerId, blockAimResolver(game, aiState, team)) : null;
      if (cp && cp.cover === undefined) cp.cover = slot.tier >= 2;
      if (cp ? cp.cover : slot.tier >= 2) {
        return moveIntent(game, playerId, tick, actor, blockCoverSpot(team, anchorX));
      }
      nx = slot.x;
    }
    // 封線站位（B-1）：封直線＝往邊線側壓（守直線走廊外肩）、封斜線＝往內收（斜線角度）
    // 封線偏移的方向同樣錨在判定結果上，不看球現在在哪（讀期 anchorX＝0 ⇒ 退化為 +1 側，
    // 與改制前球在中線時的行為一致）
    if (scheme === 'line') {
      nx = clampCourtX(nx + Math.sign(anchorX || 1) * AI.BLOCK_SCHEME_SHIFT);
    } else if (scheme === 'cross') {
      nx = clampCourtX(nx - Math.sign(anchorX || 1) * AI.BLOCK_SCHEME_SHIFT);
    }
    const netSpot = { x: nx, z: TEAM_SIDE[team] * AI.BLOCK_LZ };
    // §十-2【關／踩定】：**決定了才起跳**。改制前起跳只看 `profile === 'spike'`，
    // 與判斷完全脫鉤——於是 read 明明晚了 10–25 tick 才知道要攔誰，卻照樣準時拔起來，
    // 兩種人格的代價根本無從體現。現在起跳窗掛在判定上：判得晚就跳得晚，
    // 球到的時候手還在上升（blockTimingMul 的 BLOCK_LATE_MUL 檔）。
    // 這就是 read 面對快攻的賭注真正輸掉的地方（憲法 §零：read 難在時間不在資訊）。
    // §十-2【關／踩定】：**決定了、跟到了、他拔起來了，我才拔**（見 blockPlanAirborne）。
    // 原本的 `r.profile === 'spike' && aiState.landingTeam === team` 兩個條件都要等
    // 球已經被打過來才成立＝對扣球事件零延遲反應，那正是十-2 指名的病。兩個一起拆：
    // 只留 landingTeam 也是同一個時點（球過網那一刻兩者一起翻），拆一個等於沒拆。
    // 「不會亂跳」由狀態機保證：blockPlan 只在對方持球時才建得起來（見 blockPlanTargetX
    // 開頭的 `atkTeam === team` 早退），所以自家進攻時窗恆不開。
    const action = blockPlanAirborne(aiState, team, tick, playerId) ? 'block' : null;
    const it = moveIntent(game, playerId, tick, actor, netSpot);
    if (action) {
      it.action = 'block';
      // §十-4b：手態隨 intent 帶進 sim（game.js 窗開時定格到 actor.blockHand）
      const plan = aiState.blockPlan;
      const c = plan && plan.team === team ? plan.byPid[playerId] : null;
      it.hand = (c ? c.hand : null) ?? 'vertical';
    }
    return it;
  }

  // Dig 收縮（防守陣型 v0）：對方組織/起扣時，後排向球側收縮就防守位。
  // W3 L 玩法（附錄 A1）：aiState.digBias＝玩家（L）下的收縮指令——整個後排陣型
  // 吃同一指令（玩家自身站位由輸入層用同一 digTargetFor 帶動）
  if (opponentHasBall && !receivingArc &&
      !isFrontRow(game.match.rotations[team], playerId)) {
    // C2 優先序（拍板）：L 面板下的**明確指令**優先於身體站位推論；
    // 玩家不是 L（沒有面板可下指令）時才吃前排隊友站位的推論值
    const explicit = aiState.digBias?.team === team ? aiState.digBias.choice : null;
    const read = aiState.blockRead?.team === team ? aiState.blockRead.dig : null;
    const bias = explicit ?? read;
    return moveIntent(game, playerId, tick, actor, digTargetFor(game, team, playerId, bias));
  }

  // 舉球員插上：我方接球階段（來球未觸），S 先跑到網前右側舉球點就位（前後排皆然）。
  // P1-A（2026-07-30 補償階段拍板）：插上點對齊一傳名目落點 AI.SETTER_SPOT——
  // 原 lx=2.2 與一傳瞄的 1.2 差 1.0m＝每球先欠 12–21 tick 的走位債（跳舉退站舉主因）；
  // 「perfect＝二傳不用移動就能舉」的語意自此在站位上成立
  if (player.currentRole === 'setter' && r.possession !== team &&
      aiState.landingTeam === team && !aiState.letDrop) {
    return moveIntent(game, playerId, tick, actor,
      localToWorld(team, AI.SETTER_SPOT.lx, AI.SETTER_SPOT.lz));
  }

  // Transition 拉開（§2-2）＋節奏三層（§4 A1）：我方一擊完成的瞬間，**每一名**
  // 合法攻擊手轉身跑向自己那條線的助跑起點（MB 貼網等快攻／兩翼四步外／後排最遠），
  // 然後**各自照自己的節奏起跑**：一速在二傳觸球前就到起跳點、二速幾乎同時、
  // 三速等二傳觸球才起步。攔網手要讀的就是這組「誰跑哪條線、誰什麼時候起步」。
  // 未被選中者一樣跑完假動作路線、到位拔起、收勢窗過了才落回 cover／職責位
  //（全程走 moveIntent＝單 tick 位移受步長上限約束，不可能瞬間切回原位）。
  // 只在我方持球且已完成第一擊時生效——接發（touches===0）與防守站位一格不動。
  // **只有「正在跑」這一段排在 cover 之前**：跑到一半被掩護位拉走就是瞬間收勢。
  // 還沒起步的人維持本輪之前的優先序（cover 優先，見下方等待段）
  //
  // ==== COMBO-SCAN-BEGIN（組合攻擊卷 段 B 護欄 1：本區內不得出現 attackCombo／partnerId）====
  // ★ 誘餌必須維持湧現式 ★ 上位裁定書明訂 sim 內**沒有誘餌旗標**：池內每個 point 都拿到
  // 完整 route，未被選中者照樣把整條線跑完——「他在騙人」是攔網手讀出來的結果，
  // 不是 sim 標記出來的事實。而 `aiState.attackCombo.partnerId` 語意上非常接近誘餌旗標
  // （「這個人是本波的配合者」），一旦走位分支讀它，誘餌就從湧現變成內建屬性。
  // 掃描區涵蓋走位的三段（助跑中／cover／等起步）——它們是唯一會因為「知道自己是誘餌」
  // 而改變行為的地方。範式抄 block-persona.test.mjs 的 B1-SCAN。
  const running = approachRunOf(aiState, playerId, tick, team, r);
  if (running) {
    const gap = Math.hypot(running.takeoff.x - actor.x, running.takeoff.z - actor.z);
    // 到位即停＝原地拔起（與被選中者的起跳停止條件同一把尺，不另立標準）
    if (gap < AI.TAKEOFF_SETTLE_M) {
      return moveIntent(game, playerId, tick, actor, { x: actor.x, z: actor.z });
    }
    return moveIntent(game, playerId, tick, actor, running.takeoff);
  }

  // Cover（攻擊掩護）：我方攻擊起跳/出手階段，非攻擊手就掩護位——
  // 二傳下墜（攻擊者進入起跳流程）起動、扣球飛行中維持（等攔回彈）
  if (r.possession === team && aiState.attackerId && aiState.attackerId !== playerId &&
      ((r.touches === 2 && game.ball.vy < 0) ||
        (r.touches === 3 && r.profile === 'spike'))) {
    return moveIntent(
      game, playerId, tick, actor, coverPosition(game, team, playerId, aiState.attackerId),
    );
  }

  // Transition 拉開（Phase 5 W1 §2-2）＋§2-3 等待姿勢：我方一擊完成的瞬間，
  // **每一名**合法攻擊手轉身跑向自己那條線的助跑起點（MB 貼網等快攻／兩翼四步外／
  // 後排最遠），不再全前排擠同一個 lz=3.0 槽位。這是攔網手要讀的第一組線索。
  // §4 之後這一段只服務「還沒到起步 tick」的人——起步後改吃上面的助跑段、
  // 收勢窗過了則落到下面的職責位（不再倒著跑回起點＝自然收勢）。
  // startTick 為 null（二傳觸球時刻預測失效）＝退回本輪之前的行為：一路站在起點
  if (r.possession === team && r.touches >= 1 && aiState.approach?.team === team) {
    const route = approachRouteOf(aiState.approach.routes, playerId);
    // §9 契約的 wait 段（含 startTick 為 null＝錨點算不出來 ⇒ 停在第一段）
    if (route && routePhaseAt(route, tick) === ACTION_PHASE.WAIT) {
      return moveIntent(game, playerId, tick, actor, route.start);
    }
  }
  // ==== COMBO-SCAN-END ====

  // 其餘人待命：rally 中跑職責位（前排站位交換）、非 rally 回輪轉基準位
  return moveIntent(game, playerId, tick, actor, dutyPosition(game, team, playerId));
}

// ==== B1-SCAN-BEGIN（工單 §6 反作弊掃描區：本區內不得出現 attackerId）====
//
// §十-2 攔網三段狀態機（狀態＝aiState.blockPlan，與本波攻擊同壽命）。
//
// ★ 改制前的病根 ★
// read 人格根本沒有「決策」這回事：攔網手的目標 x 是 `clampCourtX(ball.x + laneOff)`，
// 逐 tick 直接吃球的 x——不吃攻擊手、不吃過網點。而球最後**會飛到攻擊手手上**，
// 所以那等於**用未來的答案本身當導航**。沒有決策，就沒有事件可以起算反應延遲，
// 於是 reactionTicks 在攔網分支從來沒被呼叫過。
//
// ★ 現在的三段 ★
//   【讀】 陣型基準位（只吃 laneOff，**不吃 ball.x**）——還沒得到允許做決定
//   【判】 起算事件＝**二傳觸球**（不是攻擊手起跳：快攻在二傳觸球前就已離地，
//          W1 實測 100%）＋ 反應延遲後選定一名攻擊手，目標 x 由他導出
//   【關】 移動到該 x、時機到起跳；空中不得橫移；改判要付重新踩定的 tick 代價
//
// ★ 兩種人格共用同一條路，只有「何時允許做決定」不同（decisionUnlockedAt）★
//   read   ＝二傳觸球 ＋ 自己的反應延遲 → 面對快攻必然來不及（這就是它的賭注）
//   commit ＝二傳觸球**之前**（辨識到助跑就動） → 賭「猜對是誰」，猜錯就在錯的地方
//   延遲沿用接球手的 `reactionTicks`，**不另立常數**；AI 不額外加罰（工單 §2.4-d）。
//
// 位移一律走 moveIntent（單 tick 受步長上限約束）＝結構上不可能瞬移補位。
// 回傳 null＝本 tick 還沒有決定，呼叫端用陣型基準位。

// 何時允許做決定。回傳 true＝已解鎖（可以呼叫 blockCommitRead 選人）。
// ★ 這是兩種人格**唯一**的差異點 ★
function blockDecisionUnlocked(game, aiState, persona, player, tick) {
  const r = game.rally;
  if (persona === BLOCK_PERSONA.COMMIT) {
    // commit：二傳觸球之前就動（球還沒離手＝ touches < 2）
    return r.touches < 2;
  }
  // read：等二傳真的觸到球，再加上自己的反應時間才解鎖
  const st = aiState.setTouch;
  if (!st || st.team !== r.possession) return false;
  return tick >= st.tick + reactionTicks(player);
}

// ★★ 攔網時序卷 段 2（Sawmah 2026-08-01 裁定 2＋5：commit 人格重寫）★★
//
// commit 的招牌從「牆很黏」改為「**賭對就死**」。舊路（`blockCommitRead` 猜助跑）
// 的病灶是**看得太窄**：只認 `lz ≤ DEPTH_LZ(2.9)` 的候選，而兩翼助跑起點 lz 3.58
// ⇒ 偵測範圍內唯一看得到的人恆是中路誘餌，實測 43.1% 的賭注是「盲賭中路」
// （沒鎖任何人），牆首手 x 的 p50 恆為 0.000。
//
// 新的賭注方向＝**讀二傳的配分傾向**。三個訊號源（裁定 5 原文）：
//   ① 攻擊池 trust 權重  ——`pickAttackPoint` 決定給誰時用的同一把尺
//   ② 一傳品質戰術分支  ——`attackPointsOf` 天然吃 `passTier`：到位才有快攻、
//                          勉強只剩兩翼高球 ⇒ 池子本身就是「這球他有哪些選擇」
//   ③ **本場配分歷史**  ——`scoutTally[pid].spikes`：這一場他已經給過誰幾次
//
// ★ 反作弊界線：讀**傾向**不是讀**答案** ★
//   本函式拿不到、也沒有任何管道拿到「這一球二傳最後選了誰」——參數只有 game
//   與攻方隊伍代號，且整段在 B1-SCAN 掃描區內（靜態掃描把關）。
//   ③ 是純粹的可觀察量（球真的被打去哪，全場都看見了）；① 是同一件事的隱藏半邊，
//   語意＝「情蒐知道這隊誰是主砲」，與既有的 `scoutBlockMul`（守方讀攻方慣用線）
//   同一個授權層級——它描述的是**這支隊伍的習慣**，不是這一球的結果。
//
// ★ 局內記帳約束（裁定 5 明文）★ 記憶範圍**限本場**：`scoutTally` 住在 `state` 上、
//   隨 `createGame` 重生，sim 拿不到也不認識屆數（`SEASON-SCAN` 靜態掃描釘死）。
//
// ★ 副產物（測試覆蓋）★ 二傳玩家可藉刻意打破配分習慣反制 commit——③ 一變，
//   argmax 就跟著換人。
//
// 回傳 `{ x, lx, kind }`（他**自己的賭注**落在誰身上，不是這球的答案）或 null。
// `kind` 對外只有探針／測試在讀（要量「賭中率」得知道他賭了誰）——回傳自己的賭注
// 不構成洩漏：本函式與呼叫端都不知道這球真的會給誰。
//
// ★★ 卷六（2026-08-02 裁定 0＋2）：`opts.blockerId` ＝**這名攔網手自己的 pid** ★★
// 憲法 §2.2 之「選定一名攻擊手」讀作**每名攔網手各自執行**，所以賭注是逐人一份的。
// 反作弊界線**沒有放寬**：守方攔網手知道自己是誰，不是作弊資訊；本函式禁的一直都是
// **攻方** pid（那才等於讀答案），下面那道入參檢查就是這條界線的機械執行。
export function blockSetterTendency(game, atkTeam, opts = {}) {
  const rot = game.match.rotations?.[atkTeam];
  if (!rot?.length) return null;
  // ★ 反作弊入參檢查（卷六）★ `blockerId` 只准是守方的人。餵進攻方名冊裡的 pid＝
  // 呼叫端手上有「這一球誰要扣」的資訊，那是讀答案不是讀傾向——直接炸掉，不靜默容忍。
  const blockerId = opts.blockerId ?? null;
  if (blockerId != null && rot.includes(blockerId)) {
    throw new Error(`blockSetterTendency: blockerId 不得是攻方球員（${blockerId} 在 ${atkTeam} 名冊內）`);
  }
  // 二傳＝角色，公開資訊（玩家面板 mbReadFor 也照 currentRole 分翼別）
  const setterId = rot.find((pid) => game.players[pid]?.currentRole === 'setter') ?? null;
  // 一傳還沒落地時 `passTier` 為 null＝「還不知道」⇒ 取最樂觀的那一檔當先驗，
  // 與 `blockCommitRead` 線索①「passTier == null 就不擋」同一個保守方向
  const pts = attackPointsOf(game, atkTeam, setterId, opts.passTier ?? 'perfect');
  if (!pts.length) return null;
  const entries = pts.map((pt) => ({
    ...pt,
    trust: effectiveTrust(game, game.players[pt.pid]),
    floorShare: game.players[pt.pid].trust.floorShare ?? 0,
  }));
  const w = applyFloorShare(entries, trustToWeights(entries));
  // ③ 本場配分歷史：Laplace 平滑（+1／+n）——本場還沒打過球時退化成均勻分佈，
  // 也就是「沒有歷史可讀 ⇒ 這一項不表態，純看 ①②」。乘上 n 讓這一項的均值≈1，
  // 語意是**對 trust 權重的調變**而不是取代（零新常數：n 就是池子大小）
  const hist = entries.map((e) => game.scoutTally?.[e.pid]?.spikes ?? 0);
  const totalHist = hist.reduce((s, v) => s + v, 0);
  const n = entries.length;
  const scores = [];
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const share = (hist[i] + 1) / (totalHist + n);
    const v = (w[i] ?? 0) * share * n;
    scores.push(v);
    sum += v;
  }
  if (sum <= 0) return null;
  // ★ 賭注＝**按權重抽**，不是取眾數（Sawmah 2026-08-01 裁定，段 3 掃描後追加）★
  //   取 argmax 的話，權重 0.35 的人會被賭 100% ⇒ 賭注分佈與真實配分分佈嚴重脫節
  //   （實測 pipe 賭 33.9% vs 真實 12.1%、quick 賭 1.8% vs 真實 20.4%），
  //   於是低傾向的翼**結構上永遠是空門**（右翼手身攔回 0/311，而 read 是 21/309）。
  //   改抽之後賭注分佈貼合二傳的分佈——「讀傾向」讀的本來就是分佈，不是那個第一名。
  //
  // ★ roll 的兩個要求 ★
  //   ① 與二傳自己的 roll **不同源**：同源＝100% 賭中＝直接讀答案。
  //      pickAttackPoint 用 `flightId * 977 + 131`，這裡用不同的乘數與位移。
  //   ② **一個 rally 內恆定**：flightId 每次觸球就 +1，拿它當鍵會讓賭注在一傳／二傳
  //      觸球那一刻無故換人 ⇒ chase 段當成「改判」白付 REPLANT_TICKS。
  //      改用比分（一個 rally 內不變、每一分換一次）當鍵。零 rng 消耗（hash01 是純 hash）。
  //   ③ **逐攔網手分開**（卷六裁定 2）：鍵再併入自己的 pid。三項（比分／seed／自己的 pid）
  //      在 rally 內皆恆定 ⇒ 約束②照樣成立；而且不論哪個 tick 入場都 roll 到同一個賭注，
  //      入場時點的差異不會漏進「賭誰」這件事。與遍歷順序徹底無關（只吃這三項）。
  //      idHash＋seed 的併法沿用本檔既有慣例（見 ai.js:1123 的攻擊點抽選）。
  const { score } = game.match;
  const roll = hash01((score.A * 1009 + score.B) * 613 + 71 + (game.seed ?? 0)
    + (blockerId == null ? 0 : idHash(blockerId)));
  const best = pickByWeights(entries, scores.map((v) => v / sum), roll);
  if (!best) return null;
  const a = game.actors[best.pid];
  if (!a) return null;
  // 裁定 2 強度端：從「站在人身上」朝「站在他的過網點上」收斂。過網點＝該線別的
  // **名目擊球點**（setAimFor，公開的位置知識，不含任何 route 的時間欄位）拉出
  // 直線／斜線兩條過網線再取中點——他不知道對方會打哪一條，就站在兩條中間。
  // 零新幾何、零數值加成。
  //
  // ★ 2026-08-04 更正過期註解（稽核 08-03 B11）★ 原文寫「出廠 MIX=0＝行為不變」，
  // 但 **2026-08-01 Sawmah 已定案＝1**（掃描曲線見 `blockRead.js` 該常數註解）。
  // ⇒ 下面的 `mix > 0` 在出廠值下恆真、末行的 fallback `return` 不可達。
  // 那是**參數所致、不是死碼**：把 `AIM_CROSSING_MIX` 調回 0 就會復活。
  // （稽核記為「不可達死碼」，實情是註解沒跟上定案值。）
  const mix = BLOCK_COMMIT.AIM_CROSSING_MIX;
  if (mix > 0) {
    const spot = setAimFor(game, atkTeam, best.pid, best.kind);
    const from = localToWorld(atkTeam, spot.lx, spot.lz);
    const aims = spikeAimsAt(from, atkTeam);
    const midX = (netCrossingX(from, aims.line) + netCrossingX(from, aims.cross)) / 2;
    const x = a.x + (midX - a.x) * mix;
    return { x, lx: TEAM_SIDE[atkTeam] * x, kind: best.kind };
  }
  return { x: a.x, lx: TEAM_SIDE[atkTeam] * a.x, kind: best.kind };
}

// 【判】選定的攻擊點在世界 x 的哪裡。**兩種人格看的東西不同，因為時點不同**：
//
//   commit 在二傳觸球**之前**決定——球那時還在飛向二傳，球的軌跡對「誰要扣」
//     一無所知，所以只能從各人的**助跑**猜（blockCommitRead）。猜對就贏，猜錯就在錯的地方。
//   read 在二傳觸球**之後**決定——球已經離手飛向某個攻擊手，**球自己的拋物線就是答案**。
//     這正是「read＝看清楚再動」的字面意思：他讀的是球，不是誰站哪。
//
// 用 predictContactPoint（球墜到扣球窗上緣的水平位置）而非攻擊手的身體 x，
// 是因為工單 §2.2 要的是**預測過網點**——身體 x 只是它的粗略代理，而且會被
// 中路假動作誘餌帶偏（實測：改用身體 x 時 read 面對兩翼的 MB 落差 p50 達 3.39m，
// 因為誘餌恆是「最接近網、正在推進」的那個，選人規則永遠選他）。
//
// ★ 反作弊 ★ 兩條路都拿不到 attackerId：blockCommitRead 的簽章只吃隊伍代號，
//   predictContactPoint 只吃球的物理量。球的拋物線是場上每個人都看得見的公開資訊。
// 回傳 `{ x, contactTicks }`，或 null（這一刻讀不出瞄準點）。
// `contactTicks` ＝ 距「球墜到扣球窗上緣」還有幾 tick，**只有 read 有值**——
// commit 猜的是人，`blockCommitRead` 結構上只給位置不給時間。
// read 的起跳時鐘就吃這個值（v4 裁定書主題「甲」，見 blockPlanTargetX 的建計畫段）。
// ★ 2026-08-04 誘餌量測臂（`BLOCK_COMMIT.DECOY_AIM_MIX`，預設 0＝不啟用）★
// 重建**當年被拿掉的那條選人規則**：瞄「最接近網、正在朝網推進」的攻方前排球員身體 x。
// 只讀可觀察量（actors 的 x／z／pz），與 `blockCommitRead` 同一組線索 ⇒ 反作弊鐵律不破。
// `closing` 的判準沿用 `BLOCK_COMMIT.APPROACH_EPS`（本檔 :1069 同款），不另立門檻。
// ★ 2026-08-26 抽成具名函式（職業章批 4a）★ 原本 pid 與 x 在同一個迴圈裡算完就丟——
// 攔網重心（blockLeanCrossingX）需要同一個「最靠近網、正在推進」的攻方球員**完整位置**
// （算過網點要 x 與 z 兩者），不只 x。純抽取、零行為變動：decoyAimX 的輸出逐值不變
// （下方 decoyAimX 直接讀這裡回傳的 pid 取 actor.x，與抽取前同一段運算）。
function closingAttackerIdOf(game, atkTeam) {
  const rot = game.match.rotations?.[atkTeam];
  if (!rot?.length) return null;
  const side = TEAM_SIDE[atkTeam];
  let best = null;
  for (const pid of rot) {
    if (!isFrontRow(rot, pid)) continue;
    const a = game.actors?.[pid];
    if (!a) continue;
    // 正在朝網推進嗎（同 :1069 的 closing）——誘餌的招牌就是「衝向網」
    const closing = (side * a.pz) - (side * a.z) > BLOCK_COMMIT.APPROACH_EPS;
    if (!closing) continue;
    const dz = Math.abs(a.z); // 離網距離：越小越像「正要打的那個」
    if (!best || dz < best.dz) best = { pid, dz };
  }
  return best?.pid ?? null;
}

function decoyAimX(game, atkTeam) {
  const pid = closingAttackerIdOf(game, atkTeam);
  return pid != null ? game.actors[pid].x : null;
}

// 職業章批 4a 攔網重心：布置面板押的方向（'line'｜'cross'）×「最靠近網、正在推進」
// 的攻方球員（與誘餌同一組公開線索，反作弊鐵律不破）→ 那條線的過網點 x。
// 讀不到人（沒人在推進）＝null——呼叫端回落原本的 base 瞄準，不強制猜。
function blockLeanCrossingX(game, atkTeam, lean) {
  const pid = closingAttackerIdOf(game, atkTeam);
  if (pid == null) return null;
  const from = game.actors[pid];
  if (!from) return null;
  const aims = spikeAimsAt(from, atkTeam);
  return netCrossingX(from, lean === 'cross' ? aims.cross : aims.line);
}

// 職業章批 4a：布置面板①「攔網重心」的 sim 消費端——`opts.team`＝這名攔網手的隊伍
// （呼叫端才知道，見下方三處呼叫改動）。未布置（`blockLean` 不是 'line'/'cross'）
// 或讀不到人＝原樣回傳 `base`，零效果（D3 凍結：預設值下逐值無效果）。
// ★ 押錯的代價在這裡兌現 ★ 這是**全額覆蓋**（不是與 base 混合）：教練喊了方向，
// 這一波的攔網賭注就整個押在那條線上——base 原本可能是對的（read 讀到真實球路），
// 押錯了照樣蓋掉，牆就站錯邊（pressBlock「押錯就整面落空」同一種代價形狀）。
function applyBlockLean(game, atkTeam, opts, base) {
  if (!base) return base;
  const lean = game.aiProfiles?.[opts?.team]?.blockLean;
  if (lean !== 'line' && lean !== 'cross') return base;
  const x = blockLeanCrossingX(game, atkTeam, lean);
  if (x == null) return base;
  return { ...base, x };
}

function blockAimX(game, aiState, atkTeam, persona, opts) {
  // ★★ 誘餌只騙得到 commit，read 免疫（2026-08-04，款3 警報器逼出來的設計）★★
  //
  // 初版對兩種人格一視同仁，結果**款3 離地率警報器當場轉紅**：
  // 「commit 離地率 28.4% − read 20.1% ＝ 8.3pp < 10pp 門檻」（基準 gap 是 14.4pp）。
  // 警報器是對的——read 的人格定義就是「**看清楚球再動、不對快攻賭**」
  // （見 blockAimXBase 註解：read 在二傳觸球後才決定，讀的是球自己的拋物線），
  // 而誘餌逼他跟著「衝向網的那個人」跑 ⇒ **直接消滅 read 與 commit 的區別**。
  //
  // ⇒ 正解是讓誘餌只作用於 commit：他本來就是在二傳觸球**之前**賭、手上只有助跑可讀，
  //   被假動作騙走完全符合他的人格；read 看的是球，本來就不該被身體動作帶偏。
  //   這也讓 `opponents.js` 對曜石的註解「中路是他們的天下＝賭中間；**交叉／兩翼就是解法**」
  //   第一次真的成立——解法之所以是解法，正因為騙得動他。
  const decoyMix = persona === BLOCK_PERSONA.COMMIT ? (BLOCK_COMMIT.DECOY_AIM_MIX ?? 0) : 0;
  if (decoyMix > 0) {
    const dx = decoyAimX(game, atkTeam);
    if (dx != null) {
      if (decoyMix >= 1) return applyBlockLean(game, atkTeam, opts, { x: dx, contactTicks: null });
      const base = blockAimXBase(game, aiState, atkTeam, persona, opts);
      if (base) {
        return applyBlockLean(game, atkTeam, opts,
          { x: base.x * (1 - decoyMix) + dx * decoyMix, contactTicks: base.contactTicks });
      }
      return applyBlockLean(game, atkTeam, opts, { x: dx, contactTicks: null });
    }
  }
  return applyBlockLean(game, atkTeam, opts, blockAimXBase(game, aiState, atkTeam, persona, opts));
}

function blockAimXBase(game, aiState, atkTeam, persona, opts) {
  if (persona === BLOCK_PERSONA.READ) {
    const hit = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
    if (hit) {
      let x = hit.x;
      // ★攻守平衡卷 批5：雙人牆分工縫★ 實測（卷宗 PROBE-db31/bg31）：兩翼高球
      // 75-98% 有兩名前排到攻擊手 x ±0.7m 內＝雙人牆有成形，但全員錨同一個接觸點 x
      // ⇒ 直線被雙重覆蓋、斜線角在 1.2-1.5m 外整條沒人（斜線格攔死 0-2% 的幾何成因）。
      // 真實雙人牆＝翼手守直線、MB 讓半步關斜線縫。幾何零新造：斜線過網點複用
      // blockSetterTendency AIM_CROSSING_MIX 同一組 spikeAimsAt/netCrossingX。
      // 只動 read 的 MB 一人；翼手照舊錨接觸點＝人格時序憲法（誰何時解鎖）一格不動，
      // 這是站位分工不是決策時機。blockerId＝守方自己的 pid（卷六反作弊界線內）。
      const me = opts?.blockerId ? game.players[opts.blockerId] : null;
      if (me?.currentRole === 'middle' && Math.abs(hit.x) >= AI.BLOCK_SEAM_MIN_X) {
        const crossX = netCrossingX(hit, spikeAimsAt(hit, atkTeam).cross);
        x += (crossX - x) * AI.BLOCK_SEAM_MIX;
      }
      return { x, contactTicks: hit.ticks };
    }
  }
  // 段 2（裁定 2＋5）：commit 的**賭注方向**改讀二傳配分傾向，不再走 `blockCommitRead`。
  // ⚠ `blockCommitRead` **沒有退場**——它是 commit 起跳時鐘鎖不住時的**退路訊號**
  //   （助跑下降沿，見 blockPlanTargetX chase 段）。主時鐘自 2026-08-05 題 E 裁定起
  //   改吃球（球離二傳手後取樣 predictContactPoint 鎖存），卷一裁定 5 的「位準早跳」
  //   經 Sawmah 同意重開——賭注方向仍只此一處。
  const t = blockSetterTendency(game, atkTeam, opts);
  return t == null ? null : { x: t.x, contactTicks: null };
}

// 攔網分工卷 step1（2026-07-31）：計畫的容器。
//   `team`／`template`＝團隊級——**建計畫仍是單一事件**：第一個解鎖的人建，其餘人共讀。
//     （read 的解鎖吃自己的 reactionTicks ⇒「誰先解鎖」本來就決定了整份計畫的內容與時點，
//       拆成各建各的會連建計畫的時機與輸入都變 ⇒ 本步不動這一層。）
//   `byPid`＝每名攔網手一份（本步要拆出來的那一層）。
function newBlockPlan(team, template) {
  // 攔網分工卷 step2b（2026-07-31）：`chase`（落地後的 close 預算）已改為 per-blocker
  //（住在 `byPid[pid].chase`）——它吃 `player`／`actor.x`，本來就該各算各的。
  return { team, template, byPid: {} };
}

// 卷六：「這名攔網手自己的賭注落在哪個 x」。**只當參數傳，絕不存進 aiState**——
// `rallyTape.js:66` 每個 rally 都對 `aiState` 做一次 `structuredClone`，函式不可結構化複製，
// 存進去會讓錄影帶每一幀丟例外（2026-08-03 真人試玩踩到，node 端測試一個都攔不住）。
function blockAimResolver(game, aiState, team) {
  return (pid) => {
    const at = game.rally.possession;
    if (!at || at === team) return null;
    // 一律讀當下局面（possession／persona／passTier 都重取），與同一 tick chase 段算 `live`
    // 的輸入逐項相同——鎖存建計畫那一刻的 opts 會讓兩者對不起來，首次取用當場被
    // REPLANT_JUMP_M 判成「換人跟」而白付重新踩定成本。
    const own = blockAimX(game, aiState, at, blockPersonaOf(game, team),
      { ...blockAimOptsOf(aiState), blockerId: pid, team });
    return own?.x ?? null;
  };
}

// 這名攔網手自己的那一份。
//
// ★ 攔網分工卷 step2b（2026-07-31）：每名攔網手真的各跟各的 ★
// 每份記錄在**第一次被取用時**從團隊級的 `template`（＝建計畫那一刻鎖存的內容）複製一次，
// 之後**只由他自己步進**——step1 那條「逐 tick 從 `plan.latest` 同步」的行為中性膠帶已拆除。
//
// 語意上的後果（已知並接受，是本步的存在理由）：攔網手並不是每個 tick 都走得到攔網分支
//（去接球、去補位的 tick 就沒步進——實測單局 601 次）。共用物件時是「誰步進誰推進、
// 沒步進的人回來直接看到已推進的結果」；現在落後的人回來時 `seen`／`jumpTick` 會掉隊
// ——**這正是「個別騙得到某一名攔網手」在結構上可表達的那一刻**（組合攻擊卷的交叉／夾塞／
// 時間差要騙的就是這個），代價是「因為在忙別的事而沒跟上這一次攔網」會真的發生。
//
// `plan.latest` 只剩**外部觀測用**（探針／測試讀「最近步進的那一份」），sim 不再由它取值。
const BLOCK_PLAN_CARRY = [
  'x', 'enterTick', 'jumpTick', 'jumpAt', 'replantUntil', 'pendingX', 'blind', 'seen', 'hand',
];

function blockPlanFor(plan, playerId, resolveX = null) {
  let c = plan.byPid[playerId];
  if (!c) {
    // `cover`（step2a：我是不是回落補吊球的那一個）與 `chase`（step2b：落地後的 close 預算）
    // 刻意不在 CARRY 裡：兩者都是每人各自一格的判斷結果，從別處帶過來會變成別人的決定
    c = {};
    for (const k of BLOCK_PLAN_CARRY) c[k] = plan.template[k];
    // ★★ 卷六裁定 2：分歧點在**入場**，不在改判 ★★
    // 九欄裡只有 `x` 逐 pid 求值，其餘八欄照抄 template（它們是「建計畫那一刻」的鎖存值，
    // template 建立後全域唯讀 ⇒ 不論哪個 tick 入場都拿到同一份，順序相依只在「誰建計畫」）。
    // **首次取用不算改判**：replant 的語意是「已 commit 後改主意的重蹲成本」，這裡沒有
    // 先前的 commit ⇒ `replantUntil` 維持 -1、`pendingX` 維持 null，一格都不動。
    // 求值讀的是**當下**的局面（與同一 tick chase 段的 `live` 同源），所以首次複製完
    // 立刻進 chase 時 `|live.x − c.x|` 為 0，不會被 REPLANT_JUMP_M 誤判成換人跟。
    // blind 退路計畫**不參與求值**：建計畫時 `blockAimX` 回的是 null（沒鎖定任何人），
    // 晚入場的人在這裡求值會拿到一個非 null 的新瞄準點＝事後改瞄，
    // 違反下方 chase 段 `if (c.blind) return c.x` 那條裁定（賭錯了代價自己付）。
    if (resolveX && !c.blind) {
      const own = resolveX(playerId);
      if (own != null) c.x = own;
    }
    plan.byPid[playerId] = c;
  }
  plan.latest = c;
  return c;
}

/**
 * 【關】起跳窗開不開——**問狀態機，不問球飛到哪了**。
 *
 * ★ 這是「觸發誠實化」的正字標記（§十-2、裁定書 §1.5）★
 * 改制前是 `r.profile === 'spike' && aiState.landingTeam === team`：
 * 兩個條件都要等**攻擊手已經把球打出來**才成立，等於攔網手的起跳觸發是
 * 「對方已經把球擊出」這件事本身——十-2 的原文就是「攔網手**對扣球事件**零延遲反應」。
 * 於是不管 read 晚了多少 tick 才知道要攔誰，他照樣在球出手後第一格準時拔起來，
 * 兩種人格的時間代價根本無從體現。
 *
 * 現在起跳掛在狀態機的 air 段：進 air 的事件是「被跟的那個攻擊點不再推進＝他拔起來了」
 * （chase 段裡寫下 jumpTick）。判得晚 → 進 chase 晚 → 拔得晚；
 * 改判過 → 付了重新踩定的 tick → 更晚。窗長沿用既有的 `TUNING.BLOCK_WINDOW`，不另立常數。
 */
function blockPlanAirborne(aiState, team, tick, playerId) {
  const plan = aiState.blockPlan;
  if (!plan || plan.team !== team) return false;
  const c = plan.byPid[playerId];
  if (!c || c.jumpTick == null) return false;
  return actionPhaseAt(tick, {
    enterTick: c.enterTick, airTick: c.jumpTick, airTicks: TUNING.BLOCK_WINDOW,
  }) === ACTION_PHASE.AIR;
}

// 瞄準用的 opts 只有一份定義（`blockPlanTargetX` 與計畫上的 `resolveX` 共用）——
// 兩邊各抄一份，哪天多一個欄位就會漂移成兩種輸入，首次複製與 chase 段當場對不起來。
function blockAimOptsOf(aiState) {
  return { passTier: aiState.passTier ?? null, setterSpotLx: AI.SETTER_SPOT.lx };
}

// ★★ 慢速／非典型彈道校正（2026-08-11，爆接卷第三擊被攔率案）★★
//
// ★ 病根 ★ 攔網手的**時鐘與瞄準都錨在擊球點**（`predictContactPoint`：攻擊手會在
//   第幾 tick、在哪個 x 把球打走），而攔網的結算**全部發生在網面上**
//   （`game.js stepRally` 判過網、`tryBlock` 取過網那一 tick 的 `b.x`）。
//   兩者只有在「擊球→過網」很短時才近似相等——**那是一個沒有人寫下來的前提：彈道典型**。
//   實測（RUNS=200，探針 blown-block-probe.mjs）：
//     典型扣球 擊球→過網 p50 8 tick；「救起來、有人從中路慢慢打過去」p50 15、p95 32。
//   後者的下場是牆按擊球時鐘準時拔起，球卻晚 7–24 tick 才到：
//     過網時牆上一個人都沒有 15.3%（一般爛一傳只有 0.4%）、帶內率 58.7%（vs 75.1%）。
//   ⇒ 不是攔網太弱，是**時鐘對不上這顆球**。
//
// ★ 修法 ★ 球**真的被打出來之後**（`profile === 'spike'` ＝ tryBlock 自己的同一道閘），
//   「它會在第幾 tick、從哪個 x 過網」就是可算的公開物理（`predictNetCrossing`，
//   與 sim 判過網同一套 stepBall、同一條述詞）。此時攔網手改用這個量：
//     ① 時鐘：球到得比我的滯空還遠 ⇒ **再等一下**（只延後，永不提前，見下方 tooEarly）
//     ② 瞄準：改瞄**過網點**而不是擊球點（結算就在那條線上）
//   兩者都不是特判——判準是「這顆球飛多久」，慢球／非典型彈道一律適用，
//   典型球（p50 6 tick 就到）連閘門都碰不到，逐值不變。
//
// ★ 為什麼不是「加強攔網」★ 校正只在**球已經朝我飛來**時生效，而此時剩下的移動時間
//   由球自己決定：典型快球只剩 1–2 tick（頂多 0.18m），慢球才給得出補位的時間——
//   幅度天然跟著「這顆球有多不典型」走，零強度旋鈕。
//
// 回傳 `{ x, y, ticks }`（球會在幾 tick 後、從哪裡過到**我方**）或 null（沒這個量）。
function blockInboundCrossing(game, team) {
  if (game.rally.profile !== 'spike') return null; // 球還沒被打出來＝過網點不可導
  // 球還在對方半場才算「朝我飛來」（我方半場在 z 符號 +TEAM_SIDE[team] 側）
  if (TEAM_SIDE[team] * game.ball.z >= 0) return null;
  return predictNetCrossing(game.ball);
}

// 「現在跳的話，球到的時候我的手還在上面嗎」——**只用來延後，不用來提前**。
// 門檻＝`AIR_TICKS / 2`：`player.js blockTopEdge` 的頂邊是 sin(π·t/AIR_TICKS)，
// 峰值就在 t = AIR_TICKS/2 ⇒「起跳到球過網剛好一個半波」＝手在最高點迎球。
// **零新常數**（沿用既有滯空窗與既有的頂邊曲線），也沿用了本檔既有的同款語彙
//（commit 提前跳的閘 `c.jumpAt <= tick + AIR_TICKS`＝「現在跳仍罩得住」）。
function blockJumpTooEarly(inbound) {
  return inbound != null && inbound.ticks > AIR_TICKS / 2;
}

function blockPlanTargetX(game, aiState, team, playerId, player, actor, tick) {
  const r = game.rally;
  const atkTeam = r.possession;
  if (!atkTeam || atkTeam === team) return null;
  const persona = blockPersonaOf(game, team);
  const opts = { ...blockAimOptsOf(aiState), team };
  const plan = aiState.blockPlan;
  if (!plan || plan.team !== team) {
    const unlocked = blockDecisionUnlocked(game, aiState, persona, player, tick);
    // 【判】選定攻擊點
    // 卷六：賭注逐人一份 ⇒ 連建計畫的那一次也是「他自己的」賭注（`blockerId`）
    const aim = unlocked ? blockAimX(game, aiState, atkTeam, persona, { ...opts, blockerId: playerId }) : null;
    if (aim == null) {
      // ★ commit 的「賭輸了也要站上場」退路（2026-07-29 Sawmah 簽准；v2 裁定書題 2 的實測修正）★
      //
      // 病灶不是裁定書 §一.4 指的 `atkTeam === team` 早退——實測那條在飛行段一次都沒觸發
      //（飛行段 possession 翻到攔網方 0.0%、攔網分支活著 100.0%，見
      // `tools/phase5-block-plan-lifecycle-probe.mjs`）。真正的缺口在**這裡**：
      //
      //   commit 的決策窗 ＝ `touches < 2`，且必須「當下 blockCommitRead 回得出值」才建得起計畫。
      //   實測（299 次攻擊）：窗長 p50 172 tick、分支活著 p50 138 tick、**分支從未活過 0.0%**，
      //   但 **43.5% 的攻擊整段窗內讀不到任何人在往網跑**。
      //   讀不到 ⇒ 計畫沒建起來 ⇒ 窗在第二觸永久關閉 ⇒ 這一波**從頭到尾不起跳**（59–65%）。
      //
      // 「什麼都不做、整球不攔」不是任何人拍板過的行為，是規格漏洞：A 案定義了
      // 「commit 決定早」與「起算事件＝二傳觸球」，**沒有定義「截止了還沒讀到人怎麼辦」**。
      // 現實裡沒有攔網手因為讀不到快攻就整球不起跳。
      //
      // 授權範圍（不得擴張解讀）：只補這一條退路。**不動** commit 何時開始讀、
      // 不動起算事件、不動 read 的解鎖規則、不動起跳訊號。**零新常數。**
      //
      // 退路的語意＝「我賭快攻，但沒看到人；我還是守中路、跟著跳」：
      //   目標 x ＝ 0 ＝ 呼叫端 `planX ?? 0` 本來就在用的中軸錨點
      //   ⇒ **站位逐值不變**，唯一的行為差異是「這一波會起跳」。
      //   `blind` ＝ 這份計畫沒有鎖定任何人 ⇒ chase 段不得改瞄（見下方 ①）。
      //   不改瞄才是誠實的：他賭了中路卻沒賭中，代價就該由他自己付（兩翼來就守不到），
      //   容許他事後跟著人跑＝把 commit 偷偷變成 read，人格差異會被抹平。
      if (persona !== BLOCK_PERSONA.COMMIT || unlocked) return null;
      aiState.blockPlan = newBlockPlan(team, {
        x: 0, enterTick: tick, jumpTick: null, replantUntil: -1, pendingX: null,
        blind: true, seen: false, jumpAt: null,
        hand: 'press', // §十-4b：盲跳也是 commit 的計畫——commit 不縮（Q1 乙裁定書性格表達）
      });
      blockPlanFor(aiState.blockPlan, playerId);
      return 0;
    }
    // ★ read 的起跳時鐘：在**這一 tick 取樣並鎖存**，之後不重算（v4 裁定書 R1）★
    // 取樣時點 ＝ 建計畫這一 tick ＝ `blockDecisionUnlocked` 剛放行的那一刻
    //          ＝ 二傳觸球 ＋ 該員反應延遲。**結構上不可能更早**。
    // 前置量 ＝ 0：起跳就在預測擊球 tick（v4 裁定書主題「甲」，2026-07-30 Sawmah 拍板）。
    //   為什麼不是「預測過網 tick − 跳躍窗長/2」（v3 裁定書 R2 的原形式）：
    //   **過網 tick 在這一刻不可導**——取樣時球還在二傳的球路上，那組速度描述的是
    //   「二傳的球慢慢飄過網」，球會先被扣走、換一組全新速度才真的過網。
    //   實測誤差 p50 117／280 tick，後排 0/57 連正解都沒有（`phase5-block-nettick-probe.mjs`）。
    //   擊球 tick 則是 sd 0.48–0.76 tick、全距 ≤3 ⇒ 錨點存在，只是不在網面。
    //   前置量掃過五個候選（0／12／＝反應延遲／8／6），**只有 0 讓 R4 三款同時成立**。
    // ⚠ 鎖存只鎖**起跳時鐘**；瞄準 x 仍逐 tick 重算（既有行為，改判要付重新踩定代價）。
    const jumpAt = aim.contactTicks == null ? null : tick + aim.contactTicks;
    const read = { x: aim.x };
    // §十-4b 手態三檔（Q2 裁定＝離散；z 深度是檔位屬性不是座標軸）：
    //   commit＝press（賭了就全押：手伸過網壓球，擦頂帶的球被拍回攻方場內）
    //   read ＝預設 vertical；讀到「對手被迫勉強打」——一傳 poor 或預測擊球點被擠到
    //          邊線外帶（BLOCK_RETRACT_WIDE_X）——時 retract（縮手＝寬度歸零絕不被
    //          tool，賭對方自打出界；「別攔爛球」的真實攔網紀律）
    // 兩個線索都是公開資訊（一傳品質＝球的飛行品質、擊球點＝球的拋物線），反作弊成立
    const hand = persona === BLOCK_PERSONA.COMMIT ? 'press'
      : ((AI.BLOCK_RETRACT_ON_POOR && opts.passTier === 'poor')
        || Math.abs(read.x) > AI.BLOCK_RETRACT_WIDE_X)
        ? 'retract' : 'vertical';
    // enterTick＝鎖定那一 tick（§9 契約：事件驅動的段界＝事件發生時把 tick 寫下來）
    aiState.blockPlan = newBlockPlan(team, {
      x: read.x, enterTick: tick, jumpTick: null, replantUntil: -1, pendingX: null,
      jumpAt, hand,
      // `seen` 一律起手為偽、由 chase 段逐 tick 自己觀察——**不得在建計畫時預設為真**：
      // read 的計畫是從**球的拋物線**建的（blockAimX 走 predictContactPoint），
      // 不是從「看到有人在跑」建的。預設為真會讓 read 在兩翼助跑手還沒進偵測範圍時
      // 就當場拔起（實測 set+14，球 set+89 才到）。
      blind: false, seen: false,
    });
    // ★ 卷六：晚入場的攔網手在**他自己第一次取用的那一 tick**求自己的賭注 ★
    blockPlanFor(aiState.blockPlan, playerId, blockAimResolver(game, aiState, team));
    return read.x;
  }
  // 拆分後每名攔網手跟自己的那一份（建計畫的時機／輸入不變，見 blockPlanFor 檔頭）
  const c = blockPlanFor(plan, playerId, blockAimResolver(game, aiState, team));
  // §9 契約：本狀態機的三段＝chase（跟死）／air（在空中）／release（落地結算）。
  // 進 air 的錨點是事件寫下的 jumpTick、窗長沿用既有的 TUNING.BLOCK_WINDOW
  const phase = actionPhaseAt(tick, {
    enterTick: c.enterTick, airTick: c.jumpTick, airTicks: TUNING.BLOCK_WINDOW,
  });
  // ① 跟死（被跟的人還在往網走／球還在飛向他）
  if (phase === ACTION_PHASE.CHASE) {
    // ★ 起跳訊號：**兩種人格共用同一個可觀察事件** ★
    // ——助跑的人都不再往網推進了（blockCommitRead 回 null）＝他們拔起來了，我跟著上。
    // 人格差異只在「何時允許做決定」與「決定時看什麼」，**不在起跳訊號**：
    // 攻擊手離地這件事，read 和 commit 都是用同一雙眼睛看的。
    //
    // 為什麼不能讓 read 用自己的瞄準來源（球的拋物線）當起跳訊號：
    // 球在被扣之前，`predictContactPoint` 一直回得出值 ⇒ read 永遠等不到 null ⇒
    // **永遠不起跳**（實測：read 的 MB 在球過網那一刻位於攔網窗內的比例 0.0%）。
    // 那不叫誠實化，那叫把攔網關掉。
    //
    // ★ 訊號要成立必須**球已離二傳的手**（`touches >= 2`）★
    // 「沒有人在往網跑」在助跑**開始之前**也成立——只看這一個條件的話，commit
    // （在二傳觸球前就解鎖）會在接一傳的階段當場拔起來，48 tick 的窗在球過網前
    // 老早就過期（實測 commit 的 MB 在球過網那一刻位於窗內的比例只剩 42.9%／26.5%／0.3%）。
    // 加上「球已離手」之後，這個組合條件才真的等價於「攻擊手已經離地」：
    //   快攻：MB 在二傳觸球前就離地（W1 實測 100%）⇒ 二傳觸球當下即成立，隨即拔起
    //   高球：兩翼還在跑 ⇒ 條件不成立，等他們真的拔了才跟上
    //
    // ✅ 上面那個「59–65% 從來沒發生」的缺口已於 2026-07-29 定位並修復——**成因不是這裡**，
    // 是 commit 根本沒建起計畫（決策窗在第二觸永久關閉、43.5% 的攻擊窗內讀不到人）。
    // 修法＝上方的 `blind` 退路。實測依據見 `tools/phase5-block-plan-lifecycle-probe.mjs`。
    //
    // ★ 起跳訊號是**下降沿**，不是位準（2026-07-29 Sawmah 簽准修正）★
    // 原本寫成「`touches >= 2` ∧ 現在沒有人在往網跑」——**位準**。實測全部塌在地板：
    //   兩翼 read 起跳 set+14、球過網 set+89、過網時滯空 74（AIR_TICKS 只有 24）
    //   ⇒ 六格的頂邊完成度全部等於地板＝球到的時候沒有一隻手還在空中。
    // 成因：`blockCommitRead` 只認 `lz <= DEPTH_LZ (2.9)` 的候選，而**兩翼助跑起點
    // lz 3.58、後排 5.61**（W1 §2 實測）——他們在助跑前半段根本不在偵測範圍內，
    // 於是「沒有人在往網跑」在他們**起跳之前**就成立了。
    //
    // 「他不推進了＝他拔起來了」這句話本來就預設「**他曾經在推進**」。
    // 把 `seen` 補上，訊號就從位準變成真正的下降沿：看過人在跑、而且他現在不跑了。
    // 零新常數；沒看過任何人跑的計畫（含 blind）就繼續等，不會在 set+0 當場拔起。
    // ⚠ 已知未解（2026-07-29 實測，待裁定）：兩翼／後排仍早約 55 tick。
    // 一次攻擊有**好幾個**下降沿（兩翼：2 個佔 51%、3 個佔 15.7%）——
    //   第一個 p50 = set+35（中路誘餌拔起），**最後一個 p50 = set+82**（真正的攻擊手起跳，
    //   擊球 set+81、理想起跳 set+76）。本訊號抓的是第一個 ⇒ 被誘餌帶走。
    // 試過「下降沿要認人」（只在消失的候選人落在自己瞄準點 REPLANT_JUMP_M 內才起跳）：
    //   **實測退步**——read 面對快攻變成 100% 不起跳、commit 又回到 set+0，已撤回。
    // 「該吃第幾個下降沿」實質上就是 read／commit 賭局的定義本身（憲法 §零 領域），
    // 不由實作端自行決定。詳見 docs/phase5-section10-test-triage.md §五。
    // ★★ 2026-07-30 起，兩種人格**不再共用起跳訊號**（v4 裁定書主題「甲」）★★
    // 上面那整段註解記錄的是舊制與它為什麼行不通，保留當歷史；現行分工是：
    //   read  ＝ 建計畫時鎖存的 `jumpAt`（球的預測擊球 tick，前置量 0）
    //   commit＝ 球離二傳手後取樣鎖存 `jumpAt`（同一條管線，見下）；下降沿只剩退路
    // read 改吃球的理由：起跳訊號的**來源不同就是人格差異**——read 讀球（等球出手看清楚，
    // 準但晚）、commit 賭中路（早，但可能賭錯）。原本要求兩者共用同一個可觀察事件，
    // 而實測證明**不存在**一個對兩人格都成立且指得對的事件（快攻沒有屬於真攻擊手的下降沿，
    // 兩翼的第一個下降沿指著中路誘餌）。
    //
    // ★★ 難度重校卷 題 E（2026-08-05 Sawmah 裁定 E1 時機形狀；重開卷一裁定5「位準早跳」）★★
    // commit 的起跳時鐘也改吃球：球一離二傳的手（touches >= 2），在自己下一次步進的
    // tick 取樣一次 `predictContactPoint` 鎖存 `jumpAt`——與 read 同一條管線、同樣前置量 0。
    // **賭注（位置）一格不動** ⇒ 人格差異完整保留在「賭哪裡」：賭對＝人在線上、時間也對，
    // 牆是真的罩下來；賭錯＝準時跳在沒球的地方——兩端從此都是幾何湧現，零新常數。
    // 為什麼不修下降沿而是換時鐘（探針 tools/commit-overlap-probe.mjs，60 局 n=5960）：
    // 舊制「賭對∩滯空涵蓋球到達」僅 4.31%；賭對的波 54% 下降沿根本沒響（等不到），
    // 響了的落地距球到達 p50 61 tick（＝2.5 個 AIR_TICKS）——訊號層兩處都壞，錨點換球才有解。
    // 取樣比 read 早（不加反應延遲）：他早就決定完了，站在賭注點上等的就是這顆球；
    // 反作弊不變：球的拋物線是公開資訊（與 read 同授權層級），賭注端照舊拿不到 attackerId。
    //
    // ⚠ 純時鐘會漏掉快攻（首輪實跑 款3 警報器當場抓到：commit 快攻離地率 42%→17%）：
    // 快攻在扣球窗上緣**之上**就被打走，predictContactPoint 對它偏晚 +8 tick（卷一已知），
    // 而快攻飛行段只有 6 tick ⇒ 等時鐘＝球過網之後才起跳。所以下降沿不只是退路，
    // 還是**提前跳的閘**：時鐘未到但下降沿響了、且「現在跳仍罩得住預測擊球」
    // （jumpAt ≤ tick + AIR_TICKS，拿既有滯空窗當錨、零新常數）才提前起跳——
    // 快攻（jumpAt−tick ≈ 23 ≤ 24）放行＝跟著真攻擊手拔；高球的誘餌邊沿
    // （jumpAt−tick ≈ 46+ > 24）被擋下等時鐘＝不再被誘餌帶走。這正是「該吃第幾個
    // 下降沿」那道老題（見上方歷史註解）的解：用球的到達可行性選邊沿，不用認人。
    if (c.jumpAt == null && persona === BLOCK_PERSONA.COMMIT && r.touches >= 2) {
      const hit = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
      if (hit) c.jumpAt = tick + hit.ticks;
    }
    // ★ 慢速／非典型彈道校正（見 blockInboundCrossing 檔頭）★
    // 球已經打出來、正朝我方飛時才有這個量；沒有＝一切照舊。
    const inbound = blockInboundCrossing(game, team);
    // 只延後、不提前：訊號說跳了，但球還遠到「我落地它才到」⇒ 這一 tick 不跳，繼續跟。
    const tooEarly = blockJumpTooEarly(inbound);
    if (c.jumpAt != null) {
      if (tick >= c.jumpAt && !tooEarly) {
        c.jumpTick = tick; // 本 tick 起算 air
        return c.x;
      }
      // commit 提前跳的閘（read 不走：他的時鐘取樣於反應延遲之後，本來就不早跳）
      if (!tooEarly && persona === BLOCK_PERSONA.COMMIT && c.jumpAt <= tick + AIR_TICKS) {
        const liveRead = blockCommitRead(game, atkTeam, {
          ...opts,
          outerLag: Math.round(reactionTicks(player) * BLOCK_COMMIT.OUTER_LAG_MUL),
        });
        if (liveRead) c.seen = true;
        if (c.seen && liveRead == null) {
          c.jumpTick = tick;
          return c.x;
        }
      }
    } else {
      // 走到這裡＝還沒有起跳時鐘：二傳出手前的 commit（含 blind 退路，時鐘等球離手才鎖）、
      // 取樣時 predictContactPoint 回不出值的 commit、以及 read 罕見回不出值的退路
      //
      // ★ 攔網時序卷 段 3（裁定 4）：外圍候選的**賭注品質降級** ★
      // 段 3 放寬了偵測深度讓兩翼進候選池——但「看得見位置」不等於「讀得穿時序」。
      // 對外圍（新放進來的那一批）他的時序判定延遲 `OUTER_LAG_MUL × 自己的反應延遲`，
      // 於是交叉／內切之間的時序差**仍然騙得動他**（裁定 4 的成敗判準之一）。
      // ★ 這個延遲是 per-blocker 的（reactionTicks 逐人不同）★——順帶也是攔網分工卷
      // step2b「個別演進」在輸入端的第一條真通道（此前只有「漏 tick」一條）。
      const liveRead = blockCommitRead(game, atkTeam, {
        ...opts,
        outerLag: Math.round(reactionTicks(player) * BLOCK_COMMIT.OUTER_LAG_MUL),
      });
      if (liveRead) c.seen = true;
      if (r.touches >= 2 && c.seen && liveRead == null && !tooEarly) {
        c.jumpTick = tick;
        return c.x;
      }
    }
    // `blind` ＝ 沒鎖定任何人的退路計畫：**不得改瞄**。
    // 他賭了中路卻沒賭中，代價就該由他自己付；容許事後跟著人跑＝把 commit 偷偷變成 read。
    if (c.blind) return c.x;
    // ★ 慢速／非典型彈道校正 ②：**還在等的這段時間，就走到球會過網的地方** ★
    //
    // 條件刻意是 `tooEarly`（＝校正 ① 正把我按在地上）而不是「只要 inbound 就改瞄」：
    //   時間是這條規則的全部內容。腳還在地上、球還遠 ⇒ 我看得到它會從哪裡過網，
    //   也真的走得過去；一旦近到可以跳（tooEarly 轉偽），瞄準就交還給既有的那條路，
    //   起跳後更是完全不能橫移（AIR 段 `return c.x`）。
    // ⚠ 這不是「改瞄」而是「跟球」，所以**不付重新踩定的代價**（REPLANT_TICKS 的語意是
    //   「換了一個人跟＝重心壓在錯的方向」；球被打出來之後只有一顆球，沒有第二個人可換）。
    //   位移仍受 `moveIntent` 的單 tick 上限約束 ⇒ 球給多少時間就補多少位，不會瞬移。
    //
    // ★ 實測擇路（RUNS=40 四臂，探針 blown-block-probe.mjs；被攔率 爆接／poor／perfect）★
    //   基準                 20.61 / 36.23 / 23.65
    //   只改瞄（不看時間）     17.69 / 30.80 / 19.44 ← **全面變差**：典型球在起跳前一兩格
    //                        才換瞄準點，人來不及動、牆的分工卻整個重排，尾巴反而變厚
    //   改瞄＋付重新踩定      22.28 / 36.58 / 24.06 ← 12 tick 的凍結把剩下的時間吃光＝等於沒做
    //   **本式（等的時候跟球）31.44 / 37.47 / 26.76**
    if (inbound && tooEarly) { c.x = inbound.x; return c.x; }
    const live = blockAimX(game, aiState, atkTeam, persona, { ...opts, blockerId: playerId });
    if (!live) return c.x; // 這一刻讀不出新的瞄準點：守住既有目標，不亂動
    // §2.4-e 改判要付重新踩定的代價（**不做加速度／慣性模型**：移動從來不是瓶頸，
    // 窗長 p50 80 tick × 移速 2.8–5.2 m/s 可跑 3.7–6.9m，而實測最大淨位移僅 4.864m。
    // 真正該有的代價是「換人跟＝重心已經壓在錯的方向，要停、轉、重新踩地」）。
    // 怎麼分辨「換了一個人跟」與「同一個人在跑」：跑動的人單 tick 位移 < 0.09m
    // （moveSpeed × SIM_DT 上限），換人則是好幾公尺——REPLANT_JUMP_M 落在兩者之間。
    // blockCommitRead 刻意不回傳 playerId（反作弊），所以只能從幾何跳變認人。
    if (tick < c.replantUntil) return c.x; // 重新踩定中：腳還沒接觸地面，動不了
    if (c.pendingX != null) { c.x = c.pendingX; c.pendingX = null; }
    if (Math.abs(live.x - c.x) > BLOCK_COMMIT.REPLANT_JUMP_M) {
      c.pendingX = live.x;
      c.replantUntil = tick + BLOCK_COMMIT.REPLANT_TICKS;
      return c.x; // 這幾 tick 站在原地重新踩定，之後才往新目標移動
    }
    c.x = live.x;
    return c.x;
  }
  // ② 在空中：不能橫移
  if (phase === ACTION_PHASE.AIR) return c.x;
  // ③ 落地後的 close 預算
  // 攔網分工卷 step2b：`chase` 改為 per-blocker（形狀同 `cover`／舊 `wallBail`）——
  // 它吃 `player`（移速／體力）與 `actor.x`（我現在站哪），本來就是每人不同的判斷；
  // 掛在團隊級時是第一個算出來的人寫進去、其餘人共讀他的布林。
  if (c.chase === undefined) {
    // 球自己的軌跡（人人看得見的物理）＝要追的人在哪、還剩多少時間；
    // 目標取**擊球點**不是過網點——落地那刻誰也不知道他會把球打去哪條線
    const hit = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
    const stepM = moveSpeed(player) * staminaPerfMul(game, player) * SIM_DT;
    c.chase = blockCloseBudget({
      fromX: actor.x,
      toX: hit?.x ?? game.ball.x,
      stepM,
      ticksLeft: hit ? hit.ticks - reactionTicks(player) : null,
      slack: BLOCK_COMMIT.CLOSE_SLACK,
    }).canClose;
  }
  return c.chase ? null : actor.x;
}
// ==== B1-SCAN-END ====

// §4 A1：這個人此刻「正在跑自己那條助跑線」嗎？（起步 tick 到了、收勢窗還沒過）
// 回傳 route（含起跳點）或 null。只在我方持球且已完成第一擊時成立——
// 接發（touches===0）與防守站位一格不動
function approachRunOf(aiState, playerId, tick, team, r) {
  if (r.possession !== team || r.touches < 1 || aiState.approach?.team !== team) return null;
  const route = approachRouteOf(aiState.approach.routes, playerId);
  if (!route) return null;
  // §9 契約：「正在跑」＝ chase（跑向起跳點）或 air（到位拔起後的收勢窗）——
  // 兩段的走位目標都是起跳點，實際的「停」由下方到位判定（gap < SETTLE）給，
  // 不由 tick 給（§2-6 兩次勝率 0% 換來的：停止條件用時間會在半路就叫停）
  const phase = routePhaseAt(route, tick);
  return phase === ACTION_PHASE.CHASE || phase === ACTION_PHASE.AIR ? route : null;
}

// §4 A1：這個人「已經在二傳觸球前起跑了」嗎？
// 只有一速／二速的 route 會在二傳觸球前跨過 startTick——三速的起步 tick 就是二傳
// 觸球那一刻，起跑與否交給既有的一氣呵成邏輯判（本輪一格不動）。
// 兩個條件都要成立（tempo 不是三速、且 startTick 真的已經過了），
// 因為「決策時點後移」不等於「取消一氣呵成」：還沒起跑的人照樣該在起點等
function approachLaunched(aiState, playerId, tick) {
  const route = aiState.approach ? approachRouteOf(aiState.approach.routes, playerId) : null;
  if (!route) return false;
  // 段 B2：帶正偏移的三速（＝交叉主攻者）與一速／二速同樣「二傳觸球前就跨過起步點」，
  // 一樣不能再叫他回助跑起點等（那就是倒著跑）。`comboLead > 0` 才成立 ⇒ 偏移為 0 的
  // 三速（所有非組合的線）逐值走原路徑。
  if (route.tempo === 'three' && !(route.comboLead > 0)) return false;
  // §9 契約：離開 wait ＝已經起跑（含收勢後的 release——起跑過就是起跑過）
  return routePhaseAt(route, tick) !== ACTION_PHASE.WAIT;
}

// 觸球選擇：第一擊墊給舉球點、第二擊舉給攻擊手、第三擊前排扣球／其餘送安全球
function chooseTouch(game, aiState, player, actor) {
  const team = player.teamId;
  const r = game.rally;
  if (r.touches === 0) {
    return ['receive', localToWorld(team, AI.SETTER_SPOT.lx, AI.SETTER_SPOT.lz)];
  }
  if (r.touches === 1) {
    if (aiState.setterDump && player.currentRole === 'setter') {
      // S 二次球：輕推對方淺區（前排第二擊過網合法；讓對手不敢放掉第二球）
      return ['spike', localToWorld(otherTeam(team), 1.5, 2.6), 0.3];
    }
    const a2 = setAimFor(
      game, team, aiState.attackerId, aiState.attackKind, aiState.attackTempo,
    );
    return ['set', localToWorld(team, a2.lx, a2.lz), a2.t];
  }
  // 第三擊：前排——或後排但站在攻擊線後（後排攻擊合法）——球夠高且能過網才扣
  const target = spikeTarget(game, team);
  const lzNow = TEAM_SIDE[team] * actor.z;
  const legalSpike =
    player.currentRole !== 'libero' && // 自由人不得攻擊（sim 端另有高球硬閘）
    (isFrontRow(game.match.rotations[team], player.id) ||
      lzNow > COURT.ATTACK_LINE + 0.05); // 後排：攻擊線後起跳＝合法
  const canSpike =
    legalSpike && game.ball.y >= AI.SPIKE_MIN_Y && spikeClearsNet(game, player, target);
  if (canSpike) {
    // W4(P4) 附錄 B-4 ace 反讀：宿敵 ace 且配套被讀死（counterRead 由呼叫端決定論
    // 注入）＝改打讓開的線——封線配套讓開中路重扣（兩層讀對後的唯一重扣縫）、
    // 讓開配套讓開斜線強攻。殺傷保留（重扣非輕推）、零隨機
    if (aiState.counterRead && aiState.counterRead.pid === player.id) {
      if (aiState.counterRead.openLine === 'middle') {
        return ['spike', localToWorld(otherTeam(team), 0, 4.8)];
      }
      const ballLx = TEAM_SIDE[team] * game.ball.x;
      return ['spike', localToWorld(otherTeam(team), -Math.sign(ballLx || 1) * 4.1, 5)];
    }
    // 攻擊選擇分支：小機率輕吊淺區（決定論 hash，不耗 game rng）——重扣仍是主體
    // 機率吃每隊風格參數（防守隊愛吊、紀律隊少吊）
    const { tipRate } = aiProfileOf(game, team);
    const tipRoll = hash01(game.rally.flightId * 563 + idHash(player.id) + (game.seed ?? 0));
    if (tipRoll < tipRate) {
      const tipLx = tipRoll < tipRate / 2 ? -1.2 : 1.2; // 吊左/右淺區
      return ['spike', localToWorld(otherTeam(team), tipLx, 2.3), 0.35];
    }
    return ['spike', target];
  }
  return ['receive', localToWorld(otherTeam(team), 0, 6.5)];
}

// 預估扣球是否過網（與 sim 實際擊球共用 flight.js 的同一公式，不另手刻）
function spikeClearsNet(game, player, target) {
  const b = game.ball;
  if ((b.z > 0) === (target.z > 0)) return false; // 目標須在對面
  const from = { x: b.x, y: b.y, z: b.z };
  // §十-4：預判用「全力揮擊」的目標過網高度（timing=1 ⇒ 帶下緣；與 sim 實擊同一分類/映射）
  const v = spikeVelocity(
    from,
    { x: target.x, y: BALL.RADIUS, z: target.z },
    spikeSpeed(player),
    TUNING.SPIKE_MIN_TIME,
    spikeClearanceFor(spikeRouteAt(game, player.teamId, game.actors[player.id].z, 1), 1),
  );
  const yNet = heightAtNet(from, v);
  // 門檻＝帶模型硬地板（NET+RADIUS+0.04，同 game.js SPIKE_CLEARANCE 註記）。
  // 舊值 +0.1（2.635）與快攻帶下緣 2.60 矛盾——滿蓄快攻恰達目標會被誤判非法，
  // 快攻整route 被壓熄（B1 回歸閘取樣餓死就是這樣抓到的）
  return yNet !== null && yNet >= COURT.NET_HEIGHT + BALL.RADIUS + 0.04;
}

// ==== A3-SCAN-BEGIN（工單 §5 純資訊武器掃描區：jumpSet 只准出現在本區與抽選處）====
// §5 A3 跳舉——**sim 裡唯一的效果就是這一行的高度上緣**。
// 站舉：等球墜到站立可及＋0.35m 才出手；跳舉：跳起來在扣球可及高度接管它。
// 於是二傳**更早**觸球、球從**更高**處出發（弧頂 TUNING.SET_APEX 不變 ⇒ 上升段更短），
// 攔網手從「球離手」到「球被扣」之間可用的 tick 就少了——那正是判讀時間窗。
//
// 沒有動、也不准動的東西（憲法「不增加球威力」的落地判準）：
//   ① 舉球的目標點（setAimFor）與散佈（scatterTarget 的每一個入參）
//   ② 舉球弧頂（game.js 的 SET_APEX／QUICK_APEX 二選一分支）
//   ③ 扣球的速度（spikeSpeed × timing）與落點散佈——jumpSet 不出現在任何扣球路徑上
function touchCeiling(player, action, jumpSet = false) {
  if (action === 'spike') return spikeReach(player);
  if (action === 'set' && jumpSet) return spikeReach(player);
  return standingReach(player) + 0.35;
}
// ==== A3-SCAN-END ====

// 發球目標：受球方深區，依總得分循環（決定論的落點變化）
const SERVE_ZONES = [
  { lx: 2.5, lz: 7.8 }, { lx: -2.5, lz: 7.8 }, { lx: 0, lz: 8.2 }, { lx: 2, lz: 6.5 },
];

// ==== D2-SERVE-BEGIN（工單 §7 D2「針對性發球」；零新 UI——發球選區面板一格未加）====
// 對手也會這樣打你：AI 發球會**指名**發給對方最該被吃掉 transition 的攻擊手。
// 他接了一傳 ⇒ attackPointsOf 把他降到 D2_PASSER_TIER（只剩兩翼高球）⇒ 對方本球少一條線。
//
// 為什麼只挑**後排**攻擊手：接發仲裁（arbitrate 的 formationExempt）本來就排除 S 與
// 前排 MB，而前排兩翼的責任區在 lz=3（網前）——瞄他等於發短球，那是工單 §10 明列
// 不做的 D3。深區發球在幾何上只可能被後排接到，所以「發給對方主攻手」＝發給後排的他。
// 挑誰：有效 trust 最高者（＝對方最倚賴的那條線；trust 是既有的公開量，不新增屬性），
// 平手取 id 序＝決定論。
export function serveTargetPidOf(game, team) {
  const opp = otherTeam(team);
  const rot = game.match.rotations[opp] ?? [];
  const pool = attackPointsOf(game, opp, null, 'perfect');
  let best = null;
  for (const pt of pool) {
    if (!isBackRow(rot, pt.pid)) continue;
    const trust = effectiveTrust(game, game.players[pt.pid]);
    if (!best || trust > best.trust + 1e-9
      || (Math.abs(trust - best.trust) <= 1e-9 && pt.pid < best.pid)) {
      best = { pid: pt.pid, trust };
    }
  }
  return best?.pid ?? null;
}

// 練習賽指名發球（2026-08-13）：**這一場固定發給誰**的顯式隊伍參數。
// ★ 為什麼不併進 aiProfileOf ★ 同 blockPersonaOf 的理由（見上）：那裡回的是一組機率，
// 這裡是一個具體對象，語意不同；且 aiProfileOf 的回傳形狀有既有測試在 deepEqual。
//
// ★ 為什麼要有這個參數 ★ 練習賽的「餵球給要練的人」原本借道 trust——把玩家 trust 拉高，
// 讓 serveTargetPidOf 挑中他。但那個函式回答的是「對方最該被吃掉 transition 的**攻擊手**」，
// 不是「我要練接發的人」，**同名不同義**：它的候選池 attackPointsOf 需要 techniques.pipe >= 1，
// 而生涯新人 pipe=0（careerState.js:267）⇒ 教學局玩家永遠選不到（實測 200 場 4727 個發球
// 回合，指名次數 0）。訓練要餵球給誰是**教練的決定**，不該由攻擊威脅評估代答。
// 未注入＝null＝完全走原路徑（快速比賽／正式賽零改變，sim-hash 不動）。
export function forcedServeTargetPidOf(game, team) {
  return game.aiProfiles?.[team]?.serveTargetPid ?? null;
}

function serveTarget(game, team) {
  const { score } = game.match;
  // 指名優先於四區循環與 SERVE_TARGET_RATE 骰子——教練餵球是 100% 的，不是一半。
  // ★ 仍受後排限制 ★ 對象在前排時**回落原路徑**而不是硬發過去：前排的接發責任區在
  // lz≈3（網前），瞄那裡＝短發球，那是工單 §10 明列不做的 D3。前排輪次練不到接發是
  // 這個機制的已知邊界（見 practiceMatch.js `serveToPlayer` 那段）。
  const forced = forcedServeTargetPidOf(game, team);
  if (forced != null) {
    const opp = otherTeam(team);
    const rot = game.match.rotations[opp] ?? [];
    if (isBackRow(rot, forced)) {
      return basePosition(opp, positionOf(rot, forced));
    }
  }
  // 針對率：一半的球指名、一半維持既有的四區循環——兩種發球都要看得見才叫「戰術」，
  // 全部指名等於落點恆定（對方每球都知道發給誰）。**未依治具校準**（工單 §11 禁止）
  const roll = hash01(score.A * 53 + score.B * 149 + 401 + (game.seed ?? 0));
  if (roll < AI.SERVE_TARGET_RATE) {
    const pid = serveTargetPidOf(game, team);
    if (pid) {
      // 瞄他的接發責任區（基準站位）＝他非接不可；深度由 POSITION_TEMPLATE 供給（lz 7）
      const opp = otherTeam(team);
      return basePosition(opp, positionOf(game.match.rotations[opp], pid));
    }
  }
  const zone = SERVE_ZONES[(score.A + score.B) % SERVE_ZONES.length];
  return localToWorld(otherTeam(team), zone.lx, zone.lz);
}
// ==== D2-SERVE-END ====

// 反應延遲：reaction 0–100 → 21–6 tick（0.35–0.1 秒）才起動。
// P2-a（2026-07-30 補償階段，§5.3 白名單「反應延遲公式係數」；convergence §5.12）：
// 基數 24 → 21（全員均等早 3 tick＝0.05s 起動；斜率 0.16 與地板 6 不動＝屬性差異
// 保留，實務屬性帶 reaction 50–75 不觸地板）。均等 buff 的兌現偏向「構不到的球
// 較多」的一方＝可及收斂下的弱側——P0＋P1 後 Δ決賽 −17.5 差 2.5pp 進帶的收口手段。
function reactionTicks(player) {
  return Math.max(6, Math.round(21 - player.attributes.reaction * 0.16));
}

// 扣球目標：瞄防守站位的縫隙（邊線帶/位置間縫/短球），依比分+flightId 循環
const SPIKE_ZONES = [
  { lx: 4.1, lz: 5 }, { lx: -4.1, lz: 5 }, { lx: 1.5, lz: 4.8 },
  { lx: -1.5, lz: 4.8 }, { lx: 0, lz: 2.3 },
];
function spikeTarget(game, team) {
  const { score } = game.match;
  const zone = SPIKE_ZONES[(score.A + score.B + game.rally.flightId) % SPIKE_ZONES.length];
  return localToWorld(otherTeam(team), zone.lx, zone.lz);
}

function homePosition(game, team, playerId) {
  const rot = game.match.rotations[team];
  return basePosition(team, positionOf(rot, playerId));
}

// 走位 Intent：方向 × 幅值。**不過衝**——剩餘距離小於一步時，把該 tick 的幅值裁到
// 「剛好走到」（消費端 game.js applyMove 只在 |move|>1 時正規化，|move|<1 ＝該比例的步長）。
// 沒有這道裁切時，滿速一步（0.0715m）會跨過目標、下一 tick 落進到位帶完全不動，
// 目標微移又彈出去＝滿速↔靜止的極限環（07-28 逐幀實測到的「原地跳舞」）
function moveIntent(game, playerId, tick, actor, target) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  const len = Math.hypot(dx, dz);
  let move = { x: 0, z: 0 };
  if (len >= AI.ARRIVE_EPS) {
    const player = game.players[playerId];
    // 與 applyMove 同一份步長公式（含疲勞折速）——兩邊算的是同一個 tick 的同一步
    const step = moveSpeed(player) * staminaPerfMul(game, player) * SIM_DT;
    const mag = Math.min(1, len / step);
    move = { x: (dx / len) * mag, z: (dz / len) * mag };
  }
  return createIntent({ playerId, tick, move, aim: { x: target.x, z: target.z } });
}

function clampCourtX(x) {
  const lim = COURT.WIDTH / 2 - 0.4;
  return Math.max(-lim, Math.min(lim, x));
}

// ==== §3 階段三：關牆行為 ====
//
// ★ 改制前的病（工單 §3.1 實測）★
// 三人以 `AI.BLOCK_SPREAD`（1.5 m）**固定間距整體平移** ⇒ 站距 p50 恰好 1.500 m、
// min 1.353、僅貼網者 p90 也是 1.500 ⇒ 間距是常數不是行為結果。
// 套上 1.0 m 單人帶，每對之間**永遠留 0.5 m 縫，牆一次都關不起來**。
//
// ★ 現在（工單 §3.2）★
//   主攔 ＝ 前排參戰者中**離判定出的攻擊點最近者**。
//          **不寫死角色分工表**——讓它從幾何長出來（§3.2 明文要求）。
//   其餘人 ＝ 依**當下 x 的排序**填相鄰肩位，偏移 ＝（自己的排名 − 主攔排名）× 肩距。
//          保序 ⇒ **永不交叉**；且不論主攔在左／中／右，三人恆形成一條**連續**的牆：
//          主攔在中＝對稱 ±肩距；主攔在邊＝整面牆往同一側疊
//          ——後者正是真實邊線攔網的形狀，不是退化。
//
// ★ 肩距 0.55 m 的來歷（不是對現值反推）★
// 工單 §3.2 拍板的**人體肩距**。配上階段五的單人半寬 0.5 m，三人帶寬恰為
// 0.55×2 + 0.5×2 ＝ **2.1 m** ＝ §3.2 寫的值，且相鄰者覆蓋區間相接**無縫**
// （x−0.55 者蓋到 x−0.05，x 者從 x−0.5 起）。
//
// ★ 純函式、零共享狀態 ★ 三人各自呼叫都算出同一份分工（輸入只有前排的 x 與 anchorX），
// 與既有「兩人各自從同樣輸入算出一致結論」的設計一致。
//
// ★ 邊線處理 ★ **整面牆一起平移**回場內，不逐人 clamp——逐人 clamp 會把兩人壓到
// 同一點而疊人，反而製造出比縫更糟的東西。
const BLOCK_SHOULDER_M = 0.55;

// 這個前排翼是不是「遠側翼」＝攻擊點在對側且離中線夠遠 ⇒ 不參戰、撤退補吊球。
// 抽成函式是為了讓「誰在牆上」與「誰站哪一格」吃**同一個判準**——
// 不一致的話，撤退者仍會被算進肩位排名，留下他本人不在的空格。
function blockFarWing(game, team, playerId, anchorX) {
  const role = game.players[playerId].currentRole;
  const lane = role === 'middle' ? 0 : role === 'outside' ? -1 : 1;
  const laneOff = TEAM_SIDE[team] * lane * AI.BLOCK_SPREAD;
  return lane !== 0 && Math.abs(anchorX) > 1.8
    && Math.sign(laneOff) !== Math.sign(anchorX);
}

// 退防補吊球點——**第三人與遠側翼共用同一個點**（同一個職責就該吃同一個判準，
// 與 blockFarWing 抽成函式的理由相同）。
//
// ★ 為什麼不得沿用舊座標（攔網分工卷 step2a 的第二半）★
// 舊的退防點有兩個：遠側翼寫死 `x = laneOff*2 = ±3.0`、`wallBail` 則是「原地不動」。
// 開卷補量（brief §1.3）量到吊球救不起來時**100% 落在離網 <3m**、離網 p50 2.41–2.45m、
// |橫向| p50 1.22–1.35m；而 ±3.0／±2.6 這個點離落點 **p50 4.33m、≤2m 只有 15.0%**
// ⇒ 站在那裡的人結構上碰不到吊球，「回落補吊球」名不副實。
//
// ★ 取值與理由（40 局、吊球落地得分 n=101 實測分佈推導）★
//   z ＝ ±2.6（**沿用不動**）：落點離網 p25/p50/p75 ＝ 2.25–2.30／2.41–2.45／2.64–2.70，
//        2.6 本來就落在四分位距正中間——離網那一軸從來不是病灶，動它只是製造無謂差異。
//   x ＝ anchorX × 0.4：吊球落在**攻擊點那一側**（守方 B 實測 85.0% 同側）但橫向幅度小
//        （|橫向| p50 1.2–1.4m、p90 也只有 1.58–1.85m）⇒ 目標要在「攻擊點與中軸之間」，
//        不是場邊；係數掃描（0／0.25／0.4／0.5／0.75／1.0）在 0.25–0.5 之間是平的，
//        取 0.4 是因為**它不是新發明**——`blockScheme === 'off'`（攔手讓開・收吊球）
//        用的就是 `anchorX * 0.4`，同一件事本來就該長同一個形狀。
//        實測：離落點 p50 1.20m、**≤2m 93%**（舊點 15.0%）。
const BLOCK_COVER_X_MUL = 0.4;
const BLOCK_COVER_LZ = 2.6;

function blockCoverSpot(team, anchorX) {
  return {
    x: clampCourtX(anchorX * BLOCK_COVER_X_MUL),
    z: TEAM_SIDE[team] * BLOCK_COVER_LZ,
  };
}

// 回傳 { [playerId]: { x, tier } }；tier ＝ **離 anchorX 的距離排名**
// （0＝最近＝主攔、1＝次近＝輔攔、2＝最遠＝第三人）。無人參戰回 null。
//
// ★ 攔網分工卷 step2c：牆中間那個 0.55m 的洞 ★
// step2a 引入的缺陷，收卷核對時抓到：**槽位與 tier 吃的是兩套不同的排序**——
// 槽位照「陣列索引」（x 由小到大）算，tier 照「離 anchorX 的距離」算。
// 舊註解寫「拿掉最遠那一格後，剩下兩格仍相鄰、不留內縫」，**那句話是錯的**：
// 退場者鎖存 cover 之後會往補吊球點（x ＝ anchorX×0.4）移動，攻擊點在中路時
// 那個點就在兩名留牆者中間 ⇒ ①他的陣列索引變成中間那格 ②他離 anchorX 反而最近、
// 排名升回 0 ⇒ 留下的兩人各自站 index 0 與 2、中間空一格。
// 實測（tools/triple-block-probe.mjs 40 局，曜石＝commit）：在窗兩人 x 全距 p50 **1.10m**
// ＝相隔一格；三支 read 臂 0.55m（read 判得晚，退場者還沒漂到中間，故只有 commit 顯形）。
// 診斷佐證：兩人在窗且全距 >0.8m 的 95 例中，**77 例**的第三人 x 卡在兩人之間，
// 樣本形如 `在窗x=[-0.55, +0.55]、第三人 B5@0.00(cover)`。
//
// 修法＝**讓排名與佔格吃同一個集合**：先照原判準（全員的距離排名）決定誰退，
// 退場者從**排名與佔格一起**拿掉，剩下的人重新連號佔格。於是「牆上的人」與
// 「參與佈局的人」永遠是同一批，兩套排序不可能再岔開。
// 判準本身一格未動（仍是「離 anchorX 最遠者退」），動的只是「退了之後怎麼排」。
//
// ★ 為什麼不會引入新的不一致 ★
// ① 「誰退」用鎖存三態（true／false／未鎖存）判：已鎖存者照鎖存值，未鎖存者才用本 tick
//    的距離排名——這正是呼叫端 `cp.cover` 的鎖存語意，兩邊同一套判準、不會各說各話。
// ② 因為「未鎖存」那一格用的是**與呼叫端相同的 live 排名**，同一 tick 內先算的人與
//    後算的人得到的 off 集合逐值相同（鎖存前後給出同一個答案）⇒ **與球員求值順序無關**，
//    純函式的性質沒有被鎖存狀態破壞。
// ③ 讀鎖存值時直接取 `plan.byPid[pid]?.cover`，**不走 blockPlanFor**——那個函式會為
//    不存在的 pid 建格並改寫 `plan.latest`，在此處呼叫等於讓查詢產生副作用。
// ④ 保序不變：留牆者仍照 x 由小到大連號佔格 ⇒ 永不交叉。
//
// ★ 攔網分工卷 step2a：tier 換了定義，因為原式是一個**恆假的判斷式** ★
// 舊式 `tier = Math.abs(i - main)` 算的是「**排序後的位置相鄰度**」而不是「離攻擊點多遠」。
// 前排三人時 main 只可能是 0/1/2，而 main=1（主攔剛好站中間）⇒ 三人的 tier 是 **1/0/1，
// 值 2 根本不存在** ⇒ 呼叫端那條「tier >= 2 才回落」對「主攔站中間」的情形**恆不成立**。
// 實測佐證（brief §1.2）：只把回落改成無條件、tier 維持舊式時，nJ=3 只從 70.4% 動到
// 71.7%＝沒動。這與剛修掉的二速 `takeoffLead` 是同一型的病：判斷式在半數合法輸入下恆偽。
// 改成距離排名後，前排三人都參戰時 tier 2 恆存在，分工規則才真的掛得上去。
// 排名的同分裁決（pid 較小者在前）與下方主攔挑選一致 ⇒ 距離最近者的排名恆為 0＝main。
function blockWallSlots(game, team, anchorX, coverLatch = null) {
  const rot = game.match.rotations[team];
  const front = rot
    .filter((pid) => isFrontRow(rot, pid) && !blockFarWing(game, team, pid, anchorX))
    .map((pid) => ({ pid, x: game.actors[pid].x }))
    // 排序鍵帶 pid：同 x 時仍是唯一順序（決定論，不靠陣列原順序）
    .sort((a, b) => (a.x - b.x) || (a.pid < b.pid ? -1 : 1));
  if (!front.length) return null;
  // 一組人（已照 x 排序）→ 連號佔格＋距離排名。兩者吃**同一個 rows**，這就是不留內縫的保證。
  const layout = (rows) => {
    let main = 0;
    for (let i = 1; i < rows.length; i += 1) {
      const d = Math.abs(rows[i].x - anchorX);
      const best = Math.abs(rows[main].x - anchorX);
      if (d < best || (d === best && rows[i].pid < rows[main].pid)) main = i;
    }
    const xs = rows.map((_, i) => anchorX + (i - main) * BLOCK_SHOULDER_M);
    // 整面牆平移回場內（牆寬遠小於場寬，兩端不可能同時超出）
    const lim = COURT.WIDTH / 2 - 0.4;
    const shift = Math.min(0, lim - Math.max(...xs)) + Math.max(0, -lim - Math.min(...xs));
    const rank = new Array(rows.length);
    rows.map((_, i) => i)
      .sort((a, b) => (Math.abs(rows[a].x - anchorX) - Math.abs(rows[b].x - anchorX))
        || (rows[a].pid < rows[b].pid ? -1 : 1))
      .forEach((i, r) => { rank[i] = r; });
    return { xs: xs.map((x) => x + shift), rank };
  };
  // 第一遍：全員在場的距離排名＝step2a 的分工判準（誰最遠誰退），一格未動
  const all = layout(front);
  // 誰不在牆上：已鎖存回落者照鎖存值；還沒鎖存的才用本 tick 的排名（＝呼叫端同一套判準）
  const off = new Set(front
    .filter((f, i) => {
      const c = coverLatch ? coverLatch(f.pid) : undefined;
      return c === undefined ? all.rank[i] >= 2 : c === true;
    })
    .map((f) => f.pid));
  const wall = front.filter((f) => !off.has(f.pid));
  // 全員都退（結構上不會發生：至多一人 tier>=2）時退回全員佈局，不讓牆憑空消失
  const base = wall.length ? wall : front;
  const { xs, rank } = base === front ? all : layout(base);
  const slots = {};
  base.forEach((f, i) => { slots[f.pid] = { x: xs[i], tier: rank[i] }; });
  // 退場者不佔牆格。仍回一格（tier >= 2 讓呼叫端走回落分支）；x 是「牆再延一格」的
  // 形式值——呼叫端拿到 tier>=2 必定回落補吊球，這個座標不會被用到。
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  for (const f of front) {
    if (slots[f.pid]) continue;
    slots[f.pid] = {
      x: clampCourtX(f.x < lo ? lo - BLOCK_SHOULDER_M : hi + BLOCK_SHOULDER_M),
      tier: Math.max(2, base.length),
    };
  }
  return slots;
}

// 以輪轉序回傳隊伍名單（顯式順序，不靠 Object.values 插入序）
function teamRoster(game, team) {
  return game.match.rotations[team].map((id) => game.players[id]);
}
