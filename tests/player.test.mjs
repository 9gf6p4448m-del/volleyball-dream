// D1 資料層：結構定型、身高即時推導、序列化 round-trip（驗收單 C 區）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlayer, serializePlayer, deserializePlayer,
  ATTRIBUTE_KEYS, standingReach, spikeReach, blockReach, defenseRange,
} from '../src/sim/player.js';

test('屬性 8 項到齊（含 serve 與 block）', () => {
  const p = createPlayer({ id: 'X1', name: '測試', teamId: 'A' });
  assert.deepEqual(Object.keys(p.attributes).sort(), [...ATTRIBUTE_KEYS].sort());
  assert.equal(ATTRIBUTE_KEYS.length, 8);
  assert.ok(ATTRIBUTE_KEYS.includes('serve') && ATTRIBUTE_KEYS.includes('block'));
});

test('結構含 trust/height.timeline/naturalRole 與 currentRole 分離', () => {
  const p = createPlayer({
    id: 'X2', name: '測試', teamId: 'A', naturalRole: 'middle', currentRole: 'outside',
  });
  assert.equal(p.trust.fromSetter, 50);
  assert.deepEqual(p.height.timeline, []);
  assert.equal(p.naturalRole, 'middle');
  assert.equal(p.currentRole, 'outside');
});

test('身高影響即時推導：長高後攔網/扣球/防守數值同步變大，無衍生欄位', () => {
  const p = createPlayer({ id: 'X3', name: '測試', teamId: 'A', height: 1.8 });
  const before = { spike: spikeReach(p), block: blockReach(p), range: defenseRange(p) };
  p.height.current = 1.95; // 成長期長高 → 不需改任何其他欄位
  assert.ok(spikeReach(p) > before.spike);
  assert.ok(blockReach(p) > before.block);
  assert.ok(defenseRange(p) > before.range);
  assert.ok(standingReach(p) > 2.4);
  // 無衍生欄位：Player 上不存 reach/blockHeight 之類快取
  for (const key of Object.keys(p)) {
    assert.ok(!/reach|blockheight|spikeheight/i.test(key), `發現衍生欄位：${key}`);
  }
});

test('序列化 round-trip：還原後深度相等', () => {
  const p = createPlayer({
    id: 'X4', name: '往返', teamId: 'B', naturalRole: 'setter', currentRole: 'setter',
    height: 1.77, attributes: { jump: 71, control: 88, serve: 64 },
  });
  const back = deserializePlayer(serializePlayer(p));
  assert.deepEqual(back, p);
  // 再繞一圈仍穩定（格式定型）
  assert.deepEqual(deserializePlayer(serializePlayer(back)), p);
});

test('反序列化驗證：缺欄位快速失敗', () => {
  assert.throws(() => deserializePlayer('{"id":"bad"}'), /缺欄位/);
  const p = createPlayer({ id: 'X5', name: 'n', teamId: 'A' });
  const broken = JSON.parse(serializePlayer(p));
  delete broken.attributes.serve;
  assert.throws(() => deserializePlayer(JSON.stringify(broken)), /serve/);
});
