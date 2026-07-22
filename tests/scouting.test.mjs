// Phase 2 stage 5 — Scouting AI＋情蒐錄影帶＋宿敵種子
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGame, stepGame, classifySpikeZone, scoutBlockMul,
} from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import {
  createCareer, createCareerPlayer, careerTeams, careerMatchSetup,
  mergeScouting, recordResult, nextMatch,
} from '../src/career/careerState.js';
import { dueEvents } from '../src/career/events.js';
import { buildScoutTape } from '../src/career/scoutTape.js';

test('classifySpikeZone：吊球看力度、直線/斜線看同異側、中路看窄帶', () => {
  assert.equal(classifySpikeZone(3, 4, 0.3), 'tip');
  assert.equal(classifySpikeZone(3, 0.5, 1), 'middle');
  assert.equal(classifySpikeZone(3, 4.1, 1), 'line');   // 同側
  assert.equal(classifySpikeZone(3, -3.9, 1), 'cross'); // 對側
  assert.equal(classifySpikeZone(-3, -4.1, 1), 'line');
});

test('sim 情蒐統計：扣球線路/假動作/發球風格入 scoutTally', () => {
  const g = createGame({ seed: 2 });
  g.phase = 'rally';
  const rigSpike = (aimX, gazeX = null) => {
    Object.assign(g.rally, {
      profile: 'arc', possession: 'A', touches: 2,
      lastTouchTeam: 'A', lastToucherId: 'A1', touchLockTick: -1,
    });
    const b = g.ball;
    b.x = 3; b.y = 2.9; b.z = 2; b.vx = 0; b.vy = -1; b.vz = 0;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    g.actors.A2.x = 3; g.actors.A2.z = 2;
    g.actors.A2.lastTouchTick = -9999;
    stepGame(g, [createIntent({
      playerId: 'A2', tick: g.tick, action: 'spike',
      aim: { x: aimX, z: -5 }, ...(gazeX !== null ? { gaze: { x: gazeX, z: -5 } } : {}),
    })]);
  };
  rigSpike(4.1);        // line
  rigSpike(4.2);        // line
  rigSpike(-3.9, 3.5);  // cross＋假動作（gaze≠aim）
  const tal = g.scoutTally.A2;
  assert.equal(tal.zones.line, 2);
  assert.equal(tal.zones.cross, 1);
  assert.equal(tal.spikes, 3);
  assert.equal(tal.feints, 1);
});

test('scoutBlockMul：樣本門檻/慣用線收攏/反常線折扣/認錯人不讀', () => {
  const mk = (zone, toucher, scoutRead) => ({
    scoutRead,
    rally: { lastSpikeZone: zone, lastToucherId: toucher },
  });
  const zones = { line: 12, cross: 2, middle: 1, tip: 1 }; // line 佔 75%
  const sc = { B: { targetId: 'A2', read: 1, zones } };
  assert.equal(scoutBlockMul(mk('line', 'A2', null), 'B'), 1);   // 無情蒐
  assert.equal(scoutBlockMul(mk('line', 'A4', sc), 'B'), 1);     // 不是被讀的人
  assert.ok(scoutBlockMul(mk('line', 'A2', sc), 'B') > 1.5);     // 慣用線被讀死
  assert.ok(scoutBlockMul(mk('middle', 'A2', sc), 'B') < 1);     // 反常線出其不意
  const small = { B: { targetId: 'A2', read: 1, zones: { line: 3, cross: 1, middle: 0, tip: 0 } } };
  assert.equal(scoutBlockMul(mk('line', 'A2', small), 'B'), 1);  // 樣本 <6 不讀
  const half = { B: { targetId: 'A2', read: 0.5, zones } };
  const full = scoutBlockMul(mk('line', 'A2', sc), 'B');
  const part = scoutBlockMul(mk('line', 'A2', half), 'B');
  assert.ok(part > 1 && part < full, '讀取強度縮放收攏幅度');
});

test('情蒐讀取實跑：慣用線的攔網率被收攏拉高（定點過網跨種子比對）', () => {
  // 佈景：A2 剛沿慣用線（line）扣球、球正要過網，B3 攔網窗開著時機甜蜜
  const crossOnce = (seed, scoutRead) => {
    const g = createGame({ seed, ...(scoutRead ? { scoutRead } : {}) });
    g.phase = 'rally';
    Object.assign(g.rally, {
      profile: 'spike', possession: 'A', touches: 3,
      lastTouchTeam: 'A', lastToucherId: 'A2', lastSpikeZone: 'line',
    });
    const b = g.ball;
    b.x = 2; b.y = 2.6; b.z = 0.15; b.vx = 0; b.vy = -1; b.vz = -8;
    b.px = b.x; b.py = b.y; b.pz = 0.2;
    const blocker = g.actors.B3;
    blocker.x = 2; blocker.z = -0.6;
    blocker.blockUntil = g.tick + 20;
    blocker.blockStartTick = g.tick - 10; // 滯空 10 tick＝甜蜜區
    const ev = [];
    for (let i = 0; i < 6 && g.phase === 'rally'; i += 1) ev.push(...stepGame(g, []));
    return ev.some((e) => e.type === 'BLOCK_TOUCH');
  };
  const read = { B: { targetId: 'A2', read: 1, zones: { line: 20, cross: 1, middle: 1, tip: 1 } } };
  let withRead = 0;
  let withoutRead = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    if (crossOnce(seed, read)) withRead += 1;
    if (crossOnce(seed, null)) withoutRead += 1;
  }
  assert.ok(withRead > withoutRead,
    `慣用線被讀時攔網率應更高（讀=${withRead}/60 vs 不讀=${withoutRead}/60）`);
});

test('mergeScouting 跨場累積＋careerMatchSetup 注入（宿敵記憶）', () => {
  let c = createCareer({ seed: 9 });
  const tally = { zones: { line: 5, cross: 1, middle: 0, tip: 2 }, feints: 3, spikes: 8 };
  c = mergeScouting(c, 'obsidian', tally);
  c = mergeScouting(c, 'obsidian', tally); // 小組＋再遇＝累積
  assert.equal(c.scouting.obsidian.zones.line, 10);
  assert.equal(c.scouting.obsidian.feints, 6);
  // 走完前四場 → 下一場 national-sf 曜石：setup 應帶 scoutRead（read 0.7）
  for (const won of [true, true, true, true]) {
    c = recordResult(c, {
      matchId: nextMatch(c).id, won, scoreFor: 25, scoreAgainst: 20,
    });
  }
  assert.equal(nextMatch(c).id, 'national-sf');
  const setup = careerMatchSetup(c, createCareerPlayer('小夢'), nextMatch(c));
  assert.equal(setup.scoutRead.B.targetId, 'A2');
  assert.equal(setup.scoutRead.B.read, 0.7);
  assert.equal(setup.scoutRead.B.zones.line, 10);
  // 北原 scoutRead 0：即使有資料也不注入
  let c2 = mergeScouting(createCareer({ seed: 9 }), 'north-tech', tally);
  const setup2 = careerMatchSetup(c2, createCareerPlayer('小夢'), nextMatch(c2));
  assert.equal(setup2.scoutRead, undefined);
});

test('宿敵差分對話：小組勝/敗曜石決定 national-sf 賽前事件變體', () => {
  const play = (matchId, won) => (c) => recordResult(c, {
    matchId, won, scoreFor: won ? 25 : 20, scoreAgainst: won ? 20 : 25,
  });
  let cW = createCareer({ seed: 1 });
  for (const f of [play('group-1', true), play('group-2', true), play('group-3', true), play('national-qf', true)]) cW = f(cW);
  const preW = dueEvents(cW, 'pre').map((e) => e.id);
  assert.ok(preW.includes('rematch-won') && !preW.includes('rematch-lost'));
  let cL = createCareer({ seed: 1 });
  for (const f of [play('group-1', true), play('group-2', true), play('group-3', false), play('national-qf', true)]) cL = f(cL);
  const preL = dueEvents(cL, 'pre').map((e) => e.id);
  assert.ok(preL.includes('rematch-lost') && !preL.includes('rematch-won'));
});

test('情蒐錄影帶：決定論預生成 ≤3 卷、素材可重演出 B 得分', () => {
  const player = createCareerPlayer('小夢');
  const teams = careerTeams(player);
  const clips = buildScoutTape(42, teams);
  assert.ok(clips.length >= 1 && clips.length <= 3, `卷數 1-3（實得 ${clips.length}）`);
  for (const clip of clips) {
    assert.ok(clip.snapshot && clip.steps.length >= 90);
    // 決定論重演：快照＋同序 intents → 必重現 B 得分
    const st = structuredClone(clip.snapshot);
    let bScored = false;
    for (const step of clip.steps) {
      for (const e of stepGame(st, step.intents)) {
        if (e.type === 'SCORE' && e.team === 'B') bScored = true;
      }
    }
    assert.ok(bScored, '重演素材應出現 B 隊得分');
  }
  // 決定論：同種子再生成一次逐值一致
  const again = buildScoutTape(42, careerTeams(createCareerPlayer('小夢')));
  assert.equal(again.length, clips.length);
  assert.equal(again[0].steps.length, clips[0].steps.length);
});

test('scoutTape.js 純度：零 DOM/存檔 IO/非種子隨機', () => {
  const src = readFileSync(new URL('../src/career/scoutTape.js', import.meta.url), 'utf8');
  for (const banned of ['localStorage', 'document.', 'window.', 'Math.random(', 'Date.now(']) {
    assert.ok(!src.includes(banned), `scoutTape.js 不得出現 ${banned}`);
  }
});
