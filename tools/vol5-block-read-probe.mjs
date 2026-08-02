// 卷五（MB 快攻分檔）落地前的攔網讀取基線（2026-08-02）
//
// 為什麼要量：上游假說主張「MB 多一檔快攻可能鬆動『攔網手之間判斷分歧＝零』這個
// 結構性死結」。組合攻擊卷段 D 曾量到分歧率 1.8%、blockCommitRead 呼叫中
// 「候選數＝1」佔 99.77%（成因：只認 lz ≤ DEPTH_LZ，當時是 2.9，兩翼助跑起點
// lz 3.58 在範圍外）。但**攔網時序卷段 3（2026-08-01 裁定 4）已把 DEPTH_LZ
// 從 2.9 放寬到「兩翼助跑起點 + 0.1」**（見 src/sim/blockRead.js:142，現值
// ＝ APPROACH.left.lz(3.6) + 0.1 ＝ 3.7）——這個放寬上線在段 D 量測**之後**。
// 所以本檔要複驗的是：用現在這個 DEPTH_LZ，「候選數=1／分歧率 1.8%」這兩個
// 數字還站不站得住，不是延用舊結論。
//
// 量四項：
//   ① 候選數分佈——blockCommitRead 每次真被呼叫時，它看得到幾個候選
//   ② 分歧率——兩名攔網手 commit 到的目標 x 是否不同
//   ③ 候選助跑起點 lz 分佈（p10/p50/p90）對照 DEPTH_LZ 現值
//   ④ 各 kind（quick/left/right/pipe...）進不進得了讀取範圍的比例
//
// ============================================================================
// 取得路徑（02 §6.1 條 4 要求逐項標註；零 src/ 改動，零判定邏輯重抄）
// ============================================================================
// ①③ 候選數與候選 lz：**真實路徑**。`blockCommitRead`
//   （src/sim/blockRead.js:236）的簽章本身就支援 `opts.k` 覆寫整組門檻常數
//   （第 4 個解構欄位 `k = BLOCK_COMMIT`）——這是它自己設計好的覆寫點，不是
//   本檔發明的後門（`ai.js:1858` 呼叫它時也只覆寫 `outerLag`，同一種用法）。
//   本檔用「調低 DEPTH_LZ 門檻、重複呼叫真正的 blockCommitRead、直到回 null」
//   把 cands 陣列的完整 lz 清單一個一個「剝」出來（peel）：每呼叫一次都拿到
//   目前門檻下最淺的那個候選，把門檻壓到剛好排除它，下一輪自然換下一個候選
//   浮出來。全程呼叫的都是真正 import 進來的 `blockCommitRead`——角色篩選／
//   追球者排除（`nearestToBall`）／`APPROACH_EPS` 移動判定／外圍時序視角
//   （`laggedZView`）／同深度 tie-break，一行都沒有被本檔重寫，只是換了它
//   自己就支援的門檻參數。
//   ⚠ 已知精度限制：若兩個候選的 lz **逐位元組相同**，會被合併成一輪（極低
//   機率——需要兩名球員在同一 tick 站在完全相同的深度——本檔不假裝沒有這個
//   邊界情況，只是不特別處理）。
// ② 分歧率：**真實路徑**。讀 `aiState.blockPlan.byPid[pid].x`——每個攔網手
//   自己那份已鎖定的委任決策，用真實 playerId 當 key（不是猜出來的），
//   不牽涉座標浮點回推身分。手法與 `tools/block-divergence-probe.mjs`
//   （本專案既有先例，段 D 拿去當 1.8% 基礎的同一套量測）的 M1 逐項相同。
//   ⚠ 本檔**不**回答「兩人各自鎖定的是哪個 attackerId」——那需要
//   `blockCommitRead` 揭露身分，而它的反作弊保證明文不揭露（blockRead.js
//   §6 B1 檔頭）。「兩人 commit 到不同 x」＝結構上不可能鎖同一個人，
//   這就是分歧的操作型定義，**嚴禁**（也沒有）用座標浮點相等去回推「鎖到誰」
//   ——本專案在 `tools/segf-decoy-probe.mjs` 上吃過這個虧（上游換掉瞄準來源
//   後誤歸因率被量成假的 100%）。
// ④ 各 kind 進不進得了讀取範圍：**真實路徑，另一條獨立通道**。
//   `blockCommitRead` 不回傳 kind／pid，沒有合法管道知道「這一輪候選屬於
//   哪個 kind」。改讀 `aiState.approach.routes`（真實助跑規劃，含
//   kind／pid／startTick／takeoffTick——讀法照抄
//   `tools/vol5-timing-check-probe.mjs`），在該助跑的真實時間窗
//   [startTick, takeoffTick] 內，逐 tick 讀真實 `game.actors[pid].z`，
//   換算 `lz = TEAM_SIDE.A * z`，記錄窗內最淺（最小）的 lz，再與真實
//   `BLOCK_COMMIT.DEPTH_LZ` 比較。這是單純幾何量測（讀真實位置比真實常數），
//   不涉及候選篩選的判定邏輯——角色排除／追球者排除／tie-break 都不需要，
//   因為問題本身只問「這條線的人有沒有跑進這個深度」，不問「blockCommitRead
//   那一刻選不選他」。
//
// 攔網手人格＝commit（沿用 `tools/block-divergence-probe.mjs` 的守方設定，
// 該檔註解稱「曜石＝commit」）：只有 commit 人格逐 tick 呼叫 blockCommitRead，
// read 人格 2026-07-30 起改吃球（ai.js:1834-1841 v4 裁定書「甲」），量 read
// 沒有意義。
//
// 呼叫時機（今天已經因為誤判 flight 呼叫鎖定寫出一次 CRITICAL，這裡刻意核對）：
// 本檔在**每個 tick 開頭（aiCollectIntents 之前）**用當時的 `game` 快照自己
// 額外呼叫一次 blockCommitRead——這不是「多算一次」：blockCommitRead 是純函式，
// 同一個 `game` 快照、同樣的 opts，呼叫幾次結果都一樣；ai.js 內部本來就是在
// **同一個快照**上呼叫它（aiCollectIntents 尚未跑、stepGame 也還沒動任何人）。
// 閘門條件逐項對照 ai.js 的真實狀態機（見 `chasingBlockers`）：
//   `c.jumpTick == null`   ——一旦鎖定（起跳）ai.js 就不再進 CHASE 分支，
//                             不會再呼叫 blockCommitRead
//   `c.enterTick < tick`   ——計畫剛建的那一 tick，ai.js 的
//                             `blockPlanTargetX` 首次建計畫時提前 return，
//                             同一 tick 不會落到下面呼叫 blockCommitRead
//                             的狀態機分支；下一 tick 才會
// outerLag：ai.js:1858 傳的是
//   `Math.round(reactionTicks(player) * BLOCK_COMMIT.OUTER_LAG_MUL)`；
//   `OUTER_LAG_MUL` 現值＝0（blockRead.js:162），乘積恆為 0——不必重建
//   `reactionTicks`（ai.js 私有函式，沒有 export）。下面用一個 runtime
//   assertion 釘住這個假設，這個值一旦改了會直接吵，不會悄悄量錯。
//
// 用法：node tools/vol5-block-read-probe.mjs [局數=300]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { isFrontRow, TEAM_SIDE } from '../src/sim/rotation.js';
import { blockCommitRead, BLOCK_COMMIT } from '../src/sim/blockRead.js';

if (BLOCK_COMMIT.OUTER_LAG_MUL !== 0) {
  throw new Error(
    `假設破裂：BLOCK_COMMIT.OUTER_LAG_MUL 現值＝${BLOCK_COMMIT.OUTER_LAG_MUL}（本檔寫死`
    + `假設它是 0，藉此繞開重建私有函式 reactionTicks()）。這個值已經不是 0 了，`
    + `outerLag 不能再放心傳 0——請先處理這裡（讓本檔真的算出 reactionTicks 或改用`
    + `別的取得路徑）再繼續跑，不要讓這個假設悄悄失真。`,
  );
}

const SEEDS = Number(process.argv[2] ?? process.env.VD_SEEDS ?? 300);
const PEEL_EPS = 1e-6;
const PEEL_GUARD = 16; // 前排最多 3-4 人，16 輪綽綽有餘，純粹防呆

// 把 blockCommitRead 真正看得到的候選 lz 清單「剝」出來（見檔頭①③說明）。
function peelCandidateLzList(game, atkTeam, opts) {
  const out = [];
  let ceiling = Infinity;
  let guard = 0;
  while (guard < PEEL_GUARD) {
    guard += 1;
    const k = { ...BLOCK_COMMIT, DEPTH_LZ: ceiling };
    const r = blockCommitRead(game, atkTeam, { ...opts, k });
    if (!r) break;
    out.push(r.depth);
    ceiling = r.depth - PEEL_EPS;
  }
  return out;
}

// 這一刻，ai.js 的 CHASE 狀態機真的會呼叫 blockCommitRead 的那些人（見檔頭「呼叫時機」）。
function chasingBlockers(game, ai, team) {
  const plan = ai.blockPlan;
  if (!plan || plan.team !== team) return [];
  const rot = game.match.rotations[team];
  const tick = game.tick;
  const out = [];
  for (const pid of Object.keys(plan.byPid)) {
    if (!isFrontRow(rot, pid)) continue;
    const c = plan.byPid[pid];
    if (c.cover === true) continue;
    if (c.jumpTick != null) continue;
    if (c.enterTick == null || c.enterTick >= tick) continue;
    out.push(pid);
  }
  return out;
}

function runSet(seed) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona: 'commit' } } });
  const ai = createAiState();

  const candCounts = []; // 每次真呼叫時，落在真實 DEPTH_LZ 內的候選數
  const candLzAll = []; // 每次呼叫剝出來的全部候選 lz（不論在不在範圍內）
  let baselineMismatch = 0;

  const routeResults = []; // { kind, minLz }：每條真實助跑在其時間窗內的最淺 lz
  let curFlight = null;
  let routeTrack = new Map(); // pid -> { kind, minLz }

  let curAttack = null; // { snap: { p, q, xp, xq } | null }
  const attackResults = []; // { xDiff: boolean }

  function flushRoutes() {
    for (const v of routeTrack.values()) routeResults.push(v);
    routeTrack = new Map();
  }
  function finalizeAttack(a) {
    if (a && a.snap) attackResults.push({ xDiff: Math.abs(a.snap.xp - a.snap.xq) > 1e-9 });
  }

  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'set_break' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    const tick = game.tick;

    // ---- ①③ 候選數／候選 lz：在 aiCollectIntents 之前，用同一快照真實呼叫 ----
    if (game.phase === 'rally' && r.possession === 'A') {
      const chasers = chasingBlockers(game, ai, 'B');
      for (const pid of chasers) {
        const opts = { passTier: ai.passTier ?? null, setterSpotLx: AI.SETTER_SPOT.lx, outerLag: 0 };
        // 對照組：完全不覆寫 k，逐值等於 ai.js 真正會拿到的那個結果
        const baseline = blockCommitRead(game, 'A', opts);
        const peeled = peelCandidateLzList(game, 'A', opts);
        const inRange = peeled.filter((lz) => lz <= BLOCK_COMMIT.DEPTH_LZ).length;
        if ((baseline == null) !== (inRange === 0)) baselineMismatch += 1;
        candCounts.push(inRange);
        for (const lz of peeled) candLzAll.push(lz);
      }
    }

    // ---- ④ 各 kind 的真實助跑窗內最淺 lz（獨立通道，見檔頭④說明）----
    if ((r?.flightId ?? null) !== curFlight) {
      flushRoutes();
      curFlight = r?.flightId ?? null;
    }
    if (ai.approach?.team === 'A' && ai.approach.routes) {
      for (const route of ai.approach.routes) {
        if (route.startTick == null || tick < route.startTick) continue;
        if (route.takeoffTick != null && tick > route.takeoffTick) continue;
        const actor = game.actors[route.pid];
        if (!actor) continue;
        const lz = TEAM_SIDE.A * actor.z;
        const cur = routeTrack.get(route.pid);
        if (!cur) routeTrack.set(route.pid, { kind: route.kind, minLz: lz });
        else if (lz < cur.minLz) cur.minLz = lz;
      }
    }

    const intents = aiCollectIntents(game, ai, []);

    // ---- ② 分歧率：aiCollectIntents 剛更新完決策，讀兩名上牆者自己的 x ----
    if (curAttack) {
      const plan = ai.blockPlan;
      if (plan && plan.team === 'B') {
        const rotB = game.match.rotations.B;
        const wall = Object.keys(plan.byPid)
          .filter((pid) => isFrontRow(rotB, pid) && plan.byPid[pid].cover !== true)
          .sort();
        if (wall.length >= 2) {
          const [p, q] = wall;
          curAttack.snap = { p, q, xp: plan.byPid[p].x, xq: plan.byPid[q].x };
        }
      }
    }

    const events = stepGame(game, intents);
    for (const e of events) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        finalizeAttack(curAttack);
        curAttack = { snap: null };
      } else if (curAttack && (
        (e.type === 'TOUCH' && e.team === 'B')
        || e.type === 'SCORE'
      )) {
        finalizeAttack(curAttack);
        curAttack = null;
      }
    }
  }
  finalizeAttack(curAttack);
  flushRoutes();

  return { candCounts, candLzAll, baselineMismatch, routeResults, attackResults };
}

// ============================================================================
// 統計
// ============================================================================
const q = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const sePct = (k, n) => (n ? 100 * Math.sqrt((k / n) * (1 - k / n) / n) : NaN);
const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '  n/a' : v.toFixed(d).padStart(6));

const all = { candCounts: [], candLzAll: [], baselineMismatch: 0, routeResults: [], attackResults: [] };
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const r = runSet(seed * 101 + 7);
  all.candCounts.push(...r.candCounts);
  all.candLzAll.push(...r.candLzAll);
  all.baselineMismatch += r.baselineMismatch;
  all.routeResults.push(...r.routeResults);
  all.attackResults.push(...r.attackResults);
}

console.log(`=== 卷五 攔網讀取基線（${SEEDS} 局，守方 B＝commit 人格）===`);
console.log(`現行 DEPTH_LZ ＝ ${BLOCK_COMMIT.DEPTH_LZ}（= APPROACH.left.lz + 0.1）\n`);

console.log('-- 自我一致性檢查（peel 技法 vs 真正未覆寫的一次呼叫）--');
console.log(`真實呼叫樣本數：${all.candCounts.length}`);
console.log(`baseline（未覆寫 k）null/非null 與 peel 算出的候選數=0/>=1 不一致次數：`
  + `${all.baselineMismatch}（應為 0，非 0 代表 peel 手法有 bug，下面數字不可信）\n`);

console.log('-- ① 候選數分佈（blockCommitRead 每次真被呼叫時，落在現行 DEPTH_LZ 內的候選數）--');
{
  const n = all.candCounts.length;
  const hist = {};
  for (const c of all.candCounts) hist[c] = (hist[c] ?? 0) + 1;
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    console.log(`  候選數=${k}：${hist[k]}／${n}　${fmt(100 * hist[k] / n, 2)}%`
      + ` ± ${fmt(sePct(hist[k], n), 2)}pp`);
  }
  const zero = hist[0] ?? 0;
  const one = hist[1] ?? 0;
  console.log(`  【複驗】候選數=1 佔比：${fmt(100 * one / n, 2)}%`
    + ` ± ${fmt(sePct(one, n), 2)}pp（n=${n}；舊基線 99.77%，見檔頭）`);
  console.log(`  候選數=0（讀不到任何人）佔比：${fmt(100 * zero / n, 2)}% ± ${fmt(sePct(zero, n), 2)}pp`);
}

console.log('\n-- ② 分歧率（同一 tick 兩名上牆者的委任 x 是否不同，逐 playerId 讀值）--');
{
  const n = all.attackResults.length;
  const k = all.attackResults.filter((a) => a.xDiff).length;
  console.log(`  可比對的攻擊波數（兩名上牆者都建了計畫）：${n}`);
  console.log(`  【複驗】分歧率：${fmt(100 * k / n, 2)}% ± ${fmt(sePct(k, n), 2)}pp`
    + `（n=${n}；舊基線 1.8%，見檔頭）`);
}

console.log('\n-- ③ 候選助跑起點 lz 分佈（p10/p50/p90，對照 DEPTH_LZ 現值）--');
{
  const n = all.candLzAll.length;
  const inRange = all.candLzAll.filter((lz) => lz <= BLOCK_COMMIT.DEPTH_LZ).length;
  console.log(`  樣本數（每次呼叫剝出的候選 lz，累計）：${n}`);
  console.log(`  p10 ${fmt(q(all.candLzAll, 0.1))}  p50 ${fmt(q(all.candLzAll, 0.5))}`
    + `  p90 ${fmt(q(all.candLzAll, 0.9))}  （DEPTH_LZ = ${BLOCK_COMMIT.DEPTH_LZ}）`);
  console.log(`  落在範圍內（lz ≤ DEPTH_LZ）：${fmt(100 * inRange / n, 2)}% ± ${fmt(sePct(inRange, n), 2)}pp`);
}

console.log('\n-- ④ 各 kind 進不進得了讀取範圍（獨立通道：真實助跑窗內最淺 lz vs DEPTH_LZ）--');
{
  const byKind = {};
  for (const rr of all.routeResults) {
    (byKind[rr.kind] ??= []).push(rr.minLz);
  }
  const kinds = Object.keys(byKind).sort();
  console.log('  kind          n    minLz p10/p50/p90       進得了範圍% ± SE');
  for (const kind of kinds) {
    const vals = byKind[kind];
    const n = vals.length;
    const inRange = vals.filter((lz) => lz <= BLOCK_COMMIT.DEPTH_LZ).length;
    console.log(`  ${kind.padEnd(12)} ${String(n).padStart(4)}  `
      + `${fmt(q(vals, 0.1))}/${fmt(q(vals, 0.5))}/${fmt(q(vals, 0.9))}   `
      + `${fmt(100 * inRange / n, 1)}% ± ${fmt(sePct(inRange, n), 1)}pp`);
  }
}
