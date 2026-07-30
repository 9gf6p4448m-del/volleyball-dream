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
import { BALL } from '../src/sim/constants.js';
import { reachRadiusFor } from '../src/sim/reach.js';

const BALL_RADIUS = BALL.RADIUS;

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

// ★★ P1（面板項）：接球成功率 —— 分母＝「該接的來球」，不是「出手次數」★★
//
// 為什麼分母不能用「出手但沒觸到」：AI 自己有 inReach 閘（ai.js:716-718），它認為構不到
// 就不出手 ⇒ 那個分母恆為 0，量不到東西。真正會壞的是「**該接的球沒人觸到**」。
//
// 定義（純由事件流導出，零 src 改動）：
//   分母 ＝ 對方球過網進我方半場、且該球最終判 `BALL_IN`（落在場內）
//          → `OUT` 的球**不計入**（不該接的球，不接才是對的）
//   分子 ＝ 我方在該球死掉之前產生了第一觸（`TOUCH` with `touches === 1`）
//   ⇒ 失敗 ＝ **漏接**（球落我方場內、我方零觸）
//
// ⚠ 只有「接球」這一環的分母抓得乾淨。**舉球／扣球／攔網的「機會」語意不唯一**
//   （第一觸若直接過網或出界，本來就不該有第二觸）⇒ 依本檔登記的 G1 處置，
//   **回報重議 P1 對這三項的定義，不自行換量**。本段只出接球。
// ============================================================================
// ★★ P1（面板項，裁定書 v3 附錄 §一.4 全文）★★
//   (a) 各動作的「觸球歸一化距離分佈」 d̂ = dist ÷ 該動作在該段的可及上限
//   (b) 每持球回合觸球次數（分母沿用嘗試③已除錯的生命週期）
//   (c) 衍生視圖：每 rally 觸球鏈長度分佈（不佔面板項）
//
// ★ (a) 的「可及上限」取的是什麼（附錄要求：`inReach` 閘**實際使用**的包絡）★
//   `game.js:471-480` 建 `vol = reachVolumeFor({...inflate: REACH_INFLATE})`，
//   而 `ballInReach` 測的就是 `dist <= vol.r`；`reach.js:64` 的
//   `reachRadiusFor(action, tuning)` ＋ `REACH_INFLATE (= BALL.RADIUS)` 就是那個 `vol.r`。
//   ⇒ **每動作單一純量、已暴露** ⇒ 不觸發附錄 §一.4(a) 的「回報」條款。
//   ⚠ 注意 `ai.js:716-718` 的 AI 出手閘用的是**另一個**包絡
//     （`REACH_RADIUS × ATTEMPT_RADIUS/CLOSE_RADIUS`）——那不是產生本檔 `dist` 的那一個，
//     所以不拿它當分母。
//
// ★ 攔網不在 (a)(b) 內（如實登記，非遺漏）★
//   攔網是隔網結算（`blockBand.js`），**不發 `TOUCH` 事件**、沒有 `dist`
//   ⇒ 結構上量不到。它的對應量是面板 P3 的密合率／洞寬。
// ============================================================================
const REACH_INFLATE = BALL_RADIUS;
const ACT_LABEL = {
  receive: '接球', dig: '救球dig', set: '舉球', spike: '扣球', dive: '魚躍', serve: '發球',
};
// ★ 包絡必須向 `reachRadiusFor` 要，不得自己重算 ★
// 基準 B（`TUNING.CONVERGE_T > 0`）之後，前三個動作的可及半徑吃**該球員的身高**
// ⇒ 包絡是**逐球員、逐段**的。本檔一度自己用 t=0 的式子重算，那會讓 d̂ 的分母取錯
// （正是閘門第 3 條要抓的「歸一化分母取錯」）。現在直接呼叫 sim 的單一真相來源。
function envelopeOf(kind, heightM) {
  if (kind === 'serve') return null; // serve 在 game.js:412 早退，不走可及判定
  const act = kind === 'dig' ? 'receive' : kind;
  return reachRadiusFor(act, TUNING, heightM) + REACH_INFLATE;
}

console.log('');
console.log(`=== P1(a) 觸球歸一化距離 d̂ = dist ÷ 可及上限（t=${TUNING.CONVERGE_T ?? 0}）===`);
console.log(`   可及上限 ＝ reachRadiusFor(action) + BALL.RADIUS ＝ vol.r（ballInReach 實際用的那個）`);
for (const kind of ['receive', 'dig', 'set', 'spike', 'dive']) {
  const rs = rows.filter((r) => r.kind === kind);
  if (!rs.length) continue;
  const envs = rs.map((r) => envelopeOf(kind, r.h));
  const dh = rs.map((r, i) => r.dist / envs[i]);
  const hist = new Array(10).fill(0);
  for (const v of dh) hist[Math.min(9, Math.max(0, Math.floor(v * 10)))] += 1;
  const edge = hist[9] / dh.length;
  const envLo = Math.min(...envs);
  const envHi = Math.max(...envs);
  console.log(`-- ${ACT_LABEL[kind]}（n=${rs.length}）`
    + `　上限 ${envLo === envHi ? envLo.toFixed(3) : `${envLo.toFixed(3)}–${envHi.toFixed(3)}`} m`
    + `（逐球員）　t=${TUNING.CONVERGE_T ?? 0} --`);
  console.log(`   d̂  p50 ${f(q(dh, 0.5))}  p90 ${f(q(dh, 0.9))}  p99 ${f(q(dh, 0.99))}`);
  console.log(`   十等分 ${hist.map((n) => String(Math.round((n / dh.length) * 100)).padStart(3)).join('|')}`
    + `  (%，左=0.0-0.1 右=0.9-1.0)`);
  console.log(`   **貼邊率（d̂ ∈ [0.9,1.0]）＝ ${(edge * 100).toFixed(1)}%**`
    + '　← 預告下一段會轉成漏接的那批球');
}
console.log('   ⚠ 攔網未列：隔網結算不發 TOUCH、無 dist ⇒ 結構上量不到，其對應量是 P3 密合率／洞寬');

console.log('');
console.log('=== P1(b) 每持球回合觸球次數（分母＝我方持球回合，沿用嘗試③的生命週期）===');
{
  const byKind = {};
  let possessions = 0;
  let rallies = 0;
  let rallyTickSum = 0;
  const chainHist = new Map(); // 觸球鏈長度 → 次數（(c) 衍生視圖）
  for (let s2 = 1; s2 <= SETS; s2 += 1) {
    const g = createGame({ seed: s2 * 101, setTarget: 25 });
    const ai2 = createAiState();
    let guard2 = 0;
    let cur = null;      // { team, counts:{kind:n}, chain:n }
    let rallyStart = null;
    const close = () => {
      if (!cur) return;
      possessions += 1;
      for (const [k, n] of Object.entries(cur.counts)) byKind[k] = (byKind[k] ?? 0) + n;
      chainHist.set(cur.chain, (chainHist.get(cur.chain) ?? 0) + 1);
      cur = null;
    };
    while (g.phase !== 'set_over' && guard2 < 400000) {
      guard2 += 1;
      const zBefore = g.ball.z;
      const phaseBefore = g.phase;
      if (phaseBefore === 'rally' && rallyStart == null) rallyStart = g.tick;
      const ev = stepGame(g, aiCollectIntents(g, ai2, []));
      // 過網 ⇒ 關上一個持球回合、開新的（只算 rally 中；死球歸位也會跨 z=0）
      if (phaseBefore === 'rally' && g.phase === 'rally'
        && zBefore !== 0 && (zBefore > 0) !== (g.ball.z > 0)) {
        close();
        cur = { team: g.rally.possession, counts: {}, chain: 0 };
      }
      for (const e of ev) {
        if (e.type === 'TOUCH' && cur && e.team === cur.team) {
          cur.counts[e.kind] = (cur.counts[e.kind] ?? 0) + 1;
          cur.chain += 1;
        }
        if (e.type === 'DEAD_BALL') {
          close();
          if (rallyStart != null) { rallies += 1; rallyTickSum += g.tick - rallyStart; rallyStart = null; }
        }
      }
    }
  }
  // 段 1 裁定 ④（2026-07-30）：rally 長度升格**正式觀測項**（P1(b)）——段段報絕對值
  // 與相對基準的 %。496.0 ＝ **基準 A'**（S2 修復後 post-S2 碼在 t=0 的重量值，
  // convergence 表 A-2）；舊基準 A 的 490.3 為 pre-S2 歷史值，已隨基準重定作廢。
  // 凍結量測值非旋鈕量（A-9 的「向真相來源取」不適用，但語意在此交代）。
  const BASELINE_A_RALLY_TICK = 496.0;
  const avgRally = rallies ? rallyTickSum / rallies : NaN;
  console.log(`   我方持球回合總數 n=${possessions}　rally 數 ${rallies}`
    + `　平均 rally 長度 ${Number.isFinite(avgRally) ? avgRally.toFixed(1) : '－'} tick`
    + `【正式觀測項】vs 基準 A ${BASELINE_A_RALLY_TICK} ⇒ `
    + `${Number.isFinite(avgRally) ? `${(((avgRally - BASELINE_A_RALLY_TICK) / BASELINE_A_RALLY_TICK) * 100).toFixed(1)}%` : '－'}`);
  console.log('   （平均 rally 長度用來分辨「觸球數掉」是可及壞了還是 rally 變短了）');
  for (const kind of ['receive', 'dig', 'set', 'spike', 'dive']) {
    if (!byKind[kind]) continue;
    console.log(`   ${ACT_LABEL[kind].padEnd(7)} 每持球回合均值 ${f(byKind[kind] / possessions)}`
      + `（總 ${byKind[kind]}）`);
  }
  console.log('');
  console.log('=== P1(c) 衍生視圖：觸球鏈長度分佈（不佔面板項）===');
  const tot = [...chainHist.values()].reduce((a2, b2) => a2 + b2, 0);
  const keys = [...chainHist.keys()].sort((a2, b2) => a2 - b2);
  console.log('   ' + keys.map((k) => `${k} 觸 ${((chainHist.get(k) / tot) * 100).toFixed(1)}%`).join('　'));
  console.log('   ★ 功能性歸零（裁定書 §4.2④ 唯一例外）在 (b) 表現為某動作均值趨近 0、');
  console.log('     在 (c) 表現為 2 觸鏈佔比塌陷——兩層互為佐證。');
}

console.log('');
console.log('讀法：上表**不是失敗率預測**（腳心 vs 手心兩個座標系）。它證明的是：');
console.log('      舉球 dist p50 ≈ 0.98 m 而目標半徑 0.45 m ⇒ 不同時把軸心移到手上，系統會停止運作。');
console.log('      ⇒ **階段五不是「擰數字」，是「換幾何模型＋擰數字」**，兩者不可分割。');
