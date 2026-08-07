// 「切中路」浮鈕顯示窗探針（08-07）—— **零 `src/` 改動**
//
// 動機：真人回報快速比賽與生涯模式都看不到 ↘切中路 浮鈕（6968a6f 上線）。
// 要量的是「顯示條件在真實執行路徑上到底成不成立」，不是重讀程式碼推論。
//
// 做法（不重抄被測邏輯 = 不循環論證）：
//   · 用 Node 同步模組鉤子（registerHooks，範式抄 tools/inside-cut-probe.mjs）
//     在載入時給 src/app/matchLoop.js **加一行 export**，把生產端的 `applyEvents`
//     原封不動拿出來呼叫——判斷式一個字都沒動、也沒複製。
//   · `stage` 用深層 Proxy 自動樁化（任何屬性都可呼叫），只把 cutButton.show／hide
//     換成計數器。真正被量的是「生產端 applyEvents 有沒有呼叫 stage.cutButton.show」。
//   · 另外用真實 rotation.isFrontRow / 真實 game 狀態，對每個
//     「我方第一觸」事件逐條記下各子條件的真假，供定位是哪一條擋住。
//     （這只是診斷輔助，結論以上面的 show() 計數為準。）
//
// 用法：node tools/cut-button-window-probe.mjs [局數=6]
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv[2] ?? '6', 10);

const patched = { n: 0 };
registerHooks({
  load(url, context, nextLoad) {
    const res = nextLoad(url, context);
    const norm = url.replace(/\\/g, '/');
    if (!norm.endsWith('/src/app/matchLoop.js')) return res;
    let src = typeof res.source === 'string'
      ? res.source : Buffer.from(res.source).toString('utf8');
    const anchor = 'function applyEvents(s, frameEvents, now) {';
    if (!src.includes(anchor)) throw new Error(`patch 目標消失：${anchor}`);
    src += '\nexport { applyEvents as __probeApplyEvents };\n';
    patched.n += 1;
    return { ...res, source: src };
  },
});

const { createGame, stepGame, createDefaultTeams } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { isFrontRow } = await import('../src/sim/rotation.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const loop = await import('../src/app/matchLoop.js');

if (patched.n !== 1) throw new Error(`patch 沒生效：${patched.n}`);
if (typeof loop.__probeApplyEvents !== 'function') throw new Error('applyEvents 沒導出');
const applyEvents = loop.__probeApplyEvents;

const MAX_TICKS = 400000;

// 深層 Proxy 樁：任何 stage.x.y() 都可呼叫且回傳同型 Proxy
function deepStub(hooks = {}) {
  const fn = () => stub;
  const stub = new Proxy(fn, {
    get(_t, key) {
      if (key in hooks) return hooks[key];
      if (key === Symbol.toPrimitive || key === 'then') return undefined;
      return deepStub(hooks);
    },
    apply() { return deepStub(hooks); },
  });
  return stub;
}

function runOne({ mode, run }) {
  let gameOpts;
  if (mode === 'career') {
    const career = createCareer({ seed: 700000 + run * 7919, playerName: '探針' });
    const player = createCareerPlayer('探針');
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: 'north-tech', label: '' };
    const setup = careerMatchSetup(career, player, entry, roster, null);
    gameOpts = {
      seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
      liberos: setup.liberos, setTarget: 25,
      ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
      ...(setup.benches ? { benches: setup.benches } : {}),
    };
  } else {
    // 快速比賽選 OH：matchConfig.buildQuickSetup('outside') 回 null＝預設建隊
    gameOpts = { seed: 500000 + run * 7919, teams: createDefaultTeams(), setTarget: 25 };
  }
  const game = createGame(gameOpts);
  const ai = createAiState();
  const playerId = 'A2';

  const tally = {
    show: 0, hide: 0,
    firstTouchMine: 0,     // 我方第一觸事件數（窗的起算事件）
    roleOk: 0, onCourtOk: 0, frontRowOk: 0, allOk: 0,
    byPos: {},             // 我方第一觸當下玩家的輪轉位置號 → 次數
  };
  const stage = deepStub({
    cutButton: deepStub({
      show: () => { tally.show += 1; openTick = guard; },
      hide: () => { tally.hide += 1; },
      isVisible: () => false,
    }),
    floatText: deepStub({ show: () => {}, setBaseOffset: () => {} }),
  });

  const s = {
    game, stage, playerId, controlledId: playerId, aiState: ai,
    replay: null, cutFlight: -1, cutWindowUntil: 0, calledFlight: -1, callWindowUntil: 0,
    rallyStartFlight: 0, schemeTally: {}, lOverrideTally: { n: 0, ok: 0 },
    shake: 0, hitStopUntil: 0, slowUntil: 0, counterArmedFlight: -1,
    careerCtx: null, gates: {}, config: {}, ctx: {},
  };

  const me = game.players[playerId];
  let guard = 0;
  let openTick = -1;
  tally.durTicks = [];
  tally.endBy = { touch: 0, phase: 0, timeout: 0 };
  let errored = null;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    const ev = stepGame(game, intents);
    if (ev.length === 0) {
      // 生產端窗管理每幀都跑，不只事件幀——空事件幀也要檢查關窗
      if (openTick >= 0) {
        const nowMs = (guard + 1) * 16.7;
        const byTimeout = nowMs > s.cutWindowUntil;
        const byPhase = game.phase !== 'rally';
        const byTouch = game.rally.touches !== 1;
        if (byTimeout || byPhase || byTouch) {
          tally.durTicks.push(guard + 1 - openTick);
          if (byTouch) tally.endBy.touch += 1;
          else if (byPhase) tally.endBy.phase += 1;
          else tally.endBy.timeout += 1;
          openTick = -1;
        }
      }
      continue;
    }

    // 診斷輔助（真實 game 狀態＋真實 isFrontRow）
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.touches === 1 && e.team === me.teamId) {
        tally.firstTouchMine += 1;
        const rot = game.match.rotations[me.teamId];
        const pos = rot.indexOf(playerId) + 1;
        tally.byPos[pos] = (tally.byPos[pos] ?? 0) + 1;
        const roleOk = game.players[playerId]?.currentRole === 'outside';
        const onOk = rot.includes(playerId);
        const frOk = isFrontRow(rot, playerId);
        if (roleOk) tally.roleOk += 1;
        if (onOk) tally.onCourtOk += 1;
        if (frOk) tally.frontRowOk += 1;
        if (roleOk && onOk && frOk) tally.allOk += 1;
      }
    }
    try {
      applyEvents(s, ev, guard * 16.7);
    } catch (err) {
      if (!errored) errored = err;
    }
    // 生產端窗管理判準逐字同 matchLoop.js:2116-2119（now 用同一把 tick 時鐘）
    if (openTick >= 0) {
      const nowMs = (guard + 1) * 16.7;
      const byTimeout = nowMs > s.cutWindowUntil;
      const byPhase = game.phase !== 'rally';
      const byTouch = game.rally.touches !== 1;
      if (byTimeout || byPhase || byTouch) {
        tally.durTicks.push(guard + 1 - openTick);
        if (byTouch) tally.endBy.touch += 1;
        else if (byPhase) tally.endBy.phase += 1;
        else tally.endBy.timeout += 1;
        openTick = -1;
      }
    }
  }
  return { tally, errored, points: `${game.match?.scores?.A ?? '?'}-${game.match?.scores?.B ?? '?'}` };
}

for (const mode of ['quick', 'career']) {
  const agg = { show: 0, hide: 0, firstTouchMine: 0, roleOk: 0, onCourtOk: 0, frontRowOk: 0, allOk: 0 };
  const byPos = {};
  const durs = []; const endBy = { touch: 0, phase: 0, timeout: 0 };
  let firstErr = null;
  for (let r = 0; r < SETS; r += 1) {
    const { tally, errored } = runOne({ mode, run: r });
    for (const k of Object.keys(agg)) agg[k] += tally[k];
    for (const [p, n] of Object.entries(tally.byPos)) byPos[p] = (byPos[p] ?? 0) + n;
    durs.push(...tally.durTicks);
    for (const k of Object.keys(endBy)) endBy[k] += tally.endBy[k];
    if (errored && !firstErr) firstErr = errored;
  }
  console.log(`\n=== ${mode === 'quick' ? '快速比賽（OH 預設建隊）' : '生涯模式（第 1 屆小組賽）'}　${SETS} 局 ===`);
  console.log(`我方第一觸（窗的起算事件）＝${agg.firstTouchMine}`);
  console.log(`  currentRole==='outside' 成立 ${agg.roleOk}　在場上 ${agg.onCourtOk}　前排 ${agg.frontRowOk}　三條全成立 ${agg.allOk}`);
  console.log(`  玩家當下輪轉位置分佈（1/5/6＝後排，2/3/4＝前排）：${JSON.stringify(byPos)}`);
  console.log(`★ 生產端 applyEvents 實際呼叫 stage.cutButton.show() 次數 ＝ ${agg.show}（hide ${agg.hide}）`);
  if (durs.length) {
    const sorted = [...durs].sort((a, b) => a - b);
    const ms = (t) => (t * 16.7).toFixed(0);
    const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
    console.log(`★ 浮鈕實際停留時間（tick→毫秒，60Hz）：中位 ${ms(sorted[Math.floor(sorted.length / 2)])}ms`
      + `　平均 ${ms(mean)}ms　最短 ${ms(sorted[0])}ms　最長 ${ms(sorted[sorted.length - 1])}ms（n=${durs.length}）`);
    console.log(`  <200ms 的比例＝${(sorted.filter((t) => t * 16.7 < 200).length / sorted.length * 100).toFixed(1)}%`
      + `　<400ms＝${(sorted.filter((t) => t * 16.7 < 400).length / sorted.length * 100).toFixed(1)}%`);
    console.log(`  關窗原因：二傳觸球 ${endBy.touch}　相位離開 rally ${endBy.phase}　0.8s 到期 ${endBy.timeout}`);
  }
  if (firstErr) console.log(`  ⚠ applyEvents 拋錯（樁不足或真有問題）：${firstErr.stack.split('\n').slice(0, 4).join(' | ')}`);
}
