const DEFAULT_TICK_MS = 1000 / 60;

function normalized(vector) {
  const length = Math.hypot(vector.x, vector.z);
  if (length <= 1) return { x: vector.x, z: vector.z };
  return { x: vector.x / length, z: vector.z / length };
}

/**
 * Pure tick-quantized input queue. Raw timestamps are measured from clockOrigin
 * and map to ceil((timestamp - clockOrigin) / tickMs). An event can never be
 * assigned before the next unsampled tick. Equal timestamps retain call order.
 */
export function createDirectInput({ clockOrigin = 0, tickMs = DEFAULT_TICK_MS } = {}) {
  if (!(tickMs > 0)) throw new RangeError('tickMs must be positive');

  let lastSampledTick = -1;
  let eventSequence = 0;
  let commandSequence = 0;
  let queued = [];
  let move = { x: 0, z: 0 };
  let aim = { x: 0, z: -1 };
  let shotType = null;
  let passType = null;
  const moveKeys = new Map();
  const dedupe = new Set();

  function eventTick(timestamp) {
    const raw = Number.isFinite(timestamp) ? timestamp : clockOrigin;
    const clockTick = Math.max(0, Math.ceil((raw - clockOrigin) / tickMs));
    return Math.max(lastSampledTick + 1, clockTick);
  }

  function enqueue(kind, value, timestamp) {
    queued.push({ tick: eventTick(timestamp), order: eventSequence++, kind, value });
  }

  function keyboardMove() {
    return normalized({
      x: ([...moveKeys.values()].includes('right') ? 1 : 0) - ([...moveKeys.values()].includes('left') ? 1 : 0),
      z: ([...moveKeys.values()].includes('down') ? 1 : 0) - ([...moveKeys.values()].includes('up') ? 1 : 0),
    });
  }

  function command(tick, action = null, feedKind = null) {
    return {
      tick,
      sequence: commandSequence++,
      move: { ...move },
      aim: { ...aim },
      action,
      ...(shotType == null ? {} : { shotType }),
      ...(passType == null ? {} : { passType }),
      ...(feedKind == null ? {} : { feedKind }),
    };
  }

  return {
    queueMove(vector, timestamp) {
      enqueue('move', normalized(vector), timestamp);
    },
    queueMoveKey(direction, held, timestamp, source = direction) {
      enqueue('move-key', { direction, held: Boolean(held), source }, timestamp);
    },
    queueAim(vector, timestamp) {
      const next = normalized(vector);
      if (next.x !== 0 || next.z !== 0) enqueue('aim', next, timestamp);
    },
    queueShotType(type, timestamp) {
      enqueue('shot-type', type, timestamp);
    },
    queuePassType(type, timestamp) {
      enqueue('pass-type', type, timestamp);
    },
    queueAction(action, timestamp, { feedKind = null, dedupeKey = null } = {}) {
      if (dedupeKey != null) {
        const key = `${eventTick(timestamp)}:${dedupeKey}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
      }
      enqueue('action', { action, feedKind }, timestamp);
      return true;
    },
    sample(tick) {
      if (!Number.isInteger(tick) || tick <= lastSampledTick) {
        throw new Error(`sample tick must increase (last ${lastSampledTick}, got ${tick})`);
      }
      const due = [];
      const later = [];
      for (const item of queued) (item.tick <= tick ? due : later).push(item);
      queued = later;
      due.sort((a, b) => a.tick - b.tick || a.order - b.order);

      const actions = [];
      for (const item of due) {
        if (item.kind === 'move') move = item.value;
        if (item.kind === 'aim') aim = item.value;
        if (item.kind === 'shot-type') shotType = item.value;
        if (item.kind === 'pass-type') passType = item.value;
        if (item.kind === 'move-key') {
          if (item.value.held) moveKeys.set(item.value.source, item.value.direction);
          else moveKeys.delete(item.value.source);
          move = keyboardMove();
        }
        if (item.kind === 'action') actions.push(item.value);
      }
      lastSampledTick = tick;
      for (const key of dedupe) {
        if (Number(key.slice(0, key.indexOf(':'))) <= tick) dedupe.delete(key);
      }
      return [command(tick), ...actions.map(item => command(tick, item.action, item.feedKind))];
    },
    reset() {
      queued = [];
      moveKeys.clear();
      dedupe.clear();
      move = { x: 0, z: 0 };
      aim = { x: 0, z: -1 };
      shotType = null;
      passType = null;
    },
    getState() {
      return {
        move: { ...move }, aim: { ...aim }, shotType, passType,
        lastSampledTick, pendingEvents: queued.length,
      };
    },
  };
}
