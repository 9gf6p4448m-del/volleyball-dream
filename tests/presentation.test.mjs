// 4.5B §2 演出地基——時間軸跳過一致性／頻率框架決定論／關鍵分判定／
// 四鏡位模板／seenSignature 存檔 roundtrip
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBeatTimeline, signatureMode, SHORT_BEAT_MS, isSetPoint, keyPointOf,
  loadPresentationPref, savePresentationPref,
} from '../src/ui/presentation.js';
import { beatShot, BEAT_SHOT_NAMES } from '../src/render/cameraRig.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 記錄式 step：apply 為絕對式（由 t 定狀態）——比對「跳過 vs 播完」終態逐值一致
function recordingSteps() {
  const state = { a: 0, b: 0, c: 0 };
  const steps = [
    { dur: 300, apply: (t) => { state.a = t; } },
    { dur: 0, apply: (t) => { state.b = t; } },
    { dur: 500, apply: (t) => { state.c = t * 2; } },
  ];
  return { state, steps };
}

test('演出時間軸：跳過（finish）與逐幀播完的終態逐值一致', () => {
  const played = recordingSteps();
  const tlPlay = createBeatTimeline(played.steps);
  while (!tlPlay.advance(16)) { /* 逐幀推到底 */ }
  const skipped = recordingSteps();
  const tlSkip = createBeatTimeline(skipped.steps);
  tlSkip.advance(120); // 播到一半才跳過（中途跳過＝實際使用情境）
  tlSkip.finish();
  assert.deepEqual(skipped.state, played.state);
  assert.deepEqual(played.state, { a: 1, b: 1, c: 2 });
});

test('演出時間軸：步進推進不預跑後面的步；finish 冪等；duration 加總', () => {
  const { state, steps } = recordingSteps();
  const tl = createBeatTimeline(steps);
  assert.equal(tl.duration, 800);
  tl.advance(150); // 停在第一步中段
  assert.ok(state.a > 0 && state.a < 1);
  assert.equal(state.b, 0); // 未輪到的步不碰
  assert.equal(state.c, 0);
  tl.finish();
  tl.finish(); // 冪等：不重放
  assert.deepEqual(state, { a: 1, b: 1, c: 2 });
  assert.equal(tl.done, true);
});

test('頻率框架：off 恆 off／關鍵分恆 full／首次 full／已看過 short（決定論矩陣）', () => {
  assert.equal(signatureMode({ pref: 'off', seen: false, keyPoint: true }), 'off');
  assert.equal(signatureMode({ pref: 'on', seen: true, keyPoint: true }), 'full');
  assert.equal(signatureMode({ pref: 'on', seen: false, keyPoint: false }), 'full');
  assert.equal(signatureMode({ pref: 'on', seen: true, keyPoint: false }), 'short');
  assert.ok(SHORT_BEAT_MS <= 1500); // 工單：短版 ≤1.5s
});

test('演出偏好：預設 on、寫 off 後讀回 off、storage 失效回退 on', () => {
  const storage = fakeStorage();
  assert.equal(loadPresentationPref(storage), 'on');
  savePresentationPref(storage, 'off');
  assert.equal(loadPresentationPref(storage), 'off');
  savePresentationPref(storage, 'on');
  assert.equal(loadPresentationPref(storage), 'on');
  assert.equal(loadPresentationPref(null), 'on');
});

test('關鍵分判定：局點含 deuce 淨勝 2 語意；雙向皆判', () => {
  assert.equal(isSetPoint({ A: 23, B: 20 }, 25), false);
  assert.equal(isSetPoint({ A: 24, B: 23 }, 25), true);  // A 下一分 25-23
  assert.equal(isSetPoint({ A: 24, B: 24 }, 25), false); // deuce：下一分不結束
  assert.equal(isSetPoint({ A: 25, B: 24 }, 25), true);  // 26-24
  assert.equal(isSetPoint({ A: 10, B: 14 }, 15), true);  // 決勝局 15 分制、B 側
  assert.equal(keyPointOf({ match: { score: { A: 24, B: 22 }, target: 25 } }), true);
  assert.equal(keyPointOf({ match: { score: { A: 3, B: 5 }, target: 25 } }), false);
  assert.equal(keyPointOf(null), false);
});

test('四鏡位模板：四模板皆回傳有限座標；confront 三視角高度分明；未知模板＝null', () => {
  for (const name of BEAT_SHOT_NAMES) {
    const shot = beatShot(name);
    assert.ok(shot, `模板 ${name} 應存在`);
    for (const v of [shot.cam, shot.look]) {
      for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(v[axis]));
    }
    assert.ok(shot.lighting, `模板 ${name} 應帶燈光預設`);
  }
  const level = beatShot('confront', { angle: 'level' });
  const up = beatShot('confront', { angle: 'up' });
  const down = beatShot('confront', { angle: 'down' });
  assert.ok(up.cam.y < level.cam.y, '仰角（牆版）機位低於平視');
  assert.ok(down.cam.y > level.cam.y, '俯視（量人）機位高於平視');
  assert.ok(down.look.y < down.cam.y, '俯視注視點低於機位');
  const stands = beatShot('stands');
  assert.ok(stands.cam.y > level.cam.y * 2, '看台遠景＝高機位');
  assert.equal(beatShot('no-such-template'), null);
});

test('seenSignature：roundtrip 跨呼叫持久；舊存檔無此欄＝視為未看過', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage, 1);
  store.saveCareer(createCareer({ seed: 7, playerName: '小夢' }));
  store.savePlayer(createCareerPlayer('小夢', { heightCm: 175, seed: 7 }));
  // 舊存檔（本次建立、無 presentation 欄）＝空物件
  assert.deepEqual(store.loadSeenSignatures(), {});
  assert.ok(store.markSignatureSeen('oh-feint'));
  assert.ok(store.markSignatureSeen('mb-early'));
  const seen = store.loadSeenSignatures();
  assert.equal(seen['oh-feint'], true);
  assert.equal(seen['mb-early'], true);
  // 重讀（新 store 實體＝重新反序列化）仍在——真的落了檔
  const store2 = createCareerStore(storage, 1);
  assert.equal(store2.loadSeenSignatures()['oh-feint'], true);
  // 標記不影響其他鍵、markSignatureSeen 空鍵安全
  assert.ok(store.markSignatureSeen(''));
  assert.equal(Object.keys(store2.loadSeenSignatures()).length, 2);
});
