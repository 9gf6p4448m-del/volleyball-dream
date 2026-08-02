// 組合攻擊卷 段 A（2026-07-31）—— 真交叉／夾塞的**幾何前置**驗收
//
// 這一段唯一的產出是「兩條新攻擊線的座標」，它存在的理由只有一個：
// **段 B/C 的驗收條件在段 A 之前可以符號證明恆假。**
//   交叉條件 2「主攻者助跑線段的 lx 區間包含快攻起跳點 lx(=0)」——
//     改動前六條線的 lx 區間分別是 [−3.6,−3]／[−4.1,−1.3]／[3,3.6]／{−1}／{2.6}／{0}
//     （最後一個是快攻自己，主攻者不可能是配合者本人）⇒ **沒有任何一條含 0**。
//   夾塞條件 1「|Δlx| ≤ 0.6」——改動前六條線兩兩 lx 最小間距 1.0m ⇒ 同樣恆假。
// 所以本檔的核心不是「新線長得對」，而是**「條件既不恆假也不恆真」**：
//   恆假否證＝新線確實滿足條件（下面「條件成立」各條）；
//   恆真否證＝**除了新線以外，沒有別的線滿足**（下面「非恆真」各條）。
// 兩邊都要有，只有前者的話等於把門檻放寬到人人及格（`03 R5`／`02 §6.1` 條 6）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { mergeScouting } from '../src/career/careerState.js';
import {
  APPROACH, approachStartFor, takeoffSpotFor, setAimFor, tempoFor, routeKindFor,
  TAKEOFF, TANDEM_LANE_M, TANDEM_DEPTH_M,
} from '../src/sim/approach.js';
import { COURT } from '../src/sim/constants.js';
import { TEAM_SIDE } from '../src/sim/rotation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEW_KINDS = ['cross', 'tandem'];
const OLD_KINDS = ['quick', 'left', 'left_inside', 'right', 'pipe', 'dball'];

// SEP_RADIUS 住在 game.js 的模組作用域（沒有 export）——**靜態掃描取值**而不是抄一個
// 字面量：抄的話 game.js 改了這裡不會紅，夾塞的「硬下界」就變成一句沒人守的註解。
const SEP_RADIUS = (() => {
  const src = readFileSync(join(ROOT, 'src', 'sim', 'game.js'), 'utf8');
  const m = src.match(/const\s+SEP_RADIUS\s*=\s*([\d.]+)\s*;/);
  assert.ok(m, 'game.js 的 SEP_RADIUS 宣告形式改了——夾塞的硬下界失去單一真相');
  return Number(m[1]);
})();

// 隊伍視角座標（lx＝面向網時的右手向、lz＝離網距離）
// ★ 這幾個 helper **刻意對「線不存在」回 null 而不是丟 TypeError**（`02 §6.1` 條 1）：
//   本檔要守的行為是「條件成不成立」，若在改動前的程式碼上紅在
//   `Cannot read properties of null`，那紅的是旁枝錯誤、真正的判斷式根本沒被驗到。
//   null-safe 之後，改動前紅的就是下面那句「線段未包含 lx=0＝交叉條件 2 恆假」本身。
const lxz = (p, team) => ({ lx: TEAM_SIDE[team] * p.x, lz: TEAM_SIDE[team] * p.z });
const startL = (team, kind) => {
  const p = approachStartFor(team, kind);
  return p ? lxz(p, team) : null;
};
// takeoffSpotFor 沒有 null 分支（不在表上的 kind 吃 setAimFor 的保底落點）
const takeL = (team, kind) => lxz(takeoffSpotFor(team, kind), team);
// 「這條線在不在 APPROACH 表上」——所有幾何斷言的前置條件，紅的時候要說人話
const onTable = (kind) => `${kind} 不在 APPROACH 表上＝這條線還不存在，下面的條件全部恆假`;

// 助跑線段在某個 lx 上的 lz（線性內插）；線不存在或 lx 不在線段區間內回 null
function lzAtLx(team, kind, x) {
  const s = startL(team, kind);
  if (!s) return null;
  const t = takeL(team, kind);
  const lo = Math.min(s.lx, t.lx);
  const hi = Math.max(s.lx, t.lx);
  if (x < lo || x > hi) return null;
  if (t.lx === s.lx) return null; // 垂直線段：不「穿越」任何 lx
  const u = (x - s.lx) / (t.lx - s.lx);
  return s.lz + u * (t.lz - s.lz);
}

// ---------------- 0. 新線進了表、查得到值 ----------------

test('段 A：cross／tandem 進了 APPROACH 與 setAimFor，兩隊都查得出座標', () => {
  for (const kind of NEW_KINDS) {
    assert.ok(APPROACH[kind], `${kind} 不在 APPROACH 表上`);
    assert.equal(APPROACH[kind].steps, 4);
    for (const team of ['A', 'B']) {
      const s = approachStartFor(team, kind);
      const t = takeoffSpotFor(team, kind);
      assert.ok(s && Number.isFinite(s.x) && Number.isFinite(s.z), `${team}/${kind} 助跑起點`);
      assert.ok(t && Number.isFinite(t.x) && Number.isFinite(t.z), `${team}/${kind} 起跳點`);
      assert.equal(s.kind, kind);
      // setAimFor 有專屬條目（不是掉進最後那條 fallback `{lx:2, lz:1.3}`）
      const aim = setAimFor(null, team, null, kind);
      assert.notDeepEqual(
        { lx: aim.lx, lz: aim.lz },
        { lx: 2, lz: 1.3 },
        `${kind} 掉進了 setAimFor 的保底分支＝表上沒有這條線`,
      );
    }
  }
  // 兩隊鏡像：隊伍視角座標逐值相同（世界座標互為 ±）
  for (const kind of NEW_KINDS) {
    assert.deepEqual(startL('A', kind), startL('B', kind), `${kind} 起點兩隊視角須一致`);
    assert.deepEqual(takeL('A', kind), takeL('B', kind), `${kind} 起跳點兩隊視角須一致`);
  }
});

test('段 A：新線的助跑段留得下（≥0.5m＝至少一步，不得退回網前罰站）', () => {
  const BACK = new Set(['pipe', 'dball']);
  for (const kind of NEW_KINDS) {
    assert.ok(APPROACH[kind], onTable(kind));
    const aim = setAimFor(null, 'A', null, kind);
    const takeoffLz = aim.lz + (BACK.has(kind) ? TAKEOFF.BACK : TAKEOFF.FRONT);
    const runway = APPROACH[kind].lz - takeoffLz - TAKEOFF.SETTLE;
    assert.ok(runway >= 0.5, `${kind} 的可跑助跑段只有 ${runway.toFixed(2)}m`);
  }
  // 實際值（推導留痕）：cross 3.6−1.98−0.25=1.37／tandem 4.2−2.68−0.25=1.27
  assert.equal((APPROACH.cross.lz - (1.3 + TAKEOFF.FRONT) - TAKEOFF.SETTLE).toFixed(2), '1.37');
  assert.equal((APPROACH.tandem.lz - (2.0 + TAKEOFF.FRONT) - TAKEOFF.SETTLE).toFixed(2), '1.27');
});

test('段 A：新線的起點與擊球點都在合法範圍內（場內、前排前區、攻擊線關係正確）', () => {
  const lim = COURT.WIDTH / 2 - 0.4; // approachStartFor 的場內夾制
  for (const kind of NEW_KINDS) {
    const s = startL('A', kind);
    assert.ok(s, onTable(kind));
    const t = takeL('A', kind);
    const aim = setAimFor(null, 'A', null, kind);
    assert.ok(Math.abs(s.lx) <= lim + 1e-9, `${kind} 起點跑出邊線（lx=${s.lx}）`);
    assert.ok(Math.abs(t.lx) <= COURT.WIDTH / 2, `${kind} 起跳點跑出邊線（lx=${t.lx}）`);
    assert.ok(aim.lz > 0 && aim.lz < 3, `${kind} 的舉球落點須在前區（lz=${aim.lz}）`);
    // 前排線：起跳點在攻擊線（3m）之內＝不是後排攻擊
    assert.ok(t.lz < 3, `${kind} 起跳點 lz=${t.lz} 已在攻擊線後，前排線不該如此`);
    // 起點必須比起跳點更遠離網（助跑方向是由後往前）
    assert.ok(s.lz > t.lz, `${kind} 起點比起跳點還貼網＝沒有助跑`);
    // 弧線參數在 game.js 認得的三檔內
    assert.ok(aim.t > 0 && aim.t < 1);
  }
  // cross 走高球檔（t≥0.65＝SET_APEX）、tandem 走平弧檔（0.5≤t<0.65＝SHOOT_APEX）
  assert.ok(setAimFor(null, 'A', null, 'cross').t >= 0.65);
  const tt = setAimFor(null, 'A', null, 'tandem').t;
  assert.ok(tt >= 0.5 && tt < 0.65, `tandem 的 t=${tt} 不在 shoot 檔`);
});

// ---------------- 1. 交叉條件：成立（恆假否證） ----------------

test('交叉條件 2/3 成立：cross 的助跑線段穿過 lx=0，且在該處於快攻起跳點的後方', () => {
  for (const team of ['A', 'B']) {
    const q = takeL(team, 'quick');
    assert.equal(q.lx, 0, '快攻起跳點應在 lx=0（本條件的座標前提）');
    // 條件 2 穿越：線段的 lx 區間包含 partner（quick）的起跳 lx
    const lz0 = lzAtLx(team, 'cross', q.lx);
    assert.ok(lz0 !== null, 'cross 的助跑線段未包含 lx=0＝交叉條件 2 恆假');
    // 條件 3 後方：線段在該處的 lz 高於快攻起跳點的 lz
    assert.ok(lz0 > q.lz,
      `cross 在 lx=0 處 lz=${lz0.toFixed(3)}，未在快攻起跳點 lz=${q.lz.toFixed(3)} 後方`);
    // 餘裕必須大於同隊避讓半徑，否則「穿過去」的那一刻兩人會被推開
    assert.ok(lz0 - q.lz > SEP_RADIUS,
      `穿越餘裕僅 ${(lz0 - q.lz).toFixed(3)}m ≤ SEP_RADIUS ${SEP_RADIUS}m＝穿越當下會被避讓推開`);
    // 逐值留痕：3.6 − (4.1/5.4)×1.62 ＝ 2.37；2.37 − 1.68 ＝ 0.69
    assert.equal(lz0.toFixed(3), '2.370');
    assert.equal((lz0 - q.lz).toFixed(3), '0.690');
  }
});

test('交叉條件 5 成立：cross 擊球點離快攻點超過攔網水平涵蓋半徑（commit 的中間攔網手搆不到）', () => {
  assert.ok(APPROACH.cross, onTable('cross'));
  const q = takeoffSpotFor('A', 'quick');
  const c = takeoffSpotFor('A', 'cross');
  const gap = Math.hypot(c.x - q.x, c.z - q.z);
  assert.ok(gap > TUNING.BLOCK_REACH_X,
    `cross 離快攻點僅 ${gap.toFixed(3)}m，未超過 BLOCK_REACH_X=${TUNING.BLOCK_REACH_X}m`);
  // 逐值留痕：hypot(1.3, 0.3) ＝ 1.334；門檻 0.5 ⇒ 2.67 倍
  assert.equal(gap.toFixed(3), '1.334');
  // cross 與 left_inside 是**鏡像**：離快攻點的橫向距離同值、方向相反
  assert.equal(takeL('A', 'cross').lx, -takeL('A', 'left_inside').lx);
});

// ---------------- 2. 交叉條件：非恆真 ----------------

test('交叉條件 2 非恆真：除了 cross，沒有任何一條線的助跑線段穿過 lx=0', () => {
  const q = takeL('A', 'quick');
  const passing = Object.keys(APPROACH)
    // 配合者是快攻手本人，主攻者不可能是同一條線
    .filter((k) => k !== 'quick')
    .filter((k) => lzAtLx('A', k, q.lx) !== null);
  assert.deepEqual(passing, ['cross'],
    `穿過 lx=0 的線應**只有** cross，實際為 [${passing.join(', ')}]`
    + '——多了代表門檻放太寬（恆真），少了代表段 B 的驗收仍恆假');
  // 改動前的六條線逐條列出區間，證明「恆假」不是憑感覺說的
  for (const k of OLD_KINDS.filter((x) => x !== 'quick')) {
    assert.equal(lzAtLx('A', k, 0), null, `${k} 不該穿過 lx=0`);
  }
});

// ---------------- 3. 夾塞條件：成立＋非恆真 ----------------

test('夾塞條件 1/2 成立：tandem 與快攻同線（|Δlx| ≤ 門檻）且前後疊（Δlz ≥ 門檻 > SEP_RADIUS）', () => {
  assert.ok(TANDEM_DEPTH_M > SEP_RADIUS,
    `TANDEM_DEPTH_M=${TANDEM_DEPTH_M} 未大於 SEP_RADIUS=${SEP_RADIUS}`
    + '＝同隊避讓會把兩人推開，夾塞幾何自我瓦解（條件恆真但無意義）');
  assert.ok(APPROACH.tandem, onTable('tandem'));
  for (const team of ['A', 'B']) {
    const q = takeL(team, 'quick');
    const t = takeL(team, 'tandem');
    const dlx = Math.abs(t.lx - q.lx);
    const dlz = t.lz - q.lz;
    assert.ok(dlx <= TANDEM_LANE_M, `同線條件不成立：|Δlx|=${dlx.toFixed(3)} > ${TANDEM_LANE_M}`);
    assert.ok(dlz >= TANDEM_DEPTH_M, `前後疊不成立：Δlz=${dlz.toFixed(3)} < ${TANDEM_DEPTH_M}`);
    // 方向：夾塞在快攻的**後方**（離網更遠），不是前方
    assert.ok(dlz > 0);
    // 逐值留痕：|0.3−0|＝0.300 ≤ 0.6；2.68−1.68＝1.000 ≥ 0.8
    assert.equal(dlx.toFixed(3), '0.300');
    assert.equal(dlz.toFixed(3), '1.000');
  }
});

test('夾塞條件 4 成立：tandem 不得同時滿足交叉條件 2（兩型互斥、不雙重計數）', () => {
  // 前置：線不存在的話「不含 lx=0」會空洞地成立（vacuous truth）＝這條測試變恆真
  assert.ok(APPROACH.tandem, onTable('tandem'));
  assert.ok(APPROACH.cross, onTable('cross'));
  assert.equal(lzAtLx('A', 'tandem', 0), null,
    'tandem 的助跑線段含 lx=0＝同時算成交叉，兩型會雙重計數');
  // 反過來：cross 不得同時滿足夾塞的同線條件
  const q = takeL('A', 'quick');
  const c = takeL('A', 'cross');
  assert.ok(Math.abs(c.lx - q.lx) > TANDEM_LANE_M, 'cross 落進了夾塞的同線帶＝兩型互斥失效');
});

test('夾塞條件 1 非恆真：除了 tandem，沒有任何一條線與快攻同線', () => {
  const q = takeL('A', 'quick');
  const sameLane = Object.keys(APPROACH)
    .filter((k) => k !== 'quick')
    .filter((k) => Math.abs(takeL('A', k).lx - q.lx) <= TANDEM_LANE_M);
  assert.deepEqual(sameLane, ['tandem'],
    `與快攻同線的應**只有** tandem，實際為 [${sameLane.join(', ')}]`);
});

// ---------------- 4. 不觸發同隊避讓 ----------------

test('段 A：八條線的起跳點兩兩距離都 ≥ SEP_RADIUS（同時在場也不會被避讓推開）', () => {
  const kinds = Object.keys(APPROACH);
  assert.equal(kinds.length, 9, '攻擊線總數應為 9（六舊＋cross＋tandem＋卷五 bquick）');
  for (let i = 0; i < kinds.length; i += 1) {
    for (let j = i + 1; j < kinds.length; j += 1) {
      const a = takeoffSpotFor('A', kinds[i]);
      const b = takeoffSpotFor('A', kinds[j]);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d >= SEP_RADIUS,
        `${kinds[i]} 與 ${kinds[j]} 的起跳點只差 ${d.toFixed(3)}m < SEP_RADIUS ${SEP_RADIUS}m`);
    }
  }
});

test('段 A：新線的助跑起點不與別條線的起點相撞（OH 自己的替代線族除外）', () => {
  // 例外族＝同一名 OH 的三條互斥替代線：left／left_inside／cross 不可能同時在場，
  // 而且 cross 的起點**刻意**與 left_inside 逐值相同（起步前看不出差別＝欺敵價值本身）。
  // 這個例外在改動前就存在（left 與 left_inside 的起點只差 0.5m < SEP_RADIUS）。
  const OH_FAMILY = new Set(['left', 'left_inside', 'cross']);
  const kinds = Object.keys(APPROACH);
  for (const k of NEW_KINDS) {
    assert.ok(APPROACH[k], onTable(k));
    for (const o of kinds) {
      if (o === k) continue;
      if (OH_FAMILY.has(k) && OH_FAMILY.has(o)) continue;
      const a = approachStartFor('A', k);
      const b = approachStartFor('A', o);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d >= SEP_RADIUS, `${k} 與 ${o} 的助跑起點只差 ${d.toFixed(3)}m`);
    }
  }
  // cross 的起點與 left_inside 逐值相同——這是設計，不是漏改
  assert.deepEqual(startL('A', 'cross'), startL('A', 'left_inside'));
});

// ---------------- 5. 本段「不接抽籤」的機械證明 ----------------

test('段 A：抽籤一格未接——routeKindFor／tempoFor 永遠不會產出 cross／tandem', () => {
  for (let f = 0; f < 400; f += 1) {
    for (const tier of ['perfect', 'ok', 'poor']) {
      for (const k of OLD_KINDS) {
        const out = routeKindFor(k, { flightId: f, seed: 3, index: f % 4, passTier: tier });
        assert.ok(!NEW_KINDS.includes(out), `routeKindFor 產出了 ${out}＝段 A 誤接抽籤`);
      }
    }
  }
  // 新線本身的節奏是**線的屬性、無 rng、決定論**（不隨 flightId／seed／tier 變）。
  // ★ 段 C 更新：tandem 由 'three' 改為 'two' ★ 段 A 給 tandem 的舉球落點是 t=0.55
  // （半快弧），節奏標籤卻留在三速——段 A 結案訊息把它列為「留給段 C 的已知不一致」，
  // 段 C 把標籤改成它本來就在做的事（見 approach.js tempoFor 的段 C 註解）。
  // 這一條**不是放寬**：仍然釘死「無 rng、決定論」，只是釘的值換了。
  const EXPECT_TEMPO = { cross: 'three', tandem: 'two' };
  for (const k of NEW_KINDS) {
    const want = EXPECT_TEMPO[k];
    assert.ok(want, `新線 ${k} 沒有登記期望節奏＝這條斷言會空洞成立`);
    assert.equal(tempoFor(k, { flightId: 1, seed: 1, index: 0 }), want);
    assert.equal(tempoFor(k, { flightId: 9, seed: 7, index: 3, passTier: 'poor' }), want);
    // routeKindFor 對新線原樣回傳（不再被二次改寫）
    assert.equal(routeKindFor(k, { flightId: 1, seed: 1, index: 0 }), k);
  }
});

// 段 C：夾塞的弧線與節奏必須同時是「半快」——段 A 留下的不一致的釘子。
// 弧線那一半由 setAimFor 的 t 決定（0.55＝game.js 的 SHOOT 檔），節奏那一半由 tempoFor 決定。
// 兩邊只要有一邊被改回去，這條就轉紅（而不是靜靜地又分岔一次）。
test('段 C：tandem 的弧線（t=0.55 半快檔）與節奏（two）一致，且不影響落點／起跳點', () => {
  const aim = setAimFor(null, 'A', null, 'tandem');
  assert.equal(aim.t, 0.55, 'tandem 的舉球弧線不再是半快檔');
  assert.ok(aim.t >= 0.5 && aim.t < 0.65, 't 必須落在 game.js 取 SHOOT_APEX 的區間');
  assert.equal(tempoFor('tandem', { flightId: 1, seed: 1, index: 0 }), 'two');
  // 帶 tempo='two' 呼叫時，SHOOT／SHOOT_HIT 的外推**不得**套到 tandem 身上
  // （那兩張表只有 left／right 有鍵）——否則落點會被推到標誌桿、幾何整條作廢
  assert.deepEqual(setAimFor(null, 'A', null, 'tandem', 'two'), aim);
  assert.deepEqual(takeoffSpotFor('A', 'tandem', 'two'), takeoffSpotFor('A', 'tandem', 'three'));
});

// ---------------- 6. Q4 記帳鍵集 ----------------

test('Q4 鍵集：sim 的 scoutTally.routes 對每一條 APPROACH 線都有鍵（過得了 !== undefined 守衛）', () => {
  // 先用既有 rig 打一球，拿到 sim **真的建出來**的 tally 物件（不是自己重建一份）
  const g = createGame({ seed: 2 });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'arc', possession: 'A', touches: 2,
    lastTouchTeam: 'A', lastToucherId: 'A1', touchLockTick: -1,
  });
  const b = g.ball;
  b.x = 3; b.y = 2.9; b.z = 2; b.vx = 0; b.vy = -1; b.vz = 0;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A2.x = 3; g.actors.A2.z = 2;
  g.actors.A2.lastTouchTick = -9999;
  stepGame(g, [createIntent({
    playerId: 'A2', tick: g.tick, action: 'spike', aim: { x: 4.1, z: -5 }, routeKind: 'cross',
  })]);
  const tal = g.scoutTally.A2;
  // ★ 直接驗 game.js:659 那道守衛的判斷式本身
  for (const kind of Object.keys(APPROACH)) {
    assert.ok(tal.routes[kind] !== undefined,
      `scoutTally.routes 缺鍵 '${kind}'＝該線的記帳會被 !== undefined 守衛靜默丟棄`);
  }
  // 端到端：帶 routeKind:'cross' 的扣球確實被記進去了（不是只有鍵在）
  assert.equal(tal.routes.cross, 1, "routeKind:'cross' 的扣球沒有被記帳＝守衛靜默丟棄");
  assert.equal(tal.spikes, 1);
  // zones.cross（扣球線路）與 routes.cross（攻擊路線）是兩個命名空間，不得互相污染
  assert.equal(tal.zones.cross, 0);
  assert.equal(tal.zones.line, 1);
});

test('Q4 鍵集：生涯層 mergeScouting 對每一條 APPROACH 線都累積得到（舊存檔缺欄位不 crash）', () => {
  const tally = { zones: {}, routes: {}, feints: 0, spikes: 0 };
  for (const kind of Object.keys(APPROACH)) tally.routes[kind] = 2;
  const once = mergeScouting({}, 'north-tech', tally);
  const twice = mergeScouting(once, 'north-tech', tally);
  for (const kind of Object.keys(APPROACH)) {
    assert.equal(twice.scouting['north-tech'].routes[kind], 4,
      `mergeScouting 沒有累積 '${kind}'＝跨場資料層缺一半`);
  }
  // 舊存檔（career.scouting 存在但沒有 routes 欄位）不得 crash
  const legacy = {
    scouting: {
      'north-tech': {
        zones: {
          line: 1, cross: 0, middle: 0, tip: 0,
        },
        feints: 0,
        spikes: 1,
      },
    },
  };
  const migrated = mergeScouting(legacy, 'north-tech', tally);
  assert.equal(migrated.scouting['north-tech'].routes.cross, 2);
  assert.equal(migrated.scouting['north-tech'].routes.tandem, 2);
});

// ---------------- 卷五（2026-08-02）：B 快幾何前置 ----------------
//
// 本段與段 A 同狀態：**只建線、不接抽籤**。沒有人跑得到 bquick，所以 sim-hash
// 必須逐值不變（零率對照的機械保證）。接上戰術入口是下一段的事。
// 這條護欄轉紅的兩種情形，都要求你有意識地處理，不得順手改綠：
//   ① 抽籤誤接 ⇒ 真的有人跑了 B 快，那 sim-hash 基準要一起重寫並附完整驗證
//   ② 幾何被改動 ⇒ 參數是 Sawmah 拍板的（lx −2.2），改它要回頭走裁定流程
test('卷五 B 快：幾何已建、抽籤一格未接（沒有人跑得到 ⇒ 行為零改動）', () => {
  // ① 幾何查得出來，且是 Sawmah 拍板的那組值
  const aim = setAimFor(null, 'A', null, 'bquick');
  assert.equal(aim.lx, -2.2, 'B 快擊球點 lx 被改了（Sawmah 2026-08-02 拍板 −2.2）');
  assert.equal(aim.lz, 1.0, 'B 快應與 A 快同深度帶');
  assert.equal(aim.t, 0.4, 'B 快應與 A 快同一條弧（第一時間快球）');
  assert.ok(APPROACH.bquick, 'B 快的助跑起點沒建');
  assert.equal(APPROACH.bquick.lx, -3.0);
  // ② 方向護欄：**負 lx＝OH 側**。正值就是 C 快（背快），那條裁定 4 明文另立一卷
  assert.ok(aim.lx < 0,
    'B 快跑到二傳背後去了＝那是 C 快（背快），裁定 4 明文另立一卷');
  // ③ 與鄰居的距離：離 A 快要 ≥1.1m（中間攔網手構造上搆不到），
  //    離 left_inside(−1.3)／left(−3.0) 都要錯開
  assert.ok(Math.abs(aim.lx - 0) >= 1.1,
    'B 快離 A 快 <1.1m ⇒ 跟死 A 快的中間攔網手順手就搆到了，分檔失去意義');
  assert.ok(Math.abs(aim.lx - (-1.3)) > 0.5, 'B 快與 left_inside 落點太近');
  assert.ok(Math.abs(aim.lx - (-3.0)) > 0.5, 'B 快與 left 落點太近');
  // ④ 抽籤一格未接：400 波 × 三檔一傳品質，routeKindFor 永遠不產出 bquick
  for (let f = 0; f < 400; f += 1) {
    for (const tier of ['perfect', 'ok', 'poor']) {
      for (const k of OLD_KINDS) {
        const out = routeKindFor(k, { flightId: f, seed: 3, index: f % 4, passTier: tier });
        assert.notEqual(out, 'bquick', 'routeKindFor 產出了 bquick＝抽籤誤接');
      }
    }
  }
  // ⑤ 節奏是線的屬性、無 rng：B 快與 A 快同一檔（第一時間快球）
  assert.equal(tempoFor('bquick', { flightId: 7, seed: 3, index: 2 }), 'one');
  assert.equal(tempoFor('bquick', { flightId: 99, seed: 11, index: 0, passTier: 'ok' }), 'one',
    'B 快的節奏不得隨 flightId／seed／tier 變（那是線的屬性不是骰子）');
});
