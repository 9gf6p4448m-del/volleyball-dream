// 4.5B §4 diegetic 介面純函式：S 熱點映射／L 手勢映射／決策耗時統計
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sHotspotItems, lSignalItems, createLatencyStats, L_SIGN_GLYPHS } from '../src/ui/diegeticItems.js';
import { DIG_SCHEMES } from '../src/input/liberoRead.js';
import { CALL_BALL_AT } from '../src/input/setOptions.js';

const zone = (over = {}) => ({
  key: 'A3-left', pid: 'A3', name: '小飛', kind: 'left', label: '小飛·左翼',
  trust: 20, hesitant: false, ...over,
});

test('S 熱點：loud＝高 trust 最高者（dump 不喊）；猶豫/二次球標註；zone 原物件透傳', () => {
  const zones = [
    zone(),
    zone({ key: 'A4-quick', pid: 'A4', name: '大山', kind: 'quick', label: '大山·快攻', trust: CALL_BALL_AT + 5, hesitant: false }),
    zone({ key: 'A5-quick', pid: 'A5', name: '新生', kind: 'quick', label: '新生·快攻', trust: 8, hesitant: true }),
    zone({ key: 'dump', pid: 'A1', name: '阿哲', kind: 'dump', label: '🎯二次球', trust: 100 }),
  ];
  const items = sHotspotItems(zones);
  assert.equal(items.length, 4);
  assert.equal(items.find((i) => i.pid === 'A4').loud, true, '高 trust 者揮手喊球');
  assert.equal(items.find((i) => i.kind === 'dump').loud, false, 'dump trust 100 不參與喊球');
  assert.equal(items.find((i) => i.pid === 'A5').hesitant, true);
  assert.equal(items.find((i) => i.kind === 'dump').label, '🎯二次球');
  assert.equal(items[0].zone, zones[0], '原選項物件透傳＝指令路徑與舊面板同一條');
  assert.deepEqual(sHotspotItems(null), []);
});

test('L 手勢：三配套鍵 → 一指/二指/握拳；建議旗標沿舊面板◎語意', () => {
  const digRead = { choices: DIG_SCHEMES, suggestion: 'block-cross', markText: '' };
  const items = lSignalItems(digRead);
  assert.equal(items.length, 3);
  assert.equal(items.find((i) => i.key === 'block-line').glyph, L_SIGN_GLYPHS['block-line']);
  assert.equal(items.find((i) => i.key === 'no-block').glyph, '✊');
  assert.equal(items.filter((i) => i.suggested).length, 1);
  assert.equal(items.find((i) => i.suggested).key, 'block-cross');
  assert.equal(items[0].zone, DIG_SCHEMES[0]);
  assert.deepEqual(lSignalItems(null), []);
});

test('決策耗時統計：分位置累計、median/mean；無效樣本丟棄', () => {
  const stats = createLatencyStats();
  for (const ms of [400, 800, 600]) stats.push('S', ms);
  stats.push('L', 500);
  stats.push('S', -10);        // 負值丟
  stats.push('S', Number.NaN); // NaN 丟
  stats.push('X', 100);        // 未知位置丟
  const sum = stats.summary();
  assert.equal(sum.S.n, 3);
  assert.equal(sum.S.median, 600);
  assert.equal(sum.S.mean, 600);
  assert.equal(sum.L.n, 1);
});
