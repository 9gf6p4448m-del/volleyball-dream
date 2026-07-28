// Phase 4.6 §3-0 容量探針：單筆 finalRally（快照＋Intent 流）序列化位元組數實測。
// 決定四槽典藏牆在 localStorage 下安不安全——不得估算，先量再做。
// 用法：node tools/replay-size-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

// 與 matchLoop.stepSim 的 VCR 錄製逐行同構：
// serve 相位開錄快照（events 清空）→ 每 tick 推 { tick, intents } → DEAD_BALL 歸檔
function recordRallies(seed, maxRallies) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const out = [];
  let cur = { snapshot: null, steps: [] };
  while (g.phase !== 'set_over' && g.tick < 300000 && out.length < maxRallies) {
    if (g.phase === 'serve' && cur.snapshot === null) {
      cur.snapshot = structuredClone({ ...g, events: [] });
    }
    const intents = aiCollectIntents(g, ai);
    if (cur.snapshot) cur.steps.push({ tick: g.tick, intents });
    const events = stepGame(g, intents);
    if (events.some((e) => e.type === 'DEAD_BALL')) {
      if (cur.snapshot) out.push(cur);
      cur = { snapshot: null, steps: [] };
    }
  }
  return out;
}

const rallies = [];
for (let seed = 1; seed <= 12; seed += 1) rallies.push(...recordRallies(seed, 40));

// ── 選項成本量測（純量測、零行為改動；供 §3-0 停手回報附帶裁定依據）──────────
const round3 = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);
// 稀疏化：與上一 tick 同一 playerId 的 intent 逐值相同即省略
function sparsify(steps) {
  const prev = new Map();
  const out = [];
  for (const st of steps) {
    const keep = [];
    for (const it of st.intents) {
      const sig = JSON.stringify(it, (k, v) => (k === 'tick' ? undefined : v));
      if (prev.get(it.playerId) !== sig) { prev.set(it.playerId, sig); keep.push(it); }
    }
    if (keep.length) out.push({ tick: st.tick, intents: keep });
  }
  return out;
}
function variants(r) {
  const pid = r.steps[0]?.intents[0]?.playerId;
  const onlyPlayer = r.steps
    .map((st) => ({ tick: st.tick, intents: st.intents.filter((it) => it.playerId === pid) }))
    .filter((st) => st.intents.length);
  const sparse = sparsify(r.steps);
  return {
    now: JSON.stringify(r.steps).length,
    q3: JSON.stringify(r.steps, round3).length,
    sparse: JSON.stringify(sparse).length,
    sparseQ3: JSON.stringify(sparsify(r.steps.map((st) => JSON.parse(JSON.stringify(st, round3))))).length,
    solo: JSON.stringify(onlyPlayer).length,
    soloQ3: JSON.stringify(onlyPlayer, round3).length,
  };
}

const rows = rallies.map((r) => {
  const payload = { matchId: 'national-final', seasonIndex: 3, snapshot: r.snapshot, steps: r.steps };
  const json = JSON.stringify(payload);
  return {
    bytes: json.length,
    ticks: r.steps.length,
    snapBytes: JSON.stringify(r.snapshot).length,
    stepBytes: JSON.stringify(r.steps).length,
  };
});
rows.sort((a, b) => a.bytes - b.bytes);
const q = (p) => rows[Math.min(rows.length - 1, Math.floor(rows.length * p))];
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

console.log(`樣本：${rows.length} 顆球（12 場單局、AI 對打）`);
console.log(`回合長度 ticks：p50=${q(0.5).ticks}  p90=${q(0.9).ticks}  max=${rows[rows.length - 1].ticks}`);
console.log('單筆 finalRally 序列化位元組：');
for (const [label, p] of [['p10', 0.1], ['p50', 0.5], ['p90', 0.9], ['p99', 0.99]]) {
  const r = q(p);
  console.log(`  ${label} = ${kb(r.bytes)}（快照 ${kb(r.snapBytes)} ＋ Intent 流 ${kb(r.stepBytes)}／${r.ticks} ticks）`);
}
const max = rows[rows.length - 1];
console.log(`  max = ${kb(max.bytes)}（快照 ${kb(max.snapBytes)} ＋ Intent 流 ${kb(max.stepBytes)}／${max.ticks} ticks）`);
console.log(`四槽總量預估：p50×4 = ${kb(q(0.5).bytes * 4)}／p90×4 = ${kb(q(0.9).bytes * 4)}／max×4 = ${kb(max.bytes * 4)}`);
console.log('※ localStorage 常見上限 5MB／origin（UTF-16 計費時再 ×2 視瀏覽器實作）');

// 選項成本表（中位數球，Intent 流部分；快照不變）
const mid = rallies.map((r) => ({ r, len: JSON.stringify(r.steps).length }))
  .sort((a, b) => a.len - b.len)[Math.floor(rallies.length * 0.5)].r;
const v = variants(mid);
console.log('\n─ 選項成本（中位數那顆球的 Intent 流；快照另計約 8-14KB）─');
console.log(`  現行（12 人全錄、全精度）      ${kb(v.now)}   ×1.00`);
console.log(`  座標量化 3 位小數              ${kb(v.q3)}   ×${(v.q3 / v.now).toFixed(2)}`);
console.log(`  稀疏化（同值不重錄）           ${kb(v.sparse)}   ×${(v.sparse / v.now).toFixed(2)}`);
console.log(`  稀疏化＋量化                   ${kb(v.sparseQ3)}   ×${(v.sparseQ3 / v.now).toFixed(2)}`);
console.log(`  只錄 1 人（AI 重算）           ${kb(v.solo)}   ×${(v.solo / v.now).toFixed(2)}`);
console.log(`  只錄 1 人＋量化                ${kb(v.soloQ3)}   ×${(v.soloQ3 / v.now).toFixed(2)}`);
