// Phase 5 §十 階段二 v3 —— **R5 先決量測：球能不能告訴 read「什麼時候」？**
//
// ★ 為什麼要這支（v3 裁定書 R5＋冷讀 §甲）★
// v3 裁定書採路 D：read 的起跳時鐘改由**球的物理狀態**導出，
// 形式＝`預測過網 tick − 跳躍窗長/2`（AIR_TICKS=24 ⇒ −12，零新常數）。
// 但冷讀抓到整條裁定的地基缺口：
//   前一輪（`phase5-block-clue-probe.mjs`）證明的是「**球告訴你是誰**」——
//   x 座標誤差 4–33 cm vs 誘餌在 2.7–5.3 m 外，20–40 倍分辨力。
//   那是**空間**餘裕，**不能直接兌換成時間精度**。
//   「預測過網 tick 的誤差」全卷從來沒有一個數字。
// 不量就實作＝又一次拿沒驗證的前提去動 sim（本卷已有三次前提被實測推翻）。
//
// ★ 量什麼（B 隊 read 臂視角，一波攻擊＝A 隊二傳觸球 → DEAD_BALL）★
// 取樣時點嚴格遵守 R1：**二傳觸球 ＋ 該攔網手自己的 reactionTicks**，一次取樣、不重算。
// （公式逐字沿用 `src/sim/ai.js:1354-1356`；`reactionTicks` 未 export，故在本檔複述，
//   改動時兩處要一起改。）
//
//   netDerivable   在取樣那一刻，球的當前速度解不解得出「球通過 z=0 的時間」
//                  （＝`src/sim/flight.js:55-60 heightAtNet` 的 t = −z/vz 有沒有正解）
//   predNetAbs     上式解出來的**預測過網 tick**（絕對 tick）
//                  ⚠ 解得出值 ≠ 值是對的：取樣時球還在飛向攻擊手，這條速度描述的是
//                  **二傳的球路**，而球會先被扣走、換一組全新速度才真的過網。
//                  所以「可不可導」必須看誤差（errNet），不能只看回不回得出值。
//   predContactAbs 取樣那一刻 `predictContactPoint` 給的**預測擊球 tick**（絕對 tick）
//   spikeTick      真正扣球那一 tick（＝答案 A）
//   crossTick      球真正通過網面（z 變號）那一 tick（＝答案 B，理想起跳的錨點）
//
// 導出三個誤差：
//   errNet      = predNetAbs − crossTick       **預測過網 tick 的誤差**（R5 要的那個量）
//   errContact  = predContactAbs − spikeTick   預測擊球 tick 的誤差（正＝預測偏晚）
//   segment     = crossTick − spikeTick        擊球→過網的飛行段長（R2 說的「補差位移」）
//   errNaive    = predContactAbs − crossTick   **若把預測擊球 tick 當過網 tick 用**的誤差
//                 ＝ errContact − segment，也就是 `−12` 那條公式實際會偏掉多少
//
// 機械判準（對應 v3 裁定書 §四 停下回報條件）：
//   ① errNet 的離散度若大於半窗 12 tick ⇒ 「預測過網 tick」實質不可用 ⇒ 觸發條件 1／4
//   ② segment 的離散度（sd／p10–p90／組間差）若明顯不是常數 ⇒ 不得用固定位移補差 ⇒ 條件 1
//   ③ errNaive 的離散度就是 read 的**起跳抖動**：AIR_TICKS=24 的半窗只有 12 tick，
//      抖動 sd 若接近或超過 12 ⇒ 頂點對不上球 ⇒ 觸發條件 4（R5「誤差大到 read 反而抖」）
//
// 跑法：node tools/phase5-block-nettick-probe.mjs [局數=8]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { predictContactPoint } from '../src/sim/flight.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { AIR_TICKS } from '../src/sim/approach.js';
import { blockReach, blockTopEdge, standingReach } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';

const SETS = Number(process.argv[2] ?? 8);
const GROUP = { quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back' };
const HALF_WINDOW = AIR_TICKS / 2; // 12：R2 的 `− 跳躍窗長/2`

// 逐字複述 src/sim/ai.js:1354-1356（未 export）
const reactionTicks = (p) => Math.max(6, Math.round(24 - p.attributes.reaction * 0.16));

function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

// 球當前速度下通過網面（z=0）的時間 → tick 數；不會過網回 null
// 幾何與 src/sim/flight.js:55-60 heightAtNet 同源（z 軸無加速度，見 ball.js:20-23）
function netCrossTicks(ball) {
  if (ball.vz === 0) return null;
  const t = -ball.z / ball.vz;
  if (!(t > 0)) return null;
  return t * 60; // SIM_DT = 1/60
}

const rows = [];
for (let s = 1; s <= SETS; s += 1) {
  const game = createGame({ seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: 'read' } } });
  const ai = createAiState();
  let cur = null;
  let guard = 0;
  while (game.phase !== 'set_over' && guard < 400000) {
    guard += 1;

    // 開波：以 AI 自己寫下的 setTouch 為錨（ai.js:246），不另外猜
    const st = ai.setTouch;
    if (st && st.team === 'A' && (!cur || cur.setTick !== st.tick)) {
      const mb = mbOf(game, 'B');
      cur = {
        setTick: st.tick,
        sampleTick: mb ? st.tick + reactionTicks(game.players[mb]) : null,
        sampled: false,
        netDerivable: null,
        predNetAbs: null,
        predContactAbs: null,
        kind: null,
        spikeTick: null,
        crossTick: null,
      };
    }

    // R1 取樣時點：二傳觸球 ＋ 反應延遲，**一次取樣、之後不重算**
    if (cur && !cur.sampled && cur.sampleTick != null && game.tick >= cur.sampleTick
      && game.rally.possession === 'A') {
      cur.sampled = true;
      const nt = netCrossTicks(game.ball);
      cur.netDerivable = nt != null;
      cur.predNetAbs = nt != null ? game.tick + Math.round(nt) : null;
      const hit = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
      cur.predContactAbs = hit ? game.tick + hit.ticks : null;
    }

    const zBefore = game.ball.z;
    const ev = stepGame(game, aiCollectIntents(game, ai, []));

    // 實際過網那一 tick（球心 z 變號）；撞網不過去的球留 null
    // 一併把該攔網手與體力乘數留下，供 §反事實 逐樣本算完成度（與 jumpcount 探針同定義）
    if (cur && cur.spikeTick != null && cur.crossTick == null && zBefore > 0 && game.ball.z <= 0) {
      cur.crossTick = game.tick;
      const mb = mbOf(game, 'B');
      if (mb) {
        const p = game.players[mb];
        const jumpMul = staminaPerfMul(game, p);
        const apex = blockReach(p, jumpMul);
        cur.apex = apex;
        cur.floorPct = apex > 0 ? standingReach(p) / apex : null;
        // ⚠ 閉包只能吃區域變數：`cur` 在 DEAD_BALL 時會被設成 null
        cur.topAt = (t) => (apex > 0 ? blockTopEdge(p, t, jumpMul) / apex : null);
      }
    }
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && !cur.spikeTick) {
        cur.spikeTick = game.tick;
        cur.kind = ai.attackKind;
      }
      if (e.type === 'DEAD_BALL' && cur) {
        if (cur.kind && cur.sampled) rows.push(cur);
        cur = null;
      }
    }
  }
}

const sorted = (a) => [...a].sort((x, y) => x - y);
const q = (a, p) => (a.length ? sorted(a)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
const f = (v) => (Number.isFinite(v) ? v.toFixed(2) : '－');
const line = (name, a, unit = 'tick') => console.log(
  `   ${name.padEnd(30)} n=${String(a.length).padStart(4)}`
  + `  p10 ${f(q(a, 0.1)).padStart(7)}  p50 ${f(q(a, 0.5)).padStart(7)}  p90 ${f(q(a, 0.9)).padStart(7)}`
  + `  mean ${f(mean(a)).padStart(7)}  sd ${f(sd(a)).padStart(6)}`
  + `  min ${f(Math.min(...a)).padStart(7)}  max ${f(Math.max(...a)).padStart(7)} ${unit}`,
);

console.log(`=== R5 先決量測：預測「過網／擊球」tick 的誤差分佈（${SETS} 局，read 臂）===`);
console.log(`取樣時點＝二傳觸球 ＋ reactionTicks（R1），一次取樣不重算｜跳躍半窗 AIR_TICKS/2 = ${HALF_WINDOW}\n`);

// ★ 樣本對帳（冷讀抓到的缺陷：總數與分組數不合）★
const grouped = rows.filter((r) => GROUP[r.kind]);
const ungrouped = rows.filter((r) => !GROUP[r.kind]);
const ungroupedKinds = [...new Set(ungrouped.map((r) => r.kind))];
console.log(`【樣本對帳】總樣本 ${rows.length}　＝　分組內 ${grouped.length}`
  + `　＋　未分組 ${ungrouped.length}（attackKind＝${ungroupedKinds.join('/') || '無'}，`
  + '不屬 quick/left/right/pipe/dball，下表不列)');
const crossMissing = rows.filter((r) => r.crossTick == null).length;
console.log(`　　　　　　有實際過網 tick 的樣本 ${rows.length - crossMissing}/${rows.length}`
  + `（缺 ${crossMissing} ＝ 撞網／未過網）\n`);

const derivable = grouped.filter((r) => r.netDerivable).length;
console.log(`【① 過網 tick 可不可導】分組內 t = −z/vz 有正解的比例：`
  + `${grouped.length ? ((derivable / grouped.length) * 100).toFixed(1) : '-'}%（${derivable}/${grouped.length}）`);
console.log('    ⚠ 這一欄只說「回不回得出值」。值對不對看下面每組的 errNet——');
console.log('      取樣時那組速度描述的是**二傳的球路**，球會先被扣走、換一組全新速度才真的過網。\n');

for (const g of ['quick', 'wing', 'back']) {
  const rs = rows.filter((r) => GROUP[r.kind] === g && r.predContactAbs != null);
  if (!rs.length) continue;
  const label = { quick: '快攻', wing: '兩翼', back: '後排' }[g];
  console.log(`-- ${label}（n=${rs.length}）--`);
  const withNet = rs.filter((r) => r.predNetAbs != null && r.crossTick != null);
  line(`errNet 預測過網誤差（可導 ${withNet.length}/${rs.length}）`,
    withNet.map((r) => r.predNetAbs - r.crossTick));
  line('errContact 預測擊球誤差', rs.map((r) => r.predContactAbs - r.spikeTick));
  const withCross = rs.filter((r) => r.crossTick != null);
  line('segment 擊球→過網 飛行段長', withCross.map((r) => r.crossTick - r.spikeTick));
  line('errNaive 當過網用的誤差', withCross.map((r) => r.predContactAbs - r.crossTick));
  console.log('');
}

console.log('【② 補差位移是不是常數】比較上表三組的 segment p50／sd：組間 p50 差距大、'
  + '或組內 sd 明顯 > 0 ⇒ 非常數 ⇒ R2 明文禁止用固定位移補差 ⇒ 停下回報\n');
console.log(`【③ read 會不會抖】errNaive 的 sd 若接近或超過半窗 ${HALF_WINDOW} tick，`
  + '代表「預測擊球 tick − 12」這條公式的頂點對不上球 ⇒ 觸發條件 4\n');

// ★★ 反事實掃描：前置量取不同值時，球過網那一刻的頂邊完成度會是多少 ★★
//
// 為什麼要這一段（fresh-context 冷讀抓到的兩個缺陷）：
//   ① 只拿 errNaive 的 p50 代進跳躍曲線，會丟掉同一列的 sd（4.8–7.7，而窗只有 24）
//      ⇒ 必須**逐樣本**算，然後看分佈。
//   ② 把「非過網錨點」全部塌縮成「前置 AIR_TICKS/2」是沒有辯護的：
//      R2 要頂點對齊的是**網面**；錨點一旦改成擊球，「頂點對齊」的原始理由就失效，
//      **前置量本身就是開放的**，而 0 同樣零新常數。
//
// 完成度定義與 `phase5-block-jumpcount-probe.mjs:137-145` 逐字同源：
//   blockTopEdge(p, t, jumpMul) / blockReach(p, jumpMul)，t ＝ 過網 tick − 起跳 tick；
//   t < 0（還沒跳）或 t > AIR_TICKS（已落地）時 blockTopEdge 回站立摸高 ＝ **地板**。
//
// 夾限（honest constraint）：起跳 tick 不可能早於取樣 tick——人不能跳到過去。
//   `clamp%` ＝ 這個夾限實際生效的比例；生效越多，該前置量越是「算得出但做不到」。
const LEADS = [
  { lead: 0, note: '零新常數（起跳＝預測擊球 tick）' },
  { lead: HALF_WINDOW, note: `零新常數＝R2 原形式（AIR_TICKS/2＝${HALF_WINDOW}）` },
  { lead: Math.round(AIR_TICKS / 3), note: '需新導出常數（AIR_TICKS/3），僅供參考' },
  { lead: Math.round(AIR_TICKS / 4), note: '需新導出常數（AIR_TICKS/4），僅供參考' },
];

console.log('=== 反事實掃描：起跳 tick ＝ 預測擊球 tick − 前置量，球過網時的頂邊完成度 ===');
console.log('逐樣本計算（非拿 p50 硬算）｜完成度定義同 jumpcount 探針｜含「不能跳到過去」夾限\n');
for (const g of ['quick', 'wing', 'back']) {
  const rs = rows.filter((r) => GROUP[r.kind] === g && r.predContactAbs != null
    && r.crossTick != null && r.topAt);
  if (!rs.length) continue;
  const label = { quick: '快攻', wing: '兩翼', back: '後排' }[g];
  const floors = rs.map((r) => r.floorPct).filter((v) => v != null);
  console.log(`-- ${label}（n=${rs.length}）　地板 p50 = ${(q(floors, 0.5) * 100).toFixed(1)}% --`);
  for (const { lead, note } of LEADS) {
    const vals = [];
    let clamped = 0;
    let above = 0;
    for (const r of rs) {
      const hyp = r.predContactAbs - lead;
      const eff = Math.max(hyp, r.sampleTick);
      if (eff !== hyp) clamped += 1;
      const pct = r.topAt(r.crossTick - eff);
      if (pct != null) {
        vals.push(pct);
        if (pct > r.floorPct + 1e-9) above += 1;
      }
    }
    if (!vals.length) continue;
    console.log(`   前置 ${String(lead).padStart(2)}`
      + `  完成度 p10 ${(q(vals, 0.1) * 100).toFixed(1)}%`
      + `  p50 ${(q(vals, 0.5) * 100).toFixed(1)}%`
      + `  p90 ${(q(vals, 0.9) * 100).toFixed(1)}%`
      + `  mean ${(mean(vals) * 100).toFixed(1)}%`
      + `  ｜離開地板 ${((above / vals.length) * 100).toFixed(1)}%`
      + `  夾限生效 ${((clamped / rs.length) * 100).toFixed(1)}%`
      + `  ｜${note}`);
  }
  console.log('');
}
console.log('讀法：R4 第 1 款要「read×兩翼／後排 顯著高於地板」，'
  + '第 3 款要「read×快攻 明顯低於 commit×快攻」。');
console.log('      同時滿足兩款的前置量，才是零新常數又保住賭局的候選。');
console.log('⚠ 本段是**反事實推算**，不是實測：src 未改動，這些完成度沒有任何一格是跑出來的行為。');
