// 「二速內切為什麼兩軸都變差」機制探針（2026-08-07）—— **零 `src/` 改動**
//
// 背景：裁定 A 落地後，內切對 read 隊 −8.3→−11.0pp、對 commit 隊 +10.8→+5.7pp。
// Sawmah 的心智模型是「變速＋變位＝兩個維度疊加，應該更難防」，實測相反 ⇒ 要**機制上的
// 解釋**，而且每一條因果都要在真實路徑上量到（本專案已有五次「推論冒充量測」前科）。
//
// ★ 為什麼不需要反事實臂 ★ 現行 HEAD 上 `left_inside` 本來就有兩種節奏
// （`tempoFor` 的 35% 二速骰），而節奏骰（KIND_SALT 11）與內切骰（CROSS_SALT 57）
// 吃的是**不同的 hash**、彼此獨立 ⇒ 同一場比賽裡「二速內切」與「三速內切」是
// 隨機分配的兩組，對手／隊伍／種子全部相同。這是真實路徑上的自然實驗，
// 比 patch 出來的反事實臂更有證明力。
//
// ── 量什麼（每一記扣球一列）──────────────────────────────
//   kind/tempo    這條線與這一波的節奏（ai.approach.routes，引擎自己的記帳）
//   牆的狀態      **球過網那一 tick**（tryBlock 被呼叫的時點）對面前排三人各自的
//                 `state.tick - actor.blockStartTick`（airT）＋ blockUntil／blockHand
//                 ⇒ 分成「空中(airT≤AIR_TICKS)」「已落地(airT>AIR_TICKS)」「這球沒跳」
//                 中間攔網手（role==='middle'）另外單獨列——Sawmah 的假設是關於他
//   涵蓋率        tryBlock 的 `inside`（球過網的 x 落在牆的帶內）——與 inside-cut-probe 同一格
//   擊球高度      TOUCH 事件自帶的 `ballY`（引擎自己記的，不是我重算的）
//   到位程度      TOUCH 事件自帶的 `dist`（攻擊手離球多遠＝到位誤差）
//   出手時機      TOUCH 事件自帶的 `power`
//   反應時間      二傳觸球 → 扣球 的 tick 數（攔網手看得到球在飛的那段）
//
// 用法：node tools/inside-cut-why-probe.mjs [局數=150]
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv.find((a) => /^\d+$/.test(a)) ?? '150', 10);
// --before＝把 approach.js 在**載入時**還原成裁定 A 之前的樣子（left_inside 恆三速）。
// 用途：left_inside/three、left/two、left/three 這三格的幾何**兩版逐字相同**，
// 它們在兩版之間的差距就是「重新抽樣／軌跡發散」的雜訊底噪——沒有這個底噪，
// 就分不出總表的位移是機制造成的還是換了一批 rally 造成的。
const BEFORE = process.argv.includes('--before');

const hit = { cov: 0, wall: 0, before: 0, zone: 0 };
registerHooks({
  load(url, context, nextLoad) {
    const res = nextLoad(url, context);
    const norm = url.replace(/\\/g, '/');
    let src = typeof res.source === 'string'
      ? res.source : Buffer.from(res.source).toString('utf8');
    if (BEFORE && norm.endsWith('/src/sim/approach.js')) {
      const undo = (a, b, tag) => {
        if (!src.includes(a)) throw new Error(`--before patch 目標消失（${tag}）：${a}`);
        src = src.replace(a, b);
      };
      undo('const SHOOT = { left: -4.4, right: 4.4, left_inside: -2.0 };',
        'const SHOOT = { left: -4.4, right: 4.4 };', 'shoot');
      undo('const SHOOT_HIT = { left: -2.9, right: 2.9, left_inside: -1.3 };',
        'const SHOOT_HIT = { left: -2.9, right: 2.9 };', 'shoothit');
      undo('const KIND_SALT = { left: 11, right: 23, left_inside: 11 };',
        'const KIND_SALT = { left: 11, right: 23 };', 'salt');
      undo("  if ((kind === 'left' || kind === 'right' || kind === 'left_inside') && passTier !== 'poor') {",
        "  if ((kind === 'left' || kind === 'right') && passTier !== 'poor') {", 'tempo');
      hit.before += 1;
      return { ...res, source: src };
    }
    if (!norm.endsWith('/src/sim/game.js')) return res;
    // ① 涵蓋率快照（錨點與 tools/inside-cut-probe.mjs 逐字相同）
    const from1 = '  if (!inside) return false;';
    if (!src.includes(from1)) throw new Error(`patch 目標消失（cov）：${from1}`);
    src = src.replace(from1,
      '  (globalThis.__ICP ||= {}).lastCov = { toTeam, inside, ballX: b.x,\n'
      + '    halfWidth: band.halfWidth, byId: contact ? contact.p.id : null,\n'
      + '    byRole: contact ? contact.p.currentRole : null,\n'
      + '    handTop: contact ? contact.top : null, dx: contact ? contact.dx : null };\n'
      + from1);
    hit.cov += 1;
    // ③ 接觸分區快照：`classifyBlockContact` 的結果決定「擦頂／擦邊／手身」——
    //    只有 'body' 走得到第三層擲骰、也只有它攔得死（game.js:1117,1173）。
    //    涵蓋率相同但被攔死不同時，答案只可能在這裡。
    const from3 = "  if (zone !== 'body') {";
    if (!src.includes(from3)) throw new Error(`patch 目標消失（zone）：${from3}`);
    src = src.replace(from3, '  (globalThis.__ICP ||= {}).lastZone = zone;\n' + from3);
    hit.zone += 1;
    // ② 牆的狀態快照：插在 tryBlock 的**第一行之後**（早於任何 return），
    //    純讀 actor 既有欄位、不改任何判斷式、不消費 rand()
    // 錨點只取單行（game.js 是 CRLF，跨行字面量對不上）
    const from2 = 'function tryBlock(state, toTeam, ev) {';
    if (!src.includes(from2)) throw new Error(`patch 目標消失（wall）：${from2}`);
    src = src.replace(from2, from2 + `
  (globalThis.__ICP ||= {}).lastWall = {
    tick: state.tick,
    toTeam,
    ballY: state.ball.y,
    members: Object.values(state.players)
      .filter((p) => p.teamId === toTeam && isFrontRowOf(state, toTeam, p.id))
      .map((p) => ({
        id: p.id,
        role: p.currentRole,
        airT: state.tick - state.actors[p.id].blockStartTick,
        live: state.actors[p.id].blockUntil >= state.tick,
        hand: state.actors[p.id].blockHand,
        x: state.actors[p.id].x,
        // 手的頂邊＝半正弦（player.js:132，峰值在 airT = AIR_TICKS/2 = 12）
        top: blockTopEdge(p, state.tick - state.actors[p.id].blockStartTick,
          staminaPerfMul(state, p)),
      })),
  };`);
    hit.wall += 1;
    return { ...res, source: src };
  },
});

const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { AIR_TICKS } = await import('../src/sim/approach.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const { opponentById } = await import('../src/career/opponents.js');
const ap = await import('../src/sim/approach.js');

if (hit.cov !== 1 || hit.wall !== 1 || hit.zone !== 1) throw new Error(`patch 沒生效：${JSON.stringify(hit)}`);
if (BEFORE && hit.before !== 1) throw new Error(`--before patch 沒生效：${JSON.stringify(hit)}`);
if (ap.CROSS_RATE !== 0.3) throw new Error(`CROSS_RATE 被動過：${ap.CROSS_RATE}`);

const MAX_TICKS = 400000;

function setupMatch(oppId, run) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: oppId, label: '' };
  return careerMatchSetup(career, player, entry, roster, null);
}

function runSet(oppId, run) {
  const setup = setupMatch(oppId, run);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  const attacks = [];
  let cur = null;
  let setTouchTick = null;
  let guard = 0;

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const g = (globalThis.__ICP ||= {});
    g.lastCov = null;
    g.lastWall = null;
    g.lastZone = null;
    const intents = aiCollectIntents(game, ai, []);
    const ev = stepGame(game, intents);
    const covRec = g.lastCov;
    const wallRec = g.lastWall;

    // tryBlock 每記扣球只在過網那一 tick 呼叫一次（game.js:1030-1034）
    if (cur && covRec && covRec.toTeam === 'B' && cur.cov === null) {
      cur.cov = covRec.inside; cur.covRec = covRec;
    }
    if (cur && wallRec && wallRec.toTeam === 'B' && cur.wall === null) cur.wall = wallRec;
    if (cur && g.lastZone && cur.zone === null) cur.zone = g.lastZone;

    let ended = false;
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.touches === 2 && e.team === 'A') setTouchTick = e.tick;
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
        const route = ai.approach?.routes?.find((x) => x.pid === e.playerId) ?? null;
        cur = {
          kind: ai.attackKind ?? null,
          tempo: route?.tempo ?? null,
          combo: ai.attackCombo ? ai.attackCombo.type : 'none',
          ballY: e.ballY, dist: e.dist, power: e.power,
          react: setTouchTick != null ? e.tick - setTouchTick : null,
          // 情蒐耦合檢查：`scoutBlockMul`（game.js:409）吃的是主角**扣球分區的佔比**
          // （line/cross/middle/tip），不是節奏。二速內切的擊球點由 −1.06 移到 −1.38，
          // 有可能把分區佔比推過 0.35／0.15 的門檻 ⇒ 連帶改變**三速那些球**的攔網加成。
          // 那會讓「幾何沒動的格子」出現系統性位移（＝不是重新抽樣的雜訊）。
          spikeZone: game.rally.lastSpikeZone ?? null,
          cov: null, covRec: null, wall: null, zone: null, bt: 0, out: null,
        };
        ended = false;
      }
      if (e.type === 'DEAD_BALL') setTouchTick = null;
    }
  }
  if (cur) { cur.out = 'superseded'; attacks.push(cur); }
  return attacks;
}

// ════════════════════════════════════════════════════════
// 統計
// ════════════════════════════════════════════════════════
const pct = (k, n) => (n ? (k / n) * 100 : null);
const seP = (k, n) => (n ? Math.sqrt(((k / n) * (1 - k / n)) / n) * 100 : null);
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const q = (a, p) => {
  const s = [...a].filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null;
};

// 牆的狀態分類（判準抄 game.js:1085 那道資格閘：airT > AIR_TICKS 就不算牆的一員）
function wallStat(rows) {
  let inAir = 0; let landed = 0; let never = 0; let n = 0;
  let midInAir = 0; let midLanded = 0; let midNever = 0; let midN = 0;
  const midAirT = [];
  const midTop = [];
  const contactRole = {};
  const margin = [];
  const dxFrac = [];
  for (const a of rows) {
    if (!a.wall) continue;
    for (const m of a.wall.members) {
      // 「這球沒跳」＝ blockStartTick 還停在很久以前（初值 −9999／上一球）
      const state = !m.live && m.airT > 200 ? 'never'
        : m.airT >= 0 && m.airT <= AIR_TICKS ? 'inAir' : 'landed';
      n += 1;
      if (state === 'inAir') inAir += 1; else if (state === 'landed') landed += 1; else never += 1;
      if (m.role === 'middle') {
        midN += 1;
        if (state === 'inAir') midInAir += 1;
        else if (state === 'landed') midLanded += 1; else midNever += 1;
        if (state !== 'never') { midAirT.push(m.airT); if (Number.isFinite(m.top)) midTop.push(m.top); }
      }
    }
  }
  for (const a of rows) {
    if (!a.covRec || !a.covRec.inside) continue;
    const r = a.covRec.byRole ?? '?';
    contactRole[r] = (contactRole[r] ?? 0) + 1;
    // ⚠ 淨空高度必須用**球過網那一刻**的球高（wall.ballY），不是扣球接觸高度（a.ballY）——
    //    那是兩個不同時刻，混用會算出「球在手上方 0.3m 卻仍被判在牆內」這種自相矛盾的值。
    if (Number.isFinite(a.covRec.handTop) && Number.isFinite(a.wall?.ballY)) {
      margin.push(a.covRec.handTop - a.wall.ballY);
    }
    if (Number.isFinite(a.covRec.dx) && a.covRec.halfWidth > 0) {
      dxFrac.push(Math.abs(a.covRec.dx) / a.covRec.halfWidth);
    }
  }
  return {
    n, inAir, landed, never, midN, midInAir, midLanded, midNever,
    midAirTP50: q(midAirT, 0.5),
    midTopP50: q(midTop, 0.5),
    contactRole,
    marginP50: q(margin, 0.5),
    dxFracP50: q(dxFrac, 0.5),
    zones: rows.reduce((m, a) => { if (a.zone) m[a.zone] = (m[a.zone] ?? 0) + 1; return m; }, {}),
    dxCentral: pct(dxFrac.filter((v) => v <= 0.5).length, dxFrac.length),
  };
}

function agg(rows) {
  const n = rows.length;
  const kill = rows.filter((a) => a.out === 'kill' || a.out === 'toolKill').length;
  const bk = rows.filter((a) => a.out === 'blockKill').length;
  const err = rows.filter((a) => a.out === 'atkError').length;
  const touched = rows.filter((a) => a.bt === 1).length;
  const covRows = rows.filter((a) => a.cov !== null);
  const covered = covRows.filter((a) => a.cov === true).length;
  const killPct = pct(kill, n);
  return {
    n,
    killPct,
    bkPct: pct(bk, n),
    touchedPct: pct(touched, n),
    netPct: killPct != null ? killPct - pct(bk + err, n) : null,
    netSE: seP(kill, n),
    covPct: pct(covered, covRows.length),
    covSE: seP(covered, covRows.length),
    covN: covRows.length,
    ballY: mean(rows.map((a) => a.ballY).filter(Number.isFinite)),
    dist: mean(rows.map((a) => a.dist).filter(Number.isFinite)),
    power: mean(rows.map((a) => a.power).filter(Number.isFinite)),
    react: q(rows.map((a) => a.react).filter(Number.isFinite), 0.5),
    wall: wallStat(rows),
  };
}

function printCell(label, a) {
  const w = a.wall;
  console.log(`  ${label.padEnd(22)} n=${String(a.n).padStart(4)}`
    + ` 淨得分=${f(a.netPct)}±${f(a.netSE, 2)}  得分=${f(a.killPct)}  被攔死=${f(a.bkPct)}`
    + `  被攔碰=${f(a.touchedPct)}  涵蓋=${f(a.covPct)}±${f(a.covSE, 2)}`);
  console.log(`  ${''.padEnd(22)}    擊球高度=${f(a.ballY, 2)}m  到位誤差=${f(a.dist, 2)}m`
    + `  出手時機=${f(a.power, 2)}  二傳→擊球=${f(a.react, 0)}tick`);
  console.log(`  ${''.padEnd(22)}    牆(前排3人×n)：空中 ${f(pct(w.inAir, w.n))}%`
    + `  已落地 ${f(pct(w.landed, w.n))}%  這球沒跳 ${f(pct(w.never, w.n))}%`
    + `｜★中間手：空中 ${f(pct(w.midInAir, w.midN))}%  已落地 ${f(pct(w.midLanded, w.midN))}%`
    + `  沒跳 ${f(pct(w.midNever, w.midN))}%  airT p50=${f(w.midAirTP50, 0)}`
    + `（手頂 p50=${f(w.midTopP50, 2)}m）`);
  console.log(`  ${''.padEnd(22)}    罩到時是誰的手：${JSON.stringify(w.contactRole)}`
    + `　手頂−過網球高 p50=${f(w.marginP50, 2)}m`
    + `　帶內中心度 |dx|/halfWidth p50=${f(w.dxFracP50, 2)}`
    + `（正對手心 ≤0.5 的比例 ${f(w.dxCentral)}%）`);
  const zt = Object.values(w.zones).reduce((x, y) => x + y, 0);
  console.log(`  ${''.padEnd(22)}    接觸分區（只有 body 攔得死）：`
    + `body ${f(pct(w.zones.body ?? 0, zt))}%  top ${f(pct(w.zones.top ?? 0, zt))}%`
    + `  side ${f(pct(w.zones.side ?? 0, zt))}%（n=${zt}，佔全部 ${f(pct(zt, a.n))}%）`);
}

console.log(`patch 命中：${JSON.stringify(hit)}｜CROSS_RATE=${ap.CROSS_RATE}｜AIR_TICKS=${AIR_TICKS}`);
console.log(`臂＝${BEFORE ? '★before（裁定 A 之前：left_inside 恆三速）★' : 'after（現行 HEAD）'}`);
console.log(`每格 ${SETS} 局。★同一場比賽裡二速／三速是隨機分配（節奏骰與內切骰不同 hash）★`);

function zoneShare(rows) {
  const m = {};
  for (const a of rows) if (a.spikeZone) m[a.spikeZone] = (m[a.spikeZone] ?? 0) + 1;
  const t = Object.values(m).reduce((x, y) => x + y, 0);
  return { m, t, txt: Object.entries(m).sort().map(([k, v]) => `${k} ${f(pct(v, t))}%`).join('  ') };
}

for (const [oppId, label] of [['north-tech', 'read 隊（北原工商）'], ['obsidian', 'commit 隊（曜石體中）']]) {
  const opp = opponentById(oppId);
  const all = [];
  for (let s = 0; s < SETS; s += 1) all.push(...runSet(oppId, s));
  const rows = all.filter((a) => a.out !== 'superseded' && a.combo === 'none');
  console.log(`\n=== 對 ${label}　blockPersona=${opp.ai.blockPersona}　scoutRead=${opp.scoutRead} ===`);
  // 主角（A2）**全部**扣球的分區佔比——scoutBlockMul 的實際輸入，不分節奏
  const mine = rows.filter((a) => a.spikeZone);
  console.log(`  ▸ 情蒐輸入：主角扣球分區佔比（n=${zoneShare(mine).t}）＝${zoneShare(mine).txt}`);
  console.log('    ↑ scoutBlockMul 門檻：佔比 >0.35 加成攔網、<0.15 減成（game.js:417-418）');
  for (const kind of ['left_inside', 'left']) {
    for (const tempo of ['two', 'three']) {
      const cell = rows.filter((a) => a.kind === kind && a.tempo === tempo);
      if (!cell.length) { console.log(`  ${`${kind}/${tempo}`.padEnd(22)} （無樣本）`); continue; }
      printCell(`${kind}/${tempo}`, agg(cell));
    }
  }
}
