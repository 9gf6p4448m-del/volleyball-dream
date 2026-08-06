// 位置體檢 2026-08-06 裁定 B1 — 內切主動化（OH 唯一的專屬決定）
//
// 設計依據（實測，`tools/inside-cut-probe.mjs` 150 局 ×2 對手）：內切**不是**白給的強化，
// 對 read 隊淨得分 −8.3pp、對 commit 隊 +10.8pp ⇒ 亂切會虧、讀對才賺，
// 因此不必像夾塞那樣另配代價；但「玩家沒按時不擲骰（走直線）」是本裁定的核心，
// 否則玩家學不到「對誰該切」——本檔就是釘這件事。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeKindFor, applyRouteKinds, CROSS_RATE } from '../src/sim/approach.js';

const OPTS = { flightId: 7, seed: 3, index: 0, passTier: 'perfect' };

test('玩家按了切中路 → 這條線變內切（不擲骰）', () => {
  assert.equal(routeKindFor('left', { ...OPTS, forcedCut: true }), 'left_inside');
});

test('★本裁定的核心★ 玩家沒按 → 走直線，且**不擲骰**（不是 70% 直線，是 100%）', () => {
  // 掃 200 個 flightId：只要有一個回 left_inside，就代表骰子還在替玩家做決定
  for (let f = 1; f <= 200; f += 1) {
    assert.equal(routeKindFor('left', { ...OPTS, flightId: f, forcedCut: false }), 'left',
      `flightId=${f} 在 forcedCut=false 下仍抽到內切＝骰子沒被關掉`);
  }
});

test('★非恆真否證★ 同一組 flightId 不帶 forcedCut 時，骰子照常會抽到內切', () => {
  // 沒有這一條，上面那條「恆為 left」可能只是因為這批 seed 本來就不會中
  let cuts = 0;
  for (let f = 1; f <= 200; f += 1) {
    if (routeKindFor('left', { ...OPTS, flightId: f }) === 'left_inside') cuts += 1;
  }
  assert.ok(cuts > 0 && cuts < 200, `AI 側骰子恆假或恆真（${cuts}/200）`);
  assert.ok(Math.abs(cuts / 200 - CROSS_RATE) < 0.12,
    `AI 側實測比例 ${(cuts / 200).toFixed(3)} 偏離名目 ${CROSS_RATE} 太多`);
});

test('只作用在被指名的那個人：池裡其他人照常擲骰', () => {
  const points = [
    { pid: 'ME', kind: 'left', tier: 'perfect' },
    { pid: 'MATE', kind: 'left', tier: 'perfect' },
  ];
  const out = applyRouteKinds(points, { ...OPTS, cutFor: { pid: 'ME', cut: true } });
  assert.equal(out.find((p) => p.pid === 'ME').kind, 'left_inside');
  // MATE 不在 cutFor 裡 ⇒ 走骰子；掃多個 flightId 確認他兩種都會出現（沒被連坐鎖死）
  const mateKinds = new Set();
  for (let f = 1; f <= 200; f += 1) {
    mateKinds.add(applyRouteKinds(points, { ...OPTS, flightId: f, cutFor: { pid: 'ME', cut: true } })
      .find((p) => p.pid === 'MATE').kind);
  }
  assert.equal(mateKinds.size, 2, `隊友的線被連坐固定成 ${[...mateKinds]}＝cutFor 外溢`);
});

test('★AI 對局零影響★ 沒有 cutFor 時，逐值等於改動前的行為', () => {
  const points = [{ pid: 'A1', kind: 'left', tier: 'perfect' }];
  for (let f = 1; f <= 100; f += 1) {
    const withNull = applyRouteKinds(points, { ...OPTS, flightId: f, cutFor: null });
    const without = applyRouteKinds(points, { ...OPTS, flightId: f });
    assert.deepEqual(withNull, without, `flightId=${f}：帶 cutFor:null 與不帶不一致`);
    // 且與直接呼叫 routeKindFor（不帶 forcedCut）同值＝沒有偷改骰子
    assert.equal(withNull[0].kind, routeKindFor('left', { ...OPTS, flightId: f }));
  }
});

test('非 OH 的線不受影響（右翼／快攻／後排不吃內切）', () => {
  for (const k of ['right', 'quick', 'pipe', 'dball']) {
    assert.equal(routeKindFor(k, { ...OPTS, forcedCut: true }), k, `${k} 被改成了內切`);
  }
});

test('一傳不到位時就算按了也切不了（內切的前提是快攻在池裡）', () => {
  for (const tier of ['ok', 'poor']) {
    assert.equal(routeKindFor('left', { ...OPTS, passTier: tier, forcedCut: true }), 'left',
      `${tier} 檔仍切得出內切＝繞遠路的高球，前提被打破`);
  }
});
