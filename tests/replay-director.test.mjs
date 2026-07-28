// Phase 4.6 §4-2／§9-2 — 導播決定論：同一顆球的鏡頭腳本逐格一致。
// 回放要能當敘事素材反覆使用（宿敵典藏尤其），鏡頭必須是「被導演過的」而非每次不同。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createRallyRecorder } from '../src/app/rallyTape.js';
import {
  buildDirectorScript, stepAt, shotAt, narrateTape, SLOW_SPEED,
} from '../src/render/replayDirector.js';

// 錄一顆全 AI 的球（v2 卷：玩家側無 Intent＝所有人都由 AI 重算）
function recordRally(seed) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  let guard = 0;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve') rec.begin(game, ai);
    rec.step(game, ai, null, []);
    const events = stepGame(game, aiCollectIntents(game, ai));
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return rec.end();
}

test('導播決策序列決定論：同一卷兩次建腳本 deepEqual', () => {
  const tape = recordRally(11);
  const a = buildDirectorScript(tape);
  const b = buildDirectorScript(tape);
  assert.deepEqual(a.shots, b.shots);
  assert.deepEqual(a.segments, b.segments);
  assert.equal(a.totalMs, b.totalMs);
});

test('腳本骨架：發球中景起手、決定性一拍 sig、落點收尾 line 構圖', () => {
  const tape = recordRally(11);
  const script = buildDirectorScript(tape);
  assert.ok(script.shots.length >= 2, '至少要有起手與收尾兩鏡');
  assert.equal(script.shots[0].step, 0);
  assert.equal(script.shots[0].cam.mode, 'third');
  const last = script.shots[script.shots.length - 1];
  assert.equal(last.cam.mode, 'sig');
  assert.equal(last.cam.sig.kind, 'line', '落點收尾＝重用「邊線是我的」構圖');
  // 鏡位語彙只用既有三種模式——不新增第五模板（4.5B 矩陣紀律）
  for (const s of script.shots) assert.ok(['third', 'sset', 'sig'].includes(s.cam.mode));
  // sig 構圖只在既有四種 kind 內
  for (const s of script.shots) {
    if (s.cam.sig) assert.ok(['oh', 'mb', 'opp', 'line'].includes(s.cam.sig.kind));
  }
});

test('慢動作分段：決定性一拍之後降速，且時間軸單調', () => {
  const script = buildDirectorScript(recordRally(23));
  const slow = script.segments.filter((s) => s.speed === SLOW_SPEED);
  assert.ok(slow.length >= 1, '決定性一拍～落點必有慢動作段');
  let prev = -1;
  for (const s of script.segments) {
    assert.ok(s.from >= prev, '分段不得回頭');
    prev = s.from;
  }
});

test('stepAt：t=0 起於開場、t=1 恆為最後一步（跳過＝播完同終態）', () => {
  const script = buildDirectorScript(recordRally(11));
  assert.equal(stepAt(script, 0), script.skipTo);
  assert.equal(stepAt(script, 1), script.totalSteps);
  // 單調不倒退
  let prev = -1;
  for (let i = 0; i <= 40; i += 1) {
    const s = stepAt(script, i / 40);
    assert.ok(s >= prev, `t=${i / 40} 的目標步不得回頭`);
    prev = s;
  }
});

test('shotAt：查表決定論、恆有鏡位可用', () => {
  const script = buildDirectorScript(recordRally(11));
  for (let i = 0; i <= script.totalSteps; i += 37) {
    const shot = shotAt(script, i);
    assert.ok(shot && shot.cam, `step ${i} 無鏡位`);
  }
});

test('退化路徑文字卡：誰發球→誰舉→誰扣→結果，不留空白', () => {
  const lines = narrateTape(recordRally(11), (id) => `#${id}`);
  assert.ok(lines.length >= 2);
  assert.ok(lines[0].includes('發球'));
  assert.ok(lines[lines.length - 1].includes('球落地'));
});
