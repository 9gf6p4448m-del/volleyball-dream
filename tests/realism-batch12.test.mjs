// 真實感卷 批1「裁判可視化」＋批2「鷹眼貼線複審」——R1/R2 驗收的機械斷言
// 凍結檔：docs/kickoffs/realism-kickoff-20260831.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { createOfficials, OFFICIALS } from '../src/render/officials.js';
import { hawkeyeCallOf, HAWKEYE } from '../src/ui/hawkeye.js';
import { COURT } from '../src/sim/constants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------- 批2 R2-1 純函式雙向 ----------

test('R2-1 貼線才演：界內深處/出界深處＝null，貼線帶內＝演且結果同 sim 真值', () => {
  assert.equal(hawkeyeCallOf({ x: 0, z: 0 }, true), null, '場中央不演');
  assert.equal(hawkeyeCallOf({ x: 6.0, z: 0 }, false), null, '出界一公尺半不演');
  const inCall = hawkeyeCallOf({ x: COURT.WIDTH / 2 - 0.1, z: 3 }, true);
  assert.equal(inCall.verdict, 'IN');
  assert.ok(inCall.dist <= HAWKEYE.nearM);
  const outCall = hawkeyeCallOf({ x: COURT.WIDTH / 2 + 0.1, z: 3 }, false);
  assert.equal(outCall.verdict, 'OUT');
});

test('R2-1 底線帶同樣生效；壞輸入（null/NaN）＝null 不炸', () => {
  assert.equal(hawkeyeCallOf({ x: 0, z: COURT.LENGTH / 2 - 0.05 }, true).verdict, 'IN');
  assert.equal(hawkeyeCallOf({ x: 0, z: COURT.LENGTH / 2 + 0.2 }, false).verdict, 'OUT');
  assert.equal(hawkeyeCallOf(null, true), null);
  assert.equal(hawkeyeCallOf({ x: Number.NaN, z: 0 }, true), null);
});

test('R2-1 門檻可調且雙向：加大門檻讓原本不演的變成演', () => {
  const at = { x: COURT.WIDTH / 2 - 0.5, z: 0 };
  assert.equal(hawkeyeCallOf(at, true), null, '預設門檻外');
  assert.ok(hawkeyeCallOf(at, true, 0.6), '門檻放大即進帶');
});

// ---------- 批1 R1 行為（真 THREE 場景，無 DOM）----------

function officialsFixture() {
  const scene = new THREE.Scene();
  const off = createOfficials(scene);
  // 內部樞紐按「構造」精準找（不掃全場 rotation——司線員身體 lookAt 背向時尤拉角
  // 會出現 x≈π 的等價表示，掃全場會誤判成舉旗）：
  // 旗樞紐＝含 Plane（旗面）＋Cylinder（臂）的 Group；主審臂＝只含單一 Cylinder 的 Group
  const flagPivots = [];
  const armPivots = [];
  scene.traverse((o) => {
    if (!o.isGroup) return;
    const kinds = o.children.map((c) => c.geometry?.type).filter(Boolean);
    if (kinds.includes('PlaneGeometry') && kinds.includes('CylinderGeometry')) flagPivots.push(o);
    else if (kinds.length === 1 && kinds[0] === 'CylinderGeometry') armPivots.push(o);
  });
  return { scene, off, flagPivots, armPivots };
}

function settle(off, from, ms) {
  for (let t = from; t <= from + ms; t += 16) off.update(t);
}

test('R1-2 得分手勢：DEAD_BALL+SCORE 後主審臂擺向得分方，窗過後歸位', () => {
  const { off, armPivots, flagPivots } = officialsFixture();
  assert.equal(armPivots.length, 1, '構造前提：主審臂樞紐恰一個');
  assert.equal(flagPivots.length, 2, '構造前提：司線旗樞紐恰兩個');
  const t0 = performance.now();
  off.onEvents([
    { type: 'DEAD_BALL', reason: 'BALL_IN', at: { x: 0, z: 3 } },
    { type: 'SCORE', team: 'A' },
  ]);
  settle(off, t0, 600);
  assert.ok(Math.abs(armPivots[0].rotation.x) > 0.5, '主審臂已擺出指向手勢');
  settle(off, t0 + OFFICIALS.gestureMs, 1200);
  for (const p of [...armPivots, ...flagPivots]) {
    assert.ok(Math.abs(p.rotation.x) <= 0.05, '窗過後全數歸位');
  }
});

test('R1-2 司線旗雙向：OUT＝落點側舉旗、BALL_IN＝零舉旗', () => {
  const a = officialsFixture();
  const t0 = performance.now();
  a.off.onEvents([
    { type: 'DEAD_BALL', reason: 'OUT', at: { x: 5.0, z: -9.5 } },
    { type: 'SCORE', team: 'B' },
  ]);
  settle(a.off, t0, 800);
  const flags = a.flagPivots.filter((o) => Math.abs(o.rotation.x) > 2.5).length;
  assert.equal(flags, 1, 'OUT＝恰一名（落點側）司線舉旗到頭上（≈π）');

  const b = officialsFixture();
  b.off.onEvents([
    { type: 'DEAD_BALL', reason: 'BALL_IN', at: { x: 0, z: 3 } },
    { type: 'SCORE', team: 'A' },
  ]);
  settle(b.off, performance.now(), 800);
  const flagsB = b.flagPivots.filter((o) => Math.abs(o.rotation.x) > 0.05).length;
  assert.equal(flagsB, 0, '界內得分不舉旗');
});

test('R1-4 永不致死：壞事件不外拋；無事件時 update 為零成本早退', () => {
  const { off } = officialsFixture();
  assert.doesNotThrow(() => off.onEvents([{ type: 'DEAD_BALL' }, null, { type: 'SCORE' }].filter(Boolean)));
  assert.doesNotThrow(() => off.update(performance.now()));
});

// ---------- 接線與純表現層鎖（source 掃描）----------

test('R1-3/R2-4 純表現層：officials/hawkeye 只准 import sim/constants，不碰其他 sim', () => {
  for (const f of ['src/render/officials.js', 'src/ui/hawkeye.js']) {
    const code = src(f);
    const simImports = [...code.matchAll(/from '\.\.\/sim\/([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(simImports.filter((i) => i !== 'constants.js'), [], `${f} 不得 import sim 邏輯`);
  }
});

test('R1/R2 接線：matchLoop 餵事件＋每幀驅動；鷹眼有節流與不打架守衛；main 組裝', () => {
  const ml = src('src/app/matchLoop.js');
  assert.ok(ml.includes('s.ctx.officials?.onEvents(frameEvents)'));
  assert.ok(ml.includes('ctx.officials?.update(now)'));
  assert.ok(ml.includes('s.hawkeyeCount >= HAWKEYE.maxPerSet'), 'R2-3 每局上限');
  assert.ok(ml.includes("s.replay || s.celebration || s.mvpShow || s.net || game.phase === 'set_over'"),
    'R2-2 與重播/慶祝/MVP/連線/局終不打架');
  assert.ok(src('src/main.js').includes('createOfficials(scene)'));
});
