import { createDirectInput } from './directInput.js';

const ACTIONS = ['receive', 'spike', 'tip', 'set', 'block', 'dive'];
const DEFAULT_KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], action: ['KeyJ'], feed: ['KeyR'],
  select: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'],
};
const STICK_RADIUS = 64;

// Keep the sandbox's four gesture meanings. A swipe selects the intended shot;
// contact still has to occur at the actual hand surface to affect the ball.
// Receive platform: the spike's direction judgement, read as platform choices.
// Sides yaw the platform. Up/down (HIGH/LOW) are disabled for now by user
// decision (2026-09-24) until their feel is redesigned; they stay neutral.
function receivePassType(dx, dy) {
  if (Math.hypot(dx, dy) < 10) return 'NEUTRAL';
  const type = spikeShotType(dx, dy);
  if (type === 'CROSS_LEFT') return 'LEFT';
  if (type === 'CROSS_RIGHT') return 'RIGHT';
  return 'NEUTRAL';
}
function spikeShotType(dx, dy) {
  if (Math.hypot(dx, dy) < 10) return 'LINE';
  if (dy < -14 && Math.abs(dx) <= Math.abs(dy) * 1.6) return 'TIP';
  if (dy > 10) {
    if (dx < -10) return 'CROSS_LEFT';
    if (dx > 10) return 'CROSS_RIGHT';
    return 'LINE';
  }
  if (dx < -12) return 'CROSS_LEFT';
  if (dx > 12) return 'CROSS_RIGHT';
  return 'LINE';
}

function bindingCodes(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return bindingCodes(value.codes ?? value.keys ?? value.code ?? value.key);
}

function isTextOrNativeControl(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName ?? target.nodeName ?? '').toUpperCase();
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return true;
  return Boolean(target.closest?.('input,select,textarea,button,[contenteditable="true"],[contenteditable=""]'));
}

export function createDirectControls({
  moveZone, aimZone, jumpButton, hitButton, actionSelect, feedButton, feedSelect,
  onActivity = null, keyBindings = DEFAULT_KEYS,
}) {
  const input = createDirectInput();
  const supplied = keyBindings ?? {};
  const bindings = {
    up: bindingCodes(supplied.up ?? supplied.forward ?? DEFAULT_KEYS.up),
    down: bindingCodes(supplied.down ?? supplied.backward ?? DEFAULT_KEYS.down),
    left: bindingCodes(supplied.left ?? DEFAULT_KEYS.left),
    right: bindingCodes(supplied.right ?? DEFAULT_KEYS.right),
    jump: bindingCodes(supplied.jump ?? DEFAULT_KEYS.jump),
    action: bindingCodes(supplied.action ?? supplied.hit ?? DEFAULT_KEYS.action),
    feed: bindingCodes(supplied.feed ?? DEFAULT_KEYS.feed),
    select: bindingCodes(supplied.select ?? DEFAULT_KEYS.select),
  };
  const doc = moveZone?.ownerDocument ?? globalThis.document;
  const win = doc?.defaultView ?? globalThis.window;
  const removers = [];
  let disposed = false;
  let movePointer = null;
  let aimPointer = null;
  let hitPointer = null;
  let aimHeading = 0;

  function listen(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }
  function activity(kind) { onActivity?.(kind); }
  // DOM timestamps use an unrelated page clock. Controls deliberately queue to
  // the next unsampled simulation tick; directInput exposes timestamp mapping
  // separately for recorded/raw sources with an explicit clock origin.
  function stamp() { return 0; }
  function capture(target, e) { try { target.setPointerCapture?.(e.pointerId); } catch {} }
  function release(target, id) { try { target.releasePointerCapture?.(id); } catch {} }
  function css(target, key, value) { target?.style?.setProperty?.(key, String(value)); }

  function clearPointers() {
    if (movePointer) release(moveZone, movePointer.id);
    if (aimPointer) release(aimZone, aimPointer.id);
    if (hitPointer) release(hitButton, hitPointer.id);
    movePointer = null;
    aimPointer = null;
    hitPointer = null;
    aimHeading = 0;
    css(moveZone, '--stick-active', 0);
    css(moveZone, '--stick-x', '0px');
    css(moveZone, '--stick-y', '0px');
    css(aimZone, '--aim-active', 0);
  }
  function reset() {
    clearPointers();
    input.reset();
  }

  listen(moveZone, 'pointerdown', (e) => {
    if (movePointer) return;
    movePointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    capture(moveZone, e);
    css(moveZone, '--stick-active', 1);
    css(moveZone, '--stick-origin-x', `${e.clientX}px`);
    css(moveZone, '--stick-origin-y', `${e.clientY}px`);
    activity('move');
    e.preventDefault?.();
  });
  listen(moveZone, 'pointermove', (e) => {
    if (!movePointer || movePointer.id !== e.pointerId) return;
    let dx = e.clientX - movePointer.x;
    let dy = e.clientY - movePointer.y;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS) { dx *= STICK_RADIUS / length; dy *= STICK_RADIUS / length; }
    css(moveZone, '--stick-x', `${dx}px`);
    css(moveZone, '--stick-y', `${dy}px`);
    input.queueMove({ x: dx / STICK_RADIUS, z: dy / STICK_RADIUS }, stamp(e));
    activity('move');
    e.preventDefault?.();
  });
  const endMove = (e) => {
    if (!movePointer || movePointer.id !== e.pointerId) return;
    release(moveZone, movePointer.id);
    movePointer = null;
    css(moveZone, '--stick-active', 0);
    css(moveZone, '--stick-x', '0px');
    css(moveZone, '--stick-y', '0px');
    input.queueMove({ x: 0, z: 0 }, stamp(e));
  };
  listen(moveZone, 'pointerup', endMove);
  listen(moveZone, 'pointercancel', () => reset());

  listen(aimZone, 'pointerdown', (e) => {
    if (aimPointer) return;
    aimPointer = { id: e.pointerId, x: e.clientX, heading: aimHeading };
    capture(aimZone, e);
    css(aimZone, '--aim-active', 1);
    activity('aim');
    e.preventDefault?.();
  });
  listen(aimZone, 'pointermove', (e) => {
    if (!aimPointer || aimPointer.id !== e.pointerId) return;
    const dx = e.clientX - aimPointer.x;
    const heading = Math.max(-Math.PI, Math.min(Math.PI, aimPointer.heading + dx / STICK_RADIUS * (Math.PI / 2)));
    aimHeading = heading;
    input.queueAim({ x: Math.sin(heading), z: -Math.cos(heading) }, stamp(e));
    css(aimZone, '--aim-heading', `${heading}rad`);
    activity('aim');
    e.preventDefault?.();
  });
  const endAim = (e) => {
    if (!aimPointer || aimPointer.id !== e.pointerId) return;
    release(aimZone, aimPointer.id);
    aimPointer = null;
    css(aimZone, '--aim-active', 0);
  };
  listen(aimZone, 'pointerup', endAim);
  listen(aimZone, 'pointercancel', () => reset());

  function bindAction(button, resolve, { aimGesture = false } = {}) {
    if (!button) return;
    listen(button, 'pointerdown', (e) => {
      if (aimGesture && hitPointer) return;
      const value = resolve();
      if (aimGesture && value.action === 'spike') input.queueShotType('LINE', stamp(e));
      if (aimGesture && value.action === 'receive') input.queuePassType('NEUTRAL', stamp(e));
      input.queueAction(value.action, stamp(e), { feedKind: value.feedKind });
      if (aimGesture && !hitPointer) {
        hitPointer = { id: e.pointerId, x: e.clientX, y: e.clientY, heading: aimHeading, action: value.action, shotType: 'LINE', passType: 'NEUTRAL' };
        capture(button, e);
      }
      activity(value.action);
      e.preventDefault?.();
    });
    if (aimGesture) {
      listen(button, 'pointermove', (e) => {
        if (!hitPointer || hitPointer.id !== e.pointerId) return;
        const dx = e.clientX - hitPointer.x;
        if (hitPointer.action === 'spike') {
          const type = spikeShotType(dx, e.clientY - hitPointer.y);
          if (type !== hitPointer.shotType) {
            hitPointer.shotType = type;
            input.queueShotType(type, stamp(e));
          }
        } else if (hitPointer.action === 'receive') {
          const type = receivePassType(dx, e.clientY - hitPointer.y);
          if (type !== hitPointer.passType) {
            hitPointer.passType = type;
            input.queuePassType(type, stamp(e));
          }
        }
        // A receive swipe chooses the platform only; turning stays on the aim zone
        // and the assist, so the two cannot cancel each other out.
        if (hitPointer.action !== 'receive') {
          aimHeading = Math.max(-Math.PI, Math.min(Math.PI, hitPointer.heading + dx / STICK_RADIUS * (Math.PI / 2)));
          input.queueAim({ x: Math.sin(aimHeading), z: -Math.cos(aimHeading) }, stamp(e));
          css(aimZone, '--aim-heading', `${aimHeading}rad`);
          activity('aim');
        }
        e.preventDefault?.();
      });
      listen(button, 'pointerup', (e) => {
        if (!hitPointer || hitPointer.id !== e.pointerId) return;
        release(button, hitPointer.id);
        hitPointer = null;
      });
    }
    listen(button, 'click', (e) => {
      // Pointer activation already fires on pointerdown. Browsers report a
      // positive click detail for mouse/touch and zero for keyboard activation.
      if (e.detail > 0) return;
      const value = resolve();
      if (aimGesture && value.action === 'spike') input.queueShotType('LINE', stamp(e));
      if (aimGesture && value.action === 'receive') input.queuePassType('NEUTRAL', stamp(e));
      input.queueAction(value.action, stamp(e), { feedKind: value.feedKind });
      activity(value.action);
    });
    listen(button, 'pointercancel', reset);
  }
  bindAction(jumpButton, () => ({ action: 'jump' }));
  bindAction(hitButton, () => ({ action: ACTIONS.includes(actionSelect?.value) ? actionSelect.value : 'receive' }), { aimGesture: true });
  bindAction(feedButton, () => ({ action: 'feed', feedKind: feedSelect?.value ?? null }));

  const directionFor = (code) => ['up', 'down', 'left', 'right'].find(name => bindings[name].includes(code));
  listen(win, 'keydown', (e) => {
    if (isTextOrNativeControl(e.target)) return;
    const direction = directionFor(e.code);
    if (direction) {
      if (!e.repeat) input.queueMoveKey(direction, true, stamp(e), e.code);
      e.preventDefault?.(); activity('move'); return;
    }
    const selected = bindings.select.indexOf(e.code);
    if (selected >= 0 && selected < ACTIONS.length) {
      if (!e.repeat && actionSelect) actionSelect.value = ACTIONS[selected];
      activity('select'); return;
    }
    if (e.repeat) return;
    if (bindings.jump.includes(e.code)) input.queueAction('jump', stamp(e), { dedupeKey: e.code });
    else if (bindings.action.includes(e.code)) {
      const action = ACTIONS.includes(actionSelect?.value) ? actionSelect.value : 'receive';
      if (action === 'spike') input.queueShotType('LINE', stamp(e));
      if (action === 'receive') input.queuePassType('NEUTRAL', stamp(e));
      input.queueAction(action, stamp(e), { dedupeKey: e.code });
    }
    else if (bindings.feed.includes(e.code)) input.queueAction('feed', stamp(e), { feedKind: feedSelect?.value ?? null, dedupeKey: e.code });
    else return;
    e.preventDefault?.(); activity('action');
  });
  listen(win, 'keyup', (e) => {
    const direction = directionFor(e.code);
    if (direction) input.queueMoveKey(direction, false, stamp(e), e.code);
  });
  listen(win, 'blur', reset);
  listen(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') reset(); });

  return {
    sample(tick) { return input.sample(tick); },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      while (removers.length) removers.pop()();
    },
    getState() {
      return {
        ...input.getState(), movePointer: movePointer?.id ?? null,
        aimPointer: aimPointer?.id ?? null, hitPointer: hitPointer?.id ?? null, disposed,
      };
    },
  };
}
