// E 路稽核①：五個位置的「決策點出現率」普查
//
// 用法：
//   node tools/auditE-census.mjs [每個位置的局數=12] [arm=passive|active]
//
// ★ 零 `src/` 改動 ★ 本檔對 `src/`、`tests/` 一個位元組都不寫。
//
// ── 證據取得路徑 ────────────────────────────────────────────
// 玩家那一份 intent 走**真實** `createMatchControls`（`src/input/matchControls.js:64`），
// 建置段整段抄 `tools/block-rejump-probe.mjs`（假 domElement／真 THREE camera／no-op rig）。
// 面板資料源一律呼叫 controls 的真方法：`attackZones` / `setOptions` / `mbOptions` /
// `digOptions` / `isDefendMoment` / `serveZones`，**沒有自己重建一份**。
//
// ⚠ 唯一的「重建」是 `matchLoop.js:837-928` 那幾行套在 controls 之上的布林閘
// （`ball.vy<0 && ball.y>2.0` 之類）。`matchLoop.js` 需要 renderer／DOM，node 起不來，
// 所以那幾行是**逐字抄**過來的（見下方 panelState()，每一行都標了來源行號）。
// 這一段是模型不是真實路徑——凡結論倚賴它，報告裡都標「抄自 matchLoop」。
//
// 兩條臂（同 seed）：
//   passive ：全程零走位輸入（＝Sawmah 只按面板、不推搖桿的體驗）
//   active  ：真 keydown/keyup 走位——這球歸我就去追球、前排防守就走到網前
//
// 本臂**不按任何面板鈕**（除了發球——不發會卡死）：量的是「窗會不會出現」，
// 不是「按了會怎樣」。後果量測在 tools/auditE-consequence.mjs。
// 例外：L 的 1 秒自動快選（matchLoop.js:889-904）照抄，否則 digBias 永不注入、
//       後續佈陣與 AI 行為會偏離真實。
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = Number.parseInt(process.argv[2] ?? '12', 10);
const ARM = process.argv[3] ?? 'passive';
const ME = 'A2';
const MY_TEAM = 'A';

// ── 瀏覽器全域替身（同 block-rejump-probe.mjs）──
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
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { isFrontRow, isBackRow } = await import('../src/sim/rotation.js');
const { createMatchControls, NEAR_NET_Z } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { buildQuickSetup, resolveTechGates } = await import('../src/app/matchConfig.js');
const { buildLibero } = await import('../src/career/careerState.js');
const { setEtaOf, setStageOf } = await import('../src/input/setOptions.js');
const { callOptionsFor } = await import('../src/input/callPlay.js');
const { callFeasibilityOf } = await import('../src/sim/ai.js');
const { schemeByKey } = await import('../src/input/liberoRead.js');
const { myRouteFor } = await import('../src/input/myRoute.js');
const { createDefaultTeams } = await import('../src/sim/game.js');
const { predictLanding } = await import('../src/sim/flight.js');

const MAX_TICKS = 400000;
const ROLES = ['setter', 'outside', 'middle', 'opposite', 'libero'];

// matchLoop.js:20 的 onCourt（同一判準）
const onCourt = (game, pid) => {
  const me = game.players[pid];
  return !!me && game.match.rotations[me.teamId].includes(pid);
};

function makeControls() {
  resetListeners();
  const dom = { addEventListener() {} };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(0, 6, 14);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const rig = {
    setLook() {}, resetLook() {}, setSetScan() {}, setAttackView() {}, setDefendView() {},
    gazePoint() { return null; },
    getMode() { return 'third'; },
  };
  return createMatchControls(dom, camera, ME, rig, true); // simpleMode=決策模式
}

// 走位（active 臂）：抄 tools/block-rejump-probe.mjs:104-118 的鍵盤驅動法，
// 但目標點分兩種——這是「會操作的玩家」的最小模型：
//   ①這球 claim 給我（aiState.claimId === ME）→ 追預測落點
//     ★ 必要性 ★ `matchControls.js:342` 的自動帶位在 `claimId === playerId` 時**整段跳過**
//     （語意：這球歸你、你自己去接）。passive 臂因此永遠碰不到球。
//   ②前排＋對方持球（非發球飛行）→ 走到網前封線點（`matchControls.js:325-331`
//     明訂前排防守不自動帶位）
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

// ════════════════════════════════════════════════════════
// 面板狀態：逐字抄 matchLoop.js:827-928（node 起不了 matchLoop，只能抄）
// ════════════════════════════════════════════════════════
function panelState(game, aiState, controls, gates, servedThisTurn) {
  // matchLoop.js:827 —— 受控者不在場上＝所有面板收起
  if (!onCourt(game, ME)) return { off: true };
  const b = game.ball;
  const rot = game.match.rotations[game.players[ME].teamId];

  // matchLoop.js:837-845
  const zonesRaw = controls.attackZones(game);
  const zones = zonesRaw && zonesRaw.filter((z) => z.key !== 'tip' || gates.canTip);
  const meBackRow = isBackRow(rot, ME);
  const attackDeciding = !!zones && (gates.canPipe || !meBackRow) &&
    b.vy < 0 && b.y > 2.0 && !controls.attackPending();

  // matchLoop.js:849-870
  const setZones = controls.setOptions(game);
  const setDeciding = !!setZones && setZones.length > 0 &&
    b.y > 1.8 && !controls.setPending();
  const setEta = setEtaOf(aiState, game.tick);
  const setReady = !setDeciding || setStageOf(setEta) === 'ready';

  // matchLoop.js:879-886
  const mbRead = controls.mbOptions(game, aiState);
  const mbDeciding = !!mbRead && !controls.mbPending() && !(b.vy < 0 && b.y < 2.3);
  const digRead = controls.digOptions(game, aiState);
  const digDeciding = !!digRead && !controls.digPending() && !(b.vy < 0 && b.y < 2.3);

  // matchLoop.js:910-912
  const defendMoment = controls.isDefendMoment(game, aiState) && b.vy < 0 && b.y > 2.0;

  // matchLoop.js:915-917
  const serveDeciding = game.phase === 'serve' && serverId(game.match) === ME &&
    game.tick >= game.serveReadyTick && !servedThisTurn;

  // matchLoop.js:1084-1097 —— 遠段真的列得出來的戰術數
  let callItems = 0;
  if (setDeciding && !setReady) {
    const feas = gates.canCallPlay ? callFeasibilityOf(game, aiState) : null;
    callItems = (gates.canCallPlay ? callOptionsFor(game, ME) : [])
      .filter((o) => (feas ? feas[o.type]?.feasible !== false : true)).length;
  }

  // 面板 if-else 鏈的實際勝出者（matchLoop.js:939-1154）
  let shown = null;
  if (attackDeciding) shown = 'attack';
  else if (mbDeciding) shown = 'block';
  else if (digDeciding && !controls.digPending()) shown = 'dig';
  else if (setDeciding) shown = setReady ? 'set-near' : 'set-far';
  else if (serveDeciding) shown = 'serve';

  return {
    off: false,
    attackDeciding, setDeciding, setReady, mbDeciding, digDeciding,
    defendMoment, serveDeciding, callItems, shown, digRead, mbRead, setZones, zones,
  };
}

function newTally() {
  return {
    points: 0,
    // 「這一分裡至少出現過一次」
    win: {
      serve: 0, attack: 0, 'set-near': 0, 'set-far': 0, 'set-far-usable': 0,
      block: 0, dig: 0, defendCam: 0, oppCall: 0, routeCue: 0, benched: 0,
    },
    // predicate 成立（未必贏得 if-else 鏈）
    raw: { attack: 0, set: 0, block: 0, dig: 0 },
    // 專屬資訊
    mbTierSeen: 0, mbLanesSeen: 0, digMarkSeen: 0,
    ticks: 0, atNetTicks: 0, frontDefTicks: 0,
    zAbsSum: 0, zAbsN: 0, ptsA: 0, ptsB: 0,
  };
}

function runSet(role, seedBase, tally) {
  const quick = buildQuickSetup(role);
  const teams = quick?.teams ?? createDefaultTeams();
  const liberos = {
    A: quick?.liberoA ?? buildLibero('A', 'A隊自由人'),
    B: buildLibero('B', 'B隊自由人'),
  };
  const game = createGame({
    seed: seedBase, teams, liberos, setTarget: 25, momentum: true,
    stamina: { A: {}, B: {} },
  });
  if (!game.players[ME]) throw new Error(`${role}: 主控槽位 ${ME} 不存在`);
  const aiState = createAiState();
  const controls = makeControls();
  const gates = resolveTechGates(game, ME, false, false);

  let guard = 0;
  let servedThisTurn = false;
  let digWindowSince = -1;
  const held = new Set();
  let flags = null;
  let calledFlight = -1;

  const openPoint = () => ({
    serve: false, attack: false, 'set-near': false, 'set-far': false,
    'set-far-usable': false, block: false, dig: false, defendCam: false,
    oppCall: false, routeCue: false, benched: false,
  });
  flags = openPoint();

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    if (game.phase !== 'serve') servedThisTurn = false;

    const ps = panelState(game, aiState, controls, gates, servedThisTurn);
    tally.ticks += 1;
    if (ps.off) flags.benched = true;
    else {
      const A = game.actors[ME];
      if (game.phase === 'rally') {
        tally.zAbsSum += Math.abs(A.z);
        tally.zAbsN += 1;
        const front = isFrontRow(game.match.rotations[MY_TEAM], ME);
        const defending = game.rally.possession && game.rally.possession !== MY_TEAM &&
          game.rally.profile !== 'serve';
        if (front && defending) {
          tally.frontDefTicks += 1;
          if (Math.abs(A.z) < NEAR_NET_Z) tally.atNetTicks += 1;
        }
      }
      if (ps.attackDeciding) tally.raw.attack += 1;
      if (ps.setDeciding) tally.raw.set += 1;
      if (ps.mbDeciding) tally.raw.block += 1;
      if (ps.digDeciding) tally.raw.dig += 1;
      if (ps.shown) flags[ps.shown] = true;
      if (ps.shown === 'set-far' && ps.callItems > 0) flags['set-far-usable'] = true;
      if (ps.defendMoment) flags.defendCam = true;
      if (ps.mbDeciding && ps.mbRead) {
        if (ps.mbRead.tier != null) tally.mbTierSeen += 1;
        if ((ps.mbRead.lanes?.length ?? 0) > 0) tally.mbLanesSeen += 1;
      }
      if (ps.digDeciding && ps.digRead?.markText) tally.digMarkSeen += 1;
      // routeCue（matchLoop.js:2152）：球內「我這球跑哪條線」提示
      if (myRouteFor(game, aiState, ME)) flags.routeCue = true;

      // L 自動快選（matchLoop.js:887-904）；0.6× 慢速下 1 秒 ≈ 36 sim tick
      if (ps.digDeciding) {
        if (digWindowSince < 0) digWindowSince = game.tick;
        else if (game.tick - digWindowSince > 36) {
          controls.chooseDig();
          const sch = schemeByKey(ps.digRead.suggestion);
          aiState.digBias = {
            team: MY_TEAM, choice: sch?.dig ?? 'cross', block: sch?.block, override: false,
          };
        }
      } else digWindowSince = -1;

      // 發球：不發會卡死（matchLoop.js:1174 的同一入口）
      if (ps.serveDeciding) {
        flags.serve = true;
        controls.serveNow(game, controls.serveZones(game)[0].aim, null);
        servedThisTurn = true;
      }
    }

    // digBias / blockCall 生命週期（matchLoop.js:797-804）
    if (aiState.blockCall && (game.phase !== 'rally' ||
      game.rally.possession === aiState.blockCall.team)) aiState.blockCall = null;
    if (aiState.digBias && (game.phase !== 'rally' ||
      game.rally.possession === game.players[ME]?.teamId)) aiState.digBias = null;

    // 走位
    if (ARM === 'active') {
      const want = new Set(wantKeys(game, aiState, controls));
      for (const k of held) if (!want.has(k)) { fireKey('keyup', k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { fireKey('keydown', k); held.add(k); }
    }

    const playerIntents = controls.collect(game, aiState);
    const ev = stepGame(game, [...playerIntents, ...aiCollectIntents(game, aiState, [ME])]);
    controls.onEvents(ev);

    for (const e of ev) {
      // OPP ⚡跟上！浮鈕（matchLoop.js:1253-1262）
      if (e.type === 'TOUCH' && e.touches === 1 && e.team === MY_TEAM &&
        game.players[ME]?.currentRole === 'opposite' && e.playerId !== ME &&
        onCourt(game, ME) && isBackRow(game.match.rotations[MY_TEAM], ME) &&
        calledFlight !== game.rally.flightId) {
        calledFlight = game.rally.flightId;
        flags.oppCall = true;
      }
      if (e.type === 'SCORE') {
        tally.points += 1;
        for (const k of Object.keys(flags)) if (flags[k]) tally.win[k] += 1;
        flags = openPoint();
      }
    }
  }
  tally.ptsA += game.match.score.A;
  tally.ptsB += game.match.score.B;
  if (guard >= MAX_TICKS) throw new Error('局未結束（guard 用盡）');
}

// ════════════════════════════════════════════════════════
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');
const out = {};
for (const role of ROLES) {
  const t = newTally();
  for (let i = 0; i < SETS; i += 1) runSet(role, 700000 + i * 7919, t);
  out[role] = t;
  const w = t.win;
  console.log(`\n════ ${role}（arm=${ARM}, ${SETS} 局, ${t.points} 分）════`);
  console.log(`  發球面板        ${w.serve}/${t.points} = ${pct(w.serve, t.points)}`);
  console.log(`  攻擊區面板      ${w.attack}/${t.points} = ${pct(w.attack, t.points)}`);
  console.log(`  S 近段分配      ${w['set-near']}/${t.points} = ${pct(w['set-near'], t.points)}`);
  console.log(`  S 遠段戰術      ${w['set-far']}/${t.points} = ${pct(w['set-far'], t.points)}`
    + `　（其中列得出戰術：${w['set-far-usable']}/${t.points} = ${pct(w['set-far-usable'], t.points)}）`);
  console.log(`  攔網封線面板    ${w.block}/${t.points} = ${pct(w.block, t.points)}`);
  console.log(`  L 攔防配套面板  ${w.dig}/${t.points} = ${pct(w.dig, t.points)}`);
  console.log(`  OPP ⚡跟上鈕    ${w.oppCall}/${t.points} = ${pct(w.oppCall, t.points)}`);
  console.log(`  球內跑位提示    ${w.routeCue}/${t.points} = ${pct(w.routeCue, t.points)}`);
  console.log(`  攔網第一視角    ${w.defendCam}/${t.points} = ${pct(w.defendCam, t.points)}`);
  console.log(`  被換下(無面板)  ${w.benched}/${t.points} = ${pct(w.benched, t.points)}`);
  console.log(`  -- predicate tick 數：attack ${t.raw.attack} / set ${t.raw.set} / block ${t.raw.block} / dig ${t.raw.dig}`);
  console.log(`  -- 前排防守 tick ${t.frontDefTicks}，其中貼網(|z|<2.2) ${t.atNetTicks} = ${pct(t.atNetTicks, t.frontDefTicks)}`);
  console.log(`  -- rally 期間 |z| 平均 ${(t.zAbsSum / (t.zAbsN || 1)).toFixed(2)}m`);
  console.log(`  -- 專屬資訊：MB 讀心 tier tick ${t.mbTierSeen} / lanes tick ${t.mbLanesSeen}；L 習慣標記 tick ${t.digMarkSeen}`);
  console.log(`  -- 總比分 A ${t.ptsA} : ${t.ptsB} B（我方得分率 ${pct(t.ptsA, t.ptsA + t.ptsB)}）`);
}
