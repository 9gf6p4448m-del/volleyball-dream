// 夾塞解封重量探針（08-05／08-06）—— **零 `src/` 改動**
//
// 動機：07-31 判決（commit 42f106c）把 TANDEM_PLAY_RATE 關到 0，真因寫明是
// 「攔死時 97.1% 的攔網手已經落地」。隔天 4010c26（攔網時序卷 段 1）把
// game.js:1085 的攔網資格閘改成「必須物理滯空」（`airT > AIR_TICKS && !blockManual`
// 直接被 continue 掉，落地者連牆都上不了）。沒有人回頭重量過夾塞。
// 本檔在**現行 HEAD** 下，把 `TANDEM_PLAY_RATE` patch 回原推導值 0.25，
// 用同一支臂（同一場對局、同一份 AI 行為）比較：
//   A 組＝夾塞球（`ai.attackCombo.type === 'tandem'`）
//   B 組＝無組合 right 線（`ai.attackCombo == null && ai.attackKind === 'right'`）
// 這兩個分組欄位是引擎既有記帳（ai.js:197/420），不是本檔重寫的判斷式。
//
// 「淨得分率」定義**照抄** tools/tandem-block-probe.mjs 的 outcomeAgg（07-31 判決用的
// 同一份探針）：netPct = 得分%（kill+toolKill） − （被攔死% + 自失誤%）。
//
// ★ 零行為改動的機械保證 ★
// 對 `src/` 一個位元組都不寫。唯一的兩個 patch 都走 Node 同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**，只活在這個子行程記憶體裡：
//   ① approach.js：TANDEM_PLAY_RATE 0 → 0.25（其餘幾何/判準/COMBO_* 一格不動）
//   ② game.js：tryBlock 的 `if (!inside) return false;` 前插一行只寫 globalThis
//      的快照（牆成員 id/x/起跳 tick），不改任何判斷式、不消費 rand()。
// 範式抄 tools/tandem-block-probe.mjs（本專案既有慣例）。
//
// 用法：node tools/tandem-revival-probe.mjs [局數=40]
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv[2] ?? '40', 10);

// ════════════════════════════════════════════════════════
// 載入鉤子
// ════════════════════════════════════════════════════════
const hit = { rate: 0, block: 0 };
registerHooks({
  load(url, context, nextLoad) {
    const res = nextLoad(url, context);
    const norm = url.replace(/\\/g, '/');
    if (!norm.includes('/src/sim/')) return res;
    let src = typeof res.source === 'string'
      ? res.source : Buffer.from(res.source).toString('utf8');
    const sub = (from, to, tag) => {
      if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）：${from}`);
      src = src.replace(from, to);
      hit[tag] += 1;
    };
    if (norm.endsWith('/src/sim/approach.js')) {
      sub('export const TANDEM_PLAY_RATE = 0;', 'export const TANDEM_PLAY_RATE = 0.25;', 'rate');
    }
    if (norm.endsWith('/src/sim/game.js')) {
      // 攔網結算快照：牆成員 id/x/起跳 tick，供事後算 airT（不影響 inside/contact 判定）
      // 單行錨點（CRLF 安全）：本檔是 \r\n 換行，兩行合併的 needle 會因 \n≠\r\n 匹配失敗。
      sub('  if (!inside) return false;',
        '  (globalThis.__TRP ||= {}).lastBlock = {\n'
        + '    tick: state.tick, toTeam,\n'
        + '    wall: members.map((m) => ({ id: m.id, start: m.actor.blockStartTick, manual: m.actor.blockManual === true })),\n'
        + '    bestId: contact ? contact.id : null,\n'
        + '  };\n'
        + '  if (!inside) return false;', 'block');
    }
    return { ...res, source: src };
  },
});

// ════════════════════════════════════════════════════════
// 實測
// ════════════════════════════════════════════════════════
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const { opponentById } = await import('../src/career/opponents.js');
const ap = await import('../src/sim/approach.js');

const MAX_TICKS = 400000;
const OPP_ID = 'obsidian'; // 與 tandem-block-probe.mjs 同一個對手，可對照

if (ap.TANDEM_PLAY_RATE !== 0.25) {
  throw new Error(`patch 沒生效：TANDEM_PLAY_RATE = ${ap.TANDEM_PLAY_RATE}`);
}

function setupMatch(run) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: OPP_ID, label: '' };
  return careerMatchSetup(career, player, entry, roster, null);
}

function runSet(run) {
  const setup = setupMatch(run);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  const attacks = [];
  let cur = null;

  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const g = (globalThis.__TRP ||= {});
    g.lastBlock = null;
    const intents = aiCollectIntents(game, ai, []);
    const ev = stepGame(game, intents);
    const tick = game.tick;
    const blkRec = g.lastBlock;

    // 攔網結算快照（每波只留第一次：那一次才是「這記扣球對上這面牆」）
    if (cur && blkRec && blkRec.toTeam === 'B' && !cur.blk) cur.blk = blkRec;

    let ended = false;
    for (const e of ev) {
      if (cur && !ended) {
        if (e.type === 'BLOCK_TOUCH' && e.team === 'B') {
          cur.bt = 1;
        } else if (e.type === 'TOUCH' && e.team === 'B') {
          cur.out = 'dug'; attacks.push(cur); cur = null; ended = true;
        } else if (e.type === 'TOUCH' && e.team === 'A') {
          cur.out = cur.bt ? 'blockBack' : 'returned'; attacks.push(cur); cur = null; ended = true;
        } else if (e.type === 'SCORE') {
          cur.out = e.team === 'A' ? (cur.bt ? 'toolKill' : 'kill') : (cur.bt ? 'blockKill' : 'atkError');
          attacks.push(cur); cur = null; ended = true;
        }
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        if (cur) { cur.out = 'superseded'; attacks.push(cur); }
        const combo = ai.attackCombo ?? null;
        cur = {
          tick,
          kind: ai.attackKind ?? null,
          combo: combo ? combo.type : 'none',
          blk: null, bt: 0, out: null,
        };
        ended = false;
      }
    }
  }
  if (cur) { cur.out = 'superseded'; attacks.push(cur); }
  return { seed: run, ticks: game.tick, attacks };
}

const sets = [];
for (let s = 0; s < SETS; s += 1) sets.push(runSet(s));
const all = sets.flatMap((s) => s.attacks.filter((a) => a.out !== 'superseded'));

// ════════════════════════════════════════════════════════
// 統計（netPct 定義照抄 tandem-block-probe.mjs outcomeAgg）
// ════════════════════════════════════════════════════════
const pct = (k, n) => (n ? (k / n) * 100 : null);
const seP = (k, n) => (n ? Math.sqrt(((k / n) * (1 - k / n)) / n) * 100 : null);
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));

function outcomeAgg(rows) {
  const n = rows.length;
  const kill = rows.filter((a) => a.out === 'kill' || a.out === 'toolKill').length;
  const bk = rows.filter((a) => a.out === 'blockKill').length;
  const err = rows.filter((a) => a.out === 'atkError').length;
  const killPct = pct(kill, n);
  const bkPct = pct(bk, n);
  const errPct = pct(err, n);
  return {
    n, kill, bk, err,
    killPct, killSE: seP(kill, n),
    bkPct, bkSE: seP(bk, n),
    errPct,
    netPct: killPct != null ? killPct - pct(bk + err, n) : null,
  };
}

// 攔死波：接觸者（bestId）起跳 tick 相對「攔網結算 tick」的滯空 tick（AIR_TICKS=24 為界）
function landedAgg(rows) {
  const AIR_TICKS = 24;
  const kills = rows.filter((a) => a.out === 'blockKill' && a.blk && a.blk.bestId);
  let airborne = 0; let landed = 0; let manual = 0;
  const airTs = [];
  for (const a of kills) {
    const b = a.blk;
    const m = b.wall.find((w) => w.id === b.bestId);
    if (!m) continue;
    const airT = b.tick - m.start;
    airTs.push(airT);
    if (m.manual) { manual += 1; continue; }
    if (airT >= 0 && airT <= AIR_TICKS) airborne += 1; else landed += 1;
  }
  const scored = airborne + landed;
  return {
    killN: kills.length, scored, manual,
    airbornePct: pct(airborne, scored), landedPct: pct(landed, scored),
    airTs,
  };
}

const tandemRows = all.filter((a) => a.combo === 'tandem');
const noneRightRows = all.filter((a) => a.combo === 'none' && a.kind === 'right');

console.log(`\n=== 夾塞解封重量探針（${SETS} 局，B＝${opponentById(OPP_ID).ai.blockPersona}）===`);
console.log(`patch 命中：${JSON.stringify(hit)}（各應為 1）`);
console.log(`TANDEM_PLAY_RATE 現值＝${ap.TANDEM_PLAY_RATE}`);

const A = outcomeAgg(tandemRows);
const B = outcomeAgg(noneRightRows);
const AL = landedAgg(tandemRows);
const BL = landedAgg(noneRightRows);

console.log('\n-- A 組：夾塞球（combo.type===tandem） --');
console.log(`n=${A.n} | 得分%=${f(A.killPct)}±${f(A.killSE, 2)} | 被攔死%=${f(A.bkPct)}±${f(A.bkSE, 2)}`
  + ` | 自失誤%=${f(A.errPct)} | 淨得分%=${f(A.netPct)}`);
console.log(`  攔死時攔網手已落地% = ${f(AL.landedPct)}（攔死n=${AL.killN}，計入分母的 scored=${AL.scored}，manual 排除=${AL.manual}）`);

console.log('\n-- B 組：無組合 right 線（同一支臂的對照） --');
console.log(`n=${B.n} | 得分%=${f(B.killPct)}±${f(B.killSE, 2)} | 被攔死%=${f(B.bkPct)}±${f(B.bkSE, 2)}`
  + ` | 自失誤%=${f(B.errPct)} | 淨得分%=${f(B.netPct)}`);
console.log(`  攔死時攔網手已落地% = ${f(BL.landedPct)}（攔死n=${BL.killN}，計入分母的 scored=${BL.scored}，manual 排除=${BL.manual}）`);

console.log('\n-- 對照 07-31 判決（同一份 netPct 定義） --');
console.log(`  07-31：夾塞 淨得分 10.6% / 被攔死 24.6%　vs　無組right 淨得分 57.9% / 被攔死 0.00%（n=3362）`);
console.log(`  07-31：攔死時已落地 97.1%`);
console.log(`  現在：夾塞 淨得分 ${f(A.netPct)}% / 被攔死 ${f(A.bkPct)}%　vs　無組right 淨得分 ${f(B.netPct)}% / 被攔死 ${f(B.bkPct)}%（n=${B.n}）`);
console.log(`  現在：攔死時已落地 ${f(AL.landedPct)}%`);
