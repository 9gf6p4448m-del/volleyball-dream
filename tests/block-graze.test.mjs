// 擦手（one-touch）三態攔網（07-23 拍板）：攔死／擦手／乾淨過網、
// 擦手不計觸球數且球續入攔網方半場、自家擦過的出界球不得放（letDrop 防呆）、決定論
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

// B 隊扣球即將過網、A3（前排）已起跳開攔網窗
function blockRig(seed) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  b.x = 0; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9; // 衝向 A 半場
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5; // 網前對位
  // 先開攔網窗（blockStartTick），再逐 tick 推進到過網
  stepGame(g, [createIntent({ playerId: 'A3', tick: g.tick, action: 'block' })]);
  for (let i = 0; i < 20 && !g.events.some((e) => e.type === 'BLOCK_TOUCH') && g.phase === 'rally'; i += 1) {
    stepGame(g, [createIntent({ playerId: 'A3', tick: g.tick, action: 'block' })]);
    if (g.ball.z > 1.5 || g.ball.vz < 0) break; // 已明確過網未攔到／被攔回
  }
  return g;
}

test('三態攔網：掃種子應同時出現攔死（彈回攻方）、擦手（續入我方）、乾淨過網', () => {
  let solid = 0;
  let graze = 0;
  let clean = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    const g = blockRig(seed);
    const bt = g.events.find((e) => e.type === 'BLOCK_TOUCH');
    if (!bt) {
      clean += 1;
    } else if (bt.graze) {
      graze += 1;
      assert.equal(g.rally.touches, 0, '擦手不計觸球數（touches 歸零）');
      assert.equal(g.rally.lastTouchTeam, 'A', '擦手記攔網方最後觸球');
      assert.ok(g.ball.vz > 0, '擦手球續入攔網方（A）半場，非彈回');
      assert.ok(g.ball.vy > 0, '擦手球上挑（可救的弧）');
    } else {
      solid += 1;
      assert.ok(g.ball.vz < 0, '攔死球彈回攻方（B）半場');
    }
  }
  assert.ok(solid >= 5, `攔死應出現（實得 ${solid}）`);
  assert.ok(graze >= 5, `擦手應出現（實得 ${graze}）`);
  assert.ok(clean >= 5, `乾淨過網應出現（實得 ${clean}）`);
});

test('letDrop 防呆：自家擦過的球飛向出界＝必須追（不得放球看出界）', () => {
  // 擦手後情境：球在 A 半場、lastTouchTeam=A、touches=0、落點明顯出界
  const rigAfterGraze = (lastTouchTeam) => {
    const g = createGame({ seed: 3 });
    g.phase = 'rally';
    Object.assign(g.rally, {
      profile: 'arc', possession: 'B', touches: 0, lastTouchTeam, lastToucherId: lastTouchTeam === 'A' ? 'A3' : 'B2',
    });
    const b = g.ball;
    b.x = 3.5; b.y = 2.2; b.z = 6; b.vx = 2.5; b.vy = 1; b.vz = 2.5; // 飛向右後深遠出界
    b.px = b.x; b.py = b.y; b.pz = b.z;
    const ai = createAiState();
    aiCollectIntents(g, ai);
    return ai;
  };
  const ours = rigAfterGraze('A'); // 自家擦手的球
  assert.equal(ours.letDrop, false, '自家觸過的球出界＝送分，不得放');
  assert.ok(ours.claimId, '必須派人追');
  const theirs = rigAfterGraze('B'); // 對方打出界的球
  assert.equal(theirs.letDrop, true, '對方的球明顯出界＝放球得分（原行為不變）');
});

test('BLOCK_DECEIVED 事件：假動作騙過攔網手＝發觀測事件（帶 blocker/spiker id）', () => {
  const g = createGame({ seed: 7 });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
    deceiveP: 0.99, // 幾乎必騙（H3 欺敵線性項）
  });
  const b = g.ball;
  b.x = 0; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5;
  stepGame(g, [createIntent({ playerId: 'A3', tick: g.tick, action: 'block' })]);
  for (let i = 0; i < 20 && g.phase === 'rally' && g.ball.z < 1.5; i += 1) {
    stepGame(g, [createIntent({ playerId: 'A3', tick: g.tick, action: 'block' })]);
  }
  const dec = g.events.find((e) => e.type === 'BLOCK_DECEIVED');
  assert.ok(dec, '高欺敵應發 BLOCK_DECEIVED');
  assert.equal(dec.blockerId, 'A3');
  assert.equal(dec.spikerId, 'B2');
  assert.ok(!g.events.some((e) => e.type === 'BLOCK_TOUCH'), '被騙＝整手撲空無攔網觸球');
});

// ---- 主角（A2）攔防雙路驗證（07-24 Sawmah：確認主角攔網真的碰得到球）----

// B 隊扣球衝向 A2 防區；byPlayer 控制 A2 要攔網（開窗）還是退下防守（無攔網 intent）
function playerRig(seed, { block }) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  b.x = 0; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  if (block) {
    g.actors.A2.x = 0; g.actors.A2.z = 0.5; // 網前對位（第一視角攔網模式的站位）
  } else {
    g.actors.A2.x = 0; g.actors.A2.z = 5.5; // 退下防守
  }
  return g;
}

test('主角攔網生效：A2 開窗對位＝與 AI 同一條 tryBlock 路——攔死/擦手真的記在 A2 頭上', () => {
  let touched = 0;
  let clean = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    const g = playerRig(seed, { block: true });
    stepGame(g, [createIntent({ playerId: 'A2', tick: g.tick, action: 'block' })]);
    for (let i = 0; i < 20 && g.phase === 'rally' && g.ball.z < 1.5 && g.ball.vz > 0; i += 1) {
      stepGame(g, [createIntent({ playerId: 'A2', tick: g.tick, action: 'block' })]);
    }
    const bt = g.events.find((e) => e.type === 'BLOCK_TOUCH');
    if (bt) {
      touched += 1;
      assert.equal(bt.playerId, 'A2', '攔網觸球必須記在主角頭上（非幻影/非隊友代領）');
    } else {
      clean += 1;
    }
  }
  // 攔死+擦手合計應在合理帶（chance~0.35+graze~0.2×時機檔）——「根本碰不到球」＝不成立
  assert.ok(touched >= 25, `120 球主角應碰到相當比例（實得 ${touched}）`);
  assert.ok(clean >= 25, `也有乾淨過網（機率制非必中，實得 ${clean}）`);
});

test('主角退下防守：不按攔網＝零幻影攔網觸球，球過網後 A2 正常接第一觸', () => {
  const g = playerRig(9, { block: false });
  // 球飛越網、無人攔（A2 沒開窗）
  for (let i = 0; i < 200 && g.phase === 'rally'; i += 1) {
    const b = g.ball;
    const dist = Math.hypot(b.x - g.actors.A2.x, b.z - g.actors.A2.z);
    const reachable = dist < 0.9 && b.vy < 0 && b.y < 2.2;
    stepGame(g, reachable
      ? [createIntent({ playerId: 'A2', tick: g.tick, action: 'receive', aim: { x: 1.2, z: 1.2 } })]
      : []);
    if (g.events.some((e) => e.type === 'TOUCH' && e.playerId === 'A2')) break;
  }
  assert.ok(!g.events.some((e) => e.type === 'BLOCK_TOUCH'), '未開攔網窗＝絕無攔網觸球');
  const touch = g.events.find((e) => e.type === 'TOUCH' && e.playerId === 'A2');
  assert.ok(touch, '退下防守應能正常接球');
  assert.equal(touch.kind, 'receive');
  assert.equal(touch.touches, 1, '過網後第一觸（規則正確）');
});

test('擦手決定論：同種子重跑逐值一致', () => {
  for (let seed = 1; seed <= 120; seed += 1) {
    const a = blockRig(seed);
    const bt = a.events.find((e) => e.type === 'BLOCK_TOUCH');
    if (bt?.graze) {
      const b = blockRig(seed);
      const bt2 = b.events.find((e) => e.type === 'BLOCK_TOUCH');
      assert.equal(bt2?.graze, true);
      assert.equal(a.ball.vx, b.ball.vx);
      assert.equal(a.ball.vy, b.ball.vy);
      return;
    }
  }
  assert.fail('120 種子內應出現擦手');
});
