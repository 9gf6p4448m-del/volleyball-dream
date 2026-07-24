// 即時播報引擎（純文字邏輯；時間注入、零 DOM）
// line() 回傳 { text, kind }：action＝可操作提示、beat＝節奏點、ambient＝環境句
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

test('可操作提示（kind=action）：輪到我發球／舉球給我，永遠壓過節奏點', () => {
  const c = createCommentary();
  const serve = c.line(makeGame({ servingTeam: 'A' }), null, ME, 0);
  assert.equal(serve.text, '你發球——從面板選個落點！');
  assert.equal(serve.kind, 'action');

  // 塞一個節奏點，再進入「舉球給我」情境——提示必須蓋過節奏點
  const rally = makeGame({ phase: 'rally', touches: 1, possession: 'A' });
  c.onEvents([{ type: 'BLOCK_TOUCH' }], rally, null, 1000, ME);
  const line = c.line(rally, { claimId: ME }, ME, 1100);
  assert.equal(line.text, '舉球給你——讀攔網、點攻擊區！');
  assert.equal(line.kind, 'action');
});

test('環境句（kind=ambient）：他隊發球顯示隊名；生涯開場 0:0 顯示敵情', () => {
  const plain = createCommentary();
  const l1 = plain.line(makeGame({ servingTeam: 'B' }), null, ME, 0);
  assert.equal(l1.text, '對方發球');
  assert.equal(l1.kind, 'ambient');

  const withOpp = createCommentary({ name: '白浪高中', trait: '防守黏得可怕' });
  assert.equal(withOpp.line(makeGame({ servingTeam: 'B' }), null, ME, 0).text,
    '對手 白浪高中：防守黏得可怕');
  // 比分不是 0:0 之後改報發球隊
  assert.equal(withOpp.line(makeGame({ servingTeam: 'B', score: { A: 1, B: 0 } }), null, ME, 0).text,
    '白浪高中發球');
});

test('節奏點（kind=beat）TTL：快攻舉球顯示、過期後消失', () => {
  const c = createCommentary();
  const g = makeGame({ phase: 'rally', touches: 2, possession: 'B', flightId: 3 });
  c.onEvents([{ type: 'TOUCH', kind: 'set', playerId: 'B1' }], g,
    { attackerId: 'B1', attackKind: 'quick' }, 1000, ME);
  const line = c.line(g, null, ME, 1500);
  assert.equal(line.text, '中路快攻——！');
  assert.equal(line.kind, 'beat');
  assert.equal(c.line(g, null, ME, 5000).text, ''); // TTL 過期、拍數不足→安靜
});

test('輕吊與全力重扣依 power 分辨', () => {
  const c = createCommentary();
  const g = makeGame({ phase: 'rally', touches: 3, possession: 'B' });
  c.onEvents([{ type: 'TOUCH', kind: 'spike', playerId: 'B1', touches: 3, power: 0.3 }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 100).text, '輕吊——！');
  c.onEvents([{ type: 'TOUCH', kind: 'spike', playerId: 'B1', touches: 3, power: 1 }], g, null, 200, ME);
  assert.equal(c.line(g, null, ME, 300).text, '白浪高中1號 全力重扣！');
});

test('敘事：連下 3 分／追平／逆轉（同一分只講最大的事）', () => {
  const c = createCommentary();
  const feed = (score, team, now) => {
    const g = makeGame({ phase: 'rally', score });
    c.onEvents([{ type: 'SCORE', team, score }], g, null, now, ME);
    return c.line(makeGame({ phase: 'rally', score }), null, ME, now + 10).text;
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
  assert.equal(c.line(g, null, ME, 9000).text, '');
  g.rally.flightId = 10; // 8 拍
  assert.equal(c.line(g, null, ME, 9000).text, '第 8 拍攻防！');
});

// W7 A4 附：體力播報節流——獨立 fixture（需要 trust.fromSetter＋完整 rotations 供王牌判定）
function makeStaminaGame({ rotA = ['A1', 'A2'], rotB = ['B1', 'B2'], trust = {} } = {}) {
  const players = {};
  const names = { A1: '小夢', A2: 'A隊2號', B1: '白浪1號', B2: '白浪2號' };
  for (const id of [...rotA, ...rotB]) {
    players[id] = {
      name: names[id] ?? id, teamId: id[0], currentRole: 'outside',
      trust: { fromSetter: trust[id] ?? 50 },
    };
  }
  return {
    phase: 'rally',
    players,
    match: { score: { A: 0, B: 0 }, servingTeam: 'A', rotations: { A: rotA, B: rotB } },
    rally: { touches: 0, possession: null, flightId: 0 },
  };
}

test('體力播報：tier1 每人每場只播一次——重複跨檔（模擬回復後再掉）不再收單', () => {
  const c = createCommentary();
  const g = makeStaminaGame();
  const ME = 'A1'; // 與候選 A2 同隊（隊友，非主角本人）＝我方提醒口吻
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: 'A2', tier: 1 }], g, null, 0, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 0, ME);
  const first = c.line(g, null, ME, 50);
  assert.equal(first.text, 'A隊2號 體力見底，考慮讓他休息');
  assert.equal(first.kind, 'beat');
  // TTL 過期後乾淨重來，再次跨同一 tier1 檔（同一人）——已標記過，不再收單、不再播
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: 'A2', tier: 1 }], g, null, 5000, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 5000, ME);
  assert.equal(c.line(g, null, ME, 5050).text, '');
});

test('體力播報：同一死球窗撞車取王牌（trust.fromSetter 最高者），非先到先播', () => {
  const c = createCommentary();
  const g = makeStaminaGame({ trust: { A1: 80, A2: 50 } }); // A1 為王牌
  const ME = 'B1'; // 旁觀 A 隊（敵方視角，口吻不影響本測試驗的是「選誰」）
  // 角色球員 A2 先跨檔，王牌 A1 後跨檔——同一死球窗仍應取 A1
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: 'A2', tier: 1 }], g, null, 0, ME);
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: 'A1', tier: 1 }], g, null, 10, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 10, ME);
  assert.equal(c.line(g, null, ME, 60).text, '小夢 的移動變慢了——他累了');
});

test('體力播報：我方 tier2（<25%）在 tier1 播過後再播一次，且文案不同', () => {
  const c = createCommentary();
  const g = makeStaminaGame();
  const ME = 'A1'; // controlledId 屬 A 隊，A2 是隊友（非主角）
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: 'A2', tier: 1 }], g, null, 0, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 50).text, 'A隊2號 體力見底，考慮讓他休息');
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: 'A2', tier: 2 }], g, null, 5000, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 5000, ME);
  assert.equal(c.line(g, null, ME, 5050).text, 'A隊2號 體力只剩不到 25%——真的該換人了');
});

test('體力播報：敵方 tier2 豁免無播報（tier1 仍正常播——只有重度段被擋）', () => {
  const c = createCommentary();
  const g = makeStaminaGame();
  const ME = 'A1';
  // 敵方（B2）直接跨 tier2：整段豁免、不收單、不播
  c.onEvents([{ type: 'STAMINA_LOW', team: 'B', playerId: 'B2', tier: 2 }], g, null, 0, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 50).text, '');
  // 同一人之後（另一死球窗）跨 tier1＝正常收單播報（戰術情報口吻）
  c.onEvents([{ type: 'STAMINA_LOW', team: 'B', playerId: 'B2', tier: 1 }], g, null, 5000, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 5000, ME);
  assert.equal(c.line(g, null, ME, 5050).text, '白浪2號 的移動變慢了——他累了');
});

test('體力播報：主角豁免——受控者本人跨檔零播報', () => {
  const c = createCommentary();
  const g = makeStaminaGame();
  const ME = 'A1';
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: ME, tier: 1 }], g, null, 0, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 50).text, '');
  c.onEvents([{ type: 'STAMINA_LOW', team: 'A', playerId: ME, tier: 2 }], g, null, 5000, ME);
  c.onEvents([{ type: 'DEAD_BALL' }], g, null, 5000, ME);
  assert.equal(c.line(g, null, ME, 5050).text, '');
});

test('暫停播報：我方請求暫停／對方喊暫停——口吻分流', () => {
  const c = createCommentary();
  const g = makeStaminaGame();
  const ME = 'A1';
  c.onEvents([{ type: 'TIMEOUT', team: 'A' }], g, null, 0, ME);
  assert.equal(c.line(g, null, ME, 50).text, '我方請求暫停');
  c.onEvents([{ type: 'TIMEOUT', team: 'B' }], g, null, 5000, ME);
  assert.equal(c.line(g, null, ME, 5050).text, '對方喊了暫停，重新佈局');
});

test('commentary 純度：零 DOM、零內部時間源（時間全外部注入）', () => {
  const src = readFileSync(new URL('../src/ui/commentary.js', import.meta.url), 'utf8');
  for (const banned of ['document.', 'window.', 'performance.now', 'Date.now(', 'Math.random(']) {
    assert.ok(!src.includes(banned), `commentary.js 不得出現 ${banned}`);
  }
});
