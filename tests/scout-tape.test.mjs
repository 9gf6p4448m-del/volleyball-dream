// W5+ 學招預告連動——情蒐帶剪輯偏好：featureHit 偵測（合成事件流）＋生成煙霧測試
import test from 'node:test';
import assert from 'node:assert/strict';
import { featureHit, buildScoutTape, TAPE_FEATURE_KEYS } from '../src/career/scoutTape.js';

// 最小 g 假體：pipe 偵測吃 match.rotations.B（1/5/6 號位＝後排）、floatServe 吃 rally.serveStyle
const gWith = (over = {}) => ({
  match: { rotations: { B: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] } },
  rally: { serveStyle: null },
  ...over,
});

test('featureHit：tip＝B 隊輕吊（power≤0.45）；重扣/我方吊球不算', () => {
  const g = gWith();
  assert.ok(featureHit('tip', [{ type: 'TOUCH', team: 'B', playerId: 'B2', kind: 'spike', power: 0.25 }], g));
  assert.ok(!featureHit('tip', [{ type: 'TOUCH', team: 'B', playerId: 'B2', kind: 'spike', power: 0.9 }], g));
  assert.ok(!featureHit('tip', [{ type: 'TOUCH', team: 'A', playerId: 'A2', kind: 'spike', power: 0.25 }], g));
});

test('featureHit：dive＝B 隊魚躍觸球；pipe＝B 隊後排（1/5/6 位）扣球', () => {
  const g = gWith();
  assert.ok(featureHit('dive', [{ type: 'TOUCH', team: 'B', playerId: 'B5', kind: 'dive' }], g));
  assert.ok(!featureHit('dive', [{ type: 'TOUCH', team: 'A', playerId: 'AL', kind: 'dive' }], g));
  // B1＝1 號位（後排）→ pipe；B2＝2 號位（前排）→ 不算
  assert.ok(featureHit('pipe', [{ type: 'TOUCH', team: 'B', playerId: 'B1', kind: 'spike', power: 1 }], g));
  assert.ok(!featureHit('pipe', [{ type: 'TOUCH', team: 'B', playerId: 'B2', kind: 'spike', power: 1 }], g));
});

test('featureHit：floatServe＝B 發球且本球式為飄浮；一般發球不算', () => {
  assert.ok(featureHit('floatServe', [{ type: 'SERVE', team: 'B', playerId: 'B1' }],
    gWith({ rally: { serveStyle: 'float' } })));
  assert.ok(!featureHit('floatServe', [{ type: 'SERVE', team: 'B', playerId: 'B1' }], gWith()));
  assert.ok(!featureHit('floatServe', [{ type: 'SERVE', team: 'A', playerId: 'A1' }],
    gWith({ rally: { serveStyle: 'float' } })));
});

test('buildScoutTape 含 feature：至多 3 段、featured 旗標存在且排最前、決定論', () => {
  const clips = buildScoutTape(42, undefined, { B: { tipRate: 0.3 } }, null, 'tip');
  assert.ok(clips.length <= 3);
  for (const c of clips) {
    assert.ok(c.snapshot && Array.isArray(c.steps), 'clip 形狀＝{snapshot, steps, featured}');
    assert.equal(typeof c.featured, 'boolean');
  }
  // featured 排前（一旦出現非 featured，其後不得再有 featured）
  let seenPlain = false;
  for (const c of clips) {
    if (!c.featured) seenPlain = true;
    else assert.ok(!seenPlain, 'featured 片段必須排在非 featured 之前');
  }
  // 決定論：同參數重跑逐段等長
  const again = buildScoutTape(42, undefined, { B: { tipRate: 0.3 } }, null, 'tip');
  assert.deepEqual(clips.map((c) => c.steps.length), again.map((c) => c.steps.length));
  // 無 feature＝回歸路徑（原行為，clip 也帶 featured:false 欄位）
  const plain = buildScoutTape(42, undefined, { B: { tipRate: 0.3 } }, null);
  assert.ok(plain.every((c) => c.featured === false));
  assert.ok(TAPE_FEATURE_KEYS.has('tip') && !TAPE_FEATURE_KEYS.has('feint'));
});
