// 攔網時序卷 段 2（裁定 2＋5）：commit 的賭注方向＝二傳配分傾向
//
// 三個訊號源各驗一條「真的有接上」，外加反作弊界線：
//   ① 攻擊池 trust 權重     —— 換掉 trust 就換掉賭注
//   ② 一傳品質戰術分支     —— passTier 掉檔 ⇒ 快攻不在池裡 ⇒ 不可能賭中路 MB
//   ③ 本場配分歷史         —— 只改歷史（其餘輸入逐值不動）就換掉賭注
//                             ＝「S 玩家刻意打破配分習慣可反制 commit」的直接載體
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { attackPointsOf, blockSetterTendency } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';

function setterOf(game, team) {
  return game.match.rotations[team].find((pid) => game.players[pid]?.currentRole === 'setter') ?? null;
}

// 賭注落在誰身上（kind → pid；與探針同一條映射）
function betPid(game, team, passTier = 'perfect') {
  const t = blockSetterTendency(game, team, { passTier });
  if (!t) return null;
  const pts = attackPointsOf(game, team, setterOf(game, team), passTier);
  return pts.find((p) => p.kind === t.kind)?.pid ?? null;
}

// ★ 賭注是**按權重抽**的（2026-08-01 Sawmah 裁定），所以單次呼叫問不出訊號有沒有接上
//   ——要問的是**分佈**。roll 的鍵是本場比分（一個 rally 內恆定），逐分掃過去就等於
//   在同一組輸入下抽樣整條分佈。這不是替身：跑的是 sim 真正在用的那條路徑。
function betDist(game, team, passTier = 'perfect') {
  const dist = {};
  const { score } = game.match;
  const a0 = score.A;
  const b0 = score.B;
  for (let a = 0; a <= 24; a += 1) {
    for (let b = 0; b <= 24; b += 3) {
      score.A = a;
      score.B = b;
      const pid = betPid(game, team, passTier);
      dist[pid] = (dist[pid] ?? 0) + 1;
    }
  }
  score.A = a0;
  score.B = b0;
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  return { dist, total, shareOf: (pid) => (dist[pid] ?? 0) / total };
}

test('段2-③ 本場配分歷史真的驅動賭注：堆歷史就拉高他被賭的比例（打破配分習慣可反制 commit）', () => {
  const game = createGame({ seed: 7 });
  const pts = attackPointsOf(game, 'A', setterOf(game, 'A'), 'perfect');
  assert.ok(pts.length >= 2, '攻擊池至少要有兩個人，這條測試才問得出「換人」');
  for (const pt of pts) {
    // 本場配分歷史＝可觀察量：把「這一場已經給過誰」逐一換成不同的人
    game.scoutTally = {};
    const withHist = betDist(game, 'A').shareOf(pt.pid);
    for (const p of pts) game.scoutTally[p.pid] = { spikes: p.pid === pt.pid ? 12 : 0 };
    const piled = betDist(game, 'A').shareOf(pt.pid);
    assert.ok(
      piled > withHist,
      `把本場配分歷史全堆到 ${pt.pid}（${pt.kind}）身上，他被賭的比例卻沒上升`
      + `（${(withHist * 100).toFixed(1)}% → ${(piled * 100).toFixed(1)}%）＝歷史這條訊號沒接上`,
    );
  }
});

test('段2-① trust 權重真的驅動賭注：歷史持平時，賭注跟著 trust 走', () => {
  const game = createGame({ seed: 11 });
  const pts = attackPointsOf(game, 'A', setterOf(game, 'A'), 'perfect');
  game.scoutTally = {}; // 歷史全空＝這一項不表態（Laplace 平滑退化成均勻）
  for (const pt of pts) {
    for (const p of pts) game.players[p.pid].trust.fromSetter = 50;
    const flat = betDist(game, 'A').shareOf(pt.pid);
    for (const p of pts) game.players[p.pid].trust.fromSetter = p.pid === pt.pid ? 95 : 20;
    const high = betDist(game, 'A').shareOf(pt.pid);
    assert.ok(
      high > flat,
      `把 ${pt.pid}（${pt.kind}）的 trust 拉到 95、其餘壓到 20，他被賭的比例卻沒上升`
      + `（${(flat * 100).toFixed(1)}% → ${(high * 100).toFixed(1)}%）＝trust 沒接上`,
    );
  }
});

test('段2-② 一傳品質戰術分支：passTier 掉檔後池裡沒有快攻，commit 賭不到中路 MB', () => {
  const game = createGame({ seed: 5 });
  const rot = game.match.rotations.A;
  const mbId = rot.find((pid) => isFrontRow(rot, pid) && game.players[pid].currentRole === 'middle');
  assert.ok(mbId, '這個輪轉前排要有 MB，測試才成立');
  // 把歷史與 trust 全部堆到 MB 身上——到位時他必然是賭注
  game.scoutTally = { [mbId]: { spikes: 30 } };
  game.players[mbId].trust.fromSetter = 99;
  const perfect = betDist(game, 'A', 'perfect').shareOf(mbId);
  assert.ok(perfect > 0, '一傳到位時，全押 MB 的輸入卻一次都沒賭到 MB');
  // 一傳掉到 ok：attackPointsOf 不再把 quick 放進池 ⇒ **結構上**賭不到他（恆 0，不是變少）
  const ok = betDist(game, 'A', 'ok').shareOf(mbId);
  assert.equal(ok, 0, `一傳 ok 時仍有 ${(ok * 100).toFixed(1)}% 賭中路 MB＝戰術分支沒吃到`);
});

test('段2 反作弊：blockSetterTendency 只吃隊伍代號，回傳不含任何 playerId', () => {
  const game = createGame({ seed: 3 });
  const t = blockSetterTendency(game, 'A', { passTier: 'perfect' });
  assert.ok(t, '正常局面應該讀得出傾向');
  assert.deepEqual(Object.keys(t).sort(), ['kind', 'lx', 'x'], '回傳欄位多了東西（不得夾帶 pid）');
  const ids = new Set(Object.keys(game.players));
  for (const v of Object.values(t)) assert.ok(!ids.has(v), '回傳值裡出現 playerId');
});
