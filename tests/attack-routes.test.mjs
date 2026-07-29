// Phase 5 W1 §5 A2 路線組合 —— 交叉（新增）＋ pipe（既有，本輪納入 route 系統）
//
// 驗收（工單「新增測試」①②⑤）：
//   ① 交叉的幾何：邊攻手確實**切進中間**，且路徑與直線攻擊明顯不同
//   ② pipe 確實在 route 系統內（有起點／起跳點／節奏／三個時間點，且實跑照著走）
//   ⑤ 決定論：同 seed 兩次，路線分配逐值相同
// 外加兩條把關：
//   ③ 交叉只在一傳到位時出現（快攻不在池裡＝沒有中間攔網手可繞）
//   ④ 交叉的擊球點離快攻點必須超過攔網水平涵蓋半徑——「繞過已 commit 的中間
//      攔網手」若在幾何上不成立，這條路線就只是繞遠路
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf } from '../src/sim/ai.js';
import {
  APPROACH, approachStartFor, takeoffSpotFor, approachRoutesFor, applyRouteKinds,
  routeKindFor, tempoFor, CROSS_RATE, TAKEOFF,
} from '../src/sim/approach.js';
import { TEAM_SIDE, isFrontRow, isBackRow } from '../src/sim/rotation.js';

const lat = (kind, team = 'A') => {
  const s = approachStartFor(team, kind);
  const t = takeoffSpotFor(team, kind);
  return Math.abs(t.x - s.x);
};

// ---------------- ① 交叉的幾何 ----------------

test('A2 交叉：擊球點切進中間——在快攻點與直線攻擊點之間，且明顯偏離直線', () => {
  for (const team of ['A', 'B']) {
    const side = TEAM_SIDE[team];
    const quick = takeoffSpotFor(team, 'quick');
    const left = takeoffSpotFor(team, 'left');
    const cross = takeoffSpotFor(team, 'cross');
    const lx = (p) => side * p.x; // 隊伍視角的橫座標（left 為負）
    assert.ok(lx(cross) < lx(quick), '交叉的擊球點須在快攻點的邊攻側');
    assert.ok(lx(cross) > lx(left), '交叉的擊球點須比直線攻擊更靠中間');
    // 「明顯」＝離直線攻擊點至少 1.5m（不是把 left 挪一點點）
    assert.ok(Math.abs(lx(cross) - lx(left)) >= 1.5,
      `交叉與直線攻擊的擊球點只差 ${Math.abs(lx(cross) - lx(left)).toFixed(2)}m`);
  }
});

test('A2 交叉：助跑路徑與直線攻擊明顯不同（橫移量至少三倍）', () => {
  for (const team of ['A', 'B']) {
    assert.ok(lat('cross', team) >= lat('left', team) * 3,
      `交叉橫移 ${lat('cross', team).toFixed(2)}m 未達直線 ${lat('left', team).toFixed(2)}m 的三倍`);
    // 起點比直線攻擊更貼邊線（「從外側切進來」的前提）
    const sl = approachStartFor(team, 'left');
    const sc = approachStartFor(team, 'cross');
    assert.ok(TEAM_SIDE[team] * sc.x < TEAM_SIDE[team] * sl.x, '交叉起點須比直線更外側');
    // 離網深度同一檔＝攔網手不能靠「他站得比較遠」預先識破
    assert.equal((TEAM_SIDE[team] * sc.z).toFixed(6), (TEAM_SIDE[team] * sl.z).toFixed(6));
  }
});

test('A2 交叉：擊球點離快攻點超過攔網水平涵蓋半徑（跟死快攻的中間攔網手搆不到）', () => {
  const quick = takeoffSpotFor('A', 'quick');
  const cross = takeoffSpotFor('A', 'cross');
  const gap = Math.hypot(cross.x - quick.x, cross.z - quick.z);
  assert.ok(gap > TUNING.BLOCK_REACH_X,
    `交叉離快攻點僅 ${gap.toFixed(2)}m，未超過 BLOCK_REACH_X=${TUNING.BLOCK_REACH_X}m`
    + '＝commit 的中間攔網手照樣搆得到，這條路線就沒有戰術意義');
});

test('A2 交叉：仍然留得下助跑段（不得退回網前罰站）', () => {
  const takeoffLz = 1.3 + TAKEOFF.FRONT; // setAimFor('cross').lz + 前排退距
  const runway = APPROACH.cross.lz - takeoffLz - TAKEOFF.SETTLE;
  assert.ok(runway >= 0.5, `交叉的可跑助跑段只有 ${runway.toFixed(2)}m`);
});

// ---------------- ③ 交叉的成立條件 ----------------

test('A2 交叉：只在一傳到位時出現（ok／poor 檔一律維持直線）', () => {
  let crossSeen = 0;
  for (let f = 0; f < 400; f += 1) {
    for (const tier of ['ok', 'poor']) {
      assert.equal(routeKindFor('left', { flightId: f, seed: 3, index: 1, passTier: tier }), 'left');
    }
    if (routeKindFor('left', { flightId: f, seed: 3, index: 1, passTier: 'perfect' }) === 'cross') {
      crossSeen += 1;
    }
  }
  // 名目比例（±8 個百分點的抽樣容忍）
  assert.ok(Math.abs(crossSeen / 400 - CROSS_RATE) < 0.08,
    `交叉比例 ${(crossSeen / 400 * 100).toFixed(1)}% 偏離名目 ${CROSS_RATE * 100}%`);
  // 其餘線一格不動
  for (const k of ['quick', 'right', 'pipe', 'dball']) {
    assert.equal(routeKindFor(k, { flightId: 7, seed: 3, index: 0, passTier: 'perfect' }), k);
  }
});

test('A2 交叉：走 route 系統——tempo 為三速、且 applyRouteKinds 不改動其他欄位', () => {
  assert.equal(tempoFor('cross', { flightId: 1, seed: 1, index: 0 }), 'three');
  const g = createGame({ seed: 3 });
  const pts = attackPointsOf(g, 'A', 'A1', 'perfect');
  const mapped = applyRouteKinds(pts, { flightId: 1, seed: 1, passTier: 'perfect' });
  assert.equal(mapped.length, pts.length);
  for (let i = 0; i < pts.length; i += 1) {
    assert.equal(mapped[i].pid, pts[i].pid);
    assert.equal(mapped[i].rowFactor, pts[i].rowFactor, 'trust 權重的入參不得被路線變體動到');
    assert.ok(mapped[i].kind === pts[i].kind
      || (pts[i].kind === 'left' && mapped[i].kind === 'cross'));
  }
  // 純函式：不得改動入參
  assert.deepEqual(attackPointsOf(g, 'A', 'A1', 'perfect'), pts);
});

// ---------------- ② pipe 在 route 系統內 ----------------

test('A2 pipe：確實是 route 系統的一員（起點／起跳點／節奏／三個時間點齊備）', () => {
  const g = createGame({ seed: 3 });
  const pts = applyRouteKinds(
    attackPointsOf(g, 'A', 'A1', 'perfect'),
    { flightId: 1, seed: 3, passTier: 'perfect' },
  );
  const routes = approachRoutesFor('A', pts, { setTick: 500, flightId: 1, seed: 3 });
  const pipe = routes.find((r) => r.kind === 'pipe');
  assert.ok(pipe, 'pipe 未進 route 系統');
  assert.ok(pipe.start && pipe.takeoff, 'pipe 缺助跑起點或起跳點');
  assert.equal(pipe.tempo, 'three', 'pipe 為三速（二傳觸球後起跳）');
  for (const k of ['startTick', 'takeoffTick', 'settleTick', 'runTicks']) {
    assert.ok(Number.isFinite(pipe[k]), `pipe route 缺 ${k}`);
  }
  assert.ok(pipe.startTick < pipe.takeoffTick && pipe.takeoffTick < pipe.settleTick);
  assert.ok(isBackRow(g.match.rotations.A, pipe.pid), 'pipe 只給後排');
});

// ---------------- 實跑：交叉與 pipe 真的被跑出來 ----------------

// 跑一整局，記錄①每次攻擊的線別 ②每條 route 從起步到起跳之間人真的橫移多少
function runSet(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const kinds = [];
  const runLat = {};
  const log = [];
  let started = {};
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const team = g.rally.possession;
    const routes = ai.approach?.team === team ? (ai.approach.routes ?? []) : [];
    for (const rt of routes) {
      if (rt.startTick != null && g.tick === rt.startTick) {
        const a = g.actors[rt.pid];
        started[rt.pid] = { x: a.x, z: a.z, kind: rt.kind };
      }
      const s = started[rt.pid];
      if (s && rt.takeoffTick != null && g.tick === rt.takeoffTick) {
        const a = g.actors[rt.pid];
        (runLat[s.kind] ??= []).push(Math.abs(a.x - s.x));
        delete started[rt.pid];
      }
    }
    if (ai.approach) {
      log.push(`${g.tick}:${ai.approach.routes.map((r) => `${r.pid}/${r.kind}/${r.tempo}`).join('|')}`);
    }
    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3 && ai.attackKind) {
        kinds.push({ kind: ai.attackKind, pid: e.playerId,
          front: isFrontRow(g.match.rotations[e.team], e.playerId) });
      }
      if (e.type === 'DEAD_BALL') started = {};
    }
  }
  return { kinds, runLat, log };
}

const runs = [11, 12, 13].map(runSet);
const allKinds = runs.flatMap((r) => r.kinds);
const allLat = {};
for (const r of runs) {
  for (const k of Object.keys(r.runLat)) (allLat[k] ??= []).push(...r.runLat[k]);
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('實跑：交叉真的被打出來，且只給前排邊攻', () => {
  const cross = allKinds.filter((k) => k.kind === 'cross');
  const left = allKinds.filter((k) => k.kind === 'left');
  assert.ok(cross.length > 20, `交叉樣本不足（${cross.length}）`);
  for (const c of cross) assert.ok(c.front, '交叉只給前排邊攻');
  const share = cross.length / (cross.length + left.length);
  assert.ok(Math.abs(share - CROSS_RATE) < 0.12,
    `OH 線內交叉佔比 ${(share * 100).toFixed(1)}%（名目 ${CROSS_RATE * 100}%）`);
  // pipe 也真的被打出來（route 系統一員的行為級證據）
  assert.ok(allKinds.filter((k) => k.kind === 'pipe').length > 20, 'pipe 樣本不足');
});

test('實跑：跑交叉的人真的橫移進中間（直線攻擊沒有這個位移）', () => {
  assert.ok(allLat.cross?.length > 20 && allLat.left?.length > 20, '樣本不足');
  const mc = mean(allLat.cross);
  const ml = mean(allLat.left);
  assert.ok(mc > 2, `交叉的實跑橫移只有 ${mc.toFixed(2)}m`);
  assert.ok(mc > ml * 3,
    `交叉橫移 ${mc.toFixed(2)}m 未達直線 ${ml.toFixed(2)}m 的三倍＝場上看不出差別`);
  // pipe 是直線切入（後排中路），橫移應接近 0——反證上面的量法測得到「有沒有橫移」
  assert.ok(mean(allLat.pipe) < 0.3, `pipe 不該有橫移（實得 ${mean(allLat.pipe).toFixed(2)}m）`);
});

// ---------------- ⑤ 決定論 ----------------

test('決定論：同 seed 兩次整局，路線分配（含交叉）逐值相同', () => {
  const a = runSet(11);
  const b = runSet(11);
  assert.ok(a.log.length > 500, `樣本足夠（${a.log.length}）`);
  assert.equal(a.log.length, b.log.length);
  for (let i = 0; i < a.log.length; i += 1) {
    assert.equal(a.log[i], b.log[i], `第 ${i} 筆路線分配不一致`);
  }
});
