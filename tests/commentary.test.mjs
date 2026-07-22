// 即時播報引擎（純文字邏輯；時間注入、零 DOM）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommentary } from '../src/ui/commentary.js';

const ME = 'A1';

function makeGame({
  score = { A: 0, B: 0 }, servingTeam = 'A', phase = 'serve',
  touches = 0, possession = null, flightId = 0,
} = {}) {
  return {
    phase,
    players: {
      A1: { name: '小夢', teamId: 'A', currentRole: 'outside' },
      A2: { name: 'A隊2號', teamId: 'A', currentRole: 'setter' },
      B1: { name: '白浪高中1號', teamId: 'B', currentRole: 'outside' },
    },
    match: { score, servingTeam, rotations: { A: ['A1', 'A2'], B: ['B1'] } },
    rally: { touches, possession, flightId },
  };
}

test('可操作提示：輪到我發球／舉球給我，永遠壓過節奏點', () => {
  const c = createCommentary();
  const serveGame = makeGame({ servingTeam: 'A' });
  assert.equal(c.line(serveGame, null, ME, 0), '你發球——從面板選個落點！');

  // 塞一個節奏點，再進入「舉球給我」情境——提示必須蓋過節奏點
  const rally = makeGame({ phase: 'rally', touches: 1, possession: 'A' });
  c.onEvents([{ type: 'BLOCK_TOUCH' }], rally, null, 1000, ME);
  const ai = { claimId: ME };
  assert.equal(c.line(rally, ai, ME, 1100), '舉球給你——讀攔網、點攻擊區！');
});

test('環境句：他隊發球顯示隊名；生涯開場 0:0 顯示敵情', () => {
  const plain = createCommentary();
  assert.equal(plain.line(makeGame({ servingTeam: 'B' }), null, ME, 0), '對方發球');

  const withOpp = createCommentary({ name: '白浪高中', trait: '防守黏得可怕' });
  assert.equal(withOpp.line(makeGame({ servingTeam: 'B' }), null, ME, 0),
    '對手 白浪高中：防守黏得可怕');
  // 比分不是 0:0 之後改報發球隊
  assert.equal(withOpp.line(makeGame({ servingTeam: 'B', score: { A: 1, B: 0 } }), null, ME, 0),
    '白浪高中發球');
});

test('節奏點 TTL：快攻舉球顯示、過期後消失', () => {
  const c = createCommentary();
  const g = makeGame({ phase: 'rally', touches: 2, possession: 'B', flightId: 3 });
  c.onEvents([{ type: 'TOUCH', kind: 'set', playerId: 'B1' }], g,
    { attackerId: 'B1', attackKind: 'quick' }, 1000, ME);
  assert.equal(c.line(g, null, ME, 1500), '中路快攻——！');
  assert.equal(c.line(g, null, ME, 5000), ''); // TTL 過期、拍數不足→安靜
});

test('輕吊與全力重扣依 power 分辨', () => {
  const c = createCommentary();
  const g = makeGame({ phase: 'rally', touches: 3, possession: 'B' });
  c.onEvents([{ type: 'TOUCH', kind: 'spike', playerId: 'B1', touches: 3, power: 0.3 }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 100), '輕吊——！');
  c.onEvents([{ type: 'TOUCH', kind: 'spike', playerId: 'B1', touches: 3, power: 1 }], g, null, 200, ME);
  assert.equal(c.line(g, null, ME, 300), '白浪高中1號 全力重扣！');
});

test('敘事：連下 3 分／追平／逆轉（同一分只講最大的事）', () => {
  const c = createCommentary();
  const feed = (score, team, now) => {
    const g = makeGame({ phase: 'rally', score });
    c.onEvents([{ type: 'SCORE', team, score }], g, null, now, ME);
    return c.line(makeGame({ phase: 'rally', score }), null, ME, now + 10);
  };
  assert.equal(feed({ A: 1, B: 0 }, 'A', 0), '');            // 連 1：安靜
  assert.equal(feed({ A: 2, B: 0 }, 'A', 100), '');          // 連 2：安靜
  assert.equal(feed({ A: 3, B: 0 }, 'A', 200), '我方連下 3 分！');
  feed({ A: 3, B: 1 }, 'B', 300);
  feed({ A: 3, B: 2 }, 'B', 400);
  assert.equal(feed({ A: 3, B: 3 }, 'B', 500), '追平了 3:3！'); // 追平蓋過連得分
  assert.equal(feed({ A: 3, B: 4 }, 'B', 600), '對方逆轉超前！'); // 逆轉最大
});

test('長 rally 拍數：SERVE 起算、第 8 拍起播', () => {
  const c = createCommentary();
  const g = makeGame({ phase: 'rally', flightId: 2 });
  c.onEvents([{ type: 'SERVE', playerId: 'B1' }], makeGame({ flightId: 2 }), null, 0, ME);
  g.rally.flightId = 9; // 9-2=7 拍：未達門檻
  assert.equal(c.line(g, null, ME, 9000), '');
  g.rally.flightId = 10; // 8 拍
  assert.equal(c.line(g, null, ME, 9000), '第 8 拍攻防！');
});

test('commentary 純度：零 DOM、零內部時間源（時間全外部注入）', () => {
  const src = readFileSync(new URL('../src/ui/commentary.js', import.meta.url), 'utf8');
  for (const banned of ['document.', 'window.', 'performance.now', 'Date.now(', 'Math.random(']) {
    assert.ok(!src.includes(banned), `commentary.js 不得出現 ${banned}`);
  }
});
