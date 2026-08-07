// `SHOOT.left_inside` 掃描（2026-08-07，Sawmah 裁定：留下 A，花一輪掃這個旋鈕）
// ── **零 `src/` 改動** ── 全部靠 Node 同步模組鉤子在載入時改字串，只活在子行程記憶體裡。
//
// 要回答的問題：上一輪查出「二速內切對 read 隊 −9.6pp，主因＝擦頂率 17.0%→26.5%」。
// 而 `SHOOT.left_inside = −2.0` 是用 `left` 的 hit/aim 比例反推的、**沒有掃描量過**
// （對照：`left` 的 −4.4 是實際量過的）。有沒有一個值能救回 read 又不毀掉 commit？
//
// ── 旋鈕的定義（一個旋鈕、兩個常數）──────────────────────
// `SHOOT[kind]` 是二速的**舉球落點** lx，`SHOOT_HIT[kind]` 是對應的**名目擊球點** lx
// （`takeoffSpotFor` 用它決定攻擊手跑去哪拔起）。兩者必須連動：只動落點不動擊球點，
// 攻擊手會跑錯地方、到位誤差爆掉——那量到的就不是這個旋鈕的效果。
// 因此本檔以**名目擊球點 h** 為掃描變數，落點由 `left` 量過的比例反推：
//   RATIO = SHOOT_HIT.left / SHOOT.left = −2.9 / −4.4 = 0.6591
//   SHOOT_HIT.left_inside = h　　SHOOT.left_inside = h / RATIO
// 現行值 h = −1.3（⇒ SHOOT −1.97 ≈ −2.0）。
//
// ── 掃描範圍與端點的理由 ────────────────────────────────
//   下界 h = −0.9：內切的全部戰術價值＝「擊球點離快攻點（lx 0）遠到跟死快攻的中間
//     攔網手構造上搆不到」，門檻是 `BLOCK_HALF_WIDTH`（CONVERGE_T=1 下實測 0.5m）。
//     再往內就進入他的涵蓋帶＝把戰術前提本身拆掉。−0.9 已經只剩 0.4m 餘裕，是實質下界。
//   上界 h = −2.5：`left`（直線）的二速擊球點是 −2.9。再往外，內切與直線的擊球點
//     差不到 0.4m ＝ 兩條線在攔網手眼裡沒有差別，「內切」這個決定失去意義。
//   步長 0.35m：略大於 BLOCK_HALF_WIDTH 的 2/3，確保相鄰兩點在攔網幾何上真的分得開。
//   ⇒ h ∈ {−0.9, −1.3(現行), −1.6, −2.0, −2.5}
//
// ── `off` 對照臂 ────────────────────────────────────────
// 裁定 A 之前（left_inside 恆三速）＝要救回的**目標線**。
//
// ── 為什麼強制二速 ──────────────────────────────────────
// 出廠是 35% 二速骰，二速內切每局只有約 1.1 記，樣本長太慢。本檔把 left_inside
// **強制成二速**（`tempoFor` 直接回 'two'），該格每局約 3.2 記。
// ⚠ 因此各臂的絕對值**不等於出廠 35% 混合後的值**，只能拿來互相比較（含 off 臂）。
//
// 用法：SWEEP_ARM=-1.3 SWEEP_SETS=500 node tools/inside-cut-shoot-sweep.mjs
//       （SWEEP_ARM=off ＝三速對照臂）
import { registerHooks } from 'node:module';

const ARM = process.env.SWEEP_ARM ?? '-1.3';
const SETS = Number.parseInt(process.env.SWEEP_SETS ?? '500', 10);
const RATIO = 2.9 / 4.4;
const OFF = ARM === 'off';
const H = OFF ? null : Number(ARM);
if (!OFF && !Number.isFinite(H)) throw new Error(`SWEEP_ARM 不是數字也不是 off：${ARM}`);
const SHOOT_LX = OFF ? null : Math.round((H / RATIO) * 1000) / 1000;

const hit = { cov: 0, wall: 0, zone: 0, tempo: 0, consts: 0 };
registerHooks({
  load(url, context, nextLoad) {
    const res = nextLoad(url, context);
    const norm = url.replace(/\\/g, '/');
    let src = typeof res.source === 'string'
      ? res.source : Buffer.from(res.source).toString('utf8');
    const sub = (from, to, tag) => {
      if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）：${from}`);
      src = src.replace(from, to);
    };
    if (norm.endsWith('/src/sim/approach.js')) {
      if (OFF) {
        // 裁定 A 之前：left_inside 恆三速（把二速骰與專屬弧一起撤掉）
        sub('const SHOOT = { left: -4.4, right: 4.4, left_inside: -2.0 };',
          'const SHOOT = { left: -4.4, right: 4.4 };', 'shoot-off');
        sub('const SHOOT_HIT = { left: -2.9, right: 2.9, left_inside: -1.3 };',
          'const SHOOT_HIT = { left: -2.9, right: 2.9 };', 'shoothit-off');
        sub("  if ((kind === 'left' || kind === 'right' || kind === 'left_inside') && passTier !== 'poor') {",
          "  if ((kind === 'left' || kind === 'right') && passTier !== 'poor') {", 'tempo-off');
      } else {
        sub('const SHOOT = { left: -4.4, right: 4.4, left_inside: -2.0 };',
          `const SHOOT = { left: -4.4, right: 4.4, left_inside: ${SHOOT_LX} };`, 'shoot');
        sub('const SHOOT_HIT = { left: -2.9, right: 2.9, left_inside: -1.3 };',
          `const SHOOT_HIT = { left: -2.9, right: 2.9, left_inside: ${H} };`, 'shoothit');
        // 強制二速：讓 left_inside 這條線恆走二速（樣本效率，見檔頭）
        sub("  if (isQuickKind(kind)) return 'one';",
          "  if (isQuickKind(kind)) return 'one';\n  if (kind === 'left_inside') return 'two';", 'force');
      }
      hit.tempo += 1;
      return { ...res, source: src };
    }
    if (!norm.endsWith('/src/sim/game.js')) return res;
    sub('  if (!inside) return false;',
      '  (globalThis.__SW ||= {}).lastCov = { toTeam, inside,\n'
      + '    halfWidth: band.halfWidth, byRole: contact ? contact.p.currentRole : null };\n'
      + '  if (!inside) return false;', 'cov');
    hit.cov += 1;
    sub("  if (zone !== 'body') {",
      '  (globalThis.__SW ||= {}).lastZone = zone;\n' + "  if (zone !== 'body') {", 'zone');
    hit.zone += 1;
    return { ...res, source: src };
  },
});

const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const ap = await import('../src/sim/approach.js');
const { TEAM_SIDE } = await import('../src/sim/rotation.js');
const { BLOCK_HALF_WIDTH } = await import('../src/sim/blockBand.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');

if (hit.cov !== 1 || hit.zone !== 1 || hit.tempo !== 1) {
  throw new Error(`patch 沒生效：${JSON.stringify(hit)}`);
}
if (ap.CROSS_RATE !== 0.3) throw new Error(`CROSS_RATE 被動過：${ap.CROSS_RATE}`);

const MAX_TICKS = 400000;

function runSet(oppId, run) {
  // ★ 同種子配對：每個臂跑同一組 run ⇒ 對手／名冊／初始種子逐值相同 ★
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: oppId, label: '' };
  const setup = careerMatchSetup(career, player, entry, roster, null);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  const rows = [];
  let cur = null;
  let setTouchTick = null;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const g = (globalThis.__SW ||= {});
    g.lastCov = null; g.lastZone = null;
    const ev = stepGame(game, aiCollectIntents(game, ai, []));
    if (cur && g.lastCov && g.lastCov.toTeam === 'B' && cur.cov === null) cur.cov = g.lastCov.inside;
    if (cur && g.lastZone && cur.zone === null) cur.zone = g.lastZone;
    let ended = false;
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.touches === 2 && e.team === 'A') setTouchTick = e.tick;
      if (cur && !ended) {
        if (e.type === 'BLOCK_TOUCH' && e.team === 'B') cur.bt = 1;
        else if (e.type === 'TOUCH' && e.team === 'B') { cur.out = 'dug'; rows.push(cur); cur = null; ended = true; }
        else if (e.type === 'TOUCH' && e.team === 'A') { cur.out = 'x'; rows.push(cur); cur = null; ended = true; }
        else if (e.type === 'SCORE') {
          cur.out = e.team === 'A' ? 'kill' : (cur.bt ? 'blockKill' : 'atkError');
          rows.push(cur); cur = null; ended = true;
        }
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        if (cur) { cur.out = 'sup'; rows.push(cur); }
        const route = ai.approach?.routes?.find((x) => x.pid === e.playerId) ?? null;
        const actor = game.actors[e.playerId];
        cur = {
          kind: ai.attackKind ?? null,
          tempo: route?.tempo ?? null,
          combo: ai.attackCombo ? ai.attackCombo.type : 'none',
          lx: actor ? TEAM_SIDE[game.players[e.playerId].teamId] * actor.x : null,
          ballY: e.ballY, dist: e.dist,
          react: setTouchTick != null ? e.tick - setTouchTick : null,
          cov: null, zone: null, bt: 0, out: null,
        };
        ended = false;
      }
      if (e.type === 'DEAD_BALL') setTouchTick = null;
    }
  }
  if (cur) { cur.out = 'sup'; rows.push(cur); }
  return rows.filter((a) => a.out !== 'sup' && a.combo === 'none');
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sdOf = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

function cell(rows) {
  const n = rows.length;
  // 淨得分：每球 x∈{+1 得分, −1 被攔死/自失誤, 0 其他}——SE 由樣本 SD 直接算，
  // 不用二項近似（淨得分是三態變數，二項 SE 會低估）
  const x = rows.map((a) => (a.out === 'kill' ? 1 : (a.out === 'blockKill' || a.out === 'atkError') ? -1 : 0));
  const netSE = n > 1 ? (sdOf(x) / Math.sqrt(n)) * 100 : null;
  const covRows = rows.filter((a) => a.cov !== null);
  const covered = covRows.filter((a) => a.cov === true).length;
  const cn = covRows.length;
  const zr = rows.filter((a) => a.zone);
  const zc = (k) => zr.filter((a) => a.zone === k).length;
  const zp = (k) => (zr.length ? (zc(k) / zr.length) * 100 : null);
  const zse = (k) => (zr.length ? Math.sqrt((zc(k) / zr.length) * (1 - zc(k) / zr.length) / zr.length) * 100 : null);
  return {
    n,
    net: n ? mean(x) * 100 : null,
    netSE,
    kill: n ? (rows.filter((a) => a.out === 'kill').length / n) * 100 : null,
    cov: cn ? (covered / cn) * 100 : null,
    covSE: cn ? Math.sqrt((covered / cn) * (1 - covered / cn) / cn) * 100 : null,
    zn: zr.length,
    top: zp('top'), topSE: zse('top'), body: zp('body'), side: zp('side'),
    lx: mean(rows.map((a) => a.lx).filter(Number.isFinite)),
    ballY: mean(rows.map((a) => a.ballY).filter(Number.isFinite)),
    dist: mean(rows.map((a) => a.dist).filter(Number.isFinite)),
    react: mean(rows.map((a) => a.react).filter(Number.isFinite)),
  };
}

const out = { arm: ARM, h: H, shoot: SHOOT_LX, sets: SETS, blockHalfWidth: BLOCK_HALF_WIDTH, opp: {} };
for (const oppId of ['north-tech', 'obsidian']) {
  const all = [];
  for (let r = 0; r < SETS; r += 1) all.push(...runSet(oppId, r));
  out.opp[oppId] = {
    inside: cell(all.filter((a) => a.kind === 'left_inside')),
    line: cell(all.filter((a) => a.kind === 'left')),
  };
}
process.stdout.write(`__JSON__${JSON.stringify(out)}`);
