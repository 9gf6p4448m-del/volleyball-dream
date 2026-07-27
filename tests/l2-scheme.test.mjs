// W4(P4) 附錄 B — L 2.0 攔防對位：配套語意／B-6 建議品質／B-4 反讀決定論統計／
// blockScheme 站位幾何（封線偏移＋讓開退防）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIG_SCHEMES, schemeByKey, schemeForDig, digSuggestionFor, spikeBiasOf,
  noteScheme, counterReadOf,
} from '../src/input/liberoRead.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

test('B-1 配套語意：封 X・收 Y 互補配對；反查一致；A2 三選項面板同型', () => {
  assert.equal(DIG_SCHEMES.length, 3);
  const bl = schemeByKey('block-line');
  assert.equal(bl.block, 'line');
  assert.equal(bl.dig, 'cross', '封直線＝後排收斜線（守變線）');
  const bc = schemeByKey('block-cross');
  assert.equal(bc.block, 'cross');
  assert.equal(bc.dig, 'line');
  const nb = schemeByKey('no-block');
  assert.equal(nb.block, 'off', '攔手讓開＝無封線層（語意自洽不補償）');
  assert.equal(nb.dig, 'tip');
  // 反查（治具 omni 臂用）：收縮真值 → 配套
  assert.equal(schemeForDig('line').key, 'block-cross');
  assert.equal(schemeForDig('cross').key, 'block-line');
  assert.equal(schemeForDig('tip').key, 'no-block');
  assert.equal(schemeForDig('middle'), null, '中路＝三配套皆不中（W3 裁量點 3 沿用）');
});

test('B-6 建議品質吃標記比重：硬標記＞軟標記＞無標記預設封斜線', () => {
  const mkGame = (spikes, zones) => ({ scoutTally: { B2: { spikes, zones } } });
  const ai = { claimId: 'B2' };
  // 硬標記（n≥3 share≥0.5）
  assert.equal(digSuggestionFor(mkGame(4, { line: 3, cross: 1 }), ai), 'block-line');
  assert.equal(digSuggestionFor(mkGame(4, { cross: 3, line: 1 }), ai), 'block-cross');
  assert.equal(digSuggestionFor(mkGame(4, { tip: 3, line: 1 }), ai), 'no-block');
  // 軟標記（n≥2 share≥0.4——硬標記不成立時的弱統計）
  assert.equal(spikeBiasOf(mkGame(2, { line: 1, cross: 1 }), 'B2'), null, '硬標記不成立');
  assert.equal(spikeBiasOf(mkGame(2, { line: 1, cross: 1 }), 'B2', { soft: true }), 'line');
  assert.equal(digSuggestionFor(mkGame(2, { line: 1, cross: 1 }), ai), 'block-line', '軟標記讓建議有據');
  // 無標記＝預設封斜線
  assert.equal(digSuggestionFor(mkGame(0, {}), ai), 'block-cross');
  assert.equal(digSuggestionFor({}, null), 'block-cross');
});

test('B-4 反讀決定論統計：n≥3 且佔比≥0.5 才觸發；openLine 對映；混配套＝反制', () => {
  let t = null;
  t = noteScheme(t, 'block-line');
  t = noteScheme(t, 'block-line');
  assert.equal(counterReadOf(t), null, '樣本不足（n=2）');
  t = noteScheme(t, 'block-line');
  const c = counterReadOf(t);
  assert.deepEqual(c, { scheme: 'block-line', openLine: 'middle' },
    '封線配套讓開＝中路重扣（兩層讀對後的唯一重扣縫；殺傷保留）');
  // no-block 連用＝讓開強攻線
  let t2 = null;
  for (let i = 0; i < 3; i += 1) t2 = noteScheme(t2, 'no-block');
  assert.deepEqual(counterReadOf(t2), { scheme: 'no-block', openLine: 'cross' });
  // 混配套（佔比跌破 0.5）＝玩家的反制技術
  t = noteScheme(t, 'block-cross');
  t = noteScheme(t, 'no-block');
  t = noteScheme(t, 'block-cross');
  t = noteScheme(t, 'no-block'); // 3/7 ＜ 0.5——單一配套不再過半
  assert.equal(counterReadOf(t), null, `混配套後無單一配套過半（total=${t.total}）`);
  // 決定論：同序列同結果
  assert.deepEqual(counterReadOf(t2), counterReadOf(t2));
});

test('B-1 blockScheme 站位幾何：封直線往邊線側、封斜線往內、讓開＝退攻擊線', () => {
  const posOf = (bias) => {
    const g = createGame({ seed: 11 });
    g.phase = 'rally';
    g.rally.possession = 'B';
    g.rally.touches = 1;
    g.ball.x = 2.5;
    g.ball.z = -3;
    g.ball.y = 3;
    g.ball.vy = 8;
    g.ball.vx = 0;
    g.ball.vz = -0.5;
    const ai = createAiState();
    if (bias) ai.digBias = bias;
    for (let i = 0; i < 95; i += 1) {
      stepGame(g, aiCollectIntents(g, ai));
      if (g.phase !== 'rally') break;
    }
    const mb = g.match.rotations.A.slice(1, 4)
      .map((id) => g.players[id])
      .find((p) => p.currentRole === 'middle');
    return { x: g.actors[mb.id].x, z: g.actors[mb.id].z };
  };
  const base = posOf(null);
  const line = posOf({ team: 'A', choice: 'cross', block: 'line' });
  const cross = posOf({ team: 'A', choice: 'line', block: 'cross' });
  const off = posOf({ team: 'A', choice: 'tip', block: 'off' });
  assert.ok(Math.abs(base.z) < 1.5, `基準：MB 貼網攔網位（z=${base.z.toFixed(2)}）`);
  assert.ok(line.x > base.x + 0.4, `封直線往邊線側（${line.x.toFixed(2)} vs ${base.x.toFixed(2)}）`);
  assert.ok(cross.x < base.x - 0.4, `封斜線往內收（${cross.x.toFixed(2)} vs ${base.x.toFixed(2)}）`);
  assert.ok(Math.abs(off.z) > 1.8, `攔手讓開＝退到攻擊線一帶（z=${off.z.toFixed(2)}）`);
});
