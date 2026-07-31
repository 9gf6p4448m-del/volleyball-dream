// 夾塞診斷 補充探針：**擊球品質**（為什麼夾塞的球飛得比較久）——零 `src/` 改動
//
// 主探針 tools/tandem-block-probe.mjs 量到「擊球→過網」夾塞 p50 22 tick、right 8 tick，
// 但深度只差 0.53m ⇒ 差距不可能全由深度解釋。本檔把 TOUCH 事件既有的兩個欄位
// （`power`＝蓄力 timing、`dist`＝到位程度）與球出手速度攤開來對照，
// 分辨「打得深」與「打得軟」兩種成因。
//
// 只掛**日誌型**鉤子（記 ball.vx/vy/vz），判定邏輯零重抄；`power`／`dist` 直接讀事件流。
//
// 用法：node tools/tandem-hitquality-probe.mjs [局數=200]
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv[2] ?? '200', 10);

registerHooks({
  load(url, context, nextLoad) {
    const res = nextLoad(url, context);
    const norm = url.replace(/\\/g, '/');
    if (!norm.endsWith('/src/sim/game.js')) return res;
    let src = typeof res.source === 'string'
      ? res.source : Buffer.from(res.source).toString('utf8');
    const anchor = '  ev.push({\n    type: \'TOUCH\', tick: state.tick, team, playerId: player.id,';
    if (!src.includes(anchor)) throw new Error('patch 目標消失');
    src = src.replace(anchor,
      '  (globalThis.__TQ ||= {}).last = {\n'
      + '    vx: ball.vx, vy: ball.vy, vz: ball.vz,\n'
      + '    hz: from.z, hy: from.y, az: actor.z,\n'
      + '  };\n' + anchor);
    return { ...res, source: src };
  },
});

const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');

const rows = [];
for (let run = 0; run < SETS; run += 1) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const setup = careerMatchSetup(career, player,
    { id: 'group-3', stage: 'group', opponentId: 'obsidian', label: '' }, roster, null);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    (globalThis.__TQ ||= {}).last = null;
    const intents = aiCollectIntents(game, ai, []);
    const kind = ai.attackKind ?? null;
    const combo = ai.attackCombo ? ai.attackCombo.type : 'none';
    const ev = stepGame(game, intents);
    const q = globalThis.__TQ.last;
    for (const e of ev) {
      if (e.type !== 'TOUCH' || e.kind !== 'spike' || e.team !== 'A' || !q) continue;
      rows.push({
        kind, combo, power: e.power, dist: e.dist, ballY: e.ballY,
        hz: Math.abs(q.hz), az: Math.abs(q.az),
        speed: Math.hypot(q.vx, q.vy, q.vz),
        vzAbs: Math.abs(q.vz),
      });
    }
  }
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const q50 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const seM = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) / a.length);
};
const f = (v, d = 3) => (v == null ? '  -  ' : v.toFixed(d));

console.log(`\n=== 擊球品質對照（${SETS} 局，A 隊全部扣球）===`);
console.log('組別          n | power p50/mean±SE | dist p50/mean | 出手速度 p50/mean±SE | |vz| p50 | 擊球lz p50 | 擊球高y p50');
const groups = [
  ['tandem', (r) => r.combo === 'tandem'],
  ['cross', (r) => r.combo === 'cross'],
  ['delay', (r) => r.combo === 'delay'],
  ['none/right', (r) => r.combo === 'none' && r.kind === 'right'],
  ['none/left', (r) => r.combo === 'none' && r.kind === 'left'],
  ['none/quick', (r) => r.combo === 'none' && r.kind === 'quick'],
  ['ALL', () => true],
];
for (const [label, pred] of groups) {
  const g = rows.filter(pred);
  if (!g.length) { console.log(`${label.padEnd(11)} 0`); continue; }
  const p = g.map((r) => r.power); const d = g.map((r) => r.dist);
  const s = g.map((r) => r.speed); const v = g.map((r) => r.vzAbs);
  console.log(`${label.padEnd(11)} ${String(g.length).padStart(5)} |`
    + ` ${f(q50(p), 2)}/${f(mean(p), 3)}±${f(seM(p), 3)} |`
    + ` ${f(q50(d), 2)}/${f(mean(d), 2)} |`
    + ` ${f(q50(s), 2)}/${f(mean(s), 2)}±${f(seM(s), 2)} |`
    + ` ${f(q50(v), 2)} | ${f(q50(g.map((r) => r.hz)), 3)} | ${f(q50(g.map((r) => r.ballY)), 2)}`);
}
