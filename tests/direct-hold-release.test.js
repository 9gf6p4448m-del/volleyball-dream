// Touch receive: hold the hit button to choose the platform, release to pass.
// Acceptance: docs/kickoffs/direct-v5-hold-release-acceptance.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectControls } from '../src/input/directControls.js';
import { createDirectGame, stepDirectGame } from '../src/sim/directGame.js';

class Target extends EventTarget {
  constructor(ownerDocument = null) {
    super();
    this.ownerDocument = ownerDocument;
    this.value = '';
    this.dataset = {};
    this.style = { setProperty() {} };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
}
const ev = (type, props = {}) => {
  const e = new Event(type, { cancelable: true });
  Object.defineProperties(e, Object.fromEntries(Object.entries(props).map(([k, value]) => [k, { value }])));
  return e;
};
function setup(action = 'receive') {
  const win = new Target(), doc = new Target(); doc.defaultView = win; doc.visibilityState = 'visible';
  const make = () => new Target(doc);
  const actionSelect = make(); actionSelect.value = action;
  const feedSelect = make(); feedSelect.value = 'receive';
  const f = { win, doc, moveZone: make(), aimZone: make(), jumpButton: make(), hitButton: make(), actionSelect, feedButton: make(), feedSelect };
  return { f, controls: createDirectControls(f) };
}
const actions = cmds => cmds.map(c => c.action);

test('A19a 墊球按下與滑動都不出手', () => {
  const { f, controls } = setup();
  f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(controls.sample(0)), [null], '按下不出手');
  f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 70, clientY: 102 }));
  assert.deepEqual(actions(controls.sample(1)), [null], '滑動不出手');
  controls.dispose();
});

test('A19b 放開才出手，passType 為按住期間最後的滑動，只送一次', () => {
  for (const [moves, expected] of [[[], 'NEUTRAL'], [[-30], 'LEFT'], [[30], 'RIGHT'], [[-30, 30], 'RIGHT'], [[30, 0], 'NEUTRAL']]) {
    const { f, controls } = setup();
    f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
    controls.sample(0);
    for (const dx of moves) f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 100 + dx, clientY: 103 }));
    controls.sample(1);
    f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100 + (moves.at(-1) ?? 0), clientY: 103 }));
    const released = controls.sample(2);
    const receives = released.filter(c => c.action === 'receive');
    assert.equal(receives.length, 1, `放開送出一次 receive (${moves})`);
    assert.equal(receives[0].passType, expected, `passType (${moves})`);
    assert.deepEqual(actions(controls.sample(3)), [null], '放開後不重送');
    controls.dispose();
  }
});

test('A19c 按住期間取消、失焦、隱藏都不出手，之後放開也不送', () => {
  for (const kind of ['pointercancel', 'blur', 'visibilitychange']) {
    const { f, controls } = setup();
    // Frames keep sampling while the finger is down; nothing may leak out.
    f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
    assert.deepEqual(actions(controls.sample(0)), [null], `${kind} 按住期間`);
    f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 70, clientY: 100 }));
    if (kind === 'pointercancel') f.hitButton.dispatchEvent(ev(kind, { pointerId: 3 }));
    else if (kind === 'blur') f.win.dispatchEvent(ev(kind));
    else { f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(ev(kind)); }
    f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 70, clientY: 100 }));
    assert.deepEqual(actions(controls.sample(1)), [null], kind);
    assert.deepEqual(actions(controls.sample(2)), [null], `${kind} 之後`);
    controls.dispose();
  }
});

test('A19d 按下時鎖定動作：墊球中途改選單仍是墊球；扣球維持按下即出手', () => {
  const r = setup('receive');
  r.f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  r.f.actionSelect.value = 'spike';
  r.f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(r.controls.sample(0)), [null, 'receive']);
  r.controls.dispose();
  const s = setup('spike');
  s.f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(s.controls.sample(0)), [null, 'spike'], '扣球按下即出手');
  s.f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(s.controls.sample(1)), [null], '扣球放開不重送');
  s.controls.dispose();
});

test('A19e 按住時出手鈕顯示目前的平台選擇，放開或取消後移除', () => {
  for (const end of ['pointerup', 'pointercancel']) {
    const { f, controls } = setup();
    f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
    assert.equal(f.hitButton.dataset.passChoice, 'NEUTRAL');
    f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 70, clientY: 100 }));
    assert.equal(f.hitButton.dataset.passChoice, 'LEFT');
    f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 130, clientY: 100 }));
    assert.equal(f.hitButton.dataset.passChoice, 'RIGHT');
    f.hitButton.dispatchEvent(ev(end, { pointerId: 3, clientX: 130, clientY: 100 }));
    assert.equal(f.hitButton.dataset.passChoice, undefined, end);
    controls.dispose();
  }
});

test('A19f 提早按住選方向、晚點放開，和「放開當下按」的出球方向相同', () => {
  const run = (downTick, dx) => {
    const { f, controls } = setup();
    const s = createDirectGame();
    for (let t = 0; t < 120; t++) {
      if (t === downTick) {
        f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
        f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 100 + dx, clientY: 105 }));
      }
      if (t === 29) f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100 + dx, clientY: 105 }));
      const commands = controls.sample(t);
      if (t === 0) commands.push({ tick: 0, sequence: 1000, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action: 'feed' });
      stepDirectGame(s, commands);
      const hit = s.events.find(e => e.type === 'contact');
      if (hit) { controls.dispose(); return { hit, vx: s.ball.vx }; }
    }
    controls.dispose();
    return null;
  };
  for (const dx of [-30, 30]) {
    const early = run(20, dx), now = run(29, dx);
    assert.ok(early?.hit.active && now?.hit.active, `主動觸球 (${dx})`);
    assert.equal(early.hit.tick, now.hit.tick, `觸球時機由放開決定 (${dx})`);
    assert.equal(early.vx, now.vx, `出球相同 (${dx})`);
  }
});

// Review round 2 (2026-09-25): the timing cue rehearses with the held choice,
// and a lost capture without pointerup must not leave the button stuck.
test('A19 覆審：按住中的平台選擇對外可讀；失去捕捉即解除按住且不出手', () => {
  const { f, controls } = setup();
  assert.equal(controls.getState().heldPassType, null);
  f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.equal(controls.getState().heldPassType, 'NEUTRAL');
  f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 70, clientY: 100 }));
  assert.equal(controls.getState().heldPassType, 'LEFT');
  f.hitButton.dispatchEvent(ev('lostpointercapture', { pointerId: 3 }));
  assert.equal(controls.getState().hitPointer, null, '失去捕捉後不再按住');
  assert.equal(controls.getState().heldPassType, null);
  assert.equal(f.hitButton.dataset.passChoice, undefined);
  assert.deepEqual(actions(controls.sample(0)), [null], '失去捕捉不出手');
  f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 4, clientX: 100, clientY: 100 }));
  f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 4, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(controls.sample(1)), [null, 'receive'], '之後還能正常按住放開');
  controls.dispose();
});
