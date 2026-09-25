// Review of A21 (2026-09-25, H1): once the receive windup is over the platform
// is locked, so the hit button must keep showing the platform the simulation
// actually uses. Acceptance: docs/kickoffs/direct-v5-press-receive-acceptance.md (A21c)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectControls } from '../src/input/directControls.js';
import { createDirectGame, stepDirectGame, receivePlatformLocked } from '../src/sim/directGame.js';
import { DIRECT_ACTIONS } from '../src/sim/directConstants.js';

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

// Press the receive at tick 0, swipe left at `swipeTick`, and compare the
// button label with the simulation's platform after every tick.
function run(swipeTick) {
  const win = new Target(), doc = new Target(); doc.defaultView = win; doc.visibilityState = 'visible';
  const make = () => new Target(doc);
  const actionSelect = make(); actionSelect.value = 'receive';
  const feedSelect = make(); feedSelect.value = 'receive';
  const f = { moveZone: make(), aimZone: make(), jumpButton: make(), hitButton: make(), actionSelect, feedButton: make(), feedSelect };
  const state = createDirectGame();
  const controls = createDirectControls({
    ...f,
    isPassLocked: () => receivePlatformLocked(state.player),
  });
  const rows = [];
  f.hitButton.dispatchEvent(ev('pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  for (let t = 0; t < 16; t++) {
    if (t === swipeTick) f.hitButton.dispatchEvent(ev('pointermove', { pointerId: 3, clientX: 70, clientY: 102 }));
    stepDirectGame(state, controls.sample(t));
    if (state.player.action === 'receive')
      rows.push({ t, label: f.hitButton.dataset.passChoice, sim: state.player.passType, held: controls.getState().heldPassType });
  }
  controls.dispose();
  return rows;
}

test('A21c 覆審 H1：平台鎖定後滑動不改標籤；每個 tick 標籤都等於模擬實際的平台方向', () => {
  for (let swipe = 1; swipe <= 14; swipe++) {
    const rows = run(swipe);
    assert.ok(rows.length >= 10, `swipe=${swipe} 墊球動作須持續（${rows.length} tick）`);
    for (const r of rows) {
      assert.equal(r.label, r.sim, `swipe=${swipe} tick=${r.t} 標籤 ${r.label}、模擬 ${r.sim}`);
      assert.equal(r.held, r.sim, `swipe=${swipe} tick=${r.t} 對外的按住方向 ${r.held}、模擬 ${r.sim}`);
    }
    // Liveness: every swipe inside the windup chooses the platform; none after.
    const expected = swipe < DIRECT_ACTIONS.receive.windup ? 'LEFT' : 'NEUTRAL';
    assert.equal(rows.at(-1).sim, expected, `swipe=${swipe} 模擬最後的平台方向`);
  }
});
