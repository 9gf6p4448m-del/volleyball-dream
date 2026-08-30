// 大作感三卷 批1「觀眾反應動畫」——驗收 K1-1～K1-5 的機械斷言
// 凍結檔：docs/kickoffs/juice3-kickoff-20260830.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crowdReactionAt, createCrowdAnim, REACT } from '../src/render/crowdAnim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------- K1-3 純函式雙向 ----------

test('K1-3 窗內強度>0：普通/關鍵分中點皆為正', () => {
  assert.ok(crowdReactionAt(REACT.durMs / 2).amp > 0);
  assert.ok(crowdReactionAt(REACT.keyDurMs / 2, { keyPoint: true }).amp > 0);
});

test('K1-3 窗外恆 0：負值/等於窗長/超窗/NaN 皆 amp=0 且燈海關', () => {
  for (const [t, opts] of [
    [-1, {}], [REACT.durMs, {}], [REACT.durMs + 500, {}],
    [REACT.keyDurMs, { keyPoint: true }], [Number.NaN, {}],
  ]) {
    const r = crowdReactionAt(t, opts);
    assert.equal(r.amp, 0, `t=${t}`);
    assert.equal(r.lightsea, false, `t=${t}`);
  }
});

test('K1-3 關鍵分 ≥ 普通：窗長更長、峰值更高', () => {
  assert.ok(REACT.keyDurMs > REACT.durMs);
  const mid = crowdReactionAt(REACT.durMs / 2).amp;
  const keyMid = crowdReactionAt(REACT.keyDurMs / 2, { keyPoint: true }).amp;
  assert.ok(keyMid > mid);
});

test('K1-2 燈海只在關鍵分窗內：普通得分窗內 lightsea=false、關鍵分窗內=true', () => {
  assert.equal(crowdReactionAt(REACT.durMs / 2).lightsea, false);
  assert.equal(crowdReactionAt(REACT.keyDurMs / 2, { keyPoint: true }).lightsea, true);
});

// ---------- 驅動器行為（假 crowd／假 scene，不需 DOM）----------

function makeFakeCrowd(n = 5, absentIdx = 2) {
  const base = new Float32Array(n * 3);
  const present = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const off = i === absentIdx;
    base[i * 3] = i * 2;
    base[i * 3 + 1] = off ? -50 : 1.5;
    base[i * 3 + 2] = i;
    present[i] = off ? 0 : 1;
  }
  const calls = [];
  return {
    userData: { crowdBase: base, crowdPresent: present },
    setMatrixAt(i, m4) { calls.push([i, m4.elements[12], m4.elements[13], m4.elements[14]]); },
    instanceMatrix: { needsUpdate: false },
    calls,
  };
}

function makeFakeScene() {
  const added = [];
  return { added, add(o) { added.push(o); }, remove(o) { added.splice(added.indexOf(o), 1); } };
}

test('K1-1/K1-5 反應窗外零矩陣更新：未得分前 update 不碰任何 instance', () => {
  const crowd = makeFakeCrowd();
  const anim = createCrowdAnim(makeFakeScene(), { getCrowd: () => crowd });
  anim.update(1000);
  anim.update(2000);
  assert.equal(crowd.calls.length, 0);
  assert.equal(crowd.instanceMatrix.needsUpdate, false);
});

test('K1-1 窗內只動在席觀眾、缺席者不動；needsUpdate 有立旗', () => {
  const crowd = makeFakeCrowd(5, 2);
  const anim = createCrowdAnim(makeFakeScene(), { getCrowd: () => crowd });
  anim.onScore(0, {});
  anim.update(REACT.durMs / 2);
  const touched = new Set(crowd.calls.map(([i]) => i));
  assert.ok(touched.size > 0);
  assert.ok(!touched.has(2), '缺席者（index 2）不得被動');
  assert.equal(crowd.instanceMatrix.needsUpdate, true);
  // 動的是 y（彈跳）：x/z 不變、y ≥ base
  for (const [i, x, y, z] of crowd.calls) {
    assert.equal(x, crowd.userData.crowdBase[i * 3]);
    assert.equal(z, crowd.userData.crowdBase[i * 3 + 2]);
    assert.ok(y >= crowd.userData.crowdBase[i * 3 + 1]);
  }
});

test('K1-1 窗收尾還原 base 一次，之後零更新（效能鐵則）', () => {
  const crowd = makeFakeCrowd(4, 1);
  const anim = createCrowdAnim(makeFakeScene(), { getCrowd: () => crowd });
  anim.onScore(0, {});
  anim.update(100);
  crowd.calls.length = 0;
  anim.update(REACT.durMs + 50); // 收尾幀：還原全部（含缺席者的地下位）
  assert.equal(crowd.calls.length, 4);
  for (const [i, x, y, z] of crowd.calls) {
    assert.equal(x, crowd.userData.crowdBase[i * 3]);
    assert.equal(y, crowd.userData.crowdBase[i * 3 + 1]);
    assert.equal(z, crowd.userData.crowdBase[i * 3 + 2]);
  }
  crowd.calls.length = 0;
  anim.update(REACT.durMs + 200);
  anim.update(REACT.durMs + 400);
  assert.equal(crowd.calls.length, 0, '還原後不得再有任何矩陣更新');
});

test('K1-2 燈海雙向：關鍵分窗內光點層可見、普通得分不出光點層', () => {
  const crowd = makeFakeCrowd(24, 3);
  const scene = makeFakeScene();
  const anim = createCrowdAnim(scene, { getCrowd: () => crowd });
  anim.onScore(0, { keyPoint: false });
  anim.update(REACT.durMs / 2);
  assert.equal(scene.added.length, 0, '普通得分不建光點層');
  anim.update(REACT.durMs + 10); // 收窗
  anim.onScore(10000, { keyPoint: true });
  anim.update(10000 + REACT.keyDurMs / 2);
  assert.equal(scene.added.length, 1, '關鍵分建光點層');
  assert.equal(scene.added[0].visible, true);
  anim.update(10000 + REACT.keyDurMs + 50); // 收窗→光點層關
  assert.equal(scene.added[0].visible, false);
});

test('K1-4 永不致死：getCrowd 崩潰不外拋，且自我停用', () => {
  let boom = false;
  const anim = createCrowdAnim(makeFakeScene(), {
    getCrowd: () => { if (boom) throw new Error('boom'); return null; },
  });
  anim.onScore(0, {});
  boom = true;
  assert.doesNotThrow(() => anim.update(100));
  assert.doesNotThrow(() => anim.update(200));
});

// ---------- 接線同源鎖（source 掃描）----------

test('K1-2 matchLoop 觸發同源：DEAD_BALL 處餵 s.keyPointRally 鎖存值（與 sfx 同一份）', () => {
  const s = src('src/app/matchLoop.js');
  assert.ok(s.includes("crowdAnim?.onScore(now, { keyPoint: !!s.keyPointRally })"));
  assert.ok(s.includes('ctx.crowdAnim?.update('));
});

test('K1-5 組裝：main.js 建 crowdAnim 進 ctx；arena 開 base 快照與 getCrowd 把手', () => {
  assert.ok(src('src/main.js').includes('createCrowdAnim(scene, arena)'));
  const a = src('src/render/arena.js');
  assert.ok(a.includes('crowdBase'));
  assert.ok(a.includes('getCrowd()'));
});
