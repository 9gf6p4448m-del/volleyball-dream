// Phase 5 §十 階段五 —— **可及半徑縮到目標值之後，現有的觸球有多少會構不到？**
//
// ★ 為什麼要這支（階段五 kickoff 的第三次冷讀指出的缺口，但方向被本端修正了）★
// 簡報原本擔心的是「可及一縮 ⇒ 到位項飽和 ⇒ 散佈升 10–20%」。
// 那個擔心問對了問題、答錯了方向：`game.js` 的註解實測「AI 接球 dist ≈ 1.1」，
// 而 §5.2 要把接球可及縮到 身高×0.38（≈0.70）、**舉球縮到 0.45**（−65%）
// ⇒ 主要後果不是散佈變大，是**觸球本身大量構不到**。
// 散佈只在 `min(1, dist/reach)` 未飽和時才有空間動；飽和之後就是「碰不到」。
//
// ★ 量什麼（零 `src` 改動：`TOUCH` 事件本來就帶 `dist`，見 game.js:605）★
//   每一次觸球的 `dist`（＝球心到球員的水平距離）＋該球員身高，依動作分組。
//   然後對每個候選可及值算兩件事：
//     ① **構不到率** ＝ `dist > 候選可及` 的比例
//     ② **散佈位移** ＝ qualityMul 的變化比
//        `(RECV_POS_MIN + RECV_POS_RANGE × min(1, dist/新可及)) ÷ (同式用舊可及)`
//
// ★★ 讀這張表之前必須知道的兩件事（否則會嚴重誤讀）★★
//
// ⚠ 一、**「構不到率」不是預測值，是兩個座標系相比的產物。**
// 現行 `dist` 是**從腳算**的水平距離（`reach.js` 的退化圓柱：軸心 `cx = actor.x`），
// 而 §5.2 的 0.45／0.55 明寫**「手點＝額前上方」／「手點吃跳躍位移」**＝從**手**算的球體半徑。
// `reach.js` 自己的註解就寫了：「真正的球體要等階段五統一收斂連同目標值一起換上，
// 那時 `volume.kind` 從 'cylinder' 變 'sphere'、`cy` 開始有意義」。
// ⇒ **§5.2 的數字不能當「純縮半徑」套用**——它與「圓柱→球體、軸心從腳移到手」是同一件事的兩半。
//   水平方向的手點現在**根本沒建模**（手的 x/z 就等於腳的 x/z），所以在模型換掉之前，
//   **沒有人算得出真正的失敗率**。本表**不宣稱**那個數字。
//
// ⚠ 二、`dist` 是條件於「這次觸球成功發生」的分佈（已被現行可及 1.3 截斷），
// 且 §5 允許的補償正是「走位更準」⇒ 真實值還會更低。
//
// ★ 那這張表有什麼用 ★
// 它量的是**現行觸球離球員腳下有多遠**——這個量本身是實測、無爭議，而且它說明了
// **為什麼階段五不能只擰數字**：舉球 `dist` p50 ≈ 0.98 m，而目標半徑 0.45 m
// ⇒ 若不同時把軸心移到手上，這個系統會停止運作。**這是「模型必須一起換」的量化證據**，
// 不是「收斂會砸掉 88.5% 的舉球」的預測。
//
// 跑法：node tools/phase5-reach-shrink-probe.mjs [局數=10]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const SETS = Number(process.argv[2] ?? 10);
// §5.2 目標值（接球是身高係數，其餘是絕對公尺）
const TARGET = {
  receive: { kind: 'height', k: 0.38, label: '身高×0.38' },
  set: { kind: 'abs', v: 0.45, label: '0.45' },
  spike: { kind: 'abs', v: 0.55, label: '0.55' },
};

const rows = [];
for (let s = 1; s <= SETS; s += 1) {
  const game = createGame({ seed: s * 101, setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    for (const e of stepGame(game, aiCollectIntents(game, ai, []))) {
      if (e.type !== 'TOUCH' || e.dist == null) continue;
      const h = game.players[e.playerId]?.height?.current ?? null;
      rows.push({ kind: e.kind, dist: e.dist, h, blown: !!e.blown });
    }
  }
}

const q = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const f = (v) => (Number.isFinite(v) ? v.toFixed(3) : '－');
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '－');

console.log(`=== 可及縮到 §5.2 目標值後，現有觸球有多少構不到（${SETS} 局，n=${rows.length}）===`);
console.log(`現行可及：全動作同一個 REACH_RADIUS = ${TUNING.REACH_RADIUS}`
  + `（魚躍 ×${TUNING.DIVE_REACH_MUL} = ${(TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL).toFixed(2)}）`);
console.log('⚠ dist 是「觸球已成功發生」的條件分佈（被現行 1.3 截斷）'
  + '⇒ 構不到率是**走位完全不變**下的上界，不是預測值\n');

const KINDS = [
  ['receive', '接球（第一觸）'],
  ['dig', '救球 dig'],
  ['set', '舉球'],
  ['spike', '扣球'],
  ['serve', '發球'],
];
for (const [kind, label] of KINDS) {
  const rs = rows.filter((r) => r.kind === kind);
  if (!rs.length) continue;
  const ds = rs.map((r) => r.dist);
  console.log(`-- ${label}（n=${rs.length}）--`);
  console.log(`   dist  p10 ${f(q(ds, 0.1))}  p50 ${f(q(ds, 0.5))}  p90 ${f(q(ds, 0.9))}`
    + `  max ${f(Math.max(...ds))} m`);
  const t = TARGET[kind];
  if (!t) { console.log('   （§5.2 未給此動作的目標值）\n'); continue; }
  // ① 構不到率
  const reachOf = (r) => (t.kind === 'height' ? (r.h ?? 0) * t.k : t.v);
  const miss = rs.filter((r) => r.dist > reachOf(r)).length;
  console.log(`   目標可及 ${t.label}  ⇒ 腳下距離超過它的比例 ${pct(miss, rs.length)}`
    + `（${miss}/${rs.length}）　⚠ 不是失敗率預測，見檔頭警告一`);
  // ② 散佈位移（只有接球類吃 receiveQualityMul）
  if (kind === 'receive' || kind === 'dig') {
    const qm = (dist, reach) => TUNING.RECV_POS_MIN
      + TUNING.RECV_POS_RANGE * Math.min(1, Math.max(0, dist) / reach);
    const ratios = rs.map((r) => qm(r.dist, reachOf(r)) / qm(r.dist, TUNING.REACH_RADIUS));
    console.log(`   散佈位移（qualityMul 變化比）p50 ${f(q(ratios, 0.5))}`
      + `  p90 ${f(q(ratios, 0.9))}  max ${f(Math.max(...ratios))}`);
    console.log('     └ 只有「構得到」的那些才談得上散佈；構不到的那些是**碰不到**，不是變飄');
  }
  console.log('');
}

// 魚躍：§5.2 給的是絕對值「中位身高球員 ≈2.0 m」，倍率須重導
const dive = rows.filter((r) => r.kind === 'dive');
if (dive.length) {
  const ds = dive.map((r) => r.dist);
  console.log(`-- 魚躍（n=${dive.length}）--`);
  console.log(`   dist  p50 ${f(q(ds, 0.5))}  p90 ${f(q(ds, 0.9))}  max ${f(Math.max(...ds))} m`);
  console.log(`   現值可及 ${(TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL).toFixed(2)} m`
    + `｜§5.2 目標 ≈2.0 m ⇒ 構不到率 ${pct(ds.filter((d) => d > 2.0).length, ds.length)}`);
  console.log('   ⚠ 若接球基底縮到 ≈0.70 而魚躍要維持 2.0，倍率要從 '
    + `${TUNING.DIVE_REACH_MUL} 重導到 ≈${(2.0 / 0.70).toFixed(1)}`
    + ' ⇒ 魚躍／接球比放大 ⇒ 魚躍從輔助變主力防守（階段五 題 1 子題）\n');
}

console.log('讀法：上表**不是失敗率預測**（腳心 vs 手心兩個座標系）。它證明的是：');
console.log('      舉球 dist p50 ≈ 0.98 m 而目標半徑 0.45 m ⇒ 不同時把軸心移到手上，系統會停止運作。');
console.log('      ⇒ **階段五不是「擰數字」，是「換幾何模型＋擰數字」**，兩者不可分割。');
