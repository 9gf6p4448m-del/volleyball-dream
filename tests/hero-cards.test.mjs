// 主角字卡自動驗證（解 07-24 缺口：字卡判定原本只能靠瀏覽器目視／注入假卡，
// 真實觸發條件沒有任何把關）。做法：**真的跑 sim**，用腳本 Intent 打出 Perfect 一傳、
// 攔網碰球、假動作騙贏、回歸建功，把產生的事件流餵進 heroCardFor 斷言字卡如實出現。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, applySubstitution, TUNING } from '../src/sim/game.js';
import { createPlayer } from '../src/sim/player.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createIntent } from '../src/sim/intent.js';
import { heroCardFor, momentumCardFor } from '../src/ui/heroCards.js';

const ME = 'A2'; // 主角槽（生涯固定 A2）
const ctx = (game) => ({ controlledId: ME, playerName: game.players[ME].name });

// 把事件流轉成字卡清單（模擬 matchLoop applyEvents 的字卡出口）
const cardsFrom = (events, game) =>
  events.map((e) => heroCardFor(e, ctx(game))).filter(Boolean);

// 情境治具：把 sim 擺到「來球正墜向主角、由主角接第一觸」的狀態
// （executeTouch／品質計算／事件發射全走真實路徑，只是省掉打到那個局面的過程）
function setupIncomingBall(g) {
  const a = g.actors[ME];
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'arc', touches: 0, possession: 'A',
    lastTouchTeam: 'B', lastToucherId: 'B1', touchLockTick: -1, deceiveP: 0,
  });
  Object.assign(g.ball, { x: a.x, y: 1.5, z: a.z, vx: 0, vy: -2, vz: 0 });
}

test('Perfect 一傳（真 sim executeTouch）：主角 timing=1 接球 → ✨PERFECT! 卡', () => {
  const g = createGame({ seed: 5, setTarget: 25 });
  setupIncomingBall(g);
  const events = stepGame(g, [createIntent({
    playerId: ME, tick: g.tick, action: 'receive',
    aim: { x: 1.2, z: 1.2 }, timing: 1,
  })]);
  const touch = events.find((e) => e.type === 'TOUCH' && e.playerId === ME);
  assert.ok(touch, 'sim 未產生主角觸球事件（情境治具失效）');
  assert.equal(touch.kind, 'receive');
  assert.ok(touch.power >= 0.95, `power 應為完美時機（實際 ${touch.power}）`);
  const cards = cardsFrom(events, g);
  const card = cards.find((c) => c.text === '✨ PERFECT!');
  assert.ok(card, 'Perfect 一傳未產生字卡');
  assert.equal(card.dur, 2400);
  assert.equal(card.pri, 10);
});

test('一般一傳不發卡：同路徑 timing=0.6 → 無 PERFECT（門檻把關）', () => {
  const g = createGame({ seed: 5, setTarget: 25 });
  setupIncomingBall(g);
  const events = stepGame(g, [createIntent({
    playerId: ME, tick: g.tick, action: 'receive',
    aim: { x: 1.2, z: 1.2 }, timing: 0.6,
  })]);
  assert.ok(events.some((e) => e.type === 'TOUCH' && e.playerId === ME), '仍應有觸球');
  assert.equal(cardsFrom(events, g).length, 0);
});

// 情境治具：對方扣球正要過網、主角在網前開著攔網窗（tryBlock 真實擲骰）
// bx：球過網 x——真跑 sim 掃描證實（見 block-graze.test.mjs 的 blockRig 同款關係）
// dx=0（bx 預設 0）落在 body 區＝攔死/乾淨過網由屬性擲骰決定；
// dx∈[0.43,0.5]（帶半寬 0.5、側緣 15%）幾何上恆為 side 擦手——兩者搭配才能湊出兩態。
function setupIncomingSpike(g, bx = 0) {
  const rot = g.match.rotations.A;
  const idx = rot.indexOf(ME);
  if (idx < 1 || idx > 3) { // 確保主角在前排（2/3/4 號位）
    const front = rot[2];
    rot[2] = ME;
    rot[idx] = front;
  }
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', touches: 3, possession: 'B',
    lastTouchTeam: 'B', lastToucherId: 'B4', touchLockTick: -1, deceiveP: 0,
  });
  const a = g.actors[ME];
  a.x = 0; a.z = 0.6;
  a.blockUntil = g.tick + 48;
  a.blockStartTick = g.tick - 10; // 滯空落在甜蜜帶（4-26 tick）
  // y 要高過網頂＋球半徑（否則 collideNet 先把球彈回、根本不過網），且低於攔網手可及
  Object.assign(g.ball, { x: bx, y: 2.75, z: -0.1, vx: 0, vy: 0, vz: 8 });
}

test('攔網碰球（真 sim tryBlock）：主角攔到 → 🧱／👆 卡（分色分文案、兩態都出現過）', () => {
  const seen = new Set();
  // 組一：dx=0（body 區）——掃種子找攔死（屬性擲骰命中率已拉滿，掃描很快收斂）
  for (let seed = 1; seed <= 60 && !seen.has('🧱 攔網拍回！'); seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    g.players[ME].attributes.block = 100; // 提高命中率＝縮短掃描；判定路徑不變
    setupIncomingSpike(g);
    const events = stepGame(g, []);
    const card = cardsFrom(events, g).find((c) => /攔網拍回|擦到了/.test(c.text));
    if (!card) continue;
    const blockEvent = events.find((e) => e.type === 'BLOCK_TOUCH');
    assert.equal(blockEvent.playerId, ME);
    assert.equal(card.dur, 2200);
    assert.equal(card.color, card.text.startsWith('🧱') ? '#ffd166' : '#6ee7ff');
    assert.equal(!!blockEvent.graze, card.text.startsWith('👆'));
    seen.add(card.text);
  }
  // 組二：dx=0.45（side 區）——幾何上必為擦手，body 區的掃描湊不出這態（見治具註解）
  const g = createGame({ seed: 1, setTarget: 25 });
  g.players[ME].attributes.block = 100;
  setupIncomingSpike(g, 0.45);
  const events = stepGame(g, []);
  const card = cardsFrom(events, g).find((c) => /攔網拍回|擦到了/.test(c.text));
  assert.ok(card, 'dx=0.45 應觸發擦手字卡');
  const blockEvent = events.find((e) => e.type === 'BLOCK_TOUCH');
  assert.equal(blockEvent.playerId, ME);
  assert.equal(blockEvent.zone, 'side');
  assert.ok(blockEvent.graze);
  assert.equal(card.text, '👆 擦到了——快補！');
  assert.equal(card.dur, 2200);
  assert.equal(card.color, '#6ee7ff');
  seen.add(card.text);
  assert.equal(seen.size, 2, `應涵蓋攔死＋擦手兩態（實際 ${[...seen].join('、')}）`);
});

test('回歸建功（真 sim）：換下→換回→首顆殺球定勝負 → ⚡ 卡帶主角名', () => {
  const bench = createPlayer({
    id: 'A7', name: '板凳七', teamId: 'A', naturalRole: 'outside', currentRole: 'outside',
    height: 1.87, trust: 20,
    attributes: {
      jump: 55, power: 55, reaction: 55, stamina: 55, speed: 55, control: 55, serve: 55, block: 55,
    },
  });
  const g = createGame({ seed: 33, setTarget: 25, benches: { A: [bench] } });
  const ai = createAiState();
  const step = () => stepGame(g, aiCollectIntents(g, ai));
  const all = [];
  const playUntil = (pred, max = 80000) => {
    for (let i = 0; i < max && !pred(g) && g.phase !== 'set_over'; i += 1) all.push(...step());
  };
  playUntil((s) => s.match.score.A + s.match.score.B >= 1 && s.phase === 'serve');
  assert.equal(applySubstitution(g, { team: 'A', outId: ME, inId: 'A7' }).ok, true);
  const n0 = g.match.score.A + g.match.score.B;
  playUntil((s) => s.match.score.A + s.match.score.B >= n0 + 1 && s.phase === 'serve');
  assert.equal(applySubstitution(g, { team: 'A', outId: 'A7', inId: ME }).ok, true);
  playUntil(() => false); // 打完全場
  const spark = cardsFrom(all, g).filter((c) => c.text.includes('回歸即建功'));
  assert.equal(spark.length, 1, `⚡ 卡應恰好一張（實際 ${spark.length}）`);
  assert.ok(spark[0].text.includes(g.players[ME].name), '⚡ 卡要帶主角名字');
  assert.equal(spark[0].pri, 45); // 最高優先＝停在最顯眼基準位
});

test('氣勢滿檔卡：跨進才發、同檔內不重發、離開再進可重發', () => {
  const M = TUNING.MOMENTUM_MAX;
  assert.equal(momentumCardFor(M - 1, M, M).text, '🔥 氣勢如虹！');
  assert.equal(momentumCardFor(-(M - 1), -M, M).text, '❄ 被壓著打——穩住！');
  assert.equal(momentumCardFor(M, M, M), null); // 同檔內不重發
  assert.equal(momentumCardFor(M - 1, M - 1, M), null); // 未滿檔不發
  assert.equal(momentumCardFor(M, 0, M), null); // 離開不發
  assert.equal(momentumCardFor(0, M, M).dur, 2600); // 離開後再進＝可重發
});

test('非主角事件不發卡（隊友/對手的攔網、Perfect 都不彈主角卡）', () => {
  const g = createGame({ seed: 7 });
  const c = ctx(g);
  assert.equal(heroCardFor({ type: 'BLOCK_TOUCH', playerId: 'A3', team: 'A' }, c), null);
  assert.equal(heroCardFor({ type: 'BLOCK_TOUCH', playerId: 'B1', team: 'B' }, c), null);
  assert.equal(heroCardFor({ type: 'BLOCK_DECEIVED', spikerId: 'A5' }, c), null);
  assert.equal(
    heroCardFor({ type: 'TOUCH', kind: 'receive', playerId: 'A4', power: 1 }, c), null,
  );
  // 主角自己的低品質一傳也不發（門檻 0.95）
  assert.equal(
    heroCardFor({ type: 'TOUCH', kind: 'receive', playerId: ME, power: 0.9 }, c), null,
  );
  // 主角假動作騙贏＝發卡
  assert.equal(heroCardFor({ type: 'BLOCK_DECEIVED', spikerId: ME }, c).text, '🎭 晃過攔網！');
});
