import * as THREE from 'three';
import { createDirectGame, stepDirectGame, getDirectPose, snapshotDirectGame,
  restoreDirectGame, replayDirectTape, serializeDirectState, DIRECT_DT, SIMULATION_VERSION } from '../sim/directGame.js';
import { createDirectControls } from '../input/directControls.js';
import { autoFaceAim } from '../input/directAutoFace.js';
import { createDirectPlayerView } from '../render/directPlayerView.js';
import { DIRECT_PHYSICS, DIRECT_ACTIONS, RECEIVE_ASSIST } from '../sim/directConstants.js';
import { platformNormal } from '../sim/directPhysics.js';
import { nextJudgement, resolveHitAction, slowMotionScale, techniquePoint, underRadius } from '../sim/directReceiveRules.js';
import { contactReason, missReason, GRADE_LABELS } from './directReceiveReasons.js';
import './directPractice.css';

const FEED_DELAY = 90; // ticks (1.5 s) from pressing feed to the ball
const AUTO_FEED_PAUSE = 60; // ticks after a dead ball before the next countdown
const ACTION_LABELS = { receive: '接球', spike: '扣球', tip: '吊球', set: '舉球', block: '攔網', dive: '魚躍' };
const SHOT_LABELS = { LINE: '直線重扣', CROSS_LEFT: '左斜線', CROSS_RIGHT: '右斜線', TIP: '單手吊球' };
const MAX_TAPE_TICKS = 36000;
const PART_LABELS = { head: '頭部', hand: '手掌', forearm: '前臂', arm: '上臂', torso: '軀幹', leg: '腿部' };
const HINT_IDLE = '走到球路上，讓接球圈套住球的觸球點，外圈變金色就按出手；圈外的球出手鍵會自動改成魚躍 · 扣球時上滑吊球、下滑直線、左右滑斜線';

export function runDirectPractice(ctx) {
  if (ctx.params.get('net') === '1') throw new Error('直接操作訓練尚未支援連線，請移除 net 參數。');
  ctx.loadingEl.remove();
  const oldHud = document.getElementById('hud');
  oldHud.hidden = true;
  const root = document.createElement('section');
  root.className = 'dp-root';
  root.setAttribute('aria-label', '直接操作訓練場');
  root.innerHTML = `
    <header class="dp-top">
      <div class="dp-brand"><div class="dp-eyebrow">VOLLEYBALL DREAM / LAB 01</div><h1>每一次，親手接住。</h1><p>直接操作訓練 · 一人一球 · 尚未接入生涯</p></div>
      <nav class="dp-toolbar" aria-label="訓練工具">
        <button data-feed>餵一球 <span aria-hidden="true">↗</span></button>
        <button data-pause>暫停</button>
        <details class="dp-settings"><summary>訓練設定</summary><div class="dp-settings-box">
          <label>餵球種類<select data-feed-kind><option value="receive">接球練習</option><option value="serve">強力發球</option><option value="spike">高球進攻</option><option value="block">網前攔網</option></select></label>
          <label>練習指定<select data-action aria-label="出手鍵的動作"><option value="auto">自動（接球／魚躍）</option>${Object.entries(ACTION_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
          <label>資訊輔助<select data-assist><option value="beginner">入門 · 預測落點</option><option value="standard">標準 · 只看球影</option><option value="advanced">進階 · 關閉額外提示</option></select></label>
          <label class="dp-check"><input data-auto-feed type="checkbox"> 連續餵球（球落地後自動再餵）</label>
          <label class="dp-check"><input data-slowmo type="checkbox" checked> 快球慢動作（只慢畫面，不改判定）</label>
          <label>身高 <output data-height-label>175 cm</output><input data-height type="range" min="150" max="210" value="175" step="1"></label>
          <label>低手接球範圍 <output data-under-label>50 cm</output><input data-under type="range" min="20" max="90" value="50" step="5"></label>
          <label>高手接球範圍 <output data-over-label>35 cm</output><input data-over type="range" min="15" max="70" value="35" step="5"></label>
          <p>更改身高或接球範圍會開始新一輪訓練。球到觸球高度時在接球圈內、按出手的時機對了就接得到；按得越準，球越接近舉球區。圈外但撲得到的球，出手鍵會自動變成魚躍。</p>
          <button data-replay>回放本輪</button><button data-export>匯出回放</button><button data-restart>重新開始</button>
          <details><summary>鍵盤設定</summary><div class="dp-keygrid">
            <label>前進<input data-key="forward" value="KeyW" aria-label="前進鍵"></label><label>後退<input data-key="backward" value="KeyS" aria-label="後退鍵"></label>
            <label>向左<input data-key="left" value="KeyA" aria-label="向左鍵"></label><label>向右<input data-key="right" value="KeyD" aria-label="向右鍵"></label>
            <label>起跳<input data-key="jump" value="Space" aria-label="起跳鍵"></label><label>出手<input data-key="hit" value="KeyJ" aria-label="出手鍵"></label>
          </div><button data-bind>套用鍵位</button></details>
          <p class="dp-metrics" data-metrics></p><p data-build></p>
        </div></details>
        <a href="?">返回生涯</a>
      </nav>
    </header>
    <div class="dp-coach"><strong data-message>先餵一球，走到球路上接住它。</strong><p data-hint>${HINT_IDLE}</p></div>
    <div class="dp-move" data-move aria-label="移動搖桿"><span>走位 / WASD</span></div>
    <div class="dp-aim" data-aim aria-label="拖曳調整朝向">滑動瞄準</div>
    <div class="dp-actions"><button class="dp-jump" data-jump>起跳<small>SPACE</small></button><button class="dp-hit" data-hit data-action="receive">出手<small data-hit-label>接球 · J</small></button></div>
    <div class="dp-grade" data-grade aria-live="polite"></div>
    <div class="dp-countdown" data-countdown hidden></div>
    <div class="dp-footer" data-status>60 Hz 固定模擬 · 接球圈內按對時機就接得到</div>`;
  document.body.appendChild(root);
  const $ = selector => root.querySelector(selector);
  $('[data-build]').textContent = `${SIMULATION_VERSION} · ${typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__}`;
  const view = createDirectPlayerView(ctx.scene);
  const ring = (inner, outer, color, opacity, y) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.visible = false;
    ctx.scene.add(mesh);
    return mesh;
  };
  const landing = ring(0.25, 0.29, 0x9ae5df, 0.65, 0.025);
  // direct-v8: the ball's touch point and your receive circle; overlapping = in position.
  const touchRing = ring(0.08, 0.12, 0xffc861, 0.9, 0.028);
  const reachRing = ring(0.46, 0.5, 0x9ae5df, 0.55, 0.024);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.8, 0x9ae5df, 0.2, 0.12);
  ctx.scene.add(arrow);
  // Platform facing line: drawn from the shared pose, a prediction and never a guarantee.
  const platformArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.9, 0xffc861, 0.2, 0.12);
  platformArrow.visible = false;
  ctx.scene.add(platformArrow);
  let timingActive = false;
  const seed = Number(ctx.params.get('seed')) || 1;
  const assistRadii = () => ({ underRadius: Number($('[data-under]').value) / 100, overRadius: Number($('[data-over]').value) / 100 });
  let state = createDirectGame({ seed, assist: assistRadii() });
  let initial = snapshotDirectGame(state);
  let recorded = [];
  let controls;
  let activeBindings;
  let paused = false;
  let disposed = false;
  let playback = null;
  let liveState = null;
  let accumulator = 0;
  let lastTime = performance.now();
  let raf;
  let lastReport = 0;
  let lastContactTick = -1000;
  let frameTimes = [];
  let simTimes = [];
  let maxBacklog = 0;
  let slowMotionTicks = 0; // sim ticks advanced while the picture ran at 0.5×
  const injected = [];
  // direct-v7 round 2: a feed from the button/key starts after a countdown, so
  // the player has time to move; continuous mode re-feeds after each dead ball.
  let pendingFeed = null;
  const cameraTarget = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const look = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const listeners = [];
  const on = (target, event, handler) => { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); };
  // direct-v8 (R10): what the hit button does right now. Automatic unless the
  // practice assignment names an action; the sim executes exactly this.
  const hitActionNow = () => resolveHitAction(state, $('[data-action]').value);
  function bindControls(keyBindings) {
    controls?.dispose();
    activeBindings = keyBindings;
    controls = createDirectControls({
      moveZone: $('[data-move]'), aimZone: $('[data-aim]'), jumpButton: $('[data-jump]'),
      hitButton: $('[data-hit]'), actionSelect: null, feedButton: $('[data-feed]'), feedSelect: $('[data-feed-kind]'),
      ...(keyBindings ? { keyBindings } : {}),
      resolveAction: hitActionNow,
      onActivity(kind) {
        if (kind === 'feed') message('準備接球：倒數結束就發球，先站到球路上。');
      },
    });
  }
  bindControls();
  function message(text) { $('[data-message]').textContent = text; }
  function tape() { return { simulationVersion: SIMULATION_VERSION, initial, commands: recorded, endTick: playback ? liveState.tick : state.tick }; }
  function restart() {
    bindControls(activeBindings); // A new recording starts a new input tick timeline.
    state = createDirectGame({ seed, height: Number($('[data-height]').value) / 100, assist: assistRadii() });
    initial = snapshotDirectGame(state);
    recorded = [];
    injected.length = 0;
    pendingFeed = null;
    playback = null;
    liveState = null;
    accumulator = 0;
    lastContactTick = -1000;
    slowMotionTicks = 0;
    rehearsal = { tick: -1, key: null, value: false };
    frameTimes = [];
    simTimes = [];
    maxBacklog = 0;
    $('[data-replay]').textContent = '回放本輪';
    setPaused(false);
    updateHitLabel();
    message('新一輪訓練。先餵球，再用身體接住。');
  }
  function setPaused(value) {
    paused = value;
    controls.reset();
    accumulator = 0;
    lastTime = performance.now();
    $('[data-pause]').textContent = paused ? '繼續' : '暫停';
  }
  on($('[data-pause]'), 'click', () => setPaused(!paused));
  on($('[data-restart]'), 'click', restart);
  on($('[data-height]'), 'input', () => { $('[data-height-label]').textContent = `${$('[data-height]').value} cm`; });
  on($('[data-height]'), 'change', restart);
  on($('[data-action]'), 'change', updateHitLabel);
  on($('[data-auto-feed]'), 'change', () => {
    if ($('[data-auto-feed]').checked && !state.ball.active && !pendingFeed && !playback)
      pendingFeed = { tick: state.tick + FEED_DELAY, feedKind: $('[data-feed-kind]').value };
  });
  for (const key of ['under', 'over']) {
    on($(`[data-${key}]`), 'input', () => { $(`[data-${key}-label]`).textContent = `${$(`[data-${key}]`).value} cm`; });
    on($(`[data-${key}]`), 'change', restart);
  }
  on($('[data-bind]'), 'click', () => {
    const bindings = Object.fromEntries([...root.querySelectorAll('[data-key]')].map(el => [el.dataset.key, el.value.trim()]));
    if (Object.values(bindings).some(value => !/^(Key[A-Z]|Digit[0-9]|Space|Arrow(Up|Down|Left|Right))$/.test(value)) || new Set(Object.values(bindings)).size !== 6) {
      message('請使用不重複的 KeyA–KeyZ、Digit0–9、Space 或方向鍵。'); return;
    }
    bindControls(bindings);
    message('鍵位已套用於本次訓練。');
  });
  on($('[data-replay]'), 'click', () => {
    if (playback) {
      state = restoreDirectGame(liveState); liveState = null; playback = null;
      $('[data-replay]').textContent = '回放本輪'; setPaused(false); message('已返回原訓練狀態。'); return;
    }
    if (state.tick === 0) { message('先試打一球，再回放。'); return; }
    const record = tape();
    const end = replayDirectTape(record);
    if (serializeDirectState(end) !== serializeDirectState(state)) throw new Error('直接操作回放與即時狀態不一致');
    liveState = snapshotDirectGame(state);
    state = restoreDirectGame(initial);
    playback = { ...record, index: 0 };
    $('[data-replay]').textContent = '退出回放'; setPaused(false);
    message('正在回放 · 相同操作與物理，結果已逐值核對。');
  });
  on($('[data-export]'), 'click', () => {
    const record = {
      ...tape(),
      environment: {
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
        quality: ctx.quality,
        build: typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__,
      },
      performance: { ...metrics(), sampleWindow: 'Most recent 3600 rendered frames / simulation ticks; not a full 10-minute match' },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(record)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `volleyball-direct-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  on(document, 'visibilitychange', () => { if (document.hidden) setPaused(true); });
  on(window, 'blur', () => setPaused(true));
  // The hit button always says what a press does now (R10).
  function updateHitLabel() {
    const action = hitActionNow();
    const hit = $('[data-hit]');
    hit.dataset.action = action;
    $('[data-hit-label]').textContent = `${ACTION_LABELS[action] ?? action} · J`;
  }
  function step() {
    let commands;
    if (playback) {
      commands = [];
      while (playback.index < playback.commands.length && playback.commands[playback.index].tick === state.tick) commands.push(playback.commands[playback.index++]);
    } else {
      commands = controls.sample(state.tick);
      // Receive auto-face: the heading turns toward the setter zone (at most 45°)
      // while the hit button would receive and the ball is live (commands only).
      const faceAim = hitActionNow() === 'receive' ? autoFaceAim(state.player, state.ball) : null;
      if (faceAim) commands = commands.map(command => ({ ...command, aim: faceAim }));
      commands = commands.map(command => {
        if (command.action !== 'feed') return command;
        pendingFeed = { tick: state.tick + FEED_DELAY, feedKind: command.feedKind ?? null };
        return { ...command, action: null };
      });
      if (pendingFeed && state.tick >= pendingFeed.tick) {
        commands.push({ tick: state.tick, sequence: 200000, action: 'feed', feedKind: pendingFeed.feedKind });
        pendingFeed = null;
      }
      while (injected.length) commands.push({ ...injected.shift(), tick: state.tick, sequence: 100000 + commands.length });
      if (state.tick >= MAX_TAPE_TICKS) { setPaused(true); message('本輪已達 10 分鐘，請匯出回放後重新開始。'); return; }
      recorded.push(...commands.map(command => structuredClone(command)));
    }
    const before = performance.now();
    stepDirectGame(state, commands);
    simTimes.push(performance.now() - before);
    if (simTimes.length > 3600) simTimes.shift();
    updateHitLabel();
    for (const event of state.events) {
      if (event.type === 'feed' && !playback) message('球來了：讓接球圈套住觸球點，外圈變金色就按。');
      if (!playback && ['ground', 'net', 'out'].includes(event.type) && $('[data-auto-feed]').checked && !pendingFeed)
        pendingFeed = { tick: state.tick + AUTO_FEED_PAUSE + FEED_DELAY, feedKind: $('[data-feed-kind]').value };
      if (event.type === 'contact') {
        lastContactTick = state.tick;
        if (event.tier) showGrade(event);
        if ((event.tier || event.spray) && !playback) message(contactReason(event));
        else if (!playback) message(`球碰到${PART_LABELS[event.part] ?? '身體'}彈開了 · 試著改變站位與出手時機。`);
      } else if (!playback && ['ground', 'net', 'out'].includes(event.type)) {
        // direct-v8 (R7): every ball ends with a reason. A judged touch already explained itself.
        if (!event.judged || event.miss) message(missReason(event));
        else if (event.type === 'net') message('球碰網了。');
      }
    }
    if (playback && state.tick >= playback.endTick) { setPaused(true); message('回放結束。按「退出回放」返回訓練。'); }
  }
  // direct-v7: timed pass feedback (PERFECT / GOOD / POOR, technique).
  function showGrade(event) {
    const grade = $('[data-grade]');
    const unset = event.technique !== 'dive' && (event.bodySpeed ?? 0) >= RECEIVE_ASSIST.unsetSpeed;
    grade.textContent = `${GRADE_LABELS[event.tier]} · ${event.technique === 'overhand' ? '高手' : event.technique === 'dive' ? '魚躍' : '低手'}${unset ? ' · 沒站穩' : ''}`;
    grade.dataset.tier = event.tier;
    grade.classList.remove('dp-grade-show');
    void grade.offsetWidth; // restart the fade animation
    grade.classList.add('dp-grade-show');
  }
  // Exact cue for "press now": rehearse the hit button on a copy of the current
  // state and report whether the rules would judge a pass (or a dive). Runs
  // once per simulated tick; the live state and inputs are never touched.
  let rehearsal = { tick: -1, key: null, value: false };
  function pressNowReaches() {
    // Auto-face turns the body before contact; rehearse with the same headings.
    const key = `${state.tick}:${playback ? 'p' : 'l'}:${$('[data-action]').value}`;
    if (rehearsal.key === key) return rehearsal.value;
    const copy = snapshotDirectGame(state);
    const aim = { ...copy.player.aim };
    let value = false;
    const action = hitActionNow();
    const def = DIRECT_ACTIONS[action] ?? DIRECT_ACTIONS.receive;
    const window = def.windup + def.active + 10;
    for (let i = 0; i < window && copy.ball.active; i++) {
      const heading = (action === 'receive' && autoFaceAim(copy.player, copy.ball)) || aim;
      stepDirectGame(copy, [{ tick: copy.tick, sequence: 0, move: { x: 0, z: 0 }, aim: heading, action: i === 0 ? action : null }]);
      const contact = copy.events.find(e => e.type === 'contact');
      if (contact) { value = Boolean(contact.tier); break; }
    }
    rehearsal = { tick: state.tick, key, value };
    return value;
  }
  // Seconds until the judgement that will apply (receive or dive), or null.
  function judgementEta() {
    const next = nextJudgement(state);
    return next && next.t > 0 && next.t <= 1.5 ? next.t : null;
  }
  // direct-v8 (R9): the picture runs at half speed before a hard ball's judgement.
  const slowMotion = () => (playback ? 1 : slowMotionScale(state, { enabled: $('[data-slowmo]').checked }));
  function metrics() {
    const percentile = values => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * 0.95)]; };
    const average = frameTimes.length ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length : 0;
    return { frames: frameTimes.length, fps: average ? 1000 / average : 0, frameP95: percentile(frameTimes), simP95: percentile(simTimes), backlogMs: accumulator * 1000, maxBacklogMs: maxBacklog * 1000, drawCalls: ctx.renderer.info.render.calls, slowMotionTicks };
  }
  function draw(dt = 0) {
    view.sync(getDirectPose(state));
    // No interpolation of collision-bearing body or ball: both show the same completed tick.
    const shownY = state.stats.feeds === 0 ? -10 : state.ball.y;
    ctx.ballView.sync({ ...state.ball, y: shownY, px: state.ball.x, py: shownY, pz: state.ball.z }, 1, dt, false, state.tick - lastContactTick < 8 ? 0.5 : 0);
    const { player, ball } = state;
    const portrait = ctx.camera.aspect < 0.85;
    cameraTarget.set(player.x * 0.45, 1.55, player.z - 2.8);
    cameraPosition.set(player.x + (portrait ? 0.55 : 1.35), 3.1, player.z + (portrait ? 7.8 : 5.7));
    if (ball.active) cameraTarget.y += Math.max(0, Math.min(1.15, (ball.y - 2) * 0.25));
    const smoothing = dt ? 1 - Math.exp(-7 * dt) : 1;
    ctx.camera.position.lerp(cameraPosition, smoothing);
    look.lerp(cameraTarget, smoothing);
    ctx.camera.lookAt(look);
    arrow.position.set(player.x, 0.04, player.z);
    direction.set(player.aim?.x ?? 0, 0, player.aim?.z ?? -1).normalize();
    arrow.setDirection(direction);
    arrow.visible = $('[data-assist]').value !== 'advanced';
    const hints = $('[data-assist]').value !== 'advanced';
    const receive = DIRECT_ACTIONS.receive;
    const pose = getDirectPose(state);
    const face = hints && player.action === 'receive' && player.actionTick < receive.windup + receive.active
      ? platformNormal(pose, { requireActive: false }) : null;
    platformArrow.visible = !!face;
    if (face) {
      const left = pose.find(part => part.id === 'left-forearm'), right = pose.find(part => part.id === 'right-forearm');
      platformArrow.position.set((left.a.x + left.b.x + right.a.x + right.b.x) / 4, (left.a.y + left.b.y + right.a.y + right.b.y) / 4, (left.a.z + left.b.z + right.a.z + right.b.z) / 4);
      platformArrow.setDirection(direction.set(face.x, face.y, face.z));
    }
    // Timing cue: the hit button ring shrinks as the judgement approaches.
    // Only when the hit button would receive or dive (R10) and no action runs.
    const action = hitActionNow();
    const receiving = hints && !player.action && (action === 'receive' || action === 'dive');
    const eta = receiving ? judgementEta() : null;
    const now = eta != null && eta <= 0.4 ? pressNowReaches() : false;
    timingActive = eta != null || now;
    const hit = $('[data-hit]');
    hit.classList.toggle('dp-timing', timingActive);
    hit.classList.toggle('dp-timing-now', now);
    hit.style.setProperty('--timing-scale', timingActive ? (1 + Math.min(1, eta / 1.2) * 0.45).toFixed(3) : '1');
    const countdown = $('[data-countdown]');
    countdown.hidden = !pendingFeed;
    if (pendingFeed) countdown.textContent = String(Math.max(1, Math.ceil((pendingFeed.tick - state.tick) / 30)));
    landing.visible = $('[data-assist]').value === 'beginner' && ball.active;
    if (landing.visible) {
      const g = DIRECT_PHYSICS.gravity;
      const time = (ball.vy + Math.sqrt(Math.max(0, ball.vy ** 2 + 2 * g * Math.max(0, ball.y - ball.radius)))) / g;
      landing.position.set(ball.x + ball.vx * time, 0.026, ball.z + ball.vz * time);
    }
    // direct-v8: your receive circle (platform centre) and the ball's touch point.
    const next = hints && ball.active && !state.judge?.done ? nextJudgement(state, { run: 0 }) : null;
    const under = techniquePoint(player, 'underhand');
    reachRing.visible = hints && ball.active && !state.judge?.done;
    reachRing.position.set(under.x, 0.024, under.z);
    reachRing.scale.setScalar(underRadius(state) / 0.5);
    touchRing.visible = !!next;
    if (next) touchRing.position.set(next.ball.x, 0.028, next.ball.z);
    ctx.court.update(dt, ball);
    if (ctx.postFx?.render) ctx.postFx.render(); else ctx.renderer.render(ctx.scene, ctx.camera);
  }
  function frame(now, schedule = true) {
    if (disposed) return;
    const delta = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    if (!paused && !document.hidden) {
      frameTimes.push(delta * 1000); if (frameTimes.length > 3600) frameTimes.shift();
      // Slow motion scales only the picture time fed to the fixed-step loop (R9).
      const scale = slowMotion();
      accumulator += delta * scale;
      let steps = 0;
      // Bound work per render, retaining backlog rather than silently skipping simulation ticks.
      while (accumulator >= DIRECT_DT && steps < 12 && !paused) { accumulator -= DIRECT_DT; step(); steps++; }
      if (scale < 1) slowMotionTicks += steps;
      maxBacklog = Math.max(maxBacklog, accumulator);
      if (accumulator > 1) { setPaused(true); message('裝置來不及模擬，訓練已暫停。未跳過碰撞；請查看效能紀錄。'); }
    }
    draw(paused ? 0 : Math.min(delta, 0.1));
    if (now - lastReport > 300) {
      const m = metrics();
      $('[data-status]').textContent = `${playback ? '回放' : paused ? '暫停' : '訓練'} · 觸球 ${state.stats.contacts} · 餵球 ${state.stats.feeds} · ${m.fps.toFixed(0)} FPS`;
      const action = DIRECT_ACTIONS[state.player.action];
      $('[data-hint]').textContent = action
        ? `${state.player.action === 'spike' ? SHOT_LABELS[state.player.shotType] ?? '扣球' : ACTION_LABELS[state.player.action]} · ${state.player.actionTick < action.windup ? '準備中' : state.player.actionTick < action.windup + action.active ? '出手中' : state.player.action === 'dive' ? '倒地起身中' : '收招中'}`
        : HINT_IDLE;
      $('[data-metrics]').textContent = `frame p95 ${m.frameP95.toFixed(2)} ms\nsim p95 ${m.simP95.toFixed(2)} ms\nbacklog ${m.backlogMs.toFixed(1)} ms / max ${m.maxBacklogMs.toFixed(1)} ms\ndraw calls ${m.drawCalls}\n本裝置短時量測，非整場六對六驗收`;
      lastReport = now;
    }
    if (schedule) raf = requestAnimationFrame(frame);
  }
  const debug = {
    snapshot: () => snapshotDirectGame(state), pose: () => structuredClone(getDirectPose(state)),
    metrics, tape: () => structuredClone(tape()),
    assistState: () => ({ platformVisible: platformArrow.visible, timingActive, timingNow: $('[data-hit]').classList.contains('dp-timing-now'),
      reachVisible: reachRing.visible, touchVisible: touchRing.visible, hitAction: $('[data-hit]').dataset.action, hitLabel: $('[data-hit-label]').textContent,
      slowMotion: slowMotion(), message: $('[data-message]').textContent }), pause: () => setPaused(true), resume: () => setPaused(false),
    command: command => injected.push(structuredClone(command)),
    step(count = 1) {
      // Single-step consumes actual queued input; unlike a user pause, it must not erase it.
      paused = true; accumulator = 0; lastTime = performance.now();
      $('[data-pause]').textContent = '繼續';
      for (let i = 0; i < Math.min(600, Math.max(0, count)); i++) step();
      draw();
    },
    // Drive the real frame loop with a synthetic clock (harness): returns the ticks advanced.
    frames(count, fps = 60) {
      const start = state.tick;
      setPaused(false);
      for (let i = 0; i < count && !paused; i++) frame(lastTime + 1000 / fps, false);
      paused = true; $('[data-pause]').textContent = '繼續';
      return state.tick - start;
    },
    verifyReplay() { return serializeDirectState(replayDirectTape(tape())) === serializeDirectState(playback ? restoreDirectGame(liveState) : state); },
    verifyPlaybackAtRate(fps) {
      if (!playback || ![30, 60, 120].includes(fps)) throw new Error('Start playback and choose 30, 60 or 120 Hz');
      const frames = Math.ceil((playback.endTick - state.tick) * fps / 60) + 2;
      setPaused(false);
      // Exercise the real app accumulator and playback path, not a copied loop.
      for (let i = 0; i < frames && !paused; i++) frame(lastTime + 1000 / fps, false);
      setPaused(true);
      return state.tick === playback.endTick && serializeDirectState(state) === serializeDirectState(liveState);
    },
    restart,
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(raf); controls.dispose(); listeners.forEach(remove => remove());
      view.dispose();
      for (const mesh of [landing, touchRing, reachRing]) { ctx.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      ctx.scene.remove(arrow); arrow.dispose(); ctx.scene.remove(platformArrow); platformArrow.dispose();
      root.remove(); oldHud.hidden = false;
      if (window.__directPractice === debug) delete window.__directPractice;
    },
  };
  window.__directPractice = debug;
  on(window, 'pagehide', () => debug.dispose());
  updateHitLabel();
  draw();
  raf = requestAnimationFrame(frame);
  return debug;
}
