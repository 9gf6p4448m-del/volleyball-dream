// 叫戰術重做卷 段 1 —— 「他不跑會怎樣」（Sawmah 2026-08-01 裁定 1A／1B／1C）
//
// 本檔守的五件事：
//   ① 裁定 1C 早訊號：承諾 tick（route.startTick）到了還沒進助跑線＝不跑
//      → S 當場把他從攻擊池拿掉、改給別人（裁定 1A）
//   ② 「進助跑線」只認兩種，兩種都要有**不改組織**的正例（就位／朝網推進）
//      ——只有一側樣本的閘等於沒有閘
//   ③ ★護欄 C★ 只對受控玩家（excludeIds）生效：AI 隊友沒跑自己的線是既有行為
//      （他去接球／補位），拿它觸發改判會把既有平衡打爛。這條的機械驗收另有
//      `node tools/sim-hash-probe.mjs`（AI vs AI 必須逐值相同），本檔守的是單點斷言
//   ④ ★護欄 D★ 裁定 1B 零懲罰：不跑不扣任何 trust（trust.fromSetter 與 state.trustDyn
//      逐值不變）。釘死是為了防日後有人「順手」補上懲罰
//   ⑤ 一波只改一次：連跑多 tick 不得重複改組織
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { localToWorld, TEAM_SIDE } from '../src/sim/rotation.js';
import { BLOCK_COMMIT } from '../src/sim/blockRead.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// 凍結輸入的單一規劃點（範式抄 tests/called-play.test.mjs 的 planWith）：
// 只跑一次協調層把變因按住，之後手動推 tick／擺人再跑第二次。
// **規劃這一次刻意不帶 excludeIds**——ensureFlightPlan 根本不吃它，帶不帶規劃結果
// 逐值相同；不帶才能讓「判定時刻」完全由測試決定，不被規劃那一 tick 偷跑掉。
function planWith({ seed = 3, flightId = 1, rot = 0 } = {}) {
  const g = createGame({ seed });
  const base = g.match.rotations.A.slice();
  g.match.rotations.A = [...base.slice(rot), ...base.slice(0, rot)];
  const ai = createAiState();
  g.phase = 'rally';
  Object.assign(g.rally, {
    flightId, profile: 'arc', possession: 'A', touches: 1,
    lastTouchTeam: 'A', lastToucherId: null, touchLockTick: -1,
  });
  const w = localToWorld('A', 1.2, 1.2);
  const b = g.ball;
  b.x = w.x; b.y = 3.0; b.z = w.z; b.vx = 0; b.vy = 0.5; b.vz = 0;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  aiCollectIntents(g, ai);
  return { g, ai };
}

const routeOf = (ai, pid) => (ai.approach?.routes ?? []).find((r) => r.pid === pid) ?? null;
const SIDE = TEAM_SIDE.A;

// 三種擺法（世界座標；A 隊 side=+1，網在 z=0）
// ⓐ 就位：站在自己的助跑起點上
const placeAtStart = (actor, route) => {
  actor.x = route.start.x; actor.z = route.start.z;
  actor.px = actor.x; actor.pz = actor.z;
};
// ⓑ 朝網推進：**刻意站在離起點很遠的地方**（否則過關的是 ⓐ、ⓑ 沒被驗到），
// 但這一 tick 的位移是朝網的（pz 比 z 更遠離網）
const placeClosing = (actor) => {
  actor.x = 0; actor.z = SIDE * 2.0;
  actor.px = 0; actor.pz = SIDE * 2.5;
};
// ⓒ 不跑：離起點遠，且這一 tick 原地不動（位移 0＝沒有朝網推進）
const placeIdle = (actor) => {
  actor.x = 0; actor.z = SIDE * 2.0;
  actor.px = actor.x; actor.pz = actor.z;
};

// 找一個「受控玩家＝本波攻擊手、且他的承諾 tick 還在未來」的規劃點。
// 優先取「讓他不跑真的改得成組織」的那一組；一組都沒有時**退回只滿足前提的那一組**。
//
// ★ 退路是刻意的（鑑別力，harness 02 §6.1 第 1 條）★ 沒有退路的話，在**修改前的
// 程式碼**上這支函式會回 null，底下每一支測試都炸在 `Cannot destructure 'cfg' of null`
// ——那是旁枝錯誤，不是行為斷言，等於這批測試證明不了「紅是因為功能不存在」。
// 有退路，舊碼上每一支測試都跑得到自己那句 assert，紅在行為上。
function findCase() {
  let fallback = null;
  for (let seed = 1; seed <= 12; seed += 1) {
    for (let rot = 0; rot < 6; rot += 1) {
      for (let f = 1; f <= 40; f += 1) {
        const probe = planWith({ seed, flightId: f, rot });
        const pid = probe.ai.attackerId;
        const route = pid ? routeOf(probe.ai, pid) : null;
        if (!route || route.startTick == null || route.startTick <= probe.g.tick) continue;
        const cfg = { seed, flightId: f, rot };
        const found = { cfg, pid, startTick: route.startTick };
        if (!fallback) fallback = found;
        const { g, ai } = planWith(cfg);
        g.tick = route.startTick;
        placeIdle(g.actors[pid]);
        aiCollectIntents(g, ai, [pid]);
        if (ai.attackerId && ai.attackerId !== pid) return found;
      }
    }
  }
  return fallback;
}

const CASE = findCase();

// 記帳存取一律走這裡：舊碼上 `aiState.routeCommit` 根本不存在，直接 `.entries`
// 會炸成 TypeError（旁枝錯誤）；先斷言「有沒有記帳」才是行為斷言
function commitEntry(ai, pid) {
  assert.ok(ai.routeCommit, '本波沒有任何「跑不跑」記帳（裁定 E 的記帳欄位不存在）');
  return ai.routeCommit.entries.find((x) => x.pid === pid) ?? null;
}

test('樣本存在：找得到「受控攻擊手＋承諾 tick 在未來」的規劃點（找不到＝整卷的閘恆假）', () => {
  assert.ok(CASE, '掃過 12 seeds × 6 輪轉 × 40 flight 都找不到樣本');
});

// ---------------- ① 裁定 1A：不跑 → S 改給別人 ----------------

test('① 承諾 tick 沒進助跑線 → 攻擊手被改成別人，且他真的被拿出攻擊池', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const before = {
    attackerId: ai.attackerId,
    approach: structuredClone(ai.approach),
    combo: structuredClone(ai.attackCombo ?? null),
  };
  assert.equal(before.attackerId, pid, '樣本前提壞了：受控者本來就不是攻擊手');
  g.tick = startTick;
  placeIdle(g.actors[pid]);
  aiCollectIntents(g, ai, [pid]);

  assert.notEqual(ai.attackerId, pid, '受控者不跑，S 卻還是把球交給他');
  assert.ok(ai.attackerId, '改組織之後沒有攻擊手＝這一波沒人打');
  assert.equal(routeOf(ai, pid), null, '不跑的人還留在助跑線表裡＝沒被拿出攻擊池');
  // 重建的機械證明：整份 approach 換了，不是只改一個標籤
  assert.notDeepEqual(ai.approach, before.approach, 'attackerId 換了但 approach 沒重建');
  // setTick 是本波的時間錨點，改組織不得重算（重算＝助跑時序整組平移）
  assert.equal(ai.approach.setTick, before.approach.setTick, '改組織動到了 setTick 錨點');
  // 新攻擊手的線與寫回後的池同源（二傳瞄的落點＝該人助跑的終點）
  assert.equal(routeOf(ai, ai.attackerId)?.kind, ai.attackKind);
  // 記帳（裁定 1E 供下一段的組合獎金消費）
  const e = commitEntry(ai, pid);
  assert.equal(e?.ran, false, '記帳沒記到「他沒跑」');
  assert.equal(e.jumped, false);
  assert.equal(ai.routeCommit?.replanned, true, `一波只改一次的旗標沒立起來`);
});

// ---------------- ② 「進助跑線」的兩種認定：都不得改組織 ----------------

test('② ⓐ 就位（離起點 0.3m 內）→ 不改組織', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const before = {
    attackerId: ai.attackerId,
    approach: structuredClone(ai.approach),
    combo: structuredClone(ai.attackCombo ?? null),
  };
  g.tick = startTick;
  placeAtStart(g.actors[pid], routeOf(ai, pid));
  aiCollectIntents(g, ai, [pid]);

  assert.equal(ai.attackerId, before.attackerId, '人就位在起點上卻被判不跑');
  assert.deepEqual(ai.approach, before.approach, '沒改組織卻動了助跑線');
  assert.deepEqual(ai.attackCombo ?? null, before.combo);
  assert.equal(commitEntry(ai, pid)?.ran, true);
  assert.equal(ai.routeCommit?.replanned ?? false, false);
});

test('② ⓑ 正朝網推進（離起點很遠）→ 不改組織', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const before = { attackerId: ai.attackerId, approach: structuredClone(ai.approach) };
  const route = routeOf(ai, pid);
  g.tick = startTick;
  const a = g.actors[pid];
  placeClosing(a);
  // 非恆真保證：這個位置真的**不**符合判準ⓐ，所以過關的只可能是ⓑ
  assert.ok(Math.hypot(route.start.x - a.x, route.start.z - a.z) > AI.AT_START_M,
    'ⓑ 的樣本擺得太靠近起點＝實際過關的是ⓐ，ⓑ 根本沒被驗到');
  assert.ok((SIDE * a.pz) - (SIDE * a.z) > BLOCK_COMMIT.APPROACH_EPS, '樣本沒有朝網推進');
  aiCollectIntents(g, ai, [pid]);

  assert.equal(ai.attackerId, before.attackerId, '人正在朝網助跑卻被判不跑');
  assert.deepEqual(ai.approach, before.approach);
  assert.equal(commitEntry(ai, pid)?.ran, true);
});

test('② 同一組擺法在**承諾 tick 之前**一律不判（早訊號不得提前開槍）', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const before = structuredClone(ai.approach);
  g.tick = startTick - 1;
  placeIdle(g.actors[pid]);
  aiCollectIntents(g, ai, [pid]);
  assert.equal(ai.attackerId, pid, '還沒到承諾 tick 就把人換掉');
  assert.deepEqual(ai.approach, before);
  assert.equal(commitEntry(ai, pid)?.ran ?? null, null,
    '承諾 tick 未到卻已經下了判定');
});

// ---------------- ③ 護欄 C：只對受控玩家生效 ----------------

test('③ ★護欄 C★ AI 隊友沒跑自己的線 → 一格不改（他是去接球／補位，不是決定不跑）', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const before = {
    attackerId: ai.attackerId,
    approach: structuredClone(ai.approach),
    combo: structuredClone(ai.attackCombo ?? null),
  };
  g.tick = startTick;
  placeIdle(g.actors[pid]); // 同一個人、同一個擺法——差別只在他不在 excludeIds 裡
  aiCollectIntents(g, ai, []); // ← 沒有受控玩家＝AI vs AI

  assert.equal(ai.attackerId, before.attackerId, 'AI 沒跑就改組織＝既有平衡會被打爛');
  assert.deepEqual(ai.approach, before.approach);
  assert.deepEqual(ai.attackCombo ?? null, before.combo);
  assert.equal(ai.routeCommit ?? null, null, 'AI vs AI 不該產生任何記帳（sim-hash 的護欄）');
});

test('③ 受控者是別人時，沒跑的那個 AI 一樣不被檢查', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const other = g.match.rotations.A.find((id) => id !== pid && routeOf(ai, id));
  assert.ok(other, '找不到第二條線＝這個斷言沒有標的');
  const before = { attackerId: ai.attackerId, approach: structuredClone(ai.approach) };
  g.tick = startTick;
  placeIdle(g.actors[pid]);          // 攻擊手（AI）沒跑
  placeAtStart(g.actors[other], routeOf(ai, other)); // 受控者自己乖乖就位
  aiCollectIntents(g, ai, [other]);

  assert.equal(ai.attackerId, before.attackerId);
  assert.deepEqual(ai.approach, before.approach);
  assert.equal(ai.routeCommit?.entries.some((x) => x.pid === pid) ?? false, false,
    '非受控玩家被記進了帳＝護欄 C 漏了');
});

// ---------------- ④ 護欄 D：裁定 1B 零懲罰 ----------------

test('④ ★護欄 D★ 不跑之後 trust.fromSetter 與 state.trustDyn 逐值不變（零懲罰）', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const trustBefore = Object.fromEntries(
    Object.keys(g.players).map((id) => [id, g.players[id].trust.fromSetter]),
  );
  const dynBefore = structuredClone(g.trustDyn);
  g.tick = startTick;
  placeIdle(g.actors[pid]);
  // 多跑幾 tick：懲罰若被寫成「每 tick 扣一點」也要抓得到
  for (let i = 0; i < 20; i += 1) { aiCollectIntents(g, ai, [pid]); g.tick += 1; }

  assert.notEqual(ai.attackerId, pid, '樣本前提壞了：這一輪根本沒觸發不跑');
  const trustAfter = Object.fromEntries(
    Object.keys(g.players).map((id) => [id, g.players[id].trust.fromSetter]),
  );
  assert.deepEqual(trustAfter, trustBefore, '不跑扣了 trust——裁定 1B 明文零懲罰');
  assert.deepEqual(g.trustDyn, dynBefore, '不跑動了場內動態信任——裁定 1B 明文零懲罰');
});

test('④ 靜態：段 1 的兩支函式本體不得出現任何 trust 寫入路徑', () => {
  const src = readFileSync(join(SRC, 'sim', 'ai.js'), 'utf8')
    .replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const from = src.indexOf('function applyRouteCommit(');
  const to = src.indexOf('function decideOne(');
  assert.ok(from > 0 && to > from, '擷取不到段 1 的函式區間＝斷言失去標的');
  const body = src.slice(from, to);
  assert.ok(body.includes('function replanWithoutRunners('), '擷取到的區間不含改組織本體');
  for (const w of ['trustDyn', 'updateTrust', 'fromSetter', 'bumpTrustDyn']) {
    assert.ok(!body.includes(w), `段 1 出現 ${w}＝有人補上了懲罰（裁定 1B 禁止）`);
  }
});

// ---------------- ⑤ 一波只改一次 ----------------

test('⑤ 連跑多 tick 只改一次組織（不得逐 tick 重複改）', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  g.tick = startTick;
  placeIdle(g.actors[pid]);
  aiCollectIntents(g, ai, [pid]);
  const afterFirst = {
    attackerId: ai.attackerId,
    approach: structuredClone(ai.approach),
    combo: structuredClone(ai.attackCombo ?? null),
    attackKind: ai.attackKind,
  };
  assert.equal(ai.routeCommit?.replanned, true, `一波只改一次的旗標沒立起來`);
  for (let i = 1; i <= 30; i += 1) {
    g.tick = startTick + i;
    placeIdle(g.actors[pid]);
    // 新攻擊手也一起擺成「沒跑」——就算他也被判不跑，本波也不得再改第二次
    if (ai.attackerId) placeIdle(g.actors[ai.attackerId]);
    aiCollectIntents(g, ai, [pid, ai.attackerId]);
    assert.equal(ai.attackerId, afterFirst.attackerId, `第 ${i} tick 又改了一次組織`);
    assert.deepEqual(ai.approach, afterFirst.approach, `第 ${i} tick 又重建了一次助跑線`);
    assert.deepEqual(ai.attackCombo ?? null, afterFirst.combo);
    assert.equal(ai.attackKind, afterFirst.attackKind);
  }
});

test('⑤ 壽命：來球（新一波）把記帳清乾淨，不跨波殘留', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  g.tick = startTick;
  placeIdle(g.actors[pid]);
  aiCollectIntents(g, ai, [pid]);
  assert.ok(ai.routeCommit, '前提：這一波有記帳');
  // 來球＝對方持球（走 ensureFlightPlan 的來球分支）
  g.rally.flightId += 1;
  Object.assign(g.rally, { possession: 'B', touches: 0, lastTouchTeam: 'B' });
  aiCollectIntents(g, ai, [pid]);
  assert.equal(ai.routeCommit ?? null, null, '記帳沒隨來球作廢＝下一波開場就帶著上一波的舊帳');
});

test('壽命：死球也把記帳清乾淨', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  g.tick = startTick;
  placeIdle(g.actors[pid]);
  aiCollectIntents(g, ai, [pid]);
  assert.ok(ai.routeCommit, '前提：這一波有記帳');
  g.phase = 'serve';
  aiCollectIntents(g, ai, [pid]);
  assert.equal(ai.routeCommit ?? null, null, '記帳沒隨死球作廢');
});

// ---------------- 記帳欄位（裁定 E：本段只記帳、零消費端） ----------------

// 起跳＝AIR 相位＋人停在**自己那條線**的起跳點上。sim 沒有滯空狀態機
//（game.js「真正的滯空狀態機留給 Phase 2」），所以這一層的「起跳」就是相位＋站位。
function jumpProbe(atTakeoff) {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  const route = routeOf(ai, pid);
  g.tick = startTick;
  placeAtStart(g.actors[pid], route); // 先就位，免得被換掉（線沒了就無帳可記）
  aiCollectIntents(g, ai, [pid]);
  assert.equal(ai.attackerId, pid, '前提：他有跑，所以還留在攻擊池裡');
  g.tick = route.takeoffTick;
  const a = g.actors[pid];
  if (atTakeoff) { a.x = route.takeoff.x; a.z = route.takeoff.z; } else { a.x = 0; a.z = SIDE * 3.5; }
  a.px = a.x; a.pz = a.z;
  aiCollectIntents(g, ai, [pid]);
  return { route, actor: a, entry: commitEntry(ai, pid) };
}

test('E 記帳：從自己的戰術線起跳 → jumped 記為 true', () => {
  const { entry } = jumpProbe(true);
  assert.equal(entry.jumped, true, '人就停在自己的起跳點上卻沒記到起跳');
  assert.equal(entry.ran, true);
});

test('E 記帳：起跳窗到了但人不在自己的起跳點上 → jumped 維持 false（非恆真）', () => {
  const { route, actor, entry } = jumpProbe(false);
  assert.ok(Math.hypot(route.takeoff.x - actor.x, route.takeoff.z - actor.z)
    >= AI.TAKEOFF_SETTLE_M, '反例樣本擺得太靠近起跳點');
  assert.equal(entry.jumped, false, 'jumped 恆真＝這個欄位沒有鑑別力');
});

test('E 記帳：欄位形狀固定（下一段的組合獎金要照這份消費）', () => {
  const { cfg, pid, startTick } = CASE;
  const { g, ai } = planWith(cfg);
  g.tick = startTick;
  placeAtStart(g.actors[pid], routeOf(ai, pid));
  aiCollectIntents(g, ai, [pid]);
  const e = commitEntry(ai, pid);
  assert.ok(e, '受控者被叫了卻沒有他的記帳');
  assert.deepEqual(Object.keys(e).sort(),
    ['jumped', 'kind', 'pid', 'ran', 'startTick', 'takeoffTick', 'tempo']);
  assert.deepEqual(Object.keys(ai.routeCommit).sort(),
    ['entries', 'flightId', 'replanned', 'team']);
});

// ---------------- 同源：判準①的尺與畫面上那把尺必須是同一把 ----------------

test('同源：ui/routeCue.js 直接向 sim 取 AT_START_M（不得在提示端放第二份）', () => {
  // 這把尺同時被畫面（說「就位」）與 S（判「他有跑」）用。改成 import 之後
  // 分岔在結構上不可能發生——本測試守的是**沒有人把它改回硬編碼**。
  const cue = readFileSync(join(SRC, 'ui', 'routeCue.js'), 'utf8');
  assert.match(cue, /const \{ AT_START_M \} = AI;/,
    'routeCue.js 又自己放了一份 AT_START_M＝提示端與判定端會漂開');
  assert.doesNotMatch(cue, /const AT_START_M\s*=\s*[\d.]/,
    'routeCue.js 出現硬編碼的 AT_START_M');
});

// ---------------- 決定論 ----------------

test('決定論：同輸入的改組織結果逐值相同', () => {
  const { cfg, pid, startTick } = CASE;
  const run = () => {
    const { g, ai } = planWith(cfg);
    g.tick = startTick;
    placeIdle(g.actors[pid]);
    aiCollectIntents(g, ai, [pid]);
    return { attackerId: ai.attackerId, approach: ai.approach, commit: ai.routeCommit ?? null };
  };
  assert.deepEqual(run(), run());
});
