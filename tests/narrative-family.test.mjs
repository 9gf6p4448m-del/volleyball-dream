// 統一敘事卷（2026-08-31，kickoff＝docs/kickoffs/narrative-family-kickoff-20260831.md）
// 三情境（打手出界／吞下去／晃過攔網）歸族＝丙案：統一視覺不加前綴、播報同句型。
// matchLoop 是 rAF/DOM 綁定——字卡層走 source-fact 斷言（bquick-auto 先例）；
// 播報層用 createCommentary 行為直測（commentary.test 先例）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommentary } from '../src/ui/commentary.js';

const ME = 'A1';
function makeGame() {
  return {
    phase: 'rally',
    players: {
      A1: { name: '小夢', teamId: 'A', currentRole: 'outside' },
      A2: { name: 'A隊2號', teamId: 'A', currentRole: 'setter' },
      B1: { name: '白浪高中1號', teamId: 'B', currentRole: 'outside' },
    },
    match: { score: { A: 0, B: 0 }, servingTeam: 'B', rotations: { A: ['A1', 'A2'], B: ['B1'] } },
    rally: { touches: 0, possession: null, flightId: 0 },
  };
}

test('N2 吞下去播報：主詞＝攻擊手（spikerId）、大事層級', () => {
  const c = createCommentary();
  const g = makeGame();
  c.onEvents([{ type: 'BLOCK_SWALLOW', team: 'A', playerId: 'B1', spikerId: 'A1' }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 100).text, '小夢 這球吞進去了！');
});

test('N2 吞下去播報：spikerId 缺（舊存檔/壞資料）→ 講球不講人、不炸', () => {
  const c = createCommentary();
  const g = makeGame();
  c.onEvents([{ type: 'BLOCK_SWALLOW', team: 'A', playerId: 'B1', spikerId: null }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 100).text, '這球吞進去了！');
});

test('N2 打手出界播報：合成事件 NET_DUEL_TOOL、主詞＝攻擊手', () => {
  const c = createCommentary();
  const g = makeGame();
  c.onEvents([{ type: 'NET_DUEL_TOOL', team: 'A', playerId: 'A1' }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 100).text, '小夢 借手得分！');
});

test('N2 打手出界播報：playerId 取不到 → 降級句、不炸', () => {
  const c = createCommentary();
  const g = makeGame();
  c.onEvents([{ type: 'NET_DUEL_TOOL', team: 'A', playerId: null }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 100).text, '借手得分！');
});

// ---- source-fact：字卡層（matchLoop 不可單元執行，斷言生產端字面形狀）----
const loop = readFileSync(new URL('../src/app/matchLoop.js', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../src/ui/heroCards.js', import.meta.url), 'utf8');

function cardProps(src, textNeedle) {
  const line = src.split('\n').find((l) => l.includes(textNeedle));
  assert.ok(line, `找不到字卡：${textNeedle}`);
  const color = line.match(/color:\s*'(#[0-9a-f]+)'/)?.[1];
  const dur = line.match(/dur:\s*(\d+)/)?.[1];
  assert.ok(color && dur, `字卡缺 color/dur：${textNeedle}`);
  return { color, dur };
}

test('N1 打手出界即時字卡存在，且掛在 duel outcome=tool 的守門內', () => {
  assert.ok(loop.includes("✋ 打手出界！"), '缺 tool 即時字卡');
  // 守門形狀：卡片必須在 duel?.outcome === 'tool' 分支內（抓守門行與卡片行的相對位置）
  const gi = loop.indexOf("duel?.outcome === 'tool'");
  const ci = loop.indexOf('✋ 打手出界！');
  assert.ok(gi >= 0 && ci > gi && ci - gi < 400, 'tool 卡不在 duel tool 守門內');
});

test('N3 家族視覺一致：三卡同色（#ffd166）同時長（2200）', () => {
  const tool = cardProps(loop, '✋ 打手出界！');
  const swallow = cardProps(loop, '球被吞下去了');
  const deceive = cardProps(hero, '晃過攔網');
  assert.deepEqual(tool, swallow);
  assert.deepEqual(tool, deceive);
  assert.equal(tool.color, '#ffd166');
  assert.equal(tool.dur, '2200');
});

test('N2 主詞來源：matchLoop 有存 lastSpikeTouch（BLOCK_TOUCH 蓋 lastTouch 的補位）且死球有清', () => {
  assert.ok(loop.includes('s.lastSpikeTouch = { team: e.team, playerId: e.playerId }'), '缺 lastSpikeTouch 追蹤');
  assert.ok(loop.includes('s.lastSpikeTouch = null'), '缺 lastSpikeTouch 清理');
});
