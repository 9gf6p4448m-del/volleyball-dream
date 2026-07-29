// 機制包：蓄力輕重（timing→扣球速度）與高低手球質（觸點高度→精度）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGame, stepGame, receiveQualityMul, timingQualityMul,
  receivePerfectMul, TUNING,
} from '../src/sim/game.js';
import {
  createPlayer, standingReach, blockReach, blockTopEdge,
} from '../src/sim/player.js';
import { AIR_TICKS } from '../src/sim/approach.js';
import { createIntent } from '../src/sim/intent.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');

function rigThirdHit(seed) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 2;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A1';
  g.actors.A2.x = 0; g.actors.A2.z = 1.2;
  const b = g.ball;
  b.x = 0; b.y = 3.0; b.z = 1.2;
  b.vx = 0; b.vy = -0.5; b.vz = 0;
  b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;
  return g;
}

function spikeSpeedWithTiming(seed, timing) {
  const g = rigThirdHit(seed);
  const ev = stepGame(g, [
    createIntent({
      playerId: 'A2', tick: g.tick, action: 'spike', aim: { x: 0, z: -6.5 }, timing,
    }),
  ]);
  assert.ok(ev.some((e) => e.type === 'TOUCH' && e.kind === 'spike'), '扣球未成立');
  const b = g.ball;
  return Math.hypot(b.vx, b.vy, b.vz);
}

test('蓄力輕重：timing 蓄滿的扣球明顯快於輕點（輕吊）', () => {
  for (const seed of [1, 7, 42]) {
    const hard = spikeSpeedWithTiming(seed, 1);
    const tip = spikeSpeedWithTiming(seed, 0.05);
    assert.ok(
      tip < hard * 0.75,
      `輕吊未變慢：重扣 ${hard.toFixed(1)} vs 輕吊 ${tip.toFixed(1)} m/s`,
    );
    // 輕吊速度下限守住（不會慢到物理荒謬）
    assert.ok(tip > hard * (TUNING.TIP_SPEED_MIN - 0.08));
  }
});

test('TOUCH 事件帶 power（表現層分輕吊/重扣音效）', () => {
  const g = rigThirdHit(3);
  const ev = stepGame(g, [
    createIntent({
      playerId: 'A2', tick: g.tick, action: 'spike', aim: { x: 0, z: -6.5 }, timing: 0.3,
    }),
  ]);
  const touch = ev.find((e) => e.type === 'TOUCH');
  assert.equal(touch.power, 0.3);
});

test('出手品質：甜蜜區最準、超蓄最飄、其餘標準', () => {
  assert.equal(timingQualityMul(0.85), TUNING.SWEET_ACC);  // 甜蜜區
  assert.equal(timingQualityMul(0.3), 1.0);                // 提前放
  assert.equal(timingQualityMul(1.3), TUNING.OVER_ACC);    // 超蓄
  assert.ok(TUNING.SWEET_ACC < 1 && TUNING.OVER_ACC > 1);
});

test('超蓄懲罰：timing 1.3 的扣球比蓄滿慢（力度掉到 0.85）', () => {
  const full = spikeSpeedWithTiming(21, 1);
  const over = spikeSpeedWithTiming(21, 1.3);
  assert.ok(over < full, `超蓄未變慢：${over.toFixed(1)} vs ${full.toFixed(1)}`);
});

// ---------------- 攔網時機：從乘數換成幾何（§十 階段二 2-B）----------------
//
// 原本這裡是三條 `blockTimingMul` 的檔位映射斷言。2-B 把那顆乘數拆了，
// 時機改由頂邊高度承載，所以斷言的**載體**換了、宣稱的**內容**沒換：
// 「起跳時機會閘住攔網結果」。走 triage 路 a（等價幾何斷言），三條換六條，
// 已由 Sawmah 2026-07-29 簽准並登記於 triage §五「行為斷言改動紀錄」。
//
// 三條紅線（rulings §四）：
//   ① apex 位置不得寫死——從被測函式自己掃出來，測試裡不得出現任何 tick 常數
//   ② 弱單調不是嚴格單調——60Hz 離散化下頂點可能佔兩格
//   ③ 第 5 條的取樣相位也從函式導出，不得手寫 tick 值

// 被測對象：頂邊函式 H(t) = blockTopEdge(player, t)，t ＝起跳後經過 tick
const topEdgeRig = () => createPlayer({
  id: 'T1', name: '測試員', naturalRole: 'middle', height: 190,
  attributes: { jump: 70, power: 50, reaction: 50, stamina: 50, speed: 50, control: 50, serve: 50, block: 70 },
});
const curveOf = (p) => Array.from({ length: AIR_TICKS + 1 }, (_, t) => blockTopEdge(p, t));
// 紅線①：apex 從曲線自己掃出來（argmax），不寫死任何 tick
const apexIndexOf = (h) => h.reduce((best, v, i) => (v > h[best] ? i : best), 0);

test('甲1 頂邊曲線：上升段弱單調（apex 之前不遞減）', () => {
  const h = curveOf(topEdgeRig());
  const apex = apexIndexOf(h);
  for (let t = 1; t <= apex; t += 1) {
    // 紅線②：弱單調——用 >= 不用 >
    assert.ok(h[t] >= h[t - 1], `t=${t} 反而比 t=${t - 1} 低（${h[t]} < ${h[t - 1]}）`);
  }
});

test('甲2 頂邊曲線：下降段弱單調（apex 之後不遞增）', () => {
  const h = curveOf(topEdgeRig());
  const apex = apexIndexOf(h);
  for (let t = apex + 1; t < h.length; t += 1) {
    assert.ok(h[t] <= h[t - 1], `t=${t} 反而比 t=${t - 1} 高（${h[t]} > ${h[t - 1]}）`);
  }
});

test('甲3 頂邊曲線：極大嚴格高於起點（真的有跳起來）', () => {
  const h = curveOf(topEdgeRig());
  assert.ok(h[apexIndexOf(h)] > h[0], '頂點沒有高過起跳那一刻＝這條曲線沒在跳');
});

test('甲4 邊界守恆：H(0) ＝站立頂邊、落地後回到同值（頂邊是高度不是乘數）', () => {
  const p = topEdgeRig();
  // 這一條是這組的靈魂：釘住頂邊是**一條真實高度**，任何人想偷偷塞回乘數形式都會撞牆
  assert.equal(blockTopEdge(p, 0), standingReach(p), 'H(0) 不等於站立摸高');
  assert.equal(blockTopEdge(p, AIR_TICKS), standingReach(p), '落地後沒有回到站立摸高');
  assert.equal(blockTopEdge(p, null), standingReach(p), '沒在跳的時候頂邊不是站立摸高');
  // 頂點＝既有的 blockReach（跳躍頂點），不是另一套數
  const h = curveOf(p);
  assert.ok(Math.abs(h[apexIndexOf(h)] - blockReach(p)) < 1e-9, '頂點與 blockReach 不一致');
});

test('乙5 時機真的閘住攔網：同一顆球、同一名攔網手，接近 apex 過閘、仍在上升不過閘', () => {
  const p = topEdgeRig();
  const h = curveOf(p);
  const apex = apexIndexOf(h);
  // 紅線③：取樣相位也從函式導出，不手寫 tick 值
  const rising = Math.max(0, apex - Math.floor(AIR_TICKS / 3));
  const topAtApex = blockTopEdge(p, apex);
  const topAtRising = blockTopEdge(p, rising);
  assert.ok(topAtRising < topAtApex, '取樣點沒有落在上升段（兩個相位頂邊一樣高）');
  // 同一顆球：高度取在兩個頂邊之間 ⇒ apex 相位搆得到、上升相位搆不到
  const ballY = (topAtRising + topAtApex) / 2;
  const gate = (t) => ballY <= blockTopEdge(p, t) + 0; // 幾何閘門的方向（球心 vs 頂邊）
  assert.ok(gate(apex), '接近頂點時反而搆不到');
  assert.ok(!gate(rising), '還在上升時就已經搆得到＝時機沒有閘住任何東西');
});

test('乙6 靜態掃描：攔網結算區零乘數式時機修正（擋未來有人把乘數塞回來）', () => {
  // 沿 B1-SCAN 范式。擋的是**未來**——有人以「微調手感」為名再塞一顆時機乘數進結算。
  const src = readFileSync(join(SRC, 'game.js'), 'utf8');
  const stripped = src
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  for (const banned of ['blockTimingMul', 'BLOCK_SWEET_MIN', 'BLOCK_SWEET_MAX',
    'BLOCK_LATE_MUL', 'BLOCK_EARLY_MUL']) {
    assert.ok(!stripped.includes(banned),
      `game.js 出現 ${banned}＝乘數式時機修正回來了（時機必須是幾何：player.js blockTopEdge）`);
  }
  // 頂邊必須真的吃相位：呼叫端要把「起跳後經過幾 tick」餵進去
  assert.ok(/blockTopEdge\(\s*p\s*,\s*airT\s*,/.test(stripped),
    'game.js 的攔網高度閘門沒有把起跳相位餵給 blockTopEdge');
});

test('Perfect 接球：timing≥0.95 一傳更準；AI 基準 0.75 拿不到', () => {
  assert.equal(receivePerfectMul(1), TUNING.PERFECT_RECV_ACC);
  assert.equal(receivePerfectMul(0.95), TUNING.PERFECT_RECV_ACC);
  assert.equal(receivePerfectMul(0.75), 1);
  assert.equal(receivePerfectMul(0.6), 1);
});

test('接球品質吃技術屬性：高 control+reaction 球員接球明顯較準（自由人最強）', () => {
  const reach = TUNING.REACH_RADIUS;
  const libero = createPlayer({ id: 'L', name: 'l', teamId: 'A', height: 1.72, attributes: { control: 72, reaction: 74 } });
  const normal = createPlayer({ id: 'N', name: 'n', teamId: 'A', height: 1.9, attributes: { control: 65, reaction: 60 } });
  // 同樣的到位程度，自由人（技術高）散佈乘數明顯較低＝接得準
  assert.ok(receiveQualityMul(1.0, reach, libero) < receiveQualityMul(1.0, reach, normal));
});

test('接球品質：到位程度為次要修正（走到位＜勉強搆，但不主導）', () => {
  const p = createPlayer({ id: 'T', name: 't', teamId: 'A', height: 1.86, attributes: { control: 66, reaction: 62 } });
  const reach = TUNING.REACH_RADIUS;
  const onpoint = receiveQualityMul(0, reach, p);        // 走到球正下方
  const stretch = receiveQualityMul(reach, reach, p);    // 極限勉強搆
  assert.ok(onpoint < stretch, `到位 ${onpoint} 應優於勉強 ${stretch}`);
  // 但到位修正是次要（±10% 量級），不像技術屬性那樣拉開大差距
  assert.ok(stretch / onpoint < 1.3, '到位修正應為次要（<30% 差距）');
  // 魚躍（dist 超過正常 reach）＝到位比例 clamp 到 1
  assert.equal(receiveQualityMul(reach * 1.8, reach, p), stretch);
});
