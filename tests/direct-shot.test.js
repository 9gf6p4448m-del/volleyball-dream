import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectGame, getDirectPose, stepDirectGame, replayDirectTape, snapshotDirectGame, serializeDirectState } from '../src/sim/directGame.js';

const command = (s, action, shotType) => ({
  tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action, shotType,
});

test('滑動球種在扣球準備期可選，進入觸球期後鎖定且回放一致', () => {
  const state = createDirectGame();
  const initial = snapshotDirectGame(state);
  const commands = [];
  const step = (action, shotType) => {
    const item = command(state, action, shotType);
    commands.push(item);
    stepDirectGame(state, [item]);
  };
  step('spike', 'LINE');
  step(null, 'CROSS_LEFT');
  assert.equal(state.player.shotType, 'CROSS_LEFT');
  step(null, 'TIP');
  assert.equal(state.player.shotType, 'TIP');
  for (let i = 0; i < 14; i++) step(null, 'TIP');
  step(null, 'CROSS_RIGHT');
  assert.equal(state.player.shotType, 'TIP', '觸球窗口開始後不能瞬間改球種');
  assert.equal(serializeDirectState(replayDirectTape({ simulationVersion: state.simulationVersion, initial, commands, endTick: state.tick })), serializeDirectState(state));
});

test('單手吊球實際碰球較輕，重扣速度由不同揮臂路徑產生', () => {
  const speeds = {};
  for (const shotType of ['LINE', 'TIP']) {
    const s = createDirectGame();
    s.player.action = 'spike';
    s.player.actionTick = 15;
    s.player.shotType = shotType;
    s.player.shotBlend = shotType === 'TIP' ? 1 : 0;
    const hand = getDirectPose(s, 0.5).find(part => part.id === 'right-hand').a;
    Object.assign(s.ball, { active: true, x: hand.x, y: hand.y, z: hand.z, vx: 0, vy: 0, vz: 0 });
    stepDirectGame(s);
    assert.equal(s.stats.contacts, 1, `${shotType} 必須由實際身體碰撞觸球`);
    speeds[shotType] = Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz);
  }
  assert.ok(speeds.LINE > speeds.TIP * 2, `重扣 ${speeds.LINE} m/s 與吊球 ${speeds.TIP} m/s 應由揮臂產生不同速度`);
});

test('準備期改選吊球時手臂沿連續路徑轉換，不瞬移跳過碰撞', () => {
  const s = createDirectGame();
  stepDirectGame(s, [command(s, 'spike', 'LINE')]);
  for (let i = 0; i < 10; i++) stepDirectGame(s);
  const before = getDirectPose(s).find(part => part.id === 'right-hand').a;
  s.player.shotType = 'TIP';
  assert.deepEqual(getDirectPose(s).find(part => part.id === 'right-hand').a, before,
    '只更新滑動意圖不能瞬間搬動碰撞手掌');
  s.player.shotType = 'LINE';
  stepDirectGame(s, [command(s, null, 'TIP')]);
  const after = getDirectPose(s).find(part => part.id === 'right-hand').a;
  assert.notDeepEqual(after, before, '手掌需在真實物理子步中移動');
  assert.ok(s.player.shotBlend > 0 && s.player.shotBlend < 1,
    '子步內向吊球姿勢過渡，供連續碰撞掃描');
  assert.equal(s.player.shotType, 'TIP');
});

test('左右斜線用身體朝向改變實際觸球後的橫向球速', () => {
  const across = {};
  for (const [shotType, angle] of [['CROSS_LEFT', -0.45], ['LINE', 0], ['CROSS_RIGHT', 0.45]]) {
    const s = createDirectGame();
    s.player.action = 'spike';
    s.player.actionTick = 15;
    s.player.shotType = shotType;
    s.player.aim = { x: Math.sin(angle), z: -Math.cos(angle) };
    const hand = getDirectPose(s, 0.5).find(part => part.id === 'right-hand').a;
    Object.assign(s.ball, { active: true, x: hand.x, y: hand.y, z: hand.z, vx: 0, vy: 0, vz: 0 });
    stepDirectGame(s);
    assert.equal(s.stats.contacts, 1);
    across[shotType] = s.ball.vx;
  }
  assert.ok(across.CROSS_LEFT < across.LINE - 5);
  assert.ok(across.CROSS_RIGHT > across.LINE + 5);
});
