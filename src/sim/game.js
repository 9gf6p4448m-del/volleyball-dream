// Phase 1 比賽模擬組裝層 — 模擬核心唯一入口（純 JS、零 three.js/DOM）
// 鐵律：stepGame 只吃 Intent（玩家/AI/網路同型，不知來源）；固定步長；隨機只走種子 PRNG
import { SIM_DT, COURT, BALL } from './constants.js';
import { createBall, stepBall } from './ball.js';
import { createMatch, serverId, pointTo, isFourHits } from './match.js';
import {
  TEAM_SIDE, otherTeam, basePosition, servePosition,
  isBackRow, isInFrontZone, landedCourtTeam,
} from './rotation.js';
import { createPlayer, standingReach, spikeReach, blockReach, moveSpeed } from './player.js';
import { velocityForApex, spikeVelocity } from './flight.js';
import { seedRng, rand } from './rng.js';

// 遊戲層調參常數（骨架版；H 區手感層只調數值、不動結構）
export const TUNING = {
  SERVE_DEAD_TICKS: 60,   // 死球哨音到可發球的間隔
  REACH_RADIUS: 1.3,      // 觸球水平可及距離（m）
  TOUCH_COOLDOWN: 15,     // 同一人再次觸球的最短 tick 間隔（物理防抖）TODO Phase 2：完整雙擊判定
  SCATTER_MAX: 1.7,       // 精度屬性=0 時的落點散佈半徑（m）
  BLOCK_WINDOW: 24,       // block intent 的有效 tick 窗口
  BLOCK_REACH_X: 1.1,     // 攔網水平涵蓋半徑（m）
  SERVE_APEX: 4.6,        // 各球路弧頂高度（m）
  RECEIVE_APEX: 4.8,
  SET_APEX: 5.2,
  SPIKE_SPEED_BASE: 9,    // 扣球速度 = BASE + power × PER（m/s）
  SPIKE_SPEED_PER: 0.17,
  SPIKE_MIN_TIME: 0.18,   // 扣球最短飛行時間（避免零距離除法）
  // H3 視線欺敵曲線（騙敵線性、失誤平方；試玩調參用，結構不變）
  THETA_MAX_DEG: 45,      // 視線與實際擊球方向的最大有效夾角
  DECEIVE_GAIN: 0.7,      // 騙過攔網機率 = min(θ/θmax,1) × 此值（線性）
  ERROR_GAIN: 0.5,        // 自身失誤增量 = (θ/θmax)² × 此值（平方）
};

// teams = { A: [6 個 Player], B: [6 個 Player] }；陣列順序即開局輪轉（index 0 = P1）
export function createGame({ seed = 1, teams } = {}) {
  const rosters = teams ?? createDefaultTeams();
  const players = {};
  const actors = {};
  for (const team of ['A', 'B']) {
    for (const p of rosters[team]) {
      players[p.id] = p;
      actors[p.id] = { x: 0, z: 0, px: 0, pz: 0, blockUntil: -1, lastTouchTick: -9999 };
    }
  }
  const state = {
    tick: 0,
    rngState: seedRng(seed),
    players,
    actors,
    match: createMatch({
      rotationA: rosters.A.map((p) => p.id),
      rotationB: rosters.B.map((p) => p.id),
    }),
    phase: 'serve', // 'serve' | 'rally' | 'set_over'
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
      touchLockTick: -1, // 每 tick 至多一次觸球（先到先得，順序＝Intent 陣列序，決定論）
    },
    events: [], // 完整事件日誌（測試/回放用）
  };
  setupServePhase(state);
  return state;
}

// 推進一個固定步長。intents：本 tick 生效的 Intent 陣列（玩家與 AI 混在一起，sim 不區分）
// 回傳本 tick 產生的事件陣列
export function stepGame(state, intents = []) {
  if (state.phase === 'set_over') return [];
  const ev = [];

  // 快照上一步位置：供 render 層插值（同 ball 的 px/py/pz 慣例）
  for (const a of Object.values(state.actors)) {
    a.px = a.x;
    a.pz = a.z;
  }

  for (const it of intents) {
    if (it.tick !== state.tick) continue; // 只吃本 tick 的 Intent（決定論保護）
    const actor = state.actors[it.playerId];
    if (!actor) continue;
    applyMove(state, actor, it);
    if (it.action) tryAction(state, it, ev);
  }

  if (state.phase === 'rally') stepRally(state, ev);

  state.tick += 1;
  state.events.push(...ev);
  return ev;
}

// ---- Intent 消費 ----

function applyMove(state, actor, intent) {
  let { x = 0, z = 0 } = intent.move ?? {};
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  const player = state.players[intent.playerId];
  const speed = moveSpeed(player);

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

  if (intent.action === 'block') {
    // 攔網＝開啟時機窗；是否攔到在球過網瞬間結算（tryBlock）
    actor.blockUntil = state.tick + TUNING.BLOCK_WINDOW;
    return;
  }

  // receive / set / spike：觸球嘗試
  if (rally.touchLockTick === state.tick) return; // 本 tick 已有人觸球
  if (state.tick - actor.lastTouchTick < TUNING.TOUCH_COOLDOWN) return;
  // 發球飛行中，發球方全隊不得觸球（發球必須過網；掛網落回本方＝自然失分）
  if (rally.profile === 'serve' && player.teamId === rally.lastTouchTeam) return;

  const dist = Math.hypot(ball.x - actor.x, ball.z - actor.z);
  if (dist > TUNING.REACH_RADIUS) return;
  const maxY = intent.action === 'spike' ? spikeReach(player) : standingReach(player) + 0.35;
  if (ball.y > maxY || ball.y < BALL.RADIUS) return;

  executeTouch(state, intent, player, actor, ev);
}

function executeTouch(state, intent, player, actor, ev) {
  const { rally, ball } = state;
  const team = player.teamId;
  const newCount = rally.touches + 1;

  // 規則：觸球上限 3（第 4 次觸球即犯規）
  if (isFourHits(newCount)) {
    settlePoint(state, otherTeam(team), 'FOUR_HITS', ev);
    return;
  }
  // 規則：後排攻擊限制（後排球員於前區、高於網上緣完成攻擊＝違例）
  // TODO Phase 2：依起跳腳離地位置判定（現以觸球當下位置簡化）
  if (
    intent.action === 'spike' &&
    isBackRow(state.match.rotations[team], player.id) &&
    isInFrontZone(team, actor.z) &&
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
  const target = scatterTarget(
    state, intent.aim, player.attributes.control, intent.action, dec.errorBoost,
  );
  let v;
  if (intent.action === 'spike') {
    v = spikeVelocity(
      from,
      { x: target.x, y: BALL.RADIUS, z: target.z },
      spikeSpeed(player),
      TUNING.SPIKE_MIN_TIME,
    );
  } else {
    const apex = intent.action === 'set' ? TUNING.SET_APEX : TUNING.RECEIVE_APEX;
    v = velocityForApex(from, { x: target.x, y: BALL.RADIUS, z: target.z }, apex);
  }
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;

  rally.touches = newCount;
  rally.possession = team;
  rally.lastTouchTeam = team;
  rally.lastToucherId = player.id;
  rally.deceiveP = dec.deceiveP;
  rally.profile = intent.action === 'spike' ? 'spike' : 'arc';
  rally.flightId += 1;
  rally.touchLockTick = state.tick;
  actor.lastTouchTick = state.tick;

  ev.push({ type: 'TOUCH', tick: state.tick, team, playerId: player.id, kind: intent.action, touches: newCount });
}

function performServe(state, intent, ev) {
  const { ball, rally } = state;
  const player = state.players[intent.playerId];
  const actor = state.actors[intent.playerId];
  const team = player.teamId;

  const contactY = Math.max(spikeReach(player) * 0.92, 2.2); // 跳發擊球點
  ball.x = actor.x; ball.y = contactY; ball.z = actor.z;
  const target = scatterTarget(state, intent.aim, player.attributes.serve, 'serve');
  const v = velocityForApex(ball, { x: target.x, y: BALL.RADIUS, z: target.z }, TUNING.SERVE_APEX);
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;

  rally.touches = 0; // 發球不計入受球方的 3 次觸球
  rally.possession = team;
  rally.lastTouchTeam = team;
  rally.lastToucherId = player.id;
  rally.deceiveP = 0;
  rally.profile = 'serve';
  rally.flightId += 1;
  actor.lastTouchTick = state.tick;

  state.phase = 'rally';
  ev.push({ type: 'SERVE', tick: state.tick, team, playerId: player.id });
}

// 扣球速度：power 屬性推導；AI 過網預判（ai.js spikeClearsNet）用同一函式
export function spikeSpeed(player) {
  return TUNING.SPIKE_SPEED_BASE + player.attributes.power * TUNING.SPIKE_SPEED_PER;
}

// H3 視線欺敵（純函式）：由擊球點、實際目標、視線目標算出
// θ（水平夾角）、騙過攔網機率（線性）、自身失誤增量（平方）
export function computeDeception(from, aim, gaze) {
  if (!gaze || (gaze.x === aim.x && gaze.z === aim.z)) {
    return { theta: 0, deceiveP: 0, errorBoost: 0 };
  }
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

// 落點散佈：精度屬性越高越準；兩次 rand 呼叫（角度、半徑），順序固定＝決定論
// extraInaccuracy：H3 欺敵的失誤增量（平方項），直接疊加在精度虧損上
function scatterTarget(state, aim, accuracyAttr, action, extraInaccuracy = 0) {
  const factor =
    action === 'set' ? 0.55 : action === 'spike' ? 1.2 : action === 'serve' ? 1.35 : 1.0;
  const r = TUNING.SCATTER_MAX * ((1 - accuracyAttr / 100) * factor + extraInaccuracy);
  const angle = rand(state) * Math.PI * 2;
  const radius = rand(state) * r;
  return { x: aim.x + Math.cos(angle) * radius, z: aim.z + Math.sin(angle) * radius };
}

// ---- 物理推進與裁決 ----

function stepRally(state, ev) {
  const b = state.ball;
  const prevZ = b.z;
  const prevY = b.y;
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
  let best = null;
  for (const p of Object.values(state.players)) {
    if (p.teamId !== toTeam) continue;
    if (!isFrontRowOf(state, toTeam, p.id)) continue;
    const actor = state.actors[p.id];
    if (actor.blockUntil < state.tick) continue;
    const dx = Math.abs(actor.x - b.x);
    if (dx > TUNING.BLOCK_REACH_X) continue;
    if (b.y > blockReach(p) + BALL.RADIUS) continue; // 球高過手
    if (!best || dx < best.dx || (dx === best.dx && p.id < best.p.id)) best = { p, actor, dx };
  }
  if (!best) return false;

  // H3：攔網手被扣球者的視線騙過 → 整手撲空（機率＝欺敵線性項）
  if (state.rally.deceiveP > 0 && rand(state) < state.rally.deceiveP) return false;

  const chance = 0.12 + best.p.attributes.block * 0.004;
  if (rand(state) >= chance) return false; // 沒攔到，乾淨過網

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
  return idx === 1 || idx === 2 || idx === 3; // P2/P3/P4
}

// 一分結算：把 match 事件補上 tick 收進事件流，接著佈置下一球或收局
// DEAD_BALL 事件附上球當下座標（落點/犯規點），供回放與 UI 用
function settlePoint(state, winner, reason, ev) {
  const at = { x: state.ball.x, z: state.ball.z };
  for (const e of pointTo(state.match, winner, reason)) {
    ev.push(e.type === 'DEAD_BALL' ? { tick: state.tick, ...e, at } : { tick: state.tick, ...e });
  }
  if (state.match.setOver) {
    state.phase = 'set_over';
  } else {
    setupServePhase(state);
  }
}

// 佈置發球局面：全員回輪轉基準位、發球員到發球點、球置於發球員手上
function setupServePhase(state) {
  state.phase = 'serve';
  state.serveReadyTick = state.tick + TUNING.SERVE_DEAD_TICKS;

  for (const team of ['A', 'B']) {
    const rot = state.match.rotations[team];
    rot.forEach((pid, idx) => {
      const pos = basePosition(team, idx + 1);
      const a = state.actors[pid];
      a.x = pos.x; a.z = pos.z;
      a.px = pos.x; a.pz = pos.z; // 瞬移回位不做插值拖影
      a.blockUntil = -1;
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
}

// ---- 預設隊伍（測試/示範用；正式生涯隊伍由 Phase 2+ 資料驅動）----

const DEFAULT_LINEUP = [
  { role: 'setter', height: 1.83 },
  { role: 'outside', height: 1.88 },
  { role: 'middle', height: 1.96 },
  { role: 'opposite', height: 1.9 },
  { role: 'outside', height: 1.86 },
  { role: 'middle', height: 1.94 },
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
        attributes: {
          jump: 60, power: 62, reaction: 60, stamina: 60,
          speed: 62, control: 68, serve: 60, block: 58,
        },
      }),
    );
  return { A: make('A'), B: make('B') };
}
