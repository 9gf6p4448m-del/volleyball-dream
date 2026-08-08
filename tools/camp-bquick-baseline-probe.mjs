// 集訓卷 題 1a 基準量測探針（2026-08-08）—— B 快「成立率」的現行基準
//
// 用法：node tools/camp-bquick-baseline-probe.mjs [每臂局數=12]
//
// ★ 零 `src/` 改動、零數值改動 ★ 本檔對 `src/`、`tests/` 一個位元組都不寫。
//   幅度未裁（拍板包 §五「先量再定，不在本輪裁」）⇒ 本探針只讀不寫。
//
// ── 要回答的三題（Sawmah 要裁 1a 之前需要的基準）─────────────────
// A 結構題：★誰按得到 B 快？★ 1a 的裁定原文把 B 快說成「MB 專屬」，
//   但**叫的人是 S**（`matchControls.js:623` isSetMoment 明文要求 currentRole==='setter'）。
//   玩家在 MB／OH／OPP 位時，這個載體是不是空集合——用量的，不是用推的。
// B 基準題：B 快的**可行率**是多少？分母是什麼？逐屆／逐對手強度有沒有差？
// C 效果題：真的按下去會怎樣（成立率、該波得分歸屬、全場比分 vs 不按的對照臂）？
//
// ── 證據取得路徑（`02 §6.1` 條 4：真實路徑，不重建模型）─────────────
// · 可行性一律呼叫 `callFeasibilityOf`（`src/sim/ai.js:1259`）——與 UI
//   （`matchLoop.js:1059`）**同一支函式**。不自己重刻判定。
// · 叫牌一律寫 `aiState.replanCall = { type, callerId }`——逐字同 `matchLoop.js:1125`，
//   結果讀 sim 自己回寫的 `aiState.callOutcome`，不自己判成不成立。
// · 生涯建隊走**真實 `careerMatchSetup`**（同 `tools/season-combo-probe.mjs`），
//   `comboScale` 由 career 層自己算（第 1 屆 0／第 2 屆起 1），本檔不硬填。
//
// ── ★★ 量測位置：為什麼 B／C 段不用受控玩家的面板 ★★ ────────────────
// 最直覺的做法是沿 `tools/call-feasibility-probe.mjs`：受控玩家＝S、全程不按鍵、
// 從面板段取樣。**本輪實測發現那個治具在 S 位上是壞的**：
//     受控 S ：我方 0 : 25（setReady 窗一整場只有 22 tick）
//     受控 OH：我方 20 : 25      受控 MB：我方 25 : 27
//     同一組建隊、純 AI vs AI：S 位 23:25、OH 位 25:20、MB 位 25:27
//   ⇒ 只有「受控玩家站 S」這一格會被橫掃，其餘皆競爭性比分 ⇒ 治具問題，不是遊戲問題。
//   後果對量測是致命的：**我方一分未得就永遠不輪轉**，整場只量到同一個輪次的攻擊池，
//   而「這波有沒有人跑 A 快」（`hasQuick`＝B 快唯一的失敗原因）正是隨輪轉變動的量。
// ⇒ **B／C 段改在純 AI vs AI 的生涯局裡取樣**（比分競爭、輪轉正常），
//   取樣時點＝`callFeasibilityOf` 自己回非 null 的那一刻（其內部 `replanContextOf`
//   ＝我方持球的第二觸規劃窗，`ai.js:974-979`）——那正是 S 面板開著的同一個窗，
//   只是不經過 UI 那一層。分母語意因此是「**我方第二觸規劃窗**」。
// ⇒ A 段仍用受控玩家治具，因為它問的是「面板開不開」這個**結構是非題**，
//   而 MB／OH 兩臂的比分是競爭性的（治具在那兩格沒壞）；S 臂的 0:25 只影響
//   代表性、不影響「面板總共開了幾次」這個是非題。

const SETS = Number.parseInt(process.argv[2] ?? '12', 10);
const ME = 'A2';
const MAX_TICKS = 400000;

// ── 瀏覽器全域替身（createMatchControls 在建構時掛 window 監聽）──
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

const THREE = await import('three');
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents, callFeasibilityOf } = await import('../src/sim/ai.js');
const { createMatchControls } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { resolveTechGates } = await import('../src/app/matchConfig.js');
const {
  createCareer, createCareerPlayer, careerMatchSetup, opponentById,
} = await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const { defaultLineup } = await import('../src/career/lineup.js');
const { setEtaOf, setStageOf } = await import('../src/input/setOptions.js');
const { offeredCallTypes } = await import('../src/sim/approach.js');

const TYPES = offeredCallTypes();
const pct = (k, n) => `${(100 * k / (n || 1)).toFixed(1)}%`;
const seP = (k, n) => (n ? 100 * Math.sqrt((k / n) * (1 - k / n) / n) : NaN);
const seStr = (k, n) => (n ? `±${seP(k, n).toFixed(1)}pp` : '±—');

// 生涯建隊（真實路徑）：createCareer → createCareerPlayer → careerMatchSetup
function careerGameFactory({ seasonIndex, opponentId, role, seed }) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  player.naturalRole = role;
  player.currentRole = role;
  // 叫戰術技術＝第 2 屆傳授的既有事實（`events.js` teach-call）。這裡直接給，
  // 因為要量的是「學會之後 B 快叫不叫得出來」，不是「什麼時候學會」。
  player.techniques = { ...player.techniques, callPlay: 1 };
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId },
    { capacity: 12, members, alumni: [] }, lineup, seasonIndex,
  );
  return {
    setup,
    make: () => createGame({
      seed: setup.seed,
      teams: setup.teams,
      aiProfiles: setup.aiProfiles,
      liberos: setup.liberos,
      benches: setup.benches,
      stamina: { A: {}, B: { costMul: 1.0 } },
      momentum: true,
      setTarget: 25,
      comboScale: setup.comboScale, // ← matchConfig.js 生涯分支遞的就是這個欄位
    }),
  };
}

// ════════════════════════════════════════════════════════
// A 段：誰按得到 B 快（受控玩家治具；問的是結構是非題）
// ════════════════════════════════════════════════════════
function runStructural(opts, seedOffset) {
  resetListeners();
  const { make, setup } = careerGameFactory({ ...opts, seed: seedOffset });
  const game = make();
  const ai = createAiState();
  const dom = { addEventListener() {} };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  camera.position.set(0, 6, 14); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const rig = {
    setLook() {}, resetLook() {}, setSetScan() {}, setAttackView() {}, setDefendView() {},
    gazePoint() { return null; }, getMode() { return 'third'; },
  };
  const controls = createMatchControls(dom, camera, ME, rig, true);
  const gates = resolveTechGates(game, ME, true);

  let guard = 0; let served = false;
  let panelWaves = 0; let lastWave = null; let panelTicks = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    // 逐字對齊 matchLoop.js:844-865 / 1052-1091
    const setZones = controls.setOptions(game);
    const setDeciding = !!setZones && setZones.length > 0
      && game.ball.y > 1.8 && !controls.setPending();
    const setReady = !setDeciding || setStageOf(setEtaOf(ai, game.tick)) === 'ready';
    const remote = setDeciding && !setReady && gates.canCallPlay;
    if (remote) {
      panelTicks += 1;
      if (lastWave !== game.rally.flightId) { lastWave = game.rally.flightId; panelWaves += 1; }
    }
    const pi = [...controls.collect(game, ai)];
    if (game.phase !== 'serve') served = false;
    else if (serverId(game.match) === ME && game.tick >= game.serveReadyTick && !served) {
      const zs = controls.serveZones(game);
      if (zs && zs.length) { controls.serveNow(game, zs[0].aim, null); served = true; }
    }
    stepGame(game, [...pi, ...aiCollectIntents(game, ai, [ME])]);
  }
  return {
    panelWaves, panelTicks, canCallPlay: gates.canCallPlay,
    comboScale: setup.comboScale, score: { ...game.match.score },
  };
}

// ════════════════════════════════════════════════════════
// B／C 段：純 AI vs AI 的生涯局（比分競爭、輪轉正常）
//   callSpec=null      → 只查可行性，不按（B 段）
//   callSpec='bquick'  → 每一窗第一次可行時就按下去（C 段）
// ════════════════════════════════════════════════════════
function runAiArm(opts, seedOffset, callSpec = null) {
  const { make, setup } = careerGameFactory({ ...opts, seed: seedOffset });
  const game = make();
  const ai = createAiState();
  const waves = [];
  let cur = null; let guard = 0;
  let plans = 0; let bquickRoutes = 0; let prevApproach = null;
  let lastCalled = null; let calls = 0;
  const outcomes = new Map(); const seenOutcome = new Set();
  let evIdx = 0; let pending = false; let won = 0; let lost = 0;

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const r = game.rally;
    // 取樣時點＝面板段（AI intent 之前），同 matchLoop 的順序
    const feas = callFeasibilityOf(game, ai);
    const mine = feas && ai.landingTeam === 'A'; // 只算我方的規劃窗
    if (mine) {
      if (!cur || cur.flightId !== r.flightId) {
        if (cur) waves.push(cur);
        cur = { flightId: r.flightId, tier: ai.passTier ?? null, first: feas };
      }
      // ★ 對照臂也要記同一個分母 ★ 「B 快可行的那些窗」在兩臂都標記，差別只在
      // 按不按下去 ⇒ 得分歸屬才有得比。少了這一行，對照臂的 won/lost 恆為 0，
      // 那個 0 會被誤讀成「不按就一分都拿不到」（實為沒量）。
      if (feas.bquick?.feasible && lastCalled !== r.flightId) {
        lastCalled = r.flightId;
        calls += 1;
        pending = true;
        if (callSpec) ai.replanCall = { type: callSpec, callerId: ME }; // ＝matchLoop.js:1125
      }
    } else if (cur) { waves.push(cur); cur = null; }

    const intents = aiCollectIntents(game, ai); // 全 AI：無 excludeIds
    if (ai.approach && ai.approach !== prevApproach) {
      prevApproach = ai.approach;
      plans += 1;
      for (const rt of ai.approach.routes ?? []) if (rt.kind === 'bquick') bquickRoutes += 1;
    }
    stepGame(game, intents);

    // sim 回寫的結果（狀態不是事件 ⇒ 用 flightId 去重，同 matchLoop 的字卡邏輯）
    const oc = ai.callOutcome;
    if (callSpec && oc && oc.type === callSpec && !seenOutcome.has(oc.flightId)) {
      seenOutcome.add(oc.flightId);
      const key = oc.outcome === 'command' ? 'command（成立）' : `${oc.outcome}:${oc.reason}`;
      outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    }
    while (evIdx < game.events.length) {
      const e = game.events[evIdx]; evIdx += 1;
      if (e.type !== 'SCORE') continue;
      if (pending) { if (e.team === 'A') won += 1; else lost += 1; pending = false; }
    }
  }
  if (cur) waves.push(cur);
  return {
    waves, plans, bquickRoutes, calls, outcomes, won, lost,
    comboScale: setup.comboScale, score: { ...game.match.score },
  };
}

function aggAi(opts, callSpec = null) {
  const agg = {
    waves: [], plans: 0, bquickRoutes: 0, calls: 0, outcomes: new Map(),
    won: 0, lost: 0, comboScale: null, ptsFor: 0, ptsAgainst: 0,
  };
  for (let i = 0; i < SETS; i += 1) {
    const r = runAiArm(opts, 1000 + i * 101, callSpec);
    agg.waves.push(...r.waves);
    agg.plans += r.plans; agg.bquickRoutes += r.bquickRoutes;
    agg.calls += r.calls; agg.won += r.won; agg.lost += r.lost;
    agg.comboScale = r.comboScale;
    agg.ptsFor += r.score.A; agg.ptsAgainst += r.score.B;
    for (const [k, v] of r.outcomes) agg.outcomes.set(k, (agg.outcomes.get(k) ?? 0) + v);
  }
  return agg;
}

// ════════════════════════════════════════════════════════
console.log(`== 集訓卷 題 1a：B 快成立率基準 ==  每臂 ${SETS} 局`);
console.log(`offeredCallTypes() 實際回傳：[${TYPES.join(', ')}]\n`);

// ---- A 段 ----
console.log('════ A 段：★誰按得到 B 快★（受控玩家治具；結構是非題）════');
console.log('玩家位置   屆 comboScale canCallPlay 面板波數 面板tick 累計比分(我方:對方)');
const A_ARMS = [
  { role: 'setter', seasonIndex: 2, opponentId: 'north-tech' },
  { role: 'middle', seasonIndex: 2, opponentId: 'north-tech' },
  { role: 'outside', seasonIndex: 2, opponentId: 'north-tech' },
  { role: 'opposite', seasonIndex: 2, opponentId: 'north-tech' },
  { role: 'setter', seasonIndex: 1, opponentId: 'north-tech' },
];
for (const arm of A_ARMS) {
  let waves = 0; let ticks = 0; let a = 0; let b = 0; let cs = null; let cc = null;
  for (let i = 0; i < SETS; i += 1) {
    const r = runStructural(arm, 1000 + i * 101);
    waves += r.panelWaves; ticks += r.panelTicks; a += r.score.A; b += r.score.B;
    cs = r.comboScale; cc = r.canCallPlay;
  }
  console.log(
    `${arm.role.padEnd(10)}${String(arm.seasonIndex).padStart(2)}${String(cs).padStart(11)}`
    + `${String(cc).padStart(12)}${String(waves).padStart(9)}${String(ticks).padStart(9)}`
    + `   ${a}:${b}`,
  );
}
console.log('\n面板波數＝叫戰術面板（含 B 快）真的開著的波數。0＝玩家連按的機會都沒有。');
console.log('★ setter 臂的比分被橫掃是治具缺陷（見檔頭），不影響「面板開了幾次」這個是非題；');
console.log('  但它的**代表性**不可用 ⇒ 可行率改由下面 B 段的 AI 對局口徑量。\n');

// ---- B 段 ----
console.log('════ B 段：可行率基準（純 AI vs AI 生涯局；分母＝我方第二觸規劃窗）════');
const B_ARMS = [
  { label: '第2屆・北原52', seasonIndex: 2, opponentId: 'north-tech', role: 'setter' },
  { label: '第2屆・鐵霧64', seasonIndex: 2, opponentId: 'iron-mist', role: 'setter' },
  { label: '第2屆・天鷹72', seasonIndex: 2, opponentId: 'sky-hawk', role: 'setter' },
  { label: '第3屆・北原52', seasonIndex: 3, opponentId: 'north-tech', role: 'setter' },
  { label: '第3屆・鐵霧64', seasonIndex: 3, opponentId: 'iron-mist', role: 'setter' },
  { label: '第3屆・天鷹72', seasonIndex: 3, opponentId: 'sky-hawk', role: 'setter' },
  { label: '第1屆・北原52', seasonIndex: 1, opponentId: 'north-tech', role: 'setter' },
];
const bRes = B_ARMS.map((arm) => ({ arm, agg: aggAi(arm) }));
console.log('臂            對手lv comboScale  窗數  可行  可行率    ±SE      窗/局 累計比分');
for (const { arm, agg } of bRes) {
  const n = agg.waves.length;
  const k = agg.waves.filter((w) => w.first?.bquick?.feasible).length;
  console.log(
    `${arm.label.padEnd(14)}${String(opponentById(arm.opponentId)?.level ?? '?').padStart(5)}`
    + `${String(agg.comboScale).padStart(11)}${String(n).padStart(7)}${String(k).padStart(6)}`
    + `  ${pct(k, n).padStart(7)} ${seStr(k, n).padStart(8)}  ${(n / SETS).toFixed(1)}`
    + `   ${agg.ptsFor}:${agg.ptsAgainst}`,
  );
}

console.log('\n---- 每局「叫得出 B 快」的機會次數 ----');
for (const { arm, agg } of bRes) {
  const k = agg.waves.filter((w) => w.first?.bquick?.feasible).length;
  console.log(`  ${arm.label.padEnd(14)} ${(k / SETS).toFixed(1)} 次/局（可行窗 ${k} / ${SETS} 局）`);
}

console.log('\n---- passTier 分層（B 快可行率）----');
const tiers = ['perfect', 'ok', 'poor'];
for (const { arm, agg } of bRes) {
  if (!agg.waves.length) { console.log(`  ${arm.label.padEnd(14)} （無窗）`); continue; }
  const cells = tiers.map((t) => {
    const sub = agg.waves.filter((w) => w.tier === t);
    if (!sub.length) return `${t}=—`;
    const k = sub.filter((w) => w.first?.bquick?.feasible).length;
    return `${t}=${k}/${sub.length}(${pct(k, sub.length)})`;
  }).join('  ');
  console.log(`  ${arm.label.padEnd(14)} ${cells}`);
}

console.log('\n---- 不可行原因分佈（B 快）----');
for (const { arm, agg } of bRes) {
  const bad = agg.waves.filter((w) => w.first && !w.first.bquick?.feasible);
  const cnt = new Map();
  for (const w of bad) {
    const rs = w.first.bquick?.reason ?? '(null)';
    cnt.set(rs, (cnt.get(rs) ?? 0) + 1);
  }
  const rows = [...cnt.entries()].sort((a, b) => b[1] - a[1])
    .map(([rs, n]) => `${rs}=${n}(${pct(n, bad.length)})`);
  console.log(`  ${arm.label.padEnd(14)} 不可行 ${bad.length}/${agg.waves.length}  ${rows.join('  ') || '—'}`);
}

console.log('\n---- 對照：其餘三型的可行率（同一批窗，供裁定時比較載體大小）----');
console.log(`臂            ${TYPES.map((t) => t.padEnd(10)).join('')}`);
for (const { arm, agg } of bRes) {
  if (!agg.waves.length) { console.log(`  ${arm.label.padEnd(14)} （無窗）`); continue; }
  const cells = TYPES.map((t) => {
    const k = agg.waves.filter((w) => w.first?.[t]?.feasible).length;
    return pct(k, agg.waves.length).padEnd(10);
  }).join('');
  console.log(`${arm.label.padEnd(14)}${cells}`);
}

console.log('\n---- AI 自動排程有沒有自己產出 B 快 ----');
for (const { arm, agg } of bRes) {
  console.log(`  ${arm.label.padEnd(14)} 規劃點 ${String(agg.plans).padStart(5)}　B快線 ${agg.bquickRoutes} 次`);
}

// ---- C 段 ----
console.log('\n════ C 段：★真的按下去★（同樣的 AI 局，只多寫一個 replanCall）════');
for (const arm of B_ARMS.slice(0, 3)) {
  const call = aggAi(arm, 'bquick');
  const ctl = bRes.find((x) => x.arm.label === arm.label).agg; // 同種子的不按對照
  const cmd = call.outcomes.get('command（成立）') ?? 0;
  const rows = [...call.outcomes.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}(${pct(v, call.calls)})`);
  const ptsN = call.won + call.lost;
  console.log(`\n■ ${arm.label}（${SETS} 局）`);
  console.log(`  按下 B 快的窗：${call.calls}（${(call.calls / SETS).toFixed(1)} 次/局）`);
  console.log(`  成立率：${cmd}/${call.calls} = ${pct(cmd, call.calls)} ${seStr(cmd, call.calls)}`);
  console.log(`  outcome 分佈：${rows.join('  ') || '—'}`);
  console.log(`  B 快線真的寫進助跑池：${call.bquickRoutes} 次（規劃點 ${call.plans}）`);
  const cN = ctl.won + ctl.lost;
  console.log(`  該波得分歸屬（按）：  我方 ${call.won} / 對方 ${call.lost} ＝ ${pct(call.won, ptsN)} ${seStr(call.won, ptsN)}`);
  console.log(`  該波得分歸屬（不按）：我方 ${ctl.won} / 對方 ${ctl.lost} ＝ ${pct(ctl.won, cN)} ${seStr(ctl.won, cN)}（窗 ${ctl.calls}）`);
  console.log(`  Δ（按 − 不按）＝ ${(100 * call.won / (ptsN || 1) - 100 * ctl.won / (cN || 1)).toFixed(1)}pp`);
  console.log(`  全場比分（按 B 快）：${call.ptsFor}:${call.ptsAgainst}`
    + `　（對照臂・完全不按）：${ctl.ptsFor}:${ctl.ptsAgainst}`);
}
