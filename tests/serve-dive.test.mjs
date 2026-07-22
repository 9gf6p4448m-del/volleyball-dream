// 技術體系改版 — 發球三式（穩定/飄浮/跳躍）＋魚躍救球＋存檔正名遷移＋故事傳授鏈
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { serverId } from '../src/sim/match.js';
import {
  createCareer, createCareerPlayer, careerTeams, recordResult,
} from '../src/career/careerState.js';
import { dueEvents, recordEvent } from '../src/career/events.js';

// 讓 A1（開局發球員）發一顆指定式樣的球，回傳發球後的 game
function serveWith(extra) {
  const g = createGame({ seed: 5 });
  const sid = serverId(g.match);
  for (let i = 0; i < 400 && g.phase === 'serve'; i += 1) {
    stepGame(g, [createIntent({
      playerId: sid, tick: g.tick, action: 'serve',
      aim: { x: 0, z: -7.8 }, ...extra,
    })]);
  }
  assert.equal(g.phase, 'rally', '球要發得出去（測試前提）');
  return g;
}

test('發球三式：飄浮＝serveStyle+較平弧、跳發＝更快、穩定＝基準', () => {
  const stable = serveWith({});
  const float = serveWith({ style: 'float' });
  const jump = serveWith({ timing: 1.15 });
  assert.equal(stable.rally.serveStyle, null);
  assert.equal(float.rally.serveStyle, 'float');
  assert.equal(jump.rally.serveStyle, null); // 跳發不是飄浮
  assert.ok(float.ball.vy < stable.ball.vy, '飄浮弧頂較低（初始 vy 較小）');
  const speed = (g) => Math.hypot(g.ball.vx, g.ball.vz);
  assert.ok(speed(jump) > speed(stable) * 1.15, '跳發明顯更快');
});

test('飄浮接發懲罰：同種子下一傳落點偏差比穩定發球大', () => {
  const receiveAfter = (extra) => {
    const g = serveWith(extra);
    // 讓 B6 在球到位時接（旗標直驅：把球放到 B6 頭上再接）
    const b = g.ball;
    b.x = 0; b.y = 1.2; b.z = -6.5; b.vx = 0; b.vy = -1; b.vz = 0;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    g.actors.B6.x = 0; g.actors.B6.z = -6.6;
    const aim = { x: 1.2 * -1, z: -1.2 }; // B 隊二傳位（世界座標約略值）
    stepGame(g, [createIntent({
      playerId: 'B6', tick: g.tick, action: 'receive', aim,
    })]);
    // 出手後球速向量決定落點趨勢——直接量出手速度向量與 aim 方向的偏差
    return { vx: g.ball.vx, vz: g.ball.vz };
  };
  const s = receiveAfter({});
  const f = receiveAfter({ style: 'float' });
  const dev = (v) => Math.hypot(v.vx - s.vx, v.vz - s.vz);
  assert.ok(dev(f) > 1e-6, '同種子同接球：飄浮球的一傳出手應與穩定球不同（散佈放大）');
});

test('AI 發球風格帶：floatServeRate=1 → AI 發出飄浮球', () => {
  const g = createGame({ seed: 11, aiProfiles: { A: { floatServeRate: 1 } } });
  const ai = createAiState();
  while (g.phase === 'serve' && g.tick < 2000) stepGame(g, aiCollectIntents(g, ai));
  assert.equal(g.rally.serveStyle, 'float');
});

test('魚躍：延伸可及、撲空倒地、恢復期不能動不能觸、未學不會撲', () => {
  const rig = (dive) => {
    const g = createGame({ seed: 9 });
    g.phase = 'rally';
    Object.assign(g.rally, { profile: 'arc', possession: 'B', touches: 0, lastTouchTeam: 'B', lastToucherId: 'B1' });
    const b = g.ball;
    b.x = 0; b.y = 0.6; b.z = 4.9; b.vx = 0; b.vy = -2; b.vz = 0;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    g.actors.A5.x = 0; g.actors.A5.z = 6.5; // 距球 1.6m：正常搆不到、魚躍搆得到
    if (dive === false) g.players.A5.techniques.dive = 0;
    return g;
  };
  // 一般接球搆不到
  const g1 = rig();
  stepGame(g1, [createIntent({ playerId: 'A5', tick: g1.tick, action: 'receive', aim: { x: 0, z: 2 } })]);
  assert.ok(!g1.events.some((e) => e.type === 'TOUCH'), '1.6m 一般接球應搆不到');
  // 魚躍搆得到＋事件 kind dive＋倒地
  const g2 = rig();
  stepGame(g2, [createIntent({ playerId: 'A5', tick: g2.tick, action: 'dive', aim: { x: 0, z: 2 } })]);
  const touch = g2.events.find((e) => e.type === 'TOUCH');
  assert.equal(touch?.kind, 'dive');
  assert.ok(g2.actors.A5.divedUntil > g2.tick, '魚躍後倒地恢復中');
  // 恢復期：移動被鎖
  const zBefore = g2.actors.A5.z;
  for (let i = 0; i < 5; i += 1) {
    stepGame(g2, [createIntent({ playerId: 'A5', tick: g2.tick, move: { x: 0, z: -1 } })]);
  }
  assert.equal(g2.actors.A5.z, zBefore, '倒地中不能移動');
  // 撲空也倒地（風險）
  const g3 = rig();
  g3.ball.x = 8; g3.ball.px = 8; // 球遠在撲不到處
  stepGame(g3, [createIntent({ playerId: 'A5', tick: g3.tick, action: 'dive', aim: { x: 0, z: 2 } })]);
  assert.ok(!g3.events.some((e) => e.type === 'TOUCH'));
  assert.ok(g3.actors.A5.divedUntil > g3.tick, '撲空一樣倒地');
  // 未學：不會撲、也不倒地
  const g4 = rig(false);
  stepGame(g4, [createIntent({ playerId: 'A5', tick: g4.tick, action: 'dive', aim: { x: 0, z: 2 } })]);
  assert.ok(!g4.events.some((e) => e.type === 'TOUCH'));
  assert.equal(g4.actors.A5.divedUntil, -1, '未學魚躍不進倒地狀態');
});

test('存檔正名遷移：powerServe→jumpServe、stage3 前存檔全鎖、缺欄補 0', () => {
  // stage 3 時代存檔（買過強力發球）
  const bought = createCareerPlayer('老手');
  bought.techniques = {
    spike: 1, jumpServe: 1, block: 1, receive: 1, emergencySet: 1,
    tip: 1, powerServe: 1, pipe: 0, feint: 0, feintUses: 0,
  };
  careerTeams(bought);
  assert.equal(bought.techniques.jumpServe, 1, '買過強力→跳發保留');
  assert.equal(bought.techniques.powerServe, undefined, '舊鍵移除');
  assert.equal(bought.techniques.floatServe, 0, '新技術補 0');
  assert.equal(bought.techniques.dive, 0);
  // stage 3 前存檔（技術欄只有老五項；jumpServe:1 是舊熟練度語意）
  const ancient = createCareerPlayer('遠古');
  ancient.techniques = { spike: 1, jumpServe: 1, block: 1, receive: 1, emergencySet: 1 };
  careerTeams(ancient);
  assert.equal(ancient.techniques.jumpServe, 0, '舊熟練度語意歸零＝未習得');
  assert.equal(ancient.techniques.tip, 0);
  assert.equal(ancient.techniques.dive, 0);
  // 只買過吊球的 stage 3 存檔（無 powerServe 鍵）：jumpServe 同樣歸零
  const tipOnly = createCareerPlayer('吊球哥');
  tipOnly.techniques = { spike: 1, jumpServe: 1, block: 1, receive: 1, emergencySet: 1, tip: 1 };
  careerTeams(tipOnly);
  assert.equal(tipOnly.techniques.jumpServe, 0);
  assert.equal(tipOnly.techniques.tip, 1, '買過的吊球保留');
  // 遷移標記冪等：改版後傳授所得的跳發（v:2）不會被再次歸零
  const taught = createCareerPlayer('決賽人');
  taught.techniques.jumpServe = 1; // 隊長傳授
  careerTeams(taught);
  assert.equal(taught.techniques.jumpServe, 1, 'v:2 標記後跳發不受遷移影響');
});

test('故事傳授鏈：六場六招、輸贏都教、決賽前隊長授跳發', () => {
  let c = createCareer({ seed: 1 });
  const teachOf = (moment) => dueEvents(c, moment).filter((e) => e.effect?.unlock);
  const playAndTeach = (matchId, won, expectTech) => {
    c = recordResult(c, { matchId, won, scoreFor: won ? 25 : 20, scoreAgainst: won ? 20 : 25 });
    const teaches = teachOf('post');
    assert.deepEqual(teaches.map((e) => e.effect.unlock), [expectTech],
      `${matchId} 賽後應傳授 ${expectTech}`);
    for (const e of dueEvents(c, 'post')) c = recordEvent(c, e.id);
  };
  for (const e of dueEvents(c, 'pre')) c = recordEvent(c, e.id); // 開幕對話清場
  playAndTeach('group-1', true, 'tip');
  playAndTeach('group-2', false, 'dive');    // 輸球也教
  playAndTeach('group-3', true, 'pipe');
  playAndTeach('national-qf', true, 'floatServe');
  playAndTeach('national-sf', true, 'feint');
  // 決賽前：隊長授跳發（pre 事件）
  const preFinal = dueEvents(c, 'pre').filter((e) => e.effect?.unlock);
  assert.deepEqual(preFinal.map((e) => e.effect.unlock), ['jumpServe']);
});
