// 07-28 追修：站位交換槽位指派——同排撞號去重（S＋OPP 同前排卡死互抖的病根）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dutyPosition } from '../src/sim/ai.js';
import { TEAM_SIDE } from '../src/sim/rotation.js';

// 最小 game 樁：dutyPosition 只讀 rotations 與 currentRole
function fakeGame(order, roles) {
  return {
    match: { rotations: { A: order } },
    players: Object.fromEntries(order.map((id, i) => [id, { currentRole: roles[i] }])),
  };
}
const lxOf = (game, pid) => TEAM_SIDE.A * dutyPosition(game, 'A', pid).x;
// 輪轉 index 1/2/3＝前排、0/4/5＝後排（isFrontRow 同源語意）
const FRONT = [1, 2, 3];
const BACK = [0, 4, 5];

test('無撞號輪轉＝原行為逐值不變（OH -3／MB 0／OPP +3；後排 OH 0／MB -3／OPP +3）', () => {
  const g = fakeGame(
    ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
    ['setter', 'outside', 'middle', 'opposite', 'outside', 'middle'],
  );
  assert.equal(lxOf(g, 'A2'), -3); // 前排 OH
  assert.equal(lxOf(g, 'A3'), 0);  // 前排 MB
  assert.equal(lxOf(g, 'A4'), 3);  // 前排 OPP
  assert.equal(lxOf(g, 'A1'), 3);  // 後排 S（右後）
  assert.equal(lxOf(g, 'A5'), 0);  // 後排 OH
  assert.equal(lxOf(g, 'A6'), -3); // 後排 MB
});

test('S＋OPP 同前排（卡死案例）：兩人槽位必不同——先到者佔偏好槽、後者拿最近空槽', () => {
  // 前排＝idx 1/2/3：OPP、MB、S——OPP 與 S 偏好槽同為 +3
  const g = fakeGame(
    ['A2', 'A4', 'A3', 'A1', 'A5', 'A6'],
    ['outside', 'opposite', 'middle', 'setter', 'outside', 'middle'],
  );
  const opp = lxOf(g, 'A4');
  const mb = lxOf(g, 'A3');
  const s = lxOf(g, 'A1');
  assert.notEqual(opp, s, '同排同偏好＝必須分開');
  assert.equal(opp, 3, '輪轉序在前者保住偏好槽');
  assert.equal(mb, 0, 'MB 佔中');
  assert.equal(s, -3, '後者拿唯一空槽（0 已被 MB 佔）');
});

test('任意角色組合：每排三槽恆兩兩相異＋決定論（重呼叫逐值一致）', () => {
  const combos = [
    ['outside', 'outside', 'outside', 'outside', 'outside', 'outside'],
    ['setter', 'setter', 'opposite', 'opposite', 'middle', 'middle'],
    ['libero', 'middle', 'middle', 'setter', 'opposite', 'outside'],
  ];
  for (const roles of combos) {
    const g = fakeGame(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], roles);
    for (const row of [FRONT, BACK]) {
      const ids = row.map((i) => ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'][i]);
      const slots = ids.map((pid) => lxOf(g, pid));
      assert.equal(new Set(slots).size, 3, `${roles.join(',')} 該排槽位重複：${slots}`);
      assert.deepEqual(ids.map((pid) => lxOf(g, pid)), slots, '重呼叫逐值一致');
    }
  }
});
