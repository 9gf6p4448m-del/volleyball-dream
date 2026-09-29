// 進賽場卷 2A：球員外觀決定（B1/B8(a)）——單一函式、輸入只有 storage 與 params，
// 不吃 performance.now／FPS（架構鐵律②不自我降級）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPEARANCE_PREF_KEY, loadAppearancePref, saveAppearancePref, resolvePlayerAppearance,
} from '../src/render/playerAppearance.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
function fakeParams(map = {}) {
  return { get: (k) => (k in map ? map[k] : null) };
}

test('loadAppearancePref：預設幾何；寫入 real 後讀回 real；其他值視為幾何', () => {
  const s = fakeStorage();
  assert.equal(loadAppearancePref(s), 'geo');
  saveAppearancePref(s, 'real');
  assert.equal(loadAppearancePref(s), 'real');
  assert.equal(s.getItem(APPEARANCE_PREF_KEY), 'real');
  saveAppearancePref(s, 'geo');
  assert.equal(loadAppearancePref(s), 'geo');
  s.setItem(APPEARANCE_PREF_KEY, 'garbage');
  assert.equal(loadAppearancePref(s), 'geo'); // 非 'real' 一律視為幾何（安全預設）
});

test('loadAppearancePref／resolvePlayerAppearance：storage 缺失或拋錯不炸，回落幾何', () => {
  assert.equal(loadAppearancePref(null), 'geo');
  assert.equal(loadAppearancePref(undefined), 'geo');
  const throwing = { getItem() { throw new Error('私隱模式擋讀'); } };
  assert.equal(loadAppearancePref(throwing), 'geo');
  const throwingSet = { setItem() { throw new Error('私隱模式擋寫'); } };
  assert.doesNotThrow(() => saveAppearancePref(throwingSet, 'real'));
});

test('resolvePlayerAppearance：faces 只認 &faces=20k，其餘一律 5000（R14 預設 5k）', () => {
  const s = fakeStorage();
  assert.equal(resolvePlayerAppearance({ storage: s, params: fakeParams({}) }).faces, 5000);
  assert.equal(resolvePlayerAppearance({ storage: s, params: fakeParams({ faces: '5k' }) }).faces, 5000);
  assert.equal(resolvePlayerAppearance({ storage: s, params: fakeParams({ faces: '20k' }) }).faces, 20000);
  assert.equal(resolvePlayerAppearance({ storage: s, params: fakeParams({ faces: 'bogus' }) }).faces, 5000);
  assert.equal(resolvePlayerAppearance({ storage: s, params: null }).faces, 5000);
});

test('resolvePlayerAppearance：appearance 隨 storage 而定，與 params 無關', () => {
  const s = fakeStorage();
  saveAppearancePref(s, 'real');
  assert.equal(resolvePlayerAppearance({ storage: s, params: fakeParams({ faces: '5k' }) }).appearance, 'real');
  assert.equal(resolvePlayerAppearance({ storage: s, params: null }).appearance, 'real');
});

// B8(a) 核心：不自我降級——同一組 storage/params 輸入，不論呼叫當下的 performance.now
// 讀值為何，輸出必須逐值相同（函式本身完全不吃時鐘／FPS）。
test('B8(a) 不自我降級：同輸入不同 performance.now 替身，輸出逐值相同', () => {
  const s = fakeStorage();
  saveAppearancePref(s, 'real');
  const params = fakeParams({ faces: '5k' });
  const originalNow = globalThis.performance.now;
  try {
    globalThis.performance.now = () => 0;
    const a = resolvePlayerAppearance({ storage: s, params });
    globalThis.performance.now = () => 999999;
    const b = resolvePlayerAppearance({ storage: s, params });
    globalThis.performance.now = () => { throw new Error('若函式真的讀了 performance.now 就會炸在這裡'); };
    const c = resolvePlayerAppearance({ storage: s, params });
    assert.deepEqual(a, { appearance: 'real', faces: 5000 });
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
  } finally {
    globalThis.performance.now = originalNow;
  }
});
