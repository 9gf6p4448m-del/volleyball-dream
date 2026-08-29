// 鞋底摩擦聲觸發判定（acceptance-sfx-score-squeak-20260829.md A2）——純函式直測。
// 門檻用實際消費端的換算（1.6 m/s × SIM_DT）當基準，避免測試自訂一套座標系。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSqueak } from '../src/ui/squeakDetect.js';
import { SIM_DT } from '../src/sim/constants.js';

const THRESH = 1.6 * SIM_DT; // m/tick，同 sfx.js 的 SQUEAK_SPEED_THRESH
const RUN = THRESH * 1.8; // 全速跑動的每 tick 位移（moveSpeed 2.8–5.2 m/s 範圍內）

test('高速反向變向 → 觸發 turn', () => {
  const hit = detectSqueak({ dx: RUN, dz: 0 }, { dx: -RUN, dz: 0 }, { speedThresh: THRESH });
  assert.equal(hit?.kind, 'turn');
  assert.ok(hit.intensity > 0 && hit.intensity <= 1);
});

test('直線等速跑 → 不觸發', () => {
  assert.equal(detectSqueak({ dx: RUN, dz: 0 }, { dx: RUN, dz: 0 }, { speedThresh: THRESH }), null);
});

test('高速急停（速度掉到近零）→ 觸發 stop', () => {
  const hit = detectSqueak({ dx: 0, dz: RUN }, { dx: 0, dz: 0 }, { speedThresh: THRESH });
  assert.equal(hit?.kind, 'stop');
});

test('低速變向（慢慢走）→ 不觸發', () => {
  const slow = THRESH * 0.5;
  assert.equal(
    detectSqueak({ dx: slow, dz: 0 }, { dx: -slow, dz: 0 }, { speedThresh: THRESH }),
    null,
  );
});

test('漸進減速（未達急煞比例）→ 不觸發', () => {
  assert.equal(
    detectSqueak({ dx: RUN, dz: 0 }, { dx: RUN * 0.7, dz: 0 }, { speedThresh: THRESH }),
    null,
  );
});

test('側向切變（90 度、點積為 0）→ 不觸發 turn；速度沒掉也不觸發 stop', () => {
  assert.equal(
    detectSqueak({ dx: RUN, dz: 0 }, { dx: 0, dz: RUN }, { speedThresh: THRESH }),
    null,
  );
});

test('缺輸入或門檻非法 → 一律 null（防呆，不 throw）', () => {
  assert.equal(detectSqueak(null, { dx: 1, dz: 0 }, { speedThresh: THRESH }), null);
  assert.equal(detectSqueak({ dx: 1, dz: 0 }, null, { speedThresh: THRESH }), null);
  assert.equal(detectSqueak({ dx: 1, dz: 0 }, { dx: 1, dz: 0 }, { speedThresh: 0 }), null);
  assert.equal(detectSqueak({ dx: 1, dz: 0 }, { dx: 1, dz: 0 }, {}), null);
});
