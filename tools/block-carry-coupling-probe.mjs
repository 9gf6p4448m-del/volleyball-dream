// 攔網分工卷 step3 事前量測 —— x 逐 pid 化的耦合率（**零 `src/` 改動**）
//
// 用法：
//   node tools/block-carry-coupling-probe.mjs [局數=40]
//
// ★ 零行為改動的機械保證 ★
// 本檔對 `src/` 一個位元組都不寫。用 Node 的同步模組鉤子（`module.registerHooks`）
// 在**載入時改字串**——磁碟上的 src 逐行未動，patch 只活在本行程的記憶體裡。
// 作法照抄 `tools/block-divergence-probe.mjs:50-120`（`installHooks`／`sub()` 範本，
// 含「patch 目標消失就 throw」的保護）。三個 patch 點全是「插計數器」，
// 不改變任何既有分支的判斷條件或回傳值 ⇒ 對 sim 行為零影響（純測量、不改決策）。
//
// ── 量的兩件事 ──────────────────────────────────────────
// Q1（read 退路率）：ai.js:1638 blockAimX 在 persona===READ 時先走
//   predictContactPoint；回不出值時掉到 blockSetterTendency（那條才是 pid 會造成
//   分歧的來源）。量「正常路建 template 時，persona===READ 且
//   aim.contactTicks==null」佔「persona===READ 的正常路建計畫總次數」的比例。
//   patch 點：ai.js:1772 `const jumpAt = aim.contactTicks == null ? ...` 之前。
//
// Q2（blind 計畫的多人複製率＋現場求值可行性）：
//   part A：ai.js:1737 附近的 blind 退路建的計畫，`byPid` 最終出現 ≥2 個不同 pid
//   的比例。patch 點：blind 分支 `blockPlanFor(...)` 之後，把該 plan 物件塞進
//   全域陣列，等全部局跑完再讀 `Object.keys(plan.byPid).length`。
//   part B：第二名以後的攔網手第一次呼叫 `blockPlanFor` 的那一 tick，若當場呼叫
//   `blockSetterTendency(game, atkTeam, opts)`（opts 用該 tick的 aiState.passTier）
//   會不會回得出非 null 值。patch 點：ai.js:1798 `const c = blockPlanFor(plan,
//   playerId);` 之前——這裡 game/atkTeam/opts/plan/playerId 全部已在 scope，
//   `blockSetterTendency` 是 ai.js 自己 export 的函式、同檔內可直接呼叫。
//   （已確認 blockSetterTendency 是純函式：hash01 是純 hash、零 RNG 消耗——
//   額外呼叫它不會擾動 sim 本身的決定論路徑，見 ai.js:1597 註解。）
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv[2] ?? process.env.BC_SETS ?? '40', 10);
const OPP_ID = 'obsidian'; // 沿用 block-divergence-probe 的固定對手；persona 用 aiProfiles 覆寫

// ════════════════════════════════════════════════════════
// 載入鉤子：三個計數器 patch 點
// ════════════════════════════════════════════════════════
function installHooks() {
  const hit = { q1: 0, q2blindPush: 0, q2live: 0 };
  registerHooks({
    load(url, context, nextLoad) {
      const res = nextLoad(url, context);
      const norm = url.replace(/\\/g, '/');
      if (!norm.endsWith('/src/sim/ai.js')) return res;
      let src = typeof res.source === 'string'
        ? res.source : Buffer.from(res.source).toString('utf8');
      const sub = (from, to, tag) => {
        if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）：${from}`);
        src = src.replace(from, to);
        hit[tag] += 1;
      };
      // Q1：persona===READ 的正常路建 template 時，區分 aim.contactTicks 是否為 null
      sub(
        '    const jumpAt = aim.contactTicks == null ? null : tick + aim.contactTicks;',
        '    if (persona === BLOCK_PERSONA.READ) {\n'
        + '      const __g1 = (globalThis.__Q1 ||= { total: 0, fallback: 0 });\n'
        + '      __g1.total += 1;\n'
        + '      if (aim.contactTicks == null) __g1.fallback += 1;\n'
        + '    }\n'
        + '    const jumpAt = aim.contactTicks == null ? null : tick + aim.contactTicks;',
        'q1',
      );
      // Q2 part A：blind 計畫建起來後，把 plan 物件登記進全域陣列（跑完局後讀 byPid 大小）
      sub(
        "      aiState.blockPlan = newBlockPlan(team, {\n"
        + "        x: 0, enterTick: tick, jumpTick: null, replantUntil: -1, pendingX: null,\n"
        + "        blind: true, seen: false, jumpAt: null,\n"
        + "        hand: 'press', // §十-4b：盲跳也是 commit 的計畫——commit 不縮（Q1 乙裁定書性格表達）\n"
        + "      });\n"
        + "      blockPlanFor(aiState.blockPlan, playerId);\n"
        + "      return 0;",
        "      aiState.blockPlan = newBlockPlan(team, {\n"
        + "        x: 0, enterTick: tick, jumpTick: null, replantUntil: -1, pendingX: null,\n"
        + "        blind: true, seen: false, jumpAt: null,\n"
        + "        hand: 'press', // §十-4b：盲跳也是 commit 的計畫——commit 不縮（Q1 乙裁定書性格表達）\n"
        + "      });\n"
        + "      blockPlanFor(aiState.blockPlan, playerId);\n"
        + "      (globalThis.__Q2blind ||= []).push(aiState.blockPlan);\n"
        + "      return 0;",
        'q2blindPush',
      );
      // Q2 part B：第二名以後的攔網手在 blind 計畫上第一次呼叫 blockPlanFor 的那一 tick，
      // 現場試呼叫 blockSetterTendency（不改變 c 的求值方式，只是量測用的額外呼叫）
      sub(
        '  const c = blockPlanFor(plan, playerId);',
        '  if (plan.template && plan.template.blind === true && !plan.byPid[playerId]\n'
        + '    && Object.keys(plan.byPid).length >= 1) {\n'
        + '    const __g2 = (globalThis.__Q2live ||= { total: 0, nonNull: 0 });\n'
        + '    __g2.total += 1;\n'
        + '    if (blockSetterTendency(game, atkTeam, opts) != null) __g2.nonNull += 1;\n'
        + '  }\n'
        + '  const c = blockPlanFor(plan, playerId);',
        'q2live',
      );
      return { ...res, source: src };
    },
  });
  return hit;
}

const patchHits = installHooks();

// ════════════════════════════════════════════════════════
// 跑局（借用 block-divergence-probe 的 setup／驅動迴圈）
// ════════════════════════════════════════════════════════
async function run() {
  const { createGame, stepGame } = await import('../src/sim/game.js');
  const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
  const { createCareer, createCareerPlayer, careerMatchSetup } =
    await import('../src/career/careerState.js');
  const { buildStarterMembers } = await import('../src/career/roster.js');

  const MAX_TICKS = 400000;

  function setupMatch(personaIdx, run) {
    const career = createCareer({ seed: 900000 + personaIdx * 100000 + run * 7919, playerName: '探針' });
    const player = createCareerPlayer('探針');
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: OPP_ID, label: '' };
    return careerMatchSetup(career, player, entry, roster, null);
  }

  function runSet(personaIdx, persona, run) {
    const setup = setupMatch(personaIdx, run);
    const game = createGame({
      seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
      liberos: setup.liberos, setTarget: 25,
      ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
      ...(setup.benches ? { benches: setup.benches } : {}),
    });
    // 強制守方 B 的 blockPersona，確保兩種人格都被涵蓋到（不依賴對手 DNA）
    game.aiProfiles = game.aiProfiles ?? {};
    game.aiProfiles.B = { ...(game.aiProfiles.B ?? {}), blockPersona: persona };
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
      guard += 1;
      const intents = aiCollectIntents(game, ai, []);
      stepGame(game, intents);
    }
    return { seed: run, ticks: game.tick };
  }

  const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
  const results = {};
  const personas = ['read', 'commit'];
  for (let pi = 0; pi < personas.length; pi += 1) {
    const persona = personas[pi];
    globalThis.__Q1 = { total: 0, fallback: 0 };
    globalThis.__Q2blind = [];
    globalThis.__Q2live = { total: 0, nonNull: 0 };
    for (let s = 0; s < SETS; s += 1) runSet(pi, persona, s);

    const q1 = globalThis.__Q1;
    const blindPlans = globalThis.__Q2blind;
    const multiPid = blindPlans.filter((p) => Object.keys(p.byPid).length >= 2).length;
    const q2live = globalThis.__Q2live;

    results[persona] = {
      q1Total: q1.total, q1Fallback: q1.fallback,
      q1Pct: q1.total ? (q1.fallback / q1.total) * 100 : null,
      blindN: blindPlans.length, blindMultiN: multiPid,
      blindMultiPct: blindPlans.length ? (multiPid / blindPlans.length) * 100 : null,
      q2liveTotal: q2live.total, q2liveNonNull: q2live.nonNull,
      q2livePct: q2live.total ? (q2live.nonNull / q2live.total) * 100 : null,
    };

    console.log(`\n=== persona=${persona}（${SETS} 局）===`);
    console.log(`Q1 read 退路率：${q1.fallback} / ${q1.total}`
      + ` = ${f(results[persona].q1Pct, 2)}%`);
    console.log(`Q2-A blind 計畫多人複製率：${multiPid} / ${blindPlans.length}`
      + ` = ${f(results[persona].blindMultiPct, 2)}%`);
    console.log(`Q2-B 第二名以後首次求值可行率：${q2live.nonNull} / ${q2live.total}`
      + ` = ${f(results[persona].q2livePct, 2)}%`);
  }

  console.log(`\npatch 命中次數：${JSON.stringify(patchHits)}`);
  console.log('\n=== 彙總（跨兩 persona 合計，供對照）===');
  const q1TotalAll = results.read.q1Total + results.commit.q1Total;
  const q1FallbackAll = results.read.q1Fallback + results.commit.q1Fallback;
  const blindNAll = results.read.blindN + results.commit.blindN;
  const blindMultiAll = results.read.blindMultiN + results.commit.blindMultiN;
  const q2TotalAll = results.read.q2liveTotal + results.commit.q2liveTotal;
  const q2NonNullAll = results.read.q2liveNonNull + results.commit.q2liveNonNull;
  console.log(`Q1 合計：${q1FallbackAll} / ${q1TotalAll}`
    + ` = ${f(q1TotalAll ? (q1FallbackAll / q1TotalAll) * 100 : null, 2)}%`);
  console.log(`Q2-A 合計：${blindMultiAll} / ${blindNAll}`
    + ` = ${f(blindNAll ? (blindMultiAll / blindNAll) * 100 : null, 2)}%`);
  console.log(`Q2-B 合計：${q2NonNullAll} / ${q2TotalAll}`
    + ` = ${f(q2TotalAll ? (q2NonNullAll / q2TotalAll) * 100 : null, 2)}%`);
}

await run();
