// Phase 5 W1 §7 D2（針對性發球吃 transition）＋§8（第二擊備援追球者）量測探針。
// 用法：node tools/d2-probe.mjs [場數=40]
//
// ① D2：每次「我方一擊完成」（touches===1）當下的攻擊池大小與線別分佈、
//    一傳接球者是不是池中的攻擊手（＝D2 的靶）、被針對者的後續攻擊參與率。
//    修前修後跑同一支＝池從 4 條降到幾條、發生率多少，直接對照。
// ② §8：第二擊指派後「誰真的碰到球」——claim 自己／備援接力／其他人／**沒人碰到**。
//    「沒人補球」＝ dropped，基準 4.6 量到 0.12%（7/5764）。
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf } from '../src/sim/ai.js';

const N = Number.parseInt(process.argv[2] ?? '40', 10);

const d2 = {
  plans: 0,               // 進攻組織次數（touches===1 且有 approach）
  poolHist: new Map(),    // 池大小 → 次數
  kindHist: new Map(),    // 線別 → 次數
  tierHist: new Map(),    // passTier → 次數
  targeted: 0,            // 一傳接球者「本來會在池裡」（＝D2 的靶命中）
  targetedDropped: 0,     // 其中該人整個掉出池
  targetedDowngraded: 0,  // 其中該人還在池裡但線別降級（無 cross）
  poolWhenTargeted: [],   // 命中時的池大小
  poolWhenNot: [],        // 未命中時的池大小
  targetedAttacks: 0,     // 命中時該人仍被選為攻擊手
  notTargetedSelf: 0,     // 未命中時的分母（接球者不在池／不合法）
  hitKind: new Map(),     // 命中時接球者「原本會跑的線」（決定降級的實際重量）
};
const s8 = {
  claims: 0,
  touchedByClaim: 0,
  touchedByBackup: 0,
  touchedByOther: 0,
  dropped: 0,
  droppedNoBackup: 0, // ★沒人補球，且**根本沒派備援**（＝可及性預估過樂觀的漏網球）
  backupAssigned: 0,
};

const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

for (let seed = 1; seed <= N; seed += 1) {
  // VD_STAMINA=1＝體力臂（疲勞折速會讓「追得到」的預估變樂觀，§8 的漏網球在這裡才多）
  const g = createGame({
    seed: seed * 131 + 5, setTarget: 25,
    ...(process.env.VD_STAMINA === '1' ? { stamina: true } : {}),
  });
  const ai = createAiState();
  let lastFlight = -1;
  let pending = null; // §8：{ claimId, flightId }
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai);

    if (ai.flightId !== lastFlight) {
      lastFlight = ai.flightId;
      if (g.phase === 'rally' && g.rally.touches === 1 && ai.approach?.routes) {
        const routes = ai.approach.routes;
        const receiver = g.rally.lastToucherId;
        d2.plans += 1;
        bump(d2.poolHist, routes.length);
        bump(d2.tierHist, ai.passTier ?? 'n/a');
        for (const r of routes) bump(d2.kindHist, r.kind);
        // 「這顆球的靶命中了沒」＝接球者是不是本來就是合法攻擊手。
        // 修前：他會直接出現在 routes 裡；修後：他掉出池或只剩降級線。
        const inPool = routes.some((r) => r.pid === receiver);
        // 未降級的池（不傳 receiverId）＝「他本來會跑哪條線」的基準，修前修後同義
        const rawPts = attackPointsOf(g, ai.approach.team, ai.claimId, ai.passTier);
        const raw = rawPts.find((p) => p.pid === receiver);
        const hit = !!raw;
        if (hit) {
          d2.targeted += 1;
          bump(d2.hitKind, raw.kind);
          d2.poolWhenTargeted.push(routes.length);
          if (!inPool) d2.targetedDropped += 1;
          else d2.targetedDowngraded += 1;
        } else {
          d2.notTargetedSelf += 1;
          d2.poolWhenNot.push(routes.length);
        }
        if (hit && ai.attackerId === receiver) d2.targetedAttacks += 1;
      }
    }

    // §8：第二擊指派剛成立
    if (g.phase === 'rally' && g.rally.touches === 1 && ai.claimId && !pending) {
      pending = { claimId: ai.claimId, backupId: ai.backupId };
      s8.claims += 1;
    }
    if (pending) pending.backupId = ai.backupId ?? pending.backupId;

    const events = stepGame(g, intents);
    for (const e of events) {
      if (!pending) continue;
      if (e.type === 'TOUCH' && e.touches === 2) {
        if (pending.backupId) s8.backupAssigned += 1;
        if (e.playerId === pending.claimId) s8.touchedByClaim += 1;
        else if (e.playerId === pending.backupId) s8.touchedByBackup += 1;
        else s8.touchedByOther += 1;
        pending = null;
      } else if (e.type === 'DEAD_BALL') {
        if (pending.backupId) s8.backupAssigned += 1;
        else s8.droppedNoBackup += 1;
        s8.dropped += 1;
        pending = null;
      }
    }
    if (pending && g.rally.touches !== 1) pending = null;
  }
}

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(2) : '0.00');
const mean = (a) => (a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : 'n/a');

console.log(`=== D2／§8 探針（${N} 場 25 分快速比賽）===`);
console.log(`\n── ① D2 針對性發球（攻擊池）──`);
console.log(`進攻組織次數 ${d2.plans}`);
console.log('池大小分佈：' + [...d2.poolHist.entries()].sort((a, b) => a[0] - b[0])
  .map(([k, v]) => `${k} 條 ${v}（${pct(v, d2.plans)}%）`).join('  '));
console.log('一傳品質：' + [...d2.tierHist.entries()].map(([k, v]) => `${k} ${pct(v, d2.plans)}%`).join('  '));
console.log('線別：' + [...d2.kindHist.entries()].sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`).join('  '));
console.log(`D2 命中（一傳接球者本身是合法攻擊手）：${d2.targeted}（${pct(d2.targeted, d2.plans)}%）`);
console.log(`  其中掉出池 ${d2.targetedDropped}｜留池但降級 ${d2.targetedDowngraded}`);
console.log('  命中時接球者原本的線：' + [...d2.hitKind.entries()].sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}（${pct(v, d2.targeted)}%）`).join('  '));
console.log(`  命中時平均池大小 ${mean(d2.poolWhenTargeted)}｜未命中 ${mean(d2.poolWhenNot)}`);
console.log(`被針對者仍被選為攻擊手：${d2.targetedAttacks}／${d2.targeted}（${pct(d2.targetedAttacks, d2.targeted)}%）`);

console.log(`\n── ② §8 第二擊備援 ──`);
const tot = s8.touchedByClaim + s8.touchedByBackup + s8.touchedByOther + s8.dropped;
console.log(`第二擊指派 ${s8.claims}（結算樣本 ${tot}）`);
console.log(`claim 自己舉到 ${s8.touchedByClaim}（${pct(s8.touchedByClaim, tot)}%）`);
console.log(`備援接力舉到   ${s8.touchedByBackup}（${pct(s8.touchedByBackup, tot)}%）`);
console.log(`其他人碰到     ${s8.touchedByOther}（${pct(s8.touchedByOther, tot)}%）`);
console.log(`★沒人補球落地  ${s8.dropped}（${pct(s8.dropped, tot)}%）——其中沒派備援 ${s8.droppedNoBackup}`);
console.log(`（其中曾指派備援的球：${s8.backupAssigned}）`);
