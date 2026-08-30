// 大作感二卷 批5（J5-4）：attract 鏡頭路徑純函式——連續、有限、界內
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attractShot } from '../src/render/attract.js';

test('長時間取樣：全數值有限、視點恆定、高度/半徑在合理界內', () => {
  for (let t = 0; t < 600; t += 0.7) {
    const { pos, target } = attractShot(t);
    for (const v of [pos.x, pos.y, pos.z]) assert.ok(Number.isFinite(v), `t=${t} 非有限`);
    assert.deepEqual(target, { x: 0, y: 1.8, z: 0 }, '視點該鎖定球場中心');
    const r = Math.hypot(pos.x, pos.z);
    assert.ok(r > 10 && r < 20, `t=${t} 半徑 ${r} 出界`);
    assert.ok(pos.y > 4 && pos.y < 9, `t=${t} 高度 ${pos.y} 出界`);
  }
});

test('連續性：相鄰幀（16ms）位移微小，不跳切', () => {
  for (let t = 0; t < 120; t += 3.3) {
    const a = attractShot(t);
    const b = attractShot(t + 0.016);
    const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z);
    assert.ok(d < 0.1, `t=${t} 單幀位移 ${d} 過大`);
  }
});
