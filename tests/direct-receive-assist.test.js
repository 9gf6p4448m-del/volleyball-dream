// Receive quality on the real chase probe. direct-v7 acceptance
// (docs/kickoffs/direct-v7-receive-assist-acceptance.md), rerun under the
// direct-v8 rule judgement with the same thresholds (stage 1 acceptance,
// section 4 B): A23a -> R8, A23d -> R2, A23e, A24d, A25, A26a, A27, A28g/h.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chase } from '../tools/receive-assist-probe.mjs';
import { passOutcome } from '../src/sim/directReceiveAssist.js';
import { RECEIVE_ASSIST as A } from '../src/sim/directConstants.js';

const inZone = (x, z) => z >= 0.5 && z <= 3 && Math.abs(x) <= 3;
// One run of the fixed grid (n=2646, no randomness) feeds R2, R6 and R8.
const CHASE = chase();

test('R8 難度不退步（A23a，門檻沿用）：真人追球 2646 全部案例當分母，舉球區 ≥ 34%、空接 ≤ 25%、碰網 ≤ 5%', () => {
  const c = CHASE;
  assert.equal(c.n, 2646);
  assert.ok(c.whiff / c.n <= 0.25, `空接 ${c.whiff}/${c.n}`);
  assert.ok(c.net / c.n <= 0.05, `碰網 ${c.net}/${c.n}`);
  assert.ok(c.zone / c.n >= 0.34, `舉球區 ${c.zone}/${c.n}`);
});

test('R2 分級單調（A23d）：三級各 ≥ 5% 的觸球，落點到舉球目標平均距離 完美 < 普通 < 差', () => {
  const rows = CHASE.rows.filter((x) => x.tier), total = rows.length, mean = {};
  assert.ok(total >= 200, `有等級的觸球 ${total}`);
  for (const tier of ['PERFECT', 'GOOD', 'POOR']) {
    const r = rows.filter((x) => x.tier === tier);
    assert.ok(r.length / total >= 0.05, `${tier} ${r.length}/${total}`);
    mean[tier] = r.reduce((v, x) => v + Math.hypot(x.x - A.target.x, x.z - A.target.z), 0) / r.length;
  }
  assert.ok(mean.PERFECT < mean.GOOD && mean.GOOD < mean.POOR, JSON.stringify(mean));
});

test('A23e 技術差異：快球高手失誤率 ≥ 低手 2 倍；慢球高手平均誤差 < 低手；真實路徑高低手都出現', () => {
  const run = (technique, ballSpeed) => {
    let miss = 0, error = 0, n = 0;
    for (const tier of ['PERFECT', 'GOOD', 'POOR']) for (let seed = 1; seed <= 300; seed++) {
      const o = passOutcome({ from: { x: 0, y: 1, z: 6 }, ballSpeed, technique, tier, seed, tick: seed * 7, salt: 1 });
      n++; error += Math.hypot(o.target.x - A.target.x, o.target.z - A.target.z);
      if (!inZone(o.target.x, o.target.z)) miss++;
    }
    return { miss: miss / n, error: error / n };
  };
  const fastOver = run('overhand', 15), fastUnder = run('underhand', 15);
  assert.ok(fastUnder.miss > 0 && fastOver.miss >= 2 * fastUnder.miss, `快球 高手 ${fastOver.miss.toFixed(3)} 低手 ${fastUnder.miss.toFixed(3)}`);
  const slowOver = run('overhand', 6), slowUnder = run('underhand', 6);
  assert.ok(slowOver.error < slowUnder.error, `慢球 高手 ${slowOver.error.toFixed(2)} 低手 ${slowUnder.error.toFixed(2)}`);
  // Real path: forearm chasers and players taking the ball overhead.
  const low = CHASE, high = chase({ contactHeight: 1.02, forward: 0.12 });
  const under = (low.tech.underhand ?? 0) + (high.tech.underhand ?? 0), over = (low.tech.overhand ?? 0) + (high.tech.overhand ?? 0);
  const n = low.n + high.n;
  assert.ok(under / n >= 0.03 && over / n >= 0.03, `低手 ${under}/${n} 高手 ${over}/${n}`);
});

// Round 2: visible overhand. From direct-v8 this is a pure pose check (the
// touch itself is decided by the rules; A24c is replaced by R6).
const HIGH = chase({ contactHeight: 1.02, forward: 0.12 });

test('A24d 畫面姿勢：高手觸球兩手高於肩 ≥ 90%；低手觸球手低於肩 ≥ 95%', () => {
  const rows = [...CHASE.rows, ...HIGH.rows].filter((r) => r.tier);
  const over = rows.filter((r) => r.technique === 'overhand'), under = rows.filter((r) => r.technique === 'underhand');
  assert.ok(over.length >= 50 && under.length >= 50, `高手 ${over.length} 低手 ${under.length}`);
  const up = over.filter((r) => r.handY >= 0.82).length / over.length;
  const down = under.filter((r) => r.handY < 0.82).length / under.length;
  assert.ok(up >= 0.90, `高手舉手 ${(up * 100).toFixed(1)}%`);
  assert.ok(down >= 0.95, `低手手低於肩 ${(down * 100).toFixed(1)}%`);
});

// Round 3: the timing cue follows the technique (overhand = forehead height).
import { leadRun, nonPoor } from '../tools/receive-cue-probe.mjs';
import { receiveContactEta } from '../src/sim/directReceiveRules.js';

test('A25a／A25b 同一按鍵節奏：高手非差 ≥ 70%（≥ 50 次）、低手非差 ≥ 90%', () => {
  const eta = (s) => receiveContactEta(s)?.t ?? null;
  const runs = [0.15, 0.2, 0.25, 0.3].map((lead) => ({
    lead,
    low: leadRun({ contactHeight: 0.59, forward: 0.31, lead, eta }),
    high: leadRun({ contactHeight: 1.02, forward: 0.12, lead, eta }),
  }));
  const best = runs.reduce((a, r) => ((r.low.tiers['underhand:PERFECT'] ?? 0) > (a.low.tiers['underhand:PERFECT'] ?? 0) ? r : a));
  const over = nonPoor(best.high, 'overhand'), under = nonPoor(best.low, 'underhand');
  assert.ok(over.all >= 50, `L*=${best.lead} 高手觸球 ${over.all}`);
  assert.ok(over.ok >= 0.70, `L*=${best.lead} 高手非差 ${(over.ok * 100).toFixed(1)}%`);
  assert.ok(under.ok >= 0.90, `L*=${best.lead} 低手非差 ${(under.ok * 100).toFixed(1)}%`);
});

// Round 4: a set stance passes better; a fast ball leaves a narrower window.
import { stanceSplit, perfectWidth, BALLS } from '../tools/receive-realism-probe.mjs';
import { createDirectGame, stepDirectGame } from '../src/sim/directGame.js';

test('A26a 站穩有差：跑動（≥ 2 m/s）平均落點偏差 ÷ 站穩（< 0.5 m/s）≥ 1.5', () => {
  const r = stanceSplit();
  assert.ok(r.still >= 50 && r.moving >= 50, JSON.stringify(r));
  assert.ok(r.movingMean / r.stillMean >= 1.5, `比值 ${(r.movingMean / r.stillMean).toFixed(2)} ${JSON.stringify(r)}`);
});

test('A27a／A27b 完美時間窗：強力發球 < 一般餵球 ≤ 慢球；強力發球 ≥ 13 m/s 仍抓得到完美', () => {
  const slow = perfectWidth(BALLS.slow), receive = perfectWidth(BALLS.receive), serve = perfectWidth(BALLS.serve);
  assert.ok(serve.perfect < receive.perfect && receive.perfect <= slow.perfect, JSON.stringify({ slow, receive, serve }));
  assert.ok(serve.ballSpeed >= 13 && serve.perfect >= 1, JSON.stringify(serve));
});

test('A27b 強力發球餵球：從對面過網、不碰網', () => {
  const s = createDirectGame(); s.player.x = 3; // stand aside: the ball must fly untouched
  const seen = [];
  for (let t = 0; t < 240; t++) {
    stepDirectGame(s, [{ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action: t === 0 ? 'feed' : null, feedKind: 'serve' }]);
    seen.push(...s.events.map((e) => e.type));
    if (!s.ball.active && t > 0) break;
  }
  assert.ok(seen.includes('feed') && !seen.includes('net'), seen.join(','));
  assert.ok(s.ball.z > 0, `落在我方場地 z=${s.ball.z.toFixed(2)}`);
});

// Round 5 regressions, asserted on the rule judgement path (stationary player at (0, 5), receive feed).
function receiveRun(press) {
  const s = createDirectGame({ seed: 17 }), graded = [], contacts = [];
  let passedAt = null, handsUpAfterPass = false, underhandPass = false;
  for (let t = 0; t < 240 && (t < 2 || s.ball.active); t++) {
    stepDirectGame(s, [{ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action: t === 0 ? 'feed' : t === press ? 'receive' : null, feedKind: 'receive' }]);
    for (const e of s.events) if (e.type === 'contact') {
      contacts.push(e);
      if (e.tier) { graded.push(e); passedAt ??= t; }
      if (e.tier && e.technique === 'underhand') underhandPass = true;
    }
    if (underhandPass && t > passedAt && (s.player.receiveOverhand > 0 || s.player.receiveOverhandChosen)) handsUpAfterPass = true;
  }
  return { graded, contacts, handsUpAfterPass };
}
test('A28g 低手接完球後不會因為往外飛的球而舉手（高手）', () => {
  for (let press = 20; press <= 40; press++) {
    const r = receiveRun(press);
    assert.ok(!r.handsUpAfterPass, `press ${press}: 出球後手舉起來了`);
  }
});
test('A28h 有等級的觸球只能是這一球的第一次觸球（先碰到身體就不再判等級）', () => {
  for (let press = 20; press <= 45; press++) {
    const r = receiveRun(press);
    assert.ok(r.graded.length <= 1 && (!r.graded.length || r.contacts[0] === r.graded[0]),
      `press ${press}: ${r.contacts.map((e) => `${e.part}${e.tier ? ':' + e.tier + '/' + e.technique : ''}`).join(' → ')}`);
  }
});
