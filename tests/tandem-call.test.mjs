// 夾塞主動化（2026-08-07 Sawmah 裁定：OPP 前排比照 OH 內切）— 純函式層
//
// 這一組守的是**解析層**：`evaluateCombination(type:'tandem', force:true)` 到底
// 跳過了什麼、沒跳過什麼。範式逐項抄 tests/inside-cut-call.test.mjs。
//
// 設計依據（實測，`tools/tandem-revival-probe.mjs` 400 局）：夾塞現在與「無組合 right
// 直線」淨得分打平（57.9% vs 57.9%）、被攔死 1.6% vs 2.5% ⇒ 它不是強度旋鈕，
// 價值是「OPP 有一條只有他能打的線」。因此 force 只跳過觸發骰，**世界閘不動**。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCombination, planCombination, applyComboRoutes, tandemGeometryOf,
  COMBO_RATE, TANDEM_PLAY_RATE,
} from '../src/sim/approach.js';

const BASE = { team: 'A', seed: 3, passTier: 'perfect', type: 'tandem' };
// 前排三人的標準池（OPP 右翼＋MB 快攻＋OH 左翼）——與 attackPointsOf 前排分支同形
const POOL = () => [
  { pid: 'OPP', kind: 'right', rowFactor: 1, tier: 'perfect' },
  { pid: 'MB', kind: 'quick', rowFactor: 1, tier: 'perfect' },
  { pid: 'OH', kind: 'left', rowFactor: 1, tier: 'perfect' },
];
const ev = (points, mainId, opts = {}) =>
  evaluateCombination(points, mainId, { ...BASE, flightId: 7, ...opts });

test('★核心★ force 跳過觸發骰：任何 flightId 叫了都成立（不受 25% 骰子擺佈）', () => {
  let ok = 0;
  for (let f = 1; f <= 200; f += 1) {
    const r = ev(POOL(), 'OPP', { flightId: f, force: true });
    if (r.combo?.type === 'tandem' && r.combo.mainId === 'OPP') ok += 1;
  }
  assert.equal(ok, 200, `force 之下仍有 ${200 - ok}/200 波沒成立＝骰子沒被跳過`);
});

test('★非恆真否證★ 同一批 flightId 不帶 force 時，骰子只讓一部分成立', () => {
  // 沒有這一條，上面那條「200/200」可能只是因為這一型本來就恆成立
  let ok = 0;
  for (let f = 1; f <= 200; f += 1) if (ev(POOL(), 'OPP', { flightId: f }).combo) ok += 1;
  assert.ok(ok > 0 && ok < 200, `AI 側骰子恆假或恆真（${ok}/200）`);
  assert.ok(Math.abs(ok / 200 - COMBO_RATE.tandem) < 0.12,
    `AI 側實測比例 ${(ok / 200).toFixed(3)} 偏離名目 ${COMBO_RATE.tandem} 太多`);
  assert.equal(COMBO_RATE.tandem, TANDEM_PLAY_RATE);
});

test('★force 不跳過結構條件★ 沒有 MB 快攻可夾時，叫了照樣不成立', () => {
  // 「幾何不成立時叫了也不成立」在夾塞上的**真實形狀**：四條幾何只吃 kind，
  // 對 tandem×quick 恆為真（見下一條），真正會擋人的結構條件是「有沒有配合者」。
  const noQuick = POOL().filter((p) => p.kind !== 'quick');
  for (let f = 1; f <= 50; f += 1) {
    const r = ev(noQuick, 'OPP', { flightId: f, force: true });
    assert.equal(r.combo, null, `flightId=${f}：沒有快攻手卻夾塞成立了`);
    assert.equal(r.checks.partner, false);
  }
});

test('★force 不跳過結構條件★ 主攻者的線不是右翼（OPP 專屬）時，叫了照樣不成立', () => {
  for (const mainId of ['MB', 'OH']) {
    const r = ev(POOL(), mainId, { force: true });
    assert.equal(r.combo, null, `${mainId} 也叫得出夾塞＝這條線不再是 OPP 專屬`);
    assert.equal(r.checks.mainKind, false);
  }
});

test('★force 不跳過結構條件★ 一傳不到位（tier 非 perfect）時，叫了照樣不成立', () => {
  for (const tier of ['ok', 'poor']) {
    const pool = POOL().map((p) => ({ ...p, tier }));
    const r = ev(pool, 'OPP', { force: true, passTier: tier });
    assert.equal(r.combo, null, `${tier} 檔仍夾得出來＝跑戰術不吃一傳品質了`);
    assert.equal(r.checks.tier, false);
  }
});

test('★世界閘★ comboScale=0 時，force 也叫不出來（approach.js 裁定乙）', () => {
  // 玩家能跳過的只有骰子，不是世界規則——這場根本沒有組合攻擊時明確叫也叫不出來
  for (let f = 1; f <= 50; f += 1) {
    const r = ev(POOL(), 'OPP', { flightId: f, force: true, comboScale: 0 });
    assert.equal(r.combo, null, `flightId=${f}：comboScale=0 竟被 force 繞過`);
    assert.equal(r.checks.roll, false);
    // 前面每一條結構條件照樣算得出來（關閉期間的診斷不該整片變空白）
    assert.equal(r.checks.partner, true);
  }
  // 反面：scale=1 時同一組輸入必須成立（否則上面的紅是「本來就叫不出來」）
  assert.ok(ev(POOL(), 'OPP', { force: true, comboScale: 1 }).combo);
});

test('不外溢隊友：夾塞只改主攻與配合者兩條線，其餘 point 同一個物件參照', () => {
  const points = POOL();
  const combo = ev(points, 'OPP', { force: true }).combo;
  const out = applyComboRoutes(points, combo);
  assert.equal(out.find((p) => p.pid === 'OPP').kind, 'tandem');
  assert.equal(out.find((p) => p.pid === 'MB').kind, 'quick'); // 誘餌線不變（湧現式）
  const oh = out.find((p) => p.pid === 'OH');
  assert.equal(oh.kind, 'left');
  assert.equal(oh, points.find((p) => p.pid === 'OH'), 'OH 被重建了＝改動外溢到第三人');
});

test('★AI 對局零影響★ 自動路徑（planCombination）的 force 恆為預設 false', () => {
  // 這條守的是「玩家的 force 不得漏進 AI 的自動抽籤」：AI 走的 planCombination 沒有
  // force 參數 ⇒ 它產出的夾塞必須**逐波等於**同 flightId 的自然骰結果。
  // 有一格漏了（例如把 force 預設改成 true），這裡就會出現「自動路徑成立、自然骰不成立」。
  let auto = 0;
  for (let f = 1; f <= 200; f += 1) {
    const opts = { ...BASE, type: undefined, flightId: f };
    // planCombination 會依序評估三型（先成立者勝），這裡只比對夾塞那一格
    const got = planCombination(POOL(), 'OPP', opts)?.type === 'tandem';
    const natural = !!ev(POOL(), 'OPP', { flightId: f }).combo;
    assert.equal(got, natural, `flightId=${f}：自動路徑與自然骰不一致＝force 漏進 AI 路徑`);
    if (got) auto += 1;
  }
  assert.ok(auto > 0 && auto < 200, `自動路徑恆假或恆真（${auto}/200）＝這條沒有解析力`);
});

// ★ 不變量掃描（`02 §6.1` 條 6）★ 夾塞的四條幾何只吃 kind ⇒ 對 tandem×quick 是常數。
// 把這件事寫成測試而不是註解：它一旦變成「恆假」，這顆鈕就等於不存在（而 400 局
// 實測開窗率 51% 證明現在是恆真那一側），而恆假不會有任何其他測試抓得到。
test('★不變量★ tandem×quick 的四條幾何恆為真（所以真正擋人的是 partner／tier）', () => {
  for (const team of ['A', 'B']) {
    const g = tandemGeometryOf(team, 'tandem', 'quick');
    assert.deepEqual(
      { lane: g.lane, depth: g.depth, stagger: g.stagger, notCrossing: g.notCrossing },
      { lane: true, depth: true, stagger: true, notCrossing: true },
      `${team} 隊的夾塞幾何不成立＝這顆鈕從出廠就永遠按不出東西`,
    );
  }
  // 反面：換一個不同族的配合者線，四條就不再全真（證明這組判斷有鑑別力、不是恆真函式）
  const bad = tandemGeometryOf('A', 'tandem', 'left');
  assert.ok(!bad.ok, 'tandemGeometryOf 對任何線都回 ok＝這組幾何沒有鑑別力');
});
