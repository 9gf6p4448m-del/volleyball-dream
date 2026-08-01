// 攔網時序卷 段 2 探針 —— commit 的「賭注」量測
//
// 量四件事（B 隊 commit 人格、A 隊進攻；旁觀真值由探針持有，攔網 AI 讀不到）：
//   ① 盲賭中路佔比：blockPlan.template.blind ＝ 沒鎖任何人的退路計畫
//   ② 賭中率：commit 建計畫時賭的那個人，是不是二傳最後選定的攻擊手
//   ③ 賭中／賭錯的攔網結果（觸手率／攔死率）——「賭對就死」強度端的基準分佈
//   ④ 賭注對象分佈 vs 本場配分歷史：commit 賭誰，跟「這一場二傳已經給過誰」的相關
//
// 賭注對象怎麼取得：`blockSetterTendency` 在建計畫的那一 tick 回傳 `{ kind }`，
// 用 `attackPointsOf` 把 kind 映回 pid（兩者都是既有的 sim 匯出，探針零重建模型）。
//
// 跑法：node tools/block-commit-bet-probe.mjs [局數=30]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf } from '../src/sim/ai.js';
import { blockCommitRead } from '../src/sim/blockRead.js';

const SETS = Number(process.argv[2] ?? 30);

// 段 2 之前的版本沒有這個匯出——動態取用，讓同一支探針在**卷基準 worktree** 上也跑得起來
// （否則段 2 前後的數字沒有可比的來源）。取不到就退回舊路徑（blockCommitRead 的幾何）。
const aiMod = await import('../src/sim/ai.js');
const tendency = aiMod.blockSetterTendency ?? null;
console.log(tendency ? '[賭注來源] blockSetterTendency（段 2 之後）' : '[賭注來源] blockCommitRead 最近人（段 2 之前）');

function setterOf(game, team) {
  return game.match.rotations[team].find((pid) => game.players[pid]?.currentRole === 'setter') ?? null;
}

// 這一 tick commit 會賭誰
function betPidNow(game, atkTeam, passTier) {
  const pts = attackPointsOf(game, atkTeam, setterOf(game, atkTeam), passTier ?? 'perfect');
  if (!pts.length) return null;
  if (tendency) {
    const t = tendency(game, atkTeam, { passTier });
    return t ? (pts.find((p) => p.kind === t.kind)?.pid ?? null) : null;
  }
  // 舊路：blockCommitRead 只給 x（反作弊不回 pid），映回池內幾何最近者
  const r = blockCommitRead(game, atkTeam, { passTier });
  if (!r) return null;
  let best = null;
  for (const p of pts) {
    const d = Math.abs((game.actors[p.pid]?.x ?? Infinity) - r.x);
    if (best === null || d < best.d) best = { d, pid: p.pid };
  }
  return best?.pid ?? null;
}

function runSet(seed) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona: 'commit' } } });
  const ai = createAiState();
  const rows = [];
  let pending = null; // 本波：{ blind, betPid, histAtBet }
  let guard = 0;
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const hadPlan = ai.blockPlan && ai.blockPlan.team === 'B';
    const events = stepGame(game, aiCollectIntents(game, ai, []));
    const plan = ai.blockPlan;
    // 建計畫的那一 tick（B 隊剛長出 blockPlan）
    if (!hadPlan && plan && plan.team === 'B' && game.rally.possession === 'A') {
      const betPid = betPidNow(game, 'A', ai.passTier ?? null);
      // 本場配分歷史：這一刻各攻擊手已經扣過幾球（可觀察量）
      const hist = {};
      for (const pid of game.match.rotations.A) hist[pid] = game.scoutTally?.[pid]?.spikes ?? 0;
      pending = {
        blind: plan.template.blind === true,
        betPid,
        histAtBet: hist,
        touched: false,
        killed: false,
        attackerId: null,
      };
    }
    if (pending) {
      if (game.rally.possession === 'A' && ai.attackerId) pending.attackerId = ai.attackerId;
      for (const e of events) {
        if (e.type === 'BLOCK_TOUCH' && e.team === 'B') {
          pending.touched = true;
          // 攔死＝手身攔回（沒有 zone 欄位＝走到屬性擲骰並中）
          if (!e.zone) pending.killed = true;
        }
      }
      // 本波結束（死球或球權易手）
      if (events.some((e) => e.type === 'DEAD_BALL') || game.rally.possession !== 'A') {
        if (pending.attackerId) rows.push(pending);
        pending = null;
      }
    }
    if (!plan || plan.team !== 'B') { /* 計畫已釋放，等下一波 */ }
  }
  return rows;
}

const rows = [];
for (let s = 1; s <= SETS; s += 1) rows.push(...runSet(s * 101));

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(2) : '-');
const se = (n, d) => {
  if (!d) return '-';
  const p = n / d;
  return (Math.sqrt((p * (1 - p)) / d) * 100).toFixed(2);
};

const blind = rows.filter((r) => r.blind);
const aimed = rows.filter((r) => !r.blind && r.betPid);
const hit = aimed.filter((r) => r.betPid === r.attackerId);
const miss = aimed.filter((r) => r.betPid !== r.attackerId);

console.log(`=== commit 賭注探針（${SETS} 局，B 隊 commit、A 隊進攻）===`);
console.log(`規劃樣本 n=${rows.length}\n`);

console.log('-- ① 盲賭中路（blind：沒鎖任何人的退路計畫）--');
console.log(`  ${blind.length}/${rows.length} ＝ ${pct(blind.length, rows.length)}% ± ${se(blind.length, rows.length)}`);

console.log('\n-- ② 賭中率（賭的人＝二傳最後選定的攻擊手）--');
console.log(`  有鎖定的賭注 n=${aimed.length}；賭中 ${hit.length} ＝ ${pct(hit.length, aimed.length)}% ± ${se(hit.length, aimed.length)}`);

console.log('\n-- ③ 賭中／賭錯的攔網結果（「賭對就死」強度端基準）--');
console.log('組別      樣本    觸手%（±SE）     攔死%（±SE）');
for (const [label, g] of [['賭中', hit], ['賭錯', miss], ['盲賭', blind]]) {
  const t = g.filter((r) => r.touched).length;
  const k = g.filter((r) => r.killed).length;
  console.log(
    `${label.padEnd(8)}  ${String(g.length).padStart(4)}  `
    + `${pct(t, g.length).padStart(7)} ± ${se(t, g.length).padStart(5)}  `
    + `${pct(k, g.length).padStart(7)} ± ${se(k, g.length).padStart(5)}`,
  );
}

console.log('\n-- ④ 賭注 vs 本場配分歷史 --');
// 賭注落在「本場被舉最多次的那個人」身上的比例；分母只取「歷史已經分得出高下」的樣本
let alignable = 0;
let aligned = 0;
for (const r of aimed) {
  const vals = Object.entries(r.histAtBet).filter(([pid]) => pid !== r.betPid || true);
  const max = Math.max(...vals.map(([, v]) => v));
  if (max === 0) continue;                                   // 本場還沒球＝沒有歷史可讀
  const leaders = vals.filter(([, v]) => v === max).map(([pid]) => pid);
  if (leaders.length === vals.length) continue;              // 全員同分＝分不出高下
  alignable += 1;
  if (leaders.includes(r.betPid)) aligned += 1;
}
console.log(`  歷史分得出高下的樣本 n=${alignable}；賭注落在本場「被舉最多次」者身上 `
  + `${aligned} ＝ ${pct(aligned, alignable)}% ± ${se(aligned, alignable)}`);
console.log(`  （隨機基準＝1／池子大小 ≈ 25%，池子通常 4 人）`);
