// Phase 5 W1 §2-2「Transition 拉開」：助跑起點是純函式、可對任意球員呼叫，
// 且 MB 快攻／兩翼／後排 pipe 的離網距離必須分得開——那個「分得開」本身
// 就是攔網手要讀的線索（§0 設計意圖）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import {
  createAiState, aiCollectIntents, attackPointsOf,
} from '../src/sim/ai.js';
import {
  APPROACH, approachStartFor, approachRoutesFor, approachStartOf,
} from '../src/sim/approach.js';
import { isFrontRow, isBackRow, TEAM_SIDE } from '../src/sim/rotation.js';
import { setAimFor, AI } from '../src/sim/ai.js';

// 不變量（07-28 事後補）：助跑起點必須在「起跳點」之外，否則助跑段會被
// 「到位即停」的半徑吃光，人直接站到球下面等——就是 07-23 拍板禁止的網前罰站。
//   起跳點 lz ＝ 舉球落點 lz ＋（後排 TAKEOFF_BACK_M／前排 TAKEOFF_FRONT_M）
// 初版 quick 寫 1.5 時這個值是 −0.43m（起點比起跳點還貼網），實跑罰站率 100%。
// 這是純算術，動手前三十秒就能驗——比任何實跑測試都早抓到（見 lessons 07-26）。
test('不變量：每條攻擊線的助跑起點都必須留得下助跑段（負值＝網前罰站）', () => {
  const BACK = new Set(['pipe', 'dball']);
  const runway = (kind) => {
    const aim = setAimFor(null, 'A', null, kind);
    const takeoffLz = aim.lz + (BACK.has(kind) ? AI.TAKEOFF_BACK_M : AI.TAKEOFF_FRONT_M);
    return APPROACH[kind].lz - takeoffLz - AI.TAKEOFF_SETTLE_M;
  };
  for (const kind of Object.keys(APPROACH)) {
    const r = runway(kind);
    // 0.5m＝一步；低於一步就不叫助跑，等於原地拔起
    assert.ok(r >= 0.5, `${kind} 的可跑助跑段只有 ${r.toFixed(2)}m（須 ≥0.5m＝至少一步）`);
  }
});

const lzOf = (start, team) => TEAM_SIDE[team] * start.z;

test('助跑起點幾何：MB 快攻離網最近、後排 pipe 離網最遠（§2-4 位置例外）', () => {
  for (const team of ['A', 'B']) {
    const quick = approachStartFor(team, 'quick');
    const left = approachStartFor(team, 'left');
    const right = approachStartFor(team, 'right');
    const pipe = approachStartFor(team, 'pipe');
    const dball = approachStartFor(team, 'dball');
    assert.ok(lzOf(quick, team) < lzOf(left, team), 'MB 快攻須比 OH 離網近');
    assert.ok(lzOf(quick, team) < lzOf(right, team), 'MB 快攻須比 OPP 離網近');
    assert.ok(lzOf(pipe, team) > lzOf(left, team), '後排 pipe 須比前排兩翼離網遠');
    assert.ok(lzOf(pipe, team) >= lzOf(dball, team) - 1e-9, 'pipe 為後排最遠一檔');
    // OPP 沿用 OH 架構鏡像：離網同深、左右對稱
    assert.equal(lzOf(left, team).toFixed(6), lzOf(right, team).toFixed(6));
    assert.equal(
      (TEAM_SIDE[team] * left.x).toFixed(6),
      (-TEAM_SIDE[team] * right.x).toFixed(6),
      'OPP 助跑起點須為 OH 的鏡像',
    );
    // 後排攻擊起點必須在攻擊線後（後排攻擊起跳合法性）
    assert.ok(lzOf(pipe, team) > 3, '後排 pipe 起點須在攻擊線後');
    assert.ok(lzOf(dball, team) > 3, '後排 D 球起點須在攻擊線後');
  }
  // 步數規格（§2-4）：MB 兩步、兩翼與後排四步
  assert.equal(APPROACH.quick.steps, 2);
  assert.equal(APPROACH.left.steps, 4);
  assert.equal(APPROACH.right.steps, 4);
  assert.equal(APPROACH.pipe.steps, 4);
});

test('助跑起點是純函式：非攻擊手回 null、不綁 attackerId 那一人', () => {
  assert.equal(approachStartFor('A', 'nope'), null);
  assert.equal(approachStartFor('A', undefined), null);
  assert.equal(approachStartOf(null, 'A1'), null);
  assert.equal(approachStartOf([], 'A1'), null);

  const g = createGame({ seed: 3 });
  const points = attackPointsOf(g, 'A', 'A1', 'perfect');
  const routes = approachRoutesFor('A', points);
  assert.equal(routes.length, points.length, '池中每名合法攻擊手都要有一條線');
  assert.ok(routes.length >= 2, '完美一傳下至少兩條線可讀');
  for (const pt of points) {
    assert.ok(approachStartOf(routes, pt.pid), `${pt.pid} 應有助跑起點`);
  }
  // 二傳本人不在池裡＝沒有助跑線
  assert.equal(approachStartOf(routes, 'A1'), null);
});

test('一傳品質降級＝快攻線消失（攔網手的第一組讀取線索）', () => {
  const g = createGame({ seed: 3 });
  const kinds = (tier) => approachRoutesFor('A', attackPointsOf(g, 'A', 'A1', tier))
    .map((r) => r.kind).sort();
  assert.ok(kinds('perfect').includes('quick'), '完美一傳＝快攻線在場上');
  assert.ok(!kinds('ok').includes('quick'), '可用一傳＝快攻線消失');
  assert.ok(!kinds('poor').includes('quick'));
});

// 實跑：跑完整局，量二傳觸球瞬間各線的離網距離
function runSet(seed) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const lz = { quick: [], wing: [], back: [] };
  const routeLog = [];
  let open = null;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const ev = stepGame(g, aiCollectIntents(g, ai));
    if (ai.approach) {
      routeLog.push(`${g.tick}:${ai.approach.team}:` + ai.approach.routes
        .map((r) => `${r.pid}/${r.kind}/${r.start.x.toFixed(4)},${r.start.z.toFixed(4)}`).join('|'));
    }
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.touches === 1) open = e.team;
      else if (e.type === 'TOUCH' && e.touches === 2 && open === e.team) {
        const team = e.team;
        const rot = g.match.rotations[team];
        for (const r of ai.approach?.routes ?? []) {
          const d = TEAM_SIDE[team] * g.actors[r.pid].z;
          if (r.kind === 'quick') {
            assert.ok(isFrontRow(rot, r.pid), '快攻線只給前排 MB');
            lz.quick.push(d);
          } else if (r.kind === 'left' || r.kind === 'right' || r.kind === 'left_inside'
            || r.kind === 'cross' || r.kind === 'tandem') {
            // §5 A2：left_inside（內切，舊稱 cross）也是前排 OH 的線，離網深度與 left 同一檔
            // ——分類補齊，斷言不放寬（反而多了一條「必須是前排」）
            // 組合攻擊卷 段 B（2026-07-31）同款補齊：'cross'（真交叉）也是**前排 OH** 的線，
            // 助跑起點 lz 3.6 與 left／left_inside **逐值相同**（approach.js APPROACH 表）。
            // 沒補的話它會掉進下面的 else＝被當成後排攻擊線，紅在「後排攻擊線只給後排」
            // ——那是分類過時，不是行為變了（此處**斷言一格未放寬**，仍要求前排）。
            // 段 C（2026-07-31）再補 'tandem'（夾塞）：主攻者是**前排 OPP**（由 right 升級），
            // 起跳點 lz 2.68 在攻擊線 3.0 內 ⇒ 後排球員跑這條線就是踏線違例，
            // 所以「必須是前排」這條斷言對它而言比對兩翼更硬，不得放寬。
            assert.ok(isFrontRow(rot, r.pid), '前排兩翼線（含內切／交叉）只給前排邊攻');
            lz.wing.push(d);
          } else {
            assert.ok(isBackRow(rot, r.pid), '後排攻擊線只給後排');
            lz.back.push(d);
          }
        }
        open = null;
      } else if (e.type === 'DEAD_BALL') open = null;
    }
  }
  return { lz, routeLog };
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

test('實跑：二傳觸球瞬間 MB 貼網、兩翼四步外、後排最遠（三檔分得開）', () => {
  const { lz } = runSet(11);
  assert.ok(lz.quick.length > 20, `快攻樣本足夠（${lz.quick.length}）`);
  assert.ok(lz.wing.length > 20, `兩翼樣本足夠（${lz.wing.length}）`);
  assert.ok(lz.back.length > 20, `後排樣本足夠（${lz.back.length}）`);
  const mq = median(lz.quick);
  const mw = median(lz.wing);
  const mb = median(lz.back);
  // 門檻 1→0.4：07-28 Sawmah 拍板把 quick 起點從 1.5 拉到 3.0（修「100% 罰站
  // 0.5 秒」的退化，見 approach.js quick 的註解），代價就是與兩翼的區隔從 2.1m
  // 縮到 0.6m。「MB 最貼網」的規格未變、只是幅度變小，故放寬門檻而非移除斷言
  assert.ok(mq < mw - 0.4, `MB 須比兩翼貼網（quick=${mq.toFixed(2)} wing=${mw.toFixed(2)}）`);
  assert.ok(mb > mw + 1, `後排須明顯比兩翼遠（back=${mb.toFixed(2)} wing=${mw.toFixed(2)}）`);
  // 拉開要「看得出來」：兩翼站到攻擊線外、MB 站進前區
  assert.ok(mw > 3, `兩翼助跑起點須在攻擊線外（${mw.toFixed(2)}）`);
  // ★§4 已恢復（原值 mq < 2，07-28 因幾何互斥暫放寬到 3.2）：
  // 放寬的理由是「MB 起跳點固定在 1.68m，要留一步助跑，**起點**就得 ≥2.43m」——
  // 但這句話量的是起點。§4 A1 把 MB 改成一速（二傳觸球前就跑完助跑站上起跳點）之後，
  // 這裡量到的不再是起點而是**起跳點**：實測中位數 1.93m，本來就該在前區。
  // 「起點留得下助跑段」（上面的不變量測試）與「觸球瞬間人已進前區」因此同時成立，
  // 兩者不再互斥——這正是 A1 要證明的東西：MB 貼網不是站過去的，是跑完助跑跳上去的。
  assert.ok(mq < 2, `MB 須在二傳觸球前跑進前區等快攻（${mq.toFixed(2)}）`);
});

test('決定論：同 seed 兩次跑，助跑線分配與座標逐值相同', () => {
  const a = runSet(5);
  const b = runSet(5);
  assert.ok(a.routeLog.length > 500, `樣本足夠（${a.routeLog.length}）`);
  assert.equal(a.routeLog.length, b.routeLog.length);
  for (let i = 0; i < a.routeLog.length; i += 1) {
    assert.equal(a.routeLog[i], b.routeLog[i], `第 ${i} 筆助跑線不一致`);
  }
  assert.deepEqual(a.lz, b.lz, '離網距離序列須逐值相同');
});
