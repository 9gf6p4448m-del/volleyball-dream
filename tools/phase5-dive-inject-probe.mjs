// Phase 5 §十 階段五 —— 魚躍**注入軌**治具（段 1 裁定 ③，2026-07-30 Sawmah 拍板）
//
// ★ 為什麼要這支 ★
// v4 §2.3 規定魚躍 n<30 不判（自然軌條文一字不動）。但段 1 自然軌 n=27——魚躍是
// 貼邊率最高（37.0%）、最先受壓的動作，卻因樣本量最判不動。裁定 ③ 採**雙軌**：
// 自然軌照量照報（n<30 該格空著）；本檔是新增的**注入軌**——固定情境集補到 n≥30。
//
// ★★ 注入源標記（A-8 比較同源檢查，違反即無證據力）★★
//   本檔所有數字的來源標記為 **INJECTED**：
//   ① **永不**與自然軌（phase5-reach-shrink-probe）或其他六項面板數字並排呈現
//   ② 只做**段間自比**（段 1 注入 vs 段 2 注入 vs …）
//   ③ 它回答「魚躍可及壓力隨段的演變」；「魚躍相對其他動作如何」仍由自然軌答，答不了就空著
//
// ★ 情境集（一次定案 2026-07-30，跨段可比的前提＝此後不得改動）★
//   注入「自家噴掉的亂球」（possession＝我方、touches=1）：ai.js 的救噴路徑**不擲骰**
//   （「最後希望，不撲＝必失分」），魚躍是否發生只剩幾何——這正是跨段要比的量；
//   若走對方來球路徑，diveRate（0.16）的擲骰雜訊會淹掉段間差異。
//   幾何：對每個方向錨點，找離它最近的我方球員，沿「球員→錨點」方向、距球員 D 公尺處
//   落一顆快墜球（起始 y=3.0、vy=-5，窗長約 8 tick＝反應期內跑不到、只能撲）。
//   D 的三要素（A-7）：語意＝該球員到注入球落點的水平距離；原點＝球員腳下（身體軸，
//   與 TOUCH 的 dist 同原點）；單位＝**公尺絕對值、凍結**——可及半徑逐段縮向 2.0m 時，
//   深距離的情境會逐段轉為構不到，壓力演變直接可見。
//   8 方向錨點 × D ∈ {1.7, 2.0, 2.3} × 4 seeds ＝ 96 情境。
//
// ★ A-9（凡會被旋鈕移動的量，一律向單一真相來源取）★
//   魚躍可及上限＝`reachRadiusFor('dive', TUNING) + BALL.RADIUS`（＝ballInReach 實際用的
//   vol.r），不自己重算內插。
//
// 跑法：node tools/phase5-dive-inject-probe.mjs
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { BALL } from '../src/sim/constants.js';
import { reachRadiusFor } from '../src/sim/reach.js';

// ==== 固定情境集（🔒 2026-07-30 定案；改動＝毀掉跨段可比性）====
const ANCHORS = [ // A 半場（+z）的 8 個方向錨點：四角＋四邊中點
  { x: 3.9, z: 8.4 }, { x: -3.9, z: 8.4 }, { x: 3.9, z: 1.6 }, { x: -3.9, z: 1.6 },
  { x: 0, z: 8.6 }, { x: 4.2, z: 5.0 }, { x: -4.2, z: 5.0 }, { x: 0, z: 1.2 },
];
const DISTANCES = [1.7, 2.0, 2.3]; // 絕對公尺（凍結）——深距離隨收斂逐段轉為構不到
const SEEDS = [11, 12, 13, 14];
const DROP_Y = 3.0;
const DROP_VY = -5;
const GUARD_TICKS = 240; // 單情境 4 秒上限（球最遲 ~25 tick 落地，餘裕給倒地/死球流程）

function nearestActor(game, p) {
  let best = null;
  let bestD = Infinity;
  for (const [id, a] of Object.entries(game.actors)) {
    if (!id.startsWith('A')) continue;
    const d = Math.hypot(p.x - a.x, p.z - a.z);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

function runScenario(seed, anchor, D, flightId) {
  const g = createGame({ seed });
  const ai = createAiState();
  // 注入：自家噴掉的一傳（救噴路徑，不擲骰）——與 tests/jump-set.test.mjs rigSet 同手法
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 1;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A6';
  r.flightId = flightId;
  // 落點＝離錨點最近的我方球員，沿「球員→錨點」方向 D 公尺處
  const pid = nearestActor(g, anchor);
  const a = g.actors[pid];
  const len = Math.hypot(anchor.x - a.x, anchor.z - a.z) || 1;
  const ux = (anchor.x - a.x) / len;
  const uz = (anchor.z - a.z) / len;
  const px = Math.max(-4.4, Math.min(4.4, a.x + ux * D));
  const pz = Math.max(0.4, Math.min(8.8, a.z + uz * D));
  const b = g.ball;
  b.x = px; b.y = DROP_Y; b.z = pz;
  b.vx = 0; b.vy = DROP_VY; b.vz = 0;
  b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;

  let diveIntent = false;
  for (let i = 0; i < GUARD_TICKS; i += 1) {
    const intents = aiCollectIntents(g, ai, []);
    if (intents.some((it) => it.action === 'dive')) diveIntent = true;
    const ev = stepGame(g, intents);
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'dive') {
        return { touched: true, attempted: true, dist: e.dist, D };
      }
      if (e.type === 'TOUCH' || e.type === 'DEAD_BALL') {
        return { touched: false, attempted: diveIntent, otherTouch: e.type === 'TOUCH', D };
      }
    }
    if (g.phase !== 'rally') break;
  }
  return { touched: false, attempted: diveIntent, otherTouch: false, D };
}

const results = [];
let flightId = 0;
for (const seed of SEEDS) {
  for (const anchor of ANCHORS) {
    for (const D of DISTANCES) {
      flightId += 7; // 情境間錯開（救噴路徑不擲骰，此值只求與真實局面區隔）
      results.push(runScenario(seed, anchor, D, flightId));
    }
  }
}

const q = (arr, p) => (arr.length ? [...arr].sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : NaN);
const f = (v) => (Number.isFinite(v) ? v.toFixed(3) : '－');

const env = reachRadiusFor('dive', TUNING) + BALL.RADIUS; // A-9：向單一真相來源取
const dives = results.filter((x) => x.touched);
const attempts = results.filter((x) => x.attempted);
const ds = dives.map((x) => x.dist);
const dh = ds.map((d) => d / env);
const hist = new Array(10).fill(0);
for (const v of dh) hist[Math.min(9, Math.max(0, Math.floor(v * 10)))] += 1;

console.log('=== 魚躍注入軌【來源標記：INJECTED】（段 1 裁定 ③ 雙軌之注入軌）===');
console.log('⚠ 本表數字不得與自然軌／面板其他六項並排（A-8）；只做段間自比。');
console.log(`情境集（🔒 定案 2026-07-30）：8 錨點 × D{${DISTANCES.join(',')}}m × ${SEEDS.length} seeds ＝ ${results.length} 情境`);
console.log(`t=${TUNING.CONVERGE_T ?? 0}　魚躍可及上限（reachRadiusFor('dive')+BALL.RADIUS）＝ ${f(env)} m\n`);
console.log(`n（dive TOUCH）＝ ${dives.length}　${dives.length >= 30 ? '✅ 達 n≥30' : '🔴 未達 n≥30'}`
  + `｜dive 出手 ${attempts.length}｜出手未觸 ${attempts.length - dives.length}（構不到＝壓力訊號）`
  + `｜他種觸球 ${results.filter((x) => x.otherTouch).length}｜無觸球落地 ${results.filter((x) => !x.touched && !x.otherTouch).length}`);
for (const D of DISTANCES) {
  const g2 = results.filter((x) => x.D === D);
  console.log(`   D=${D.toFixed(1)}m：觸 ${g2.filter((x) => x.touched).length}/${g2.length}`);
}
console.log(`\ndist  p50 ${f(q(ds, 0.5))}  p90 ${f(q(ds, 0.9))}  max ${f(Math.max(...ds))} m`);
console.log(`d̂ ＝ dist ÷ 上限  p50 ${f(q(dh, 0.5))}  p90 ${f(q(dh, 0.9))}  p99 ${f(q(dh, 0.99))}`);
console.log(`十等分 ${hist.map((n) => String(Math.round((n / (dh.length || 1)) * 100)).padStart(3)).join('|')}  (%，左=0.0-0.1 右=0.9-1.0)`);
console.log(`**貼邊率（d̂ ∈ [0.9,1.0]）＝ ${dh.length ? ((hist[9] / dh.length) * 100).toFixed(1) : '－'}%**`);
