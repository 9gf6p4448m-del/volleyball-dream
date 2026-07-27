// W4(P4) Q8 — 多局系列狀態機：系列推進／局間收束重置語意／決勝局 15 分＋8 分換邊／
// 局間存檔決定論（存讀續打＝不中斷逐 tick 等價）／賽制推導／bo1 零擾動
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, startNextSet, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { matchFormatOf, RIVAL_TEAM_ID } from '../src/career/schedule.js';

const MAX_TICKS = 3000000; // 失控保險（bo5 全打滿 ~20 萬 tick 級）

// 推進到下一個終點（set_break 或 set_over）；AI 全代打
function playSet(g, ai) {
  while (g.phase !== 'set_break' && g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  assert.ok(g.tick < MAX_TICKS, '一局未在保險 tick 內收束');
}

// 打完整個系列；每局開局重建 aiState（AI 記憶為 rally 內草稿——局界重建＝
// 局間存檔續玩的同構語意，決定論等價測試依賴此節拍）
function runSeries(g) {
  let ai = createAiState();
  playSet(g, ai);
  let guard = 0;
  while (g.phase === 'set_break' && guard < 6) {
    guard += 1;
    startNextSet(g);
    ai = createAiState();
    playSet(g, ai);
  }
  return g;
}

test('bo3 系列打完：先拿 2 局者勝、事件流健全（SET_END×局數／SET_BREAK×局數−1／MATCH_END×1）', () => {
  const g = runSeries(createGame({ seed: 20260727, setTarget: 15, series: { bestOf: 3 } }));
  assert.equal(g.phase, 'set_over');
  const s = g.series;
  assert.ok(s.over);
  assert.equal(s.setsWon[s.winner], 2);
  const totalSets = s.setsWon.A + s.setsWon.B;
  assert.equal(s.setScores.length, totalSets);
  const count = (type) => g.events.filter((e) => e.type === type).length;
  assert.equal(count('SET_END'), totalSets);
  assert.equal(count('SET_BREAK'), totalSets - 1);
  assert.equal(count('SET_START'), totalSets - 1);
  assert.equal(count('MATCH_END'), 1);
});

test('局間收束/重置語意逐項：氣勢歸零、體力延續＋局間恢復、額度重置、輪轉回開場序、發球權交替', () => {
  const g = createGame({
    seed: 7, setTarget: 15, series: { bestOf: 3 }, stamina: true, momentum: true,
  });
  const ai = createAiState();
  playSet(g, ai);
  assert.equal(g.phase, 'set_break');
  // 人為造髒：氣勢/連得分/額度（真打一局後體力已自然下降）
  g.momentum.value = 2;
  g.subs.A.remaining = 1;
  g.timeouts.B.remaining = 0;
  const staminaBefore = { ...g.stamina };
  const lowIds = Object.keys(staminaBefore).filter((id) => staminaBefore[id] < 0.95);
  assert.ok(lowIds.length > 0, '打完一局應有人體力下降（前提檢查）');
  startNextSet(g);
  assert.equal(g.phase, 'serve');
  assert.equal(g.momentum.value, 0, '氣勢跨局歸零');
  assert.deepEqual(g.pointStreak, { team: null, n: 0 });
  assert.equal(g.subs.A.remaining, TUNING.SUBS_PER_SET, '換人額度每局重置');
  assert.equal(g.timeouts.B.remaining, TUNING.TIMEOUTS_PER_SET, '暫停額度每局重置');
  assert.deepEqual(g.match.score, { A: 0, B: 0 });
  assert.equal(g.match.target, 15, '第 2 局非決勝局＝基礎局分');
  assert.equal(g.match.servingTeam, 'B', '各局首發球權交替（第 2 局 B 發）');
  for (const id of lowIds) {
    assert.ok(g.stamina[id] > staminaBefore[id], `${id} 局間恢復未生效`);
    assert.ok(g.stamina[id] <= 1, '恢復不得超過滿格');
  }
  // 跨局延續（非重置滿格）：掉最深的球員（一局攻擊手 ~0.5）恢復後仍明顯低於滿格
  const deepest = lowIds.sort((a, b) => staminaBefore[a] - staminaBefore[b])[0];
  assert.ok(staminaBefore[deepest] < 0.75, `前提：最累球員應顯著消耗（實際 ${staminaBefore[deepest]}）`);
  assert.ok(g.stamina[deepest] < 1, '最累球員局間恢復後不得回滿（延續非重置）');
  // 輪轉回開場先發序（自由人尚未換入的基準序比對用 serveSeq——setupServePhase 已做 L 替換）
  assert.deepEqual(g.serveSeq.A.order, g.series.startRotations.A);
  assert.equal(g.serveSeq.A.nextIdx, 0);
});

test('決勝局＝15 分＋8 分換邊（一次性 SIDE_SWITCH；事件化）', () => {
  const g = createGame({ seed: 11, setTarget: 25, series: { bestOf: 3 } });
  // 直接注入 1-1 局勢（系列推進語意由上兩測背書；本測聚焦決勝局規則）
  g.series.setsWon = { A: 1, B: 1 };
  g.series.setScores = [{ A: 25, B: 20 }, { A: 21, B: 25 }];
  g.series.setIndex = 2;
  g.phase = 'set_break';
  startNextSet(g);
  assert.equal(g.series.setIndex, 3);
  assert.equal(g.match.target, 15, '決勝局 15 分');
  assert.equal(g.match.servingTeam, 'A', '第 3 局（奇數局）回到 A 發');
  const ai = createAiState();
  playSet(g, ai);
  assert.equal(g.phase, 'set_over');
  assert.ok(g.series.over);
  const switches = g.events.filter((e) => e.type === 'SIDE_SWITCH');
  assert.equal(switches.length, 1, '決勝局換邊恰一次');
  const sc = switches[0].score;
  assert.ok(sc.A === 8 || sc.B === 8, `換邊時刻應為任一隊到 8 分（實際 ${sc.A}:${sc.B}）`);
  assert.equal(g.events.filter((e) => e.type === 'MATCH_END').length, 1);
});

test('局間存檔決定論：JSON 快照續打＝不中斷續打逐事件等價（含終局比分/tick）', () => {
  const make = () => createGame({
    seed: 42, setTarget: 15, series: { bestOf: 3 }, stamina: true, momentum: true,
  });
  const g1 = make();
  playSet(g1, createAiState());
  assert.equal(g1.phase, 'set_break');
  const snapshot = JSON.stringify(g1); // 局間存檔＝整包 sim state 序列化（同 store.saveMidMatch）
  const nBefore = g1.events.length;
  // 路徑 A：不中斷續打
  startNextSet(g1);
  playSet(g1, createAiState());
  // 路徑 B：快照 roundtrip 後續打（＝存檔離開→讀檔續玩）
  const g2 = JSON.parse(snapshot);
  startNextSet(g2);
  playSet(g2, createAiState());
  assert.deepEqual(g2.events.slice(nBefore), g1.events.slice(nBefore), '續打事件流須逐值等價');
  assert.deepEqual(g2.match.score, g1.match.score);
  assert.equal(g2.tick, g1.tick);
  assert.equal(g2.rngState, g1.rngState, 'PRNG 狀態須同步（決定論核心）');
});

test('賽制推導：決賽 bo5／準決賽 bo3／宿敵（天鷹）任何場次 bo3／其餘 bo1', () => {
  assert.equal(matchFormatOf({ id: 'national-final', label: '決賽', opponentId: 'sky-hawk' }), 5);
  assert.equal(matchFormatOf({ id: 'national-sf', label: '準決賽', opponentId: 'obsidian' }), 3);
  assert.equal(matchFormatOf({ id: 'group-2', label: '', opponentId: RIVAL_TEAM_ID }), 3);
  assert.equal(matchFormatOf({ id: 'group-1', label: '', opponentId: 'north-tech' }), 1);
  assert.equal(matchFormatOf({ id: 'national-qf', label: '八強', opponentId: 'iron-mist' }), 1);
  assert.equal(matchFormatOf(null), 1);
});

test('bo1 零擾動：不帶 series＝現行單局（series null、直接 set_over、無 SET_BREAK）；'
  + '且 bo3 的第 1 局與 bo1 同種子逐事件等價', () => {
  const g1 = createGame({ seed: 99, setTarget: 15 });
  const ai1 = createAiState();
  playSet(g1, ai1);
  assert.equal(g1.series, null);
  assert.equal(g1.phase, 'set_over');
  assert.equal(g1.events.filter((e) => e.type === 'SET_BREAK').length, 0);
  const g3 = createGame({ seed: 99, setTarget: 15, series: { bestOf: 3 } });
  const ai3 = createAiState();
  playSet(g3, ai3);
  assert.equal(g3.phase, 'set_break');
  // 第 1 局打法逐事件等價（series 欄位只在局末讀取＝不擾動局中）；bo3 多出 SET_BREAK 尾事件
  const strip = (evs) => evs.filter((e) => e.type !== 'SET_BREAK');
  assert.deepEqual(strip(g3.events), g1.events);
});
