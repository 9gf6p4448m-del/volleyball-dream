// 池底卷 批1 P2「完整擦地員」——驗收凍結 docs/kickoffs/poolbottom-kickoff-20260831.md：
// ①純函式/結構測試蓋「窗內出現、窗外不在場景」與播畢移除 ②rally 進行中永不在場
// ③崩潰自我停用 ④教學局不出。仿 tests/realism-batch12.test.mjs（真實感卷批1 officials
// 測試）的慣例：純函式（moppersStateAt）直測時間軸；createMoppers(scene) 用真 THREE
// 場景驗證可見度切換；matchLoop/main 的接線與教學局/reduced-motion 守衛用 source 掃描
// （同 realism-batch12「R1/R2 接線」測試款式）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { createMoppers, moppersStateAt, moppersTotalMs, MOPPERS } from '../src/render/moppers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------- 純函式：moppersStateAt 時間軸 ----------

test('moppersStateAt：窗外（負值/尚未觸發）恆 idle', () => {
  assert.equal(moppersStateAt(-1).phase, 'idle');
  assert.equal(moppersStateAt(-100).phase, 'idle');
});

test('moppersStateAt：enter → wipe（逐趟遞增）→ exit → idle（播畢移除），邊界皆對齊常數', () => {
  const { enterMs, wipeMs, wipeReps, exitMs } = MOPPERS;
  assert.equal(moppersStateAt(0).phase, 'enter');
  assert.equal(moppersStateAt(enterMs - 1).phase, 'enter');
  assert.equal(moppersStateAt(enterMs).phase, 'wipe');
  assert.equal(moppersStateAt(enterMs).wipeIndex, 0);
  assert.equal(moppersStateAt(enterMs + wipeMs).wipeIndex, 1, '第二趟');
  assert.equal(moppersStateAt(enterMs + wipeMs * wipeReps - 1).phase, 'wipe');
  assert.equal(moppersStateAt(enterMs + wipeMs * wipeReps - 1).wipeIndex, wipeReps - 1, '最後一趟');
  assert.equal(moppersStateAt(enterMs + wipeMs * wipeReps).phase, 'exit');
  assert.equal(moppersStateAt(enterMs + wipeMs * wipeReps + exitMs - 1).phase, 'exit');
  const total = moppersTotalMs();
  assert.equal(total, enterMs + wipeMs * wipeReps + exitMs);
  assert.equal(moppersStateAt(total).phase, 'idle', '播畢＝移除');
  assert.equal(moppersStateAt(total + 5000).phase, 'idle', '播畢後恆 idle，不會自己再冒出來');
});

test('moppersStateAt：t 在各階段內部單調 0..1', () => {
  const mid = moppersStateAt(MOPPERS.enterMs / 2);
  assert.ok(mid.t > 0 && mid.t < 1);
  const wipeMid = moppersStateAt(MOPPERS.enterMs + MOPPERS.wipeMs / 2);
  assert.ok(wipeMid.t > 0 && wipeMid.t < 1);
});

// ---------- createMoppers：真 THREE 場景，驗證可見度 ----------

function settle(mop, from, toExclusive, step = 16) {
  for (let t = from; t < toExclusive; t += step) mop.update(t);
}

test('①窗內出現、窗外不在場景：onSetBreak 後窗內 visible=true，播畢自動 visible=false', () => {
  const scene = new THREE.Scene();
  const mop = createMoppers(scene);
  const group = scene.children.find((o) => o.isGroup);
  assert.ok(group, '建置時應該掛進場景的 Group');
  assert.equal(group.visible, false, '建置剛完成＝窗外，不該可見');

  const t0 = 100000;
  mop.onSetBreak(t0);
  mop.update(t0 + MOPPERS.enterMs / 2); // enter 階段中點
  assert.equal(group.visible, true, '窗內（enter 階段）應該可見');

  mop.update(t0 + moppersTotalMs() / 2); // wipe 階段中點
  assert.equal(group.visible, true, '窗內（wipe 階段）應該可見');

  mop.update(t0 + moppersTotalMs() + 50); // 播畢之後
  assert.equal(group.visible, false, '播畢應自動移除（不可見）');
});

test('①暫停窗（onTimeoutHuddle）同一套時間軸，行為與局間窗一致', () => {
  const scene = new THREE.Scene();
  const mop = createMoppers(scene);
  const group = scene.children.find((o) => o.isGroup);
  const t0 = 500;
  mop.onTimeoutHuddle(t0);
  mop.update(t0 + 10);
  assert.equal(group.visible, true);
  mop.update(t0 + moppersTotalMs() + 10);
  assert.equal(group.visible, false);
});

test('②rally 進行中永不在場：從未呼叫 onSetBreak/onTimeoutHuddle，任意多次 update 都不可見', () => {
  const scene = new THREE.Scene();
  const mop = createMoppers(scene);
  const group = scene.children.find((o) => o.isGroup);
  settle(mop, 0, 20000, 500); // 模擬很長一段時間的逐幀呼叫（等同 rally 進行中每幀 update）
  assert.equal(group.visible, false, '沒有任何窗觸發＝擦地員永遠不該出現');
});

test('③崩潰自我停用：scene.add 拋錯＝建置失敗但不外拋，update/trigger 之後仍安全', () => {
  const badScene = { add() { throw new Error('boom'); } };
  const mop = createMoppers(badScene); // 建置階段就失敗，內部 dead=true
  assert.doesNotThrow(() => mop.onSetBreak(performance.now()));
  assert.doesNotThrow(() => mop.update(performance.now()));
  assert.doesNotThrow(() => mop.onTimeoutHuddle(performance.now()));
});

// ---------- 接線與守衛（source 掃描，同 realism-batch12「R1/R2 接線」款式）----------

test('接線：main 建置＋matchLoop 每幀驅動＋局間/暫停 edge 觸發皆有教學局/reduced-motion 守衛', () => {
  const ml = src('src/app/matchLoop.js');
  assert.ok(src('src/main.js').includes('createMoppers(scene)'), 'main 應該建置 moppers');
  assert.ok(ml.includes('ctx.moppers?.update(now)'), '每幀驅動');
  assert.ok(ml.includes('s.ctx.moppers?.onSetBreak(performance.now())'), '局間 edge 觸發');
  assert.ok(ml.includes('s.ctx.moppers?.onTimeoutHuddle(performance.now())')
    || ml.includes('s.ctx.moppers?.onTimeoutHuddle(now)'), '暫停 edge 觸發（我方/AI 兩處其一）');
  // ④教學局不出：三個觸發點都要看得到 !s.tutorial 守衛
  assert.ok(ml.includes('if (!s.tutorial) s.ctx.moppers?.onSetBreak(performance.now());'),
    '局間窗：教學局不出');
  const timeoutGuardCount = (ml.match(
    /if \(!s\.tutorial && s\.presentation\.pref !== 'off' && !reducedMotionOn\(\)\) \{\s*s\.ctx\.moppers\?\.onTimeoutHuddle/g,
  ) ?? []).length;
  assert.equal(timeoutGuardCount, 2, '暫停窗：我方＋AI 兩處觸發都要有教學局/reduced-motion 守衛');
});

test('純表現層：moppers.js 只准 import sim/constants，不碰其他 sim（同 officials.js 規範）', () => {
  const code = src('src/render/moppers.js');
  const simImports = [...code.matchAll(/from '\.\.\/sim\/([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(simImports.filter((i) => i !== 'constants.js'), []);
});
