// E 路稽核②：「選 A 跟選 B 分得出來嗎」——四個決策點的後果量測
//
// 用法：
//   node tools/auditE-consequence.mjs <block|set|attack|dig> [每臂局數=12]
//
// ★ 零 `src/` 改動 ★
//
// ── 證據取得路徑 ────────────────────────────────────────────
// 同 tools/auditE-census.mjs：真實 `createMatchControls` ＋ 真實 `stepGame`。
// **按鈕的投遞路徑逐字抄 matchLoop 的面板回呼**，不另闢入口：
//   攻擊  controls.chooseAttack(zone)                          （matchLoop.js:949）
//   分配  controls.chooseSet(zone) + aiState.attackerId/Kind   （matchLoop.js:1061-1065）
//   封線  aiState.blockCall = {team,line} + chooseMbTiming(false)（matchLoop.js:980-982）
//   配套  controls.chooseDig() + aiState.digBias = {...}        （matchLoop.js:994-1004）
// 走位臂＝census 的 active（這球歸我就追球、前排防守就走網前）——不走位的話
// 好幾個決策點根本量不到（census 已證）。
//
// 配對：每一臂跑同一組 seed。⚠ trajectory 會發散，只比率不比逐波。
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CASE = process.argv[2] ?? 'block';
const SETS = Number.parseInt(process.argv[3] ?? '12', 10);
const ME = 'A2';
const MY_TEAM = 'A';

const winListeners = {};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener(type, fn) { (winListeners[type] ??= []).push(fn); },
  removeEventListener(type, fn) {
    const a = winListeners[type];
    if (a) winListeners[type] = a.filter((f) => f !== fn);
  },
};
const resetListeners = () => { for (const k of Object.keys(winListeners)) delete winListeners[k]; };
const fireKey = (type, code) => {
  for (const fn of [...(winListeners[type] ?? [])]) fn({ code, repeat: false, preventDefault() {} });
};

const THREE = await import('three');
const { createGame, createDefaultTeams, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { isFrontRow, isBackRow } = await import('../src/sim/rotation.js');
const { createMatchControls } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { buildQuickSetup, resolveTechGates } = await import('../src/app/matchConfig.js');
const { buildLibero } = await import('../src/career/careerState.js');
const { setEtaOf, setStageOf } = await import('../src/input/setOptions.js');
const { schemeByKey, DIG_SCHEMES, digReadCorrect } = await import('../src/input/liberoRead.js');
const { predictLanding } = await import('../src/sim/flight.js');

const MAX_TICKS = 400000;
const onCourt = (game, pid) => {
  const me = game.players[pid];
  return !!me && game.match.rotations[me.teamId].includes(pid);
};

function makeControls() {
  resetListeners();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(0, 6, 14);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const rig = {
    setLook() {}, resetLook() {}, setSetScan() {}, setAttackView() {}, setDefendView() {},
    gazePoint() { return null; }, getMode() { return 'third'; },
  };
  return createMatchControls({ addEventListener() {} }, camera, ME, rig, true);
}

const BLOCK_Z = 0.6;
const DEADBAND = 0.15;
function wantKeys(game, ai, controls) {
  const A = game.actors[ME];
  if (!A || game.phase !== 'rally') return [];
  let tx = null;
  let tz = null;
  if (ai?.claimId === ME) {
    const L = predictLanding(game.ball);
    if (L) { tx = L.x; tz = L.z; }
  }
  if (tx === null) {
    const front = isFrontRow(game.match.rotations[MY_TEAM], ME);
    const defending = game.rally.possession && game.rally.possession !== MY_TEAM &&
      game.rally.profile !== 'serve';
    if (!front || !defending) return [];
    const opts = controls.blockOptions(game, ai);
    const opt = opts ? (opts.find((o) => o.key === 'cross') ?? opts.find((o) => o.key === 'line')) : null;
    tx = opt && opt.x != null ? opt.x : A.x;
    tz = BLOCK_Z;
  }
  const out = [];
  if (A.z - tz > DEADBAND) out.push('KeyW');
  else if (tz - A.z > DEADBAND) out.push('KeyS');
  if (tx - A.x > DEADBAND) out.push('KeyD');
  else if (A.x - tx > DEADBAND) out.push('KeyA');
  return out;
}

// 面板判準（逐字抄 matchLoop.js:837-928，同 auditE-census.mjs）
function panelState(game, aiState, controls, gates, servedThisTurn) {
  if (!onCourt(game, ME)) return { off: true };
  const b = game.ball;
  const rot = game.match.rotations[game.players[ME].teamId];
  const zonesRaw = controls.attackZones(game);
  const zones = zonesRaw && zonesRaw.filter((z) => z.key !== 'tip' || gates.canTip);
  const attackDeciding = !!zones && (gates.canPipe || !isBackRow(rot, ME)) &&
    b.vy < 0 && b.y > 2.0 && !controls.attackPending();
  const setZones = controls.setOptions(game);
  const setDeciding = !!setZones && setZones.length > 0 && b.y > 1.8 && !controls.setPending();
  const setReady = !setDeciding || setStageOf(setEtaOf(aiState, game.tick)) === 'ready';
  const mbRead = controls.mbOptions(game, aiState);
  const mbDeciding = !!mbRead && !controls.mbPending() && !(b.vy < 0 && b.y < 2.3);
  const digRead = controls.digOptions(game, aiState);
  const digDeciding = !!digRead && !controls.digPending() && !(b.vy < 0 && b.y < 2.3);
  const serveDeciding = game.phase === 'serve' && serverId(game.match) === ME &&
    game.tick >= game.serveReadyTick && !servedThisTurn;
  let shown = null;
  if (attackDeciding) shown = 'attack';
  else if (mbDeciding) shown = 'block';
  else if (digDeciding) shown = 'dig';
  else if (setDeciding) shown = setReady ? 'set-near' : 'set-far';
  else if (serveDeciding) shown = 'serve';
  return { off: false, shown, zones, setZones, mbRead, digRead, digDeciding };
}

const CASES = {
  block: { role: 'middle', arms: ['none', 'line', 'cross'] },
  set: { role: 'setter', arms: ['none', 'first', 'last', 'suggest'] },
  attack: { role: 'outside', arms: ['none', 'open', 'walled'] },
  dig: { role: 'libero', arms: ['suggest', 'anti', 'noblock'] },
};

function newT() {
  return {
    ptsA: 0, ptsB: 0, points: 0,
    decided: 0, decidedWon: 0,     // 有下決策的分 / 其中我方得分
    a2Touch: 0, a2Block: 0, teamBlock: 0,
    myKill: 0, mySpike: 0,         // 我方第三擊出手 → 直接得分
    digCorrect: 0, digSeen: 0,
    wallX: [], // 對手扣球那一刻，我方前排三人 x 的平均（封線有沒有真的動到牆）
  };
}

function runSet(caseName, arm, seed, t) {
  const role = CASES[caseName].role;
  const quick = buildQuickSetup(role);
  const teams = quick?.teams ?? createDefaultTeams();
  const liberos = {
    A: quick?.liberoA ?? buildLibero('A', 'A隊自由人'),
    B: buildLibero('B', 'B隊自由人'),
  };
  const game = createGame({
    seed, teams, liberos, setTarget: 25, momentum: true, stamina: { A: {}, B: {} },
  });
  const aiState = createAiState();
  const controls = makeControls();
  const gates = resolveTechGates(game, ME, false, false);

  let guard = 0;
  let served = false;
  let digWindowSince = -1;
  const held = new Set();
  let pointDecided = false;
  let pendingSpike = false;

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    if (game.phase !== 'serve') served = false;
    const ps = panelState(game, aiState, controls, gates, served);

    if (!ps.off) {
      if (ps.shown === 'serve') {
        controls.serveNow(game, controls.serveZones(game)[0].aim, null);
        served = true;
      }
      // ── 攻擊區（matchLoop.js:949）──
      if (ps.shown === 'attack' && caseName === 'attack' && arm !== 'none') {
        const zs = ps.zones.filter((z) => z.key !== 'tip');
        const open = zs.find((z) => !z.blocked);
        const walled = zs.find((z) => z.blocked);
        const pick = arm === 'open' ? (open ?? zs[0]) : (walled ?? zs[0]);
        if (pick) { controls.chooseAttack(pick); pointDecided = true; pendingSpike = true; }
      }
      // ── 封線（matchLoop.js:980-982）──
      if (ps.shown === 'block' && caseName === 'block' && arm !== 'none') {
        aiState.blockCall = { team: MY_TEAM, line: arm };
        controls.chooseMbTiming(false);
        pointDecided = true;
      }
      // ── 分配（matchLoop.js:1061-1065）──
      if (ps.shown === 'set-near' && caseName === 'set' && arm !== 'none') {
        const zs = ps.setZones.filter((z) => z.kind !== 'dump');
        let pick = null;
        if (arm === 'first') pick = zs[0];
        else if (arm === 'last') pick = zs[zs.length - 1];
        else pick = zs.find((z) => z.pid === aiState.attackerId) ?? zs[0];
        if (pick) {
          controls.chooseSet(pick);
          aiState.attackerId = pick.pid;
          aiState.attackKind = pick.kind;
          pointDecided = true;
        }
      }
      // ── L 配套（matchLoop.js:994-1004）──
      if (ps.digDeciding && caseName === 'dig') {
        const sug = ps.digRead.suggestion;
        let key = sug;
        if (arm === 'anti') key = DIG_SCHEMES.find((s) => s.key !== sug).key;
        else if (arm === 'noblock') key = 'no-block';
        const sch = schemeByKey(key);
        controls.chooseDig();
        aiState.digBias = {
          team: MY_TEAM, choice: sch.dig, block: sch.block, override: key !== sug,
        };
        pointDecided = true;
        t.digSeen += 1;
      }
      // 非 dig 案例：照 matchLoop 的 1 秒自動快選（L 不是主角時不會發生，留著防呆）
      if (caseName !== 'dig' && ps.digDeciding) {
        if (digWindowSince < 0) digWindowSince = game.tick;
        else if (game.tick - digWindowSince > 36) {
          const sch = schemeByKey(ps.digRead.suggestion);
          controls.chooseDig();
          aiState.digBias = { team: MY_TEAM, choice: sch.dig, block: sch.block, override: false };
        }
      } else if (!ps.digDeciding) digWindowSince = -1;
    }

    if (aiState.blockCall && (game.phase !== 'rally' ||
      game.rally.possession === aiState.blockCall.team)) aiState.blockCall = null;
    if (aiState.digBias && (game.phase !== 'rally' ||
      game.rally.possession === game.players[ME]?.teamId)) aiState.digBias = null;

    const want = new Set(wantKeys(game, aiState, controls));
    for (const k of held) if (!want.has(k)) { fireKey('keyup', k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { fireKey('keydown', k); held.add(k); }

    // 對手扣球出手前一刻的牆位（封線有沒有真的動到 AI 攔網手）
    if (game.phase === 'rally' && game.rally.possession && game.rally.possession !== MY_TEAM
      && game.rally.touches === 2) {
      const rot = game.match.rotations[MY_TEAM];
      const xs = [rot[1], rot[2], rot[3]].map((id) => game.actors[id]?.x ?? 0);
      t.wallX.push(xs.reduce((a, b) => a + b, 0) / 3);
    }

    const playerIntents = controls.collect(game, aiState);
    const ev = stepGame(game, [...playerIntents, ...aiCollectIntents(game, aiState, [ME])]);
    controls.onEvents(ev);

    for (const e of ev) {
      if (e.type === 'TOUCH' && e.playerId === ME) t.a2Touch += 1;
      if (e.type === 'BLOCK_TOUCH') {
        if (e.playerId === ME) t.a2Block += 1;
        if (e.team === MY_TEAM) t.teamBlock += 1;
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === MY_TEAM) t.mySpike += 1;
      if (e.type === 'SCORE') {
        t.points += 1;
        if (e.team === MY_TEAM) {
          t.ptsA += 1;
          if (pendingSpike) t.myKill += 1;
        } else t.ptsB += 1;
        if (pointDecided) { t.decided += 1; if (e.team === MY_TEAM) t.decidedWon += 1; }
        pointDecided = false;
        pendingSpike = false;
      }
      if (e.type === 'DEAD_BALL' && caseName === 'dig') {
        if (digReadCorrect(game, aiState)) t.digCorrect += 1;
      }
    }
  }
  t.ptsA_final = game.match.score.A;
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');
// 兩比例差的標準誤（獨立樣本近似；配對 seed 但軌跡發散，保守用獨立式）
const se2 = (p1, n1, p2, n2) => Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2) * 100;

const cfg = CASES[CASE];
if (!cfg) throw new Error(`未知 case：${CASE}（可用：${Object.keys(CASES).join('/')}）`);
console.log(`案例 ${CASE}（role=${cfg.role}，每臂 ${SETS} 局，配對 seed）`);
const results = {};
for (const arm of cfg.arms) {
  const t = newT();
  for (let i = 0; i < SETS; i += 1) runSet(CASE, arm, 810000 + i * 7919, t);
  results[arm] = t;
  const mw = t.wallX.length
    ? (t.wallX.reduce((a, b) => a + b, 0) / t.wallX.length).toFixed(3) : 'n/a';
  console.log(`\n── arm=${arm} ──`);
  console.log(`  我方得分率      ${t.ptsA}/${t.points} = ${pct(t.ptsA, t.points)}`);
  console.log(`  有下決策的分    ${t.decided}，其中我方得分 ${t.decidedWon} = ${pct(t.decidedWon, t.decided)}`);
  console.log(`  A2 觸球 ${t.a2Touch}　A2 攔網觸 ${t.a2Block}　我方攔網觸 ${t.teamBlock}　我方扣球 ${t.mySpike}`);
  if (CASE === 'dig') console.log(`  digReadCorrect ${t.digCorrect}／指揮次數 ${t.digSeen} = ${pct(t.digCorrect, t.digSeen)}`);
  console.log(`  對手扣球時我方牆平均 x = ${mw}（n=${t.wallX.length}）`);
}
const arms = cfg.arms;
console.log('\n── 兩兩差（我方得分率，pp ± SE）──');
for (let i = 0; i < arms.length; i += 1) {
  for (let j = i + 1; j < arms.length; j += 1) {
    const a = results[arms[i]];
    const b = results[arms[j]];
    const pa = a.ptsA / a.points;
    const pb = b.ptsA / b.points;
    console.log(`  ${arms[j]} − ${arms[i]} = ${((pb - pa) * 100).toFixed(2)}pp ± ${se2(pa, a.points, pb, b.points).toFixed(2)}`);
  }
}
