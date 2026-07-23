// Phase 1 比賽模擬組裝層 — 模擬核心唯一入口（純 JS、零 three.js/DOM）
// 鐵律：stepGame 只吃 Intent（玩家/AI/網路同型，不知來源）；固定步長；隨機只走種子 PRNG
import { SIM_DT, COURT, BALL } from './constants.js';
import { createBall, stepBall } from './ball.js';
import { createMatch, serverId, pointTo, isFourHits } from './match.js';
import {
  TEAM_SIDE, otherTeam, basePosition, servePosition,
  isBackRow, isInFrontZone, landedCourtTeam,
} from './rotation.js';
import {
  createPlayer, standingReach, spikeReach, blockReach, moveSpeed, feintMasteryMul,
} from './player.js';
import { velocityForApex, spikeVelocity } from './flight.js';
import { seedRng, rand } from './rng.js';
import { isRotationLegal } from './rotationRules.js';
import { applyAttackOutcome } from './trust.js';

// 遊戲層調參常數（骨架版；H 區手感層只調數值、不動結構）
export const TUNING = {
  SERVE_DEAD_TICKS: 110,  // 死球哨音到可發球的間隔（1.8s：慶祝/喘息的比賽節拍）
  REACH_RADIUS: 1.3,      // 觸球水平可及距離（m）
  TOUCH_COOLDOWN: 15,     // 同一人再次觸球的最短 tick 間隔（物理防抖）TODO Phase 2：完整雙擊判定
  SCATTER_MAX: 1.7,       // 精度屬性=0 時的落點散佈半徑（m）
  BLOCK_WINDOW: 48,       // block intent 的有效 tick 窗口（0.8s，手機反應時間友善）
  BLOCK_REACH_X: 1.1,     // 攔網水平涵蓋半徑（m）
  SERVE_APEX: 4.6,        // 各球路弧頂高度（m）
  POWER_SERVE_APEX: 3.5,  // 跳躍發球低平弧（timing>1.1；力量換準度）
  POWER_SERVE_SCATTER: 1.45, // 跳躍發球散佈放大倍率
  FLOAT_APEX_MUL: 0.8,    // 飄浮發球弧頂縮減（較平、帶進撲朔感）
  FLOAT_SCATTER: 1.05,    // 飄浮發球自身散佈（略增；重點在對方難接）
  FLOAT_RECEIVE_MUL: 1.15, // 飄浮球接發品質懲罰（07-24 真飄上線 1.28→1.15：站位被騙已是
  //   有機難度來源，數字懲罰下調防雙重懲罰；balance A/B 校準）
  FLOAT_DRIFT_ACC: 2.2,    // 真飄側向亂流加速度幅值（m/s²；雙頻曲線、總偏移 ~±0.3-0.5m）
  POWER_SERVE_RECEIVE_MUL: 1.34, // 跳躍發球接發懲罰（球快難墊；略高於飄浮＝正面對決最難接）
  DIVE_REACH_MUL: 1.8,    // 魚躍可及半徑倍率（一次性大延伸）
  DIVE_MAX_Y: 1.15,       // 魚躍只救低球（貼地撲救，不是跳接）
  DIVE_RECOVER_TICKS: 42, // 撲出去後倒地恢復（0.7s）——撲空也一樣（風險換範圍）
  RECEIVE_APEX: 4.8,
  SET_APEX: 5.2,
  QUICK_APEX: 3.4,        // 快攻低弧（set 且 timing<0.5 時採用——MB 簡版快攻）
  SPIKE_SPEED_BASE: 9,    // 扣球速度 = BASE + power × PER（m/s）
  SPIKE_SPEED_PER: 0.17,
  SPIKE_MIN_TIME: 0.18,   // 扣球最短飛行時間（避免零距離除法）
  TIP_SPEED_MIN: 0.55,    // 輕吊速度下限＝全力的 55%（timing=0 時）
  // 出手品質（2K 式甜蜜區）：蓄力進度落在甜蜜區＝準、超蓄＝飄
  SWEET_LO: 0.7, SWEET_HI: 1.05, OVERCHARGE_T: 1.15,
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
  // 擦手（one-touch，07-23 拍板）：攔網三態的中間態——沒攔死但指尖擦到，
  // 球改向擦進攔網方半場（不計觸球數；「touch！快救！」的真實攔網日常）
  BLOCK_GRAZE_CHANCE: 0.22, // 擦手帶寬（攔死判定之後的第二段；同吃時機檔、不吃情蒐）
  BLOCK_GRAZE_SLOW: 0.45,   // 擦手後穿越速度保留比（減速但仍常飛向深區/界外）
  // 攔網時機判定：起跳到球過網的滯空 tick 數
  BLOCK_SWEET_MIN: 4, BLOCK_SWEET_MAX: 26,
  BLOCK_LATE_MUL: 0.6,    // 起跳太晚（手還沒到頂）
  BLOCK_EARLY_MUL: 0.55,  // 起跳太早（已在下墜）
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
export function createGame({ seed = 1, teams, setTarget, aiProfiles, scoutRead, liberos } = {}) {
  const rosters = teams ?? createDefaultTeams();
  const players = {};
  const actors = {};
  for (const team of ['A', 'B']) {
    const extra = liberos?.[team] ? [liberos[team]] : [];
    for (const p of [...rosters[team], ...extra]) {
      players[p.id] = p;
      actors[p.id] = {
        x: 0, z: 0, px: 0, pz: 0,
        blockUntil: -1, blockStartTick: -9999, lastTouchTick: -9999,
        divedUntil: -1, // 魚躍倒地恢復期（此前不得移動/觸球）
        zHistory: [], // 每 tick 推入舊 z（見 takeoffZ）；固定長度＝回溯窗
      };
    }
  }
  const state = {
    tick: 0,
    seed, // 原始種子（AI 決策 hash 的混合項——跨場次變化、同種子可重現）
    aiProfiles: aiProfiles ?? null,
    scoutRead: scoutRead ?? null, // 情蒐讀取（對手讀我的慣用線；生涯注入）
    liberos: liberos
      ? Object.fromEntries(Object.entries(liberos)
          .filter(([, p]) => p)
          .map(([t, p]) => [t, { liberoId: p.id, replacedId: null }]))
      : null,
    scoutTally: {},  // 情蒐統計（playerId→intent 分佈；場末由生涯層收走跨場累積）
    trustDyn: {},    // stage 4 場內動態信任（playerId→偏移；場末即散）
    trustStreak: {}, // 連續得分/失誤計數（正＝連得、負＝連失）
    rngState: seedRng(seed),
    players,
    actors,
    match: createMatch({
      rotationA: rosters.A.map((p) => p.id),
      rotationB: rosters.B.map((p) => p.id),
      ...(setTarget ? { target: setTarget } : {}),
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
      lastSpikeZone: null, // 本波扣球的線路分類（line/cross/middle/tip；情蒐讀取用）
      serveStyle: null,  // 本球發球式（'float'＝飄浮：接發品質懲罰；過首觸即無效）
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
// 輪轉序成對檢查＋完全重合時固定軸分開＝決定論；邊界 clamp 與 applyMove 同源
const SEP_RADIUS = 0.55;
const SEP_PUSH = 0.08; // 每 tick 讓位上限：兩人合計 0.16m/tick > 全速對衝的合攏速度
function separateTeammates(state) {
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
        const nx = (dx / d) * push;
        const nz = (dz / d) * push;
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

  if (intent.action === 'block') {
    // 攔網＝開啟時機窗；是否攔到在球過網瞬間結算（tryBlock）
    // 起跳時刻只在新窗開啟時記錄（連續 intent 延長窗但不重置起跳）——時機判定用
    if (actor.blockUntil < state.tick) actor.blockStartTick = state.tick;
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
  if (isDive) actor.divedUntil = state.tick + TUNING.DIVE_RECOVER_TICKS;

  const dist = Math.hypot(ball.x - actor.x, ball.z - actor.z);
  if (dist > TUNING.REACH_RADIUS * (isDive ? TUNING.DIVE_REACH_MUL : 1)) return;
  const maxY = intent.action === 'spike' ? spikeReach(player)
    : isDive ? TUNING.DIVE_MAX_Y
      : standingReach(player) + 0.35;
  if (ball.y > maxY || ball.y < BALL.RADIUS) return;

  executeTouch(state, intent, player, actor, ev, dist);
}

function executeTouch(state, intent, player, actor, ev, dist = 0) {
  const { rally, ball } = state;
  const team = player.teamId;
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
  const qualityMul = isReceiveLike
    ? receiveQualityMul(dist, TUNING.REACH_RADIUS, player) * receivePerfectMul(rawT) * serveRecvMul
    : intent.action === 'spike'
      ? timingQualityMul(rawT)
      : 1;
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
  if (intent.action === 'spike') {
    // 蓄力輕重：timing 短＝輕吊（慢、弧墜）、蓄滿＝重扣（全速）
    const speed = spikeSpeed(player) * (TUNING.TIP_SPEED_MIN + (1 - TUNING.TIP_SPEED_MIN) * timing);
    v = spikeVelocity(
      from,
      { x: target.x, y: BALL.RADIUS, z: target.z },
      speed,
      TUNING.SPIKE_MIN_TIME,
    );
  } else {
    const apex = blown ? TUNING.BLOWN_APEX
      : intent.action === 'set'
        ? (rawT < 0.5 ? TUNING.QUICK_APEX : TUNING.SET_APEX)
        : TUNING.RECEIVE_APEX;
    v = velocityForApex(from, { x: target.x, y: BALL.RADIUS, z: target.z }, apex);
  }
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;

  // stage 5 情蒐統計：扣球線路/假動作進 intent 分佈（跨場累積由生涯層收走）
  if (intent.action === 'spike') {
    const zone = classifySpikeZone(actor.x, intent.aim.x, timing);
    rally.lastSpikeZone = zone;
    const tal = scoutTallyOf(state, player.id);
    tal.zones[zone] += 1;
    tal.spikes += 1;
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
    ballY: Math.round(from.y * 100) / 100, // 擊球高度：表現層分高手/低手動作與音效用
    power: Math.round(timing * 100) / 100, // 蓄力質量：表現層分輕吊/重扣音效用
    dist: Math.round(dist * 100) / 100, // 到位程度：接球品質來源（表現層可做勉強救球動作/音效）
    ...(blown ? { blown: true } : {}), // 爆接標記（播報/探針用）
  });
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

  // 7.7 輪轉錯誤追溯扣分（cancelFaultPoints）的呼叫點——本輪只接線不啟用。
  // W3 發球者由 match.rotations 決定論導出＝發球序結構上不可能違反 7.7，故此處無觸發源。
  // 啟用條件：當 lineup 的發球序來源不再全經排陣預檢（lineup.js checkRotationOrder）時
  // ——即 W4 招募後的中途換人／輪轉替補產生「未經預檢的發球者」——在此偵測到違序即發
  //   ROTATION_FAULT（帶 faultTick=首次違序 tick），賽末結算改呼叫：
  //     cancelFaultPoints(state.events, faultTick, faultTeam)  // rotationRules.js
  //   取消犯規隊自 faultTick 起全部得分、對隊得分保留。
  // 現不接執行碼：為不存在的路徑改賽中結算＝拿決定論穩定性換用不到的功能（見 W3 任務書）。

  const contactY = Math.max(spikeReach(player) * 0.92, 2.2); // 跳發擊球點
  ball.x = actor.x; ball.y = contactY; ball.z = actor.z;
  // 發球三式：穩定（預設）／跳躍（timing>1.1：低平快＋散佈放大——力量換準度）
  // ／飄浮（style 'float'：弧較平、自身散佈略增，殺傷在對方接發品質懲罰）
  const power = (intent.timing ?? 1) > 1.1;
  const float = !power && intent.style === 'float';
  // 跳發也記式樣（原本只記 float）——接發懲罰要吃得到跳發，否則跳發只是自己球快、
  // 對接發方毫無額外難度（07-23 補：跳發跳飄都更難接）
  rally.serveStyle = power ? 'power' : float ? 'float' : null;
  // 情蒐統計：發球風格偏好
  const stal = scoutTallyOf(state, player.id).serves;
  stal.total += 1;
  if (power) stal.jumps += 1;
  if (float) stal.floats += 1;
  const target = scatterTarget(
    state, intent.aim, player.attributes.serve, 'serve', 0,
    power ? TUNING.POWER_SERVE_SCATTER : float ? TUNING.FLOAT_SCATTER : 1,
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
}

// 扣球速度：power 屬性推導；AI 過網預判（ai.js spikeClearsNet）用同一函式
export function spikeSpeed(player) {
  return TUNING.SPIKE_SPEED_BASE + player.attributes.power * TUNING.SPIKE_SPEED_PER;
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

// 出手品質（純函式）：蓄力進度 t（可>1）→散佈乘數。甜蜜區線性外皆 1、超蓄劣化
export function timingQualityMul(t) {
  if (t >= TUNING.SWEET_LO && t <= TUNING.SWEET_HI) return TUNING.SWEET_ACC;
  if (t > TUNING.OVERCHARGE_T) return TUNING.OVER_ACC;
  return 1.0;
}

// Perfect 接球（純函式）：球到瞬間出手（timing≥0.95）＝一傳更準
export function receivePerfectMul(t) {
  return t >= 0.95 ? TUNING.PERFECT_RECV_ACC : 1;
}

// 攔網時機（純函式）：起跳後滯空 tick 數 → 攔網成功率乘數
export function blockTimingMul(airTicks) {
  if (airTicks < TUNING.BLOCK_SWEET_MIN) return TUNING.BLOCK_LATE_MUL;
  if (airTicks > TUNING.BLOCK_SWEET_MAX) return TUNING.BLOCK_EARLY_MUL;
  return 1.0;
}

// 接球品質（純函式，07-23 改版）：主軸＝接球技術（control 手穩＋reaction 判斷到位），
// 自由人最高＝接球最好；次要＝到位程度（走到球正下方微獎、勉強搆微罰）。取代舊「觸球
// 高度」判準——低姿勢墊球不再冤枉。技術主導的理由：實測 AI 接球 dist≈1.1 不分角色
// （球進範圍就接），純到位既無法讓自由人突出、又會全隊崩盤（見 TUNING.RECV_* 註）。
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

  // 時機判定：起跳太晚（手沒到頂）或太早（下墜中）攔網率打折
  const airTicks = state.tick - best.actor.blockStartTick;
  const timingMul = blockTimingMul(airTicks);
  // stage 5 情蒐讀取：對被讀者的慣用線收攏（假動作的 deceive 骰在上方——騙贏免讀）
  const chance = (0.12 + best.p.attributes.block * 0.004) * timingMul *
    scoutBlockMul(state, toTeam);
  // 三態攔網（Sawmah 07-23 拍板補擦手）：單一 roll 依序判攔死→擦手→乾淨過網
  //（rand 呼叫數恆一次——rng 流與二態時代同節奏）
  const roll = rand(state);
  if (roll >= chance) {
    // 擦手（one-touch）：沒攔死但指尖擦到——BLOCK_TOUCH 一樣不計 3 次觸球，
    // 球減速＋上挑＋橫偏、續入攔網方半場（隊友三次觸球去救；常飛深區/出界＝
    // 追出自由區救球的戲）。擦手帶寬只吃時機檔（碰到比攔死容易，不吃情蒐）
    if (roll >= chance + TUNING.BLOCK_GRAZE_CHANCE * timingMul) return false; // 完全沒碰，乾淨過網
    b.vz *= TUNING.BLOCK_GRAZE_SLOW;
    b.vx = b.vx * 0.5 + (blownHash(state, `${best.p.id}:gx`) - 0.5) * 3;
    b.vy = 1.6 + blownHash(state, `${best.p.id}:gy`) * 1.2;
    const r = state.rally;
    r.touches = 0;
    r.lastTouchTeam = toTeam;
    r.lastToucherId = best.p.id;
    r.deceiveP = 0;
    r.profile = 'arc';
    r.flightId += 1;
    ev.push({ type: 'BLOCK_TOUCH', tick: state.tick, team: toTeam, playerId: best.p.id, graze: true });
    return true;
  }

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

// 一分結算：把 match 事件補上 tick 收進事件流，接著佈置下一球或收局
// DEAD_BALL 事件附上球當下座標（落點/犯規點），供回放與 UI 用
function settlePoint(state, winner, reason, ev) {
  // stage 4 信任動態歸因：攻擊直接定勝負的球——殺進＝＋、打出界＝−（連續加碼）
  // 只認乾淨歸因（最後觸球＝扣球）；攔網回彈等混合責任不記帳
  const r = state.rally;
  if (r.profile === 'spike' && r.lastToucherId) {
    if (reason === 'BALL_IN' && r.lastTouchTeam === winner) {
      applyAttackOutcome(state, r.lastToucherId, true);
    } else if (reason === 'OUT' && r.lastTouchTeam !== winner) {
      applyAttackOutcome(state, r.lastToucherId, false);
    }
  }
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
    // 板凳停放：不在輪轉上的隊員到場邊席位（純視覺位置；無 intent 不參與）
    for (const p of Object.values(state.players)) {
      if (p.teamId !== team || rot.includes(p.id)) continue;
      const a = state.actors[p.id];
      a.x = -6.6;
      a.z = TEAM_SIDE[team] * 10.6;
      a.px = a.x;
      a.pz = a.z;
    }
  }
}

// 佈置發球局面：全員回輪轉基準位、發球員到發球點、球置於發球員手上
function setupServePhase(state) {
  applyLiberoSwaps(state); // 死球即換（換完再歸位，自由人直接站進職責位）
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
