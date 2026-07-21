// D3 回合 AI — 雙層架構（純函式、決定論；隊友/對手/未來多人補位共用同一套）
//   協調層：每個 flight 指派一次「誰接球」（責任區 → 呼叫鎖定不可撤銷 → 最近者 → ID 序）
//   個體層：待命 → 判來球 → 移動到位 → 執行動作 → 回位
// 原則：寧可有人搶錯，不可兩人互讓（呼叫鎖定以 flightId 為鍵，天然不可撤銷、不打架）
// 難度＝堪打等級：動作正確、不玩心理戰、不打刁鑽落點（強度調參 Phase 2+）
import { BALL, COURT } from './constants.js';
import { serverId } from './match.js';
import {
  otherTeam, basePosition, localToWorld, isFrontRow, positionOf, TEAM_SIDE,
} from './rotation.js';
import { standingReach, spikeReach } from './player.js';
import { predictLanding, spikeVelocity, heightAtNet } from './flight.js';
import { createIntent } from './intent.js';
import { TUNING, spikeSpeed } from './game.js';

const AI = {
  SERVE_DELAY: 30,        // 可發球後再等的 tick 數（模擬哨音到發球的節奏）
  ARRIVE_EPS: 0.06,       // 到位判定（m），避免抖動
  ATTEMPT_RADIUS: 0.95,   // 觸球嘗試距離 = REACH_RADIUS × 此係數
  SPIKE_MIN_Y: COURT.NET_HEIGHT * 0.85, // 球低於此高度就不硬扣、改送安全球
  SETTER_SPOT: { lx: 1.2, lz: 1.2 },    // 一傳目標（隊伍視角）
  ATTACK_LZ: 1.3,         // 舉球目標深度
  BLOCK_LZ: 0.6,          // 攔網站位深度
  BLOCK_SPREAD: 1.5,      // 攔網分工間距：中前正對球、兩翼各偏一個間距（不疊人）
};

// AI 協調層狀態：每個 flight 算一次、鎖定到 flight 結束（呼叫鎖定的實作）
export function createAiState() {
  return {
    flightId: -1, planTick: 0, landing: null, landingTeam: null,
    claimId: null, attackerId: null,
    letDrop: false,    // 判斷來球出界 → 全隊放球（讓它落地得分）
    calledFlight: -1,  // 玩家喊球已搶下的 flight（一球一次、不可反悔）
  };
}

// 蒐集本 tick 全部 AI 的 Intent（excludeIds＝玩家操控者，AI 不代打）
// callerId＝正在喊球的玩家：把本 flight 的呼叫鎖定搶過來，隊友退讓（一球一次）
// 輸出與玩家輸入同型的 Intent、走同一條管線進 sim —— sim 不知來源
export function aiCollectIntents(game, aiState, excludeIds = [], callerId = null) {
  ensureFlightPlan(game, aiState);
  applyPlayerCall(game, aiState, callerId);
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
  if (game.phase !== 'rally') return;
  if (aiState.flightId === game.rally.flightId) return; // 呼叫鎖定：本 flight 已指派，不重算

  aiState.flightId = game.rally.flightId;
  aiState.planTick = game.tick;
  const landing = predictLanding(game.ball);
  aiState.landing = landing;
  aiState.landingTeam = landing ? (landing.z >= 0 ? 'A' : 'B') : null;
  aiState.claimId = null;
  aiState.letDrop = false;

  if (!landing || !aiState.landingTeam) return;
  const team = aiState.landingTeam;
  const r = game.rally;

  // 落點方已用完三次觸球（如扣球掛網彈回本側）→ 依規則不得再觸，全隊放球讓它落地
  if (r.possession === team && r.touches >= 3) return;

  if (r.possession === team && r.touches === 1) {
    // 二傳：優先給舉球員；舉球員剛觸過球則走救球式仲裁（其他人代舉）
    const setter = teamRoster(game, team).find(
      (p) => p.currentRole === 'setter' && p.id !== r.lastToucherId,
    );
    aiState.claimId = setter ? setter.id : arbitrate(game, team, landing, r.lastToucherId);
    // 同時選定攻擊手（前排、非舉球員）；preferAttacker 前排時優先餵給他（玩家攻擊頻率）
    aiState.attackerId = pickAttacker(game, team, aiState.claimId, aiState.preferAttacker);
  } else if (r.possession === team && r.touches === 2) {
    // 第三擊：先前選定的攻擊手；不成立則仲裁補位
    const atk = aiState.attackerId;
    aiState.claimId =
      atk && atk !== r.lastToucherId && game.players[atk]
        ? atk
        : arbitrate(game, team, landing, r.lastToucherId);
  } else {
    // 來球（發球/對方攻擊/自由球）：先判界內外，再責任區仲裁
    // 出界判斷（含誤差）：明顯出界＝放球讓它落地得分；壓線球寧可接（寧搶錯）
    const claimer = arbitrate(game, team, landing, r.lastToucherId);
    const outDist = landingOutDistance(landing);
    if (outDist > 0 && claimer && outDist > judgeMargin(game, claimer)) {
      aiState.claimId = null;
      aiState.letDrop = true; // 全隊看它出界
    } else {
      aiState.claimId = claimer;
    }
    aiState.attackerId = null;
  }
}

// 玩家喊球：把本 flight 的鎖定搶過來（一球只能喊一次、喊了不可反悔——呼叫即鎖定）
function applyPlayerCall(game, aiState, callerId) {
  if (!callerId || game.phase !== 'rally') return;
  if (aiState.calledFlight === aiState.flightId) return;
  const caller = game.players[callerId];
  if (!caller || aiState.landingTeam !== caller.teamId) return;
  if (aiState.claimId === callerId) return;
  aiState.claimId = callerId;
  aiState.letDrop = false; // 玩家喊了就是要打，出界與否自己負責
  aiState.calledFlight = aiState.flightId;
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
  const jitter = (hash01(game.rally.flightId * 131 + idHash(playerId)) - 0.5) * 0.3;
  return Math.max(0.08, base + jitter);
}

function hash01(n) {
  let x = Math.imul(n | 0, 2654435761);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function idHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = h * 31 + id.charCodeAt(i);
  return h;
}

// 「誰接球」仲裁（定死，決定論）：
// 1. 責任區＝各人輪轉基準位的勢力範圍（比基準位到落點距離）
// 2. 交界時比當前位置距離　3. 仍平手比固定 ID 序
function arbitrate(game, team, landing, excludeId) {
  const rot = game.match.rotations[team];
  let best = null;
  for (const pid of rot) {
    if (pid === excludeId) continue;
    const pos = positionOf(rot, pid);
    const base = basePosition(team, pos);
    const zoneDist = Math.hypot(base.x - landing.x, base.z - landing.z);
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

// 攻擊手輪替：前排、非舉球員，以比分+flightId 循環（決定論的變化）
// preferId：若該球員在候選內（前排、非舉球員）則優先選他（玩家進攻決策用）
function pickAttacker(game, team, setterId, preferId) {
  const rot = game.match.rotations[team];
  const candidates = rot.filter((pid) => isFrontRow(rot, pid) && pid !== setterId);
  if (candidates.length === 0) return null;
  if (preferId && candidates.includes(preferId)) return preferId;
  const { score } = game.match;
  return candidates[(score.A + score.B + game.rally.flightId) % candidates.length];
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
        return createIntent({ playerId, tick, action: 'serve', aim: serveTarget(game, team) });
      }
      return null; // 發球員原地等節奏
    }
    return moveIntent(playerId, tick, actor, homePosition(game, team, playerId));
  }

  if (game.phase !== 'rally') return null;
  const r = game.rally;

  // 被呼叫鎖定的接球者：先吃反應延遲（reaction 屬性），再移動到預測落點，球進可及範圍且下墜時出手
  if (aiState.claimId === playerId && aiState.landing) {
    if (tick - aiState.planTick < reactionTicks(player)) return null; // 判來球中，尚未起動
    const ball = game.ball;
    const dist = Math.hypot(ball.x - actor.x, ball.z - actor.z);
    const inReach = dist <= TUNING.REACH_RADIUS * AI.ATTEMPT_RADIUS && ball.vy < 0;
    if (inReach) {
      const [action, aim] = chooseTouch(game, aiState, player, actor);
      if (action && ball.y <= touchCeiling(player, action)) {
        // AI 觸球品質基準 0.75（玩家 Perfect 時機＝1.0 才有超越空間）；扣球力度全開
        const timing = action === 'spike' ? 1 : 0.75;
        return createIntent({ playerId, tick, action, aim, timing });
      }
    }
    // 站位：落點的下游側（順球飛行方向退 0.3m）——觸球點在身前、面向來球（真實接球站位）
    const sp = Math.hypot(ball.vx, ball.vz);
    const off = sp > 0.5 ? 0.3 : 0;
    return moveIntent(playerId, tick, actor, {
      x: aiState.landing.x + (off ? (ball.vx / sp) * off : 0),
      z: aiState.landing.z + (off ? (ball.vz / sp) * off : 0),
    });
  }

  // 攔網手：對方持球進攻節奏中，前排沿網組牆；對方起扣即開時機窗
  // 分工：中前(P3)正對球、右前(P2)/左前(P4)各偏一個間距——散開成牆不疊人
  const opponentHasBall = r.possession && r.possession !== team;
  if (opponentHasBall && isFrontRow(game.match.rotations[team], playerId)) {
    const pos = positionOf(game.match.rotations[team], playerId);
    const lane = pos === 3 ? 0 : pos === 2 ? 1 : -1; // 隊伍視角：右=+1
    const netSpot = {
      x: clampCourtX(game.ball.x + TEAM_SIDE[team] * lane * AI.BLOCK_SPREAD),
      z: TEAM_SIDE[team] * AI.BLOCK_LZ,
    };
    const action = r.profile === 'spike' && aiState.landingTeam === team ? 'block' : null;
    const it = moveIntent(playerId, tick, actor, netSpot);
    if (action) it.action = 'block';
    return it;
  }

  // 其餘人回輪轉基準位待命
  return moveIntent(playerId, tick, actor, homePosition(game, team, playerId));
}

// 觸球選擇：第一擊墊給舉球點、第二擊舉給攻擊手、第三擊前排扣球／其餘送安全球
function chooseTouch(game, aiState, player, actor) {
  const team = player.teamId;
  const r = game.rally;
  if (r.touches === 0) {
    return ['receive', localToWorld(team, AI.SETTER_SPOT.lx, AI.SETTER_SPOT.lz)];
  }
  if (r.touches === 1) {
    const atkId = aiState.attackerId;
    const lane = atkId ? -TEAM_SIDE[team] * game.actors[atkId].x : 2; // 攻擊手所在的隊伍視角 lx
    return ['set', localToWorld(team, lane, AI.ATTACK_LZ)];
  }
  // 第三擊：前排、球夠高、且預估能過網才扣；否則送對方深區安全球（後排補位不硬扣，避免違例）
  const target = spikeTarget(game, team);
  const canSpike =
    isFrontRow(game.match.rotations[team], player.id) &&
    game.ball.y >= AI.SPIKE_MIN_Y &&
    spikeClearsNet(game, player, target);
  if (canSpike) return ['spike', target];
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

function touchCeiling(player, action) {
  return action === 'spike' ? spikeReach(player) : standingReach(player) + 0.35;
}

// 發球目標：受球方深區，依總得分循環（決定論的落點變化）
const SERVE_ZONES = [
  { lx: 2.5, lz: 7.8 }, { lx: -2.5, lz: 7.8 }, { lx: 0, lz: 8.2 }, { lx: 2, lz: 6.5 },
];
function serveTarget(game, team) {
  const { score } = game.match;
  const zone = SERVE_ZONES[(score.A + score.B) % SERVE_ZONES.length];
  return localToWorld(otherTeam(team), zone.lx, zone.lz);
}

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

function moveIntent(playerId, tick, actor, target) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  const len = Math.hypot(dx, dz);
  const move = len < AI.ARRIVE_EPS ? { x: 0, z: 0 } : { x: dx / len, z: dz / len };
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
