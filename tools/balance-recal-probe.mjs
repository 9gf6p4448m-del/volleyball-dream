// 攻守平衡卷回歸基準探針（2026-08-31 收編自 scratchpad left-line-route-probe；
// 08-31 修復收編時吃掉 import 的事故版）：route×zone 全表——kill/攔死/攔出界/被救起/
// 波贏＋kill 落點與守方最近人。
// ⚠「守方最近人」量的是 DEAD_BALL 結算後（球員已重置回發球陣型）的距離，只能當
// 跨格相對參考；要量真實落地前距離用落地前一 tick 快照（見攻守平衡卷卷宗）。
// 用法：node tools/balance-recal-probe.mjs [場數=120]。任何動攻守平衡的卷前後各跑
// 一次貼對照表（目標帶見 docs/kickoffs/balance-recal-kickoff-20260831.md）。距離
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const SEEDS = Number(process.argv[2] ?? 120);
const tab = {};
const keyOf = (route, zone) => `${route ?? 'other'}|${zone}`;
const cell = (k) => tab[k] ?? (tab[k] = { n: 0, kill: 0, blockdead: 0, blockout: 0, error: 0, dug: 0, rallyWon: 0, killAt: [], nearest: [] });

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let cur = null;
  let rallyAttacks = [];
  while (g.phase !== 'set_over' && g.tick < 300000) {
    const intents = aiCollectIntents(g, ai);
    const spikeIntent = {};
    for (const it of intents) if (it.action === 'spike') spikeIntent[it.playerId] = it;
    const events = stepGame(g, intents);
    let winner = null;
    for (const e of events) if (e.type === 'SCORE') winner = e.team;
    for (const e of events) {
      if (e.type === 'TOUCH' && e.kind === 'spike') {
        if (cur && !cur.outcome) cur.outcome = 'dug';
        if (cur) rallyAttacks.push(cur);
        cur = {
          team: e.team, zone: g.rally.lastSpikeZone ?? 'unknown',
          route: spikeIntent[e.playerId]?.routeKind ?? null,
          blocked: false, outcome: null,
        };
      } else if (e.type === 'BLOCK_TOUCH' && cur && !cur.outcome) {
        cur.blocked = true;
      } else if (e.type === 'TOUCH' && cur && !cur.outcome && e.team !== cur.team) {
        cur.outcome = 'dug';
      } else if (e.type === 'DEAD_BALL') {
        if (cur) {
          if (!cur.outcome) {
            if (e.reason === 'BALL_IN' && winner === cur.team) {
              cur.outcome = 'kill';
              cur.at = e.at;
              // 守方最近人距離（08-09 診斷法：落點附近有沒有人）
              let best = Infinity;
              for (const [pid, p] of Object.entries(g.players)) {
                if (p.teamId === cur.team) continue;
                const a = g.actors[pid];
                if (!a) continue;
                const d = Math.hypot(a.x - e.at.x, a.z - e.at.z);
                if (d < best) best = d;
              }
              cur.nearest = best;
            } else if (cur.blocked && winner !== cur.team) cur.outcome = 'blockdead';
            else if (cur.blocked && winner === cur.team) cur.outcome = 'blockout';
            else if (winner !== cur.team) cur.outcome = 'error';
            else cur.outcome = 'dug';
          }
          rallyAttacks.push(cur);
          cur = null;
        }
        for (const a of rallyAttacks) {
          const t = cell(keyOf(a.route, a.zone));
          t.n += 1;
          t[a.outcome] += 1;
          if (winner === a.team) t.rallyWon += 1;
          if (a.outcome === 'kill' && a.at) { t.killAt.push(a.at); t.nearest.push(a.nearest); }
        }
        rallyAttacks = [];
      }
    }
  }
}

const pc = (x, n) => n ? `${((x / n) * 100).toFixed(1)}%` : '—';
const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
console.log(`[balance-recal] ${SEEDS} 場，route×zone（n≥60 才列）`);
for (const [k, t] of Object.entries(tab).sort((a, b) => b[1].n - a[1].n)) {
  if (t.n < 60) continue;
  const nz = med(t.nearest);
  const az = med(t.killAt.map((p) => Math.abs(p.z)));
  const axx = med(t.killAt.map((p) => Math.abs(p.x)));
  console.log(`${k.padEnd(16)} n=${String(t.n).padStart(4)}  kill=${pc(t.kill, t.n)}  攔死=${pc(t.blockdead, t.n)}  攔出界=${pc(t.blockout, t.n)}  被救起=${pc(t.dug, t.n)}  波贏=${pc(t.rallyWon, t.n)}  | kill落點中位 |x|=${axx?.toFixed(2) ?? '—'} |z|=${az?.toFixed(2) ?? '—'} 守方最近人=${nz?.toFixed(2) ?? '—'}m`);
}
