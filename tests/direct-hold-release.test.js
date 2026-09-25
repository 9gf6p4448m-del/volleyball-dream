// Touch receive: press to pass, swipe during the windup to choose the platform.
// Acceptance: docs/kickoffs/direct-v5-press-receive-acceptance.md (A21; A19 retired)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectControls } from '../src/input/directControls.js';

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

test('A21a 墊球按下即出手，左右滑改平台方向，放開不重送', () => {
  for (const [dx, expected] of [[0, 'NEUTRAL'], [-30, 'LEFT'], [30, 'RIGHT']]) {
    const { f, controls } = setup();
    f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
    const first = controls.sample(0);
    assert.deepEqual(actions(first), [null, 'receive'], '按下即出手');
    assert.equal(first[1].passType, 'NEUTRAL');
    f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 100 + dx, clientY: 103 }));
    const moved = controls.sample(1);
    assert.deepEqual(actions(moved), [null], '滑動不重新觸發');
    assert.equal(moved[0].passType, expected);
    assert.deepEqual(moved[0].aim, first[0].aim, '滑動不改朝向');
    f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100 + dx, clientY: 103 }));
    assert.deepEqual(actions(controls.sample(2)), [null], '放開不重送');
    controls.dispose();
  }
});

test('A19d 扣球維持按下即出手', () => {
  const s = setup('spike');
  s.f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(s.controls.sample(0)), [null, 'spike'], '扣球按下即出手');
  s.f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(s.controls.sample(1)), [null], '扣球放開不重送');
  s.controls.dispose();
});

test('A21c 按住時出手鈕顯示目前的平台方向，放開或取消後移除', () => {
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

test('覆審保留：按住中的方向對外可讀；失去捕捉即解除按住、不重送', () => {
  const { f, controls } = setup();
  assert.equal(controls.getState().heldPassType, null);
  f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(controls.sample(0)), [null, 'receive']);
  f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 70, clientY: 100 }));
  assert.equal(controls.getState().heldPassType, 'LEFT');
  f.hitButton.dispatchEvent(ev('lostpointercapture', { pointerId: 3 }));
  assert.equal(controls.getState().hitPointer, null, '失去捕捉後不再按住');
  assert.equal(controls.getState().heldPassType, null);
  assert.equal(f.hitButton.dataset.passChoice, undefined);
  assert.deepEqual(actions(controls.sample(1)), [null], '不重送');
  f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 4, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(controls.sample(2)), [null, 'receive'], '之後還能正常出手');
  controls.dispose();
});
