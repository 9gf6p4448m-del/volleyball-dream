// direct-v7 receive assist: magnet radius, timed pass quality, over/underhand.
// Acceptance: docs/kickoffs/direct-v7-receive-assist-acceptance.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { chase, sweep, SETS } from '../tools/receive-assist-probe.mjs';
import { passOutcome } from '../src/sim/directReceiveAssist.js';
import { RECEIVE_ASSIST as A } from '../src/sim/directConstants.js';

const inZone = (x, z) => z >= 0.5 && z <= 3 && Math.abs(x) <= 3;
const CHASE = chase();

test('A23a 真人追球（全部案例當分母）：舉球區 ≥ 40%、空接 ≤ 25%、碰網 ≤ 5%', () => {
  const c = CHASE;
  assert.equal(c.n, 2646);
  assert.ok(c.whiff / c.n <= 0.25, `空接 ${c.whiff}/${c.n}`);
  assert.ok(c.net / c.n <= 0.05, `碰網 ${c.net}/${c.n}`);
  assert.ok(c.zone / c.n >= 0.40, `舉球區 ${c.zone}/${c.n}`);
});

test('A23b 正前（1035）：舉球區 ≥ 38%、空接 ≤ 26.8%', () => {
  const c = sweep(SETS.forward);
  assert.equal(c.n, 1035);
  assert.ok(c.whiff / c.n <= 0.268, `空接 ${c.whiff}/${c.n}`);
  assert.ok(c.zone / c.n >= 0.38, `舉球區 ${c.zone}/${c.n}`);
});

test('A23c 斜前兩組不退步：舉球區 ≥ 108／277、碰網 ≤ 3%', () => {
  const d = sweep(SETS.diagonal), n = sweep(SETS.diagonalNoisy);
  assert.ok(d.zone >= 108, `diagonal 舉球區 ${d.zone}/${d.n}`);
  assert.ok(n.zone >= 277, `diagonalNoisy 舉球區 ${n.zone}/${n.n}`);
  assert.ok(d.net / d.n <= 0.03, `diagonal 碰網 ${d.net}/${d.n}`);
  assert.ok(n.net / n.n <= 0.03, `diagonalNoisy 碰網 ${n.net}/${n.n}`);
});

test('A23d 時機分級單調：三級各 ≥ 5%，落點到舉球目標平均距離 完美 < 普通 < 差', () => {
  const rows = CHASE.rows, total = rows.length, mean = {};
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

// Round 2 (after the first phone test): no pass from thin air, visible overhand.
const HIGH = chase({ contactHeight: 1.02, forward: 0.12 });
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)];

test('A24c 不隔空：磁吸觸球時球面到前臂／手部表面距離中位數 ≤ 0.10 m、≥ 90% ≤ 0.20 m', () => {
  const gaps = [...CHASE.rows, ...HIGH.rows].filter((r) => r.assist).map((r) => r.gap);
  assert.ok(gaps.length >= 200, `磁吸觸球 ${gaps.length}`);
  assert.ok(median(gaps) <= 0.10, `中位數 ${median(gaps).toFixed(3)} m`);
  const near = gaps.filter((g) => g <= 0.2).length / gaps.length;
  assert.ok(near >= 0.90, `≤ 0.20 m 比例 ${(near * 100).toFixed(1)}%`);
});

test('A24d 高手觸球兩手高於肩 ≥ 90%；低手觸球手低於肩 ≥ 95%', () => {
  const rows = [...CHASE.rows, ...HIGH.rows];
  const over = rows.filter((r) => r.technique === 'overhand'), under = rows.filter((r) => r.technique === 'underhand');
  assert.ok(over.length >= 50 && under.length >= 50, `高手 ${over.length} 低手 ${under.length}`);
  const up = over.filter((r) => r.handY >= 0.82).length / over.length;
  const down = under.filter((r) => r.handY < 0.82).length / under.length;
  assert.ok(up >= 0.90, `高手舉手 ${(up * 100).toFixed(1)}%`);
  assert.ok(down >= 0.95, `低手手低於肩 ${(down * 100).toFixed(1)}%`);
});
