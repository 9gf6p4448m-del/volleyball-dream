// 「切中路」有效性＋真實反應時限探針（08-07）—— **零 `src/` 改動**
//
// 動機：真人試玩回報①鈕跳出來時間很短②不知道按了有沒有用。要用真實執行路徑量三件事：
//   1) 浮鈕開窗當下，這球的 passTier 是不是 perfect（不是＝按了無效，routeKindFor 第一道閘）
//   2) 玩家真正必須按完的死線——不是 800ms，而是 ensureFlightPlan 幾時消費 aiState.cutCall
//      （§十-2「呼叫鎖定」：aiState.flightId 對齊 game.rally.flightId 那一刻，逐 flightId 只跑一次）
//   3)（本探針只答 1/2；第 3 題是幾何/視覺表現，另外用 Read 查 approach.js 靜態回答）
//
// 做法（不重抄被測邏輯）：
//   · registerHooks 給 matchLoop.js 加一行 export，把生產端 applyEvents 原封不動拿出來呼叫
//     （範式抄 tools/cut-button-window-probe.mjs）。
//   · 不 mock ensureFlightPlan／routeKindFor——直接呼叫真實 aiCollectIntents，
//     注入的 `aiState.cutCall` 走生產端唯一消費入口（ai.js:398 `cutFor: aiState.cutCall`）。
//   · 「開窗機會」偵測條件逐字同 matchLoop.js:1283-1291。
//
// 用法：node tools/cut-effectiveness-probe.mjs [局數=20]
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv[2] ?? '20', 10);

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
if (typeof loop.onCourt !== 'function') throw new Error('onCourt 沒導出');
const applyEvents = loop.__probeApplyEvents;
const { onCourt } = loop;

const MAX_TICKS = 400000;
const PLAYER_ID = 'A2';

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

// injectDelay：null＝不按（純觀測 passTier／attackerId 的自然結果）；
// 數字 N＝在「開窗機會之後第 N+1 個 tick」才把 aiState.cutCall 寫入
// （N=0＝最早可能的下一 tick，也就是「開窗當下立刻按」的最佳情況；
//  N=1＝再晚一 tick——用來驗證 §十-2 呼叫鎖定是否真的只給一 tick）。
function runPass({ sets, injectDelay, mode = 'quick' }) {
  const tally = {
    opportunities: 0, perfectTier: 0, becameAttacker: 0, perfectAndAttacker: 0,
    injected: 0, successLeftInside: 0, tierCounts: { perfect: 0, ok: 0, poor: 0, other: 0 },
    settledWindows: 0, settledLeftInside: 0,
    ticksToSecondTouch: [], // 開窗 tick → 二傳觸球（touches===2）tick 的差
  };
  for (let run = 0; run < sets; run += 1) {
    let gameOpts;
    if (mode === 'career') {
      const career = createCareer({ seed: 800000 + run * 7919, playerName: '探針' });
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
      gameOpts = { seed: 500000 + run * 7919, teams: createDefaultTeams(), setTarget: 25 };
    }
    const game = createGame(gameOpts);
    const ai = createAiState();
    const stage = deepStub({
      cutButton: deepStub({ show: () => {}, hide: () => {}, isVisible: () => false }),
      floatText: deepStub({ show: () => {}, setBaseOffset: () => {} }),
    });
    const s = {
      game, stage, playerId: PLAYER_ID, controlledId: PLAYER_ID, aiState: ai,
      replay: null, cutFlight: -1, cutWindowUntil: 0, calledFlight: -1, callWindowUntil: 0,
      rallyStartFlight: 0, schemeTally: {}, lOverrideTally: { n: 0, ok: 0 },
      shake: 0, hitStopUntil: 0, slowUntil: 0, counterArmedFlight: -1,
      careerCtx: null, gates: {}, config: {}, ctx: {},
    };
    const me = game.players[PLAYER_ID];
    let guard = 0;
    let pendingInjectAt = null;
    let watchFlight = null;
    let armed = false;
    let showTick = null; // 開窗那一 tick（供量測到二傳觸球的間隔）

    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
      guard += 1;
      if (pendingInjectAt != null && guard === pendingInjectAt) {
        ai.cutCall = { pid: PLAYER_ID, cut: true };
        tally.injected += 1;
        pendingInjectAt = null;
      }
      const intents = aiCollectIntents(game, ai, []);
      if (watchFlight != null && !armed && ai.flightId === watchFlight) {
        armed = true;
        tally.opportunities += 1;
        const tier = ai.passTier;
        tally.tierCounts[tier ?? 'other'] = (tally.tierCounts[tier ?? 'other'] ?? 0) + 1;
        const isPerfect = tier === 'perfect';
        if (isPerfect) tally.perfectTier += 1;
        const becameAttacker = ai.attackerId === PLAYER_ID;
        if (becameAttacker) tally.becameAttacker += 1;
        if (isPerfect && becameAttacker) tally.perfectAndAttacker += 1;
        if (injectDelay != null) {
          const route = ai.approach?.routes?.find((rt) => rt.pid === PLAYER_ID);
          if (route && route.kind === 'left_inside') tally.successLeftInside += 1;
        }
        watchFlight = null;
      }
      const ev = stepGame(game, intents);
      for (const e of ev) {
        if (e.type === 'TOUCH' && e.touches === 1 && e.team === me.teamId && !s.replay
          && game.players[PLAYER_ID]?.currentRole === 'outside'
          && onCourt(game, PLAYER_ID)
          && isFrontRow(game.match.rotations[me.teamId], PLAYER_ID)
          && s.cutFlight !== game.rally.flightId) {
          s.cutFlight = game.rally.flightId;
          if (watchFlight == null) {
            watchFlight = game.rally.flightId;
            armed = false;
            showTick = guard;
            if (injectDelay != null) pendingInjectAt = guard + 1 + injectDelay;
          }
        }
        if (e.type === 'TOUCH' && e.touches === 2 && e.team === me.teamId && showTick != null) {
          tally.ticksToSecondTouch.push(guard - showTick);
          showTick = null;
          // ★ 2026-08-07 追加：**窗關那一刻**再量一次 ★
          // 原本只在「本 flight 首次規劃」那一 tick 量（armed 分支），而那一 tick
          // 早於 D≥1 的注入時點 ⇒ 對「延後鎖定」的修法量不到東西（量測位置錯）。
          // 二傳觸球＝這一波的線最終定案，兩個版本上都是同一個位置、同一個判準。
          if (injectDelay != null && pendingInjectAt == null) {
            tally.settledWindows += 1;
            const rt = ai.approach?.routes?.find((x) => x.pid === PLAYER_ID);
            if (rt?.kind === 'left_inside') tally.settledLeftInside += 1;
          }
        }
      }
      try { applyEvents(s, ev, guard * 16.7); } catch { /* 樁不足時忽略，不影響量測欄位 */ }
    }
  }
  return tally;
}

function report(label, tally) {
  const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : 'n/a');
  console.log(`\n--- ${label} ---`);
  console.log(`開窗機會（分母＝每次開窗）＝${tally.opportunities}`);
  console.log(`  passTier 分布：${JSON.stringify(tally.tierCounts)}`);
  console.log(`  passTier===perfect（按了才有效）＝${tally.perfectTier}（${pct(tally.perfectTier, tally.opportunities)}%）`);
  console.log(`  玩家本人成為攻擊點＝${tally.becameAttacker}（${pct(tally.becameAttacker, tally.opportunities)}%）`);
  console.log(`  perfect 且本人是攻擊點（分母＝每次玩家實際成為攻擊點）＝${tally.perfectAndAttacker}（${pct(tally.perfectAndAttacker, tally.becameAttacker)}%）`);
  if (tally.injected) {
    console.log(`  已注入 cutCall 次數＝${tally.injected}　結果 kind===left_inside 次數＝${tally.successLeftInside}`
      + `（成功率 ${pct(tally.successLeftInside, tally.injected)}%）`);
  }
  if (tally.settledWindows) {
    console.log(`  ★窗關（二傳觸球）那一刻 kind===left_inside＝${tally.settledLeftInside}`
      + `／${tally.settledWindows}（${pct(tally.settledLeftInside, tally.settledWindows)}%）`);
  }
  if (tally.ticksToSecondTouch.length) {
    const arr = [...tally.ticksToSecondTouch].sort((a, b) => a - b);
    const ms = (t) => (t * 16.7).toFixed(0);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    console.log(`  開窗→二傳觸球（touches===2）間隔：中位 ${ms(arr[Math.floor(arr.length / 2)])}ms`
      + `　平均 ${ms(mean)}ms　最短 ${ms(arr[0])}ms　最長 ${ms(arr[arr.length - 1])}ms（n=${arr.length}）`);
  }
}

for (const mode of ['quick', 'career']) {
  console.log(`\n=== ${mode === 'quick' ? '快速比賽' : '生涯模式（第 1 屆小組賽）'}（OH＝${PLAYER_ID}，${SETS} 局）===`);
  const natural = runPass({ sets: SETS, injectDelay: null, mode });
  report('自然觀測（不按，量 passTier／攻擊點）', natural);

  const d0 = runPass({ sets: SETS, injectDelay: 0, mode });
  report('注入時機 D=0（開窗機會之後最早可能的下一 tick）', d0);

  const d1 = runPass({ sets: SETS, injectDelay: 1, mode });
  report('注入時機 D=1（再晚一 tick，＋16.7ms）', d1);

  const d5 = runPass({ sets: SETS, injectDelay: 5, mode });
  report('注入時機 D=5（再晚 5 tick，＋83ms）', d5);

  // ★ 真人反應區（≥150ms＝≥9 tick）★ 上面三個 D 都在人類反應時間**之內**，
  // 只證明「這顆鈕在機器手速下能不能用」；真人按得到的第一格在這裡。
  const d15 = runPass({ sets: SETS, injectDelay: 15, mode });
  report('注入時機 D=15（＋250ms＝真人反應區）', d15);
  const d30 = runPass({ sets: SETS, injectDelay: 30, mode });
  report('注入時機 D=30（＋500ms＝從容按下）', d30);
}
