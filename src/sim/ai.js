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
import { trustToWeights, pickByWeights } from './trust.js';

const AI = {
  SERVE_DELAY: 30,        // 可發球後再等的 tick 數（模擬哨音到發球的節奏）
  ARRIVE_EPS: 0.06,       // 到位判定（m），避免抖動
  ATTEMPT_RADIUS: 0.95,   // 觸球嘗試距離 = REACH_RADIUS × 此係數
  SPIKE_MIN_Y: COURT.NET_HEIGHT * 0.85, // 球低於此高度就不硬扣、改送安全球
  SETTER_SPOT: { lx: 1.2, lz: 1.2 },    // 一傳目標（隊伍視角）
  ATTACK_LZ: 1.3,         // 舉球目標深度
  BLOCK_LZ: 0.6,          // 攔網站位深度
  BLOCK_SPREAD: 1.5,      // 攔網分工間距：中前正對球、兩翼各偏一個間距（不疊人）
  TIP_RATE: 0.1,          // AI 第三擊輕吊機率（攻擊分支：不被讀死；重扣為絕對主體）
  DUMP_RATE: 0.07,        // S 前排二次球機率（球到位時偶發）
  DIG_SHIFT: 0.35,        // Dig 收縮：後排向球側平移係數（上限 ±1.2m）
};

// AI 協調層狀態：每個 flight 算一次、鎖定到 flight 結束（呼叫鎖定的實作）
export function createAiState() {
  return {
    flightId: -1, planTick: 0, landing: null, landingTeam: null,
    claimId: null, attackerId: null, attackKind: null,
    setterDump: false, // S 前排二次球（本 flight 決定論抽選）
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
    // 攻擊分配：站位合法池（AND）× trust 權重（傾向），決定論抽選
    const pick = pickAttackPoint(game, team, aiState.claimId);
    aiState.attackerId = pick?.pid ?? null;
    aiState.attackKind = pick?.kind ?? null; // 'left'|'quick'|'right'|'pipe'|'dball'
    // S 二次球（偶發）：S 前排、一傳到位（落點近網）→ 小機率直接處理第二球
    aiState.setterDump =
      !!aiState.claimId &&
      game.players[aiState.claimId].currentRole === 'setter' &&
      isFrontRow(game.match.rotations[team], aiState.claimId) &&
      TEAM_SIDE[team] * landing.z < 3.2 &&
      hash01(game.rally.flightId * 331 + 7 + (game.seed ?? 0)) < AI.DUMP_RATE;
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
    // 非殺球來球（發球/free ball）＝陣型排除 S/前排 MB（見 arbitrate）
    const claimer = arbitrate(game, team, landing, r.lastToucherId, r.profile !== 'spike');
    const outDist = landingOutDistance(landing);
    if (outDist > 0 && claimer && outDist > judgeMargin(game, claimer)) {
      aiState.claimId = null;
      aiState.letDrop = true; // 全隊看它出界
    } else {
      aiState.claimId = claimer;
    }
    aiState.attackerId = null;
    aiState.attackKind = null;
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
  const jitter = (hash01(game.rally.flightId * 131 + idHash(playerId) + (game.seed ?? 0)) - 0.5) * 0.3;
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
// formationExempt=true（發球接發＋free ball 等非殺球來球）：S 與前排 MB
// 【陣型排除】不進候選——真實排球連 free ball 都不讓 S 接第一球（他要舉球）、
// 前排 MB 要準備快攻；剩餘四人涵蓋全場，慢球飛行時間內任何落點都可達。
// 只有對方【殺球】的 dig 不得已（權重制縮小責任區、極近仍救）
function arbitrate(game, team, landing, excludeId, formationExempt = false) {
  const rot = game.match.rotations[team];
  let best = null;
  for (const pid of rot) {
    if (pid === excludeId) continue;
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
export function attackPointsOf(game, team, setterId) {
  const rot = game.match.rotations[team];
  const pts = [];
  for (const pid of rot) {
    if (pid === setterId) continue;
    const p = game.players[pid];
    const front = isFrontRow(rot, pid);
    const role = p.currentRole;
    if (front) {
      if (role === 'outside') pts.push({ pid, kind: 'left', rowFactor: 1 });
      else if (role === 'middle') pts.push({ pid, kind: 'quick', rowFactor: 1 });
      else if (role === 'opposite') pts.push({ pid, kind: 'right', rowFactor: 1 });
      // S 前排不進池；libero 前排不存在（預留）
    } else {
      if (role === 'outside') pts.push({ pid, kind: 'pipe', rowFactor: 0.5 });
      else if (role === 'opposite') pts.push({ pid, kind: 'dball', rowFactor: 0.5 });
      // MB/S 後排不進池；libero（Phase 2+）後排替換於此掛鉤
    }
  }
  return pts;
}

// 站位交換（真實排球：發球觸球後前後排都跑職責位）——
// 前排：OH 左翼、MB 中、OPP/S 右翼
// 後排：OH 後中（pipe 準備位）、OPP/S 右後（D 球/插上起點）、MB 左後
// （自由人 Phase 2 於左後替換後排 MB 掛鉤）
export function dutyPosition(game, team, playerId) {
  const rot = game.match.rotations[team];
  const role = game.players[playerId].currentRole;
  if (isFrontRow(rot, playerId)) {
    const lx = role === 'outside' ? -3 : role === 'middle' ? 0 : 3;
    return localToWorld(team, lx, 3);
  }
  const lx = role === 'outside' ? 0 : role === 'middle' ? -3 : 3;
  return localToWorld(team, lx, 7);
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
  if (role === 'middle') return localToWorld(team, 0, 6.6); // 深位保險（長彈回）
  const sideLx = role === 'outside' ? -1.5 : 1.5;
  const lx = Math.max(-4.2, Math.min(4.2, atkLx + sideLx));
  return localToWorld(team, lx, Math.min(atkLz + 1.5, 7.5));
}

// 二傳落點：前後排皆已換位 → 各攻擊點固定（真實排球的進攻座標）
// 前排 OH 左翼/OPP 右翼高球、MB 面前低弧快攻；
// 後排 pipe 中路偏左（後中 OH）、D 球右路（右後 OPP）——皆壓攻擊線後（合法起跳）
export function setAimFor(game, team, attackerId, kind) {
  if (kind === 'quick') return { lx: 0, lz: 1.0, t: 0.4 }; // t<0.5＝sim 低弧快球
  if (kind === 'left') return { lx: -3, lz: 1.3, t: 0.75 };
  if (kind === 'right') return { lx: 3, lz: 1.3, t: 0.75 };
  if (kind === 'pipe') return { lx: -1, lz: 3.6, t: 0.75 };
  if (kind === 'dball') return { lx: 2.6, lz: 3.6, t: 0.75 };
  return { lx: 2, lz: AI.ATTACK_LZ, t: 0.75 };
}

// 依 trust 權重決定論抽選攻擊點（無任何硬寫比例——權重全來自 Player.trust.fromSetter）
function pickAttackPoint(game, team, setterId) {
  const pts = attackPointsOf(game, team, setterId);
  if (pts.length === 0) return null;
  const entries = pts.map((pt) => ({
    ...pt, trust: game.players[pt.pid].trust.fromSetter,
  }));
  const weights = trustToWeights(entries);
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
      const [action, aim, tOverride] = chooseTouch(game, aiState, player, actor);
      if (action && ball.y <= touchCeiling(player, action)) {
        // AI 觸球品質基準 0.75（玩家 Perfect＝1.0 才有超越空間）；快攻舉球帶 t<0.5（低弧）
        const timing = tOverride ?? (action === 'spike' ? 1 : 0.75);
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
    // 遠側翼（球在對側且離中線夠遠）＝不參與攔網、撤退到攻擊線附近補吊球
    const farWing = lane !== 0 && Math.abs(game.ball.x) > 1.8 &&
      Math.sign(laneOff) !== Math.sign(game.ball.x);
    if (farWing) {
      return moveIntent(playerId, tick, actor, {
        x: laneOff * 2, z: TEAM_SIDE[team] * 2.6,
      });
    }
    // 邊線夾擠防疊（真實合牆：翼守標誌桿、MB 收內側肩並牆）——
    // 翼吃 clamp 貼邊即可；MB 發現近側翼被邊線壓進間距內時自己往內讓。
    // 兩人各自從同樣輸入算出一致結論（純函式無共享狀態），且讓位方向恆向內＝永不交叉
    let nx = clampCourtX(game.ball.x + laneOff);
    if (lane === 0) {
      const bs = Math.sign(game.ball.x);
      const nearWingX = clampCourtX(game.ball.x + bs * AI.BLOCK_SPREAD);
      if (bs !== 0 && Math.abs(nearWingX - nx) < AI.BLOCK_SPREAD * 0.9) {
        nx = nearWingX - bs * AI.BLOCK_SPREAD;
      }
    }
    const netSpot = { x: nx, z: TEAM_SIDE[team] * AI.BLOCK_LZ };
    const action = r.profile === 'spike' && aiState.landingTeam === team ? 'block' : null;
    const it = moveIntent(playerId, tick, actor, netSpot);
    if (action) it.action = 'block';
    return it;
  }

  // Dig 收縮（防守陣型 v0）：對方組織/起扣時，後排向球側收縮就防守位
  if (opponentHasBall && !receivingArc &&
      !isFrontRow(game.match.rotations[team], playerId)) {
    const d = dutyPosition(game, team, playerId);
    const ballLx = TEAM_SIDE[team] * game.ball.x;
    const shift = Math.max(-1.2, Math.min(1.2, ballLx * AI.DIG_SHIFT));
    return moveIntent(playerId, tick, actor, {
      x: d.x + TEAM_SIDE[team] * shift,
      z: d.z - TEAM_SIDE[team] * 0.8, // 收前 0.8m（lz 7→6.2）：防守預備深度
    });
  }

  // 舉球員插上：我方接球階段（來球未觸），S 先跑到網前右側舉球點就位（前後排皆然）
  if (player.currentRole === 'setter' && r.possession !== team &&
      aiState.landingTeam === team && !aiState.letDrop) {
    return moveIntent(playerId, tick, actor, localToWorld(team, 2.2, 1.2));
  }

  // Cover（攻擊掩護）：我方攻擊起跳/出手階段，非攻擊手就掩護位——
  // 二傳下墜（攻擊者進入起跳流程）起動、扣球飛行中維持（等攔回彈）
  if (r.possession === team && aiState.attackerId && aiState.attackerId !== playerId &&
      ((r.touches === 2 && game.ball.vy < 0) ||
        (r.touches === 3 && r.profile === 'spike'))) {
    return moveIntent(
      playerId, tick, actor, coverPosition(game, team, playerId, aiState.attackerId),
    );
  }

  // 其餘人待命：rally 中跑職責位（前排站位交換）、非 rally 回輪轉基準位
  return moveIntent(playerId, tick, actor, dutyPosition(game, team, playerId));
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
    const a2 = setAimFor(game, team, aiState.attackerId, aiState.attackKind);
    return ['set', localToWorld(team, a2.lx, a2.lz), a2.t];
  }
  // 第三擊：前排——或後排但站在攻擊線後（後排攻擊合法）——球夠高且能過網才扣
  const target = spikeTarget(game, team);
  const lzNow = TEAM_SIDE[team] * actor.z;
  const legalSpike =
    isFrontRow(game.match.rotations[team], player.id) ||
    lzNow > COURT.ATTACK_LINE + 0.05; // 後排：攻擊線後起跳＝合法
  const canSpike =
    legalSpike && game.ball.y >= AI.SPIKE_MIN_Y && spikeClearsNet(game, player, target);
  if (canSpike) {
    // 攻擊選擇分支：小機率輕吊淺區（決定論 hash，不耗 game rng）——重扣仍是主體
    const tipRoll = hash01(game.rally.flightId * 563 + idHash(player.id) + (game.seed ?? 0));
    if (tipRoll < AI.TIP_RATE) {
      const tipLx = tipRoll < AI.TIP_RATE / 2 ? -1.2 : 1.2; // 吊左/右淺區
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
