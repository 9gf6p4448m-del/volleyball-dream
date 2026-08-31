// Phase 4.5B §2 演出地基——純函式核心（零 three/DOM 依賴，node 可測）。
// 三件事：①演出時間軸（獨立 rAF 演出時鐘的可測核心：跳過後狀態與播完全一致）
// ②頻率框架 full/short/off（決定論：敘事首次或關鍵分＝全版，其餘短版，設定可全關）
// ③關鍵分判定（局點/賽點——賽點必為局點，故局點判定即涵蓋）。
// 顯示哲學底線：off 只省「演出」，真值字卡/commentary 通道不經此框架、不受影響。

// ---- ①演出時間軸 ----
// steps: [{ dur(ms), apply(t 0..1) }]，apply 必須是「絕對式」寫法（由 t 直接定狀態，
// 不做增量累加）——這是「跳過＝播完」逐值一致的前提，測試背書。
export function createBeatTimeline(steps) {
  const seq = steps.filter((s) => s && typeof s.apply === 'function');
  let elapsed = 0;
  let finished = false;
  const total = seq.reduce((sum, s) => sum + Math.max(0, s.dur ?? 0), 0);

  function seek(ms) {
    let at = 0;
    for (const s of seq) {
      const dur = Math.max(0, s.dur ?? 0);
      if (ms >= at + dur) s.apply(1);
      else if (ms > at) s.apply(dur > 0 ? (ms - at) / dur : 1);
      // ms <= at＝還沒輪到：不碰（維持前值——步進式演出不預跑）
      at += dur;
    }
  }

  return {
    get duration() { return total; },
    get elapsed() { return elapsed; },
    get done() { return finished; },
    advance(dtMs) {
      if (finished) return true;
      elapsed = Math.min(elapsed + Math.max(0, dtMs), total);
      seek(elapsed);
      if (elapsed >= total) finished = true;
      return finished;
    },
    // 跳過＝一次把每一步定格在 t=1（與播完的終態逐值一致）；冪等
    finish() {
      if (!finished) for (const s of seq) s.apply(1);
      elapsed = total;
      finished = true;
    },
  };
}

// rAF 驅動器：演出一律走牆鐘（performance.now），不掛 sim tick——sim 凍結相容
// （tour 燈光秀既有範式）。回傳 stop()；timeline 播畢自動停。
export function driveTimeline(timeline, { onDone } = {}) {
  let raf = null;
  let last = null;
  function frame(now) {
    const dt = last === null ? 0 : Math.min(now - last, 100);
    last = now;
    if (timeline.advance(dt)) {
      raf = null;
      onDone?.();
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    stop() { if (raf !== null) cancelAnimationFrame(raf); raf = null; },
    skip() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      timeline.finish();
      onDone?.();
    },
  };
}

// ---- ②頻率框架（拍板 2a）----
// 三態：full（全版）／short（≤1.5s）／off。判定決定論、零隨機：
// 設定全關→off；關鍵分（局點/賽點）→full；敘事第一次（生涯內首次）→full；其餘→short。
export const SHORT_BEAT_MS = 1500;

export function signatureMode({ pref = 'on', seen = false, keyPoint = false } = {}) {
  if (pref === 'off') return 'off';
  if (keyPoint) return 'full';
  if (!seen) return 'full';
  return 'short';
}

// 演出開關（設定可全關）：全域偏好、非逐槽——存 localStorage 單鍵。
// off 不吃掉真值資訊（字卡/commentary 不經此框架）。
export const PRESENTATION_PREF_KEY = 'vd-presentation';

export function loadPresentationPref(storage) {
  try {
    return storage?.getItem?.(PRESENTATION_PREF_KEY) === 'off' ? 'off' : 'on';
  } catch { return 'on'; }
}

export function savePresentationPref(storage, pref) {
  try { storage?.setItem?.(PRESENTATION_PREF_KEY, pref === 'off' ? 'off' : 'on'); } catch { /* 私隱模式等寫入失敗＝維持預設 */ }
}

// ---- ③關鍵分判定 ----
// 局點：任一隊「下一分即可拿下本局」（含 deuce 淨勝 2 語意）；
// 賽點＝會同時拿下整場的局點——是局點的子集，「局點/賽點恆全版」判局點即足。
export function isSetPoint(score, target) {
  for (const team of ['A', 'B']) {
    const mine = score[team];
    const theirs = score[team === 'A' ? 'B' : 'A'];
    if (mine + 1 >= target && mine + 1 - theirs >= 2) return true;
  }
  return false;
}

export function keyPointOf(game) {
  const m = game?.match;
  if (!m) return false;
  return isSetPoint(m.score, m.target);
}

// 大作感四卷 批1（J2，純函式）：賽點視覺共用判準——scorebug 徽章呼吸與 LED 跑馬燈
// 警示色都吃這一個值，不各自重判（沿用既有 keyPointOf，不另立判準）。
// 教學局（tutorial=true）與局終（set_over）恆 false——死球後若已局終，兩處視覺都要
// 一起還原成常態，不留在警示狀態。
export function keyPointVisualOn(game, tutorial = false) {
  if (tutorial) return false;
  if (game?.phase === 'set_over') return false;
  return keyPointOf(game);
}
