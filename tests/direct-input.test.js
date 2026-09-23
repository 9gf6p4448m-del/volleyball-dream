import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDirectInput } from '../src/input/directInput.js';
import { createDirectControls } from '../src/input/directControls.js';

class FixtureEventTarget extends EventTarget {
  constructor(ownerDocument = null) {
    super();
    this.ownerDocument = ownerDocument;
    this.value = '';
    this.style = { values: {}, setProperty: (key, value) => { this.style.values[key] = value; } };
    this.captured = new Set();
  }
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function event(type, props = {}) {
  const e = new Event(type, { cancelable: true });
  Object.defineProperties(e, Object.fromEntries(Object.entries(props).map(([k, value]) => [k, { value }])));
  return e;
}

function keyEvent(type, target, props = {}) {
  const e = event(type, props);
  Object.defineProperty(e, 'target', { value: target });
  return e;
}

function fixture() {
  const win = new FixtureEventTarget();
  const doc = new FixtureEventTarget();
  doc.defaultView = win;
  doc.visibilityState = 'visible';
  const make = () => new FixtureEventTarget(doc);
  const actionSelect = make(); actionSelect.value = 'receive';
  const feedSelect = make(); feedSelect.value = 'float';
  return { win, doc, moveZone: make(), aimZone: make(), jumpButton: make(), hitButton: make(), actionSelect, feedButton: make(), feedSelect };
}

test('press/hold/release：移動持續、放開停止，keydown repeat 不重複動作', () => {
  const input = createDirectInput({ clockOrigin: 0, tickMs: 10 });
  input.queueMoveKey('up', true, 1);
  input.queueAction('jump', 1, { dedupeKey: 'Space' });
  input.queueAction('jump', 1, { dedupeKey: 'Space' });
  assert.deepEqual(input.sample(0).map(c => c.action), [null]);
  const pressed = input.sample(1);
  assert.deepEqual(pressed[0].move, { x: 0, z: -1 });
  assert.equal(pressed.filter(c => c.action === 'jump').length, 1);
  assert.deepEqual(input.sample(2)[0].move, { x: 0, z: -1 });
  input.queueMoveKey('up', false, 21);
  assert.deepEqual(input.sample(3)[0].move, { x: 0, z: 0 });
});

test('同方向替代鍵各自維持 held，放開其中一鍵不會停止另一鍵', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  f.win.dispatchEvent(event('keydown', { code: 'KeyW', repeat: false, timeStamp: 1 }));
  f.win.dispatchEvent(event('keydown', { code: 'ArrowUp', repeat: false, timeStamp: 2 }));
  f.win.dispatchEvent(event('keyup', { code: 'KeyW', timeStamp: 3 }));
  assert.deepEqual(controls.sample(0)[0].move, { x: 0, z: -1 });
  f.win.dispatchEvent(event('keyup', { code: 'ArrowUp', timeStamp: 4 }));
  assert.deepEqual(controls.sample(1)[0].move, { x: 0, z: 0 });
  controls.dispose();
});

test('兩 pointer 可同時移動與瞄準', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  f.moveZone.dispatchEvent(event('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 1 }));
  f.moveZone.dispatchEvent(event('pointermove', { pointerId: 1, clientX: 74, clientY: 10, timeStamp: 2 }));
  f.aimZone.dispatchEvent(event('pointerdown', { pointerId: 2, clientX: 100, clientY: 50, timeStamp: 2 }));
  f.aimZone.dispatchEvent(event('pointermove', { pointerId: 2, clientX: 164, clientY: 50, timeStamp: 3 }));
  const command = controls.sample(0)[0];
  assert.deepEqual(command.move, { x: 1, z: 0 });
  assert.ok(command.aim.x > 0.99);
  assert.ok(Math.abs(command.aim.z) < 0.01);
  controls.dispose();
});

test('同 timestamp 事件依入列順序，且一次性事件只消耗一次', () => {
  const input = createDirectInput({ clockOrigin: 0, tickMs: 10 });
  input.queueAction('jump', 15);
  input.queueAction('spike', 15);
  assert.deepEqual(input.sample(1).map(c => c.action), [null]);
  assert.deepEqual(input.sample(2).map(c => c.action), [null, 'jump', 'spike']);
  assert.deepEqual(input.sample(3).map(c => c.action), [null]);
});

test('cancel、blur、visibilitychange 清空 movement、held 與 queued', () => {
  for (const kind of ['pointercancel', 'blur', 'visibilitychange']) {
    const f = fixture();
    const controls = createDirectControls(f);
    f.moveZone.dispatchEvent(event('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, timeStamp: 1 }));
    f.moveZone.dispatchEvent(event('pointermove', { pointerId: 1, clientX: 64, clientY: 0, timeStamp: 2 }));
    f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 2, timeStamp: 2 }));
    if (kind === 'pointercancel') f.moveZone.dispatchEvent(event(kind, { pointerId: 1, timeStamp: 3 }));
    else if (kind === 'blur') f.win.dispatchEvent(event(kind));
    else { f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(event(kind)); }
    const command = controls.sample(0);
    assert.deepEqual(command.map(c => c.action), [null], kind);
    assert.deepEqual(command[0].move, { x: 0, z: 0 }, kind);
    controls.dispose();
  }
});

test('hit pointerdown 鎖定當下 action，拖曳與切選項都不會換動作，pointerup 不重觸發', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  f.actionSelect.value = 'spike';
  f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 7, clientX: 10, clientY: 10, timeStamp: 1 }));
  f.actionSelect.value = 'tip';
  f.aimZone.dispatchEvent(event('pointerdown', { pointerId: 8, clientX: 10, clientY: 10, timeStamp: 2 }));
  f.aimZone.dispatchEvent(event('pointermove', { pointerId: 8, clientX: 74, clientY: 10, timeStamp: 3 }));
  f.hitButton.dispatchEvent(event('pointerup', { pointerId: 7, timeStamp: 4 }));
  assert.deepEqual(controls.sample(0).map(c => c.action), [null, 'spike']);
  assert.deepEqual(controls.sample(1).map(c => c.action), [null]);
  controls.dispose();
});

test('鍵盤與觸控產生同語意 command，pointer 後的 click 去重', () => {
  const touch = fixture();
  touch.actionSelect.value = 'set';
  const tc = createDirectControls(touch);
  touch.hitButton.dispatchEvent(event('pointerdown', { pointerId: 1, timeStamp: 1 }));
  touch.hitButton.dispatchEvent(event('click', { detail: 1, timeStamp: 2 }));
  const touchCommands = tc.sample(0).map(({ move, aim, action, feedKind }) => ({ move, aim, action, feedKind }));

  const keyboard = fixture();
  keyboard.actionSelect.value = 'set';
  const kc = createDirectControls(keyboard);
  keyboard.win.dispatchEvent(event('keydown', { code: 'KeyJ', repeat: false, timeStamp: 1 }));
  const keyCommands = kc.sample(0).map(({ move, aim, action, feedKind }) => ({ move, aim, action, feedKind }));
  assert.deepEqual(keyCommands, touchCommands);
  tc.dispose(); kc.dispose();
});

test('數字鍵切換動作、feedKind 入列、jump 與 hit 可先後觸發', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  f.win.dispatchEvent(event('keydown', { code: 'Digit3', repeat: false, timeStamp: 1 }));
  assert.equal(f.actionSelect.value, 'tip');
  f.jumpButton.dispatchEvent(event('pointerdown', { pointerId: 1, timeStamp: 2 }));
  f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 1, timeStamp: 3 }));
  f.feedSelect.value = 'topspin';
  f.feedButton.dispatchEvent(event('pointerdown', { pointerId: 1, timeStamp: 4 }));
  const actions = controls.sample(0).slice(1);
  assert.deepEqual(actions.map(c => c.action), ['jump', 'tip', 'feed']);
  assert.equal(actions[2].feedKind, 'topspin');
  controls.dispose();
});

test('dispose 後 listener 不再作用', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  controls.dispose();
  f.win.dispatchEvent(event('keydown', { code: 'Space', repeat: false, timeStamp: 1 }));
  f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 1, timeStamp: 1 }));
  assert.deepEqual(controls.sample(0).map(c => c.action), [null]);
});

test('rebind 接受 forward/backward/hit 物件格式', () => {
  const f = fixture();
  const controls = createDirectControls({
    ...f,
    keyBindings: {
      forward: { code: 'KeyI' }, backward: { codes: ['KeyK'] },
      left: { key: 'KeyJ' }, right: { keys: ['KeyL'] },
      jump: { code: 'KeyU' }, hit: { code: 'KeyO' },
    },
  });
  f.win.dispatchEvent(event('keydown', { code: 'KeyI', repeat: false }));
  f.win.dispatchEvent(event('keydown', { code: 'KeyO', repeat: false }));
  const commands = controls.sample(0);
  assert.deepEqual(commands[0].move, { x: 0, z: -1 });
  assert.equal(commands[1].action, 'receive');
  controls.dispose();
});

test('全域鍵盤忽略編輯欄位與原生按鈕，Space 交給按鈕 click', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  const input = { tagName: 'INPUT' };
  const editable = { tagName: 'DIV', isContentEditable: true };
  const button = { tagName: 'BUTTON' };
  f.win.dispatchEvent(keyEvent('keydown', input, { code: 'KeyW', repeat: false }));
  f.win.dispatchEvent(keyEvent('keydown', editable, { code: 'KeyJ', repeat: false }));
  f.win.dispatchEvent(keyEvent('keydown', button, { code: 'Space', repeat: false }));
  f.jumpButton.dispatchEvent(event('click', { detail: 0 }));
  const commands = controls.sample(0);
  assert.deepEqual(commands[0].move, { x: 0, z: 0 });
  assert.deepEqual(commands.map(c => c.action), [null, 'jump']);
  controls.dispose();
});

test('hit 按下只送一次鎖定動作，短滑修正 aim 且連續手勢從既有方向累積', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  f.actionSelect.value = 'spike';
  f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 4, clientX: 100 }));
  f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 99, clientX: 20 }));
  f.actionSelect.value = 'tip';
  f.hitButton.dispatchEvent(event('pointermove', { pointerId: 4, clientX: 132 }));
  f.hitButton.dispatchEvent(event('pointerup', { pointerId: 4, clientX: 132 }));
  const first = controls.sample(0);
  assert.deepEqual(first.map(c => c.action), [null, 'spike']);
  assert.ok(first[0].aim.x > 0.7 && first[0].aim.z < -0.7);

  f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 5, clientX: 200 }));
  f.hitButton.dispatchEvent(event('pointermove', { pointerId: 5, clientX: 232 }));
  f.hitButton.dispatchEvent(event('pointerup', { pointerId: 5, clientX: 232 }));
  const second = controls.sample(1);
  assert.equal(second.filter(c => c.action === 'tip').length, 1);
  assert.ok(second[0].aim.x > 0.99, '第二次短滑應從前次 45° 累積到 90°');
  assert.ok(Math.abs(second[0].aim.z) < 0.01);
  assert.equal(controls.getState().hitPointer, null);
  controls.dispose();
});

test('hit pointercancel 清除手勢與尚未取樣動作', () => {
  const f = fixture();
  const controls = createDirectControls(f);
  f.hitButton.dispatchEvent(event('pointerdown', { pointerId: 9, clientX: 10 }));
  f.hitButton.dispatchEvent(event('pointercancel', { pointerId: 9, clientX: 20 }));
  assert.equal(controls.getState().hitPointer, null);
  assert.deepEqual(controls.sample(0).map(c => c.action), [null]);
  controls.dispose();
});
