// Phase 5 W1 §6 B1 攔網人格（read／commit）＋ B2 close 時間預算
//
// 驗收五條（工單 §6 驗收條件 2）：
//   ① 兩種人格在**同一輸入**下行為不同（站位／到位可量的差異）
//   ② commit 判錯要**真的被懲罰**（快攻沒來時，中間攔網手到位率明顯較差）
//   ③ ★不得讀 attackerId——有人偷讀就轉紅（靜態掃描，含 ai.js 的 B1-SCAN 區）
//   ④ B2 不得瞬移：任何攔網手的單 tick 位移不得超過該球員的移動能力
//   ⑤ 決定論：同 seed 逐值相同
// 外加一條回歸閘：未注入 blockPersona（我方／快速比賽／既有測試）行為與 read **逐值相同**
//   ——B1 對既有隊伍零變化的證據。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { blockCommitRead, blockCloseBudget, BLOCK_PERSONA } from '../src/sim/blockRead.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { moveSpeed, blockReach, blockTopEdge, standingReach } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { SIM_DT } from '../src/sim/constants.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');

// ---- 共用治具：全 AI 跑一局，逐 tick 記錄 B 隊前排座標與每次 A 攻擊的攔網結果 ----
function frontRowOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.filter((id) => isFrontRow(rot, id));
}
function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

// persona=null＝不注入 aiProfiles（回歸閘用）
function runSet(seed, persona) {
  const game = createGame({
    seed,
    setTarget: 25,
    ...(persona ? { aiProfiles: { B: { blockPersona: persona } } } : {}),
  });
  const ai = createAiState();
  const mbX = [];          // B 隊 MB 的逐 tick x（人格差異／決定論比對用）
  const hops = [];         // B 隊前排的單 tick 位移（瞬移檢查）
  const attacks = [];      // 每次 A 攻擊：{ kind, mbGap }
  let pending = null;
  let guard = 0;
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    if (game.phase === 'rally' && r.possession === 'A' && r.touches === 3
      && r.profile === 'spike' && !pending && ai.attackKind) {
      pending = { kind: ai.attackKind };
    }
    const before = frontRowOf(game, 'B').map((id) => ({
      id, x: game.actors[id].x, z: game.actors[id].z,
    }));
    const zBefore = game.ball.z;
    const phaseBefore = game.phase;
    const events = stepGame(game, aiCollectIntents(game, ai, []));
    // 只量 rally 中的位移：死球後的輪轉歸位是既有的「瞬移回位不做插值拖影」
    // （game.js:1395），與攔網走位無關
    if (phaseBefore === 'rally' && game.phase === 'rally') {
      for (const b of before) {
        const a = game.actors[b.id];
        hops.push({ id: b.id, d: Math.hypot(a.x - b.x, a.z - b.z) });
      }
    }
    const mb = mbOf(game, 'B');
    mbX.push(mb ? game.actors[mb].x : null);
    if (pending && zBefore > 0 && game.ball.z <= 0 && mb) {
      pending.mbGap = Math.abs(game.actors[mb].x - game.ball.x);
    }
    if (pending && (events.some((e) => e.type === 'DEAD_BALL') || r.possession !== 'A'
      || r.profile !== 'spike')) {
      if (pending.mbGap != null) attacks.push(pending);
      pending = null;
    }
  }
  return { mbX, hops, attacks, game };
}

const WING = new Set(['left', 'right']);
function inReachRate(attacks, pred) {
  const g = attacks.filter((a) => pred(a.kind));
  if (!g.length) return null;
  return g.filter((a) => a.mbGap <= TUNING.BLOCK_REACH_X).length / g.length;
}
// 07-29（§5 A2 交叉上線後）：本量原為**中位數**，但 left 的離球距離是雙峰分佈
// （n≈460：p25=0.03／med=0.06／p75=0.43），混合樣本的中位數正好落在雙峰之間的
// 斷崖上——WING 內 left/right 的比例一動（交叉只從 left 分流），中位數就整個跳掉。
// 實測穩定度（read/commit 比值，交叉後／交叉前）：
//   med  6 種子 1.04／1.72　12 種子 1.34／4.06　18 種子 1.28／2.52   ← 亂跳
//   p75  6 種子 1.23／1.33　12 種子 1.72／1.70　18 種子 1.68／1.68   ← 穩
// 故改量 p75（同一個「離球距離」，換一個不踩斷崖的分位數），**門檻 1.5 未動**，
// 且交叉前的程式碼用 p75 一樣通過（1.70）＝不是為了讓新實作過關而換的尺。
function gapQuantile(attacks, pred, p = 0.75) {
  const g = attacks.filter((a) => pred(a.kind)).map((a) => a.mbGap).sort((x, y) => x - y);
  return g.length ? g[Math.min(g.length - 1, Math.floor(g.length * p))] : null;
}

// 07-29（§5 A2 交叉上線後補樣本，**斷言與統計量一格未動、原本的 6 個種子一個未換**）：
// medianGap 量的是 left＋right 混合樣本的中位數，而 left 的分佈是雙峰
// （n=305：p25=0.03／med=0.06／p75=0.43）——混合比例一動，中位數就在雙峰的斷崖上跳。
// 交叉只從 left 分流（right 不動），WING 內的 left 佔比 71%→66%，於是 6 個種子
// （n≈104）的混合中位數從 0.10 跳到 0.34，把 read 與 commit 的差吃掉。
// 逐線量測證明**行為沒變**（n≈460：left read 0.06／commit 0.20、right read 0.35／
// commit 0.58，與交叉上線前的 0.07／0.17、0.41／0.58 同一組數字），
// 差的只是樣本量。加到 12 個種子後，交叉前（medRatio 4.06）與交叉後（1.86）都通過。
const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010, 1111, 1212];
const armRead = SEEDS.map((s) => runSet(s, BLOCK_PERSONA.READ));
const armCommit = SEEDS.map((s) => runSet(s, BLOCK_PERSONA.COMMIT));
const flat = (arm) => arm.flatMap((r) => r.attacks);

// ---------------- ① 同一輸入下兩種人格行為不同 ----------------
test('B1：read 與 commit 在同一 seed／同一組球員下，中間攔網手的走位明顯不同', () => {
  let diffTicks = 0;
  let maxDiff = 0;
  for (let i = 0; i < SEEDS.length; i += 1) {
    const a = armRead[i].mbX;
    const b = armCommit[i].mbX;
    const n = Math.min(a.length, b.length);
    for (let t = 0; t < n; t += 1) {
      if (a[t] == null || b[t] == null) continue;
      const d = Math.abs(a[t] - b[t]);
      if (d > 1e-9) diffTicks += 1;
      if (d > maxDiff) maxDiff = d;
    }
  }
  assert.ok(diffTicks > 500, `兩種人格的走位幾乎相同（差異 tick 僅 ${diffTicks}）＝人格沒做出來`);
  assert.ok(maxDiff > 1.5, `兩種人格的站位最大差僅 ${maxDiff.toFixed(2)}m＝差異不可感`);
});

// ---------------- ② commit 判錯要真的被懲罰 ----------------
test('B1：快攻沒來（兩翼高球）時，commit 的中間攔網手到位率明顯較差', () => {
  const readIn = inReachRate(flat(armRead), (k) => WING.has(k));
  const commitIn = inReachRate(flat(armCommit), (k) => WING.has(k));
  const readGap = gapQuantile(flat(armRead), (k) => WING.has(k));
  const commitGap = gapQuantile(flat(armCommit), (k) => WING.has(k));
  assert.ok(readIn != null && commitIn != null, '兩翼攻擊樣本不足');
  assert.ok(
    readIn - commitIn >= 0.05,
    `commit 的邊線到位率沒有明顯較差：read ${(readIn * 100).toFixed(1)}% vs `
    + `commit ${(commitIn * 100).toFixed(1)}%`,
  );
  // E-1 補回（2026-07-30 補償階段拍板＝構造乙 p75 座標；convergence §5.12）：
  // k ＝ (commit p75 2.051 − 2×合併SD 0.465) ÷ read p75 0.659 ＝ 1.701，
  // 用收斂後 40 局實測反解（E-2 條文 n=40；分離 2.374 SD ≥2 ⇒ 可補回）。
  // 取代 v2 的 ×1.5（對壞現值反推，裁定書 §五 判 (d) 廢止、E-1 為出場條件）。
  assert.ok(
    commitGap > readGap * 1.701,
    `commit 的中間攔網手離球距離（p75）沒有明顯較遠：read ${readGap.toFixed(2)}m vs `
    + `commit ${commitGap.toFixed(2)}m`,
  );
});

// ---------------- ③ ★不得讀 attackerId ----------------
// 註解裡寫到「不得讀 attackerId」是允許的，程式碼中出現才算偷讀：
// 逐行剝掉行註解後再掃（本專案不用區塊註解）。
//
// ★先正規化行尾再剝★：JS 正則的 `.` 不匹配 `\r`（它是行終止符）、`$` 也不錨在 `\r` 前面，
// 所以 `//\s*attackerId...\r` 這種 CRLF 行會整條剝不掉，護欄就會把註解裡的字誤判成偷讀。
// 這正是 2026-07-29 抓到的 repo 級缺陷（.gitattributes 是根因解，這裡是護欄自身的防線）。
// 匯出到模組層是為了讓下面那條「護欄的護欄」測試能直接餵 CRLF 樣本驗它。
export const stripComments = (src) => src
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');

test('B1 反作弊：攔網判讀路徑（B1-SCAN 區）零 attackerId', () => {
  const stripped = stripComments;
  const regions = [];
  for (const f of ['blockRead.js', 'ai.js']) {
    const src = readFileSync(join(SRC, f), 'utf8');
    // 從 BEGIN 標記那一行的行尾開始擷取（標記自己的說明文字裡就寫著 attackerId）
    const hits = [...src.matchAll(/B1-SCAN-BEGIN[^\n]*\n([\s\S]*?)B1-SCAN-END/g)];
    assert.ok(hits.length > 0, `${f} 的 B1-SCAN 掃描區被移除或改名`);
    for (const h of hits) regions.push({ f, body: h[1] });
  }
  // blockRead.js 1 段（B1／B2 純函式家）＋ ai.js 2 段（決策分支＋狀態機）
  assert.ok(regions.length >= 3, `B1-SCAN 掃描區數量異常（${regions.length}，應 ≥3）`);
  for (const r of regions) {
    assert.ok(
      !/attackerId/.test(stripped(r.body)),
      `${r.f} 的 B1-SCAN 區出現 attackerId＝攔網判讀作弊`,
    );
  }
  // 保證線本身：blockCommitRead 的簽章只吃「攻方隊伍代號」，拿不到任何球員 id
  const blockSrc = readFileSync(join(SRC, 'blockRead.js'), 'utf8');
  assert.ok(
    /export function blockCommitRead\(game, atkTeam, opts = \{\}\)/.test(blockSrc),
    'blockCommitRead 的簽章被改動——反作弊保證線失效',
  );
});

// ---------------- ③' 護欄的護欄：剝註解不得受行尾影響 ----------------
// 為什麼要有這條：③ 的護欄在 CRLF 工作區下曾整條失效，而它失效的樣子是「轉紅」，
// 看起來像有人作弊、實際上是行尾。護欄自己沒有護欄，下一次還會被當成真 bug 追。
test("B1 護欄的護欄：剝註解對 CRLF／CR／LF 三種行尾結果相同", () => {
  const lf = [
    'const x = 1;',
    '// 這行註解裡寫到 attackerId 是允許的',
    'const y = 2; // 行尾註解也提到 attackerId',
    'const z = 3;',
  ].join('\n');
  const crlf = lf.replace(/\n/g, '\r\n');
  const cr = lf.replace(/\n/g, '\r');

  // 三種行尾剝完之後必須逐字相同（也就是行尾不再是變因）
  const want = stripComments(lf);
  assert.equal(stripComments(crlf), want, 'CRLF 剝註解結果與 LF 不同');
  assert.equal(stripComments(cr), want, 'CR 剝註解結果與 LF 不同');

  // 而且真的要剝乾淨——這才是護欄的實質：註解裡的 attackerId 不算偷讀
  assert.ok(!/attackerId/.test(want), 'LF 樣本沒剝乾淨');
  assert.ok(!/attackerId/.test(stripComments(crlf)), 'CRLF 樣本沒剝乾淨（就是 07-29 的缺陷）');

  // 反向護欄：程式碼中真的出現才該被抓到，不論行尾
  const cheat = 'const id = rally.attackerId;\r\n// 註解\r\n';
  assert.ok(/attackerId/.test(stripComments(cheat)), '剝過頭：真的偷讀也被剝掉了');
});

// ---------------- ④ B2 不得瞬移 ----------------
test('B2：commit 的攔網手單 tick 位移不得超過該球員的移動能力（無瞬移補位）', () => {
  // 唯一的合法超額來源＝隊友分離推擠（game.js separateTeammates：
  // SEP_PUSH 0.08 × hypot(1, SEP_SLIDE 0.6) ≈ 0.0933／對），與走位決策無關
  const SEP_ALLOWANCE = 0.0933;
  const excessOf = (arm) => {
    let max = 0;
    for (const { hops, game } of arm) {
      for (const h of hops) {
        const e = h.d - moveSpeed(game.players[h.id]) * SIM_DT;
        if (e > max) max = e;
      }
    }
    return max;
  };
  const commitExcess = excessOf(armCommit);
  const readExcess = excessOf(armRead);
  assert.ok(
    commitExcess <= SEP_ALLOWANCE,
    `commit 臂的單 tick 位移超出步長 ${commitExcess.toFixed(4)}m（>分離推擠上限）＝有瞬移`,
  );
  // B1／B2 沒有引進任何新的位移來源：commit 的超額不得比 read 多出一個推擠量
  assert.ok(
    commitExcess <= readExcess + SEP_ALLOWANCE,
    `commit 臂比 read 臂多出額外位移來源（${commitExcess.toFixed(4)} vs ${readExcess.toFixed(4)}）`,
  );
});

// ---------------- ⑤ 決定論 ----------------
test('B1：同 seed 兩次逐值相同（人格與 commit 鎖定狀態皆納入）', () => {
  for (const persona of [BLOCK_PERSONA.READ, BLOCK_PERSONA.COMMIT]) {
    const a = runSet(707, persona);
    const b = runSet(707, persona);
    assert.deepEqual(a.mbX, b.mbX, `${persona} 人格的走位不決定論`);
    assert.deepEqual(a.attacks, b.attacks, `${persona} 人格的攔網結果不決定論`);
  }
});

// ---------------- 回歸閘：預設＝read＝本輪之前的行為 ----------------
test('B1 回歸閘：未注入 blockPersona 的比賽與 read 人格逐值相同（既有隊伍零變化）', () => {
  const none = runSet(808, null);
  const read = runSet(808, BLOCK_PERSONA.READ);
  assert.deepEqual(none.mbX, read.mbX);
  assert.deepEqual(none.attacks, read.attacks);
});

// ---------------- 純函式單測 ----------------
test('blockCommitRead：一傳沒到位（快攻不在池裡）＝沒有 commit 標的', () => {
  const game = createGame({ seed: 5 });
  game.phase = 'rally';
  game.rally.possession = 'A';
  game.rally.touches = 1;
  // 把 A 的前排 MB 推進到職責線內、且本 tick 朝網移動
  const rot = game.match.rotations.A;
  const mb = rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle');
  game.actors[mb].pz = 2.6;
  game.actors[mb].z = 2.0;
  game.ball.x = 8; // 球離所有人都遠＝不誤判追球者
  game.ball.z = 8;
  assert.ok(blockCommitRead(game, 'A', { passTier: 'perfect' }), '一傳到位時應讀得到快攻');
  assert.equal(blockCommitRead(game, 'A', { passTier: 'ok' }), null);
  assert.equal(blockCommitRead(game, 'A', { passTier: 'poor' }), null);
});

test('blockCloseBudget：追得到／追不到由時間預算決定，且不預測就一律去追', () => {
  const stepM = 0.075; // ≈ 4.5 m/s
  assert.equal(blockCloseBudget({ fromX: 0, toX: 1, stepM, ticksLeft: 30 }).canClose, true);
  assert.equal(blockCloseBudget({ fromX: 0, toX: 3, stepM, ticksLeft: 20 }).canClose, false);
  assert.equal(blockCloseBudget({ fromX: 0, toX: 3, stepM, ticksLeft: null }).canClose, true);
  assert.equal(blockCloseBudget({ fromX: 0, toX: 3, stepM: 0, ticksLeft: 99 }).canClose, false);
});

// ---------------- 回歸閘：read 對快攻的「預測偏晚」不得消失 ----------------
//
// ★ 為什麼要這條（v4 裁定書主題「甲」的附帶工作項，2026-07-30 Sawmah 拍板）★
// read 的起跳時鐘改吃球的預測擊球 tick（前置量 0）之後，R4 第 3 款
//（read×快攻 的頂邊完成度明顯低於 commit×快攻＝賭局存在的證明）**是靠一個偏誤撐著的**：
//   `predictContactPoint` 對快攻有系統性偏晚（實測 +7～+9 tick，sd 0.76），
//   而快攻「擊球→過網」的飛行段只有 6 tick 左右（實測 p50 6）。
//   偏晚 > 飛行段 ⇒ read 在球過網之後才離地 ⇒ 對快攻來不及 ⇒ 款 3 成立。
// ⇒ **任何日後改善擊球點預測精度的改動，都會打穿款 3**，而那不會讓任何現有測試轉紅。
//   這條就是那個警報器：偏晚掉到快攻飛行段（≈6 tick）以下就轉紅，強迫重看款 3。
//
// 量法：直接讀 sim 自己鎖存的那個值——`aiState.blockPlan.jumpAt` ＝ read 在
// 「二傳觸球＋反應延遲」那一刻算出並鎖存的預測擊球 tick（前置量 0 ⇒ 兩者相等）。
// 不重算、不另外呼叫 predictContactPoint，量的就是 sim 真的拿去用的數字。
// ==== §十-4 收卷追加（07-31）：款 3 的**離地率**警報器 ====
// 教訓：下面那條 B1 回歸閘守的是時序鏈（預測偏晚>飛行段），§十-4 驗收時它全程綠、
// 表 E 的快攻 G% margin 卻「翻轉」了——後經 160 局重測證明 G% margin 在基準版只有
// +0.5±2.1pp＝**空載體**（該指標已退役，紀錄見 kickoff §六.6）。款 3 的真載體是
// 「read 不對快攻賭」＝離地率 gap：read 快攻離地率 ≪ commit（40 局實測 19.8% vs
// 32.4%）。本閘直接守它：口徑抄自 tools/phase5-block-jumpcount-probe.mjs:64-148
//（離開地板＝球過網 tick 時頂邊完成度 > 自身站立地板），固定 seeds 決定論不 flaky。
// 注意取樣語意（與探針嚴格一致，實測對照過）：row 在 DEAD_BALL 才落帳，途中被防起
// 再組織的攻擊會被下一次 set 觸球覆蓋 ⇒ 每個 rally 只記「最後一次攻擊」。改成
// 每次過網都記會混入不同母體（差 +19pp，07-31 對照實測）。
function quickAirShare(persona, sets) {
  let above = 0;
  let total = 0;
  for (let s = 1; s <= sets; s += 1) {
    const game = createGame({ seed: s * 101, setTarget: 25, aiProfiles: { B: { blockPersona: persona } } });
    const ai = createAiState();
    let cur = null;
    let guard = 0;
    const settle = () => {
      if (cur && cur.kind === 'quick' && cur.crossTick != null) {
        total += 1;
        if (cur.topPct != null && cur.floorPct != null && cur.topPct > cur.floorPct) above += 1;
      }
    };
    while (game.phase !== 'set_over' && guard < 400000) {
      guard += 1;
      const zBefore = game.ball.z;
      const ev = stepGame(game, aiCollectIntents(game, ai, []));
      for (const e of ev) {
        if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
          const rot = game.match.rotations.B;
          const mb = rot.find((id) => isFrontRow(rot, id)
            && game.players[id].currentRole === 'middle') ?? null;
          cur = mb ? { mb, kind: null, crossTick: null, topPct: null, floorPct: null } : null;
        }
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur && cur.kind == null) {
          cur.kind = ai.attackKind;
        }
        if (e.type === 'DEAD_BALL') {
          settle();
          cur = null;
        }
      }
      if (!cur) continue;
      if (cur.crossTick == null && zBefore > 0 && game.ball.z <= 0) {
        cur.crossTick = game.tick;
        const a = game.actors[cur.mb];
        const p = game.players[cur.mb];
        const jumpMul = staminaPerfMul(game, p);
        const inWin = a.blockUntil >= game.tick;
        const t = inWin ? game.tick - a.blockStartTick : null;
        const apex = blockReach(p, jumpMul);
        cur.topPct = apex > 0 && t != null ? blockTopEdge(p, t, jumpMul) / apex : null;
        cur.floorPct = apex > 0 ? standingReach(p) / apex : null;
      }
    }
  }
  return { share: total ? (above / total) * 100 : NaN, n: total };
}

test('款3 離地率警報器：read 對快攻的離地率須明顯低於 commit（真載體）', () => {
  // §十-4b（07-31）工作點註記：意圖層（tool/retract/press）把 gap 從 ~+14.4 收窄到
  // +8.5pp@40局（歸因消融 tools/t10-4b-alarm-ablation.mjs：tool 壓縮 commit −9pp、
  // retract 反向 +4.5pp；40/20/12 局＝8.5/7.8/6.0 全過門檻＝載體活著非翻轉）。
  // 原 8 局在新工作點的 gap 量測是 −1.7pp＝樣本解析力不足（02 §6.1 條5），
  // 樣本加大到 40 局（~14s）讓警報器量得動自己的門檻；門檻 5pp 一格未動。
  const SETS = 40;
  const read = quickAirShare('read', SETS);
  const commit = quickAirShare('commit', SETS);
  assert.ok(read.n >= 30 && commit.n >= 30,
    `樣本足夠（read n=${read.n} / commit n=${commit.n}，門檻各 30）`);
  const gap = commit.share - read.share;
  // 跌破 5pp＝read 開始對快攻賭＝款 3 行為載體弱化，必須回頭重看 R4 款 3
  assert.ok(gap >= 5,
    `commit 離地率 ${commit.share.toFixed(1)}% − read ${read.share.toFixed(1)}% = ${gap.toFixed(1)}pp < 5pp`
    + '＝「read 不對快攻賭」的行為載體弱化，回頭重看 R4 款 3');
});

test('B1 回歸閘：read 對快攻的預測擊球 tick 仍偏晚（款 3 的載體不得消失）', () => {
  // 取樣到量（07-30 補償階段，同段 1 裁定 ④／jump-set 先例）：S1 後快攻只活在
  // perfect 檔（87%），3 局語料的快攻樣本掉到 16<20 ⇒ seed 依 k×101 順延、收滿
  // 20 為止、安全上限 8 局；樣本門檻 20 與中位數門檻 6 tick 一格未動。
  const lateness = [];
  for (let k = 1; k <= 8 && lateness.length < 20; k += 1) {
    const seed = k * 101;
    const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona: 'read' } } });
    const ai = createAiState();
    let cur = null;
    let guard = 0;
    while (game.phase !== 'set_over' && guard < 400000) {
      guard += 1;
      const intents = aiCollectIntents(game, ai, []);
      // 攔網分工卷 step1（07-31）：計畫拆成 per-blocker 後，「建計畫那一刻鎖存的值」
      // 住在團隊級的 `template`（建計畫仍是單一事件）——量的是同一個數字，逐值不變
      const plan = ai.blockPlan?.team === 'B' ? ai.blockPlan.template : null;
      if (cur && plan && plan.jumpAt != null
        && plan.enterTick === game.tick) cur.jumpAt = plan.jumpAt;
      for (const e of stepGame(game, intents)) {
        if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A' && e.touches === 2) {
          cur = { jumpAt: null };
        }
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A' && cur) {
          if (cur.jumpAt != null && ai.attackKind === 'quick') {
            lateness.push(cur.jumpAt - game.tick);
          }
          cur = null;
        }
        if (e.type === 'DEAD_BALL') cur = null;
      }
    }
  }
  assert.ok(lateness.length >= 20, `樣本足夠（${lateness.length}）`);
  const med = [...lateness].sort((a, b) => a - b)[Math.floor(lateness.length / 2)];
  // 門檻 6 ＝ 快攻「擊球→過網」飛行段的實測中位數（tools/phase5-block-nettick-probe.mjs）。
  // 偏晚一旦低於它，read 就會在球過網前離地 ⇒ 款 3 翻轉。實測中位數為 8，餘裕 2 tick。
  assert.ok(med >= 6, `read 對快攻的預測偏晚中位數＝${med} tick，低於快攻飛行段 6 tick`
    + '＝款 3（read×快攻 明顯低於 commit×快攻）的載體已消失，必須回頭重看 R4 第 3 款');
});
