// 大作感二卷 批2（J2-1/J2-2）：震動映射純函式＋三道閘（偏好/支援/失敗）直測
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIBRATION_PATTERNS, vibrationFor, createHaptics } from '../src/ui/haptics.js';

test('映射：五種分級各有非空 pattern；未知 kind 回 null', () => {
  for (const kind of ['spike', 'block', 'dig', 'dive', 'champion']) {
    const p = vibrationFor(kind);
    assert.ok(Array.isArray(p) && p.length > 0 && p.every((ms) => ms > 0), `${kind} pattern 非法`);
  }
  assert.equal(vibrationFor('nope'), null);
  assert.ok(Object.keys(VIBRATION_PATTERNS).length >= 4, 'J2-1 至少四種 pattern');
});

test('開啟時：nav.vibrate 收到映射的 pattern', () => {
  const calls = [];
  const h = createHaptics({ prefs: () => ({ vibrate: true }), nav: { vibrate: (p) => { calls.push(p); return true; } } });
  assert.equal(h.buzz('spike'), true);
  assert.deepEqual(calls, [VIBRATION_PATTERNS.spike]);
});

test('閘1 偏好關閉：零 vibrate 呼叫', () => {
  const calls = [];
  const h = createHaptics({ prefs: () => ({ vibrate: false }), nav: { vibrate: (p) => { calls.push(p); return true; } } });
  assert.equal(h.buzz('spike'), false);
  assert.equal(calls.length, 0);
});

test('閘2 裝置不支援（無 nav / 無 vibrate 函式）：回 false 不 throw', () => {
  assert.equal(createHaptics({ prefs: () => ({ vibrate: true }), nav: null }).buzz('block'), false);
  assert.equal(createHaptics({ prefs: () => ({ vibrate: true }), nav: {} }).buzz('block'), false);
});

test('閘3 vibrate 本身 throw：吞掉回 false', () => {
  const h = createHaptics({ prefs: () => ({ vibrate: true }), nav: { vibrate: () => { throw new Error('denied'); } } });
  assert.equal(h.buzz('dive'), false);
});

test('未知 kind：連閘都不進，直接 false', () => {
  const calls = [];
  const h = createHaptics({ prefs: () => ({ vibrate: true }), nav: { vibrate: (p) => { calls.push(p); return true; } } });
  assert.equal(h.buzz('unknown'), false);
  assert.equal(calls.length, 0);
});
