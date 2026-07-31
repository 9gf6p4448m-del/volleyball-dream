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
  routeKindFor, tempoFor, CROSS_RATE, TAKEOFF, TEMPO_TWO_RATE, TEMPO, AIR_TICKS, setAimFor,
} from '../src/sim/approach.js';
import { TEAM_SIDE, isFrontRow, isBackRow, localToWorld } from '../src/sim/rotation.js';
import { velocityForApex, predictContactPoint } from '../src/sim/flight.js';
import { AI } from '../src/sim/ai.js';

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
    const cross = takeoffSpotFor(team, 'left_inside');
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
    assert.ok(lat('left_inside', team) >= lat('left', team) * 3,
      `交叉橫移 ${lat('left_inside', team).toFixed(2)}m 未達直線 ${lat('left', team).toFixed(2)}m 的三倍`);
    // 起點比直線攻擊更貼邊線（「從外側切進來」的前提）
    const sl = approachStartFor(team, 'left');
    const sc = approachStartFor(team, 'left_inside');
    assert.ok(TEAM_SIDE[team] * sc.x < TEAM_SIDE[team] * sl.x, '交叉起點須比直線更外側');
    // 離網深度同一檔＝攔網手不能靠「他站得比較遠」預先識破
    assert.equal((TEAM_SIDE[team] * sc.z).toFixed(6), (TEAM_SIDE[team] * sl.z).toFixed(6));
  }
});

test('A2 交叉：擊球點離快攻點超過攔網水平涵蓋半徑（跟死快攻的中間攔網手搆不到）', () => {
  const quick = takeoffSpotFor('A', 'quick');
  const cross = takeoffSpotFor('A', 'left_inside');
  const gap = Math.hypot(cross.x - quick.x, cross.z - quick.z);
  assert.ok(gap > TUNING.BLOCK_REACH_X,
    `交叉離快攻點僅 ${gap.toFixed(2)}m，未超過 BLOCK_REACH_X=${TUNING.BLOCK_REACH_X}m`
    + '＝commit 的中間攔網手照樣搆得到，這條路線就沒有戰術意義');
});

test('A2 交叉：仍然留得下助跑段（不得退回網前罰站）', () => {
  const takeoffLz = 1.3 + TAKEOFF.FRONT; // setAimFor('left_inside').lz + 前排退距
  const runway = APPROACH.left_inside.lz - takeoffLz - TAKEOFF.SETTLE;
  assert.ok(runway >= 0.5, `交叉的可跑助跑段只有 ${runway.toFixed(2)}m`);
});

// ---------------- ③ 交叉的成立條件 ----------------

test('A2 交叉：只在一傳到位時出現（ok／poor 檔一律維持直線）', () => {
  let crossSeen = 0;
  for (let f = 0; f < 400; f += 1) {
    for (const tier of ['ok', 'poor']) {
      assert.equal(routeKindFor('left', { flightId: f, seed: 3, index: 1, passTier: tier }), 'left');
    }
    if (routeKindFor('left', { flightId: f, seed: 3, index: 1, passTier: 'perfect' }) === 'left_inside') {
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
  assert.equal(tempoFor('left_inside', { flightId: 1, seed: 1, index: 0 }), 'three');
  const g = createGame({ seed: 3 });
  const pts = attackPointsOf(g, 'A', 'A1', 'perfect');
  const mapped = applyRouteKinds(pts, { flightId: 1, seed: 1, passTier: 'perfect' });
  assert.equal(mapped.length, pts.length);
  for (let i = 0; i < pts.length; i += 1) {
    assert.equal(mapped[i].pid, pts[i].pid);
    assert.equal(mapped[i].rowFactor, pts[i].rowFactor, 'trust 權重的入參不得被路線變體動到');
    assert.ok(mapped[i].kind === pts[i].kind
      || (pts[i].kind === 'left' && mapped[i].kind === 'left_inside'));
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
        // tier＝交叉資格的過濾鍵（S1 後 passTier 不再恆 perfect，routeKindFor 只在
        // perfect 檔擲交叉骰——approach.js:207）。用 ai.passTier 近似；§7 D2 的
        // point 級 tier（接一傳者罰則檔）可能更嚴，殘餘稀釋量小、帶寬 ±12 吸收。
        kinds.push({ kind: ai.attackKind, pid: e.playerId, tier: ai.passTier,
          front: isFrontRow(g.match.rotations[e.team], e.playerId) });
      }
      if (e.type === 'DEAD_BALL') started = {};
    }
  }
  return { kinds, runLat, log };
}

// 07-30（§十 階段五 段 2，t=0.50）：三局語料的交叉樣本掉到剛好 20（貼線紅）——
// 收斂讓 rally 變短、第三擊成立的回合變少（P1(b) 正式觀測項）。依段 1 裁定 ④ 的
// 「取樣到量」同型處置：自 seed 11 起連續取局，收滿各樣本門檻為止、
// 安全上限 8 局；**樣本門檻與行為帶寬（±0.12、三倍、0.3m）一格未動**。
//
// ★ 07-31（攔網分工卷 step2a）第二次「取樣到量」：交叉樣本門檻 20 → 80、上限 8 → 24 局 ★
// 症狀：攔網分工上線後這條轉紅（17.9%，門檻 |share−0.30| < 0.12）。**但那是取樣解析力
// 不足，不是行為變了**——同一條治具把樣本從 4 局加到 24 局實測：
//   基準（3b684a2）23.5%（cross 158／left 514）　本次改動 22.6%（cross 161／left 552）
//   Δ = −0.9pp，二項 SE ≈ 1.6pp ⇒ **0.6 SE ＝分不出**，且兩邊都離帶緣 6.5–7.4pp。
// 4 局語料的分母只有 ~116（SE ≈ 3.7pp），量不動自己那條 ±12pp 的帶＝02 §6.1 條 5 的
// 「樣本數不足以在你關心的位置上區分有與沒有」。門檻 80 讓分母 ≥ ~350（SE ≤ 2.3pp，
// 離帶緣約 3 SE）。**CROSS_RATE 與 ±0.12 帶寬一格未動**——動的只有樣本量。
const runs = [];
{
  const enough = () => {
    const kinds = runs.flatMap((r) => r.kinds);
    const lat = {};
    for (const r of runs) {
      for (const k of Object.keys(r.runLat)) (lat[k] ??= []).push(...r.runLat[k]);
    }
    return kinds.filter((k) => k.kind === 'left_inside').length > 80
      && kinds.filter((k) => k.kind === 'pipe').length > 20
      && (lat.left_inside?.length ?? 0) > 20 && (lat.left?.length ?? 0) > 20;
  };
  for (let seed = 11; seed < 11 + 24 && !enough(); seed += 1) runs.push(runSet(seed));
}
const allKinds = runs.flatMap((r) => r.kinds);
const allLat = {};
for (const r of runs) {
  for (const k of Object.keys(r.runLat)) (allLat[k] ??= []).push(...r.runLat[k]);
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('實跑：交叉真的被打出來，且只給前排邊攻', () => {
  const cross = allKinds.filter((k) => k.kind === 'left_inside');
  // 分母限定交叉**有資格**的樣本（07-30 補償階段治具前提修）：S1 讓 ok／poor 檔
  // 真實出現後，非 perfect 的 left 構造上擲不到交叉骰（approach.js「passTier 必須是
  // perfect」），混進分母＝把名目 30% 稀釋成 30%×perfect 佔比——量的不再是骰子。
  // cross 樣本構造上全為 perfect，不需濾。名目 CROSS_RATE 與帶寬 ±0.12 一格未動。
  const left = allKinds.filter((k) => k.kind === 'left' && k.tier === 'perfect');
  assert.ok(cross.length > 20, `交叉樣本不足（${cross.length}）`);
  for (const c of cross) assert.ok(c.front, '交叉只給前排邊攻');
  const share = cross.length / (cross.length + left.length);
  assert.ok(Math.abs(share - CROSS_RATE) < 0.12,
    `OH 線內交叉佔比 ${(share * 100).toFixed(1)}%（名目 ${CROSS_RATE * 100}%）`);
  // pipe 也真的被打出來（route 系統一員的行為級證據）
  assert.ok(allKinds.filter((k) => k.kind === 'pipe').length > 20, 'pipe 樣本不足');
});

test('實跑：跑交叉的人真的橫移進中間（直線攻擊沒有這個位移）', () => {
  assert.ok(allLat.left_inside?.length > 20 && allLat.left?.length > 20, '樣本不足');
  const mc = mean(allLat.left_inside);
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

// ---------------- 第三檔舉球弧線（§4 遺留的阻塞項；二速仍停派） ----------------
//
// §4 把二速停派的理由是「缺一檔介於快攻 3.4 與高球 5.2 之間的舉球弧」。
// 本輪把那一檔做出來了（TUNING.SHOOT_APEX ＋ 落點外推），但實測顯示它只解決了
// 兩個失敗模式中的一個（詳見 approach.js 的 TEMPO_TWO_RATE 註解），故維持停派。
// 這組測試把「那一檔真的存在且校準過」釘住——它不是死碼，是等一個拍板的功能。

test('第三檔弧線：apex 介於快攻與高球之間，且由 set 的 timing 帶分檔', () => {
  assert.ok(TUNING.QUICK_APEX < TUNING.SHOOT_APEX && TUNING.SHOOT_APEX < TUNING.SET_APEX,
    `SHOOT_APEX ${TUNING.SHOOT_APEX} 必須落在 ${TUNING.QUICK_APEX}～${TUNING.SET_APEX} 之間`);
  const twoAim = setAimFor(null, 'A', null, 'left', 'two');
  const threeAim = setAimFor(null, 'A', null, 'left', 'three');
  assert.ok(twoAim.t >= 0.5 && twoAim.t < 0.65, `二速的 t=${twoAim.t} 未落在第三檔帶內`);
  assert.ok(threeAim.t >= 0.65, '三速仍走高球檔');
  assert.equal(setAimFor(null, 'A', null, 'quick', 'one').t, 0.4, '一速仍走快攻低弧檔');
  // 落點外推：二速的落點比三速更靠標誌桿（弧越低，擊球點越往二傳側縮，要用落點補）
  assert.ok(twoAim.lx < threeAim.lx, '二速的落點須比三速更外側');
});

test('第三檔弧線：實際彈道確認——二速的球墜到扣球窗上緣時人在標誌桿側，且比高球早到', () => {
  const from = { x: 1.2, y: 2.69, z: 1.2 }; // 二傳名目站位＋站舉觸球高度（實測 p50）
  const shot = (tempo) => {
    const aim = setAimFor(null, 'A', null, 'left', tempo);
    const apex = aim.t < 0.5 ? TUNING.QUICK_APEX
      : aim.t < 0.65 ? TUNING.SHOOT_APEX : TUNING.SET_APEX;
    const to = localToWorld('A', aim.lx, aim.lz);
    const v = velocityForApex(from, { x: to.x, y: 0.105, z: to.z }, apex);
    return predictContactPoint({ ...from, vx: v.vx, vy: v.vy, vz: v.vz }, AI.SPIKE_APPROACH_Y);
  };
  const two = shot('two');
  const three = shot('three');
  assert.ok(two.ticks < three.ticks - 10,
    `二速的球沒有比高球明顯快到（${two.ticks} vs ${three.ticks} tick）`);
  // 擊球點不得被拉回中場——這正是 §4「借快攻低弧」那次的失敗模式
  assert.ok(two.x < three.x, `二速的擊球點 ${two.x.toFixed(2)} 比高球 ${three.x.toFixed(2)} 更靠中場`);
  // 名目擊球點（route 用的 takeoffSpotFor）要對得上實際彈道，誤差在一步以內
  const nominal = takeoffSpotFor('A', 'left', 'two');
  assert.ok(Math.abs(nominal.x - two.x) < 0.5,
    `二速的名目擊球點 ${nominal.x.toFixed(2)} 與實際彈道 ${two.x.toFixed(2)} 差太多`);
});

// ★ 2026-07-31 二速解封（route B）——原本的「停派釘子」測試由下面兩條取代 ★
// 舊測試斷言 `TEMPO_TWO_RATE === 0`＋`tempoFor 永不回二速`，那是停派狀態的釘子。
// 解封後它們不再是要守的行為；真正該釘住的是**當初被違反的那個不變量**（見第二條）。

test('二速已解封：邊攻兩種節奏都出得到，比例由 TEMPO_TWO_RATE 控制', () => {
  assert.ok(TEMPO_TWO_RATE > 0, '二速應為解封狀態（2026-07-31 Sawmah 裁定 route B）');
  const seen = new Set();
  for (let f = 0; f < 500; f += 1) {
    for (const k of ['left', 'right']) {
      seen.add(tempoFor(k, { flightId: f, seed: 5, index: 1 }));
    }
  }
  assert.deepEqual([...seen].sort(), ['three', 'two'], '邊攻應同時出得到二速與三速');
  // 一傳 poor 時不給二速（既有規格：勉強的一傳只剩兩翼高球）
  for (let f = 0; f < 200; f += 1) {
    assert.notEqual(tempoFor('left', { flightId: f, seed: 5, index: 1, passTier: 'poor' }), 'two');
  }
});

// ★★ 這一條是本卷最重要的迴歸閘：**二速的滯空窗必須真的接得到球** ★★
//
// 它釘住的是三輪停派期間一直被違反、卻沒有任何測試看得見的不變量：
//   二速起跳在「二傳觸球 − takeoffLead」，滯空 AIR_TICKS；球在「二傳觸球 + flightTicks」到手。
//   要接得到，必須 −takeoffLead ≤ flightTicks ≤ −takeoffLead + AIR_TICKS。
// 舊值 takeoffLead=+3 ⇒ 窗＝[−3, 21]，而 flightTicks 實測 61 ⇒ **恆假**。
//   那不是「調參沒調好」，是定義本身在所有合法輸入下都不可能成立——
//   再多的弧線調整、接觸模型更換都蓋不住（實測：換球體模型後 0% 落在窗內）。
// 把 takeoffLead 改回任何非負值，這條測試就會紅在下面的行為斷言上（不是型別錯或空指標）。
test('二速不變量：滯空窗必須涵蓋球的到達時刻（takeoffLead=+3 時代恆假的那條）', () => {
  const from = { x: 1.2, y: 2.69, z: 1.2 }; // 二傳名目站位＋站舉觸球高度（實測 p50）
  const aim = setAimFor(null, 'A', null, 'left', 'two');
  const to = localToWorld('A', aim.lx, aim.lz);
  const v = velocityForApex(from, { x: to.x, y: 0.105, z: to.z }, TUNING.SHOOT_APEX);
  const hit = predictContactPoint({ ...from, vx: v.vx, vy: v.vy, vz: v.vz }, AI.SPIKE_APPROACH_Y);
  const flightTicks = hit.ticks;               // 二傳觸球 → 球到擊球高度
  const takeoff = -TEMPO.two.takeoffLead;      // 二傳觸球 → 起跳（負 lead ⇒ 觸球後起跳）
  const windowEnd = takeoff + AIR_TICKS;
  assert.ok(takeoff <= flightTicks,
    `二速起跳(${takeoff}) 晚於球到達(${flightTicks})：人還沒跳球就到了`);
  assert.ok(flightTicks <= windowEnd,
    `二速滯空窗 [${takeoff}, ${windowEnd}] 涵蓋不了球到達的 ${flightTicks} tick`
    + `——人會在網前罰站 ${flightTicks - windowEnd} tick 後落地，球才到`);
});
