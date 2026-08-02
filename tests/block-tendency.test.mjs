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

// 守方（＝攔網方）的第一名球員：卷六之後賭注是**逐攔網手一份**的，
// 所以問「賭注分佈」一定要指名是誰在賭。取哪一個不影響三條訊號測試要問的事
//（訊號有沒有接上），只要整條測試裡固定同一個人即可。
function blockerOf(game, atkTeam) {
  return game.match.rotations[atkTeam === 'A' ? 'B' : 'A'][0];
}

// 賭注落在誰身上（kind → pid；與探針同一條映射）
function betPid(game, team, passTier = 'perfect', blockerId = null) {
  const t = blockSetterTendency(game, team, { passTier, blockerId: blockerId ?? blockerOf(game, team) });
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

// ★ 護欄改名（卷六 2026-08-02）★ 舊名「只吃隊伍代號」在卷六之後就不誠實了——
// 本函式現在還吃**守方攔網手自己的 pid**（賭注逐人一份，憲法 §2.2 釋義）。
// 但這**不是放寬**：守方攔網手知道自己是誰從來就不是作弊資訊，本護欄禁的一直是
// **攻方** pid（拿得到才等於讀答案）。改名同時把斷言升級成機械執行那條界線，
// 而不是只讓名字誠實。
test('反作弊界線：只吃隊伍代號＋守方自己的 pid；攻方 pid 進不來；回傳不含任何 playerId', () => {
  const game = createGame({ seed: 3 });
  const blockerId = blockerOf(game, 'A');
  const t = blockSetterTendency(game, 'A', { passTier: 'perfect', blockerId });
  assert.ok(t, '正常局面應該讀得出傾向');
  assert.deepEqual(Object.keys(t).sort(), ['kind', 'lx', 'x'], '回傳欄位多了東西（不得夾帶 pid）');
  const ids = new Set(Object.keys(game.players));
  for (const v of Object.values(t)) assert.ok(!ids.has(v), '回傳值裡出現 playerId');

  // ★ 參數語意：餵攻方名冊裡的 pid 必須炸掉 ★
  // 沒有這一條，改名之後「攻方 pid 進不來」就只是註解上的宣稱——誰哪天把攻擊手的 pid
  // 傳進來（他手上就有「這球給誰」的資訊）也不會有任何東西轉紅。逐一驗攻方全員。
  for (const atkPid of game.match.rotations.A) {
    assert.throws(
      () => blockSetterTendency(game, 'A', { passTier: 'perfect', blockerId: atkPid }),
      /blockerId 不得是攻方球員/,
      `餵攻方球員 ${atkPid} 當 blockerId 卻沒被擋下＝反作弊界線只剩註解`,
    );
  }
});

// ★ 卷六驗收 5：分歧的來源必須是「自己是誰」，不得是「輪到誰先算」★
// 方向 B（拿解鎖順序當 salt）已在裁定 2 出局——它把分歧掛在一個沒有任何護欄在守的
// 遍歷順序缺口上。這條就是那道護欄：roll 鍵只吃比分＋seed＋自己的 pid，三項都與
// 誰先被處理無關 ⇒ 打亂處理順序，每個人的賭注必須逐值不變。
test('卷六護欄：打亂攔網手的處理順序，每個人的賭注逐值不變', () => {
  const game = createGame({ seed: 21 });
  const blockers = game.match.rotations.B; // A 進攻 ⇒ B 是守方
  assert.ok(blockers.length >= 2, '守方至少要有兩個人，這條測試才問得出「順序」');
  const { score } = game.match;
  const a0 = score.A;
  const b0 = score.B;
  const collect = (order) => {
    const out = {};
    for (let a = 0; a <= 24; a += 1) {
      score.A = a;
      for (const pid of order) {
        const t = blockSetterTendency(game, 'A', { passTier: 'perfect', blockerId: pid });
        out[`${a}|${pid}`] = t ? `${t.kind}@${t.x.toFixed(6)}` : null;
      }
    }
    return out;
  };
  const forward = collect(blockers);
  const reverse = collect([...blockers].reverse());
  const shuffled = collect([...blockers].sort((p, q) => (p < q ? 1 : -1)));
  score.A = a0;
  score.B = b0;
  assert.deepEqual(reverse, forward, '倒過來處理就換了賭注＝分歧吃到了遍歷順序（方向 B 復活）');
  assert.deepEqual(shuffled, forward, '換一種排序就換了賭注＝分歧吃到了遍歷順序（方向 B 復活）');

  // 非空轉檢查：一個恆定不變的函式也會通過上面兩條。要先確認這批輸入下**真的有分歧**，
  // 順序不變性才是有內容的斷言（否則哪天賭注退化回團隊級單一 roll，這條照樣是綠的）。
  let diverged = 0;
  for (let a = 0; a <= 24; a += 1) {
    const kinds = new Set(blockers.map((pid) => forward[`${a}|${pid}`]));
    if (kinds.size > 1) diverged += 1;
  }
  assert.ok(diverged > 0,
    `掃過 25 個比分，兩名以上攔網手一次都沒賭到不同的東西＝賭注又變回團隊級單一 roll，`
    + '本條的順序不變性就只是在驗一個常數');
});
