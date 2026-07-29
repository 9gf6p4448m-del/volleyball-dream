// D3 回合 AI — 雙層架構（純函式、決定論；隊友/對手/未來多人補位共用同一套）
//   協調層：每個 flight 指派一次「誰接球」（責任區 → 呼叫鎖定不可撤銷 → 最近者 → ID 序）
//   個體層：待命 → 判來球 → 移動到位 → 執行動作 → 回位
// 原則：寧可有人搶錯，不可兩人互讓（呼叫鎖定以 flightId 為鍵，天然不可撤銷、不打架）
// 難度＝堪打等級：動作正確、不玩心理戰、不打刁鑽落點（強度調參 Phase 2+）
import { BALL, COURT, SIM_DT } from './constants.js';
import { serverId } from './match.js';
import {
  otherTeam, basePosition, localToWorld, isFrontRow, isBackRow, positionOf, TEAM_SIDE,
} from './rotation.js';
import { standingReach, spikeReach, moveSpeed } from './player.js';
import { predictLanding, predictContactPoint, spikeVelocity, heightAtNet } from './flight.js';
import { createIntent } from './intent.js';
import {
  approachRoutesFor, approachStartOf, approachRouteOf, setAimFor, TAKEOFF,
  applyRouteKinds, routePhaseAt,
} from './approach.js';
import { ACTION_PHASE, actionPhaseAt } from './actionPhase.js';
import {
  blockLaneRead, digForBlock, blockCommitRead, blockCloseBudget,
  BLOCK_PERSONA, BLOCK_COMMIT,
} from './blockRead.js';
import { hash01 } from './rng.js';
import { TUNING, spikeSpeed } from './game.js';
import { trustToWeights, pickByWeights, effectiveTrust, applyFloorShare } from './trust.js';
import { STAMINA, staminaPerfMul } from './stamina.js';

// export：助跑起點的不變量測試要拿 TAKEOFF_* 算「起跳點在哪」，
// 常數必須是同一份——測試自己抄一份就會跟本體漂移（07-28）
export const AI = {
  SERVE_DELAY: 30,        // 可發球後再等的 tick 數（模擬哨音到發球的節奏）
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
  SETTER_SPOT: { lx: 1.2, lz: 1.2 },    // 一傳目標（隊伍視角）
  BLOCK_LZ: 0.6,          // 攔網站位深度
  BLOCK_SPREAD: 1.5,      // 攔網分工間距：中前正對球、兩翼各偏一個間距（不疊人）
  BLOCK_SCHEME_SHIFT: 0.9, // W4 附錄 B-1：L 配套封線站位偏移（封直線往邊線/封斜線往內）
  // §7 D2 針對性發球：多少比例的球指名發給對方後排主攻手（其餘走既有四區循環）。
  // 0.5＝兩種發球各半，「這球是不是衝著我來的」才讀得出來。設計值，**未依治具校準**
  SERVE_TARGET_RATE: 0.5,
  TIP_RATE: 0.1,          // AI 第三擊輕吊機率（攻擊分支：不被讀死；重扣為絕對主體）
  DUMP_RATE: 0.07,        // S 前排二次球機率（球到位時偶發）
  JUMP_SET_RATE: 0.35,    // §5 A3 跳舉發生率（理由見 ensureFlightPlan 的抽選處）
  DIG_SHIFT: 0.35,        // Dig 收縮：後排向球側平移係數（上限 ±1.2m）
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
    // §十-2 攔網三段狀態機的鎖定槽（{ team, x, enterTick, jumpTick, replantUntil, pendingX }）
    // ——**兩種人格共用**（read／commit 只差何時允許做決定）。與本波攻擊同壽命
    //（來球／新的一擊完成都清空），純由可觀察量重算＝VCR v2 重演時跟其餘 AI 狀態
    // 一起被逐 tick 重建，不需要進錄影白名單
    blockPlan: null,
    // §十-2 起算事件：二傳觸球那一 tick（{ team, tick }）——read 人格的反應延遲從這裡起算。
    // 選二傳觸球而非攻擊手起跳，是因為快攻在二傳觸球前就已離地（W1 實測 100%），
    // 等起跳就永遠來不及。這是**可觀察量**（球離手看得見），不是未來資訊
    setTouch: null,
  };
}

// 蒐集本 tick 全部 AI 的 Intent（excludeIds＝玩家操控者，AI 不代打）
// 輸出與玩家輸入同型的 Intent、走同一條管線進 sim —— sim 不知來源
export function aiCollectIntents(game, aiState, excludeIds = []) {
  ensureFlightPlan(game, aiState);
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
    // 同理：死球之後沒有攻擊要攔，攔網鎖定與起算事件都作廢
    aiState.blockPlan = null;
    aiState.setTouch = null;
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
  aiState.landingTeam = landing ? (landing.z >= 0 ? 'A' : 'B') : null;
  aiState.claimId = null;
  aiState.backupId = null;
  aiState.hitPoint = null;
  aiState.letDrop = false;

  if (!landing || !aiState.landingTeam) return;
  const team = aiState.landingTeam;
  const r = game.rally;

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
    // 攻擊分配：一傳品質決定戰術分支（到位＝全池/可用＝無快攻/勉強＝只剩兩翼高球）
    // × 站位合法池（AND）× trust 權重（傾向），決定論抽選
    const tier = passTierOf(team, landing);
    aiState.passTier = tier; // W3 S 玩法：分配面板讀同一份品質分檔（setOptions 消費）
    // §7 D2：本波接一傳的人＝剛剛那一觸的執行者。攻擊池與**玩家的分配面板**
    // （setOptions）都吃這一份，兩邊看到的是同一顆池（4.5A 的教訓：同一個判定寫
    // 在兩個地方遲早分岔）
    aiState.passReceiverId = r.lastToucherId ?? null;
    // §5 A2 路線組合：先決定「每條線往哪跑」（OH 的 left 可能變 cross），**再**選人。
    // 順序不可調換——選完人再改線＝二傳瞄的落點與該人助跑的終點是兩個地方
    const points = applyRouteKinds(
      attackPointsOf(game, team, aiState.claimId, tier, aiState.passReceiverId),
      { flightId: game.rally.flightId, seed: game.seed ?? 0, passTier: tier },
    );
    const pick = pickAttackPoint(game, team, aiState.claimId, tier, points);
    aiState.attackerId = pick?.pid ?? null;
    aiState.attackKind = pick?.kind ?? null; // 'left'|'cross'|'quick'|'right'|'pipe'|'dball'
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
      routes: approachRoutesFor(team, points, {
        setTick,
        flightId: game.rally.flightId,
        seed: game.seed ?? 0,
        passTier: tier,
        speedOf: (pid) => moveSpeed(game.players[pid]),
      }),
    };
    // §5 A3 跳舉：一傳到位（憲法 §三 A3「一傳到位時的既有分支下」）＋真的是 S 在舉
    // （備援代舉／救球仲裁者不跳舉——那種球本來就是勉強處理）＋種子決定論。
    // ★ 觸發率的取捨（實測背景）：一傳品質目前恆為 'perfect'（W2 簡報 D-3），
    //   所以「到位」這個條件**每球都成立**，真實世界的 60–80% 在這裡等於「每球都跳」
    //   ＝攔網手讀不到差別、資訊武器自我歸零。0.35 ≒ 每三球出現一次，
    //   與 §4 原定的二速比例同量級，讓「這球被壓縮了沒」保持可讀
    aiState.jumpSet =
      !!aiState.claimId &&
      game.players[aiState.claimId].currentRole === 'setter' &&
      tier === 'perfect' &&
      hash01(game.rally.flightId * 811 + 29 + (game.seed ?? 0)) < AI.JUMP_SET_RATE;
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

// 可及性預估：含反應延遲，從當前位置起跑能否在球落地前趕到落點可及圈。
// 寬鬆估（扣 REACH_RADIUS 緩衝）：估錯寧可「以為趕得上」——備援只在明顯來不及時
// 加派。planTick＝本 flight 起算點（landing.ticks 同一基準）
function canReachLanding(game, aiState, playerId) {
  const { landing } = aiState;
  if (!landing?.ticks) return true;
  const p = game.players[playerId];
  const a = game.actors[playerId];
  const gap = Math.hypot(a.x - landing.x, a.z - landing.z) - TUNING.REACH_RADIUS;
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
    // 殺球 dig 豁免（權重制）：S 責任區大幅縮小（他接了就沒人舉球）、前排 MB 縮小
    if (role === 'setter') zoneDist *= 3;
    else if (frontMb) zoneDist *= 1.8;
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
export function passTierOf(team, landing) {
  const spot = localToWorld(team, AI.SETTER_SPOT.lx, AI.SETTER_SPOT.lz);
  const d = Math.hypot(landing.x - spot.x, landing.z - spot.z);
  return d < 1.2 ? 'perfect' : d < 3 ? 'ok' : 'poor';
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
  if (bias === 'line') {
    // 偏移 1.3m（07-27 試玩回饋：0.9 在六人陣型裡看不見——指揮要有可見的重量）
    shift = Math.max(-2.2, Math.min(2.2, shift + Math.sign(ballLx) * 1.3));
  } else if (bias === 'cross') {
    shift = Math.max(-2.2, Math.min(2.2, shift - Math.sign(ballLx) * 1.3));
  } else if (bias === 'tip') {
    forward = 2.2; // 前壓短區（吊球斷點）
  }
  return {
    x: d.x + TEAM_SIDE[team] * shift,
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
      if (pd <= TUNING.REACH_RADIUS * AI.ATTEMPT_RADIUS && tick >= pa.divedUntil) {
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
      const radius = belowBand ? AI.ATTEMPT_RADIUS : AI.CLOSE_RADIUS;
      inReach = inBand && dist <= TUNING.REACH_RADIUS * radius && ball.vy < 0;
    } else {
      inReach = dist <= TUNING.REACH_RADIUS * AI.ATTEMPT_RADIUS && ball.vy < 0;
    }
    if (inReach) {
      const [action, aim, tOverride] = chooseTouch(game, aiState, player, actor);
      // §5 A3：跳舉只抬高「這一觸的高度上緣」（jumpSet 由 ensureFlightPlan 決定論抽選）。
      // AI 這一側的門檻與 sim 的 game.js:maxY 必須是同一個值，否則 AI 會送出
      // sim 當場駁回的 Intent（一次白等、下一 tick 才補上）——兩處各留註解互指
      const jumpSet = action === 'set' && !!aiState.jumpSet;
      if (action && ball.y <= touchCeiling(player, action, jumpSet)) {
        // AI 觸球品質基準 0.75（玩家 Perfect＝1.0 才有超越空間）；快攻舉球帶 t<0.5（低弧）
        let timing = tOverride ?? (action === 'spike' ? 1 : 0.75);
        // W3 L（附錄 A1）：收縮指令讀對且球到 L 手上＝Perfect 窗——機制屬於指令本身，
        // AI 代打（治具上下限臂）與真人走同一條規則（真人路徑在 matchControls 鏡像）
        if (action === 'receive' && r.touches === 0 && player.currentRole === 'libero'
          && digBiasCorrectFor(game, aiState, team)) {
          timing = 1.0;
        }
        return createIntent({ playerId, tick, action, aim, timing, jump: jumpSet });
      }
    }
    // AI 魚躍救球（接噴救球／方案A 全隊 AI 魚躍）：正常站立搆不到、但魚躍可及範圍內
    // 的低球，以 diveRate 機率撲救（對手 opponents 分級／我方綁玩家解鎖）。
    // 接噴補完（07-23 拍板）：不再限對方來球（touches===0）——隊友噴掉的一傳/二傳
    // （touches 1/2 的亂飛低球）主追與備援一樣可撲；第三觸撲救目標改過網安全球
    // （撲回自家二傳點＝白送第 4 擊犯規）。
    // roll 吃 flightId＝一個 flight 只決定一次（撲/不撲固定，非每 tick 骰）；倒地 42tick
    // 代價＋diveRate<1 是「球不落地不結束」與「rally 不爆長」的平衡閘
    if (ball.vy < 0 && ball.y <= TUNING.DIVE_MAX_Y
      && dist > TUNING.REACH_RADIUS
      && dist <= TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL
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
    // 站位：接來球瞄接觸點（球會被接到的水平位置＝人站球正下方，走位深度）；舉球/扣球
    // 維持瞄地板落點。下游微偏＝觸球點在身前、面向來球（真實接球站位）
    const target = (receivingIncoming && aiState.contactPoint) ? aiState.contactPoint : aiState.landing;
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
    const scheme = aiState.digBias?.team === team ? aiState.digBias.block : undefined;
    // ==== B1-SCAN-BEGIN（工單 §6 反作弊掃描區：本區內不得出現 attackerId）====
    // §十-2 三段狀態機的錨點。**本分支自此以下零 `game.ball.x`**（工單 §11-5 可 grep 驗）：
    // 改制前這裡是 `clampCourtX(game.ball.x + laneOff)`——攔網手逐 tick 直接追球的 x，
    // 而球最後會飛到攻擊手手上，等於用未來的答案本身當導航。
    //   planX == null ＝【讀】還沒被允許做決定 → 錨在場地中軸（陣型基準位）
    //   planX != null ＝【判／關】已選定攻擊手 → 錨在他身上
    const planX = blockPlanTargetX(game, aiState, team, player, actor, tick);
    const anchorX = planX ?? 0;
    // ==== B1-SCAN-END ====
    if (scheme === 'off') {
      return moveIntent(game, playerId, tick, actor, {
        x: clampCourtX(anchorX * 0.4 + laneOff), z: TEAM_SIDE[team] * 2.6,
      });
    }
    // 遠側翼（攻擊點在對側且離中線夠遠）＝不參與攔網、撤退到攻擊線附近補吊球。
    // 讀期 anchorX＝0 ⇒ 三人都先留在牆上，決定之後遠側翼才撤——這正是「判斷發生前
    // 不該知道要往哪邊撤」的誠實形狀
    const farWing = lane !== 0 && Math.abs(anchorX) > 1.8 &&
      Math.sign(laneOff) !== Math.sign(anchorX);
    if (farWing) {
      return moveIntent(game, playerId, tick, actor, {
        x: laneOff * 2, z: TEAM_SIDE[team] * 2.6,
      });
    }
    // 邊線夾擠防疊（真實合牆：翼守標誌桿、MB 收內側肩並牆）——
    // 翼吃 clamp 貼邊即可；MB 發現近側翼被邊線壓進間距內時自己往內讓。
    // 兩人各自從同樣輸入算出一致結論（純函式無共享狀態），且讓位方向恆向內＝永不交叉
    let nx = clampCourtX(anchorX + laneOff);
    if (lane === 0) {
      const bs = Math.sign(anchorX);
      const nearWingX = clampCourtX(anchorX + bs * AI.BLOCK_SPREAD);
      if (bs !== 0 && Math.abs(nearWingX - nx) < AI.BLOCK_SPREAD * 0.9) {
        nx = nearWingX - bs * AI.BLOCK_SPREAD;
      }
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
    const action = blockPlanAirborne(aiState, team, tick) ? 'block' : null;
    const it = moveIntent(game, playerId, tick, actor, netSpot);
    if (action) it.action = 'block';
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

  // 舉球員插上：我方接球階段（來球未觸），S 先跑到網前右側舉球點就位（前後排皆然）
  if (player.currentRole === 'setter' && r.possession !== team &&
      aiState.landingTeam === team && !aiState.letDrop) {
    return moveIntent(game, playerId, tick, actor, localToWorld(team, 2.2, 1.2));
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
function blockAimX(game, aiState, atkTeam, persona, opts) {
  if (persona === BLOCK_PERSONA.READ) {
    const hit = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
    if (hit) return { x: hit.x, contactTicks: hit.ticks };
  }
  const x = blockCommitRead(game, atkTeam, opts)?.x ?? null;
  return x == null ? null : { x, contactTicks: null };
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
function blockPlanAirborne(aiState, team, tick) {
  const c = aiState.blockPlan;
  if (!c || c.team !== team || c.jumpTick == null) return false;
  return actionPhaseAt(tick, {
    enterTick: c.enterTick, airTick: c.jumpTick, airTicks: TUNING.BLOCK_WINDOW,
  }) === ACTION_PHASE.AIR;
}

function blockPlanTargetX(game, aiState, team, player, actor, tick) {
  const r = game.rally;
  const atkTeam = r.possession;
  if (!atkTeam || atkTeam === team) return null;
  const persona = blockPersonaOf(game, team);
  const opts = { passTier: aiState.passTier ?? null, setterSpotLx: AI.SETTER_SPOT.lx };
  const c = aiState.blockPlan;
  if (!c || c.team !== team) {
    const unlocked = blockDecisionUnlocked(game, aiState, persona, player, tick);
    // 【判】選定攻擊點
    const aim = unlocked ? blockAimX(game, aiState, atkTeam, persona, opts) : null;
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
      aiState.blockPlan = {
        team, x: 0, enterTick: tick, jumpTick: null, replantUntil: -1, pendingX: null,
        blind: true, seen: false, jumpAt: null,
      };
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
    // enterTick＝鎖定那一 tick（§9 契約：事件驅動的段界＝事件發生時把 tick 寫下來）
    aiState.blockPlan = {
      team, x: read.x, enterTick: tick, jumpTick: null, replantUntil: -1, pendingX: null,
      jumpAt,
      // `seen` 一律起手為偽、由 chase 段逐 tick 自己觀察——**不得在建計畫時預設為真**：
      // read 的計畫是從**球的拋物線**建的（blockAimX 走 predictContactPoint），
      // 不是從「看到有人在跑」建的。預設為真會讓 read 在兩翼助跑手還沒進偵測範圍時
      // 就當場拔起（實測 set+14，球 set+89 才到）。
      blind: false, seen: false,
    };
    return read.x;
  }
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
    //   commit＝ 助跑下降沿（原封不動，v3 裁定書 R3「commit 本輪不動」）
    // read 改吃球的理由：起跳訊號的**來源不同就是人格差異**——read 讀球（等球出手看清楚，
    // 準但晚）、commit 賭中路（早，但可能賭錯）。原本要求兩者共用同一個可觀察事件，
    // 而實測證明**不存在**一個對兩人格都成立且指得對的事件（快攻沒有屬於真攻擊手的下降沿，
    // 兩翼的第一個下降沿指著中路誘餌）。
    if (c.jumpAt != null) {
      if (tick >= c.jumpAt) {
        c.jumpTick = tick; // 本 tick 起算 air
        return c.x;
      }
    } else {
      // commit（含 blind 退路），以及 read 在 predictContactPoint 罕見回不出值時的退路
      const liveRead = blockCommitRead(game, atkTeam, opts);
      if (liveRead) c.seen = true;
      if (r.touches >= 2 && c.seen && liveRead == null) {
        c.jumpTick = tick;
        return c.x;
      }
    }
    // `blind` ＝ 沒鎖定任何人的退路計畫：**不得改瞄**。
    // 他賭了中路卻沒賭中，代價就該由他自己付；容許事後跟著人跑＝把 commit 偷偷變成 read。
    if (c.blind) return c.x;
    const live = blockAimX(game, aiState, atkTeam, persona, opts);
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
  if (!route || route.tempo === 'three') return false;
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
  const v = spikeVelocity(
    from,
    { x: target.x, y: BALL.RADIUS, z: target.z },
    spikeSpeed(player),
    TUNING.SPIKE_MIN_TIME,
  );
  const yNet = heightAtNet(from, v);
  return yNet !== null && yNet >= COURT.NET_HEIGHT + BALL.RADIUS + 0.1;
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

function serveTarget(game, team) {
  const { score } = game.match;
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

// 反應延遲：reaction 0–100 → 24–8 tick（0.4–0.13 秒）才起動
function reactionTicks(player) {
  return Math.max(6, Math.round(24 - player.attributes.reaction * 0.16));
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

// 以輪轉序回傳隊伍名單（顯式順序，不靠 Object.values 插入序）
function teamRoster(game, team) {
  return game.match.rotations[team].map((id) => game.players[id]);
}
