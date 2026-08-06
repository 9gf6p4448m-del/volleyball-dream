// 內切重量探針（08-06）—— **零 `src/` 改動**
//
// 動機：位置體檢題 B1 裁定要把「內切」從自動骰改成 OH 自己決定。動手做輸入層之前
// 先量「內切現在是不是已經嚴格優於普通左翼直線」——這個專案有前科（夾塞當年被
// 「嚴格支配」實測判死刑，見 tools/tandem-revival-probe.mjs），反過來也要防：
// 如果內切已經嚴格更好，讓玩家自選＝白送強化，會變成「每球都切」的無腦最適解。
//
// 分組用引擎既有記帳欄位（不重寫「什麼算內切」的判斷，重抄＝循環論證）：
//   A 組＝內切（ai.attackKind === 'left_inside'）
//   B 組＝普通左翼直線（ai.attackKind === 'left'）
// 兩者皆是 `attackPointsOf`（ai.js:709，僅 role==='outside' 前排會 push 'left'）
// 經 `applyRouteKinds`→`routeKindFor`（approach.js:369-372，CROSS_RATE=0.3）
// 隨機分流出來的**同一個 OH 左翼球權**的兩種幾何——不涉及 MB／OPP／組合攻擊的
// cross／tandem（那兩個 kind 現行沒有任何抽籤路徑餵它們，approach.js:64-66 明載）。
//
// 「淨得分率」定義照抄 tools/tandem-block-probe.mjs 的 outcomeAgg（也是
// tandem-revival-probe.mjs 用的同一份）：netPct = 得分%(kill+toolKill) − (被攔死%+自失誤%)。
//
// 第 5 項「攔網手涵蓋率」：game.js:1030-1034 顯示 `tryBlock` 只在球過網瞬間
// （z 正負翻越的那一 tick）被呼叫恰好一次——不必額外判斷「哪一次才是過網那次」，
// 每次呼叫本身就是「球過網時」。本檔在 `if (!inside) return false;`
//（game.js:1092，與 tandem-revival-probe.mjs 同一個錨點）前插一行快照
// `{ toTeam, inside }`，只寫 globalThis、不改任何判斷式、不消費 rand()。
//
// ★ 零行為改動的機械保證 ★
// 對 `src/` 一個位元組都不寫。唯一的 patch 走 Node 同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**，只活在這個子行程記憶體裡；
// 範式抄 tools/tandem-revival-probe.mjs（本專案既有慣例）。
//
// 用法：node tools/inside-cut-probe.mjs [局數=40]
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv[2] ?? '40', 10);

// ════════════════════════════════════════════════════════
// 載入鉤子：只在 game.js 插一行涵蓋快照，approach.js 完全不動
// （CROSS_RATE 保持現值 0.3，量的是現行實際運作的分流結果）
// ════════════════════════════════════════════════════════
const hit = { cov: 0 };
registerHooks({
  load(url, context, nextLoad) {
    const res = nextLoad(url, context);
    const norm = url.replace(/\\/g, '/');
    if (!norm.includes('/src/sim/')) return res;
    let src = typeof res.source === 'string'
      ? res.source : Buffer.from(res.source).toString('utf8');
    if (norm.endsWith('/src/sim/game.js')) {
      const from = '  if (!inside) return false;';
      if (!src.includes(from)) throw new Error(`patch 目標消失（cov）：${from}`);
      src = src.replace(from,
        '  (globalThis.__ICP ||= {}).lastCov = { toTeam, inside };\n'
        + from);
      hit.cov += 1;
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

if (hit.cov !== 1) throw new Error(`patch 沒生效：hit.cov=${hit.cov}`);
if (ap.CROSS_RATE !== 0.3) throw new Error(`CROSS_RATE 被動過：${ap.CROSS_RATE}`);

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

  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const g = (globalThis.__ICP ||= {});
    g.lastCov = null;
    const intents = aiCollectIntents(game, ai, []);
    const ev = stepGame(game, intents);
    const covRec = g.lastCov;

    // tryBlock 每記扣球只在過網那一 tick 呼叫一次（game.js:1030-1034）——
    // 直接記，不必挑「第一次」
    if (cur && covRec && covRec.toTeam === 'B' && cur.cov === null) cur.cov = covRec.inside;

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
        cur = {
          kind: ai.attackKind ?? null,
          combo: ai.attackCombo ? ai.attackCombo.type : 'none',
          cov: null, bt: 0, out: null,
        };
        ended = false;
      }
    }
  }
  if (cur) { cur.out = 'superseded'; attacks.push(cur); }
  return attacks;
}

function runOpponent(oppId, sets) {
  const all = [];
  for (let s = 0; s < sets; s += 1) all.push(...runSet(oppId, s));
  return all.filter((a) => a.out !== 'superseded' && a.combo === 'none');
}

// ════════════════════════════════════════════════════════
// 統計（netPct 定義照抄 tandem-block-probe.mjs / tandem-revival-probe.mjs 的 outcomeAgg）
// ════════════════════════════════════════════════════════
const pct = (k, n) => (n ? (k / n) * 100 : null);
const seP = (k, n) => (n ? Math.sqrt(((k / n) * (1 - k / n)) / n) * 100 : null);
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));

function outcomeAgg(rows) {
  const n = rows.length;
  const kill = rows.filter((a) => a.out === 'kill' || a.out === 'toolKill').length;
  const bk = rows.filter((a) => a.out === 'blockKill').length;
  const err = rows.filter((a) => a.out === 'atkError').length;
  const touched = rows.filter((a) => a.bt === 1).length; // 被攔網碰到（含擦手）
  const covRows = rows.filter((a) => a.cov !== null);
  const covered = covRows.filter((a) => a.cov === true).length;
  const killPct = pct(kill, n);
  const bkPct = pct(bk, n);
  const errPct = pct(err, n);
  const touchedPct = pct(touched, n);
  return {
    n, kill, bk, err, touched,
    killPct, killSE: seP(kill, n),
    bkPct, bkSE: seP(bk, n),
    errPct,
    touchedPct, touchedSE: seP(touched, n),
    netPct: killPct != null ? killPct - pct(bk + err, n) : null,
    covN: covRows.length,
    covPct: pct(covered, covRows.length),
    covSE: seP(covered, covRows.length),
  };
}

function printGroup(label, agg) {
  console.log(`-- ${label} --`);
  console.log(`n=${agg.n} | 得分%=${f(agg.killPct)}±${f(agg.killSE, 2)} | 被攔死%=${f(agg.bkPct)}±${f(agg.bkSE, 2)}`
    + ` | 被攔碰%(含擦手)=${f(agg.touchedPct)}±${f(agg.touchedSE, 2)} | 自失誤%=${f(agg.errPct)}`
    + ` | 淨得分%=${f(agg.netPct)}`);
  console.log(`  攔網手涵蓋率（球過網時牆罩到這條線）=${f(agg.covPct)}±${f(agg.covSE, 2)}（n=${agg.covN}）`);
}

function runAndReport(oppId, label) {
  const opp = opponentById(oppId);
  const all = runOpponent(oppId, SETS);
  const A = all.filter((a) => a.kind === 'left_inside');
  const B = all.filter((a) => a.kind === 'left');
  console.log(`\n=== ${label}（${SETS} 局，blockPersona=${opp.ai.blockPersona}，scoutRead=${opp.scoutRead}）===`);
  const Aagg = outcomeAgg(A);
  const Bagg = outcomeAgg(B);
  printGroup('A 組：內切（left_inside）', Aagg);
  printGroup('B 組：普通左翼直線（left）', Bagg);
  if (Aagg.netPct != null && Bagg.netPct != null) {
    console.log(`  淨得分 Δ（A−B）= ${f(Aagg.netPct - Bagg.netPct)} pp`);
  }
  return { Aagg, Bagg };
}

console.log(`patch 命中：${JSON.stringify(hit)}（應為 1）`);
console.log(`CROSS_RATE 現值＝${ap.CROSS_RATE}（未修改，量現行實際分流）`);

const read = runAndReport('north-tech', '對 read 隊（北原工商）');
const commit = runAndReport('obsidian', '對 commit 隊（曜石體中）');

console.log('\n=== 結論輸入 ===');
console.log('兩種對手、兩軸（淨得分、涵蓋率）逐一列出，供裁定「嚴格更好／有取捨／分不出/更差」。');
console.log(`read ：A(內切) 淨得分=${f(read.Aagg.netPct)} 涵蓋=${f(read.Aagg.covPct)}　|　B(直線) 淨得分=${f(read.Bagg.netPct)} 涵蓋=${f(read.Bagg.covPct)}`);
console.log(`commit：A(內切) 淨得分=${f(commit.Aagg.netPct)} 涵蓋=${f(commit.Aagg.covPct)}　|　B(直線) 淨得分=${f(commit.Bagg.netPct)} 涵蓋=${f(commit.Bagg.covPct)}`);
