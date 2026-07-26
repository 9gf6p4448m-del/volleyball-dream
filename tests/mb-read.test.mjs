// Phase 4 W3 — MB 攔網讀心（blockRead 純函式；工單 §4/§10）
// 線索誠實非全知：只吃可觀察量（一傳品質分檔＋前排助跑動向），不讀 attackerId 真值；
// 三翼歸線正確、決定論、助跑判定邊界。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { mbReadFor, mbPanelTitle } from '../src/input/blockRead.js';

test('三翼歸線：對手前排 OH/MB/OPP 各佔左/中/右，站位 x 有限、翼別互斥', () => {
  const game = createGame({ seed: 3 });
  const read = mbReadFor(game, { passTier: 'perfect' }, 'A2');
  assert.equal(read.tier, 'perfect');
  assert.deepEqual(read.lanes.map((l) => l.key), ['left', 'middle', 'right']);
  for (const lane of read.lanes) {
    assert.ok(Number.isFinite(lane.x), `${lane.key} 站位 x 非數值`);
    assert.ok(lane.attacker, `${lane.key} 應有對手前排攻擊手`);
  }
  // 預設 B 隊前排＝B2(OH)/B3(MB)/B4(OPP)
  assert.equal(read.lanes[0].attacker.pid, 'B2');
  assert.equal(read.lanes[1].attacker.pid, 'B3');
  assert.equal(read.lanes[2].attacker.pid, 'B4');
});

test('助跑線索（誠實觀察）：朝網位移超過門檻＝🏃、原地/退後＝無', () => {
  const game = createGame({ seed: 3 });
  const a = game.actors.B2;
  // 朝網移動：|z| 縮小（B 隊在 z<0 側，朝網＝z 變大朝 0）
  a.pz = -4.0;
  a.z = -3.9;
  assert.equal(mbReadFor(game, null, 'A2').lanes[0].approaching, true);
  // 原地
  a.pz = -4.0;
  a.z = -4.0;
  assert.equal(mbReadFor(game, null, 'A2').lanes[0].approaching, false);
  // 退後（|z| 變大）
  a.pz = -3.9;
  a.z = -4.0;
  assert.equal(mbReadFor(game, null, 'A2').lanes[0].approaching, false);
});

test('決定論＋線索缺席誠實：同 game 兩次讀取逐值相同；無 aiState＝tier null', () => {
  const a = createGame({ seed: 7 });
  const b = createGame({ seed: 7 });
  assert.deepEqual(mbReadFor(a, { passTier: 'ok' }, 'A2'), mbReadFor(b, { passTier: 'ok' }, 'A2'));
  assert.equal(mbReadFor(a, null, 'A2').tier, null);
});

test('面板標題：一傳品質三分支＋缺席預設', () => {
  assert.match(mbPanelTitle('perfect'), /快攻可能/);
  assert.match(mbPanelTitle('ok'), /高球/);
  assert.match(mbPanelTitle('poor'), /兩翼/);
  assert.match(mbPanelTitle(null), /讀舉球/);
});
