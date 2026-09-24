import * as THREE from 'three';
import { createDirectGame, stepDirectGame, getDirectPose, snapshotDirectGame,
  restoreDirectGame, replayDirectTape, serializeDirectState, DIRECT_DT, SIMULATION_VERSION } from '../sim/directGame.js';
import { createDirectControls } from '../input/directControls.js';
import { createDirectPlayerView } from '../render/directPlayerView.js';
import { DIRECT_PHYSICS, DIRECT_ACTIONS } from '../sim/directConstants.js';
import { platformNormal } from '../sim/directPhysics.js';
import './directPractice.css';

const ACTION_LABELS = { receive: '墊球', spike: '扣球', tip: '吊球', set: '舉球', block: '攔網', dive: '魚躍' };
const SHOT_LABELS = { LINE: '直線重扣', CROSS_LEFT: '左斜線', CROSS_RIGHT: '右斜線', TIP: '單手吊球' };
const PASS_LABELS = { NEUTRAL: '平台正對', HIGH: '高球到位', LOW: '低平安全球', LEFT: '平台偏左', RIGHT: '平台偏右' };
// Pass-direction drill targets near the net (x, z in metres); display only.
const DRILL_TARGETS = [{ x: 0, z: 1.6 }, { x: -2, z: 1.6 }, { x: 2, z: 1.6 }];
const DRILL_RADIUS = 1;
const MAX_TAPE_TICKS = 36000;
const PART_LABELS = { head: '頭部', hand: '手掌', forearm: '前臂', arm: '上臂', torso: '軀幹', leg: '腿部' };

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
          <label>餵球種類<select data-feed-kind><option value="receive">接球練習</option><option value="spike">高球進攻</option><option value="block">網前攔網</option><option value="pass-drill">接球方向練習</option></select></label>
          <label>資訊輔助<select data-assist><option value="beginner">入門 · 預測落點</option><option value="standard">標準 · 只看球影</option><option value="advanced">進階 · 關閉額外提示</option></select></label>
          <label>身高 <output data-height-label>175 cm</output><input data-height type="range" min="150" max="210" value="175" step="1"></label>
          <p>更改身高會開始新一輪訓練。資訊提示不改變碰撞判定；接球的小幅迎球轉身是基本操作。</p>
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
    <div class="dp-coach"><strong data-message>先餵一球，讓球真正碰到你的雙臂。</strong><p data-hint>走到球路上，提早按墊球；角色會迎向來球 · 墊球時左右滑改平台方向 · 扣球時上滑吊球、下滑直線、左右滑斜線</p></div>
    <div class="dp-move" data-move aria-label="移動搖桿"><span>走位 / WASD</span></div>
    <div class="dp-aim" data-aim aria-label="拖曳調整朝向">滑動瞄準</div>
    <div class="dp-actions"><select data-action aria-label="選擇觸球動作">${Object.entries(ACTION_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select><button class="dp-jump" data-jump>起跳<small>SPACE</small></button><button class="dp-hit" data-hit>出手<small>J · 滑動選線</small></button></div>
    <div class="dp-footer" data-status>60 Hz 固定模擬 · 身體接觸才算觸球</div>`;
  document.body.appendChild(root);
  const $ = selector => root.querySelector(selector);
  $('[data-build]').textContent = `${SIMULATION_VERSION} · ${typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__}`;
  const view = createDirectPlayerView(ctx.scene);
  const landing = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.29, 40),
    new THREE.MeshBasicMaterial({ color: 0x9ae5df, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }));
  landing.rotation.x = -Math.PI / 2;
  landing.position.y = 0.025;
  ctx.scene.add(landing);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.8, 0x9ae5df, 0.2, 0.12);
  ctx.scene.add(arrow);
  // Platform facing line: drawn from the shared pose, a prediction and never a guarantee.
  const platformArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.9, 0xffc861, 0.2, 0.12);
  platformArrow.visible = false;
  ctx.scene.add(platformArrow);
  const drillTarget = new THREE.Mesh(new THREE.RingGeometry(DRILL_RADIUS - 0.08, DRILL_RADIUS, 48),
    new THREE.MeshBasicMaterial({ color: 0xffa24c, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  drillTarget.rotation.x = -Math.PI / 2;
  drillTarget.position.y = 0.027;
  drillTarget.visible = false;
  ctx.scene.add(drillTarget);
  // Drill bookkeeping lives in the app layer only; the feed itself is the normal receive feed.
  let drill = null;
  let liveDrill = null;
  let timingActive = false;
  const seed = Number(ctx.params.get('seed')) || 1;
  let state = createDirectGame({ seed });
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
  const injected = [];
  const cameraTarget = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const look = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const listeners = [];
  const on = (target, event, handler) => { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); };
  function bindControls(keyBindings) {
    controls?.dispose();
    activeBindings = keyBindings;
    controls = createDirectControls({
      moveZone: $('[data-move]'), aimZone: $('[data-aim]'), jumpButton: $('[data-jump]'),
      hitButton: $('[data-hit]'), actionSelect: $('[data-action]'), feedButton: $('[data-feed]'), feedSelect: $('[data-feed-kind]'),
      ...(keyBindings ? { keyBindings } : {}),
      onActivity(kind) {
        if (kind === 'feed') message('來球了。移到球路上，提早抬臂；角色會小幅迎球轉身。');
      },
    });
  }
  bindControls();
  function message(text) { $('[data-message]').textContent = text; }
  function tape() { return { simulationVersion: SIMULATION_VERSION, initial, commands: recorded, endTick: playback ? liveState.tick : state.tick }; }
  function restart() {
    bindControls(activeBindings); // A new recording starts a new input tick timeline.
    state = createDirectGame({ seed, height: Number($('[data-height]').value) / 100 });
    initial = snapshotDirectGame(state);
    recorded = [];
    injected.length = 0;
    playback = null;
    liveState = null;
    accumulator = 0;
    lastContactTick = -1000;
    rehearsal = { tick: -1, key: null, value: false };
    drill = null;
    drillTarget.visible = false;
    frameTimes = [];
    simTimes = [];
    maxBacklog = 0;
    $('[data-replay]').textContent = '回放本輪';
    setPaused(false);
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
      drill = liveDrill; liveDrill = null;
      drillTarget.visible = !!drill;
      if (drill) drillTarget.position.set(drill.target.x, 0.027, drill.target.z);
      $('[data-replay]').textContent = '回放本輪'; setPaused(false); message('已返回原訓練狀態。'); return;
    }
    if (state.tick === 0) { message('先試打一球，再回放。'); return; }
    const record = tape();
    const end = replayDirectTape(record);
    if (serializeDirectState(end) !== serializeDirectState(state)) throw new Error('直接操作回放與即時狀態不一致');
    liveState = snapshotDirectGame(state);
    liveDrill = structuredClone(drill);
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
  function step() {
    let commands;
    if (playback) {
      commands = [];
      while (playback.index < playback.commands.length && playback.commands[playback.index].tick === state.tick) commands.push(playback.commands[playback.index++]);
    } else {
      commands = controls.sample(state.tick);
      while (injected.length) commands.push({ ...injected.shift(), tick: state.tick, sequence: 100000 + commands.length });
      if (state.tick >= MAX_TAPE_TICKS) { setPaused(true); message('本輪已達 10 分鐘，請匯出回放後重新開始。'); return; }
      recorded.push(...commands.map(command => structuredClone(command)));
    }
    const before = performance.now();
    stepDirectGame(state, commands);
    simTimes.push(performance.now() - before);
    if (simTimes.length > 3600) simTimes.shift();
    for (const event of state.events) {
      if (event.type === 'feed') {
        drill = event.kind === 'pass-drill' ? { target: DRILL_TARGETS[(state.stats.feeds - 1) % DRILL_TARGETS.length], touched: false, result: null } : null;
        drillTarget.visible = !!drill;
        if (drill) drillTarget.position.set(drill.target.x, 0.027, drill.target.z);
        if (drill && !playback) message('接球方向練習：把球墊向橘色目標區。滑動選平台角度，落點只看物理結果。');
      }
      if (drill && event.type === 'contact') drill.touched = true;
      if (drill && !drill.result && ['ground', 'net', 'out'].includes(event.type)) {
        drill.result = drillResult(event.type);
        if (!playback) { message(drill.result.text); continue; }
      }
      if (event.type === 'contact') {
        lastContactTick = state.tick;
        if (!playback) message(`實際接觸 · ${PART_LABELS[event.part] ?? '身體'} · 試著改變出手時機與方向。`);
      } else if (!playback && ['ground', 'net', 'out'].includes(event.type)) {
        message(event.type === 'net' ? '球碰網了。調整站位、出手時機，再餵一球。' : '這一球結束。回想接觸的位置，再試一次。');
      }
    }
    if (playback && state.tick >= playback.endTick) { setPaused(true); message('回放結束。按「退出回放」返回訓練。'); }
  }
  function drillResult(type) {
    if (!drill.touched) return { type, hit: false, text: '沒有接到球。先走到球路上，再按墊球。' };
    if (type === 'net') return { type, hit: false, text: '球碰網了：早一點按墊球，讓球落在前臂上。' };
    const dx = state.ball.x - drill.target.x, dz = state.ball.z - drill.target.z;
    const distance = Math.hypot(dx, dz);
    if (type === 'ground' && distance <= DRILL_RADIUS) return { type, hit: true, dx, dz, text: `命中目標區！距中心 ${distance.toFixed(1)} m。` };
    const parts = [];
    if (Math.abs(dx) >= 0.1) parts.push(`${dx < 0 ? '偏左' : '偏右'} ${Math.abs(dx).toFixed(1)} m`);
    if (Math.abs(dz) >= 0.1) parts.push(`${dz < 0 ? '偏網前' : '偏短'} ${Math.abs(dz).toFixed(1)} m`);
    return { type, hit: false, dx, dz, text: `${type === 'out' ? '出界' : '落點'}：${parts.join('、') || '接近目標'}（距目標 ${distance.toFixed(1)} m）。` };
  }
  // Seconds until the falling ball reaches platform height (~0.6 body heights),
  // if it is then within reach of the platform (about 0.4 body heights in front,
  // plus the side reach). Display only.
  // Exact cue for "press now": rehearse a receive on a copy of the current state
  // and report whether it would meet the ball with the active platform. Runs once
  // per simulated tick; the live state and inputs are never touched.
  let rehearsal = { tick: -1, key: null, value: false };
  function pressNowReaches() {
    const key = `${state.tick}:${playback ? 'p' : 'l'}`;
    if (rehearsal.key === key) return rehearsal.value;
    const copy = snapshotDirectGame(state);
    const aim = { ...copy.player.aim };
    let value = false;
    // An active platform contact can only happen within windup + active ticks.
    const window = DIRECT_ACTIONS.receive.windup + DIRECT_ACTIONS.receive.active;
    for (let i = 0; i < window && copy.ball.active; i++) {
      stepDirectGame(copy, [{ tick: copy.tick, sequence: 0, move: { x: 0, z: 0 }, aim, action: i === 0 ? 'receive' : null }]);
      const contact = copy.events.find(e => e.type === 'contact');
      if (contact) { value = contact.active && (contact.part === 'forearm' || contact.part === 'hand'); break; }
    }
    rehearsal = { tick: state.tick, key, value };
    return value;
  }
  // Seconds until the falling ball reaches platform height, or null.
  function platformArrival() {
    const { player: p, ball: b } = state;
    if (!b.active) return null;
    const g = DIRECT_PHYSICS.gravity, drop = b.y - (p.y + 0.6 * p.height);
    const disc = b.vy * b.vy + 2 * g * drop;
    if (disc < 0) return null;
    const t = (b.vy + Math.sqrt(disc)) / g;
    return t > 0 && t <= 1.5 ? t : null;
  }
  function receiveEta() {
    const { player: p, ball: b } = state;
    const t = platformArrival();
    if (t == null) return null;
    const fx = p.x + p.aim.x * 0.4 * p.height, fz = p.z + p.aim.z * 0.4 * p.height;
    const miss = Math.hypot(b.x + b.vx * t - fx, b.z + b.vz * t - fz);
    return miss <= (0.1 + DIRECT_PHYSICS.receiveReachLimit) * p.height ? t : null;
  }
  function metrics() {
    const percentile = values => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * 0.95)]; };
    const average = frameTimes.length ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length : 0;
    return { frames: frameTimes.length, fps: average ? 1000 / average : 0, frameP95: percentile(frameTimes), simP95: percentile(simTimes), backlogMs: accumulator * 1000, maxBacklogMs: maxBacklog * 1000, drawCalls: ctx.renderer.info.render.calls };
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
    // Timing cue: the hit button ring shrinks as a receivable ball approaches.
    // Receive cues only when the hit button would actually receive.
    const receiving = hints && !player.action && $('[data-action]').value === 'receive';
    const eta = receiving ? receiveEta() : null;
    // Gate the rehearsal on arrival time only: the distance check in receiveEta is
    // narrower than the real platform reach (side reach), so it must not hide the cue.
    const arrival = receiving ? platformArrival() : null;
    const now = arrival != null && arrival <= 0.4 ? pressNowReaches() : false;
    timingActive = eta != null || now;
    const hit = $('[data-hit]');
    hit.classList.toggle('dp-timing', timingActive);
    hit.classList.toggle('dp-timing-now', now);
    hit.style.setProperty('--timing-scale', timingActive ? (1 + Math.min(1, eta / 1.2) * 0.45).toFixed(3) : '1');
    landing.visible = $('[data-assist]').value === 'beginner' && ball.active;
    if (landing.visible) {
      const g = DIRECT_PHYSICS.gravity;
      const time = (ball.vy + Math.sqrt(Math.max(0, ball.vy ** 2 + 2 * g * Math.max(0, ball.y - ball.radius)))) / g;
      landing.position.set(ball.x + ball.vx * time, 0.026, ball.z + ball.vz * time);
    }
    ctx.court.update(dt, ball);
    if (ctx.postFx?.render) ctx.postFx.render(); else ctx.renderer.render(ctx.scene, ctx.camera);
  }
  function frame(now, schedule = true) {
    if (disposed) return;
    const delta = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    if (!paused && !document.hidden) {
      frameTimes.push(delta * 1000); if (frameTimes.length > 3600) frameTimes.shift();
      accumulator += delta;
      let steps = 0;
      // Bound work per render, retaining backlog rather than silently skipping simulation ticks.
      while (accumulator >= DIRECT_DT && steps < 12 && !paused) { accumulator -= DIRECT_DT; step(); steps++; }
      maxBacklog = Math.max(maxBacklog, accumulator);
      if (accumulator > 1) { setPaused(true); message('裝置來不及模擬，訓練已暫停。未跳過碰撞；請查看效能紀錄。'); }
    }
    draw(paused ? 0 : Math.min(delta, 0.1));
    if (now - lastReport > 300) {
      const m = metrics();
      $('[data-status]').textContent = `${playback ? '回放' : paused ? '暫停' : '訓練'} · 觸球 ${state.stats.contacts} · 餵球 ${state.stats.feeds} · ${m.fps.toFixed(0)} FPS`;
      const action = DIRECT_ACTIONS[state.player.action];
      $('[data-hint]').textContent = action
        ? `${state.player.action === 'spike' ? SHOT_LABELS[state.player.shotType] ?? '扣球' : state.player.action === 'receive' ? `墊球 · ${PASS_LABELS[state.player.passType] ?? PASS_LABELS.NEUTRAL}` : ACTION_LABELS[state.player.action]} · ${state.player.actionTick < action.windup ? '準備中' : state.player.actionTick < action.windup + action.active ? '出手中 · 金色部位可主動觸球' : '收招中'} · 球仍須真正碰到身體`
        : '走到球路上，提早按墊球；角色會迎向來球 · 墊球時左右滑改平台方向 · 扣球時上滑吊球、下滑直線、左右滑斜線';
      $('[data-metrics]').textContent = `frame p95 ${m.frameP95.toFixed(2)} ms\nsim p95 ${m.simP95.toFixed(2)} ms\nbacklog ${m.backlogMs.toFixed(1)} ms / max ${m.maxBacklogMs.toFixed(1)} ms\ndraw calls ${m.drawCalls}\n本裝置短時量測，非整場六對六驗收`;
      lastReport = now;
    }
    if (schedule) raf = requestAnimationFrame(frame);
  }
  const debug = {
    snapshot: () => snapshotDirectGame(state), pose: () => structuredClone(getDirectPose(state)),
    metrics, tape: () => structuredClone(tape()),
    assistState: () => ({ platformVisible: platformArrow.visible, timingActive, timingNow: $('[data-hit]').classList.contains('dp-timing-now'),
      targetVisible: drillTarget.visible, drill: structuredClone(drill), message: $('[data-message]').textContent }), pause: () => setPaused(true), resume: () => setPaused(false),
    command: command => injected.push(structuredClone(command)),
    step(count = 1) {
      // Single-step consumes actual queued input; unlike a user pause, it must not erase it.
      paused = true; accumulator = 0; lastTime = performance.now();
      $('[data-pause]').textContent = '繼續';
      for (let i = 0; i < Math.min(600, Math.max(0, count)); i++) step();
      draw();
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
      view.dispose(); ctx.scene.remove(landing); landing.geometry.dispose(); landing.material.dispose();
      ctx.scene.remove(arrow); arrow.dispose(); ctx.scene.remove(platformArrow); platformArrow.dispose();
      ctx.scene.remove(drillTarget); drillTarget.geometry.dispose(); drillTarget.material.dispose(); root.remove(); oldHud.hidden = false;
      if (window.__directPractice === debug) delete window.__directPractice;
    },
  };
  window.__directPractice = debug;
  on(window, 'pagehide', () => debug.dispose());
  draw();
  raf = requestAnimationFrame(frame);
  return debug;
}
