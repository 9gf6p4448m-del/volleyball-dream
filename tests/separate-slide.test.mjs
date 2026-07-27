// 07-28 追修：同隊避讓切向滑移——對向穿越（站位交換交叉路徑）不再頂牛死鎖
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separateTeammates } from '../src/sim/game.js';

const mkState = (a, b) => ({
  match: { rotations: { A: ['A1', 'A2'], B: [] } },
  actors: { A1: { ...a }, A2: { ...b } },
});

test('對向穿越死鎖解除：兩人反向對穿，切向滑移讓他們錯身而過（有限步內完成交換）', () => {
  // A1 要從 x=-1 到 +1、A2 反向——目標交叉＝舊版純徑向的頂牛死鎖情境
  const state = mkState({ x: -1, z: 5 }, { x: 1, z: 5 });
  const SPEED = 0.075; // ≈ 全速步速/tick（moveSpeed×SIM_DT 量級）
  const targets = { A1: { x: 1, z: 5 }, A2: { x: -1, z: 5 } };
  let swapped = false;
  for (let t = 0; t < 600 && !swapped; t += 1) {
    for (const id of ['A1', 'A2']) {
      const a = state.actors[id];
      const dx = targets[id].x - a.x;
      const dz = targets[id].z - a.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        a.x += (dx / len) * SPEED;
        a.z += (dz / len) * SPEED;
      }
    }
    separateTeammates(state);
    swapped = state.actors.A1.x > 0.6 && state.actors.A2.x < -0.6;
  }
  assert.ok(swapped, `600 tick 內未完成錯身（A1.x=${state.actors.A1.x.toFixed(2)}、A2.x=${state.actors.A2.x.toFixed(2)}）＝仍死鎖`);
});

test('距離 ≥ SEP_RADIUS＝完全不動（靜止同伴零擾動）；決定論（同輸入同輸出）', () => {
  const s1 = mkState({ x: -1.8, z: 1.3 }, { x: 1.8, z: 1.3 }); // 掩護對距離 3.6m
  separateTeammates(s1);
  assert.deepEqual(s1.actors.A1, { x: -1.8, z: 1.3 });
  assert.deepEqual(s1.actors.A2, { x: 1.8, z: 1.3 });
  const s2 = mkState({ x: 0, z: 5 }, { x: 0.3, z: 5 });
  const s3 = mkState({ x: 0, z: 5 }, { x: 0.3, z: 5 });
  separateTeammates(s2);
  separateTeammates(s3);
  assert.deepEqual(s2.actors, s3.actors, '同輸入必同輸出');
  const d = Math.hypot(s2.actors.A2.x - s2.actors.A1.x, s2.actors.A2.z - s2.actors.A1.z);
  assert.ok(d > 0.3, '重疊對有被推開');
});
