// Phase 5 §十 階段四／五 —— **一傳品質 `passTier` 是死的輸入嗎？門檻相對化之後會怎樣？**
//
// ★ 為什麼要這支 ★
// 攻擊池有三個分支（到位＝全池／可用＝無快攻／勉強＝只剩兩翼高球），由 `passTier` 決定。
// 工單 §4.1 說它恆為 `perfect` ⇒ 後兩個分支是死碼。本探針把這件事變成可重跑的數字，
// 並算出「門檻改成 係數 × 舉球可及半徑 之後，各個可及值下的 tier 分佈」——
// 讓階段五要把舉球可及縮到多少，有對照表可看，而不是憑感覺挑。
//
// ★ 量什麼 ★
//   1. sim **實際在用**的 `aiState.passTier` 分佈（不是重算——重算過一次，取樣時點錯了）
//   2. d ＝ |一傳落點 − 二傳點| 的分佈（＝門檻要比較的那個量）
//   3. 反事實：門檻 ＝ 係數 × 舉球可及半徑，掃各個可及值下的 tier 比例
//
// ★ 關鍵事實（讀數字前先知道，否則會誤讀）★
//   落點散佈是 `game.js scatterTarget`：`r = SCATTER_MAX × ((1−control/100) × factor × qualityMul)`，
//   然後 `radius = rand() × r` ⇒ **d 在 [0, r] 上均勻**。
//   ⇒ 所以「用**逐次實現的 r** 正規化 d」是錯的：`d/r` 恆為 U(0,1)，
//     每種 control 的 tier 比例會完全相同 ⇒ passTier 與球員技術脫鉤。已排除，別再試。
//
// 跑法：node tools/phase5-passtier-probe.mjs [局數=10]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { reachRadiusFor } from '../src/sim/reach.js';

const SETS = Number(process.argv[2] ?? 10);

// 與 ai.js 的 localToWorld 同式：A 隊在 +z 側
function setterSpot(team) {
  const sgn = team === 'A' ? 1 : -1;
  return { x: sgn * AI.SETTER_SPOT.lx, z: sgn * AI.SETTER_SPOT.lz };
}

const rows = [];
for (let s = 1; s <= SETS; s += 1) {
  const game = createGame({ seed: s * 101, setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;
    // 取樣前先快照：二傳觸球那一 tick 的 aiCollectIntents 可能已推進狀態
    const snap = {
      tier: ai.passTier,
      landing: ai.landing ? { ...ai.landing } : null,
      pid: ai.passReceiverId,
    };
    for (const e of stepGame(game, aiCollectIntents(game, ai, []))) {
      if (e.type === 'TOUCH' && e.kind === 'set' && e.touches === 2) {
        const L = ai.landing ?? snap.landing;
        const spot = setterSpot(e.team);
        // 當段舉球可及：向 reachRadiusFor 要（A-9；t>0 逐球員吃身高，故逐觸球記實際值）
        const h = game.players[e.playerId]?.height?.current ?? null;
        rows.push({
          tier: ai.passTier ?? snap.tier,
          d: L ? Math.hypot(L.x - spot.x, L.z - spot.z) : NaN,
          pid: ai.passReceiverId ?? snap.pid,
          rSet: Number.isFinite(h) ? reachRadiusFor('set', TUNING, h) : NaN,
        });
      }
    }
  }
}

const q = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const f = (v) => (Number.isFinite(v) ? v.toFixed(3) : '－');
const ds = rows.map((r) => r.d).filter(Number.isFinite);

// 表頭的「舉球可及」向 reachRadiusFor 要（段 1 §5.4 登記的探針第三處硬編碼，本輪修正；
// A-9：凡會被旋鈕移動的量不得印死值）。t>0 逐球員吃身高 ⇒ 報實測觸球的中位與範圍。
const rsAll = rows.map((r) => r.rSet).filter(Number.isFinite);
const rSetMed = q(rsAll, 0.5);
console.log(`=== 一傳品質 passTier（${SETS} 局，n=${rows.length}）===`);
console.log(`現行門檻：係數 × 舉球可及半徑（係數 1.2/1.3 與 3/1.3 ＝ 現值比例）`
  + `｜當段舉球可及（reachRadiusFor('set')，t=${TUNING.CONVERGE_T ?? 0}，逐觸球實際值）`
  + `p50 ${f(rSetMed)}（${f(Math.min(...rsAll))}–${f(Math.max(...rsAll))}）`
  + `　SCATTER_MAX ${TUNING.SCATTER_MAX}\n`);

const tiers = {};
for (const r of rows) tiers[r.tier] = (tiers[r.tier] ?? 0) + 1;
console.log('【sim 實際在用的 passTier 分佈】'
  + Object.entries(tiers).map(([k, v]) => `${k} ${((v / rows.length) * 100).toFixed(1)}%`).join('　'));
console.log('   ⚠ 只有一種取值＝這條線索是死的（攻擊池的另兩個分支走不到）');

console.log(`\n【d ＝ |一傳落點 − 二傳點|】n=${ds.length}`);
console.log(`   p10 ${f(q(ds, 0.1))}  p50 ${f(q(ds, 0.5))}  p90 ${f(q(ds, 0.9))}  max ${f(Math.max(...ds))} m`);
const nonBlown = ds.filter((d) => d < 2);
console.log(`   （排除爆接後 max ${f(Math.max(...nonBlown))}——爆接走 blownTarget，不是散佈）`);

// ==== C-1 可解性檢查（段開頭必跑；段 1 裁定 ②「條件式」，2026-07-30 Sawmah）====
// 可解 ⟺ poor 門檻（＝d 的 95 分位，poor 佔比 5% 的位置）**高於** perfect 門檻
// （＝0.923 × 當段舉球可及），否則分檔不連貫、perfect 把一切吃掉（§5.2 段 1 的無解算式）。
// ⚠ 裁定原文把不等號寫成「d p95 < 0.923×可及 成立才反解」——依其自身的段 1 判定
// （p95 0.48 < 1.09 ⇒ 登記**無解**）與 §5.2 數學，方向應為 **≥ 才可解**；
// 本檔按語意正確方向實作，勘誤已登記（convergence §5.5）並隨段 2 回報送裁定端確認。
// 不可解 ⇒ 登記「無解＋當段 d 分佈」存底，不挑係數、不取捨。
// 可解 ⇒ 反解 poor 係數（目標佔比 5%）；首次可解的段起，C-2 的 ok ≥ 8% 地板同步生效。
{
  const PERFECT_MUL = 1.2 / 1.3; // 與 ai.js PASS_PERFECT_MUL 同式（0.923）
  const dP95 = q(ds, 0.95);
  const perfectThr = PERFECT_MUL * rSetMed;
  const solvable = dP95 >= perfectThr;
  console.log(`\n=== C-1 可解性檢查（t=${TUNING.CONVERGE_T ?? 0}）===`);
  console.log(`   d p95 ＝ ${f(dP95)}　vs　perfect 門檻 0.923 × ${f(rSetMed)} ＝ ${f(perfectThr)}`);
  if (!solvable) {
    console.log(`   ⇒ 🔴 **無解**（poor 門檻 ${f(dP95)} 會低於 perfect 門檻 ${f(perfectThr)} ⇒ 分檔不連貫）`);
    console.log(`   登記當段 d 分佈：p10 ${f(q(ds, 0.1))}／p50 ${f(q(ds, 0.5))}／p90 ${f(q(ds, 0.9))}`
      + `／p95 ${f(dP95)}／非爆接 max ${f(Math.max(...nonBlown))}`);
  } else {
    const coef = dP95 / rSetMed;
    const okThr = dP95; // poor 門檻＝反解值；perfect 門檻不動
    const okPct = ds.filter((d) => d >= perfectThr && d < okThr).length / ds.length;
    console.log(`   ⇒ ✅ **可解**：反解 poor 係數 ＝ p95 ÷ 舉球可及 ＝ ${f(coef)}`);
    console.log(`   C-2 檢查：ok 實測 ${(okPct * 100).toFixed(1)}%（地板 8%）`
      + `${okPct < 0.08 ? '　🔴 跌破地板 ⇒ 停手回報重裁（C-2）' : '　✅'}`);
  }
}

// 反事實：門檻 ＝ 係數 × 舉球可及半徑
const PM = 1.2 / 1.3;
const OM = 3 / 1.3;
console.log('\n=== 反事實：門檻＝係數 × 舉球可及半徑（用同一批實測 d 直接算）===');
console.log('  舉球可及   perfect門檻   poor門檻    ⇒ perfect% / ok% / poor%');
// 0.788 ＝ 0.45 × 1.75（主錨）＝ §5.2 目標的正確單位（v4 拍板 1：身高比例）。
// 0.45 那列曾被誤標「§5.2 目標值」（把比例誤讀成公尺絕對值）——段 2 冷讀勘誤後改標。
for (const R of [1.3, 1.0, 0.788, 0.6, 0.45, 0.35, 0.25]) {
  const t1 = PM * R;
  const t2 = OM * R;
  const pf = ds.filter((d) => d < t1).length;
  const ok = ds.filter((d) => d >= t1 && d < t2).length;
  const po = ds.length - pf - ok;
  const tag = R === 1.3 ? '  ← 現值'
    : R === 0.788 ? '  ← §5.2 目標（0.45×H，主錨 H=1.75）'
      : R === 0.45 ? '  ← 反解可行點（非 §5.2 目標——那是 0.45×H）' : '';
  console.log(`  ${R.toFixed(2)}       ${f(t1)}        ${f(t2)}     ⇒ `
    + `${((pf / ds.length) * 100).toFixed(1)}% / ${((ok / ds.length) * 100).toFixed(1)}% / `
    + `${((po / ds.length) * 100).toFixed(1)}%${tag}`);
}
console.log('\n讀法：§4.2 要求「收斂後不得恆為 perfect」。上表看得出 `ok` 在哪個可及值開始活過來，');
console.log('      以及 `poor` 需要多小的 poor 門檻才碰得到（d 的非爆接上界就是天花板）。');
