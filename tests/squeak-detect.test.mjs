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

// 08-29 二修（叮叮叮事故）：stop 另設較高門檻——AI 走位每次到點都是急停，同門檻時
// 密度 21.9 次/rally；只有超過 stopSpeedThresh 的全速衝刺急煞才觸發 stop
test('急煞門檻：速度介於兩門檻間的到位急停 → 不觸發；超過急煞門檻 → 觸發', () => {
  const stopThresh = THRESH * 2.375; // 同 sfx.js 的 3.8/1.6 比例
  const mild = THRESH * 1.8; // 在跑、但未達衝刺
  assert.equal(
    detectSqueak({ dx: mild, dz: 0 }, { dx: 0, dz: 0 }, { speedThresh: THRESH, stopSpeedThresh: stopThresh }),
    null,
  );
  const sprint = stopThresh * 1.1;
  const hit = detectSqueak({ dx: sprint, dz: 0 }, { dx: 0, dz: 0 }, { speedThresh: THRESH, stopSpeedThresh: stopThresh });
  assert.equal(hit?.kind, 'stop');
});

test('急煞門檻不影響 turn：未達衝刺速度的反向變向照樣觸發 turn', () => {
  const mild = THRESH * 1.8;
  const hit = detectSqueak({ dx: mild, dz: 0 }, { dx: -mild, dz: 0 }, { speedThresh: THRESH, stopSpeedThresh: THRESH * 2.375 });
  assert.equal(hit?.kind, 'turn');
});
