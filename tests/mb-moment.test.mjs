// B2 迴歸（試玩回饋 0730 #3）：前排 MB 選擇退防（|z| ≥ 攔網帶）後，
// 「🧱 起跳攔網」讀心面板不得再彈——isMbMoment 原本只查角色＋輪轉序前排，
// 漏了實際站位；contextAction 與自動跳攔早有同一條 nearNet 檢查（單一真相 NEAR_NET_Z）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { mbMomentFor, NEAR_NET_Z } from '../src/input/matchControls.js';
import { isFrontRow } from '../src/sim/rotation.js';

// 佈置：對手（B）持球第二觸＝讀舉球時刻；受測者＝A 隊前排 MB
function rigMbMoment() {
  const g = createGame({ seed: 7 });
  const rot = g.match.rotations.A;
  const mb = rot.find((id) => isFrontRow(rot, id) && g.players[id].currentRole === 'middle');
  assert.ok(mb, '佈置前提：A 隊前排要有攔中');
  g.phase = 'rally';
  g.rally.possession = 'B';
  g.rally.touches = 2;
  return { g, mb };
}

test('B2：前排 MB 貼網＝讀心時刻成立；退防到攔網帶外＝不彈（站位檢查與 contextAction 同一常數）', () => {
  const { g, mb } = rigMbMoment();
  g.actors[mb].z = NEAR_NET_Z - 0.5; // 貼網
  assert.equal(mbMomentFor(g, mb), true, '貼網的前排 MB 該有讀心面板');
  g.actors[mb].z = NEAR_NET_Z + 0.8; // 玩家選擇退防接球
  assert.equal(mbMomentFor(g, mb), false,
    '退防（|z|≥攔網帶）仍判讀心時刻＝攔網鈕誤彈（回饋 #3 的現象）');
});

test('B2 邊界：非前排 MB／非對手第二觸＝一律不彈（原有 gate 不因站位檢查而鬆動）', () => {
  const { g, mb } = rigMbMoment();
  g.actors[mb].z = 0.5;
  g.rally.touches = 1; // 非讀舉球時刻
  assert.equal(mbMomentFor(g, mb), false);
  g.rally.touches = 2;
  g.rally.possession = 'A'; // 我方持球
  assert.equal(mbMomentFor(g, mb), false);
});
