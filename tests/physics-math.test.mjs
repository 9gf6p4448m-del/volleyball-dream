import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLaunchVelocity,
  predictLandingAnalytical,
  evaluateTiming,
  calculateSpikeVelocity,
  calculateDigVelocity,
  calculateTipVelocity,
  checkBlockCollision,
  checkNetCrossingCollision,
  checkMultiBlockerCrossingCollision,
  TIMING_GRADE,
} from '../src/sim/physicsMath.js';

test('calculateLaunchVelocity：拋物線頂點與落點時間精確解算', () => {
  const start = { x: 0, y: 1.0, z: 0 };
  const target = { x: 5, y: 1.0, z: 0 };
  const apex = 4.0;
  const gravity = 9.81;

  const vel = calculateLaunchVelocity(start, target, apex, gravity);

  // 垂直速度應為 sqrt(2 * g * (apex - start.y))
  const expectedVy = Math.sqrt(2 * gravity * (apex - start.y));
  assert.ok(Math.abs(vel.vy - expectedVy) < 1e-4, `vy應為${expectedVy}，得到${vel.vy}`);

  // 飛行時間對稱：tUp = vy / g, tDown = tUp
  const expectedTime = 2 * (expectedVy / gravity);
  assert.ok(Math.abs(vel.time - expectedTime) < 1e-4, `時間應為${expectedTime}，得到${vel.time}`);

  // 水平速度 vx * time 應恰為 5
  assert.ok(Math.abs(vel.vx * vel.time - 5) < 1e-4, 'vx * time 應恰好到達目標 x');
  assert.equal(vel.vz, 0, 'vz 應為 0');
});

test('predictLandingAnalytical：解析落點與剩餘時間正確', () => {
  const pos = { x: 0, y: 4.0, z: 0 };
  const vel = { vx: 2, vy: 0, vz: 0 }; // 水平初速，從 4m 下落
  const gravity = 9.81;

  const pred = predictLandingAnalytical(pos, vel, 0, gravity);
  const expectedT = Math.sqrt((2 * 4.0) / gravity);
  assert.ok(Math.abs(pred.time - expectedT) < 1e-4, `落地時間應為${expectedT}，得到${pred.time}`);
  assert.ok(Math.abs(pred.x - 2 * expectedT) < 1e-4, 'x 落點應為 vx * t');
  assert.equal(pred.z, 0);
});

test('evaluateTiming：時機分級閾值驗證 (PERFECT/GOOD/LATE/EARLY)', () => {
  const sweetSpot = 2.0;
  const perfect = 0.08;
  const good = 0.18;

  // 正中甜蜜點
  const t1 = evaluateTiming(2.0, sweetSpot, perfect, good);
  assert.equal(t1.grade, TIMING_GRADE.PERFECT);
  assert.equal(t1.score, 1.0);

  // 偏離 0.05s（仍屬 Perfect）
  const t2 = evaluateTiming(2.05, sweetSpot, perfect, good);
  assert.equal(t2.grade, TIMING_GRADE.PERFECT);
  assert.ok(t2.score > 0.7);

  // 偏離 0.12s（屬 Good）
  const t3 = evaluateTiming(2.12, sweetSpot, perfect, good);
  assert.equal(t3.grade, TIMING_GRADE.GOOD);

  // 太晚 (+0.25s)
  const t4 = evaluateTiming(2.25, sweetSpot, perfect, good);
  assert.equal(t4.grade, TIMING_GRADE.LATE);
  assert.equal(t4.score, 0);

  // 太早 (-0.25s)
  const t5 = evaluateTiming(1.75, sweetSpot, perfect, good);
  assert.equal(t5.grade, TIMING_GRADE.EARLY);
  assert.equal(t5.score, 0);
});

test('calculateSpikeVelocity：Perfect 下釘獲得超速與向下推進角', () => {
  const from = { x: 0, y: 3.0, z: 0 };
  const target = { x: 0, z: -5 };

  const spikePerf = calculateSpikeVelocity(from, target, 20, 1.0, TIMING_GRADE.PERFECT);
  const spikeLate = calculateSpikeVelocity(from, target, 20, 0, TIMING_GRADE.LATE);

  assert.ok(spikePerf.speed > spikeLate.speed, 'Perfect扣殺速度應高於Late扣殺');
  assert.ok(spikePerf.vy < 0, '扣殺初始垂直速度應具有向下分量');
});

test('calculateDigVelocity：自主防守站位良好時墊出高品質二傳球', () => {
  const ballPos = { x: 0, y: 0.9, z: 4.0 };
  const goodPlayerPos = { x: 0, y: 0, z: 4.25 }; // 站在球正後方 0.25m
  const farPlayerPos = { x: 2.0, y: 0, z: 4.0 }; // 遠離球

  const digGood = calculateDigVelocity(ballPos, goodPlayerPos);
  const digFar = calculateDigVelocity(ballPos, farPlayerPos);

  assert.equal(digGood.grade, TIMING_GRADE.PERFECT);
  assert.equal(digGood.quality, 1.0);
  assert.ok(digGood.vy > 0, '墊球初速應向上拋起');

  assert.equal(digFar.grade, TIMING_GRADE.MISS);
  assert.ok(digFar.quality < 0.5);
});

test('calculateTipVelocity：輕吊球弧線越過球網', () => {
  const from = { x: 0, y: 2.8, z: 1.0 };
  const target = { x: 0, z: -1.2 };

  const tip = calculateTipVelocity(from, target);
  assert.ok(tip.vy > 0, '輕吊球需有向上微托仰角');
  assert.ok(tip.vz < 0, '需飛向對方半場');
  assert.ok(tip.speed < 15, '輕吊球速度應溫和軟綿');
});

test('checkBlockCollision：攔網正面攔死與邊緣擦手判定', () => {
  const blockerPos = { x: 0, y: 0, z: 0 };
  const blockerReachY = 2.55;

  // 正面撞中手掌中心 (x=0.05, y=2.55, z=0.05, vz=-20)
  const roof = checkBlockCollision(
    { x: 0.05, y: 2.55, z: 0.05 },
    { vx: 0, vy: -2, vz: -20 },
    blockerPos,
    blockerReachY
  );
  assert.equal(roof.hit, true);
  assert.equal(roof.type, 'ROOF');
  assert.ok(roof.reflectedVel.vz > 0, '攔死球應反彈回進攻方半場');
  assert.ok(roof.reflectedVel.vy < 0, '攔死球向下猛扣');

  // 擦手邊緣 (x=0.42, y=2.55, z=0.05)
  const tool = checkBlockCollision(
    { x: 0.42, y: 2.55, z: 0.05 },
    { vx: 0, vy: -2, vz: -20 },
    blockerPos,
    blockerReachY
  );
  assert.equal(tool.hit, true);
  assert.equal(tool.type, 'TOOL');
  assert.ok(tool.reflectedVel.vx > 0, '向外側邊緣偏折');

  // 未碰到手掌 (x=1.8, 太遠)
  const miss = checkBlockCollision(
    { x: 1.8, y: 2.55, z: 0.05 },
    { vx: 0, vy: -2, vz: -20 },
    blockerPos,
    blockerReachY
  );
  assert.equal(miss.hit, false);
  assert.equal(miss.type, 'MISS');
});

test('checkNetCrossingCollision：高速穿網連續射線檢測，避免穿隧穿透手掌', () => {
  const blockerPos = { x: 0, y: 0, z: 0 };
  const blockerReachY = 2.55;

  // 球在前一幀 z=0.35, 當前幀 z=-0.25 (跨過球網且在手掌高度)
  const prevPos = { x: 0.05, y: 2.58, z: 0.35 };
  const currPos = { x: 0.05, y: 2.52, z: -0.25 };
  const vel = { vx: 0, vy: -2, vz: -24 };

  const res = checkNetCrossingCollision(prevPos, currPos, vel, blockerPos, blockerReachY);
  assert.equal(res.hit, true);
  assert.equal(res.type, 'ROOF');
  assert.ok(res.contactPoint, '應回傳穿網切點座標');
  assert.ok(res.contactPoint.z >= 0, '切點應落在球網攔阻面');
});

test('checkMultiBlockerCrossingCollision：雙人攔網壁壘正面攔死、打手出界與穿透判定', () => {
  // 雙人攔網：MB 在 x=-1.8, OPP 在 x=-2.4 (並排封堵 4 號位攻擊)
  const blockers = [
    { id: 'B3', x: -1.8, y: 0.75, z: -0.15, reachY: 2.65, isAirborne: true, blockWidth: 0.8 },
    { id: 'B4', x: -2.4, y: 0.75, z: -0.15, reachY: 2.60, isAirborne: true, blockWidth: 0.8 },
    { id: 'B2', x: 2.0, y: 0, z: -0.2, reachY: 2.50, isAirborne: false, blockWidth: 0.75 }, // 未起跳
  ];

  // 1. 直撞 B4 手掌中心 (x=-2.38) -> ROOF
  const prevPos1 = { x: -2.38, y: 2.62, z: 0.3 };
  const currPos1 = { x: -2.38, y: 2.56, z: -0.2 };
  const vel1 = { vx: 0, vy: -3, vz: -25 };
  const res1 = checkMultiBlockerCrossingCollision(prevPos1, currPos1, vel1, blockers);
  assert.equal(res1.hit, true);
  assert.equal(res1.type, 'ROOF');
  assert.equal(res1.blockerId, 'B4');

  // 2. 擦過 B3 外側邊緣 (x=-1.35) -> TOOL
  const prevPos2 = { x: -1.35, y: 2.62, z: 0.3 };
  const currPos2 = { x: -1.35, y: 2.56, z: -0.2 };
  const res2 = checkMultiBlockerCrossingCollision(prevPos2, currPos2, vel1, blockers);
  assert.equal(res2.hit, true);
  assert.equal(res2.type, 'TOOL');
  assert.equal(res2.blockerId, 'B3');

  // 3. 銳利大斜線避開攔網 (x=0.5) -> MISS (穿透得分)
  const prevPos3 = { x: 0.5, y: 2.50, z: 0.3 };
  const currPos3 = { x: 0.5, y: 2.45, z: -0.2 };
  const res3 = checkMultiBlockerCrossingCollision(prevPos3, currPos3, vel1, blockers);
  assert.equal(res3.hit, false);
  assert.equal(res3.type, 'MISS');
});

test('checkMultiBlockerCrossingCollision：我方雙人攔網對手攻球（attackDirZ = 1）正面攔死', () => {
  // 我方前排攔網：主角 A2 在 x=-1.6, 副攻 A3 在 x=-1.0
  const ourBlockers = [
    { id: 'A2', x: -1.6, y: 0.75, z: 0.15, reachY: 2.65, isAirborne: true, blockWidth: 0.8 },
    { id: 'A3', x: -1.0, y: 0.75, z: 0.15, reachY: 2.65, isAirborne: true, blockWidth: 0.8 },
  ];

  // 對手從 -Z 扣向 +Z (vz = 24)
  const prevPos = { x: -1.58, y: 2.62, z: -0.3 };
  const currPos = { x: -1.58, y: 2.56, z: 0.2 };
  const vel = { vx: 0, vy: -3, vz: 24 };

  const res = checkMultiBlockerCrossingCollision(prevPos, currPos, vel, ourBlockers, 1);
  assert.equal(res.hit, true);
  assert.equal(res.type, 'ROOF');
  assert.equal(res.blockerId, 'A2');
  assert.ok(res.reflectedVel.vz < 0, '攔死球應反彈回對手半場 (vz < 0)');
});



