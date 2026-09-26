// Hit button: press to act. A21a/A21c and the review case retired in direct-v8
// stage 1 (section 4 C, no receive swipe); A19d (spike presses on pointerdown) stays.
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

test('A19d 扣球維持按下即出手', () => {
  const s = setup('spike');
  s.f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(s.controls.sample(0)), [null, 'spike'], '扣球按下即出手');
  s.f.hitButton.dispatchEvent(ev('pointerup', { pointerId: 3, clientX: 100, clientY: 100 }));
  assert.deepEqual(actions(s.controls.sample(1)), [null], '扣球放開不重送');
  s.controls.dispose();
});
